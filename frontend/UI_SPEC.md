# CodeFix Agent — UI/UX spec (remake of the "Obsidian Kinetic" UI)

Scope: frontend only. The API contract (`src/api.js`, `server.py`) does not change. Every feature in
`Frontend_Requirements.docx` (FR-1 … FR-12) stays wired. No new dependencies.

## 1. What was wrong (audit)

| Problem | Where | Fix |
|---|---|---|
| Layout reshuffles between 2 and 3 columns with three different width sets (idle / live / done); the run form sits above the projects so navigation is buried | `App.jsx` GRID | Fixed app shell: header + project sidebar + one main view |
| The run form is always on screen even while you read a project or a finished run; during a run it turns into read-only fields | `ConfigColumn` | Form ("composer") only lives in the Home and Project views; the run view shows task/repo as read-only text |
| Results for one run are split over three columns (progress, metadata+imports, results) | App / Progress / Results | One Run view: steps on the left, outcome on the right, metadata under it |
| Glass panels, ambient blobs, spotlight; slate-500 text on translucent surfaces fails contrast | `index.css`, everywhere | Solid surfaces, tokenised palette, muted text ≥ 4.5:1 |
| `window.confirm` for PR and "write into folder" | `ProjectView` | Styled `ConfirmDialog` on native `<dialog>` |
| Segmented "radio" buttons have no arrow-key support; account menu never closes on Escape / outside click | ConfigColumn, Header | Native radio inputs; native `popover` menus |
| You cannot leave a live run (button only after it finishes), although the run keeps going (FR-9) | App | "Leave (run keeps going)" during a live run; "Show live run" on a busy project |
| Cumulative diff and stored runs replace the project card with a bare detail view | ProjectView | Tabs: History / Changes / Activity; stored run opens in the shared Run view |
| Loading = plain "Loading…" text; first paint is blank (`return null`) | everywhere | Skeletons, a splash while `/api/me` answers |
| Copy button gives no feedback | ui.jsx | "Copied" state + live region |
| Run button allowed with an empty task (server answers 400) | ConfigColumn | Disabled until a task is typed |

## 2. Design tokens (tailwind.config.js)

Dark only, solid surfaces. Use Tailwind default type scale and radii (custom fontSize / radius / spacing tokens are removed).

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#0b0f17` | page background |
| `surface` | `#121826` | cards, sidebar, header |
| `raised` | `#1a2233` | inputs, hover rows, menus, dialogs |
| `line` | `#253049` | borders, dividers |
| `line-strong` | `#33405c` | input borders, hover borders |
| `ink` | `#e6eaf2` | primary text |
| `ink-2` | `#b4bccb` | secondary text |
| `ink-3` | `#8a94a8` | meta / hints (minimum for text; ≥4.5:1 on surface) |
| `accent` | `#2f6fe4` | primary button bg (white text ≥4.5:1) |
| `accent-hover` | `#3d7cf0` | primary hover |
| `accent-fg` | `#8ab4ff` | accent used as text/icon on dark, focus ring, selection |
| `ok` | `#34d399` | success text/icons; backgrounds use `bg-ok/10`, borders `border-ok/30` |
| `warn` | `#fbbf24` | busy / retry / env fault |
| `bad` | `#f87171` | failure, destructive |

Fonts: Geist Variable (UI), JetBrains Mono (code, ids, shas, paths). Inter is dropped.
Sizes: body `text-sm` (14px); meta `text-xs` (12px, never smaller except diff gutters); card titles `text-base font-semibold`; view titles `text-xl`/`text-2xl font-semibold tracking-tight`.
Radius: controls `rounded-md`, cards `rounded-xl`, pills `rounded-full`.
Focus: `:focus-visible { outline: 2px solid accent-fg; outline-offset: 2px }` everywhere; never remove it.
Motion: keep the Motion switch (FR-11) and `html.motion` gating; keep anime.js enter/pop/CountUp; drop the glass spotlight, drift, sheen, scan.

## 3. Shared primitives (`src/components/ui.jsx`)

