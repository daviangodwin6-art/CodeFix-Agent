"""The fixed pipeline. Step order, the retry cap and the revert rule live here, in plain code.

shared:   access -> prepare -> environment -> baseline -> map -> [syntax] -> localize (LLM)
syntax:   only when files do not parse: repair them first (LLM edit, proof in code), see _syntax_stage
debug:   [edit (LLM) -> apply+check -> reproduce (new test must fail on the original code) -> verify]
feature:  [implement (LLM, may add new source files) -> apply+check -> verify]
          x MAX_ATTEMPTS, then commit to project. verify is the same code for both modes.

A run works in its project's persistent workspace (agent/projects.py) and continues from the project head.
Success leaves exactly one new commit on the project branch; anything else puts the head and the files
back exactly as they were. Nothing is pushed here: push and pull request are separate project actions.
"""
import os
import re
import time
import uuid
from pathlib import Path

from . import edits, envmgr, llm, projects, prompts, report, runner
from . import repo as repo_mod

FILE_CAP = 100000  # characters of one file shown to the LLM
LOG_CAP = 3000    # characters of test output fed back to the LLM
CONTEXT = 15      # lines shown on each side of a syntax error
ZERO = {"passed": 0, "failed": 0, "total": 0}
# Everything that differs between the two task types. The steps around it are shared.
MODES = {"debug": {"label": "edit", "new_files": False, "reproduce": True},
         "feature": {"label": "implement", "new_files": True, "reproduce": False}}


def _shown(text):
    """File text for the LLM; a cut file ends with a marker so the model never edits the cut line."""
    if len(text) <= FILE_CAP:
        return text
    return text[:FILE_CAP].rsplit("\n", 1)[0] + "\n[... file truncated: the rest is not shown; do not edit near this point ...]"


def _crash_in_source(out, test_path):
    """Did a collection crash happen inside the repo's own code (not the test file, not a library)?"""
    frames = re.findall(r"^(\S+\.py):\d+: in ", out, re.M)
    return any(Path(p).name != Path(test_path).name and not re.search(r"site-packages|_pytest|importlib|<frozen", p) for p in frames)


def run(repo_src, task, on_step=None, run_id=None, task_type="debug", kind=None, scope="local-anon", locked=False):
    """Run the whole pipeline on the project for (scope, repo_src). Returns the state dict (same shape as GET /api/run/{id}).

    task_type is "debug" (fix a bug, proving it first) or "feature" (add something new); see MODES.
    kind ("mine" | "others" | "local") is the caller's answer to "whose repo is this" (the web page's mode
    picker); when given, the access check is skipped.
    scope is the user the project belongs to: a GitHub login, or "local-anon".
    locked: the caller already holds the project (the server takes it before answering, so a second request
    gets its 409 at once) and releases it itself. Otherwise this raises projects.Busy if the project is in use.
    """
    repo_src = str(repo_src)
    project = projects.ensure(scope, repo_src, kind)
    if locked:
        return _tracked(project, repo_src, task, on_step, run_id, task_type, kind)
    with projects.hold(project["project_id"]):
        return _tracked(project, repo_src, task, on_step, run_id, task_type, kind)


def _tracked(project, repo_src, task, on_step, run_id, task_type, kind):
    """One run with its bookkeeping: state, step timings, history, and the head put back unless it succeeded."""
    pid = project["project_id"]
    run_id = run_id or uuid.uuid4().hex[:8]
    run_dir = projects.project_dir(pid) / "runs" / run_id
    workspace = projects.workspace(pid)
    began = time.monotonic()
    state = {"id": run_id, "project_id": pid, "status": "running", "started_at": projects.now(), "finished_at": None,
             "duration_s": None, "steps": [], "result": {
        "explanation": "", "files_changed": [], "diff": "", "branch": project["branch"], "attempts": 0,
        "baseline": dict(ZERO), "after": dict(ZERO), "regressions": [], "new_tests": [],
        "import_check": [], "note": "", "error": "", "report_path": str(run_dir / "report.md"),
        "output_path": "", "pr_url": "", "pr": None, "pr_opened_url": "",
        "task_type": task_type, "reproduced": False, "syntax": None,
        "head_before": None, "commit_sha": None, "env_status": None, "env_reason": None}}
    result, clock = state["result"], [began]
    projects.start_run(state, task)  # a duplicate run id stops here, before anything is touched

    def notify():
        projects.save_run(state)  # history survives a restart
        on_step and on_step(state)

    def step(name):
        clock[0] = time.monotonic()
        state["steps"].append({"name": name, "status": "running", "detail": "", "duration_s": None})
        notify()

    def done(detail="", status="ok"):
        state["steps"][-1].update(status=status, detail=detail, duration_s=round(time.monotonic() - clock[0], 2))
        notify()

    try:
        run_dir.mkdir(parents=True)
        status = _run(repo_src, task, run_id, run_dir, workspace, result, step, done, pid, kind, task_type)
    except runner.EnvError as e:
        status, result["error"] = "env_failed", str(e)
    except Exception as e:  # LLM errors, git errors, bugs: always end in a reported state
        status, result["error"] = "failed", f"{type(e).__name__}: {e}"
    if state["steps"] and state["steps"][-1]["status"] == "running":
        done(result["error"][:300], "error")
    if status != "success" and result["head_before"]:
        # Whatever the run left behind (edits, a syntax-stage commit) goes: the project head is unchanged.
        try:
            projects.rollback(workspace, result["head_before"])
        except Exception as e:
            result["error"] += f"\nCould not put the workspace back: {e}"
    state.update(status=status, finished_at=projects.now(), duration_s=round(time.monotonic() - began, 2))
    if run_dir.is_dir():
        project = projects.get(pid)
        report.write(state, task, project["source"], project)  # `source`, not repo_src: it never carries credentials
    notify()
    return state


