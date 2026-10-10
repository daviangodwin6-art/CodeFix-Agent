"""Syntax-error fast path: detection, collection errors, and the pipeline stage. Offline, fake LLM."""
import json
import subprocess
import sys
from pathlib import Path

import pytest

from agent import edits, pipeline, projects, runner
from agent import repo as repo_mod

FIXTURES = Path(__file__).parent / "fixtures"
BROKEN = FIXTURES / "syntax_repo"  # calc.py: add() has no colon (does not parse), sub() adds (logic bug)
ONLY = json.loads((FIXTURES / "fake_llm_syntax_only.json").read_text(encoding="utf-8"))
# "Repairs" calc.py but also breaks words.shout, which a test that passed at baseline covers.
BAD = dict(ONLY["syntax"], edits=ONLY["syntax"]["edits"] + [
    {"path": "words.py", "search": "text.upper()", "replace": "text.lower()"}])


@pytest.fixture
def fake(monkeypatch, tmp_path):
    """use(script) points the fake LLM at a script: a fixture file name or a dict."""
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("MAX_ATTEMPTS", "2")
    monkeypatch.setenv("AGENT_OUTPUT_DIR", str(tmp_path / "agent_output"))

    def use(script):
        path = FIXTURES / str(script)
        if isinstance(script, dict):
            path = tmp_path / "script.json"
            path.write_text(json.dumps(script), encoding="utf-8")
        monkeypatch.setenv("FAKE_LLM_FILE", str(path))
    return use


def names(state):
    return [s["name"] for s in state["steps"]]


def where(state):
    """(the run's folder, the project's working copy)"""
    pid = state["project_id"]
    return projects.project_dir(pid) / "runs" / state["id"], projects.workspace(pid)


def git(repo, *args):
    return subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, timeout=60).stdout


def test_syntax_errors_are_found_without_running_code():
    assert repo_mod.syntax_errors(BROKEN) == [{"path": "calc.py", "line": 1, "col": 14, "msg": "expected ':'"}]
    assert "calc.py: SYNTAX ERROR line 1: expected ':'" in repo_mod.repo_map(BROKEN).splitlines()  # the map keeps it


def test_collection_errors_have_file_and_message(tmp_path):
    results, _ = runner.run_tests(sys.executable, BROKEN, tmp_path, "x")
    assert results == {"::tests.test_calc": "error", "tests.test_words::test_shout": "passed"}  # shape unchanged
    (error,) = runner.collection_errors(tmp_path, "x")
    assert error["file"] == "tests/test_calc.py"
    assert "SyntaxError" in error["message"] and "calc.py" in error["message"]
    assert runner.collection_errors(tmp_path, "no_such_run") == []


def test_edit_to_one_file_is_not_rejected_for_a_syntax_error_in_another(tmp_path):
    (tmp_path / "good.py").write_text("def one():\n    return 2\n")
    (tmp_path / "bad.py").write_text("def helper(:\n    pass\n")
    proposal = {"edits": [{"path": "good.py", "search": "return 2", "replace": "return 1"}],
                "new_test": {"path": "test_one.py", "content":
                             "from bad import helper\nfrom good import one\n\n\ndef test_one():\n    assert one() == 1\n"}}
    originals = edits.apply(tmp_path, proposal)
    # bad.py still does not parse, and the new test even imports from it: neither is this edit's fault.
    assert edits.check(tmp_path, originals, sys.executable, tmp_path) == ["bad.helper (repo)", "good.one (repo)"]


def test_new_test_is_optional_only_when_asked(tmp_path):
    (tmp_path / "good.py").write_text("x = 2\n")
    proposal = {"edits": [{"path": "good.py", "search": "2", "replace": "1"}]}
    with pytest.raises(edits.EditError, match="new_test"):
        edits.apply(tmp_path, proposal)
    assert list(edits.apply(tmp_path, proposal, require_test=False)) == ["good.py"]


def test_syntax_only_run(tmp_path, fake):
    """One file does not parse and that is the whole task: repaired without a localize call, reported as its own stage."""
    fake("fake_llm_syntax_only.json")  # has no "localize" entry: asking for one would fail the run
    state = pipeline.run(BROKEN, "calc.py does not parse", run_id="syn")
    r, (run_dir, repo) = state["result"], where(state)
    assert state["status"] == "success", r["error"]
    assert names(state)[-3:] == ["map", "syntax", "commit to project"]
    assert r["syntax"]["attempts"] == r["attempts"] == 1 and r["syntax"]["only_syntax"] is True
    assert [(f["path"], f["line"], f["after"]) for f in r["syntax"]["files"]] == [("calc.py", 1, "parses")]
    assert r["baseline"] == {"passed": 1, "failed": 1, "total": 2} and r["after"] == {"passed": 2, "failed": 0, "total": 2}
    assert r["files_changed"] == ["calc.py"] and "+def add(a, b):" in r["diff"] and r["regressions"] == []
    # the collection error named the broken file before, and is gone after
    assert [e["file"] for e in runner.collection_errors(run_dir, "baseline")] == ["tests/test_calc.py"]
    assert runner.collection_errors(run_dir, "syntax1") == []
    report = (run_dir / "report.md").read_text(encoding="utf-8")
    assert "## Syntax stage" in report and "| `calc.py` | line 1: expected ':' | parses |" in report
    assert r["reproduced"] is False and "n/a (syntax repair only" in report  # not applicable, and it says so
    assert git(repo, "status", "--porcelain") == ""
    assert git(repo, "rev-list", "--count", f"{r['head_before']}..HEAD").strip() == "1"  # one commit for the run
    assert "def add(a, b)\n" in (BROKEN / "calc.py").read_text()  # the fixture itself is untouched


