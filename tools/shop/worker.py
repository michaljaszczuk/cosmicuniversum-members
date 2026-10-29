"""Report shop worker on the VPS. systemd runs `once` every minute and `daily` once a day.

    python tools/shop/worker.py once | daily | retry <order id> | recheck <order id> | resend <email>

Logs go to stdout (journald): order id, step, status, seconds, tokens, cost. Never a name,
email, birth date, time or town. Settings: tools/shop/config.py, docs/SHOP-VPS-SETUP.md.
"""
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

HERE = Path(__file__).resolve().parent
REPORT = HERE.parent / "report"
for p in (HERE, REPORT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import build_report  # noqa: E402
import config  # noqa: E402
import pipeline  # noqa: E402
from api import Queue, QueueError  # noqa: E402
from sender import Sender, SenderError  # noqa: E402

FACTS_MJS = REPORT / "facts.mjs"
LIBRARY = REPORT / "library.json"
PRICES = json.loads((HERE / "prices.json").read_text(encoding="utf-8"))
LOCK = Path(tempfile.gettempdir()) / "cosmic-report.lock"
TMP_PREFIX = "cosmic-report-"


class Terminated(Exception):
    """systemd stopped the worker (SIGTERM). Raised so the order still ends as FAILED + alert."""

    def __str__(self):
        return "worker was stopped (time limit or shutdown)"


def on_sigterm(signum, frame):
    raise Terminated()


SAFE_ERRORS = (pipeline.PipelineError, QueueError, SenderError, Terminated)


@dataclass
class Deps:
    queue: object
    sender: object
    cfg: config.Config
    run_node: Callable  # run_node([script, *args]) raises on a non-zero exit
    ai: Callable  # ai(facts) -> (content, [pipeline.Usage])
    log: Callable  # log(line)


def cost(usage):
    total = 0.0
    for u in usage:
        if u.model not in PRICES:
            return None
        p_in, p_out = PRICES[u.model]
        total += (u.input_tokens * p_in + u.output_tokens * p_out) / 1e6
    return total


def log_step(d, order_id, step, ok, t0, usage=()):
    c = cost(usage)
    tin = sum(u.input_tokens for u in usage)
    tout = sum(u.output_tokens for u in usage)
    d.log(f"order={order_id} step={step} status={'ok' if ok else 'fail'} secs={time.monotonic() - t0:.1f} "
          f"in={tin} out={tout} cost={'na' if c is None else f'{c:.4f}'}")


def reason_of(step, e):
    """Short failure reason with no customer data: our own error texts, else the error type only."""
    return f"{step}: {e}" if isinstance(e, SAFE_ERRORS) else f"{step}: {type(e).__name__}"


def process(order, d):
    oid = order["id"]
    step = "start"
    t0 = time.monotonic()
    try:
        with tempfile.TemporaryDirectory(prefix=TMP_PREFIX) as tmp:
            tmp = Path(tmp)
            step, t0 = "facts", time.monotonic()
            b = order["birth"]
            inp = {"name": order["name"], "date": b["date"], "time": b["time"], "place": b["place"], "lat": b["lat"],
                   "lon": b["lon"], "tz": b["tz"], "fold": b.get("fold"), "sure": b.get("sure", 0)}
            (tmp / "input.json").write_text(json.dumps(inp, ensure_ascii=False), encoding="utf-8")
            d.run_node([str(FACTS_MJS), str(tmp / "input.json"), str(tmp / "facts.json")])
            facts = json.loads((tmp / "facts.json").read_text(encoding="utf-8"))
            log_step(d, oid, step, True, t0)

            step, t0 = "ai", time.monotonic()
            content, usage = d.ai(facts)
            log_step(d, oid, step, True, t0, usage)

            step, t0 = "pdf", time.monotonic()
            pdf = tmp / "report.pdf"
            build_report.build(facts, content, str(pdf))
            log_step(d, oid, step, True, t0)

            step, t0 = "upload", time.monotonic()
            url = d.queue.upload(oid, pdf.read_bytes())
            log_step(d, oid, step, True, t0)

        step, t0 = "email", time.monotonic()
        d.sender.send(d.cfg.sender_tpl_ready, order["email"], {"name": order["name"], "url": url}, attach_url=url)
        log_step(d, oid, step, True, t0)

        step, t0 = "status", time.monotonic()
        d.queue.status(oid, "delivered")
        log_step(d, oid, step, True, t0)
    except Exception as e:  # every failure ends as FAILED + owner alert, never silent
        log_step(d, oid, step, False, t0, getattr(e, "usage", ()))
        fail(order, reason_of(step, e), d, customer_mail=step not in ("status",))


def owner_alert(d, text):
    """Email the owner. If Sender fails, park the alert in R2 so the next run sends it."""
    try:
        d.sender.send(d.cfg.sender_tpl_alert, d.cfg.owner_alert_email, {"text": text})
    except Exception as e:
        d.log(f"step=alert status=fail err={type(e).__name__}")
        try:
            d.queue.alert(text)
        except Exception as e2:
            d.log(f"step=alert-park status=fail err={type(e2).__name__}")


def delay_mail(d, order):
    """The calm "being finished by hand" email, once per order."""
    if order.get("delayMailSent"):
        return
    try:
        d.sender.send(d.cfg.sender_tpl_delay, order["email"], {"name": order["name"]})
        d.queue.status(order["id"], delayMailSent=True)
    except Exception as e:
        d.log(f"order={order['id']} step=delay-mail status=fail err={type(e).__name__}")


def fail(order, reason, d, customer_mail=True):
    oid = order["id"]
    try:
        d.queue.status(oid, "failed", reason=reason)
    except Exception as e:  # keep going: the alert matters most
        d.log(f"order={oid} step=fail-status status=fail err={type(e).__name__}")
    owner_alert(d, f"Order {oid} needs a look: {reason}")
    if customer_mail:
        delay_mail(d, order)


def acquire_lock(path):
    """Open and lock `path` without waiting. Returns a handle, or None if another run holds it."""
    f = open(path, "a+")
    try:
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        return None
    return f


def release_lock(f):
    if os.name == "nt":
        import msvcrt
        f.seek(0)
        msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
    f.close()


def clean_old_temp(max_age=3600):
    now = time.time()
    for p in Path(tempfile.gettempdir()).glob(TMP_PREFIX + "*"):
        if p.is_dir() and now - p.stat().st_mtime > max_age:
            import shutil
            shutil.rmtree(p, ignore_errors=True)


def forward_inbox(d):
    """Send parked alerts and waitlist sign-ups on. Only what really went out is acked (deleted),
    so nothing is lost while Sender.net is down; it is tried again next minute."""
    box = d.queue.inbox()
    done, failed = [], 0
    for a in box.get("alerts", []):
        try:
            d.sender.send(d.cfg.sender_tpl_alert, d.cfg.owner_alert_email, {"text": a["text"]})
            done.append(a["key"])
        except Exception:
            failed += 1
    polar = 0
    for w in box.get("waitlist", []):
        try:
            if w.get("list") == "polar":  # town past 66 degrees: you may contact them later
                d.sender.add_to_group(w["email"], d.cfg.sender_polar_group, fields={"town": w.get("town", "")})
                polar += 1
            else:
                d.sender.add_to_group(w["email"], d.cfg.sender_waitlist_group)
            done.append(w["key"])
        except Exception:
            failed += 1
    if failed:
        d.log(f"step=inbox status=fail count={failed}")
    if done:
        d.queue.ack(done)
    if polar:
        owner_alert(d, f"{polar} new far-north sign-up(s): people who could not order because their town is past "
                       "66 degrees. See the far-north waitlist group in Sender.net.")


def once(d, lock_path=LOCK):
    handle = acquire_lock(lock_path)
    if handle is None:
        return "locked"
    try:
        clean_old_temp()
        try:
            forward_inbox(d)
        except Exception as e:  # a broken inbox must not stop paid orders
            d.log(f"step=inbox status=fail err={type(e).__name__}")
        work = d.queue.next()
        if work:
            for o in work.get("failedNow", []):  # failed on Cloudflare (lease expired 3 times)
                delay_mail(d, o)
            if work.get("order"):
                process(work["order"], d)
        return "done"
    finally:
        release_lock(handle)


def daily(d):
    counts = d.queue.cleanup()
    d.log("step=cleanup status=ok " + " ".join(f"{k}={v}" for k, v in counts.items()))
    if not d.cfg.feedback_form_url:
        return
    for o in d.queue.feedback_due():
        try:
            d.sender.send(d.cfg.sender_tpl_feedback, o["email"], {"name": o["name"], "form": d.cfg.feedback_form_url})
            d.queue.status(o["id"], feedbackSent=True)
            d.log(f"order={o['id']} step=feedback status=ok")
        except Exception as e:
            d.log(f"order={o['id']} step=feedback status=fail err={type(e).__name__}")


def resend(d, email):
    found = d.queue.delivered(email)
    for o in found:
        d.sender.send(d.cfg.sender_tpl_ready, email, {"name": o["name"], "url": o["url"]}, attach_url=o["url"])
        d.log(f"order={o['id']} step=resend status=ok")
    return len(found)


def real_deps():
    import requests
    cfg = config.load()
    http = requests.Session()
    client = pipeline.AnthropicClient(cfg.anthropic_api_key)
    library = json.loads(LIBRARY.read_text(encoding="utf-8"))
    models = {"writer": cfg.model_writer, "checker": cfg.model_checker, "humanizer": cfg.model_humanizer}

    def run_node(args):
        r = subprocess.run(["node", *args], capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            # facts.mjs stderr can hold input values: keep only our own known message
            known = "local time is ambiguous" if "ambiguous" in r.stderr else "local time is missing" \
                if "missing" in r.stderr else f"node exit {r.returncode}"
            raise pipeline.PipelineError(f"facts.mjs: {known}")

    return Deps(queue=Queue(cfg.shop_base_url, cfg.worker_secret, http), sender=Sender(cfg.sender_api_token, http),
                cfg=cfg, run_node=run_node, ai=lambda facts: pipeline.run_ai(facts, library, client, models),
                log=lambda line: print(line, flush=True))


def main(argv):
    commands = ("once", "daily", "retry", "recheck", "resend")
    if not argv or argv[0] not in commands or (argv[0] in commands[2:] and len(argv) < 2):
        print(__doc__)
        return 2
    d = real_deps()
    cmd = argv[0]
    if cmd == "once":
        signal.signal(signal.SIGTERM, on_sigterm)
        once(d)
    elif cmd == "daily":
        daily(d)
    elif cmd == "retry":
        d.queue.retry(argv[1])
        print(f"order {argv[1]} is back in the queue")
    elif cmd == "recheck":
        d.queue.recheck(argv[1])
        print(f"order {argv[1]} is paid and in the queue")
    else:
        n = resend(d, argv[1])
        print("sent again" if n else "no delivered order in the last 30 days")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
