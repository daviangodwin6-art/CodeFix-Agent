import { useState } from "react";
import { MotionToggle } from "../motion.jsx";
import { Icon, short } from "./ui.jsx";

function Account({ me, onSignIn, onSignOut }) {
  const [open, setOpen] = useState(false);
  if (!me.signed_in) { // offline mode: back to the login page
    return (
      <button type="button" onClick={onSignIn}
              className="h-[34px] px-3 rounded-md bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-[14px] font-medium flex items-center gap-1.5 transition whitespace-nowrap">
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
              className="w-[38px] h-[38px] rounded-full bg-blue-600 overflow-hidden shadow-xs ring-2 ring-transparent hover:ring-blue-400/40 transition">
        <img src={profile + ".png?size=76"} alt="" width="38" height="38" className="w-[38px] h-[38px]" />
      </button>
      {open && (
        <div role="menu" className="fade-in absolute right-0 mt-1.5 w-52 rounded-lg glass-raised p-1 z-50">
          <a role="menuitem" href={profile} target="_blank" rel="noopener noreferrer" className="block px-2.5 py-1.5 rounded-md hover:bg-white/[0.03]">
            <div className="text-[11px] text-slate-400">Signed in as</div>
            <div className="font-mono text-xs text-slate-50 truncate">{me.login}</div>
          </a>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onSignOut(); }}
                  className="w-full mt-0.5 px-2.5 py-1.5 rounded-md text-left text-xs font-medium text-rose-300 hover:bg-rose-500/10 flex items-center gap-1.5">
            <Icon name="logout" className="text-[15px]" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ me, online, repoName, project, onSignIn, onSignOut }) {
  return (
    <header className="sticky top-0 z-40 w-full bg-[#040711]/60 backdrop-blur-xl backdrop-saturate-150 border-b border-white/[0.06] shadow-[inset_0_-1px_0_rgba(59,130,246,0.08)] px-4 lg:px-8 py-4">
      <div className="max-w-[1920px] mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-[46px] h-[46px] rounded-xl bg-gradient-to-br from-blue-500/25 to-cyan-400/10 border border-blue-400/30 flex items-center justify-center text-blue-300 shadow-[0_0_24px_-6px_rgba(59,130,246,0.6)] shrink-0">
            <Icon name="terminal" className="text-[26px]" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[19px] leading-6 tracking-tight text-slate-50">CodeFix Agent</div>
            <div className="mt-0.5 min-h-[22px] text-[14px] text-slate-400 flex items-center gap-2.5 min-w-0">
              <span className="hidden md:inline truncate">Autonomous patch generation, test verification &amp; regression analysis</span>
              {(project || repoName) && <span className="hidden md:inline-block w-1 h-1 rounded-full bg-white/[0.12] shrink-0"></span>}
              {project
                ? <span className="font-mono text-[13.5px] text-blue-300 bg-blue-500/10 border border-blue-500/25 rounded-md px-2 truncate">project: {project.display_name}{project.head_sha ? " @ " + short(project.head_sha) : ""}</span>
                : repoName && <span className="text-blue-400 font-medium truncate">{repoName}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div role="status" className="hidden sm:inline-flex items-center gap-2 font-mono text-[13px] px-3 py-1 rounded-full border whitespace-nowrap bg-white/[0.04] text-slate-300 border-white/[0.08]">
            <span className={"w-2 h-2 rounded-full " + (online ? "bg-emerald-500" : online === false ? "bg-rose-500" : "bg-slate-400")}></span>
            {online ? "API online" : online === false ? "API offline" : "API"}
          </div>
          <MotionToggle className="hidden sm:flex text-[14px] font-medium !px-3 !py-1.5 !rounded-md" />
          <span className="hidden lg:inline text-[14px] text-slate-400 whitespace-nowrap">
            {me.signed_in ? "GitHub: " + me.login : "Offline: local folders only"}
          </span>
          <Account me={me} onSignIn={onSignIn} onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  );
}
