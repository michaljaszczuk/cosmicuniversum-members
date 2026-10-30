"""worker.py with fakes for every outside service. Demo data only.

    py -m pytest tools/shop/test_worker.py -q
"""
import json
import shutil
import tempfile
from pathlib import Path

import config
import pipeline
import testkit
import worker

ORDER = {"id": "abcdefghij0123456789", "status": "working", "email": "alex@example.com", "name": "Alex",
         "birth": {"date": "1990-03-14", "time": "08:30", "fold": None, "place": "Kraków, Lesser Poland, PL",
                   "lat": 50.0647, "lon": 19.945, "tz": "Europe/Warsaw", "timeSource": "record", "sure": 15,
                   "riskAccepted": False}}
CFG = config.load({**{k: f"v-{k.lower()}" for k in config.REQUIRED}, "OWNER_ALERT_EMAIL": "owner@example.com"})


class FakeQueue:
    def __init__(self, orders=(), inbox=None, due=()):
        self.orders = list(orders)
        self.calls = []
        self._inbox = inbox or {"alerts": [], "waitlist": []}
        self.due = list(due)

    def next(self):
        self.calls.append(("next",))
        failed, self.failed_now = getattr(self, "failed_now", []), []
        order = self.orders.pop(0) if self.orders else None
        return {"order": order, "failedNow": failed} if order or failed else None

    def ack(self, keys):
        self.calls.append(("ack", sorted(keys)))

    def alert(self, text):
        self.calls.append(("alert", text))

    def recheck(self, order_id):
        self.calls.append(("recheck", order_id))

    def upload(self, order_id, pdf):
        assert pdf.startswith(b"%PDF")
        self.calls.append(("upload", order_id))
        return "https://shop.test/r/" + "t" * 32

    def status(self, order_id, status=None, reason=None, **flags):
        self.calls.append(("status", order_id, status, reason, flags))

    def inbox(self):
        self.calls.append(("inbox",))
        return self._inbox

    def cleanup(self):
        self.calls.append(("cleanup",))
        return {"pending": 1, "delivered": 0, "tokens": 0}

    def feedback_due(self):
        return self.due

    def delivered(self, email):
        return [{"id": ORDER["id"], "name": "Alex", "url": "https://shop.test/r/x"}] if email == "alex@example.com" else []


class FakeSender:
    def __init__(self, down=False):
        self.sent = []
        self.groups = []
        self.down = down

    def send(self, template_id, to, variables, attach_url=None):
        if self.down:
            raise worker.SenderError("template", 503)
        self.sent.append((template_id, to, variables, attach_url))

    def add_to_group(self, email, group_id):
        if self.down:
            raise worker.SenderError("add subscriber", 503)
        self.groups.append((email, group_id))


def fake_node(args):
    shutil.copy(testkit.DEMO_FACTS, args[-1])
    assert json.loads(Path(args[-2]).read_text(encoding="utf-8"))["sure"] == 15


def good_ai(facts):
    return testkit.minimal_content(facts), [pipeline.Usage("claude-sonnet-5-5", 1000, 500)]


def bad_ai(facts):
    raise pipeline.PipelineError("writer: not clean after 3 rounds (2 problems left)")


def deps(queue, ai=good_ai, lines=None):
    lines = [] if lines is None else lines
    return worker.Deps(queue=queue, sender=FakeSender(), cfg=CFG, run_node=fake_node, ai=ai, log=lines.append), lines


def test_happy_path_delivers_and_cleans_up(monkeypatch):
    made = []
    real = tempfile.TemporaryDirectory
    monkeypatch.setattr(worker.tempfile, "TemporaryDirectory", lambda **kw: made.append(real(**kw)) or made[-1])
    q = FakeQueue()
    d, lines = deps(q)
    worker.process(dict(ORDER), d)
    assert ("upload", ORDER["id"]) in q.calls
    assert q.calls[-1] == ("status", ORDER["id"], "delivered", None, {})
    tpl, to, variables, attach = d.sender.sent[0]
    assert (tpl, to, attach) == (CFG.sender_tpl_ready, "alex@example.com", "https://shop.test/r/" + "t" * 32)
    assert variables["url"] == attach
    assert made and not Path(made[0].name).exists()
    assert any("step=ai" in ln and "cost=0.0070" in ln for ln in lines), lines


