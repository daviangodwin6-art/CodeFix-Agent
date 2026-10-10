"""The fixed pipeline. Step order, the retry cap and the revert rule live here, in plain code.

shared:   access -> prepare -> environment -> baseline -> map -> [syntax] -> localize (LLM)
syntax:   only when files do not parse: repair them first (LLM edit, proof in code), see _syntax_stage
debug:   [edit (LLM) -> apply+check -> reproduce (new test must fail on the original code) -> verify]
feature:  [implement (LLM, may add new source files) -> apply+check -> verify]
          x MAX_ATTEMPTS, then report/publish. verify is the same code for both modes.
"""
import os
import re
import uuid
from pathlib import Path

from . import edits, llm, prompts, report, runner
from . import repo as repo_mod

RUNS_DIR = Path(__file__).parent.parent / "runs"
FILE_CAP = 100000  # characters of one file shown to the LLM
LOG_CAP = 3000    # characters of test output fed back to the LLM
CONTEXT = 15      # lines shown on each side of a syntax error
ZERO = {"passed": 0, "failed": 0, "total": 0}
# Everything that differs between the two task types. The steps around it are shared.
MODES = {"debug": {"label": "edit", "new_files": False, "reproduce": True},
         "feature": {"label": "implement", "new_files": True, "reproduce": False}}
OPTIONS = [{"id": "fork", "label": "Fork to my GitHub account, push the branch there, give me a pull request link"},
           {"id": "local", "label": "Don't write to GitHub: only save the result to a local folder"}]


def _shown(text):
    """File text for the LLM; a cut file ends with a marker so the model never edits the cut line."""
    if len(text) <= FILE_CAP:
        return text
    return text[:FILE_CAP].rsplit("\n", 1)[0] + "\n[... file truncated: the rest is not shown; do not edit near this point ...]"


def _crash_in_source(out, test_path):
    """Did a collection crash happen inside the repo's own code (not the test file, not a library)?"""
    frames = re.findall(r"^(\S+\.py):\d+: in ", out, re.M)
    return any(Path(p).name != Path(test_path).name and not re.search(r"site-packages|_pytest|importlib|<frozen", p) for p in frames)


def run(repo_src, task, on_step=None, run_id=None, runs_dir=None, ask=None, choice=None, task_type="debug"):
    """Run the whole pipeline. Returns the state dict (same shape as GET /api/run/{id}).

    ask(options) -> "fork" | "local" is called only when the repo is on GitHub without write access;
    without it (tests) the answer is "local".
    choice ("origin" | "fork" | "own") is the caller's decision made up front (the web page's mode picker);
    when given, the access check and the question are skipped.
    task_type is "debug" (fix a bug, proving it first) or "feature" (add something new); see MODES.
    """
    run_id = run_id or uuid.uuid4().hex[:8]
    run_dir = Path(runs_dir or RUNS_DIR) / run_id
    state = {"id": run_id, "status": "running", "approval": None, "steps": [], "result": {
        "explanation": "", "files_changed": [], "diff": "", "branch": "", "attempts": 0,
        "baseline": dict(ZERO), "after": dict(ZERO), "regressions": [], "new_tests": [],
        "import_check": [], "note": "", "error": "", "report_path": str(run_dir / "report.md"),
        "output_path": "", "pr_url": "", "pr": None, "pr_opened_url": "",
        "task_type": task_type, "reproduced": False, "syntax": None}}
    notify = lambda: on_step and on_step(state)

    def step(name):
        state["steps"].append({"name": name, "status": "running", "detail": ""})
        notify()

    def done(detail="", status="ok"):
        state["steps"][-1].update(status=status, detail=detail)
        notify()

    def ask_user(question):
        state["status"], state["approval"] = "awaiting_approval", {"question": question, "options": OPTIONS}
        notify()
        choice = ask(OPTIONS) if ask else "local"
        state["status"], state["approval"] = "running", None
        notify()
        return choice if choice in ("fork", "local") else "local"

    try:
        run_dir.mkdir(parents=True)
        state["status"] = _run(str(repo_src), task, run_id, run_dir, state["result"], step, done, ask_user, choice, task_type)
    except runner.EnvError as e:
        state["status"], state["result"]["error"] = "env_failed", str(e)
    except Exception as e:  # LLM errors, git errors, bugs: always end in a reported state
        state["status"], state["result"]["error"] = "failed", f"{type(e).__name__}: {e}"
    if state["steps"] and state["steps"][-1]["status"] == "running":
        done(state["result"]["error"][:300], "error")
    if run_dir.is_dir():
        report.write(state, task, repo_src)
    notify()
    return state


