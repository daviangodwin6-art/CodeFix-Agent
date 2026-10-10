"""Test environment and pytest runs. Deterministic, no LLM. A JS adapter would replace only this file."""
import os
import shutil
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from . import sandbox


class EnvError(Exception):
    """The environment or the test run itself is broken (not a test failure)."""


def _run(cmd, cwd, timeout, extra_env=None):
    try:
        p = sandbox.run_untrusted(cmd, cwd, timeout, extra_env)  # repo code runs here: no secrets in its environment
    except sandbox.TimeoutExpired:
        raise EnvError(f"timed out after {timeout}s: {' '.join(map(str, cmd[:4]))}")
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def venv_python(venv):
    return Path(venv) / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def install_plan(venv, tool):
    """(command that creates the venv, prefix of every install command) for tool "uv" or "pip"."""
    python = str(venv_python(venv))
    if tool == "uv":
        return (["uv", "venv", "-q", "--python", sys.executable, str(venv)],
                ["uv", "pip", "install", "-q", "--python", python])
    return ([sys.executable, "-m", "venv", str(venv)],
            [python, "-m", "pip", "install", "-q", "--disable-pip-version-check"])


def setup_env(repo, venv):
    """Build a venv at `venv` with pytest and the repo's dependencies. Returns (python path, warning).

    Built at its final path: a venv is not relocatable (pyvenv.cfg and the script launchers hold absolute
    paths), so there is no build-elsewhere-then-rename. agent/envmgr.py decides when to call this and
    treats a venv as usable only once it has written the .ready marker afterwards.
    """
    repo, venv = Path(repo), Path(venv)
    create, install = install_plan(venv, "uv" if shutil.which("uv") else "pip")
    venv.parent.mkdir(parents=True, exist_ok=True)
    code, out = _run(create, venv.parent, 300)
    if code:
        raise EnvError(f"could not create venv:\n{out[-2000:]}")
    cmd = install + ["pytest"]
    if (repo / "requirements.txt").exists():
        cmd += ["-r", "requirements.txt"]
    code, out = _run(cmd, repo, 900)
    if code:
        raise EnvError(f"dependency install failed:\n{out[-2000:]}")
    warning = ""
    if (repo / "pyproject.toml").exists() or (repo / "setup.py").exists():
        # Not fatal: many repos carry a pyproject.toml only for tool config.
        code, out = _run(install + ["-e", "."], repo, 900)
        if code:
            warning = "pip install -e . failed; running tests without it"
    return venv_python(venv), warning


def run_tests(python, repo, run_dir, label, target=None, extra_env=None):
    """Run the full suite (or only `target`, a repo-relative test file). Returns ({test_id: passed|failed|error|skipped}, output).

    extra_env: additions to the child environment (PYTHONPATH when the project is not installed in its venv)."""
    xml = Path(run_dir) / f"junit_{label}.xml"
    xml.unlink(missing_ok=True)
    code, out = _run([str(python), "-m", "pytest", "-q", "--color=no", "--rootdir=.", "-p", "no:cacheprovider",
                      "--continue-on-collection-errors", f"--junitxml={xml}", *([target] if target else [])],
                     repo, int(os.getenv("TEST_TIMEOUT", "300")), extra_env)
    if code == 5:  # no tests collected
        return {}, out
    if code not in (0, 1, 2) or not xml.exists():
        raise EnvError(f"pytest could not run (exit {code}):\n{out[-2000:]}")
    results = {}
    for case in ET.parse(xml).getroot().iter("testcase"):
        test_id = f"{case.get('classname')}::{case.get('name')}"
        kinds = {child.tag for child in case}
        results[test_id] = next((k if k != "failure" else "failed" for k in ("error", "failure", "skipped") if k in kinds), "passed")
    return results, out


def compare(before, after):
    """Tests that passed before and do not pass now (a deleted test counts)."""
    # ponytail: single run, no flaky-test rerun; rerun failures once here if flakiness shows up
    return sorted(t for t, s in before.items() if s == "passed" and after.get(t) != "passed")


def counts(results):
    passed = sum(s == "passed" for s in results.values())
    failed = sum(s in ("failed", "error") for s in results.values())
    return {"passed": passed, "failed": failed, "total": len(results)}
