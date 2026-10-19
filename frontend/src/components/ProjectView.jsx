import { useEffect, useRef, useState } from "react";
import { api, isHttps, post } from "../api.js";
import { enter, useAnime } from "../motion.jsx";
import RunView, { Changes } from "./Results.jsx";
import {
  ago, button, CARD, CARD_CORNERS, ConfirmDialog, Dialog, duration, FIELD, Icon, KindBadge, LABEL, Notice, PanelTitle, plural, short,
  Skeleton, Spinner, Stat, StatusPill,
} from "./ui.jsx";

const MODE = { debug: "Debug", feature: "Feature" };
const TONE = { emerald: "ok", amber: "warn", rose: "bad", slate: "info" };
// Level-2 menu rows (the danger row adds text-bad).
const MENU_ITEM = "flex w-full items-center gap-2 rounded-sm px-3 h-9 text-left font-mono text-xs font-semibold uppercase tracking-[0.08em] enabled:hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed";
const TAB = "flex items-center gap-2 px-3 h-10 font-mono text-xs font-semibold uppercase tracking-[0.1em] border-b-2 -mb-px ";
const ROW = "rounded-sm border border-line bg-canvas/40 hover:bg-raised ";

function runMeta(r) {
  const live = r.status === "running";
  return [MODE[r.mode] || r.mode, duration(r.duration_s),
    r.syntax_stage ? "syntax stage" : r.attempts != null && plural(r.attempts, "attempt"),
    !live && (r.commit_sha ? "commit " + short(r.commit_sha) : "head unchanged"),
    r.env_status && "env " + r.env_status + (r.env_reason ? " (" + r.env_reason + ")" : "")].filter(Boolean).join(" · ");
}

