"""Lets the shop tests import the report tools (validate, build_report, testkit) and each other."""
import sys
from pathlib import Path

HERE = Path(__file__).parent
for p in (HERE, HERE.parent / "report"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))