PRESET = {"origin": "your repo: branch agent-changes is pushed to it",
          "fork": "someone else's repo: fork to your account and commit there",
          "own": "local folder: branch is created in your repo"}


def _syntax_view(repo, error):
    """What the LLM sees of one broken file: the error, the lines around it and, if it fits, the whole file."""
    text = (Path(repo) / error["path"]).read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    lo, hi = max(error["line"] - 1 - CONTEXT, 0), min(error["line"] + CONTEXT, len(lines))
    view = (f"SYNTAX ERROR line {error['line']}, column {error['col']}: {error['msg']}\n"
            f"--- lines {lo + 1}-{hi} of {len(lines)} ---\n" + "\n".join(lines[lo:hi]))
    if (lo or hi < len(lines)) and len(text) <= FILE_CAP:  # Python names only the first error; the rest may be elsewhere
        view += "\n--- the whole file ---\n" + text
    return view


def _syntax_stage(repo, python, run_dir, task, task_type, errors, before, result, step, done):
    """Make the files that do not parse parse again, before the task itself is looked at.

    No localize call (the broken files are the answer) and no fail-first rule (a file that does not parse
    needs no test to show it is broken). The proof, in code: every flagged file parses, no test module
    still fails to import because of one, nothing that passed at baseline broke, an optional new test passes.
    The repair is committed, so it is the "original" for the rest of the run (reproduce goes back to it).
    Returns (status, baseline, test output): "success"/"failed" end the run, None continues with the normal flow.
    """
    info = result["syntax"] = {"files": [dict(e, after="does not parse") for e in errors],
                               "attempts": 0, "only_syntax": False, "explanation": ""}
    paths = [e["path"] for e in errors]
    files = {e["path"]: _syntax_view(repo, e) for e in errors}
    step("syntax")
    feedback = ""
    for attempt in range(1, int(os.getenv("MAX_ATTEMPTS", "5")) + 1):
        info["attempts"] = result["attempts"] = attempt
        label = f"syntax{attempt}"
        try:
            proposal = llm.complete_json(prompts.syntax(task, files, feedback))
            originals = edits.apply(repo, proposal, require_test=False)
            result["import_check"] = edits.check(repo, originals, python, run_dir)
            still = [f"{e['path']} line {e['line']}: {e['msg']}" for e in repo_mod.syntax_errors(repo) if e["path"] in paths]
            if still:
                raise edits.EditError(f"these files still do not parse: {still}")
            after, out = runner.run_tests(python, repo, run_dir, label)
        except (edits.EditError, ValueError, runner.EnvError) as e:
            feedback = f"Rejected: {e}"
            repo_mod.revert(repo)
            continue
        # ponytail: "because of a flagged file" = its path appears in pytest's error text; that also
        # catches an import the repair removed, which is a reason to reject as well.
        uncollected = [c["file"] for c in runner.collection_errors(run_dir, label)
                       if any("/" + p in c["message"].replace("\\", "/") for p in paths)]
        # Not "tests missing from the baseline": every test of a module that could not be imported is new too.
        module = str((proposal.get("new_test") or {}).get("path", ""))[:-3].replace("\\", "/").replace("/", ".")
        new_tests = sorted(t for t in after if module and (t == "::" + module or t.startswith((module + "::", module + "."))))
        result["regressions"] = runner.compare(before, after)
        if uncollected:
            feedback = f"Test modules still cannot be imported because of the files you repaired: {uncollected}"
        elif result["regressions"]:
            feedback = f"Your edit broke tests that passed before: {result['regressions']}"
        elif module and not new_tests:
            feedback = "Your new test file added no collected tests."
        elif any(after[t] != "passed" for t in new_tests):
            feedback = f"Your new test does not pass: {[t for t in new_tests if after[t] != 'passed']}"
        else:
            repo_mod.commit(repo, "codefix: syntax repair")
            for f in info["files"]:
                f["after"] = "parses"
            info["explanation"] = result["explanation"] = str(proposal.get("explanation", ""))
            result["after"], result["new_tests"] = runner.counts(after), new_tests
            # Stop here only when nothing points at more work; in doubt the normal flow runs.
            info["only_syntax"] = (task_type == "debug" and not result["after"]["failed"]
                                   and proposal.get("remaining_task") is False)
            done(f"{len(paths)} file(s) repaired in {attempt} attempt(s): {', '.join(paths)}"[:300])
            # This run was on the repaired tree, so it is the baseline from here on.
            return ("success" if info["only_syntax"] else None), after, out
        feedback += f"\n\nTest output (end):\n{out[-LOG_CAP:]}"
        repo_mod.revert(repo)

    result["error"] = (f"Syntax repair failed: {paths} still not repaired after {info['attempts']} attempts; "
                       f"working copy reverted. Last problem:\n{feedback}")
    done(feedback[:300], "error")
    return "failed", before, ""


