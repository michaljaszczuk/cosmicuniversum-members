"""Worker settings from the environment (on the VPS: /etc/cosmic-report/env via systemd).

Secrets never appear in repr() or in error messages.
"""
import os
from dataclasses import dataclass, field

REQUIRED = ["ANTHROPIC_API_KEY", "WORKER_SECRET", "SENDER_API_TOKEN", "OWNER_ALERT_EMAIL",
            "SENDER_TPL_READY", "SENDER_TPL_DELAY", "SENDER_TPL_ALERT", "SENDER_TPL_FEEDBACK", "SENDER_WAITLIST_GROUP"]


@dataclass(frozen=True)
class Config:
    anthropic_api_key: str = field(repr=False)
    worker_secret: str = field(repr=False)
    sender_api_token: str = field(repr=False)
    owner_alert_email: str = field(repr=False)
    sender_tpl_ready: str
    sender_tpl_delay: str
    sender_tpl_alert: str
    sender_tpl_feedback: str
    sender_waitlist_group: str
    shop_base_url: str = "https://cosmicuniversum.com"
    model_writer: str = "claude-sonnet-5-5"
    model_checker: str = "claude-opus-5-5"
    model_humanizer: str = "claude-sonnet-5-5"
    feedback_form_url: str = ""


def load(env=None):
    env = os.environ if env is None else env
    missing = [k for k in REQUIRED if not env.get(k)]
    if missing:
        raise ValueError(f"missing setting(s): {', '.join(missing)} (see docs/SHOP-VPS-SETUP.md)")
    optional = {k: env[k.upper()] for k in ("shop_base_url", "model_writer", "model_checker", "model_humanizer",
                                            "feedback_form_url") if env.get(k.upper())}
    return Config(**{k.lower(): env[k] for k in REQUIRED}, **optional)