def test_syntax_error_and_logic_bug(tmp_path, fake):
    """The repair comes first; the bug then goes through fail-first reproduction on the repaired code."""
    fake("fake_llm_syntax_and_bug.json")
    state = pipeline.run(BROKEN, "calc.py does not parse, and sub() adds instead of subtracting",
                         run_id="both")
    r, (run_dir, repo) = state["result"], where(state)
    assert state["status"] == "success", r["error"]
    assert names(state)[-7:] == ["map", "syntax", "localize", "edit #2", "reproduce #2", "verify #2", "commit to project"]
    assert r["attempts"] == 2 and r["syntax"]["attempts"] == 1 and r["syntax"]["only_syntax"] is False
    # Reproduced on the REPAIRED code: the new test was collected and failed. On the broken file it
    # could only have been a collection error.
    assert r["reproduced"] is True and runner.collection_errors(run_dir, "reproduce2") == []
    assert r["after"] == {"passed": 3, "failed": 0, "total": 3} and r["new_tests"] == ["tests.test_sub::test_sub"]
    # the reported change covers the whole run, not only the last commit
    assert r["files_changed"] == ["calc.py", "tests/test_sub.py"]
    assert "+def add(a, b):" in r["diff"] and "+    return a - b" in r["diff"]
    # the syntax commit is absorbed: the run leaves exactly one commit on the project branch
    assert git(repo, "rev-list", "--count", f"{r['head_before']}..HEAD").strip() == "1"
    report = (run_dir / "report.md").read_text(encoding="utf-8")
    assert "## Syntax stage" in report and "new test failed on the original code):** yes" in report


def test_syntax_fix_that_breaks_a_passing_test_is_retried(tmp_path, fake):
    fake({"syntax": [BAD, ONLY["syntax"]]})
    state = pipeline.run(BROKEN, "calc.py does not parse", run_id="retry")
    r = state["result"]
    assert state["status"] == "success", r["error"]
    assert r["syntax"]["attempts"] == r["attempts"] == 2 and r["regressions"] == []
    assert r["files_changed"] == ["calc.py"]  # nothing of the rejected attempt survived
    assert "text.upper()" in (where(state)[1] / "words.py").read_text()


def test_syntax_stage_gives_up_and_reverts(tmp_path, fake):
    fake({"syntax": BAD})
    state = pipeline.run(BROKEN, "calc.py does not parse", run_id="gone")
    r, repo = state["result"], where(state)[1]
    assert state["status"] == "failed" and names(state)[-1] == "syntax" and state["steps"][-1]["status"] == "error"
    assert r["attempts"] == 2 and r["regressions"] == ["tests.test_words::test_shout"]
    assert "Syntax repair failed" in r["error"] and "broke tests that passed before" in r["error"]
    assert r["syntax"]["files"][0]["after"] == "does not parse" and r["diff"] == ""
    assert git(repo, "status", "--porcelain") == "" and git(repo, "rev-parse", "HEAD").strip() == r["head_before"]
    assert (repo / "calc.py").read_bytes() == (BROKEN / "calc.py").read_bytes()


def test_failed_task_after_a_good_repair_keeps_nothing(tmp_path, fake):
    """The repair is committed mid-run; when the task itself then fails, the project head must not move."""
    script = json.loads((FIXTURES / "fake_llm_syntax_and_bug.json").read_text(encoding="utf-8"))
    script["edit"]["edits"] = [{"path": "calc.py", "search": "no such text", "replace": "x"}]
    fake(script)
    state = pipeline.run(BROKEN, "calc.py does not parse, and sub() adds instead of subtracting", run_id="half")
    r, repo = state["result"], where(state)[1]
    assert state["status"] == "failed" and r["syntax"]["files"][0]["after"] == "parses"  # the stage itself succeeded
    assert git(repo, "rev-parse", "HEAD").strip() == r["head_before"] and git(repo, "status", "--porcelain") == ""
    assert (repo / "calc.py").read_bytes() == (BROKEN / "calc.py").read_bytes()
