// Every string from the API is untrusted: components render it as React text only.
// A failed request throws an Error with the server's message, the HTTP status in `status` and the parsed
// `detail` in `detail` (a "busy" answer to POST /api/run is { message, project_id }).
export async function api(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    throw new Error("Network error: could not reach the server.");
  }
  let body = null;
  try { body = await res.json(); } catch (e) { /* non-JSON body */ }
  if (!res.ok) {
    const d = body && body.detail;
    const text = typeof d === "string" ? d : d && typeof d.message === "string" ? d.message : d ? JSON.stringify(d) : "";
    const err = new Error(text || "Request failed (HTTP " + res.status + ")");
    err.status = res.status;
    err.detail = d;
    throw err;
  }
  if (!body) throw new Error("Server returned an unreadable response.");
  return body;
}

export const post = (url, body) =>
  api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

export const isHttps = (url) => /^https:\/\//.test(url || ""); // only https links become clickable

export const finished = (run) => !!run && run.status !== "running";

// The steps a run is expected to go through, so the stepper can show what is still to come.
export function planSteps(run, taskType) {
  const steps = (run && run.steps) || [];
  if (finished(run)) return steps;
  const feature = ((run && run.result && run.result.task_type) || taskType) === "feature";
  // Attempt the run is on: the last numbered step, or the next one if that attempt was rejected.
  const last = [...steps].reverse().find((s) => /#\d+$/.test(s.name));
  // Before the first numbered step, attempts already used (by the syntax stage, which shares the budget) come first.
  const n = last ? Number(last.name.split("#")[1]) + (last.status === "error" ? 1 : 0)
    : ((run && run.result && run.result.attempts) || 0) + 1;
  const expected = ["access", "prepare", "environment", "baseline", "map", "localize",
    ...(feature ? [`implement #${n}`] : [`edit #${n}`, `reproduce #${n}`]), `verify #${n}`, "commit to project"];
  // "syntax" only runs when the code does not parse, so it is shown when the run reports it, never predicted.
  const seen = new Set(steps.map((s) => s.name));
  return [...steps, ...expected.filter((n) => !seen.has(n)).map((name) => ({ name, status: "pending", detail: "" }))];
}
