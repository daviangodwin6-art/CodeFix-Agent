import { useRef, useState } from "react";
import { enter, useAnime } from "../motion.jsx";
import { ago, button, FIELD, Icon, KindBadge, plural, Skeleton, Spinner } from "./ui.jsx";

function Row({ p, active, onSelect }) {
  const env = p.env || {};
  const last = p.last_run;
  const failed = !!last && (last.status === "failed" || last.status === "env_failed");
  const meta = [p.branch, plural(p.changes_ahead_of_base, "change"), plural(p.run_count, "run"),
    p.busy ? "busy" : last && last.finished_at ? ago(last.finished_at) : ""].filter(Boolean).join(" · ");
  return (
    <li>
      <button type="button" aria-current={active ? "page" : undefined} onClick={() => onSelect(p)}
              className={"w-full text-left rounded-md border-l-2 px-3 py-2 transition-colors " +
                (active ? "bg-raised border-accent-fg" : "border-transparent hover:bg-raised")}>
        <span className="flex items-center gap-2 min-w-0">
          {p.busy ? <Spinner className="text-base text-accent-fg shrink-0" />
            : <span aria-hidden="true" className={"w-2 h-2 rounded-full shrink-0 " + (failed ? "bg-bad" : last ? "bg-ok" : "bg-line-strong")}></span>}
          <span className="sr-only">{p.busy ? "Run in progress:" : failed ? "Last run failed:" : last ? "Last run succeeded:" : "No runs yet:"}</span>
          <span className="text-sm font-medium text-ink truncate">{p.display_name}</span>
          <KindBadge kind={p.kind} />
          <span className={"ml-auto pl-1 text-xs whitespace-nowrap " + (p.busy ? "text-accent-fg" : env.state === "ready" ? "text-ok" : "text-ink-3")}>
            {p.busy ? "running…" : env.state === "ready" ? "env ready" : "env " + (env.state || "missing")}
          </span>
        </span>
        <span className="block mt-1 font-mono text-xs text-ink-3 truncate">{meta}</span>
      </button>
    </li>
  );
}

// `projects` is null while loading.
export default function Projects({ projects, activeId, homeActive, signedIn, onSelect, onNew, onSignIn }) {
  const [q, setQ] = useState("");
  const all = projects || [];
  const needle = q.trim().toLowerCase();
  const list = needle ? all.filter((p) => (p.display_name + " " + (p.source || "")).toLowerCase().includes(needle)) : all;
  const rows = useRef(null);
  useAnime(rows, () => enter(rows.current.children, { y: [8, 0] }), [list.length]);
  return (
    <div className="p-3 flex flex-col gap-3 lg:h-full lg:overflow-y-auto">
      <button type="button" onClick={onNew} aria-current={homeActive ? "page" : undefined}
              className={button("secondary", "md") + " w-full " + (homeActive ? "!border-accent-fg" : "")}>
        <Icon name="add" className="text-lg" /> New run
      </button>

      <div className="flex items-center gap-2 px-1">
        <h2 id="projects-title" className="text-xs font-semibold uppercase tracking-wide text-ink-2">Projects</h2>
        {projects && <span className="font-mono text-xs text-ink-3">{all.length}</span>}
      </div>

      {all.length > 4 && (
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter projects"
               placeholder="Filter projects" className={FIELD + " !h-9"} />
      )}

      {!projects ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading projects">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : !all.length ? (
        <div className="px-2 py-6 text-center">
          <p className="text-sm font-medium text-ink">No projects yet</p>
          <p className="mt-1 text-sm text-ink-2">Your first run creates one.</p>
        </div>
      ) : !list.length ? (
        <p className="px-2 py-4 text-sm text-ink-2">No matching projects</p>
      ) : (
        <ul ref={rows} aria-labelledby="projects-title" className="flex flex-col gap-1 max-h-64 overflow-y-auto lg:max-h-none lg:overflow-visible">
          {list.map((p) => <Row key={p.project_id} p={p} active={p.project_id === activeId} onSelect={onSelect} />)}
        </ul>
      )}

      {!signedIn && (
        <div className="rounded-lg border border-line bg-raised p-3">
          <p className="text-sm text-ink-2">Signed out: only local projects are shown.</p>
          <button type="button" onClick={onSignIn} className={button("primary", "sm") + " mt-2"}>Sign in with GitHub</button>
        </div>
      )}
    </div>
  );
}
