// PREVIEW ONLY. A canned API for building the Projects UI before the backend exists.
// It is on only under `npm run dev` (import.meta.env.DEV) AND with ?mock=<state> in the URL, so a production
// build can never use it. States: empty | list | project | reset | live | signedout.
// Everything mock-related lives here, plus one import in api.js and the `preset` use in App.jsx. Delete with the real wiring.
const state = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("mock") : null;

const minutesAgo = (n) => new Date(Date.now() - n * 60000).toISOString();
const GH = "https://github.com/";

const sample = {
  project_id: "p_sample", kind: "local", display_name: "sample_repo", source: "D:\\work\\sample_repo",
  branch: "codefix/sample-repo", head_sha: "3f9a2c1d5e6f708192a3b4c5d6e7f8091a2b3c4d", changes_ahead_of_base: 3, run_count: 4,
  last_run: { run_id: "r_0412", status: "success", mode: "debug", finished_at: minutesAgo(2) },
  env: { ready: true, state: "ready", python: "3.11", last_used: minutesAgo(2) },
  locked_tests: { total: 14, added_by_runs: 3 }, busy: false,
  base_ref: "codefix/base", base_sha: "04d1f3a9c8b7a6958473625140f9e8d7c6b5a493", base_label: "snapshot of sample_repo", archive_tags: [],
};
const tiny = {
  project_id: "p_tiny", kind: "mine", display_name: "tinyauth", source: GH + "daviangodwin6-art/tinyauth",
  branch: "codefix/tinyauth", head_sha: "b42e9d07a1c3e5f7092b4d6f8a0c2e4f6a8b0c2d", changes_ahead_of_base: 5, run_count: 7,
  last_run: { run_id: "r_0731", status: "running", mode: "feature", finished_at: null },
  env: { ready: true, state: "ready", python: "3.11", last_used: minutesAgo(1) },
  locked_tests: { total: 22, added_by_runs: 5 }, busy: true,
  base_ref: "origin/main", base_sha: "77c0ffee1234567890abcdef1234567890abcdef", base_label: "origin/main", archive_tags: [],
};
const requests = {
  project_id: "p_requests", kind: "others", display_name: "psf/requests", source: GH + "psf/requests",
  branch: "codefix/requests", head_sha: "e19c44b2f00d4a6c8e0b2d4f6a8c0e2b4d6f8a0c", changes_ahead_of_base: 1, run_count: 2,
  last_run: { run_id: "r_0388", status: "failed", mode: "debug", finished_at: minutesAgo(26 * 60) },
  env: { ready: false, state: "evicted", python: "3.11", last_used: minutesAgo(30 * 60) },
  locked_tests: { total: 610, added_by_runs: 1 }, busy: false,
  base_ref: "upstream/main", base_sha: "0e322af87745eff34caffe4df68456ebc20d9068", base_label: "upstream/main", archive_tags: [],
};

const item = (run_id, mode, task, status, head_before, commit_sha, minutes, duration_s, env_status, env_reason, attempts, syntax_stage = false) =>
  ({ run_id, mode, task, status, head_before, commit_sha, started_at: minutesAgo(minutes + duration_s / 60), finished_at: status === "running" ? null : minutesAgo(minutes),
     duration_s: status === "running" ? null : duration_s, env_status, env_reason, attempts, syntax_stage });

