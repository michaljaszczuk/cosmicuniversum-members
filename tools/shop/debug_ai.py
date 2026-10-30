"""Run the AI steps on the made-up DEMO chart (no customer data) and keep every round's text in a file.

    python tools/shop/debug_ai.py <out.txt>

Needs ANTHROPIC_API_KEY (and optional MODEL_WRITER, MODEL_CHECKER). Costs about the same as one order.
The out file holds the writer text, the validator errors and every checker reply, so you can see WHY the
checker says FAIL. It prints only the cost summary.
"""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPORT = HERE.parent / "report"
for p in (HERE, REPORT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import pipeline  # noqa: E402
import testkit  # noqa: E402
import worker  # noqa: E402


def main(argv):
    if len(argv) != 1:
        print(__doc__)
        return 2
    out = Path(argv[0])
    out.write_text("", encoding="utf-8")
    models = {"writer": os.environ.get("MODEL_WRITER", "claude-sonnet-5-5"),
              "checker": os.environ.get("MODEL_CHECKER", "claude-sonnet-5-5")}
    library = json.loads(worker.LIBRARY.read_text(encoding="utf-8"))
    client = pipeline.AnthropicClient(os.environ["ANTHROPIC_API_KEY"])

    def trace(title, text):
        with out.open("a", encoding="utf-8") as f:
            f.write(f"===== {title} =====\n{text}\n\n")

    usage = []
    try:
        _, usage = pipeline.run_ai(testkit.demo_facts(), library, client, models, trace=trace)
        result = "CLEAN"
    except pipeline.PipelineError as e:
        usage, result = e.usage, str(e)
    c = worker.cost(usage)
    print(f"{result}\ncalls={len(usage)} in={sum(u.input_tokens for u in usage)} "
          f"cache_write={sum(u.cache_write for u in usage)} cache_read={sum(u.cache_read for u in usage)} "
          f"out={sum(u.output_tokens for u in usage)} cost={'na' if c is None else f'{c:.2f}'}\nText: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
