import { useEffect, useState } from "react";
import { FIELD, Icon, KindBadge, LABEL, Notice, Spinner, button, plural, short } from "./ui.jsx";

export const TYPES = {
  debug: { option: "Debug", label: "Target Task / Bug Report", sample: "login fails when the email has capital letters" },
  feature: { option: "Feature", label: "Target Task / Feature Request",
             sample: "add a function email_domain(email) in auth/users.py that returns the part after the @, lowercased" },
};
const MODES = [["own", "My repo", "deployed_code"], ["other", "Other's", "share"], ["local", "Local", "folder_open"]];

// HUD radio groups on native radios (sr-only input: arrow keys work, :checked drives the look, focus ring shows on the label).
// kind "cards": two large selectable cards (red left rail + glowing pip when checked); kind "tabs": mode tab bar (cyan bottom rail).
// options: [id, text, descriptor, disabled, icon]
const FOCUS = "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent-fg ";
function Segment({ name, value, onChange, options, disabled, kind = "cards" }) {
  const cards = kind === "cards";
  return (
    <div className={cards ? "grid grid-cols-2 gap-3" : "grid gap-1 rounded-sm border border-line bg-canvas p-1"}
         style={cards ? undefined : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([id, text, sub, off, icon]) => (
        <label key={id} className={FOCUS + "relative min-w-0 cursor-pointer " + (cards
            ? "flex flex-col gap-1 rounded-sm border border-l-2 border-line border-l-line bg-surface p-3 text-ink-2 hover:bg-raised hover:text-ink has-[:checked]:bg-raised has-[:checked]:border-l-accent has-[:checked]:text-ink "
            : "flex items-center justify-center gap-1.5 rounded-sm border-b-2 border-transparent px-2 py-2 text-center font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-2 hover:text-ink has-[:checked]:bg-raised has-[:checked]:border-accent-fg has-[:checked]:text-accent-fg ") +
            ((disabled || off) ? "opacity-50 cursor-not-allowed" : "")}>
          <input type="radio" name={name} value={id} checked={value === id} disabled={disabled || off}
                 onChange={() => onChange(id)} className="peer sr-only" />
          {cards ? (
            <>
              <span aria-hidden="true" className="absolute right-3 top-3 h-2 w-2 rounded-full bg-line-strong peer-checked:bg-reactor peer-checked:shadow-glow-red" />
              <span className="pr-5 font-display text-base font-bold uppercase tracking-wide">{text}</span>
              {sub && <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-3">{sub}</span>}
            </>
          ) : (
            <>
              {icon && <Icon name={icon} className="text-base" />}
              <span>{text}</span>
            </>
          )}
        </label>
      ))}
    </div>
  );
}

// Section label: cyan icon + HUD micro-label.
const Label = ({ icon, children }) => <span className={LABEL + " inline-flex items-center gap-1.5"}><Icon name={icon} className="text-base text-accent-fg" />{children}</span>;

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
        <legend className="mb-2"><Label icon="tune">What should the agent do?</Label></legend>
        <Segment name="task-type" value={form.taskType} onChange={changeType} disabled={busy}
                 options={[["debug", "Debug", "fix a bug"], ["feature", "Feature", "add behaviour"]]} />
      </fieldset>

      {linked && !changing ? (
        <div className="hud-well p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
            <span>Runs on <strong className="font-mono font-semibold break-all">{linked.display_name}</strong></span>
            <KindBadge kind={linked.kind} />
          </div>
          <p className="mt-1.5 font-mono text-xs text-ink-2 break-words">
            continues from head <span className="text-gold">{short(linked.head_sha)}</span> · {plural(linked.changes_ahead_of_base, "earlier change")} kept
          </p>
          {!busy && <button type="button" onClick={() => setChanging(true)} className={button("ghost", "sm") + " mt-2 -ml-2.5"}>Use a different repository</button>}
        </div>
      ) : (
        <fieldset disabled={busy} className="min-w-0">
          <legend className="mb-2"><Label icon="inventory_2">Repository</Label></legend>
          <div className="flex flex-col gap-3">
            <div>
              <p id="mode-label" className={LABEL + " mb-1.5 flex items-center gap-1.5"}><Icon name="hub" className="text-base text-accent-fg" />Whose repository?</p>
              <Segment kind="tabs" name="repo-mode" value={form.mode} onChange={(mode) => set({ mode })} disabled={busy}
                       options={MODES.map(([id, text, icon]) => [id, text, null, id !== "local" && !me.signed_in, icon])} />
              {!me.signed_in && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-3"><Icon name="lock" className="text-sm" />Sign in with GitHub to use GitHub repositories.</p>}
            </div>
            <div>{repoField}</div>
          </div>
        </fieldset>
      )}

      <div>
        <div className="flex items-center justify-between gap-3 rounded-t-sm border border-b-0 border-line-strong bg-raised px-3 h-8">
          <label htmlFor="task-input" className={LABEL + " flex min-w-0 items-center gap-1.5"}>
            <Icon name="terminal" className="text-base text-accent-fg" /><span className="truncate">{type.label}</span>
          </label>
          <span id="task-hint" className="hidden sm:inline shrink-0 font-mono text-xs uppercase tracking-[0.1em] text-ink-3">Ctrl+Enter to run</span>
        </div>
        <textarea id="task-input" rows="4" value={form.task} readOnly={busy} aria-describedby={"task-hint" + (form.taskType === "feature" ? " task-hint-2" : "")}
                  onChange={(e) => set({ task: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }}
                  placeholder="Describe the next bug or feature…" className={FIELD + " rounded-t-none resize-y font-mono"} />
        {form.taskType === "feature" && <p id="task-hint-2" className="mt-1.5 text-xs text-ink-3">Name any required function or module exactly.</p>}
      </div>

      <button type="submit" disabled={busy || !form.task.trim()} className={button("primary", "lg") + " w-full"}>
        {busy ? <Spinner className="text-xl" /> : <Icon name="play_arrow" fill className="text-xl" />}
        <span>{busy ? "Starting…" : form.taskType === "feature" ? "Build feature" : "Run repair"}</span>
        {!busy && <Icon name="arrow_forward" className="text-xl" />}
      </button>

      {conflict && (
        <Notice tone="warn">Project is busy. A run is already active on {conflict}. You can start a run on another project.</Notice>
      )}
    </form>
  );
}
