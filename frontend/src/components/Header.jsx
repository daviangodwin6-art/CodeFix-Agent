import { MotionToggle } from "../motion.jsx";
import { button, Icon, Logo } from "./ui.jsx";

const MENU_ID = "account-menu";
const CHIP = "inline-flex items-center gap-2 h-8 rounded-sm border font-mono text-[11px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap ";

// Telemetry chip: glowing pip + text. `collapse` hides the text below sm (it stays for screen readers).
export function ApiStatus({ online, collapse = false }) {
  const tone = online ? "text-ok border-ok/40 bg-ok/10" : online === false ? "text-bad border-bad/40 bg-bad/10" : "text-ink-2 border-line-strong bg-raised";
  const text = online ? "API online" : online === false ? "API offline" : "API";
  return (
    <div role="status" className={CHIP + tone + " px-2.5"}>
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor]"></span>
      {collapse ? <><span className="hidden sm:inline">{text}</span><span className="sm:hidden sr-only">{text}</span></> : <span>{text}</span>}
    </div>
  );
}

function Account({ me, onSignIn, onSignOut }) {
  if (!me.signed_in) { // offline mode: back to the login page
    return (
      <>
        <span className={CHIP + "hidden md:inline-flex px-2.5 border-line-strong bg-raised text-ink-2"}>Offline mode</span>
        <button type="button" onClick={onSignIn} className={button("primary", "sm")}>Sign in</button>
      </>
    );
  }
  const profile = "https://github.com/" + encodeURIComponent(me.login);
  return (
    <>
      <button type="button" popoverTarget={MENU_ID} aria-label={"Account: " + me.login}
              className="w-8 h-8 rounded-sm bg-raised overflow-hidden border border-line-strong hover:border-accent-fg hover:shadow-glow-cyan shrink-0 transition-[border-color,box-shadow]">
        <img src={profile + ".png?size=64"} alt="" width="32" height="32" className="w-8 h-8" />
      </button>
      <div id={MENU_ID} popover="auto" style={{ position: "fixed", inset: "auto", right: "1rem", top: "3.5rem" }}
           className="m-0 bg-raised border border-line rounded-sm shadow-aura p-1 w-56 text-ink">
        <a href={profile} target="_blank" rel="noopener noreferrer" className="block px-2.5 py-1.5 rounded-sm hover:bg-surface">
          <span className="block font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">Signed in as</span>
          <span className="block font-mono text-xs truncate">{me.login}</span>
        </a>
        <button type="button" className="w-full mt-0.5 px-2.5 py-1.5 rounded-sm text-left font-mono text-xs font-semibold uppercase tracking-[0.08em] text-bad hover:bg-bad/10 flex items-center gap-1.5"
                onClick={() => { document.getElementById(MENU_ID)?.hidePopover(); onSignOut(); }}>
          <Icon name="logout" className="text-base" />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );
}

export default function Header({ me, online, crumbs = [], onSignIn, onSignOut }) {
  return (
    <header className="sticky top-0 z-40 h-14 bg-surface border-b border-line px-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <Logo className="w-8 h-8" />
          <span className="hidden sm:inline font-display text-lg font-bold uppercase tracking-tight">CodeFix Agent</span>
        </div>
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-1 min-w-0 h-8 px-1.5 rounded-sm bg-canvas border border-line font-mono text-xs">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              const cls = "truncate" + (i === 0 ? " uppercase tracking-[0.08em] font-semibold" : "");
              return (
                <li key={i} className={"flex items-center gap-1 " + (i === 0 ? "shrink-0" : "min-w-0") + (last ? "" : " max-w-[16rem]")}>
                  {i > 0 && <span aria-hidden="true" className="text-gold shrink-0">::</span>}
                  {last ? <span aria-current="page" className={cls + " px-1 text-ink"}>{c.label}</span>
                    : c.onClick ? <button type="button" onClick={c.onClick} className={"min-w-0 h-6 px-1 rounded-sm text-ink-2 hover:text-accent-fg hover:bg-raised transition-colors"}><span className={cls + " block"}>{c.label}</span></button>
                    : <span className={cls + " px-1 text-ink-2"}>{c.label}</span>}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <ApiStatus online={online} collapse />
        <MotionToggle className="hidden sm:inline-flex" />
        <Account me={me} onSignIn={onSignIn} onSignOut={onSignOut} />
      </div>
    </header>
  );
}
