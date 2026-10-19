import { useMemo, useRef, useState } from "react";
import { animate, utils } from "animejs";
import { finished, isHttps } from "../api.js";
import { CountUp, enter, pop, useAnime } from "../motion.jsx";
import { BuildsOn, Steps } from "./Progress.jsx";
import { button, CARD, CARD_CORNERS, Copy, duration, Icon, LABEL, Notice, PanelTitle, plural, Ring, short, Spinner, Stat, StatusPill } from "./ui.jsx";

// Unified diff -> [{ path, add, del, lines: [{ kind: "hunk" | "add" | "del" | "ctx", no, text }] }]
export function parseDiff(diff) {
  const files = [];
  let file = null, oldNo = 0, newNo = 0;
  for (const line of (diff || "").split("\n")) {
    const head = /^diff --git a\/.* b\/(.*)$/.exec(line);
    if (head) { files.push(file = { path: head[1], add: 0, del: 0, lines: [] }); continue; }
    if (!file) continue;
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) { oldNo = Number(hunk[1]); newNo = Number(hunk[2]); file.lines.push({ kind: "hunk", text: line }); continue; }
    if (!file.lines.length || line.startsWith("\\")) continue; // file header lines, "\ No newline at end of file"
    if (line.startsWith("+")) { file.add++; file.lines.push({ kind: "add", no: newNo++, text: line.slice(1) }); }
    else if (line.startsWith("-")) { file.del++; file.lines.push({ kind: "del", no: oldNo++, text: line.slice(1) }); }
    else { file.lines.push({ kind: "ctx", no: newNo++, text: line.slice(1) }); oldNo++; }
  }
  return files;
}

const CHIP = "inline-flex items-center gap-1.5 rounded-sm border px-2 h-6 font-mono text-xs font-semibold uppercase tracking-[0.08em] whitespace-nowrap ";
const TONE = {
  ok: "text-ok border-ok/40 bg-ok/10",
  bad: "text-bad border-bad/40 bg-bad/10",
  warn: "text-warn border-warn/40 bg-warn/10",
  gold: "text-gold border-gold/40 bg-gold/10",
  dim: "text-ink-2 border-line-strong bg-raised",
};
const BANNER = {
  success: { fg: "text-ok", tone: TONE.ok, icon: "verified", chip: "Change committed" },
  failed: { fg: "text-bad", tone: TONE.bad, icon: "cancel", chip: "Working copy reverted" },
  env_failed: { fg: "text-warn", tone: TONE.warn, icon: "build_circle", chip: "Run halted" },
};
const FINAL = { success: "Succeeded", failed: "Failed", env_failed: "Environment setup failed" };

