import { useEffect, useRef, useState } from "react";

export function Icon({ name, className = "", fill = false }) {
  return (
    <span aria-hidden="true" className={"material-symbols-outlined " + className}
          style={fill ? { fontVariationSettings: "'FILL' 1" } : undefined}>{name}</span>
  );
}

// Level-1 panel (hud-panel in index.css carries bg, border, radius, top-edge light leak); callers add padding.
export const CARD = "hud-panel";
export const CARD_CORNERS = CARD + " hud-corners";
export const LABEL = "font-mono text-[11px] leading-4 font-semibold uppercase tracking-[0.12em] text-ink-2";

// Hover styles use enabled: so disabled buttons get no glow or colour change (buttons only, not links).
const BTN_BASE = "inline-flex items-center justify-center gap-1.5 rounded-sm whitespace-nowrap transition-[color,background-color,border-color,box-shadow] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none";
const BTN_MONO = "font-mono font-semibold uppercase tracking-[0.08em] ";
const BTN_VARIANT = {
  primary: "hud-chamfer font-display font-semibold uppercase tracking-[0.04em] bg-accent text-ink enabled:hover:bg-accent-hover enabled:hover:text-white enabled:hover:shadow-glow-red",
  secondary: BTN_MONO + "bg-surface border border-line text-ink enabled:hover:border-accent-fg enabled:hover:text-accent-fg enabled:hover:shadow-inner-cyan",
  ghost: BTN_MONO + "text-ink-2 enabled:hover:bg-raised enabled:hover:text-ink",
  danger: BTN_MONO + "border border-bad text-bad enabled:hover:bg-bad/10",
};
const BTN_SIZE = { sm: "h-8 px-3 text-[11px]", md: "h-9 px-4 text-xs", lg: "h-12 px-6 text-sm" };
export const button = (variant = "secondary", size = "md") => [BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size]].join(" ");

export const FIELD = "w-full rounded-sm bg-canvas border border-line-strong text-ink text-sm px-3 py-2 placeholder:text-ink-3 caret-gold focus:border-accent-fg focus:outline-none focus:ring-1 focus:ring-accent-fg focus:shadow-inner-cyan disabled:opacity-60 read-only:opacity-80";

// Panel header row: cyan icon + mono title (left), optional gold meta (right).
export function PanelTitle({ icon, children, meta, as: Tag = "h2", id, className = "" }) {
  return (
    <div className={"flex items-center justify-between gap-3 " + className}>
      <div className="flex items-center gap-2 min-w-0">
        {icon && <Icon name={icon} className="text-lg text-accent-fg shrink-0" />}
        <Tag id={id} className="min-w-0 break-words font-mono text-xs font-semibold uppercase tracking-[0.12em] text-ink">{children}</Tag>
      </div>
      {meta != null && meta !== false && <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-gold">{meta}</span>}
    </div>
  );
}

// Telemetry tile; must sit inside a <dl>.
export function Stat({ label, children, tone = "text-ink", className = "" }) {
  return (
    <div className={"rounded-sm border border-line bg-raised px-3 py-2 min-w-0 " + className}>
      <dt className={LABEL}>{label}</dt>
      <dd className={"mt-1 font-mono text-sm break-words " + tone}>{children}</dd>
    </div>
  );
}

// Decorative arc-reactor mark: cyan outer ring, dashed gold ring, red core, centre hex.
export function Logo({ className = "w-8 h-8" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className={className}>
      <circle cx="16" cy="16" r="14.5" stroke="#63DDF5" strokeWidth="1" />
      <circle cx="16" cy="16" r="10.5" stroke="#F5B942" strokeWidth="1.5" strokeDasharray="3 2.2" />
      <circle cx="16" cy="16" r="6.5" stroke="#FF454A" strokeWidth="2" />
      <path d="M16 12.6 18.94 14.3v3.4L16 19.4l-2.94-1.7v-3.4z" fill="#63DDF5" />
    </svg>
  );
}

// Dial gauge: value 0..1 from 12 o'clock; children are centred inside.
export function Ring({ value, size = 160, stroke = 6, tone = "#D61F24", label, children, className = "" }) {
  const v = Math.min(1, Math.max(0, Number(value) || 0));
  const outer = size / 2 - 1; // decorative dashed ring
  const r = outer - stroke / 2 - 6; // track + progress
  const c = 2 * Math.PI * r;
  const a11y = label ? { role: "img", "aria-label": label } : {};
  return (
    <div className={"relative inline-flex items-center justify-center shrink-0 " + className} style={{ width: size, height: size }} {...a11y}>
      <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" className="absolute inset-0">
        {/* motion: a slow dash-array rotation on this outer ring would go here */}
        <circle cx={size / 2} cy={size / 2} r={outer} stroke="#63DDF5" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 5" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#303B49" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth={stroke} strokeLinecap="butt"
                strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="relative flex flex-col items-center justify-center text-center min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ className = "" }) {
  return <Icon name="progress_activity" className={"animate-spin " + className} />;
}

export function Skeleton({ className = "" }) {
  return <div aria-hidden="true" className={"skeleton rounded-sm bg-raised " + className} />;
}

export function Copy({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(t);
  }, [done]);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setDone(true); } catch (e) { /* clipboard unavailable */ }
  }
  return (
    <button type="button" onClick={copy} className={button("ghost", "sm") + " shrink-0"}>
      <Icon name={done ? "check" : "content_copy"} className="text-base" />
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}

