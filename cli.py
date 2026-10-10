"""python cli.py [--feature] [--sync] [--reset-to <base|run_id>] <repo path or git URL> ["<task text>"]

Each repository is a project: its workspace, environment and history are kept, and a run continues from
the project head. Nothing is pushed; open the pull request from the web page.

--feature:   the task is a feature request (default: a bug to fix, which must be reproduced first).
--sync:      first rebase the project onto the latest default branch of its GitHub repository.
--reset-to:  first move the project head to base or to an earlier successful run (the old head is kept as a tag).
With --sync or --reset-to the task is optional."""
import sys

from agent import pipeline, projects
from agent import repo as repo_mod


def show(state):
    last = state["steps"][-1] if state["steps"] else None
    if last and last["status"] != "running":
        print(f"[{last['status']:>5}] {last['name']}: {last['detail']} ({last['duration_s']}s)", flush=True)


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    feature, sync = "--feature" in args, "--sync" in args
    reset_to = None
    if "--reset-to" in args:
        at = args.index("--reset-to")
        if at + 1 >= len(args):
            sys.exit(__doc__)
        reset_to = args[at + 1]
        del args[at:at + 2]
    args = [a for a in args if a not in ("--feature", "--sync")]
    if len(args) not in ((1, 2) if sync or reset_to else (2,)) or any(a.startswith("--") for a in args):
        sys.exit(__doc__)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    # A local folder is the same project online and offline; only GitHub projects belong to the gh CLI login.
    scope = (repo_mod.whoami() if repo_mod.is_url(args[0]) else "") or "local-anon"
    pid = projects.ensure(scope, args[0])["project_id"]
    try:
        with projects.hold(pid):
            if reset_to:
                done = projects.reset(pid, reset_to)
                print(f"reset: project head is now {done['head_sha'][:7]}, the previous head is kept as {done['archive_tag']}")
            if sync:
                done = projects.sync(pid)
                print(f"sync: {done['status']}" + (f" (conflicts: {', '.join(done['conflicts'])})" if done.get("conflicts") else ""))
    except (projects.UserError, projects.Busy, RuntimeError) as e:
        sys.exit(f"ERROR: {e}")
    if len(args) == 1:
        print(f"project head: {projects.get(pid)['head_sha']}")
        return
    seen = set()

    def on_step(state):  # the pipeline notifies more than once per step; print each step once
        key = (len(state["steps"]), state["steps"][-1]["status"] if state["steps"] else "")
        if key not in seen:
            seen.add(key)
            show(state)

    state = pipeline.run(args[0], args[1], on_step=on_step, task_type="feature" if feature else "debug", scope=scope)
    r = state["result"]
    print(f"\nSTATUS: {state['status']}")
    print("baseline: {passed} passed, {failed} failed, {total} total".format(**r["baseline"]))
    print("after:    {passed} passed, {failed} failed, {total} total".format(**r["after"]))
    print(f"regressions: {len(r['regressions'])}  new tests: {len(r['new_tests'])}  attempts: {r['attempts']}")
    if r["env_status"]:
        print("env reused" if r["env_status"] == "reused" else f"env rebuilt ({r['env_reason']})")
    project = projects.get(pid)
    print(f"project: {project['display_name']} ({project['kind']})  branch: {project['branch']}  head: {project['head_sha']}")
    if r["explanation"]:
        print(f"\n{r['explanation']}")
    if r["diff"]:
        print(f"\n{r['diff']}")
    if r["error"]:
        print(f"\nERROR: {r['error']}")
    if r["note"]:
        print(f"\n{r['note']}")
    print(f"\nreport: {r['report_path']}")
    sys.exit(0 if state["status"] == "success" else 1)


if __name__ == "__main__":
    main()
