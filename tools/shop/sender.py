"""Sender.net client: transactional emails from saved templates, and the waitlist group.

API: https://api.sender.net/transactional-campaigns/send-campaign/ and
https://api.sender.net/subscribers/add-subscriber/ (Bearer token; attachments are
{file name: public HTTPS URL}, Sender fetches them).
"""

SEND_URL = "https://api.sender.net/v2/message/{id}/send"
SUBSCRIBERS_URL = "https://api.sender.net/v2/subscribers"
ATTACHMENT_NAME = "birth-chart-report.pdf"


class SenderError(Exception):
    """Never holds an email address."""

    def __init__(self, what, status_code):
        super().__init__(f"sender {what}: HTTP {status_code}")
        self.status_code = status_code


class Sender:
    def __init__(self, token, http, timeout=60):
        self.headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        self.http = http
        self.timeout = timeout

    def _post(self, what, url, body):
        r = self.http.request("POST", url, headers=self.headers, json=body, timeout=self.timeout)
        if not 200 <= r.status_code < 300:
            raise SenderError(what, r.status_code)

    def send(self, template_id, to, variables, attach_url=None):
        body = {"to": {"email": to}, "variables": variables}
        if attach_url:
            body["attachments"] = {ATTACHMENT_NAME: attach_url}
        self._post(f"template {template_id}", SEND_URL.format(id=template_id), body)

    def add_to_group(self, email, group_id):
        self._post("add subscriber", SUBSCRIBERS_URL, {"email": email, "groups": [group_id], "trigger_automation": False})
