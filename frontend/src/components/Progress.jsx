import { useRef } from "react";
import { animate, utils } from "animejs";
import { finished } from "../api.js";
import { enter, pop, useAnime, useChanged } from "../motion.jsx";
import { CARD, CARD_CORNERS, duration, Icon, PanelTitle, plural, short, Spinner, Stat } from "./ui.jsx";

const envReused = (step) => step.name === "environment" && step.status === "ok" && /reused/i.test(step.detail || "");

const NODE = "w-6 h-6 rounded-sm border flex items-center justify-center shrink-0 ";
// How one step is drawn. A rejected attempt that was followed by another attempt is a "retry", not a failure.
function look(step, retried) {
  if (envReused(step)) return { icon: "check", node: NODE + "bg-ok/10 border-ok/40 text-ok", title: "text-ink", side: "text-ok", label: "done" };
  if (step.status === "ok") return { icon: "check", node: NODE + "bg-ok/10 border-ok/40 text-ok", title: "text-ink", side: "text-ink-2", label: "done" };
  // motion: a scanline sweeping across the running row would go here
  if (step.status === "running") return { spin: true, node: NODE + "bg-accent-fg/10 border-accent-fg text-accent-fg shadow-glow-cyan pulse-ring", title: "text-ink font-semibold", side: "text-accent-fg", tag: "running…", label: "running", row: "bg-raised border-l-accent" };
  if (step.status === "error" && retried) return { icon: "warning", node: NODE + "bg-warn/10 border-warn/40 text-warn", title: "text-warn", side: "text-warn", tag: "retry", label: "retry" };
  if (step.status === "error") return { icon: "close", node: NODE + "bg-bad/10 border-bad/40 text-bad", title: "text-bad", side: "text-bad", tag: "failed", label: "failed" };
  return { node: NODE + "border-line-strong text-ink-3", title: "text-ink-3", side: "text-ink-3", tag: "pending", label: "pending" };
}

// "Execution sequence": numbered rows, mono state text on the right, red rail + cyan pip on the running one.
export function Steps({ run, steps }) {
  const list = useRef(null);
  const { first, changed, key } = useChanged(steps.map((s) => s.name + s.status));
  useAnime(list, () => {
    const rows = [...list.current.children];
    if (first) return enter(rows, { y: [10, 0], delay: (el, i) => 150 + i * 40 });
    const moved = changed.map((i) => rows[i]).filter(Boolean); // a step started, passed or failed
    if (!moved.length) return;
    animate(moved, { opacity: [0.3, 1], duration: 500, ease: "outExpo", onComplete: (a) => utils.cleanInlineStyles(a) });
    pop(moved.map((row) => row.querySelector("[data-node]")));
  }, [key]);

  return (
    <section aria-labelledby="steps-title" className={CARD + " p-4 sm:p-5 min-w-0 xl:sticky xl:top-20"}>
      <PanelTitle icon="account_tree" id="steps-title" meta={plural(steps.length, "step")} className="mb-4">Execution sequence</PanelTitle>
      <ol ref={list} className="flex flex-col gap-1">
        {steps.map((s, i) => {
          const retried = !finished(run) || steps.slice(i + 1).some((later) => later.status !== "pending");
          const v = look(s, retried);
          const detail = s.detail || "";
          const inline = s.status === "ok" && detail.length <= 24; // short details sit on the right, long ones wrap below
          const side = v.tag || [inline && detail, duration(s.duration_s)].filter(Boolean).join(" · ");
          return (
            <li key={i} aria-current={s.status === "running" ? "step" : undefined}
                className={"flex items-start gap-3 rounded-sm border border-transparent border-l-2 px-2.5 py-2 " + (v.row || "border-l-transparent")}>
              <span data-node className={v.node}>
                {v.icon ? <Icon name={v.icon} className="text-base" /> : v.spin ? <Spinner className="text-base" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 min-h-6">
                  <span className={"font-mono text-xs uppercase tracking-[0.06em] break-words min-w-0 " + v.title}>
                    {String(i + 1).padStart(2, "0")}. {s.name}<span className="sr-only"> ({v.label})</span>
                  </span>
                  {side && <span className={"ml-auto text-right font-mono text-xs uppercase tracking-[0.08em] " + v.side}>{side}</span>}
                </div>
                {detail && !inline && <p className={"text-xs mt-0.5 break-words " + (s.status === "error" ? v.side : "text-ink-2")}>{detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// What the project already holds, and what happens if the run fails.
export function BuildsOn({ project: p, run }) {
  const result = (run && run.result) || {};
  const head = result.head_before || (p && p.head_sha);
  const wins = p && p.runs ? p.runs.filter((r) => r.status === "success").length : null;
  const envStep = ((run && run.steps) || []).find((s) => s.name === "environment" && (s.status === "ok" || s.status === "error"));
  const env = result.env_status
    ? [result.env_status, result.env_reason || (result.env_status === "reused" ? "deps unchanged" : "")].filter(Boolean).join(" · ")
    : envStep ? envStep.detail : "";
  const rows = [
    ["Project head", [short(head), p && p.branch].filter(Boolean).join(" · ")],
    ["Earlier changes kept", p ? plural(p.changes_ahead_of_base, "commit") + (wins === null ? "" : " from " + plural(wins, "successful run")) : ""],
    ["Locked tests", p && p.locked_tests ? p.locked_tests.total + " (" + p.locked_tests.added_by_runs + " added by earlier runs)" : ""],
    ["Environment", env || "checking…", /reused/i.test(env) ? "text-ok" : env ? "text-ink" : "text-ink-3"],
  ];
  return (
    <section aria-labelledby="builds-title" className={CARD_CORNERS + " p-4 sm:p-5 min-w-0"}>
      <PanelTitle icon="layers" id="builds-title" meta={head && "HEAD " + short(head)}>What this run builds on</PanelTitle>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value, tone]) => <Stat key={label} label={label} tone={tone}>{value || "…"}</Stat>)}
      </dl>
      {head && (
        <p className="hud-well mt-3 px-3.5 py-3 text-sm text-ink-2">
          If this run fails, the project goes back to {short(head)}. Nothing half-applied is kept.
        </p>
      )}
    </section>
  );
}
