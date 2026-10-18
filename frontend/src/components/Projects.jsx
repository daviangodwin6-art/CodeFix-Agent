import { useRef } from "react";
import { enter, useAnime } from "../motion.jsx";
import { ago, CARD, Icon, KindBadge, plural, PRIMARY } from "./ui.jsx";

function Row({ p, active, compact, onSelect }) {
  const env = p.env || {};
  const last = p.last_run;
  const failed = !!last && (last.status === "failed" || last.status === "env_failed");
  const [envText, envTone] = p.busy ? ["running…", "text-blue-400"]
    : env.state === "ready" ? ["env ready", "text-emerald-300"] : ["env " + (env.state || "missing"), "text-slate-400"];
  const meta = [p.branch, plural(p.changes_ahead_of_base, "change"), plural(p.run_count, "run"),
    p.busy ? "busy" : last && last.finished_at ? ago(last.finished_at) : ""].filter(Boolean).join(" · ");
  return (
    <li>
      <button type="button" aria-current={active ? "true" : undefined} onClick={() => onSelect(p)}
              className={"lift w-full text-left rounded-lg border px-4 py-3.5 transition-colors " +
                (active ? "bg-blue-500/10 border-blue-500" : "bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.03]")}>
        <span className="flex items-center gap-2.5 min-w-0">
          {p.busy ? <Icon name="progress_activity" className="animate-spin text-[17px] text-blue-400 shrink-0" />
            : <span className={"w-2.5 h-2.5 rounded-full shrink-0 " + (failed ? "bg-rose-600" : last ? "bg-emerald-600" : "bg-white/[0.12]")}></span>}
          <span className="sr-only">{p.busy ? "Run in progress:" : failed ? "Last run failed:" : last ? "Last run succeeded:" : "No runs yet:"}</span>
          <span className="font-semibold text-[15.5px] text-slate-50 truncate">{p.display_name}</span>
          <KindBadge kind={p.kind} />
          <span className={"ml-auto pl-2 font-mono text-[12.5px] whitespace-nowrap " + envTone}>{envText}</span>
        </span>
        {!compact && <span className="block mt-1.5 font-mono text-[12.5px] text-slate-400 truncate">{meta}</span>}
      </button>
    </li>
  );
}

// `projects` is null while loading. `compact` (while a run is on screen) drops the count and the meta lines.
export default function Projects({ projects, activeId, compact, signedIn, onSelect, onSignIn }) {
  const list = projects || [];
  const rows = useRef(null);
  useAnime(rows, () => enter(rows.current.children, { y: [8, 0] }), [list.length]);
  return (
    <section aria-labelledby="projects-title" className={CARD + " p-[22px]" + (compact ? "" : " flex-1")}>
      <div className="flex items-center gap-2.5 mb-4">
        {!compact && <Icon name="folder" className="text-[20px] text-blue-400" />}
        <h2 id="projects-title" className="font-semibold text-[16.5px] text-slate-50">Projects</h2>
        {!compact && projects && <span className="font-mono text-[12px] bg-white/[0.06] text-slate-400 px-2 py-0.5 rounded-full">{list.length}</span>}
        {!compact && list.length > 1 && <span className="ml-auto text-[13px] text-slate-400">Newest activity first</span>}
      </div>

      {!projects ? <p className="text-[13.5px] text-slate-400">Loading projects…</p> : !list.length ? (
        <div className="border border-dashed border-white/[0.14] rounded-xl px-6 py-14 flex flex-col items-center text-center">
          <Icon name="create_new_folder" className="text-[40px] text-blue-400" />
          <h3 className="mt-3 font-semibold text-[16px] text-slate-50">No projects yet</h3>
          <p className="mt-2 text-[14px] text-slate-400 leading-relaxed max-w-[300px]">
            Run a repair and the project will appear here, with its own environment and history.
          </p>
        </div>
      ) : (
        <ul ref={rows} className="flex flex-col gap-3.5">
          {list.map((p) => <Row key={p.project_id} p={p} active={p.project_id === activeId} compact={compact} onSelect={onSelect} />)}
        </ul>
      )}

      {!signedIn && (
        <div className="mt-3.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="text-[14px] text-slate-400 leading-relaxed">Signed out: only local projects are shown. Sign in to see your GitHub projects.</p>
          <button type="button" onClick={onSignIn} className={PRIMARY + " mt-3"}>Sign in with GitHub</button>
        </div>
      )}
    </section>
  );
}