function ResetDialog({ p, url, onClose, onDone }) {
  // Past successful runs, except the one the project is already at.
  const options = (p.runs || []).filter((r) => r.status === "success" && r.commit_sha && r.commit_sha !== p.head_sha);
  const [to, setTo] = useState(options[0] ? options[0].run_id : "base");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const choices = [{ id: "base", title: "Base", meta: [p.base_label || p.base_ref, short(p.base_sha)].filter(Boolean).join(" · ") },
    ...options.map((r) => ({ id: r.run_id, title: "After “" + r.task + "”", meta: r.run_id + " · " + short(r.commit_sha) }))];

  async function reset(close) {
    setWorking(true);
    setError("");
    try {
      onDone(await post(url + "/reset", { to }));
      close();
    } catch (e) {
      setError(e.status === 409 ? "Project is busy. Wait for the active run to finish, then reset." : e.message);
      setWorking(false);
    }
  }

  return (
    <Dialog title={"Reset " + p.display_name + "?"} onClose={onClose}>
      {(close) => (
        <>
          <p className="mt-2 text-sm text-ink-2 leading-relaxed">
            Choose the point to go back to. Later changes leave the project branch, but they are not deleted.
          </p>
          <fieldset className="mt-4">
            <legend className={LABEL + " mb-2"}>Reset to</legend>
            <div className="flex flex-col gap-2 max-h-[40vh] overflow-auto">
              {choices.map((c) => (
                <label key={c.id} className={"flex items-center gap-3 rounded-sm border border-l-2 px-4 py-3 cursor-pointer " +
                  (to === c.id ? "border-accent-fg/40 border-l-accent-fg bg-canvas" : "border-line border-l-line bg-surface hover:bg-canvas hover:border-l-line-strong")}>
                  <input type="radio" name="reset-to" value={c.id} checked={to === c.id} data-autofocus={to === c.id ? "" : undefined} onChange={() => setTo(c.id)} className="w-4 h-4 accent-accent shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink break-words">{c.title}</span>
                    <span className="block mt-0.5 font-mono text-xs text-ink-2 break-words">{c.meta}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Notice tone="info" className="mt-4">
            The current head <code className="font-mono">{short(p.head_sha)}</code> will be kept as an archive tag{" "}
            <code className="font-mono">codefix/archive/&lt;timestamp&gt;</code>, so it is never lost.
          </Notice>
          {error && <p role="alert" className="mt-3 text-sm text-bad break-words">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={close} className={button("secondary")}>Cancel</button>
            <button type="button" disabled={working} onClick={() => reset(close)} className={button("primary")}>
              {working ? "Resetting…" : "Reset project"}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function DeleteDialog({ p, url, onClose, onDone }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function remove(e, close) {
    e.preventDefault();
    if (typed !== p.display_name) return;
    setWorking(true);
    setError("");
    try {
      await api(url, { method: "DELETE" });
      close();
      onDone();
    } catch (err) {
      setError(err.status === 409 ? "Project is busy. Wait for the active run to finish, then delete." : err.message);
      setWorking(false);
    }
  }

  return (
    <Dialog title={"Delete " + p.display_name + "?"} onClose={onClose}>
      {(close) => (
        <form onSubmit={(e) => remove(e, close)}>
          <p className="mt-2 text-sm text-ink-2 leading-relaxed">
            This removes the project's workspace, its environment and its run history from CodeFix.
            {p.kind === "local" ? " Your original folder is not touched." : " The repository on GitHub is not touched."} This cannot be undone.
          </p>
          <label htmlFor="delete-confirm" className="block mt-4 text-sm font-semibold text-ink break-words">
            Type <span className="font-mono text-gold">{p.display_name}</span> to confirm
          </label>
          <div className="relative mt-2">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-ink-3">&gt;</span>
            <input id="delete-confirm" type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck="false"
                   className={FIELD + " h-10 pl-7 font-mono"} />
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-bad break-words">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={close} className={button("secondary")}>Cancel</button>
            <button type="submit" disabled={working || typed !== p.display_name} className={button("danger") + " bg-bad/15"}>
              {working ? "Deleting…" : "Delete project"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

const TABS = ["history", "changes", "activity"];

export default function ProjectView({ project: p, composer, onChanged, onDeleted, onRerun, onSignedOut, onWatch }) {
  const [dialog, setDialog] = useState("");
  const [view, setView] = useState(null); // null | { run, item }
  const [note, setNote] = useState(null); // result of the last action: { tone, text, list?, url?, canWrite? }
  const [working, setWorking] = useState("");
  const [confirm, setConfirm] = useState(null); // { title, body, label, danger?, onConfirm }
  const [tab, setTab] = useState("history");
  const [diff, setDiff] = useState({ key: null, loading: false, error: "", text: "" });
  const url = "/api/projects/" + encodeURIComponent(p.project_id);
  const local = p.kind === "local";
  const env = p.env || {};
  const tests = p.locked_tests || {};
  const events = p.events || [];
  const history = useRef(null);
  const menuBtn = useRef(null);
  const menu = useRef(null);
  const menuId = "project-menu-" + p.project_id;
  const tabRefs = useRef({});
  const disabled = !!working || !!p.busy;
  useAnime(history, () => history.current && enter(history.current.children, { y: [10, 0], delay: (el, i) => i * 60 }), [p.project_id, !p.runs, tab]);

  // The cumulative diff loads the first time the Changes tab opens, and again when the head moves.
  const diffKey = p.project_id + "@" + p.head_sha;
  useEffect(() => {
    if (tab !== "changes" || diff.key === diffKey) return;
    let live = true;
    setDiff({ key: diffKey, loading: true, error: "", text: "" });
    api(url + "/diff?from=base").then(
      (d) => live && setDiff({ key: diffKey, loading: false, error: "", text: d.diff || "" }),
      (e) => { if (live) { setDiff({ key: diffKey, loading: false, error: e.message, text: "" }); if (e.status === 401) onSignedOut(); } });
    return () => { live = false; };
  }, [tab, diffKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every project action reports its outcome in the note under the buttons; a busy project (409) is not an error.
  async function act(name, action) {
    setWorking(name);
    setNote(null);
    try {
      setNote(await action());
    } catch (e) {
      setNote(e.status === 409
        ? { tone: "amber", text: "Project is busy. A run is active on " + p.display_name + "; try again when it finishes." }
        : { tone: "rose", text: e.message });
      if (e.status === 401) onSignedOut(); // GitHub no longer accepts the sign-in: back to the login page
    }
    setWorking("");
  }

  const openRun = (item) => act("run", async () => { setView({ item, run: await api(url + "/runs/" + encodeURIComponent(item.run_id)) }); return null; });
  const rebuild = () => act("env", async () => {
    await api(url + "/venv", { method: "DELETE" });
    onChanged();
    return { tone: "slate", text: "Environment removed. The next run builds a fresh one." };
  });
  const sync = () => act("sync", async () => {
    const s = await post(url + "/sync");
    onChanged();
    if (s.status === "conflict") return { tone: "amber", text: "Not synced: upstream conflicts with the project's changes. Nothing was changed. Conflicting files:", list: s.conflicts || [] };
    return s.status === "ok" ? { tone: "emerald", text: "Synced with upstream." } : { tone: "slate", text: "This project has no upstream to sync with." };
  });
  // Export writes a patch file; writing into the user's own folder is a second, explicit step.
  const runExport = (intoFolder) => act("export", async () => {
    const out = await post(url + "/export", intoFolder ? { confirm: true } : {});
    return out.written_to ? { tone: "emerald", text: "Changes written to " + out.written_to }
      : { tone: "emerald", text: "Patch file written: " + out.patch_path, canWrite: true };
  });
  const writeIntoFolder = () => setConfirm({
    title: "Write changes into your folder?", body: "Files in " + p.source + " will be changed.", label: "Write changes", danger: true,
    onConfirm: () => runExport(true),
  });
  // Asks first: a pull request notifies another person.
  const openPr = () => setConfirm({
    title: "Open or update the pull request?",
    body: "The repository owner of " + p.display_name + " will be notified, under your GitHub account.",
    label: p.pr_url ? "Update PR" : "Open PR",
    onConfirm: () => act("pr", async () => {
      const out = await post(url + "/pr");
      onChanged();
      return { tone: "emerald", text: "Pull request:", url: out.url };
    }),
  });

  // Menu items close the popover first, then act.
  const fromMenu = (fn) => () => { menu.current?.hidePopover(); fn(); };
  function placeMenu(e) {
    if (e.newState !== "open" || !menuBtn.current) return;
    const r = menuBtn.current.getBoundingClientRect();
    Object.assign(menu.current.style, { top: r.bottom + 4 + "px", left: Math.max(8, r.right - 224) + "px", right: "auto", bottom: "auto" });
  }

  function onTabKey(e) {
    const i = TABS.indexOf(tab);
    const next = { ArrowRight: (i + 1) % 3, ArrowLeft: (i + 2) % 3, Home: 0, End: 2 }[e.key];
    if (next == null) return;
    e.preventDefault();
    setTab(TABS[next]);
    tabRefs.current[TABS[next]]?.focus();
  }

  if (view && view.run) {
    return (
      <RunView stored run={view.run} busy={false} steps={view.run.steps || []} elapsed={view.run.duration_s ?? view.item.duration_s ?? null}
               head="" project={p} task={view.item.task} taskType={view.item.mode} repoLabel={p.display_name}
               onBack={() => setView(null)} backLabel="Back to project" />
    );
  }

  const ahead = p.changes_ahead_of_base;
  const tiles = [
    ["Branch", p.branch, "text-ink"],
    ["Head", short(p.head_sha), "text-gold"],
    ["Ahead of base", plural(ahead, "change"), ahead > 0 ? "text-gold" : "text-ink"],
    ["Environment", env.state === "ready" ? "ready" + (env.python ? " · py" + env.python : "") : env.state === "evicted" ? "evicted" : "not built yet",
      env.state === "ready" ? "text-ok" : env.state === "evicted" ? "text-warn" : "text-ink"],
    ["Locked tests", tests.total + " (" + tests.added_by_runs + " added by runs)", "text-ink"],
  ];
  // Real facts only, joined with decorative "::" separators.
  const facts = [
    [p.branch, "text-accent-fg"],
    ["head " + short(p.head_sha), "text-gold"],
    [plural(ahead, "change") + " ahead", "text-ink"],
  ];
  const tabLabel = { history: "History", changes: "Changes", activity: "Activity" };
  const tabCount = { history: p.runs ? p.runs.length : null, changes: null, activity: events.length };
  const spin = (name) => working === name && <Spinner className="text-base" />;

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <section aria-labelledby="view-title" className={CARD + " p-5 sm:p-6 min-w-0"}>
        <p className={LABEL + " flex items-center gap-1.5"}><Icon name="folder_open" className="text-base text-accent-fg" />Project</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
          <h1 id="view-title" tabIndex={-1} className="min-w-0 break-words font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">{p.display_name}</h1>
          <KindBadge kind={p.kind} />
        </div>
        <p className="mt-1 font-mono text-xs text-ink-3 break-words">
          {local ? "Snapshot of " + p.source + " · your original folder is unchanged" : p.source}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
          {facts.map(([text, tone], i) => (
            <span key={i} className="inline-flex items-center gap-2 min-w-0">
              {i > 0 && <span aria-hidden="true" className="text-ink-3">::</span>}
              <span className={"break-all " + tone}>{text}</span>
            </span>
          ))}
        </p>

        {/* command matrix: primary action red, the rest telemetry buttons */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {local ? (
            <button type="button" disabled={disabled} onClick={() => runExport(false)} className={button("primary")}>
              {spin("export") || <Icon name="download" className="text-base" />}Export patch
            </button>
          ) : (
            <>
              <button type="button" disabled={disabled} onClick={openPr} className={button("primary")}>
                {spin("pr") || <Icon name="merge" className="text-base" />}{p.pr_url ? "Update PR" : "Open PR"}
              </button>
              <button type="button" disabled={disabled} onClick={sync} className={button("secondary")}>
                {spin("sync") || <Icon name="sync" className="text-base" />}Sync with upstream
              </button>
              {isHttps(p.pr_url) && <a href={p.pr_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-accent-fg underline underline-offset-4">View pull request<Icon name="open_in_new" className="text-base" /></a>}
            </>
          )}
          <button ref={menuBtn} type="button" popoverTarget={menuId} aria-haspopup="menu" aria-label="More project actions" className={button("secondary")}>
            {spin("env") || <Icon name="more_horiz" className="text-base" />}More
          </button>
          <div ref={menu} id={menuId} popover="auto" role="menu" onToggle={placeMenu}
               className="m-0 fixed bg-raised border border-line rounded-sm p-1 w-56 shadow-aura text-ink">
            <button type="button" role="menuitem" disabled={disabled || !p.runs} onClick={fromMenu(() => setDialog("reset"))} className={MENU_ITEM + " text-ink enabled:hover:text-accent-fg"}>
              <Icon name="history" className="text-base" />Reset to…
            </button>
            <button type="button" role="menuitem" disabled={disabled} onClick={fromMenu(rebuild)} className={MENU_ITEM + " text-ink enabled:hover:text-accent-fg"}>
              <Icon name="build" className="text-base" />Rebuild environment
            </button>
            <div role="separator" className="my-1 border-t border-line" />
            <button type="button" role="menuitem" disabled={disabled} onClick={fromMenu(() => setDialog("delete"))} className={MENU_ITEM + " text-bad"}>
              <Icon name="delete" className="text-base" />Delete project
            </button>
          </div>
        </div>

        {p.busy && (
          <Notice tone="warn" title="A run is in progress on this project." className="mt-4">
            <button type="button" onClick={onWatch} className={button("secondary", "sm") + " mt-2"}>Show live run</button>
          </Notice>
        )}
        {note && (
          <Notice tone={TONE[note.tone] || "info"} onDismiss={() => setNote(null)} className="mt-4">
            <span>{note.text}</span>
            {note.url && <> {isHttps(note.url)
              ? <a href={note.url} target="_blank" rel="noopener noreferrer" className="underline font-medium text-accent-fg">{note.url}</a> : note.url}</>}
            {note.list && <ul className="mt-1.5 font-mono text-xs list-disc pl-5">{note.list.map((item) => <li key={item}>{String(item)}</li>)}</ul>}
            {note.canWrite && (
              <button type="button" disabled={disabled} onClick={writeIntoFolder} className={button("secondary", "sm") + " mt-2 block"}>Write into the original folder…</button>
            )}
          </Notice>
        )}
      </section>

      <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {tiles.map(([label, value, tone]) => (
          <Stat key={label} label={label} tone={tone}>{value}</Stat>
        ))}
      </dl>

      <section aria-labelledby="compose-title" className={CARD_CORNERS + " hud-corners-red p-5 sm:p-6 min-w-0"}>
        <PanelTitle id="compose-title" icon="terminal" className="mb-4">Run a new task</PanelTitle>
        {composer}
      </section>

      <section className={CARD + " min-w-0"}>
        <div role="tablist" aria-label="Project details" onKeyDown={onTabKey} className="flex flex-wrap gap-1 border-b border-line px-3 pt-2">
          {TABS.map((t) => (
            <button key={t} ref={(el) => (tabRefs.current[t] = el)} type="button" role="tab" id={"tab-" + t} aria-selected={tab === t} aria-controls={"panel-" + t}
                    tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)}
                    className={TAB + (tab === t ? "border-accent-fg bg-raised text-ink" : "border-transparent text-ink-3 hover:text-ink hover:bg-raised/50")}>
              {tabLabel[t]}
              {tabCount[t] != null && <span className="text-gold">{tabCount[t]}</span>}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="panel-history" aria-labelledby="tab-history" hidden={tab !== "history"} className="p-5 sm:p-6">
          {!p.runs ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" />
            </div>
          ) : !p.runs.length ? <p className="text-sm text-ink-3">No runs yet. Describe a task above to start one.</p> : (
            <ol ref={history} className="flex flex-col gap-2">
              {p.runs.map((r) => (
                <li key={r.run_id} className={ROW + "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"}>
                  <StatusPill status={r.status} />
                  <button type="button" title="Show this run's stored result" disabled={r.status === "running" || !!working} onClick={() => openRun(r)}
                          className="group flex-1 min-w-[12rem] text-left rounded-sm disabled:cursor-not-allowed">
                    <span className="block font-mono text-sm text-ink truncate group-enabled:group-hover:text-accent-fg">
                      <span className="text-gold">RUN {r.run_id}</span><span aria-hidden="true" className="text-ink-3"> :: </span>{r.task}
                    </span>
                    <span className="block mt-0.5 font-mono text-xs text-ink-3 break-words">{runMeta(r)}</span>
                  </button>
                  {r.status === "running"
                    ? <button type="button" onClick={onWatch} className={button("secondary", "sm")}>Show live</button>
                    : <button type="button" onClick={() => onRerun(r)} aria-label={"Re-run task: " + r.task} className={button("secondary", "sm")}>
                        <Icon name="replay" className="text-base" />Re-run
                      </button>}
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 border-t border-line pt-3 font-mono text-xs text-ink-3 break-words">
            {["base", p.base_label || p.base_ref, short(p.base_sha)].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div role="tabpanel" id="panel-changes" aria-labelledby="tab-changes" hidden={tab !== "changes"} className="p-5 sm:p-6">
          {tab === "changes" && (diff.loading || diff.key !== diffKey ? (
            <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-40" /></div>
          ) : diff.error ? <Notice tone="bad">{diff.error}</Notice> : (
            <>
              <p className="mb-3 font-mono text-xs text-ink-2 break-words">
                base <span className="text-gold">{short(p.base_sha)}</span> → head <span className="text-gold">{short(p.head_sha)}</span> · {plural(p.changes_ahead_of_base, "change")}
              </p>
              {diff.text.trim() ? <Changes r={{ diff: diff.text }} /> : <p className="text-sm text-ink-3">No changes ahead of base.</p>}
            </>
          ))}
        </div>

        <div role="tabpanel" id="panel-activity" aria-labelledby="tab-activity" hidden={tab !== "activity"} className="p-5 sm:p-6">
          {events.length ? ( // resets, syncs and exports are not runs: they are listed here
            <ul aria-label="Project events" className="flex flex-col gap-2 font-mono text-xs text-ink-2">
              {events.map((e, i) => (
                <li key={i} className={ROW + "px-3 py-2 break-words"}>
                  <code className="font-semibold text-gold">{e.kind}</code>
                  {[e.detail, ago(e.at)].filter(Boolean).map((t, j) => <span key={j}><span aria-hidden="true" className="text-ink-3"> :: </span>{t}</span>)}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-3">No resets, syncs or exports yet.</p>}
        </div>
      </section>

      {confirm && (
        <ConfirmDialog title={confirm.title} confirmLabel={confirm.label} danger={confirm.danger} onConfirm={confirm.onConfirm} onClose={() => setConfirm(null)}>
          <p>{confirm.body}</p>
        </ConfirmDialog>
      )}
      {dialog === "reset" && p.runs && ( // the choices come from the run history
        <ResetDialog p={p} url={url} onClose={() => setDialog("")}
                     onDone={(out) => { onChanged(); setNote({ tone: "emerald", text: "Project reset to " + short(out.head_sha) + ". The previous head is kept as " + out.archive_tag + "." }); }} />
      )}
      {dialog === "delete" && <DeleteDialog p={p} url={url} onClose={() => setDialog("")} onDone={onDeleted} />}
    </div>
  );
}
