import { useRef, useState } from "react";
import { enter, MotionToggle, useAnime } from "../motion.jsx";
import { CARD, Icon, Notice, button } from "./ui.jsx";

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
      <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-line">
        <div role="status" className="flex items-center gap-2 text-xs text-ink-2">
          <span aria-hidden="true" className={"inline-block w-2 h-2 rounded-full " + (online ? "bg-ok" : "bg-bad")}></span>
          <span>{online ? "API online" : "API offline"}</span>
        </div>
        <MotionToggle />
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-10 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <section data-enter>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">CodeFix Agent</h1>
          <p className="mt-3 text-base text-ink-2 max-w-md">An AI engineering agent that changes existing code safely and proves nothing broke.</p>
          <ol className="mt-8 space-y-4">
            {STAGES.map(([name, text], i) => (
              <li key={name} className="flex items-start gap-3">
                <span aria-hidden="true" className="w-7 h-7 shrink-0 rounded-full border border-line-strong bg-raised text-accent-fg text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-ink">{name}</p>
                  <p className="text-sm text-ink-2">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section data-enter className={CARD + " p-6 sm:p-8"}>
          <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
          <button type="button" onClick={github} disabled={!canSignIn || pending} className={button("primary", "lg") + " w-full mt-5 gap-3"}>
            <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>{pending ? "Waiting for GitHub…" : "Continue with GitHub"}</span>
          </button>
          {!canSignIn && <p className="mt-2 text-xs text-ink-3">GitHub sign-in is not set up yet (frontend/src/firebase-config.js).</p>}
          {error && <Notice tone="bad" className="mt-3 whitespace-pre-wrap">{error}</Notice>}

          <div className="my-5 flex items-center gap-3 text-xs text-ink-3" aria-hidden="true">
            <span className="flex-1 border-t border-line"></span>or<span className="flex-1 border-t border-line"></span>
          </div>

          <button type="button" onClick={onOffline} className={button("secondary", "lg") + " w-full"}>
            <Icon name="folder_open" className="text-xl" />
            <span>Continue offline</span>
          </button>
          <p className="mt-2 text-xs text-ink-3">Local folders only, no GitHub account needed.</p>

          <p className="mt-6 text-xs text-ink-3">
            GitHub sign-in requests the repo scope. The token is kept only in this local server's memory and is gone when you sign out.
          </p>
        </section>
      </main>

      <footer className="px-4 py-4 text-center text-xs text-ink-3">Hackathon project · HNX26PSI09</footer>
    </div>
  );
}
