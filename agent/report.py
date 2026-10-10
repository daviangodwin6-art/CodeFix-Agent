"""State dict -> projects/<project_id>/runs/<run_id>/report.md (the evidence file for the submission)."""
from pathlib import Path


def _project_block(state, project):
    """Where the run happened and what it did to the project head."""
    r = state["result"]
    env = "reused" if r.get("env_status") == "reused" else f"rebuilt ({r['env_reason']})" if r.get("env_status") else "not built"
    return f"""## Project
- Project: `{project['display_name']}` ({project['kind']}, id `{project['project_id']}`)
- Head before: `{r.get('head_before') or '(none)'}`
- Commit: `{r.get('commit_sha') or '(none: the project head is unchanged)'}`
- Environment: {env}
"""


def _timings_block(state):
    rows = "\n".join(f"| {s['name']} | {s['status']} | {s.get('duration_s') if s.get('duration_s') is not None else ''} |"
                     for s in state["steps"])
    return f"## Step timings\n| Step | Status | Seconds |\n| --- | --- | --- |\n{rows}\n\nTotal: {state.get('duration_s')} s\n"


def write(state, task, repo_src, project):
    r = state["result"]
    bullets = lambda items: "\n".join(f"- `{i}`" for i in items) or "- none"
    syntax = r.get("syntax")
    # A run that only repaired syntax has no fail-first test: "no" would read as a proof that failed.
    reproduced = ('n/a' if r.get('task_type') == 'feature' else
                  'n/a (syntax repair only: the proof is that the files parse and the tests pass)'
                  if syntax and syntax["only_syntax"] else 'yes' if r.get('reproduced') else 'no')
    stage = "" if not syntax else f"""
## Syntax stage
Ran before the task itself, because these files did not parse. Attempts used: {syntax['attempts']}.
{'The task asked for nothing else, so the run ended here.' if syntax['only_syntax'] else 'The rest of the run worked on the repaired code.'}

| File | Before | After |
| --- | --- | --- |
""" + "\n".join(f"| `{f['path']}` | line {f['line']}: {f['msg']} | {f['after']} |" for f in syntax["files"]) + "\n"
    text = f"""# Agent run {state['id']}: {state['status'].upper()}

**Repository:** `{repo_src}`
**Branch:** `{r['branch']}`
**Attempts:** {r['attempts']}
**Mode:** {'add feature' if r.get('task_type') == 'feature' else 'debug'}
**Bug reproduced before the fix (new test failed on the original code):** {reproduced}

{_project_block(state, project)}
## Task
{task}
{stage}
## Explanation
{r['explanation'] or '(none)'}

## Tests before and after
| | Passed | Failed | Total |
| --- | --- | --- | --- |
| Baseline | {r['baseline']['passed']} | {r['baseline']['failed']} | {r['baseline']['total']} |
| After | {r['after']['passed']} | {r['after']['failed']} | {r['after']['total']} |

**Regressions (passed before, not passing now): {len(r['regressions'])}**
{bullets(r['regressions'])}

## New tests
{bullets(r['new_tests'])}

## New imports verified to exist
{bullets(r['import_check'])}

## Files changed
{bullets(r['files_changed'])}

## Where to see it
- Workspace: the project's working copy, branch `{r['branch']}` (nothing is pushed until you open a pull request)
{r['note']}

## Steps
""" + "\n".join(f"- {s['name']}: {s['status']} {s['detail']}" for s in state["steps"])
    text += "\n\n" + _timings_block(state)
    if r["error"]:
        text += f"\n\n## Error\n```\n{r['error']}\n```"
    if r["diff"]:
        text += f"\n\n## Diff\n```diff\n{r['diff']}\n```"
    Path(r["report_path"]).write_text(text + "\n", encoding="utf-8")