- `Icon` (unchanged API), `short`, `plural`, `duration`, `ago`, `KIND`, `KindBadge` (restyled).
- `button(variant = "secondary", size = "md")` → class string. Variants: `primary`, `secondary`, `ghost`, `danger`. Sizes: `sm` (h-8), `md` (h-9), `lg` (h-11). Disabled = 50% opacity + not-allowed.
- `FIELD` → class string for input / select / textarea.
- `CARD` → `"rounded-xl border border-line bg-surface"`.
- `Notice({ tone: "info"|"ok"|"warn"|"bad", title, children, onDismiss, className })` — icon + text; `role="alert"` for `bad`, `role="status"` otherwise; optional dismiss button (`aria-label="Dismiss"`).
- `StatusPill({ status })` — `success` "Succeeded", `failed` "Failed", `env_failed` "Env failed", `running` "Running" (spinner), anything else "Not started". Icon + text (never colour alone).
- `Copy({ text, label = "Copy" })` — shows "Copied" for 1.5 s; announces via `aria-live`.
- `Skeleton({ className })` — pulsing block (`motion-safe` pulse only when `html.motion`).
- `Spinner({ className })`.
- `Dialog({ title, onClose, children })` (native `<dialog>`, unchanged behaviour, restyled) and
  `ConfirmDialog({ title, children, confirmLabel, danger, onConfirm, onClose })` — Cancel + confirm buttons; Cancel is autofocused.

## 4. App shell (`App.jsx`, `Header.jsx`, `Projects.jsx`)

```
[skip link "Skip to content"]
header (sticky, h-14, bg-surface, border-b)
  logo + "CodeFix Agent" | breadcrumb | ……… | API status pill | Motion switch | account
body  lg: grid [280px | 1fr]
  nav#projects  (sticky under header, own scroll)   main#main
    "New run" button                                  global error Notice (dismissable)
    filter box (when > 4 projects)                    one view: Home | Project | Run
    project list / skeleton / empty state
    signed-out callout (Sign in with GitHub)
```
- Below `lg` the sidebar stacks above main; its list is capped at `max-h-64` with its own scroll.
- Breadcrumb (`crumbs` prop): `Home` → `<project name> @ <head sha>` → `Run <id>`; earlier crumbs are buttons. Replaces the "project: name @ head" label (shown when the form is linked to the project), otherwise shows the repository name.
- API status: dot + text ("API online" / "API offline"); `role="status"`.
- Account (signed in): avatar button opens a native `popover` menu: "Signed in as <login>" (link to profile) + "Sign out". Signed out: "Offline mode" badge (md+) + "Sign in" button (FR-12 / known gap: returns to the login screen).
- Splash while the first `/api/me` is pending: centred logo + spinner + "Connecting to the local server…".
- Focus: when the view changes (home ↔ project ↔ run ↔ stored run), focus moves to the view's heading (`id="view-title"`, `tabIndex={-1}`).

Views (App decides):
- **Home** (no active project, no run): h1 "Start a new run" + one-line explainer, `Composer` in a card, and a 4-step strip "Understand → Change → Test → Verify" with one sentence each.
- **Project** (active project, no run): `ProjectView` with the `Composer` passed in as `composer`.
- **Run** (`busy || run`): `RunView`.

Sidebar project row (button, `aria-current="page"` when active): status dot + sr-only text, name, `KindBadge`, env text (`env ready` / `env missing` / `running…` with spinner); second line mono meta `branch · N changes · N runs · 2 min ago`. Empty state: "No projects yet" + "Your first run creates one." Loading: 3 skeleton rows. "New run" is highlighted (`aria-current`) on Home.

## 5. Composer (`ConfigColumn.jsx`, default export `Composer`, keeps `TYPES` export)

Props: `form, setForm, me, repos, onRefreshRepos, busy, onRun, linked, conflict`.
- Task type: segmented control of native radios "Debug — fix a bug" / "Feature — add behaviour". Switching keeps the sample-swap rule (FR-2/§5 of requirements).
- Repository:
  - When `linked` (a project is active and the field still points at it): read-only summary "Runs on **name** · continues from head `abc1234` · N earlier changes kept" + ghost button "Use a different repository" which reveals the selector below.
  - Selector: native radio group "Whose repository?" My repo / Other's / Local (fieldset + legend, arrow keys work). GitHub modes disabled when signed out with a visible hint "Sign in with GitHub to use GitHub repositories." (FR-7).
  - My repo: select (+ "Loading…" / "No repositories found", "(private)" suffix, project repo stays selectable) + refresh icon button `aria-label="Refresh repository list"`.
  - Other's: input, placeholder `https://github.com/owner/name`, hint "A public repository you can't push to. CodeFix forks it."
  - Local: input, hint "Folder path or git URL. Your original folder is never modified."
- Task: label = `TYPES[type].label`; textarea 4 rows, placeholder "Describe the next bug or feature…"; hint "Ctrl+Enter to run" (+ for Feature "Name any required function or module exactly."). Ctrl/Cmd+Enter submits.
- Submit: `button("primary","lg")` full width, "Run repair" (debug) / "Build feature" (feature), `play_arrow` icon; "Starting…" while `busy`; disabled while busy or task empty.
- `conflict` → `Notice tone="warn"`: "Project is busy. A run is already active on <name>. You can start a run on another project."

