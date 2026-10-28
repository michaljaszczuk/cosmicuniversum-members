"""Client for the shop's queue API on Cloudflare (functions/api/report/*).

The VPS only calls out; nothing calls the VPS.
"""


class QueueError(Exception):
    def __init__(self, endpoint, status_code):
        super().__init__(f"queue {endpoint}: HTTP {status_code}")
        self.endpoint = endpoint
        self.status_code = status_code


class Queue:
    def __init__(self, base_url, secret, http, timeout=60):
        self.base = base_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {secret}"}
        self.http = http
        self.timeout = timeout

    def _call(self, method, path, name, **kw):
        r = self.http.request(method, f"{self.base}/api/report/{path}", headers=self.headers, timeout=self.timeout, **kw)
        if r.status_code == 204:
            return None
        if not 200 <= r.status_code < 300:
            raise QueueError(name, r.status_code)
        return r.json()

    def next(self):
        """{"order": order or None, "failedNow": [...]} or None when there is nothing to do."""
        data = self._call("POST", "next", "next")
        return {"order": data.get("order"), "failedNow": data.get("failedNow", [])} if data else None

    def upload(self, order_id, pdf):
        return self._call("PUT", f"file/{order_id}", "file", data=pdf)["url"]

    def status(self, order_id, status=None, reason=None, **flags):
        body = {**({"status": status} if status else {}), **({"reason": reason} if reason else {}), **flags}
        self._call("POST", f"status/{order_id}", "status", json=body)

    def retry(self, order_id):
        self._call("POST", f"retry/{order_id}", "retry")

    def delivered(self, email):
        return self._call("GET", "delivered", "delivered", params={"email": email})

    def feedback_due(self):
        return self._call("GET", "feedback-due", "feedback-due")

    def inbox(self):
        return self._call("POST", "inbox", "inbox")

    def ack(self, keys):
        self._call("POST", "inbox-ack", "inbox-ack", json={"keys": list(keys)})

    def alert(self, text):
        self._call("POST", "alert", "alert", json={"text": text})

    def recheck(self, order_id):
        self._call("POST", f"recheck/{order_id}", "recheck")

    def cleanup(self):
        return self._call("POST", "cleanup", "cleanup")