const TONES = {
  info: { icon: "info", cls: "border-accent-fg/40 border-l-accent-fg bg-accent-fg/10", fg: "text-accent-fg" },
  ok: { icon: "check_circle", cls: "border-ok/40 border-l-ok bg-ok/10", fg: "text-ok" },
  warn: { icon: "warning", cls: "border-warn/40 border-l-warn bg-warn/10", fg: "text-warn" },
  bad: { icon: "error", cls: "border-bad/40 border-l-bad bg-bad/10", fg: "text-bad" },
};

export function Notice({ tone = "info", title, children, onDismiss, className = "" }) {
  const t = TONES[tone] || TONES.info;
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={"flex items-start gap-3 rounded-sm border border-l-2 px-4 py-3 text-sm text-ink " + t.cls + " " + className}>
      <Icon name={t.icon} fill className={"text-xl shrink-0 " + t.fg} />
      <div className="min-w-0 flex-1 break-words">
        {title && <p className={"font-mono text-xs font-semibold uppercase tracking-[0.1em] " + t.fg}>{title}</p>}
        {children}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 rounded-sm text-ink-2 hover:text-ink">
          <Icon name="close" className="text-xl" />
        </button>
      )}
    </div>
  );
}

const CHIP = "inline-flex items-center gap-1.5 rounded-sm border px-2 h-6 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap ";
const STATUS = {
  success: { label: "Succeeded", running: false, cls: "text-ok border-ok/40 bg-ok/10" },
  failed: { label: "Failed", running: false, cls: "text-bad border-bad/40 bg-bad/10" },
  env_failed: { label: "Env failed", running: false, cls: "text-warn border-warn/40 bg-warn/10" },
  running: { label: "Running", running: true, cls: "text-accent-fg border-accent-fg/40 bg-accent-fg/10" },
};
export function StatusPill({ status }) {
  const s = STATUS[status] || { label: "Not started", running: false, cls: "text-ink-2 border-line-strong bg-raised" };
  return (
    <span className={CHIP + s.cls}>
      {s.running ? <Spinner className="text-sm" /> : <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor]" />}
      {s.label}
    </span>
  );
}

export const short = (sha) => String(sha || "").slice(0, 7);
export const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

// 0.4s, 58s, 2m 05s
export function duration(seconds) {
  if (seconds == null) return "";
  if (seconds < 10) return Number(seconds).toFixed(1) + "s";
  const whole = Math.round(seconds);
  return whole < 60 ? whole + "s" : Math.floor(whole / 60) + "m " + String(whole % 60).padStart(2, "0") + "s";
}

// ISO timestamp -> "2 min ago", "yesterday"
export function ago(iso) {
  const min = (Date.now() - Date.parse(iso)) / 60000;
  if (!(min >= 0)) return "";
  if (min < 1) return "just now";
  if (min < 60) return Math.floor(min) + " min ago";
  if (min < 1440) return Math.floor(min / 60) + " h ago";
  if (min < 2880) return "yesterday";
  return new Date(iso).toLocaleDateString();
}

// Project kinds: badge text, the Repository selector mode each one maps to, badge colours.
export const KIND = {
  mine: { label: "My repo", mode: "own", tone: "text-accent-fg border-accent-fg/40 bg-accent-fg/10" },
  others: { label: "Other's", mode: "other", tone: "text-gold border-gold/40 bg-gold/10" },
  local: { label: "Local", mode: "local", tone: "text-ink-2 border-line-strong bg-raised" },
};

export function KindBadge({ kind }) {
  const k = KIND[kind] || KIND.local;
  return <span className={"inline-flex items-center rounded-sm border px-1.5 h-5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap shrink-0 " + k.tone}>{k.label}</span>;
}

// Modal on the native <dialog>: the browser traps focus, closes on Escape and returns focus to the opener.
// `children` is a function that receives `close`.
export function Dialog({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
    const first = ref.current.querySelector("[data-autofocus]"); // otherwise the browser picks the first control
    if (first) first.focus();
  }, []);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="dialog-title"
            className="fade-in w-[560px] max-w-[calc(100vw-2rem)] bg-raised border border-line rounded shadow-aura hud-corners p-6 text-left text-ink backdrop:bg-black/70 backdrop:backdrop-blur-sm">
      <h2 id="dialog-title" className="font-display text-xl font-bold tracking-tight break-words">{title}</h2>
      {children(() => ref.current.close())}
    </dialog>
  );
}

export function ConfirmDialog({ title, children, confirmLabel = "Confirm", danger = false, onConfirm, onClose }) {
  return (
    <Dialog title={title} onClose={onClose}>
      {(close) => (
        <>
          <div className="mt-3 text-sm text-ink-2 space-y-2">{children}</div>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" data-autofocus onClick={close} className={button("secondary")}>Cancel</button>
            <button type="button" onClick={() => { onConfirm(); close(); }} className={button(danger ? "danger" : "primary")}>{confirmLabel}</button>
          </div>
        </>
      )}
    </Dialog>
  );
}
