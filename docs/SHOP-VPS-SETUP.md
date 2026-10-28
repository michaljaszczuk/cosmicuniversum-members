# Report shop: VPS setup

This guide sets up the report worker on your Ubuntu VPS. Run each command in the VPS terminal (SSH).
Lines that start with `sudo` need your admin password.

The worker never gets calls from outside. It asks cosmicuniversum.com for paid orders every minute.

## 1. Install the programs

```bash
sudo apt update
sudo apt install -y git python3 python3-venv curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
python3 --version   # must be 3.12 or newer
node --version      # must be 20 or newer
```

## 2. Make a user and get the code

```bash
sudo useradd --system --create-home --home-dir /opt/cosmic --shell /usr/sbin/nologin cosmic
sudo -u cosmic git clone https://github.com/<your-account>/<your-repo>.git /opt/cosmic/repo
sudo -u cosmic git -C /opt/cosmic/repo checkout feat/chart-tools   # or master after the merge
sudo -u cosmic python3 -m venv /opt/cosmic/venv
sudo -u cosmic /opt/cosmic/venv/bin/pip install -r /opt/cosmic/repo/tools/shop/requirements.txt
```

## 3. Put the secrets on the VPS

Never paste a key into chat, email or git. Type it only here.

```bash
sudo install -d -m 700 /etc/cosmic-report
sudo install -m 600 /dev/null /etc/cosmic-report/env
sudo nano /etc/cosmic-report/env
```

Write these lines in the file (one per line, no spaces around `=`), then save with Ctrl+O, Enter, Ctrl+X:

```
ANTHROPIC_API_KEY=...
WORKER_SECRET=...            (the same value as the Cloudflare secret WORKER_SECRET)
SENDER_API_TOKEN=...
OWNER_ALERT_EMAIL=...        (where order alerts go)
SENDER_TPL_READY=...         (Sender.net template ids, see docs/shop/EMAILS.md)
SENDER_TPL_DELAY=...
SENDER_TPL_ALERT=...
SENDER_TPL_FEEDBACK=...
SENDER_WAITLIST_GROUP=...    (Sender.net group id of "no-time waitlist")
FEEDBACK_FORM_URL=...        (optional: leave out to send no feedback emails)
```

Optional lines (defaults shown): `SHOP_BASE_URL=https://cosmicuniversum.com`, `MODEL_WRITER=claude-sonnet-5-5`,
`MODEL_CHECKER=claude-opus-5-5`, `MODEL_HUMANIZER=claude-sonnet-5-5`.

The worker user must read the file:

```bash
sudo chown root:cosmic /etc/cosmic-report/env
sudo chmod 640 /etc/cosmic-report/env
```

## 4. Test by hand

```bash
cd /opt/cosmic/repo
sudo -u cosmic bash -c 'set -a; . /etc/cosmic-report/env; set +a; /opt/cosmic/venv/bin/python -m pytest tools/shop -q'
sudo -u cosmic bash -c 'set -a; . /etc/cosmic-report/env; set +a; /opt/cosmic/venv/bin/python tools/shop/worker.py once'
```

The tests must say `passed`. `once` prints nothing when the queue is empty.

## 5. Turn on the timers

```bash
sudo cp /opt/cosmic/repo/tools/shop/systemd/* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cosmic-report.timer cosmic-report-daily.timer
systemctl list-timers 'cosmic-report*'
```

## 6. Look at what it does

```bash
journalctl -u cosmic-report -n 50          # the last 50 log lines
journalctl -u cosmic-report -f             # follow live (Ctrl+C to stop)
journalctl -u cosmic-report-daily -n 20
```

Each line shows the order id, the step, ok or fail, seconds, tokens and the cost in USD.

## 7. Owner commands

```bash
cd /opt/cosmic/repo
sudo -u cosmic bash -c 'set -a; . /etc/cosmic-report/env; set +a; /opt/cosmic/venv/bin/python tools/shop/worker.py retry <order id>'
sudo -u cosmic bash -c 'set -a; . /etc/cosmic-report/env; set +a; /opt/cosmic/venv/bin/python tools/shop/worker.py resend <customer email>'
```

- `retry`: a FAILED order goes back to the queue. The worker takes it within a minute.
- `resend`: sends the same download link again (orders delivered in the last 30 days).

## 8. Update the code

```bash
sudo -u cosmic git -C /opt/cosmic/repo pull
sudo -u cosmic /opt/cosmic/venv/bin/pip install -r /opt/cosmic/repo/tools/shop/requirements.txt
sudo cp /opt/cosmic/repo/tools/shop/systemd/* /etc/systemd/system/ && sudo systemctl daemon-reload
```