def test_failure_marks_failed_alerts_owner_and_tells_customer_once():
    q = FakeQueue()
    d, _ = deps(q, ai=bad_ai)
    worker.process(dict(ORDER), d)
    status = [c for c in q.calls if c[0] == "status"]
    assert status[0][2] == "failed"
    assert "3 rounds" in status[0][3]
    assert [s[0] for s in d.sender.sent] == [CFG.sender_tpl_alert, CFG.sender_tpl_delay]
    assert d.sender.sent[0][1] == "owner@example.com"
    assert ORDER["id"] in d.sender.sent[0][2]["text"]
    assert status[1][4] == {"delayMailSent": True}
    d2, _ = deps(FakeQueue(), ai=bad_ai)
    worker.process({**ORDER, "delayMailSent": True}, d2)
    assert [s[0] for s in d2.sender.sent] == [CFG.sender_tpl_alert]


def test_logs_hold_no_customer_data():
    lines = []
    for ai in (good_ai, bad_ai):
        d, _ = deps(FakeQueue(), ai=ai, lines=lines)
        worker.process(dict(ORDER), d)
    text = "\n".join(lines)
    assert lines
    for s in ("Alex", "@", "Kraków", "1990", "08:30", "50.06"):
        assert s not in text, s


def test_once_with_lock_held_does_nothing(tmp_path):
    lock = tmp_path / "w.lock"
    held = worker.acquire_lock(lock)
    assert held is not None
    q = FakeQueue([dict(ORDER)])
    d, _ = deps(q)
    assert worker.once(d, lock_path=lock) == "locked"
    assert q.calls == []
    worker.release_lock(held)
    assert worker.once(d, lock_path=lock) == "done"
    assert ("next",) in q.calls


def test_once_forwards_alerts_and_waitlist(tmp_path):
    q = FakeQueue(inbox={"alerts": [{"key": "alerts/1-a.json", "text": "Order x needs a look", "at": "t"}],
                         "waitlist": [{"key": "waitlist/1-w.json", "email": "w@example.com"}]})
    d, _ = deps(q)
    worker.once(d, lock_path=tmp_path / "l")
    assert d.sender.sent[0][:2] == (CFG.sender_tpl_alert, "owner@example.com")
    assert d.sender.groups == [("w@example.com", CFG.sender_waitlist_group)]
    assert ("ack", ["alerts/1-a.json", "waitlist/1-w.json"]) in q.calls


def test_inbox_items_stay_when_sender_is_down(tmp_path):
    q = FakeQueue(inbox={"alerts": [{"key": "alerts/1-a.json", "text": "x", "at": "t"}],
                         "waitlist": [{"key": "waitlist/1-w.json", "email": "w@example.com"}]})
    d, _ = deps(q)
    d.sender = FakeSender(down=True)
    worker.once(d, lock_path=tmp_path / "l")
    assert not [c for c in q.calls if c[0] == "ack" and c[1]]


def test_failure_alert_is_parked_when_sender_is_down():
    q = FakeQueue()
    d, _ = deps(q, ai=bad_ai)
    d.sender = FakeSender(down=True)
    worker.process(dict(ORDER), d)
    parked = [c for c in q.calls if c[0] == "alert"]
    assert len(parked) == 1
    assert ORDER["id"] in parked[0][1] and "@" not in parked[0][1]


def test_orders_failed_by_lease_get_the_customer_mail(tmp_path):
    q = FakeQueue()
    q.failed_now = [{"id": ORDER["id"], "email": "alex@example.com", "name": "Alex"}]
    d, _ = deps(q)
    worker.once(d, lock_path=tmp_path / "l")
    assert d.sender.sent == [(CFG.sender_tpl_delay, "alex@example.com", {"name": "Alex"}, None)]
    assert ("status", ORDER["id"], None, None, {"delayMailSent": True}) in q.calls


