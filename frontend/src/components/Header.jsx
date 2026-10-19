import { MotionToggle } from "../motion.jsx";
import { button, Icon } from "./ui.jsx";

const MENU_ID = "account-menu";

function Account({ me, onSignIn, onSignOut }) {
  if (!me.signed_in) { // offline mode: back to the login page
    return (
      <>
        <span className="hidden md:inline-flex items-center h-6 px-2 rounded-full border border-line-strong bg-raised text-xs text-ink-2 whitespace-nowrap">Offline mode</span>
        <button type="button" onClick={onSignIn} className={button("primary", "sm")}>Sign in</button>
      </>
    );
  }
  const profile = "https://github.com/" + encodeURIComponent(me.login);
  return (
    <>
      <button type="button" popoverTarget={MENU_ID} aria-label={"Account: " + me.login}
              className="w-8 h-8 rounded-full bg-raised overflow-hidden border border-line-strong hover:border-ink-3 shrink-0">
        <img src={profile + ".png?size=64"} alt="" width="32" height="32" className="w-8 h-8" />
      </button>
      <div id={MENU_ID} popover="auto" style={{ position: "fixed", inset: "auto", right: "1rem", top: "3.5rem" }}
           className="m-0 bg-raised border border-line rounded-lg p-1 w-56 text-ink">
        <a href={profile} target="_blank" rel="noopener noreferrer" className="block px-2.5 py-1.5 rounded-md hover:bg-surface">
          <span className="block text-xs text-ink-3">Signed in as</span>
          <span className="block font-mono text-xs truncate">{me.login}</span>
        </a>
        <button type="button" className="w-full mt-0.5 px-2.5 py-1.5 rounded-md text-left text-sm text-bad hover:bg-bad/10 flex items-center gap-1.5"
                onClick={() => { document.getElementById(MENU_ID)?.hidePopover(); onSignOut(); }}>
          <Icon name="logout" className="text-base" />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );
}

export default function Header({ me, online, crumbs = [], onSignIn, onSignOut }) {
  const dot = online ? "bg-ok" : online === false ? "bg-bad" : "bg-ink-3";
  const text = online ? "API online" : online === false ? "API offline" : "API";
  return (
    <header className="sticky top-0 z-40 h-14 bg-surface border-b border-line px-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-8 h-8 rounded-md bg-accent text-white flex items-center justify-center"><Icon name="terminal" className="text-xl" /></span>
          <span className="hidden sm:inline font-semibold tracking-tight">CodeFix Agent</span>
        </div>
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-1 min-w-0 text-sm">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              const cls = (c.mono ? "font-mono text-xs " : "") + "truncate";
              return (
                <li key={i} className={"flex items-center gap-1 min-w-0 " + (last ? "" : "max-w-[16rem]")}>
                  {i > 0 && <Icon name="chevron_right" className="text-base text-ink-3 shrink-0" />}
                  {last ? <span aria-current="page" className={cls + " text-ink"}>{c.label}</span>
                    : c.onClick ? <button type="button" onClick={c.onClick} className={button("ghost", "sm") + " min-w-0 !px-2 justify-start"}><span className={cls}>{c.label}</span></button>
                    : <span className={cls + " text-ink-2"}>{c.label}</span>}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div role="status" className="inline-flex items-center gap-2 text-xs text-ink-2 whitespace-nowrap">
          <span aria-hidden="true" className={"w-2 h-2 rounded-full " + dot}></span>
          <span className="hidden sm:inline">{text}</span>
          <span className="sm:hidden sr-only">{text}</span>
        </div>
        <MotionToggle className="hidden sm:inline-flex" />
        <Account me={me} onSignIn={onSignIn} onSignOut={onSignOut} />
      </div>
    </header>
  );
}