## 6. Project view (`ProjectView.jsx`)

Props: `project, composer, onChanged, onDeleted, onRerun, onSignedOut, onWatch`.
- Header card: h1 name (`id="view-title"`) + KindBadge; source line (local: "Snapshot of <folder> · your original folder is unchanged"); toolbar:
  - GitHub: `Open PR`/`Update PR` (primary), `Sync with upstream`, link "View pull request" when https.
  - Local: `Export patch` (primary).
  - `More` menu (native popover): `Reset to…`, `Rebuild environment`, separator, `Delete project` (danger).
  - Disabled while busy or another action works (except tabs). Busy → `Notice warn` "A run is in progress on this project." + button "Show live run" (`onWatch`).
- Action outcome: `Notice` under the toolbar (same texts as today), `role="status"`; 409 = warn, error = bad.
- State tiles `dl` (2 cols mobile, 5 on xl): Branch, Head, Ahead of base, Environment, Locked tests.
- Section "Run a new task" containing `composer`.
- Tabs (WAI-ARIA tabs, arrow keys / Home / End): **History (N)**, **Changes**, **Activity (N)**.
  - History: rows = StatusPill, task (button → stored run in `RunView stored`), mono meta, `Re-run` button (fills composer, focuses task box). Running row: "Show live" → `onWatch`. Skeleton while `runs === null`; empty "No runs yet. Describe a task above to start one." Base line at the bottom.
  - Changes: loads `GET …/diff?from=base` on first open; skeleton; error Notice; empty "No changes ahead of base."; meta "base abc → head def · N changes"; `<Changes r={{ diff }} />`.
  - Activity: project events (kind · detail · ago); empty "No resets, syncs or exports yet."
- PR and "Write into the original folder…" use `ConfirmDialog` (texts from today's `window.confirm`). Reset and Delete dialogs keep their behaviour and strings.

## 7. Run view (`Results.jsx` default export `RunView`; `Progress.jsx` exports `Steps`, `BuildsOn`)

`RunView` props: `run, busy, steps, elapsed, head, project, task, taskType, repoLabel, onBack, backLabel, stored`.
- Header card: back button (`onBack`; label `backLabel`; while live it reads "Leave — run keeps going"), StatusPill + timer (`m:ss`, tabular), h1 = task (`id="view-title"`), meta: repo · Debug/Feature · run id · "continuing from head abc1234". Stored runs: "Past run" tag and step timings come from the steps.
- sr-only `aria-live="polite"` line: "Step <name> running" / final status.
- Body: `xl:grid-cols-[minmax(300px,360px)_1fr]`.
  - Left: `Steps` — vertical timeline (connector line, numbered nodes, state icon + sr text, name, duration, detail). Running step highlighted with `aria-current="step"`; rejected attempt followed by another = "retry" (warn). Sticky on xl.
  - Right, live: "Working on: <current step>" card + `BuildsOn` (what the run builds on; "If this run fails, the project goes back to abc1234.").
  - Right, finished: outcome banner (Succeeded / Failed / Environment setup failed, one-line summary, chip "Change committed" / "Working copy reverted" / "Run halted"), "What changed & root cause" (success), syntax repair, failure diagnostics `<pre>`, note, test matrix (before/after) + regressions + new tests, `Changes` (file picker + diff), Run metadata (branch, attempts, reproduced/mode, report path + commit with Copy), Verified imports.
- `Changes({ r })` stays exported (used by ProjectView). File list = toggle buttons (`aria-pressed`); diff in a focusable scroll region; ± signs and line numbers so colour is not the only cue.

## 8. Login (`Login.jsx`)

Two columns on lg (left: name, one-line pitch, the 5 stages Understand / Plan / Modify / Test / Verify as a short list; right: sign-in card), one column on mobile. Card: "Continue with GitHub" (primary, lg; "Waiting for GitHub…"; disabled when not configured + the not-configured hint), error `Notice bad`, divider "or", "Continue offline" (secondary) + "Local folders only, no GitHub account needed.", token note. Top bar: API status + Motion switch. Drop the decorative Secure/Fast/Reliable row and the Firebase logo.

## 9. Accessibility checklist (all agents)

Landmarks (`header`, `nav`, `main`), one `h1` per view, skip link, labels on every control, `aria-current` for active nav/step, visible focus, no colour-only status, 44px min touch targets on mobile for primary actions, `prefers-reduced-motion` respected via the Motion switch default, dialogs on native `<dialog>`, menus on native `popover`, no horizontal page scroll at 360px (diffs scroll inside their own box).
