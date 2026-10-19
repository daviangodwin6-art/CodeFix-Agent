import { useEffect, useState } from "react";
import { FIELD, Icon, KindBadge, Notice, Spinner, button, plural, short } from "./ui.jsx";

export const TYPES = {
  debug: { option: "Debug", label: "Target Task / Bug Report", sample: "login fails when the email has capital letters" },
  feature: { option: "Feature", label: "Target Task / Feature Request",
             sample: "add a function email_domain(email) in auth/users.py that returns the part after the @, lowercased" },
};
const MODES = [["own", "My repo"], ["other", "Other's"], ["local", "Local"]];

// Segmented control on native radios: arrow keys work, the checked label is highlighted, focus ring shows on the label.
function Segment({ name, value, onChange, options, disabled }) {
  return (
    <div className="grid gap-px rounded-lg border border-line-strong bg-line-strong overflow-hidden"
         style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([id, text, sub, off]) => (
        <label key={id} className={"relative flex flex-col items-center justify-center px-2 py-2 text-center cursor-pointer bg-raised text-ink-2 hover:text-ink " +
            "has-[:checked]:bg-accent-fg/15 has-[:checked]:text-accent-fg has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent-fg " +
            ((disabled || off) ? "opacity-50 cursor-not-allowed" : "")}>
          <input type="radio" name={name} value={id} checked={value === id} disabled={disabled || off}
                 onChange={() => onChange(id)} className="sr-only" />
          <span className="text-sm font-medium">{text}</span>
          {sub && <span className="text-xs text-ink-3">{sub}</span>}
        </label>
      ))}
    </div>
  );
}

// `linked` is the active project when the Repository field still points at it; `conflict` names a busy project (HTTP 409).
export default function Composer({ form, setForm, me, repos, onRefreshRepos, busy, onRun, linked, conflict }) {
  const [changing, setChanging] = useState(false);
  const linkedId = linked && linked.project_id;
  useEffect(() => { setChanging(false); }, [linkedId]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const type = TYPES[form.taskType];
  const list = Array.isArray(repos) ? repos : null;

  function changeType(taskType) {
    const samples = Object.values(TYPES).map((t) => t.sample);
    const keep = !samples.includes(form.task.trim()); // keep typed text, and keep the box empty if it was emptied
    set({ taskType, task: keep ? form.task : TYPES[taskType].sample });
  }

  const hintId = "repo-hint";
  const repoField = form.mode === "own" ? (
    <div className="flex gap-2">
      <select id="repo-own" aria-label="Repository" value={form.own} onChange={(e) => set({ own: e.target.value })}
              disabled={!form.own && !(list && list.length)} className={FIELD + " h-9 font-mono"}>
        {/* a project's repository stays selectable even when it is not in the loaded list */}
        {form.own && !(list || []).some((r) => r.url === form.own) && <option value={form.own}>{form.own.replace(/^https:\/\//, "")}</option>}
        {!list ? !form.own && <option>Loading…</option>
          : !list.length ? !form.own && <option>No repositories found</option>
          : list.map((r) => <option key={r.url} value={r.url}>{r.name + (r.private ? "  (private)" : "")}</option>)}
      </select>
      <button type="button" aria-label="Refresh repository list" title="Refresh" onClick={onRefreshRepos}
              className={button("secondary", "md") + " w-9 px-0 shrink-0"}>
        <Icon name="refresh" className="text-lg" />
      </button>
    </div>
  ) : (
    <>
      <input id={"repo-" + form.mode} aria-label="Repository" aria-describedby={hintId} type="text" value={form[form.mode]}
             onChange={(e) => set({ [form.mode]: e.target.value })} autoComplete="off" spellCheck="false"
             placeholder={form.mode === "other" ? "https://github.com/owner/name" : undefined} className={FIELD + " h-9 font-mono"} />
      <p id={hintId} className="mt-1.5 text-xs text-ink-3">
        {form.mode === "other" ? "A public repository you can't push to. CodeFix forks it." : "Folder path or git URL. Your original folder is never modified."}
      </p>
    </>
  );

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); if (form.task.trim()) onRun(); }}>
      <fieldset disabled={busy} className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-ink">What should the agent do?</legend>
        <Segment name="task-type" value={form.taskType} onChange={changeType} disabled={busy}
                 options={[["debug", "Debug", "fix a bug"], ["feature", "Feature", "add behaviour"]]} />
      </fieldset>

      {linked && !changing ? (
        <div className="rounded-lg bg-raised p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
            <span>Runs on <strong className="font-semibold break-all">{linked.display_name}</strong></span>
            <KindBadge kind={linked.kind} />
          </div>
          <p className="mt-1 font-mono text-xs text-ink-3 break-words">
            continues from head {short(linked.head_sha)} · {plural(linked.changes_ahead_of_base, "earlier change")} kept
          </p>
          {!busy && <button type="button" onClick={() => setChanging(true)} className={button("ghost", "sm") + " mt-2 -ml-2.5"}>Use a different repository</button>}
        </div>
      ) : (
        <fieldset disabled={busy} className="min-w-0">
          <legend className="mb-2 text-sm font-medium text-ink">Repository</legend>
          <div className="flex flex-col gap-3">
            <div>
              <p id="mode-label" className="mb-1.5 text-xs text-ink-3">Whose repository?</p>
              <Segment name="repo-mode" value={form.mode} onChange={(mode) => set({ mode })} disabled={busy}
                       options={MODES.map(([id, text]) => [id, text, null, id !== "local" && !me.signed_in])} />
              {!me.signed_in && <p className="mt-1.5 text-xs text-ink-3">Sign in with GitHub to use GitHub repositories.</p>}
            </div>
            <div>{repoField}</div>
          </div>
        </fieldset>
      )}

      <div>
        <label htmlFor="task-input" className="mb-2 block text-sm font-medium text-ink">{type.label}</label>
        <textarea id="task-input" rows="4" value={form.task} readOnly={busy} aria-describedby="task-hint"
                  onChange={(e) => set({ task: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }}
                  placeholder="Describe the next bug or feature…" className={FIELD + " resize-y"} />
        <p id="task-hint" className="mt-1.5 text-xs text-ink-3">
          Ctrl+Enter to run{form.taskType === "feature" && ". Name any required function or module exactly."}
        </p>
      </div>

      <button type="submit" disabled={busy || !form.task.trim()} className={button("primary", "lg") + " w-full"}>
        {busy ? <Spinner className="text-xl" /> : <Icon name="play_arrow" fill className="text-xl" />}
        <span>{busy ? "Starting…" : form.taskType === "feature" ? "Build feature" : "Run repair"}</span>
      </button>

      {conflict && (
        <Notice tone="warn">Project is busy. A run is already active on {conflict}. You can start a run on another project.</Notice>
      )}
    </form>
  );
}