def test_sigterm_ends_as_failed_with_alert():
    def killed(facts):
        worker.on_sigterm(15, None)

    q = FakeQueue()
    d, _ = deps(q, ai=killed)
    worker.process(dict(ORDER), d)
    status = [c for c in q.calls if c[0] == "status"]
    assert status[0][2] == "failed"
    assert "stopped" in status[0][3]
    assert d.sender.sent[0][0] == CFG.sender_tpl_alert


def test_daily_without_feedback_url_sends_nothing():
    q = FakeQueue(due=[{"id": ORDER["id"], "email": "alex@example.com", "name": "Alex"}])
    d, _ = deps(q)
    worker.daily(d)
    assert ("cleanup",) in q.calls
    assert d.sender.sent == []


def test_daily_sends_feedback_and_marks_it():
    q = FakeQueue(due=[{"id": ORDER["id"], "email": "alex@example.com", "name": "Alex"}])
    d, _ = deps(q)
    d.cfg = config.load({**{k: "v" for k in config.REQUIRED}, "FEEDBACK_FORM_URL": "https://forms.test/x"})
    worker.daily(d)
    assert d.sender.sent[0][2]["form"] == "https://forms.test/x"
    assert ("status", ORDER["id"], None, None, {"feedbackSent": True}) in q.calls


def test_resend():
    d, _ = deps(FakeQueue())
    assert worker.resend(d, "alex@example.com") == 1
    assert d.sender.sent[0][3] == "https://shop.test/r/x"
    assert worker.resend(d, "nobody@example.com") == 0


def test_far_north_signups_go_to_their_group_and_the_owner_gets_a_count(tmp_path):
    q = FakeQueue(inbox={"alerts": [], "waitlist": [
        {"key": "waitlist/1-w.json", "email": "w@example.com", "list": "notime", "town": ""},
        {"key": "waitlist/2-p.json", "email": "p@example.com", "list": "polar", "town": "Rovaniemi, Lapland, FI"},
        {"key": "waitlist/3-q.json", "email": "q@example.com", "list": "polar", "town": "Tromsø, Troms, NO"}]})
    d, _ = deps(q)
    d.sender.fields = []
    real_add = d.sender.add_to_group

    def add(email, group, fields=None):
        d.sender.fields.append(fields)
        real_add(email, group)
    d.sender.add_to_group = add
    worker.once(d, lock_path=tmp_path / "l")
    assert d.sender.groups == [("w@example.com", CFG.sender_waitlist_group), ("p@example.com", CFG.sender_polar_group),
                               ("q@example.com", CFG.sender_polar_group)]
    assert d.sender.fields == [None, {"town": "Rovaniemi, Lapland, FI"}, {"town": "Tromsø, Troms, NO"}]
    alerts = [s for s in d.sender.sent if s[0] == CFG.sender_tpl_alert]
    assert len(alerts) == 1
    assert "2 new far-north" in alerts[0][2]["text"]
    assert "@" not in alerts[0][2]["text"]
    assert ("ack", ["waitlist/1-w.json", "waitlist/2-p.json", "waitlist/3-q.json"]) in q.calls


def test_cost_counts_cache_writes_and_reads():
    u = pipeline.Usage("claude-sonnet-5-5", 1000, 1000, "", cache_write=10000, cache_read=100000)
    # input $2/M: (1000 + 12500 + 10000) tokens; output $10/M: 1000 tokens
    assert abs(worker.cost([u]) - (23500 * 2 + 1000 * 10) / 1e6) < 1e-9


def test_debug_trace_is_a_private_file_and_old_ones_are_deleted(tmp_path):
    import os
    import time
    assert worker.debug_trace("", "o1") is None
    trace = worker.debug_trace(str(tmp_path / "dbg"), "o1")
    trace("round 1: checker reply", "a | 1 | FAIL | x | y")
    f = tmp_path / "dbg" / "o1.txt"
    assert "round 1: checker reply" in f.read_text(encoding="utf-8")
    if os.name != "nt":
        assert f.stat().st_mode & 0o777 == 0o600
    old = time.time() - 8 * 86400
    os.utime(f, (old, old))
    worker.clean_debug(str(tmp_path / "dbg"))
    assert not f.exists()
