import { useState } from "react";
import { MotionToggle } from "../motion.jsx";
import { Icon } from "./ui.jsx";

function Account({ me, onSignIn, onSignOut }) {
  const [open, setOpen] = useState(false);
  if (!me.signed_in) { // offline mode: back to the login page
    return (
      <button type="button" onClick={onSignIn}
              className="h-7 px-2.5 rounded-md bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-medium flex items-center gap-1.5 transition whitespace-nowrap">
        <Icon name="login" className="text-[15px]" />
        <span>Sign in</span>
      </button>
    );
  }
  const profile = "https://github.com/" + encodeURIComponent(me.login);
  return (
    <div className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={"Account: " + me.login}
              onClick={() => setOpen(!open)}
              className="w-7 h-7 rounded-full bg-blue-600 overflow-hidden shadow-xs ring-2 ring-transparent hover:ring-blue-200 transition">
        <img src={profile + ".png?size=56"} alt="" width="28" height="28" className="w-7 h-7" />
      </button>
      {open && (
        <div role="menu" className="fade-in absolute right-0 mt-1.5 w-52 rounded-lg bg-white border border-slate-200 shadow-lg p-1 z-50">
          <a role="menuitem" href={profile} target="_blank" rel="noopener noreferrer" className="block px-2.5 py-1.5 rounded-md hover:bg-slate-50">
            <div className="text-[11px] text-slate-500">Signed in as</div>
            <div className="font-mono text-xs text-slate-900 truncate">{me.login}</div>
          </a>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onSignOut(); }}
                  className="w-full mt-0.5 px-2.5 py-1.5 rounded-md text-left text-xs font-medium text-rose-700 hover:bg-rose-50 flex items-center gap-1.5">
            <Icon name="logout" className="text-[15px]" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ me, online, repoName, onSignIn, onSignOut }) {
  return (
    <header className="sticky top-0 z-40 w-full bg-white border-b border-slate-200/90 shadow-[0_1px_3px_rgba(15,23,42,0.03)] px-4 sm:px-6 py-2.5">
      <div className="max-w-[1920px] mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200/60 flex items-center justify-center text-primary shadow-xs shrink-0">
            <Icon name="terminal" className="text-[19px]" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[15px] tracking-tight text-slate-900">CodeFix Agent</div>
            <div className="text-[12px] text-slate-500 flex items-center gap-2 min-w-0">
              <span className="hidden md:inline truncate">Autonomous patch generation, test verification &amp; regression analysis</span>
              {repoName && <span className="hidden md:inline-block w-1 h-1 rounded-full bg-slate-300 shrink-0"></span>}
              {repoName && <span className="text-blue-600 font-medium truncate">{repoName}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div role="status" className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap bg-slate-50 text-slate-600 border-slate-200">
            <span className={"w-1.5 h-1.5 rounded-full " + (online ? "bg-emerald-500" : online === false ? "bg-rose-500" : "bg-slate-400")}></span>
            {online ? "API online" : online === false ? "API offline" : "API"}
          </div>
          <MotionToggle className="hidden sm:flex text-[11px] font-medium" />
          <span className="hidden lg:inline text-xs text-slate-500 whitespace-nowrap">
            {me.signed_in ? "GitHub: " + me.login : "Offline: local folders only"}
          </span>
          <div className="h-6 w-px bg-slate-200"></div>
          <Account me={me} onSignIn={onSignIn} onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  );
}
