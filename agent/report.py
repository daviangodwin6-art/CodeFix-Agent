"""State dict -> runs/<id>/report.md (the evidence file for the submission)."""
from pathlib import Path


def write(state, task, repo_src):
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
- Local folder: {r.get('output_path') or '(none)'}
- Pull request link: {r.get('pr_url') or '(none)'}
{r['note']}

## Steps
""" + "\n".join(f"- {s['name']}: {s['status']} {s['detail']}" for s in state["steps"])
    if r["error"]:
        text += f"\n\n## Error\n```\n{r['error']}\n```"
    if r["diff"]:
        text += f"\n\n## Diff\n```diff\n{r['diff']}\n```"
    Path(r["report_path"]).write_text(text + "\n", encoding="utf-8")
