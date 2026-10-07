"""python cli.py [--feature] [--fork | --local] <repo path or git URL> "<task text>"

--feature: the task is a feature request (default: a bug to fix, which must be reproduced first).

--fork / --local answer the "no write access" question up front (fork to your GitHub account, or local folder
only). Without a flag the CLI asks on the terminal, or picks local when not interactive."""
import sys

from agent import pipeline


def show(state):
    last = state["steps"][-1] if state["steps"] else None
    if last and last["status"] != "running":
        print(f"[{last['status']:>5}] {last['name']}: {last['detail']}", flush=True)


def main():
    args = [a for a in sys.argv[1:] if a not in ("--fork", "--local", "--feature")]
    flag = next((a[2:] for a in sys.argv[1:] if a in ("--fork", "--local")), None)
    if len(args) != 2:
        sys.exit(__doc__)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    seen = set()

    def on_step(state):  # the pipeline notifies more than once per step; print each step once
        key = (len(state["steps"]), state["steps"][-1]["status"] if state["steps"] else "")
        if key not in seen:
            seen.add(key)
            show(state)

    def ask(options):
        if flag:
            return flag
        if not sys.stdin.isatty():
            return "local"
        for i, o in enumerate(options, 1):
            print(f"  {i}. {o['label']}")
        return options[int(input("Choose 1 or 2: ") or 2) - 1]["id"]

    state = pipeline.run(args[0], args[1], on_step=on_step, ask=ask,
                         task_type="feature" if "--feature" in sys.argv else "debug")
    r = state["result"]
    print(f"\nSTATUS: {state['status']}")
    print("baseline: {passed} passed, {failed} failed, {total} total".format(**r["baseline"]))
    print("after:    {passed} passed, {failed} failed, {total} total".format(**r["after"]))
    print(f"regressions: {len(r['regressions'])}  new tests: {len(r['new_tests'])}  attempts: {r['attempts']}")
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
