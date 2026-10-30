"""Queue client, Sender client and config, with fake HTTP sessions.

    py -m pytest tools/shop/test_api.py -q
"""
import pytest

import api
import config
import sender


class FakeResponse:
    def __init__(self, status=200, data=None, content=b""):
        self.status_code = status
        self._data = data
        self.content = content

    def json(self):
        return self._data


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def request(self, method, url, **kw):
        self.calls.append({"method": method, "url": url, **kw})
        return self.responses.pop(0)


def queue(responses):
    s = FakeSession(responses)
    return api.Queue("https://shop.test", "secret-1", s), s


def test_queue_sends_bearer_and_returns_order():
    q, s = queue([FakeResponse(200, {"order": {"id": "x"}, "failedNow": [{"id": "y"}]})])
    assert q.next() == {"order": {"id": "x"}, "failedNow": [{"id": "y"}]}
    assert s.calls[0]["method"] == "POST"
    assert s.calls[0]["url"] == "https://shop.test/api/report/next"
    assert s.calls[0]["headers"]["Authorization"] == "Bearer secret-1"


def test_queue_next_empty():
    q, _ = queue([FakeResponse(204)])
    assert q.next() is None


def test_queue_error_names_endpoint_and_code():
    q, _ = queue([FakeResponse(500)])
    with pytest.raises(api.QueueError) as e:
        q.next()
    assert e.value.status_code == 500
    assert "next" in str(e.value)


def test_upload_returns_url():
    q, s = queue([FakeResponse(200, {"url": "https://shop.test/r/abc"})])
    assert q.upload("order1", b"%PDF") == "https://shop.test/r/abc"
    assert s.calls[0]["method"] == "PUT"
    assert s.calls[0]["data"] == b"%PDF"
    assert s.calls[0]["url"].endswith("/api/report/file/order1")


def test_status_sends_flags():
    q, s = queue([FakeResponse(200, {"ok": True})])
    q.status("order1", "failed", reason="writer", delayMailSent=True)
    assert s.calls[0]["json"] == {"status": "failed", "reason": "writer", "delayMailSent": True}


def test_delivered_passes_email_as_param():
    q, s = queue([FakeResponse(200, [])])
    assert q.delivered("a@b.co") == []
    assert s.calls[0]["params"] == {"email": "a@b.co"}


def test_sender_send_shape():
    s = FakeSession([FakeResponse(200, {"success": True})])
    sender.Sender("tok", s).send("tpl9", "alex@example.com", {"name": "Alex"}, attach_url="https://shop.test/r/abc")
    c = s.calls[0]
    assert c["method"] == "POST"
    assert c["url"] == "https://api.sender.net/v2/message/tpl9/send"
    assert c["headers"]["Authorization"] == "Bearer tok"
    assert c["json"]["to"] == {"email": "alex@example.com"}
    assert c["json"]["variables"] == {"name": "Alex"}
    assert c["json"]["attachments"] == {"birth-chart-report.pdf": "https://shop.test/r/abc"}


def test_sender_add_to_group():
    s = FakeSession([FakeResponse(200, {})])
    sender.Sender("tok", s).add_to_group("w@example.com", "g1")
    assert s.calls[0]["url"] == "https://api.sender.net/v2/subscribers"
    assert s.calls[0]["json"] == {"email": "w@example.com", "groups": ["g1"], "trigger_automation": False}


def test_sender_error_has_no_email():
    s = FakeSession([FakeResponse(422, {})])
    with pytest.raises(sender.SenderError) as e:
        sender.Sender("tok", s).send("tpl9", "alex@example.com", {})
    assert e.value.status_code == 422
    assert "@" not in str(e.value)


def full_env(**over):
    env = {k: "x" for k in config.REQUIRED}
    env.update(over)
    return env


def test_config_missing_names_the_variable_not_the_value():
    with pytest.raises(ValueError) as e:
        config.load({})
    assert "ANTHROPIC_API_KEY" in str(e.value)
    env = full_env(WORKER_SECRET="")
    with pytest.raises(ValueError) as e:
        config.load(env)
    assert "WORKER_SECRET" in str(e.value)


def test_config_defaults():
    cfg = config.load(full_env())
    assert cfg.model_writer == "claude-sonnet-5-5"
    assert cfg.model_checker == "claude-sonnet-5-5"
    assert cfg.shop_base_url == "https://cosmicuniversum.com"
    assert cfg.feedback_form_url == ""


def test_config_repr_hides_secrets():
    cfg = config.load(full_env(ANTHROPIC_API_KEY="sk-secret-1", WORKER_SECRET="ws-secret-2", SENDER_API_TOKEN="st-secret-3"))
    for s in ("sk-secret-1", "ws-secret-2", "st-secret-3"):
        assert s not in repr(cfg)


def test_ack_alert_recheck():
    q, s = queue([FakeResponse(200, {"deleted": 1}), FakeResponse(200, {"ok": True}), FakeResponse(200, {"ok": True})])
    q.ack(["alerts/1-a.json"])
    q.alert("Order x needs a look")
    q.recheck("order1")
    assert [c["url"].rsplit("/api/report/", 1)[1] for c in s.calls] == ["inbox-ack", "alert", "recheck/order1"]
    assert s.calls[0]["json"] == {"keys": ["alerts/1-a.json"]}
    assert s.calls[1]["json"] == {"text": "Order x needs a look"}


def test_sender_add_to_group_with_town_field():
    s = FakeSession([FakeResponse(200, {})])
    sender.Sender("tok", s).add_to_group("p@example.com", "g2", fields={"town": "Rovaniemi, Lapland, FI"})
    assert s.calls[0]["json"] == {"email": "p@example.com", "groups": ["g2"], "trigger_automation": False,
                                  "fields": {"{$town}": "Rovaniemi, Lapland, FI"}}


def test_config_needs_polar_group():
    assert "SENDER_POLAR_GROUP" in config.REQUIRED
    assert config.load(full_env()).sender_polar_group == "x"