const RUNS = {
  p_sample: [
    item("r_0412", "debug", "login fails when the email has capital letters", "success", "a71d0e4", "3f9a2c1d5e6f708192a3b4c5d6e7f8091a2b3c4d", 2, 58, "reused", null, 1),
    item("r_0409", "feature", "add password reset token expiry", "failed", "a71d0e4", null, 40, 192, "reused", null, 5),
    item("r_0405", "feature", "add a rate limiter to login", "success", "9c2e7b8", "a71d0e4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f", 95, 101, "rebuilt", "deps changed", 2),
    item("r_0401", "debug", "fix SyntaxError in utils.py", "success", "04d1f3a", "9c2e7b8a0c2e4f6a8b0d2f4a6c8e0b2d4f6a8c0e", 180, 125, "rebuilt", "first run", 1, true),
  ],
  p_tiny: [
    item("r_0731", "feature", "add remember_me(user, days) that extends the session expiry", "running", "b42e9d0", null, 0, 21, "reused", null, 1),
    ...[["r_0724", "b42e9d07a1c3e5f7092b4d6f8a0c2e4f6a8b0c2d"], ["r_0719", "5d1e"], ["r_0712", "4c0d"], ["r_0706", "3b9c"], ["r_0698", "2a8b"], ["r_0690", "1f7a"]]
      .map(([id, sha], i) => item(id, i % 2 ? "feature" : "debug", "earlier change " + (6 - i), "success", "0000000", sha.padEnd(40, "0"), 60 * (i + 1), 70 + i * 9, "reused", null, 1)),
  ],
  p_requests: [
    item("r_0388", "debug", "session cookies are dropped on a redirect to another port", "failed", "e19c44b", null, 26 * 60, 240, "reused", null, 5),
    item("r_0381", "debug", "to_key_val_list rejects a generator", "success", "0e322af", "e19c44b2f00d4a6c8e0b2d4f6a8c0e2b4d6f8a0c", 30 * 60, 330, "rebuilt", "first run", 2),
  ],
};

const DIFF = `diff --git a/auth/users.py b/auth/users.py
--- a/auth/users.py
+++ b/auth/users.py
@@ -12,7 +12,7 @@ class UserStore:
     def find(self, email):
         """Return the user with this email, or None."""
-        return self._users.get(email)
+        return self._users.get(email.strip().lower())

     def add(self, email, password):
         self._users[email.strip().lower()] = hash_password(password)
diff --git a/tests/test_login.py b/tests/test_login.py
--- a/tests/test_login.py
+++ b/tests/test_login.py
@@ -20,3 +20,8 @@ def test_login_ok(store):
     assert login(store, "ann@example.com", "pw")
+
+
+def test_login_mixed_case_email(store):
+    store.add("ann@example.com", "pw")
+    assert login(store, "Ann@Example.COM", "pw")
`;

const done = (name, detail, duration_s) => ({ name, status: "ok", detail, duration_s });
const LIVE = { // mockup page 2
  id: "r_0731", status: "running", project_id: "p_tiny", started_at: new Date(Date.now() - 21000).toISOString(),
  steps: [done("access", "", 0.4), done("prepare", "workspace clean", 0.9), done("environment", "env reused", 1.2),
    done("baseline", "22 passed", 6.8), done("map", "", 0.3), done("localize", "2 files", 4.1),
    { name: "edit #1", status: "running", detail: "", duration_s: null }],
  result: { task_type: "debug", head_before: "b42e9d07a1c3e5f7092b4d6f8a0c2e4f6a8b0c2d", env_status: "reused", env_reason: null },
};

function stored(project, run) { // GET /api/projects/{id}/runs/{run_id}
  const ok = run.status === "success";
  const names = ["access", "prepare", "environment", "baseline", "map", "localize", "edit #1", "reproduce #1", "verify #1", "commit to project"];
  return {
    id: run.run_id, status: run.status, project_id: project.project_id,
    steps: names.map((name, i) => done(name, name === "environment" ? "env " + run.env_status : "", 0.4 + i)),
    step_timings: names.map((step, i) => ({ step, duration_s: 0.4 + i })),
    result: {
      task_type: run.mode, attempts: run.attempts, reproduced: true, branch: project.branch, report_path: "projects/" + project.project_id + "/runs/" + run.run_id + "/report.md",
      baseline: { passed: 11, failed: 1, total: 12 }, after: ok ? { passed: 13, failed: 0, total: 13 } : { passed: 11, failed: 1, total: 12 },
      regressions: [], new_tests: ok ? ["tests/test_login.py::test_login_mixed_case_email"] : [], import_check: [],
      explanation: ok ? "UserStore.find looked the email up exactly as typed, while add() stores it lowercased. find() now normalises the email the same way." : "",
      error: ok ? "" : "No acceptable change after " + run.attempts + " attempts. The last attempt still failed tests/test_reset.py::test_token_expires.",
      note: "", diff: ok ? DIFF : "", head_before: run.head_before, commit_sha: run.commit_sha, env_status: run.env_status, env_reason: run.env_reason,
    },
  };
}

