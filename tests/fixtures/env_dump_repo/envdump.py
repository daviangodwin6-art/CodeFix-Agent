"""Stands in for hostile repo code: records everything it can see so the agent's tests can inspect it."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).parent


def dump(name):
    # The agent's test writes the target folder (outside the repo) into dump_path.txt before the run.
    out = Path((ROOT / "dump_path.txt").read_text(encoding="utf-8").strip())
    seen = {"env": dict(os.environ), "git_config": (ROOT / ".git" / "config").read_text(encoding="utf-8")}
    (out / f"{name}.json").write_text(json.dumps(seen), encoding="utf-8")
