import { useMemo, useRef, useState } from "react";
import { animate, utils } from "animejs";
import { finished, isHttps } from "../api.js";
import { CountUp, enter, pop, useAnime } from "../motion.jsx";
import { BuildsOn, Steps } from "./Progress.jsx";
import { button, CARD, Copy, Icon, Notice, plural, short, Spinner, StatusPill } from "./ui.jsx";

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

const BANNER = {
  success: { box: "border-ok/30 bg-ok/10", fg: "text-ok", icon: "verified", chip: "Change committed" },
  failed: { box: "border-bad/30 bg-bad/10", fg: "text-bad", icon: "cancel", chip: "Working copy reverted" },
  env_failed: { box: "border-warn/30 bg-warn/10", fg: "text-warn", icon: "build_circle", chip: "Run halted" },
};
const FINAL = { success: "Succeeded", failed: "Failed", env_failed: "Environment setup failed" };
const H3 = "text-base font-semibold text-ink";
const TILE = "bg-raised border border-line p-2.5 rounded-lg min-w-0";
const TILE_LABEL = "text-xs text-ink-3";

function Banner({ run }) {
  const r = run.result;
  const b = BANNER[run.status] || BANNER.failed;
  const feature = r.task_type === "feature";
  const title = run.status === "success" ? (feature ? "Feature added" : "Repair completed")
    : run.status === "env_failed" ? "Environment setup failed" : (feature ? "Feature run failed" : "Repair failed");
  const text = run.status === "success"
    ? "Done in " + plural(r.attempts, "attempt") + " • " + plural(r.regressions.length, "regression") + " • " + r.after.passed + " of " + r.after.total + " tests passing"
    : run.status === "env_failed" ? "The virtual environment, the dependency install or pytest itself could not run."
    : "No acceptable change after " + plural(r.attempts, "attempt") + ". Nothing was committed.";
  return (
    <div className={"border rounded-xl p-4 flex items-center gap-3 " + b.box}>
      <span data-pop className={"shrink-0 " + b.fg}><Icon name={b.icon} fill className="text-3xl" /></span>
      <div className="flex-1 min-w-0">
        <p className={"text-base font-semibold " + b.fg}>{title}</p>
        <p className="text-sm text-ink-2 mt-0.5 break-words">{text}</p>
      </div>
      <span className={"hidden sm:inline text-xs px-2.5 py-1 rounded-full border font-medium whitespace-nowrap " + b.box + " " + b.fg}>{b.chip}</span>
    </div>
  );
}