const STATES = {
  empty: { projects: [] },
  list: { projects: [sample, tiny, requests] },
  project: { projects: [sample, tiny, requests], preset: { select: "p_sample" } },
  reset: { projects: [sample, tiny, requests], preset: { select: "p_sample", dialog: "reset" } },
  live: { projects: [tiny, sample], preset: { select: "p_tiny", conflict: "tinyauth" } },
  signedout: { projects: [sample], signedOut: true, preset: { offline: true } },
};
const s = state ? STATES[state] || STATES.list : null;

// What the page should open on, so every state can be captured without clicking. Read once by App.jsx.
export const preset = s ? s.preset || {} : null;

const BUSY = "This project already has a run in progress.";

function answer(method, url, body) {
  const [path, query] = url.split("?");
  const [, , area, id, sub, runId] = path.split("/"); // /api/<area>/<id>/<sub>/<runId>
  if (area === "me") return [200, s.signedOut ? { login: "", signed_in: false } : { login: "daviangodwin6-art", signed_in: true }];
  if (area === "session") return [200, { ok: true }];
  if (area === "repos") return [200, [{ name: "daviangodwin6-art/tinyauth", url: tiny.source, private: false }, { name: "daviangodwin6-art/notes", url: GH + "daviangodwin6-art/notes", private: true }]];
  if (area === "run" && method === "POST") {
    return state === "live" || /tinyauth/.test(body.repo) ? [409, { detail: BUSY }] : [200, { id: LIVE.id, project_id: LIVE.project_id }];
  }
  if (area === "run") return [200, LIVE];
  if (area !== "projects") return [404, { detail: "Not found" }];
  if (!id) return [200, s.projects.map(({ base_ref, base_sha, base_label, archive_tags, ...rest }) => rest)];
  const project = s.projects.find((p) => p.project_id === decodeURIComponent(id));
  if (!project) return [404, { detail: "Project not found" }];
  if (method !== "GET" && project.busy) return [409, { detail: BUSY }];
  if (!sub) return [200, method === "DELETE" ? { deleted: true } : project];
  if (sub === "runs") {
    const run = RUNS[project.project_id].find((r) => r.run_id === decodeURIComponent(runId || ""));
    return runId ? (run ? [200, stored(project, run)] : [404, { detail: "Run not found" }]) : [200, RUNS[project.project_id]];
  }
  if (sub === "diff") return [200, { diff: query === "from=base" && project.changes_ahead_of_base ? DIFF : "" }];
  if (sub === "reset") return [200, { head_sha: body.to === "base" ? project.base_sha : "a71d0e4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f", archive_tag: "codefix/archive/" + new Date().toISOString().slice(0, 16).replace(":", "-") }];
  if (sub === "sync") return [200, project.kind === "others" ? { status: "conflict", conflicts: ["requests/sessions.py", "tests/test_requests.py"] } : { status: project.kind === "local" ? "not_applicable" : "ok" }];
  if (sub === "export") return [200, body.confirm ? { written_to: project.source } : { patch_path: "projects/" + project.project_id + "/export/changes.patch" }];
  if (sub === "pr") return [200, { url: project.source + "/pull/12" }];
  if (sub === "venv") return [200, { deleted: true }];
  return [404, { detail: "Not found" }];
}

export const mockFetch = s && (async (url, options = {}) => {
  const [status, body] = answer(options.method || "GET", url, options.body ? JSON.parse(options.body) : {});
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
});