// Panel with a PanelTitle row; `id` names the heading for aria-labelledby.
function Section({ icon, title, meta, id, className = "", children }) {
  return (
    <section aria-labelledby={id} className={CARD + " p-4 sm:p-5 min-w-0 " + className}>
      <PanelTitle as="h3" icon={icon} id={id} meta={meta}>{title}</PanelTitle>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// Outcome headline + chips, then telemetry tiles from the run's real result.
function Banner({ run, elapsed }) {
  const r = run.result;
  const b = BANNER[run.status] || BANNER.failed;
  const feature = r.task_type === "feature";
  const title = run.status === "success" ? (feature ? "Feature added" : "Repair completed")
    : run.status === "env_failed" ? "Environment setup failed" : (feature ? "Feature run failed" : "Repair failed");
  const text = run.status === "success"
    ? "Done in " + plural(r.attempts, "attempt") + " • " + plural(r.regressions.length, "regression") + " • " + r.after.passed + " of " + r.after.total + " tests passing"
    : run.status === "env_failed" ? "The virtual environment, the dependency install or pytest itself could not run."
    : "No acceptable change after " + plural(r.attempts, "attempt") + ". Nothing was committed.";
  const files = useMemo(() => Array.isArray(r.files_changed) ? r.files_changed.length : r.diff ? parseDiff(r.diff).length : null, [r.files_changed, r.diff]);
  const tests = run.status !== "env_failed" && r.baseline.passed != null && r.after.passed != null;
  const afterRan = r.after.total > 0; // a run that stopped before the after-patch tests reports 0 of 0
  const bad = tests && r.after.failed > 0;
  return (
    <section aria-label="Outcome" className={CARD_CORNERS + " p-4 sm:p-5 min-w-0"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={CHIP + b.tone}><Icon name={b.icon} fill className="text-sm" />{FINAL[run.status] || run.status}</span>
        <span className={CHIP + TONE.dim}>{b.chip}</span>
      </div>
      <div className="mt-3 flex items-start gap-3">
        <span data-pop className={"shrink-0 " + b.fg}><Icon name={b.icon} fill className="text-4xl" /></span>
        <div className="min-w-0 flex-1">
          <p className={"font-display text-2xl sm:text-3xl font-bold uppercase tracking-tight break-words " + b.fg}>{title}</p>
          <p className="text-sm text-ink-2 mt-1 break-words">{text}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {elapsed != null && <Stat label="Duration">{duration(elapsed)}</Stat>}
        {tests && <Stat label="Tests passing" tone={!afterRan ? "text-ink-2" : bad ? "text-bad" : "text-ok"}>{r.baseline.passed} → {afterRan ? <>{r.after.passed}{r.after.total != null && " of " + r.after.total}</> : "not run"}</Stat>}
        {files != null && <Stat label="Files changed">{files}</Stat>}
        <Stat label="Attempts">{r.attempts}</Stat>
        {r.commit_sha && (
          <Stat label="Commit">
            <span className="flex items-center justify-between gap-1"><span title={r.commit_sha}>{short(r.commit_sha)}</span><Copy text={r.commit_sha} /></span>
          </Stat>
        )}
      </dl>
    </section>
  );
}

function TestMatrix({ r }) {
  const gained = (r.after.passed || 0) - (r.baseline.passed || 0);
  const rows = [["Passed", "passed"], ["Failed", "failed"], ["Total runs", "total"]];
  const failed = r.after.failed > 0;
  const ran = r.after.total > 0; // tests never ran after the patch: show it, don't colour 0 as a pass
  const cell = (value, tone, icon) => (
    <span className={"inline-flex items-center gap-1 " + tone}>
      {icon && <Icon name={icon} className="text-base" />}<CountUp value={value} />
    </span>
  );
  return (
    <Section id="matrix-title" icon="bug_report" title="Test results" meta="pytest">
      <div className="hud-well p-3 overflow-x-auto">
        <table className="w-full text-left font-mono text-sm">
          <caption className="sr-only">Test counts before and after the change</caption>
          <thead>
            <tr className={LABEL}>
              <th scope="col" className="py-1 pr-3 font-semibold">Metric</th>
              <th scope="col" className="py-1 pr-3 font-semibold">Before</th>
              <th scope="col" className="py-1 font-semibold">After patch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-ink-2">
            {rows.map(([label, key]) => (
              <tr key={key}>
                <th scope="row" className="py-2 pr-3 font-medium">{label}</th>
                <td className="py-2 pr-3 tabular-nums">
                  {cell(r.baseline[key], key === "failed" && r.baseline.failed > 0 ? "text-bad font-semibold" : "text-ink-2", key === "failed" && r.baseline.failed > 0 ? "cancel" : null)}
                </td>
                <td className="py-2 tabular-nums">
                  {ran ? <>
                    {cell(r.after[key], key === "passed" ? "text-ok font-semibold" : key === "failed" && failed ? "text-bad font-semibold" : "text-ink",
                      key === "passed" ? "check_circle" : key === "failed" && failed ? "cancel" : null)}
                    {key === "passed" && <span className="text-ok"> Passed{gained > 0 && " (+" + gained + ")"}</span>}
                  </> : <span className="text-ink-3">not run</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={"mt-2 border-t border-line pt-2 text-xs font-mono " + (!ran ? "text-ink-2" : failed ? "text-bad" : "text-ok")}>
          {!ran ? "==== after-patch tests not run ====" : <>==== {r.after.passed || 0} passed, {r.after.failed || 0} failed ====</>}
        </p>
      </div>
    </Section>
  );
}

function Quality({ run }) {
  const r = run.result;
  const regs = r.regressions;
  // Don't claim a green "0 detected" when the after-run never happened.
  const ran = run.status !== "env_failed" && (r.after.total > 0 || regs.length > 0);
  return (
    <section className={CARD + " p-4 sm:p-5 min-w-0 flex flex-col gap-4"} aria-labelledby="quality-title">
      <div>
        <PanelTitle as="h3" icon="shield" id="quality-title" meta={
          <span className={CHIP + (!ran ? TONE.warn : regs.length ? TONE.bad : TONE.ok)}>
            {!ran ? "not run" : <><Icon name={regs.length ? "close" : "check"} className="text-sm" /><CountUp value={regs.length} /> detected</>}
          </span>
        }>Regressions</PanelTitle>
        {regs.length > 0 && <ul className="hud-well mt-3 p-3 space-y-1 font-mono text-xs text-bad break-all">{regs.map((t) => <li key={t}>{String(t)}</li>)}</ul>}
      </div>
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <PanelTitle as="h3" icon="playlist_add_check" meta={<span className={CHIP + TONE.ok}><CountUp value={r.new_tests.length} /> added</span>}>New tests added</PanelTitle>
        {r.new_tests.length ? r.new_tests.map((t) => (
          <div key={t} className="hud-well flex items-center gap-1.5 px-2 py-1.5 font-mono text-xs text-ink">
            <Icon name="check_circle" className="text-base text-ok shrink-0" />
            <span className="truncate" title={t}>{String(t).split("::").pop()}</span>
          </div>
        )) : <p className="text-sm text-ink-3">none</p>}
      </div>
    </section>
  );
}

// `r` only needs a `diff`; the project view reuses this for the cumulative diff.
export function Changes({ r }) {
  const files = useMemo(() => parseDiff(r.diff), [r.diff]);
  const [picked, setPicked] = useState(0);
  const file = files[Math.min(picked, files.length - 1)];
  const code = useRef(null);
  useAnime(code, () => { // the picked file's lines slide in
    const rows = [...code.current.children].slice(0, 40);
    if (rows.length) animate(rows, { opacity: [0, 1], x: [-10, 0], duration: 400, ease: "outExpo", delay: (el, i) => i * 18, onComplete: (a) => utils.cleanInlineStyles(a) });
  }, [picked, r.diff]);
  if (!file) return null;
  // row classes, sign/gutter colour, sign; the +/- sign and line number stay so colour is not the only cue
  const LINE = {
    add: ["bg-ok/10 text-ok border-l-2 border-ok", "text-ok", "+"],
    del: ["bg-accent/10 text-bad border-l-2 border-accent", "text-bad", "-"],
    ctx: ["text-ink-2 border-l-2 border-transparent", "text-ink-3", " "],
  };
  return (
    <>
      <Section id="files-title" icon="difference" title="Files modified"
               meta={<><CountUp value={files.length} /> {files.length === 1 ? "file" : "files"} changed</>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1 font-mono text-xs">
          {files.map((f, i) => {
            const cut = f.path.lastIndexOf("/") + 1;
            return (
              <button key={f.path} type="button" aria-pressed={f === file} onClick={() => setPicked(i)} title={f.path}
                      className={"flex items-center justify-between gap-2 px-2.5 py-2 rounded-sm border border-l-2 text-left transition-colors " +
                        (f === file ? "bg-raised border-line border-l-accent-fg" : "bg-surface border-line border-l-transparent hover:bg-raised")}>
                <span className="flex items-center gap-1.5 min-w-0">
                  <Icon name="description" className={"text-base shrink-0 " + (f === file ? "text-accent-fg" : "text-ink-3")} />
                  <span className="truncate"><span className="text-ink-3">{f.path.slice(0, cut)}</span><span className="text-ink">{f.path.slice(cut)}</span></span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0 font-semibold">
                  <span className={f.add ? "text-ok" : "text-ink-3"}>+{f.add}</span>
                  <span className={f.del ? "text-bad" : "text-ink-3"}>-{f.del}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <section className="hud-well overflow-hidden min-w-0" aria-label="Diff">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-raised border-b border-line">
          <span className="flex items-center gap-1.5 min-w-0 font-mono text-xs text-ink" title={file.path}>
            <Icon name="terminal" className="text-base text-accent-fg shrink-0" /><span className="truncate">{file.path}</span>
          </span>
          <div className="flex items-center gap-2">
            <span className={CHIP + TONE.ok}>+{file.add} additions</span>
            <span className={CHIP + TONE.bad}>-{file.del} removals</span>
          </div>
        </div>
        <div tabIndex={0} role="region" aria-label={"Diff of " + file.path} className="overflow-auto max-h-[560px] bg-canvas text-ink font-mono text-sm leading-relaxed py-1">
          <div ref={code} className="w-max min-w-full">
            {file.lines.map((line, i) => {
              if (line.kind === "hunk") return <div key={i} className="bg-raised text-gold text-xs py-1 px-3 my-1 border-l-2 border-transparent whitespace-pre select-none">{line.text}</div>;
              const [row, mark, sign] = LINE[line.kind];
              return (
                <div key={i} className={"flex items-baseline py-px px-2 " + row}>
                  <span className="w-10 text-right select-none mr-3 text-xs shrink-0 text-ink-3">{line.no}</span>
                  <span className={"w-4 select-none font-bold mr-1 text-center shrink-0 " + mark}>{sign}</span>
                  <code className="whitespace-pre">{line.text || " "}</code>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

function RunMetadata({ r }) {
  const feature = r.task_type === "feature";
  return (
    <Section id="meta-title" icon="fact_check" title="Run metadata" className="flex flex-col">
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Stat label="Branch"><span title={r.branch}>{r.branch || "none"}</span></Stat>
        <Stat label="Attempts"><CountUp value={r.attempts} /></Stat>
        <Stat label={feature ? "Mode" : "Reproduced"}>
          <span title={feature ? undefined : "Did the new test fail on the original code before the fix?"}>
            {feature ? "feature" : r.syntax && r.syntax.only_syntax ? "n/a (syntax repair only)" : r.reproduced ? "yes" : "no"}
          </span>
        </Stat>
      </dl>
      {[["Report", r.report_path], ["Commit", r.commit_sha]].filter(([, v]) => v).map(([label, value]) => (
        <div key={label} className="mt-3">
          <div className={LABEL + " mb-1"}>{label}</div>
          <div className="hud-well pl-2.5 pr-1 py-1 flex items-center justify-between gap-2 font-mono text-xs">
            {isHttps(value)
              ? <a href={value} target="_blank" rel="noopener noreferrer" className="truncate text-accent-fg underline" title={value}>{value}</a>
              : <span className="truncate text-ink-2" title={value}>{value}</span>}
            <Copy text={value} />
          </div>
        </div>
      ))}
    </Section>
  );
}

function VerifiedImports({ r }) {
  const items = Array.isArray(r.import_check) ? r.import_check : [];
  return (
    <Section id="imports-title" icon="verified_user" title={<>Verified imports &amp; scope</>}
             meta={items.length > 0 && <><CountUp value={items.length} /> verified</>}>
      {items.length ? (
        <ul className="hud-well p-2 flex flex-col gap-1 font-mono text-xs">
          {items.map((item) => {
            const m = /^(.*) \(([^)]+)\)$/.exec(String(item)); // "auth.users (repo)"
            return (
              <li key={item} className="text-ink-2 px-2 py-1.5 flex items-center gap-2">
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-ok text-ok shadow-[0_0_6px_currentColor] shrink-0" />
                <span className="truncate flex-1" title={m ? m[1] : String(item)}>{m ? m[1] : String(item)}</span>
                {m && <span className="text-xs uppercase tracking-[0.08em] text-ink-3 px-1.5 rounded-sm border border-line shrink-0">{m[2]}</span>}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-ink-3">The change added no new imports.</p>}
    </Section>
  );
}

// Live state: dial of finished/total steps beside the current step and its detail.
function Working({ steps }) {
  const current = steps.find((s) => s.status === "running");
  const total = steps.length;
  const done = steps.filter((s) => s.status === "ok").length;
  const value = total ? done / total : 0;
  return (
    <section className={CARD_CORNERS + " p-4 sm:p-5 flex flex-col sm:flex-row items-center sm:items-start gap-5"} aria-label="Current activity">
      {/* motion: the Ring's outer dashed circle would rotate slowly while a step runs */}
      <Ring value={value} size={176} label={done + " of " + total + " steps done"}>
        <span className="font-display text-4xl font-bold leading-none tabular-nums text-ink">{Math.round(value * 100)}<span className="text-xl text-ink-2">%</span></span>
        <span className="mt-1.5 max-w-[104px] break-words font-mono text-xs leading-4 font-semibold uppercase tracking-[0.1em] text-accent-fg">{current ? current.name : "starting"}</span>
      </Ring>
      <div className="min-w-0 flex-1 w-full">
        <p className={LABEL}>Working on</p>
        <p className="mt-1 flex items-center gap-2 font-mono text-lg font-semibold uppercase tracking-[0.04em] text-ink break-words">
          <Spinner className="text-xl text-accent-fg shrink-0" /><span className="min-w-0">{current ? current.name : "Starting the run…"}</span>
        </p>
        {current && current.detail && <p className="hud-well mt-3 px-3 py-2 font-mono text-xs text-ink-2 break-words">{current.detail}</p>}
        <p className="text-sm text-ink-2 mt-3">The agent changes the code only on a scratch branch. It is committed to the project only after the tests pass.</p>
      </div>
    </section>
  );
}

export default function RunView({ run, busy, steps, elapsed, head, project, task, taskType, repoLabel, onBack, backLabel, stored }) {
  const done = finished(run);
  // A run cut off by a crash can have a nearly empty result: fill in what the cards read.
  const r = done ? { attempts: 0, regressions: [], new_tests: [], baseline: {}, after: {}, ...run.result } : null;
  const full = r ? { ...run, result: r } : run;
  const type = (r && r.task_type) || taskType;
  const current = steps.find((s) => s.status === "running");
  const clock = elapsed != null ? Math.floor(elapsed / 60) + ":" + String(Math.floor(elapsed) % 60).padStart(2, "0") : null;
  const stage = !steps.length ? null
    : done ? steps.filter((s) => s.status === "ok").length + "/" + steps.length
    : current ? "STAGE " + (steps.indexOf(current) + 1) + "/" + steps.length : null;
  const meta = [repoLabel, type === "feature" ? "Feature" : type === "debug" ? "Debug" : "", run && "RUN " + run.id,
    head && "HEAD " + short(head)].filter(Boolean).join(" :: ");

  const root = useRef(null);
  useAnime(root, () => { // each state's cards arrive one by one; the banner icon springs in
    enter(root.current.children, { delay: (el, i) => i * 70 });
    pop(root.current.querySelectorAll("[data-pop]"), { scale: [0.3, 1], delay: 150 });
  }, [done, run && run.id]);

  return (
    <div className="flex flex-col gap-5 min-w-0">
      <header className={CARD_CORNERS + " p-4 sm:p-5 min-w-0"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {onBack ? (
            <button type="button" onClick={onBack} className={button("ghost", "sm") + " -ml-2.5"}>
              <Icon name="arrow_back" className="text-base" />{backLabel}
            </button>
          ) : <span />}
          <div className="flex flex-wrap items-center gap-2">
            {stored && <span className={CHIP + TONE.dim}>Past run</span>}
            <StatusPill status={run ? run.status : "running"} />
            {stage && <span className={CHIP + TONE.gold}>{stage}</span>}
            {clock && <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-sm border border-line bg-raised font-mono text-xs tabular-nums text-ink"><Icon name="timer" className="text-sm text-accent-fg" />{clock}</span>}
          </div>
        </div>
        <p className={LABEL + " mt-3"}>{done ? "Run report" : "Active run matrix"}</p>
        <h1 id="view-title" tabIndex={-1} className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight break-words">{task || "Run"}</h1>
        {meta && <p className="mt-2 text-xs font-mono text-ink-3 break-words">{meta}</p>}
        <p aria-live="polite" className="sr-only">
          {done ? "Run " + (FINAL[run.status] || run.status) : current ? "Step " + current.name + " running" : "Starting the run…"}
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] items-start">
        <Steps run={run} steps={steps} />
        <div ref={root} className="flex flex-col gap-5 min-w-0">
          {!r ? (
            <>
              <Working steps={steps} />
              <BuildsOn project={project} run={run} />
            </>
          ) : (
            <>
              <Banner run={full} elapsed={elapsed} />
              {run.status === "success" && (
                <Section id="why-title" icon="psychology" title={<>What changed &amp; root cause</>}>
                  <div className="hud-well p-3 text-ink-2 text-sm leading-relaxed whitespace-pre-wrap break-words">{r.explanation || "(no explanation given)"}</div>
                </Section>
              )}
              {r.syntax && (
                <Section id="syntax-title" icon="code" title="Syntax repair">
                  <ul className="hud-well p-3 font-mono text-xs text-ink-2 space-y-1 break-words">
                    {(r.syntax.files || []).map((f) => <li key={f.path + ":" + f.line}>{f.path} line {f.line}: {f.msg} · {f.after}</li>)}
                  </ul>
                  {r.syntax.only_syntax && <p className="mt-2 text-sm text-ink-3">Bug reproduced: n/a (syntax repair only). There is no fail-first test for code that did not parse.</p>}
                </Section>
              )}
              {r.error && (
                <Section id="diag-title" icon="terminal" title={run.status === "env_failed" ? "pip / pytest trace output" : "Failure diagnostics"}>
                  <pre tabIndex={0} aria-label={run.status === "env_failed" ? "pip and pytest trace output" : "Failure diagnostics"}
                       className={"hud-well p-3 font-mono text-xs whitespace-pre-wrap break-words overflow-auto max-h-80 leading-relaxed " + (run.status === "env_failed" ? "text-ink" : "text-bad")}>{r.error}</pre>
                </Section>
              )}
              {r.note && <Notice tone="warn"><span className="whitespace-pre-wrap">{r.note}</span></Notice>}
              {run.status !== "env_failed" && (
                <div className="grid gap-5 md:grid-cols-2 items-start">
                  <TestMatrix r={r} />
                  <Quality run={full} />
                </div>
              )}
              {run.status === "success" && <Changes r={r} />}
              <RunMetadata r={r} />
              <VerifiedImports r={r} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