function TestMatrix({ r }) {
  const gained = r.after.passed - r.baseline.passed;
  const rows = [["Passed", "passed"], ["Failed", "failed"], ["Total runs", "total"]];
  return (
    <section className={CARD + " p-5 min-w-0"} aria-labelledby="matrix-title">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 id="matrix-title" className={H3}>Test results</h3>
        <span className="font-mono text-xs bg-raised text-ink-2 px-1.5 py-0.5 rounded border border-line">pytest</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-sm">
          <caption className="sr-only">Test counts before and after the change</caption>
          <thead>
            <tr className="text-ink-3 text-xs">
              <th scope="col" className="py-1 pr-3 font-medium">Metric</th>
              <th scope="col" className="py-1 pr-3 font-medium">Before</th>
              <th scope="col" className="py-1 font-medium">After patch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-ink-2">
            {rows.map(([label, key]) => (
              <tr key={key}>
                <th scope="row" className="py-2 pr-3 font-medium">{label}</th>
                <td className={"py-2 pr-3 tabular-nums " + (key === "failed" && r.baseline.failed > 0 ? "text-bad font-semibold" : "text-ink-2")}><CountUp value={r.baseline[key]} /></td>
                <td className={"py-2 tabular-nums " + (key === "passed" ? "text-ok font-semibold" : key === "failed" && r.after.failed > 0 ? "text-bad font-semibold" : "text-ink")}>
                  <CountUp value={r.after[key]} />
                  {key === "passed" && <> Passed{gained > 0 && " (+" + gained + ")"}</>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Quality({ run }) {
  const r = run.result;
  const regs = r.regressions;
  // Don't claim a green "0 detected" when the after-run never happened.
  const ran = run.status !== "env_failed" && (r.after.total > 0 || regs.length > 0);
  return (
    <section className={CARD + " p-5 min-w-0 flex flex-col gap-4"} aria-labelledby="quality-title">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 id="quality-title" className={H3}>Regressions</h3>
          <span className={"px-2 py-0.5 border font-mono text-xs font-semibold rounded-md whitespace-nowrap " +
            (!ran ? "bg-warn/10 border-warn/30 text-warn" : regs.length ? "bg-bad/10 border-bad/30 text-bad" : "bg-ok/10 border-ok/30 text-ok")}>
            {!ran ? "not run" : <>{regs.length ? "✕" : "✓"} <CountUp value={regs.length} /> detected</>}
          </span>
        </div>
        {regs.length > 0 && <ul className="mt-2 space-y-1 font-mono text-xs text-bad break-all">{regs.map((t) => <li key={t}>{String(t)}</li>)}</ul>}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className={H3}>New tests added</h3>
          <span className="font-mono text-xs bg-ok/10 text-ok border border-ok/30 px-1.5 py-0.5 rounded"><CountUp value={r.new_tests.length} /> added</span>
        </div>
        {r.new_tests.length ? r.new_tests.map((t) => (
          <div key={t} className="flex items-center gap-1.5 p-1.5 rounded bg-raised border border-line font-mono text-xs text-ink">
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
  const LINE = {
    add: ["bg-ok/10 text-ink border-l-2 border-ok", "text-ok", "+"],
    del: ["bg-bad/10 text-ink border-l-2 border-bad", "text-bad", "-"],
    ctx: ["text-ink-2 border-l-2 border-transparent", "text-ink-3", " "],
  };
  return (
    <>
      <section className={CARD + " p-5 min-w-0"} aria-labelledby="files-title">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h3 id="files-title" className={H3}>Files modified</h3>
          <span className="font-mono text-xs text-ink-3"><CountUp value={files.length} /> {files.length === 1 ? "file" : "files"} changed</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-xs">
          {files.map((f, i) => (
            <button key={f.path} type="button" aria-pressed={f === file} onClick={() => setPicked(i)} title={f.path}
                    className={"flex items-center justify-between gap-2 p-2 rounded-lg border text-left transition-colors " +
                      (f === file ? "bg-accent-fg/10 border-accent-fg/30" : "bg-raised border-line hover:border-line-strong")}>
              <span className="flex items-center gap-1.5 min-w-0">
                <Icon name="description" className={"text-base shrink-0 " + (f === file ? "text-accent-fg" : "text-ink-3")} />
                <span className="text-ink truncate">{f.path}</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="text-ok font-semibold">+{f.add}</span>
                <span className={(f.del ? "text-bad" : "text-ink-3") + " font-semibold"}>-{f.del}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className={CARD + " overflow-hidden min-w-0"} aria-label="Diff">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-raised border-b border-line">
          <span className="font-mono text-xs text-ink truncate min-w-0" title={file.path}>{file.path}</span>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="bg-ok/10 text-ok border border-ok/30 px-2 py-0.5 rounded font-semibold">+{file.add} additions</span>
            <span className="bg-bad/10 text-bad border border-bad/30 px-2 py-0.5 rounded font-semibold">-{file.del} removals</span>
          </div>
        </div>
        <div tabIndex={0} role="region" aria-label={"Diff of " + file.path} className="overflow-auto max-h-[560px] bg-canvas text-ink font-mono text-xs py-3 leading-relaxed">
          <div ref={code} className="w-max min-w-full">
            {file.lines.map((line, i) => {
              if (line.kind === "hunk") return <div key={i} className="text-ink-3 py-0.5 px-3 select-none">{line.text}</div>;
              const [row, mark, sign] = LINE[line.kind];
              return (
                <div key={i} className={"flex items-center py-0.5 px-2 " + row}>
                  <span className="w-8 text-right select-none mr-3 text-[11px] shrink-0 text-ink-3">{line.no}</span>
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
    <section className={CARD + " p-5 min-w-0 flex flex-col gap-3"} aria-labelledby="meta-title">
      <h3 id="meta-title" className={H3}>Run metadata</h3>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className={TILE}>
          <div className={TILE_LABEL}>Branch</div>
          <div className="font-mono text-sm font-semibold text-ink truncate mt-0.5" title={r.branch}>{r.branch || "none"}</div>
        </div>
        <div className={TILE}>
          <div className={TILE_LABEL}>Attempts</div>
          <div className="font-mono text-sm font-semibold text-ink mt-0.5"><CountUp value={r.attempts} /></div>
        </div>
        <div className={TILE}>
          <div className={TILE_LABEL}>{feature ? "Mode" : "Reproduced"}</div>
          <div className="font-mono text-sm font-semibold text-ink mt-0.5"
               title={feature ? undefined : "Did the new test fail on the original code before the fix?"}>
            {feature ? "feature" : r.syntax && r.syntax.only_syntax ? "n/a (syntax repair only)" : r.reproduced ? "yes" : "no"}
          </div>
        </div>
      </div>
      {[["Report", r.report_path], ["Commit", r.commit_sha]].filter(([, v]) => v).map(([label, value]) => (
        <div key={label}>
          <div className={TILE_LABEL + " mb-0.5"}>{label}</div>
          <div className="bg-raised border border-line pl-2.5 pr-1 py-1 rounded-lg flex items-center justify-between gap-2 font-mono text-xs">
            {isHttps(value)
              ? <a href={value} target="_blank" rel="noopener noreferrer" className="truncate text-accent-fg underline" title={value}>{value}</a>
              : <span className="truncate text-ink-2" title={value}>{value}</span>}
            <Copy text={value} />
          </div>
        </div>
      ))}
    </section>
  );
}

function VerifiedImports({ r }) {
  const items = Array.isArray(r.import_check) ? r.import_check : [];
  return (
    <section className={CARD + " p-5 min-w-0"} aria-labelledby="imports-title">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 id="imports-title" className={H3}>Verified imports &amp; scope</h3>
        {items.length > 0 && <span className="font-mono text-xs text-ink-3"><CountUp value={items.length} /> verified</span>}
      </div>
      {items.length ? (
        <ul className="flex flex-col gap-1.5 font-mono text-xs">
          {items.map((item) => {
            const m = /^(.*) \(([^)]+)\)$/.exec(String(item)); // "auth.users (repo)"
            return (
              <li key={item} className="bg-raised border border-line text-ink-2 px-2.5 py-1.5 rounded-md flex items-center justify-between gap-2">
                <span className="truncate" title={m ? m[1] : String(item)}>{m ? m[1] : String(item)}</span>
                {m && <span className="text-xs text-ink-3 px-1.5 rounded border border-line shrink-0">{m[2]}</span>}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-ink-3">The change added no new imports.</p>}
    </section>
  );
}

function Working({ steps }) {
  const current = steps.find((s) => s.status === "running");
  return (
    <section className={CARD + " p-5 flex items-start gap-3"} aria-label="Current activity">
      <Spinner className="text-2xl text-accent-fg shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-ink-3">Working on</p>
        <p className="text-base font-semibold text-ink font-mono break-words">{current ? current.name : "Starting the run…"}</p>
        <p className="text-sm text-ink-2 mt-1">The agent changes the code only on a scratch branch. It is committed to the project only after the tests pass.</p>
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
  const meta = [repoLabel, type === "feature" ? "Feature" : type === "debug" ? "Debug" : "", run && "run " + run.id,
    head && "continuing from head " + short(head)].filter(Boolean).join(" · ");

  const root = useRef(null);
  useAnime(root, () => { // each state's cards arrive one by one; the banner icon springs in
    enter(root.current.children, { delay: (el, i) => i * 70 });
    pop(root.current.querySelectorAll("[data-pop]"), { scale: [0.3, 1], delay: 150 });
  }, [done, run && run.id]);

  return (
    <div className="flex flex-col gap-5 min-w-0">
      <header className={CARD + " p-5 min-w-0"}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          {onBack ? (
            <button type="button" onClick={onBack} className={button("ghost", "sm") + " -ml-2.5"}>
              <Icon name="arrow_back" className="text-base" />{backLabel}
            </button>
          ) : <span />}
          <div className="flex items-center gap-3">
            {stored && <span className="text-xs text-ink-2 border border-line-strong bg-raised rounded-full px-2 h-6 inline-flex items-center">Past run</span>}
            <StatusPill status={run ? run.status : "running"} />
            {clock && <span className="font-mono text-sm tabular-nums text-ink-2">{clock}</span>}
          </div>
        </div>
        <h1 id="view-title" tabIndex={-1} className="text-xl font-semibold break-words">{task || "Run"}</h1>
        {meta && <p className="mt-1 text-xs font-mono text-ink-3 break-words">{meta}</p>}
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
              <Banner run={full} />
              {run.status === "success" && (
                <section className={CARD + " p-5"} aria-labelledby="why-title">
                  <h3 id="why-title" className={H3 + " mb-3 flex items-center gap-2"}><Icon name="psychology" className="text-xl text-accent-fg" />What changed &amp; root cause</h3>
                  <div className="bg-raised border border-line rounded-lg p-3 text-ink-2 text-sm leading-relaxed whitespace-pre-wrap break-words">{r.explanation || "(no explanation given)"}</div>
                </section>
              )}
              {r.syntax && (
                <section className={CARD + " p-5"}>
                  <h3 className={H3 + " mb-2"}>Syntax repair</h3>
                  <ul className="font-mono text-xs text-ink-2 space-y-1 break-words">
                    {(r.syntax.files || []).map((f) => <li key={f.path + ":" + f.line}>{f.path} line {f.line}: {f.msg} · {f.after}</li>)}
                  </ul>
                  {r.syntax.only_syntax && <p className="mt-2 text-sm text-ink-3">Bug reproduced: n/a (syntax repair only). There is no fail-first test for code that did not parse.</p>}
                </section>
              )}
              {r.error && (
                <section className={CARD + " p-5"}>
                  <h3 className={H3 + " mb-2"}>{run.status === "env_failed" ? "pip / pytest trace output" : "Failure diagnostics"}</h3>
                  <pre tabIndex={0} aria-label={run.status === "env_failed" ? "pip and pytest trace output" : "Failure diagnostics"}
                       className={"bg-canvas border border-line p-3 rounded-lg font-mono text-xs whitespace-pre-wrap break-words overflow-auto max-h-80 leading-relaxed " + (run.status === "env_failed" ? "text-ink" : "text-bad")}>{r.error}</pre>
                </section>
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