def _publish(repo_src, repo, task, run_dir, choice, start, result, step, done):
    """Commit, record the diff of the whole run and put it on `agent-changes`. Always ends in success."""
    step("report")
    if repo_mod.git(["status", "--porcelain"], cwd=repo).strip():  # nothing is left when the run was only a syntax repair
        repo_mod.commit(repo, f"agent: {task[:60]}")
    # Against the commit the run started from: a syntax repair is a commit of its own and belongs in the diff.
    result["diff"] = repo_mod.git(["diff", start, "HEAD"], cwd=repo)
    result["files_changed"] = repo_mod.git(["diff", "--name-only", start, "HEAD"], cwd=repo).split()
    try:
        pub = repo_mod.publish(repo_src, repo, result["files_changed"], task, run_dir, choice, result)
        result["note"] = (result["note"] + "\n" + pub["note"]).strip()
        result["pr_url"], result["output_path"], result["pr"] = pub["pr_url"], pub["output_path"], pub["pr"]
    except Exception as e:  # the verified change is already committed; don't fail the run over this
        result["note"] = (result["note"] + f"\nCould not create branch `agent-changes`: {e}").strip()
    done(result["report_path"])
    return "success"


def _run(repo_src, task, run_id, run_dir, result, step, done, ask_user, choice=None, task_type="debug"):
    mode = MODES[task_type]
    step("access")
    kind = None if choice in PRESET else repo_mod.access(repo_src)
    if kind is None:
        done(PRESET[choice])
    elif kind == "missing":
        raise RuntimeError("Repository not found on GitHub (or it is private and not yours).")
    elif kind == "none":
        slug = "/".join(repo_mod.github_slug(repo_src) or ()) or repo_src
        choice = ask_user(f"You do not have write access to {slug}, so a branch cannot be created there. What now?")
        done({"fork": "fork to your account and push there", "local": "local folder only"}[choice])
    else:
        choice = {"own": "own", "nogh": "local"}.get(kind, "origin")
        done({"own": "local folder: branch is created in your repo", "write": "write access: branch is pushed to origin",
              "nogh": "could not check GitHub access (gh missing, not logged in, or offline): local folder only", "other": "non-GitHub URL: will try to push"}[kind])

    step("prepare")
    repo, result["branch"] = repo_mod.prepare(repo_src, run_dir, run_id)
    done(f"working copy on branch {result['branch']}")

    step("environment")
    python, warning = runner.setup_env(repo, run_dir)
    done(warning or "venv ready")

    step("baseline")
    before, out = runner.run_tests(python, repo, run_dir, "baseline")
    result["baseline"] = runner.counts(before)
    if not before:
        result["note"] = "No tests found at baseline; the new test is the only evidence."
    done("{passed} passed, {failed} failed, {total} total".format(**result["baseline"]))

    step("map")
    repo_map = repo_mod.repo_map(repo)
    if not repo_map:
        raise RuntimeError("no Python files found in the repository")
    done(f"{len(repo_map.splitlines())} Python files")

    budget = int(os.getenv("MAX_ATTEMPTS", "5"))
    start = repo_mod.git(["rev-parse", "HEAD"], cwd=repo).strip()  # the run's diff is taken against this
    # Test files are locked, so a broken one is not ours to repair: it stays a failure in the baseline.
    unparsed = [e for e in repo_mod.syntax_errors(repo) if not edits.is_test_file(e["path"])]
    if unparsed:
        ended, before, out = _syntax_stage(repo, python, run_dir, task, task_type, unparsed, before, result, step, done)
        if ended == "success":
            return _publish(repo_src, repo, task, run_dir, choice, start, result, step, done)
        if not ended and result["attempts"] >= budget:
            ended, result["error"] = "failed", (f"The syntax repair used all {budget} attempts, so none was left for the "
                                                "task itself. The repair is committed in the working copy; the task is not done.")
        if ended:
            return ended
        repo_map = repo_mod.repo_map(repo)
    failing = sorted(t for t, s in before.items() if s in ("failed", "error"))

    step("localize")
    failures = "\n".join(failing) + ("\n" + out[-LOG_CAP:] if failing else "")
    paths = []
    for _ in range(2):  # one retry if the model names nothing usable
        try:
            answer = llm.complete_json(prompts.localize(task, repo_map, failures, task_type)).get("files", [])
        except ValueError:
            continue
        # Only paths that really exist inside the working copy survive.
        paths = [p for p in answer if isinstance(p, str) and (repo / p).is_file()
                 and (repo / p).resolve().is_relative_to(repo.resolve())][:5]
        if paths:
            break
    if not paths:
        raise RuntimeError("localize step returned no files that exist in the repository")
    files = {p: _shown((repo / p).read_text(encoding="utf-8", errors="replace")) for p in paths}
    done(", ".join(paths))

    broken = [l for l in repo_map.splitlines() if "SYNTAX ERROR" in l]
    hint = "\n\nFiles that do not parse right now (fix these too):\n" + "\n".join(broken)
    edit_task = task + (hint if broken else "")
    feedback = ""
    for attempt in range(result["attempts"] + 1, budget + 1):  # attempts of the syntax stage count too
        result["attempts"] = attempt
        step(f"{mode['label']} #{attempt}")
        try:
            proposal = llm.complete_json(prompts.edit(edit_task, files, feedback, task_type))
            originals = edits.apply(repo, proposal, allow_new_files=mode["new_files"])
            result["import_check"] = edits.check(repo, originals, python, run_dir)
        except (edits.EditError, ValueError) as e:
            feedback = f"Rejected before running tests: {e}"
            repo_mod.revert(repo)
            done(feedback[:300], "error")
            continue
        done(f"{len(originals)} files written, imports verified")

        if mode["reproduce"]:
            # The new test must fail on the untouched code, or it proves nothing about the bug.
            step(f"reproduce #{attempt}")
            new_test = proposal["new_test"]["path"]
            repo_mod.stash(repo, [p for p, old in originals.items() if old is not None])
            try:
                pre, out = runner.run_tests(python, repo, run_dir, f"reproduce{attempt}", target=new_test)
            except runner.EnvError as e:
                pre, out = None, str(e)
            finally:
                repo_mod.unstash(repo)
            # A collection error (import crash, syntax error) has an empty class name in the junit file ("::name").
            # It fails for the wrong reason, so it does not prove the bug.
            pre = pre or {}
            crashed = any(s == "error" and t.startswith("::") for t, s in pre.items())
            # A crash inside the repo's own code on import is a real symptom; one in the test file itself is not.
            result["reproduced"] = (any(s == "failed" or (s == "error" and not t.startswith("::")) for t, s in pre.items())
                                    or (crashed and _crash_in_source(out, new_test)))
            if not result["reproduced"]:
                why = ("could not be collected because of a mistake in the test file itself (bad import, name or syntax), "
                       "so it proves nothing about the bug" if crashed else
                       "passes (or collects nothing) on the ORIGINAL, unfixed code, so it does not reproduce the bug")
                feedback = f"Your new test {why}. Write a test that fails before the fix, for the right reason.\n\nTest output (end):\n{out[-LOG_CAP:]}"
                repo_mod.revert(repo)
                done("new test does not fail on the original code", "error")
                continue
            done("new test fails on the original code, as it should")

        step(f"verify #{attempt}")
        try:
            after, out = runner.run_tests(python, repo, run_dir, f"attempt{attempt}")
        except runner.EnvError as e:
            feedback = f"The test run broke after your edit: {e}"
            repo_mod.revert(repo)
            done(feedback[:300], "error")
            continue
        result["after"] = runner.counts(after)
        result["regressions"] = runner.compare(before, after)
        result["new_tests"] = sorted(t for t in after if t not in before)
        new_failing = [t for t in result["new_tests"] if after[t] != "passed"]
        if result["regressions"]:
            feedback = f"Your edit broke tests that passed before: {result['regressions']}"
        elif new_failing:
            feedback = f"Your new test does not pass: {new_failing}"
        elif not result["new_tests"]:
            feedback = "Your new test file added no collected tests."
        else:
            done("{passed} passed, {failed} failed, 0 regressions".format(**result["after"]))
            result["explanation"] = str(proposal.get("explanation", ""))
            return _publish(repo_src, repo, task, run_dir, choice, start, result, step, done)
        feedback += f"\n\nTest output (end):\n{out[-LOG_CAP:]}"
        repo_mod.revert(repo)
        done(feedback[:300], "error")

    result["error"] = f"No acceptable change after {result['attempts']} attempts; working copy reverted. Last problem:\n{feedback}"
    return "failed"