PRESET = {"mine": "your repo: changes are committed to the project branch, pushed only when you open a pull request",
          "others": "someone else's repo: publishing will fork it to your account",
          "local": "local folder: a snapshot is used, the folder itself is never modified"}
FOUND = {"own": ("local", PRESET["local"]), "write": ("mine", "write access: " + PRESET["mine"]),
         "none": ("others", "no write access: " + PRESET["others"]),
         "nogh": ("others", "could not check GitHub access (gh missing, not logged in, or offline): treated as someone else's repo"),
         "other": ("mine", "non-GitHub URL: publishing will try to push to it")}


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


def _syntax_stage(repo, python, run_dir, task, task_type, errors, before, result, step, done, extra_env=None):
    """Make the files that do not parse parse again, before the task itself is looked at.

    No localize call (the broken files are the answer) and no fail-first rule (a file that does not parse
    needs no test to show it is broken). The proof, in code: every flagged file parses, no test module
    still fails to import because of one, nothing that passed at baseline broke, an optional new test passes.
    The repair is committed, so it is the "original" for the rest of the run (reproduce goes back to it);
    the run's one commit absorbs it at the end, and a failed run drops it with everything else.
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
            after, out = runner.run_tests(python, repo, run_dir, label, extra_env=extra_env)
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


def _commit_to_project(repo, pid, task, task_type, run_id, result, step, done, explanation):
    """The one success exit: everything since head_before becomes ONE commit on the project branch."""
    step("commit to project")
    result["explanation"] = explanation
    first_line = (task.strip().splitlines() or [""])[0][:200]
    result["commit_sha"], result["diff"], result["files_changed"] = projects.commit_run(
        repo, result["head_before"], f"codefix: {task_type}: {first_line} [run {run_id}]")
    projects.refresh(pid)
    done(f"{result['commit_sha'][:7]} on {result['branch']}")
    return "success"


def _run(repo_src, task, run_id, run_dir, workspace, result, step, done, pid, kind=None, task_type="debug"):
    """The steps, in order. `workspace` is the working copy they act on (a parameter: per-run worktrees later)."""
    mode = MODES[task_type]
    repo = Path(workspace)
    step("access")
    if kind:
        done(PRESET[kind])
    else:
        found = repo_mod.access(repo_src)
        if found == "missing":
            raise RuntimeError("Repository not found on GitHub (or it is private and not yours).")
        kind, detail = FOUND[found]
        projects.set_kind(pid, kind)
        done(detail)

    step("prepare")
    detail = projects.open_workspace(pid)
    result["head_before"] = projects.head(repo)
    done(detail)

    step("environment")
    env = envmgr.ensure(pid, repo)
    python, extra_env = env["python"], env["extra_env"]
    result["env_status"], result["env_reason"] = env["status"], env["reason"]
    if env["warning"]:
        result["note"] = env["warning"]
    done("env reused" if env["status"] == "reused" else f"env rebuilt ({env['reason']})")

    step("baseline")
    before, out = runner.run_tests(python, repo, run_dir, "baseline", extra_env=extra_env)
    result["baseline"] = runner.counts(before)
    if not before:
        result["note"] = (result["note"] + "\nNo tests found at baseline; the new test is the only evidence.").strip()
    done("{passed} passed, {failed} failed, {total} total".format(**result["baseline"]))

    step("map")
    repo_map = repo_mod.repo_map(repo)
    if not repo_map:
        raise RuntimeError("no Python files found in the repository")
    done(f"{len(repo_map.splitlines())} Python files")

    budget = int(os.getenv("MAX_ATTEMPTS", "5"))
    # Test files are locked, so a broken one is not ours to repair: it stays a failure in the baseline.
    unparsed = [e for e in repo_mod.syntax_errors(repo) if not edits.is_test_file(e["path"])]
    if unparsed:
        ended, before, out = _syntax_stage(repo, python, run_dir, task, task_type, unparsed, before, result,
                                           step, done, extra_env)
        if ended == "success":  # the repair was the whole task: its commit becomes the run's commit
            return _commit_to_project(repo, pid, task, task_type, run_id, result, step, done, result["explanation"])
        if not ended and result["attempts"] >= budget:
            ended, result["error"] = "failed", (f"The syntax repair used all {budget} attempts, so none was left for the "
                                                "task itself. Nothing is kept: the project is put back as it was.")
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
                pre, out = runner.run_tests(python, repo, run_dir, f"reproduce{attempt}", target=new_test, extra_env=extra_env)
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
            after, out = runner.run_tests(python, repo, run_dir, f"attempt{attempt}", extra_env=extra_env)
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
            return _commit_to_project(repo, pid, task, task_type, run_id, result, step, done,
                                      str(proposal.get("explanation", "")))
        feedback += f"\n\nTest output (end):\n{out[-LOG_CAP:]}"
        repo_mod.revert(repo)
        done(feedback[:300], "error")

    result["error"] = f"No acceptable change after {result['attempts']} attempts; workspace put back as it was. Last problem:\n{feedback}"
    return "failed"
