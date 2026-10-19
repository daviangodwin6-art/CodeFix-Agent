import { useRef, useState } from "react";
import { enter, MotionToggle, useAnime } from "../motion.jsx";
import { CARD_CORNERS, Icon, Logo, Notice, PanelTitle, Ring, button } from "./ui.jsx";
import { ApiStatus } from "./Header.jsx";

const STAGES = [
  ["Understand", "Reads the repository and finds the code your task touches."],
  ["Plan", "Decides the smallest change that solves it."],
  ["Modify", "Edits a copy, never your original folder."],
  ["Test", "Runs the tests, old and new, in an isolated environment."],
  ["Verify", "Checks nothing else broke before anything is committed."],
];

export default function Login({ online, canSignIn, error, onGitHub, onOffline }) {
  const [pending, setPending] = useState(false);
  const root = useRef(null);
  useAnime(root, () => enter(root.current.querySelectorAll("[data-enter]")), []);

  async function github() {
    setPending(true);
    await onGitHub();
    setPending(false);
  }

  return (
    <div ref={root} className="min-h-screen bg-canvas text-ink flex flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-line bg-surface">
        <ApiStatus online={online} />
        <MotionToggle />
      </header>

      <main className="flex-1 w-full max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex items-center">
        <div className={CARD_CORNERS + " w-full p-5 sm:p-8"}>
          <section data-enter className="flex flex-col items-center text-center">
            <div aria-hidden="true" className="relative flex items-center justify-center bg-[radial-gradient(circle,rgba(214,31,36,0.22),transparent_65%)]">
              <Ring value={1} size={152} stroke={3}>
                <Logo className="w-14 h-14" />
              </Ring>
            </div>
            <h1 className="mt-4 font-display text-3xl sm:text-4xl font-bold uppercase tracking-tight">CodeFix Agent</h1>
            <p className="mt-2 text-sm text-ink-2 max-w-sm">An AI engineering agent that changes existing code safely and proves nothing broke.</p>
          </section>

          <ol data-enter className="mt-6 hud-well divide-y divide-line">
            {STAGES.map(([name, text], i) => (
              <li key={name} className="flex items-start gap-3 px-3 py-2">
                <span aria-hidden="true" className="font-mono text-xs font-semibold text-gold leading-5">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-ink leading-5">{name}</p>
                  <p className="text-xs text-ink-2">{text}</p>
                </div>
              </li>
            ))}
          </ol>

          <section data-enter className="mt-6">
            <PanelTitle icon="lock">Sign in</PanelTitle>
            <button type="button" onClick={github} disabled={!canSignIn || pending} className={button("primary", "lg") + " w-full mt-4 gap-3"}>
            <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>{pending ? "Waiting for GitHub…" : "Continue with GitHub"}</span>
            </button>
            {!canSignIn && <p className="mt-2 text-xs text-ink-3">GitHub sign-in is not set up yet (frontend/src/firebase-config.js).</p>}
            {error && <Notice tone="bad" className="mt-3 whitespace-pre-wrap">{error}</Notice>}

            <div className="my-4 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3" aria-hidden="true">
              <span className="flex-1 border-t border-line"></span>or<span className="flex-1 border-t border-line"></span>
            </div>

            <button type="button" onClick={onOffline} className={button("secondary", "lg") + " w-full"}>
              <Icon name="folder_open" className="text-xl" />
              <span>Continue offline</span>
            </button>
            <p className="mt-2 text-xs text-ink-3">Local folders only, no GitHub account needed.</p>

            <p className="mt-5 pt-4 border-t border-line text-xs text-ink-3">
              GitHub sign-in requests the repo scope. The token is kept only in this local server's memory and is gone when you sign out.
            </p>
          </section>
        </div>
      </main>

      <footer className="px-4 py-4 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">Hackathon project · HNX26PSI09</footer>
    </div>
  );
}
