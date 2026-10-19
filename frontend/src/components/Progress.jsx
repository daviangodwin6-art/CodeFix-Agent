import { useRef } from "react";
import { animate, utils } from "animejs";
import { finished } from "../api.js";
import { enter, pop, useAnime, useChanged } from "../motion.jsx";
import { CARD, duration, Icon, plural, short, Spinner } from "./ui.jsx";

const envReused = (step) => step.name === "environment" && step.status === "ok" && /reused/i.test(step.detail || "");

// How one step is drawn. A rejected attempt that was followed by another attempt is a "retry", not a failure.
function look(step, retried) {
  if (envReused(step)) return { icon: "check", node: "bg-ok/10 border-ok/30 text-ok", title: "text-ink", side: "text-ok font-medium", label: "done" };
  if (step.status === "ok") return { icon: "check", node: "bg-ok/10 border-ok/30 text-ok", title: "text-ink", side: "text-ink-3", label: "done" };
  if (step.status === "running") return { spin: true, node: "border-accent-fg text-accent-fg pulse-ring", title: "text-accent-fg font-medium", side: "text-accent-fg", tag: "running…", label: "running" };
  if (step.status === "error" && retried) return { icon: "warning", node: "bg-warn/10 border-warn/30 text-warn", title: "text-warn", side: "text-warn", tag: "retry", label: "retry" };
  if (step.status === "error") return { icon: "close", node: "bg-bad/10 border-bad/30 text-bad", title: "text-bad", side: "text-bad", tag: "failed", label: "failed" };
  return { node: "border-line-strong text-ink-3", title: "text-ink-3", side: "text-ink-3", tag: "pending", label: "pending" };
}

// Vertical timeline of the run's steps.
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
    <section aria-labelledby="steps-title" className={CARD + " p-5 min-w-0 xl:sticky xl:top-20"}>
      <h2 id="steps-title" className="text-base font-semibold text-ink mb-4">Steps</h2>
      <ol ref={list}>
        {steps.map((s, i) => {
          const retried = !finished(run) || steps.slice(i + 1).some((later) => later.status !== "pending");
          const v = look(s, retried);
          const detail = s.detail || "";
          const inline = s.status === "ok" && detail.length <= 24; // short details sit on the right, long ones wrap below
          const side = v.tag || [inline && detail, duration(s.duration_s)].filter(Boolean).join(" · ");
          const last = i === steps.length - 1;
          return (
            <li key={i} aria-current={s.status === "running" ? "step" : undefined} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span data-node className={"w-6 h-6 rounded-full border flex items-center justify-center shrink-0 " + v.node}>
                  {v.icon ? <Icon name={v.icon} className="text-base" /> : v.spin ? <Spinner className="text-base" /> : null}
                </span>
                {!last && <span aria-hidden="true" className="w-px flex-1 bg-line my-1 min-h-3" />}
              </div>
              <div className={"min-w-0 flex-1 " + (last ? "" : "pb-3")}>
                <div className="flex items-center justify-between gap-3 min-h-6">
                  <span className={"font-mono text-sm break-words min-w-0 " + v.title}>
                    {i + 1}. {s.name}<span className="sr-only"> ({v.label})</span>
                  </span>
                  {side && <span className={"text-xs shrink-0 " + v.side}>{side}</span>}
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
    <section aria-labelledby="builds-title" className={CARD + " p-5 min-w-0"}>
      <h2 id="builds-title" className="text-base font-semibold text-ink">What this run builds on</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-ink-3">{label}</dt>
            <dd className={"mt-0.5 font-mono text-sm break-words " + (tone || "text-ink")}>{value || "…"}</dd>
          </div>
        ))}
      </dl>
      {head && (
        <p className="mt-4 rounded-lg border border-line bg-raised px-3.5 py-3 text-sm text-ink-2">
          If this run fails, the project goes back to {short(head)}. Nothing half-applied is kept.
        </p>
      )}
    </section>
  );
}
