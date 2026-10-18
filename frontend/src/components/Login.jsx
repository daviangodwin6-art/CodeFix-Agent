import { useRef, useState } from "react";
import { enter, MotionToggle, pop, useAnime } from "../motion.jsx";
import { Icon } from "./ui.jsx";

// First screen. Layout and classes follow the design in stitch_codefix_loginpage (code.html).
export default function Login({ online, canSignIn, error, onGitHub, onOffline }) {
  const [pending, setPending] = useState(false);
  const card = useRef(null);
  useAnime(card, () => { // the card's contents arrive one by one, the logo springs in
    enter(card.current.children, { delay: (el, i) => 100 + i * 60 });
    pop([card.current.firstElementChild], { scale: [0.4, 1], delay: 100 });
  }, []);

  async function github() {
    setPending(true);
    await onGitHub();
    setPending(false);
  }

  return (
    <div className="font-login min-h-screen bg-transparent text-slate-50 flex flex-col justify-between items-center py-8 px-4 selection:bg-blue-500/15 selection:text-blue-200">
      <header className="w-full max-w-5xl flex items-center justify-between py-2 px-4 text-xs font-medium text-slate-400">
        <div className="flex items-center gap-2" role="status">
          <span className={"inline-block w-2 h-2 rounded-full ring-4 " +
            (online ? "bg-emerald-500 ring-emerald-500/20 animate-pulse" : "bg-red-500 ring-red-500/20")}></span>
          <span className="font-mono text-slate-400">{online ? "API Online" : "API Offline"}</span>
        </div>
        <MotionToggle />
      </header>

      <main className="w-full flex flex-col items-center justify-center my-auto py-6">
        <div ref={card} className="glass-raised w-full max-w-[540px] rounded-[24px] p-8 sm:p-11 flex flex-col items-center text-center transition-all">
          <div className="w-24 h-24 sm:w-[92px] sm:h-[92px] bg-gradient-to-br from-blue-500 to-cyan-500 rounded-[22px] shadow-[0_0_40px_-8px_rgba(6,182,212,0.7)] float flex items-center justify-center mb-6 text-white">
            <Icon name="terminal" className="text-[48px]" />
          </div>

          <h1 className="text-[34px] sm:text-[36px] font-extrabold tracking-[-0.03em] text-slate-50 leading-tight mb-2">
            CodeFix <span className="text-blue-400">Agent</span>
          </h1>
          <div className="text-[17px] font-semibold text-slate-300 tracking-tight mb-3">AI Software Engineering Agent</div>

          <div className="inline-flex flex-wrap items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[13px] font-mono font-medium text-blue-400 mb-4">
            {["Understand", "Plan", "Modify", "Test", "Verify"].map((word, i) => (
              <span key={word} className="inline-flex items-center gap-1.5">
                {i > 0 && <span className="text-blue-300">•</span>}
                <span>{word}</span>
              </span>
            ))}
          </div>

          <p className="text-[15px] sm:text-[15.5px] text-slate-500 leading-relaxed max-w-[430px] mb-8 font-normal">
            Your intelligent coding agent that analyzes existing codebases, makes safe changes, and verifies that nothing breaks.
          </p>

          <div className="w-full mb-4">
            <button type="button" onClick={github} disabled={!canSignIn || pending}
                    className="sheen group w-full h-[60px] bg-gradient-to-r from-blue-600 to-blue-500 hover:brightness-110 active:scale-[0.99] text-white rounded-[14px] font-semibold text-[17px] flex items-center justify-center gap-3.5 shadow-btn-subtle hover:shadow-btn-hover transition-all duration-200 select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100">
              <svg className="w-6 h-6 fill-current flex-shrink-0 transition-transform group-hover:scale-105 duration-200" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span className="tracking-[-0.01em]">{pending ? "Waiting for GitHub…" : "Continue with GitHub"}</span>
            </button>
            {!canSignIn && (
              <p className="mt-2 text-[13px] text-slate-500">GitHub sign-in is not set up yet (frontend/src/firebase-config.js).</p>
            )}
            {error && (
              <p role="alert" className="mt-3 px-3 py-2 rounded-[10px] bg-red-500/10 border border-red-500/25 text-[13px] text-red-300 text-left whitespace-pre-wrap break-words">{error}</p>
            )}
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[13px] text-slate-500 mb-5 select-none">
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4.5 17.2L8.2 4.1C8.4 3.4 9.3 3.3 9.7 3.8L12.5 8.9L4.5 17.2Z" fill="#FFA000" />
              <path d="M12.5 8.9L15.4 3.4C15.8 2.8 16.7 3.0 16.9 3.7L19.5 17.2L12.5 8.9Z" fill="#F57C00" />
              <path d="M3.7 18.2L11.2 21.6C11.7 21.8 12.3 21.8 12.8 21.6L20.3 18.2C20.8 18.0 20.9 17.3 20.5 16.9L12.5 8.9L3.5 16.9C3.1 17.3 3.2 18.0 3.7 18.2Z" fill="#FFCA28" />
            </svg>
            <span>Secure authentication powered by <span className="font-medium text-slate-300">Firebase</span></span>
          </div>

          <div className="w-full mb-7">
            <button type="button" onClick={onOffline}
                    className="w-full h-[52px] bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.99] text-slate-50 border border-white/[0.08] hover:border-white/20 rounded-[14px] font-semibold text-[16px] flex items-center justify-center gap-3 transition-all duration-200 select-none">
              <Icon name="folder_open" className="text-[22px] text-slate-500" />
              <span className="tracking-[-0.01em]">Continue offline</span>
            </button>
            <p className="mt-2 text-[13px] text-slate-500">Local folders only, no GitHub account needed.</p>
          </div>

          <div className="w-full border-t border-white/[0.06] mb-5"></div>

          <div className="flex items-center justify-center gap-6 sm:gap-8 text-[13.5px] text-slate-300 font-medium select-none">
            {[["Secure", "bg-emerald-500/10 text-emerald-400"], ["Fast", "bg-blue-500/10 text-blue-400"], ["Reliable", "bg-emerald-500/10 text-emerald-400"]].map(([word, tone]) => (
              <div key={word} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={"flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold " + tone}>✓</span>
                <span>{word}</span>
              </div>
            ))}
          </div>
        </div>

        <footer className="mt-6 text-center space-y-1 select-none">
          <p className="text-[13px] text-slate-500 font-medium tracking-tight">AI × Code × Testing = Better Software</p>
          <div className="flex items-center justify-center gap-2 text-[12px] text-slate-400 font-mono">
            <span>Hackathon Project</span>
            <span>•</span>
            <span className="px-1.5 py-0.5 rounded bg-white/10 text-slate-400 font-semibold text-[11px]">HNX26PSI09</span>
          </div>
        </footer>
      </main>

      <aside className="text-center text-[12px] text-slate-400 py-2 max-w-xl">
        GitHub sign-in requests the repo scope. The token is kept only in this local server's memory and is gone when you sign out.
      </aside>
    </div>
  );
}
