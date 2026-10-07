"""The prompts. The first line of each is the step marker the fake LLM keys on."""

LOCALIZE = """STEP: localize
You are a careful software engineer working on an existing Python repository.
Choose the files that must be read to carry out the task.

{goal}:
{task}

REPO MAP (path: top-level functions and classes):
{repo_map}

TESTS FAILING BEFORE ANY CHANGE:
{failures}

Return JSON: {{"files": ["path", ...]}}
- At most 5 paths, copied exactly from the repo map, most relevant first.
- Include the source file(s) {focus} and the closest existing test file
  (so a new test can copy its import style and fixtures).
"""

# What differs between the two modes. Everything after it (RULES) is shared.
EDIT_DEBUG = """STEP: edit
You are a careful software engineer working on an existing Python repository.
Fix the bug with the smallest change, and add one new test file that proves it.

BUG REPORT:
{task}

FILES:
{files}

{feedback}
Return JSON:
{{"explanation": "what was wrong and what you changed, 2-4 sentences",
  "edits": [{{"path": "file to change", "search": "exact text to find", "replace": "new text"}}],
  "new_test": {{"path": "tests dir/test_<something new>.py", "content": "full file content"}}}}

Rules (checked by code; a violation rejects the whole attempt):
- The new test must reproduce the bug: it is run first on the ORIGINAL code and must FAIL there,
  then it must pass after your edit.
- Fix the bug by editing existing files only; do not create new source files.
"""

EDIT_FEATURE = """STEP: edit
You are a careful software engineer working on an existing Python repository.
Add the requested feature with the smallest change that fits the existing code style, and add one
new test file that shows it works. Everything that works today must keep working.

FEATURE REQUEST:
{task}

FILES:
{files}

{feedback}
Return JSON:
{{"explanation": "what you added, where, and the names/signatures you chose, 2-4 sentences",
  "edits": [{{"path": "existing file to change", "search": "exact text to find", "replace": "new text"}}],
  "new_files": [{{"path": "new source file", "content": "full file content"}}],
  "new_test": {{"path": "tests dir/test_<something new>.py", "content": "full file content"}}}}

Rules (checked by code; a violation rejects the whole attempt):
- "edits" changes existing files; "new_files" creates source files that do not exist yet. Either may
  be an empty list, not both. Prefer extending an existing module over creating a new one.
- "new_files" must not contain tests; the one new test file goes in "new_test".
- If the request names a function, class or module, use exactly that name and signature.
- The new test is your interpretation of the request: test the behaviour the request describes.
"""

RULES = """- "search" must be copied character for character from the file shown above, including
  indentation, and must occur exactly once in that file. Keep it short but unique. Never use text from a
  "[... file truncated ...]" marker or from the last lines before it.
- Change as few lines as possible. Do not reformat, rename or refactor anything else.
- Do NOT edit existing test files or conftest.py. Put the new test in a NEW file next to the
  existing tests, named test_*.py, written in the same style (same imports and fixtures;
  copy any fixture you need into the new file).
- Use only modules, functions and names that exist in the files shown above or in the Python
  standard library (or that you create in this same answer). Do not invent imports or APIs.
- Every test that passes now must still pass.
- Python reports only the FIRST syntax error in a file. Read every line of a file that does not
  parse and fix all of its syntax errors (missing ":" or ")", "=" instead of "==", bad indentation)
  in this one answer, before the logic bugs.
- Importing a module must never run an interactive loop, input() or other blocking code. If a file
  does that at top level (a menu loop, a script body), move it into def main() and call it under
  if __name__ == "__main__": as part of the fix. The new test must only import and call functions,
  never run the script body and never read stdin.
"""

EDIT = {"debug": EDIT_DEBUG + RULES, "feature": EDIT_FEATURE + RULES}


def localize(task, repo_map, failures, task_type="debug"):
    goal, focus = {"debug": ("BUG REPORT", "that need to change"),
                   "feature": ("FEATURE REQUEST", "the feature belongs in or must call")}[task_type]
    return LOCALIZE.format(goal=goal, focus=focus, task=task, repo_map=repo_map, failures=failures or "(none)")


def edit(task, files, feedback, task_type="debug"):
    blocks = "\n\n".join(f"=== {path} ===\n{content}" for path, content in files.items())
    if feedback:
        feedback = f"YOUR PREVIOUS ATTEMPT WAS REJECTED AND REVERTED. Fix this:\n{feedback}\n"
    return EDIT[task_type].format(task=task, files=blocks, feedback=feedback)
