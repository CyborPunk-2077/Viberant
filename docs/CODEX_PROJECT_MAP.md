# Project Map

*Navigation/reference document for coding agents. See `AGENTS.md` for
operating rules; this file is the detailed map. Verified against the repo at
the time of writing — paths and route names below were checked, not guessed.*

## 1. Project Overview

Viberant is a Windows desktop app that manages one developer project across
several AI coding tools (Claude Code, Codex, Cursor, Gemini CLI, Windsurf, VS
Code, Antigravity), multiple accounts per tool, GitHub save/send, website
deployment (Vercel), and a peer-to-peer "Workspace" for collaborating with
other people/computers (shared projects, presence, live notes, file/folder
offers, incremental sync with conflict resolution).

Stack: Electron (packaging only) + Node 22+ ES modules, zero npm dependencies
in the app itself, vanilla JS/HTML/CSS frontend (no framework, no bundler, no
build step for the UI). Local-first: all state is JSON/JSONL under the user's
home folder; there is no Viberant-operated server or database. Computer-to-
computer communication is direct (UDP broadcast for discovery + TCP for data,
falling back to a relay), authenticated with an Ed25519 device key
(`app/device.mjs`).

## 2. Runtime Architecture

```
desktop/main.js (Electron)
  → spawns  app/server.mjs  as a child process (or reuses one already running)
  → polls http://127.0.0.1:7777 until it answers
  → opens a BrowserWindow pointed at it

app/server.mjs (plain node:http server, no framework)
  → serves app/ui/{shell.html,app.js,style.css,wallpaper.js} as static files
  → answers ~150 JSON routes (`routes` object, `'METHOD /path'` keys)
  → GET /events is a Server-Sent-Events stream (chatter.listen)
  → anywhere.whenSomebodyArrives(peer => ...) answers OTHER computers
    connecting in (answerPeer), independent of the browser UI

app/ui/app.js (loaded by shell.html, no build step)
  → router: go(tab) → SCREENS[tab]() → view.innerHTML = ...
  → every action is a fetch() to a server.mjs route
  → EventSource('/events') keeps the open screen live without polling
```

Also runnable headless: `node app/server.mjs` then open
`http://localhost:7777` in any browser — the Electron shell adds nothing but
packaging and a native window/tray.

`npm run build` (`electron-builder`) packages `app/**`, `desktop/**`,
`core/reference/src/**` into `dist/win-unpacked` and an NSIS installer
`dist/Viberant-Setup-<version>.exe`. Tests and `.md` files are excluded from
the package (`package.json` → `build.files`).

## 3. Repository Map

### `app/` (root of the running application)

Every file here is a single-purpose ES module imported by `server.mjs` as
`import * as name from './name.mjs'`. No shared mutable state between modules
except through function calls.

| File | Responsibility |
|---|---|
| `server.mjs` | HTTP server, all routes, in-memory session state (`current` project, `machine` id), peer-connection listener/dispatcher (`answerPeer`) |
| `members.mjs` | Workspace membership: create/invite/redeem/revoke, roles (`owner`/`member`/`viewer`?), capability table `WHAT_ROLES_MAY_DO`, synchronous `members.now()` snapshot |
| `anywhere.mjs` | Presence + reachability across LAN/direct/relay; `beAbout()` opens the incoming-connection listener; `reach(deviceId)` dials another computer trying LAN → direct → relay in order |
| `peers.mjs` | Low-level connection handling: `listenDirect`, `dialDirect`, framing/handshake, the `DIRECT`/`RELAY`/`LAN` connection kinds |
| `channels.mjs` | Multiplexes one peer connection into named channels (`ask`, `sync:<id>`, `artifact`, `preview:<port>`) |
| `chatter.mjs` | Append-only event log (workspace notes + `project.changed`/`sync.completed`/`sync.failed`); `GET /events` SSE and `GET /workspace/notes` both read from here |
| `lan.mjs` | LAN discovery broadcast/listen, and the local "offers" registry (files/folders one computer is sharing): `offer`/`withdraw`/`offers`/`offeredBy` |
| `sync.mjs` | Incremental sync primitives: `manifest` (survey a folder), `compare`, `conflicts`, `bring` (client side), `serve` (host side) |
| `parcel.mjs` | Whole-folder transfer: `survey`, `weigh`, `wrap` (stream a folder as a parcel) — used by sync, live-take, and remote "bring built" |
| `snapshots.mjs` | "Ways back" — snapshot-before-overwrite safety net for sync/conflict resolution |
| `workspace.mjs` | The **older** GitHub-repo-backed workspace (a private `viberant-workspace` repo holding machine/offer/note state). Still reachable from the Workspace screen as "your own computers, through GitHub" |
| `device.mjs` | Device identity: Ed25519/X25519 keypair generation, `card()` (public identity), `sharedWith`/`seal`/`open` (encrypt for a specific device) |
| `joining.mjs` | The invite-code redemption flow for a computer that has never seen a workspace before (UDP-based discovery of the inviter) |
| `remote.mjs` | Running commands / opening terminals on a workspace member's computer (permission-gated via `mayAsk`) |
| `machines.mjs` | "What this computer is" facts (OS, tool versions) used for AI-assisted machine comparison |
| `assistant.mjs` | AI provider catalogue (Claude/OpenAI/Gemini), `TROUBLE` failure classification, `askAbout`/`diagnose`/`reviewChanges`/`proposeChange`/`apply` |
| `providers.mjs` | Deployment provider abstraction (currently Vercel): `inspect`, `bind`, `health` |
| `deploy.mjs` | Website vs. application deploy flows built on `providers.mjs` |
| `github.mjs` | Everything GitHub: account/session, save/send (`saveOnly`, `getLatest`), repo binding, visibility, history, undo |
| `google.mjs` | Google sign-in (separate account slot from GitHub) |
| `projects.mjs` | Remembered projects list, marks (favorites), `situation()` (git status in plain English), sharing/privacy flags |
| `profiles.mjs` | More-than-one-account-per-tool: saved profiles, switching without signing out |
| `tools.mjs` | Catalogue of AI coding apps (Claude Code, Codex, Cursor, …), install detection, launch |
| `terminals.mjs` | Terminal catalogue (Windows Terminal, PowerShell, …), kept deliberately separate from `tools.mjs` |
| `browse.mjs` | Native folder/file choosers (`chooseFolder`, `chooseFile`) and the in-app folder browser (`look`) |
| `settings.mjs` | All persisted settings: schema (`KNOWN`), get/set, redacted listing |
| `jobs.mjs` | Long-running errand tracking (transfers, builds, syncs) shown in the Activity tab |
| `activity.mjs` | The Activity feed's own event log (distinct from `chatter.mjs`, which is workspace-scoped) |
| `feedback.mjs` | "Tell us what is wrong" submission |
| `firstpublish.mjs` | First-time GitHub publish helper (readme/gitignore/license generation) |
| `carried.mjs` | Tracks what a resumable transfer has moved so far |
| `artifacts.mjs` | Sending/receiving a remote build's output folder |
| `preview.mjs` | Remote dev-server preview windows |
| `newer.mjs` | Update-check (never auto-installs; see `00_DECISIONS.md` on updater policy) |
| `findtools.mjs` | PATH-widening helper so launched tools can find `git`/`node`/etc. |
| `fingerprint.mjs` | Content fingerprinting used to detect "is this the same project" |
| `signin.mjs` | Generic OAuth-device-flow-style sign-in helper shared by github/google |
| `live.mjs` | "Live" cross-computer project takeover (older mechanism, largely superseded by `sync.mjs` + Workspace) |
| `windowed.mjs` | Detects whether the current process is a console or window app (used to avoid the "no window" flag leaking into launched tools) |
| `contents.mjs` | Reads file contents for the AI assistant's file-aware answers |
| `thisapp.mjs` | Small self-identification helper |

### `app/ui/`

* `shell.html` — the static skeleton the server serves at `/`.
* `app.js` (~8500 lines) — router (`go`, `draw`, `fill`), all `SCREENS.*`
  functions, all `fetch()` calls, all inline template-literal HTML. No
  framework, no virtual DOM; `fill(box, html)` diffs against last-painted HTML
  to avoid redundant redraws.
* `style.css` (~3800 lines) — one token system (colors, spacing, radii as CSS
  custom properties), then per-component rules grouped by screen.
* `wallpaper.js` — decorative animated background, self-contained.

### `app/test/`

One `.test.mjs` file per concern, run with `node --test`. Notable ones:

* `workspace-flow.test.mjs`, `delivery.test.mjs` — spin up two real
  `server.mjs` child processes to prove membership/presence/sync/notes work
  end-to-end between computers.
* `across.test.mjs`, `syncing-across.test.mjs` — cross-computer transfer
  correctness (integrity, resume, conflicts).
* `words.test.mjs` — scans all user-facing strings in the whole `app/` tree
  for version-control jargon; fails the build if any appears.
* `wiring.test.mjs` — checks every `fetch()` call in `app.js` has a matching
  route in `server.mjs` (and vice versa).
* `helpers/` — shared test utilities (spawning a second server instance, etc).

### `core/`

A separate, older event-sourcing "effort" engine (state machine + append-only
store + summarizer), documented in `core/README.md`. Its own test suite lives
in `core/reference/test/`. Largely decoupled from the rest of the app; consult
`core/README.md` before touching it.

### `desktop/`

* `main.js` — Electron main process: spawn server, wait, open window, tray.
* `trouble.html` — fallback page if the server never comes up.

### `build/`

Icon generation script (`icon.mjs`) run before packaging.

### `experiments/`

Point-in-time measurement writeups (e.g. `quiescence/FINDINGS.md`) that
justified specific numeric decisions (like the 180s silence threshold). Not
code to maintain — historical evidence for `00_DECISIONS.md`.

## 4. Application Entry Points

* **Electron**: `desktop/main.js` → spawns `app/server.mjs` → opens window at
  `http://127.0.0.1:7777`.
* **Headless/dev**: `node app/server.mjs` (or `npm start`) → same server,
  open `http://localhost:7777` in any browser.
* **Server startup** (`app/server.mjs`, bottom of file): `createServer(...)`,
  binds port `process.env.PORT || 7777`, then on `listening` kicks off
  `anywhere.beAbout()` (if already in a workspace) to start being reachable by
  other computers, and `watchWhatIsOffered()` to notice local file/folder
  changes.
* **Frontend bootstrap**: `shell.html` loads `app.js`, which calls `go('projects')`
  (or the last-open tab) on load and opens the SSE connection.

## 5. UI Architecture

Single-page app, no router library: `go(tab)` sets `location.hash`, calls
`SCREENS[tab]()`, which builds an HTML string and assigns it to
`view.innerHTML` (via the `fill()`/`draw()` helpers, which skip the DOM write
if the produced HTML is unchanged from last time — this is how live updates
avoid flicker/scroll-reset). Left nav (`TABS` array, top of `app.js`) has 8
entries: Projects, AI Assistant (`ask`), AI apps (`apps`), Terminals, Workspace,
Activity, Deploy (`ship`), Settings, plus a Feedback link.

Reusable pieces (all in `app.js`, no separate component files):
* `inspect(what)` / `inspectSharedProject` / `inspectTeamDevice` /
  `inspectPerson` — the right-hand contextual inspector panel used throughout
  Workspace.
* `sheet({...})` — modal/sheet dialogs (offer menus, conflict resolution, etc).
* `mark(...)` — inline SVG icon builder (no icon font/library).
* `KIND_MARK` — the icon set for file/folder/project rows.

Feature → file mapping (all inside `app/ui/app.js` unless noted):

| Feature | Where |
|---|---|
| Projects list/open/save/send | `SCREENS.projects` |
| Ask the AI about this project | `SCREENS.ask` (backend: `assistant.mjs`) |
| AI coding apps launcher | `SCREENS.apps` (backend: `tools.mjs`, `profiles.mjs`) |
| Terminals launcher | `SCREENS.terminals` (backend: `terminals.mjs`) |
| **Workspace** (people/devices/projects/notes/shares) | `SCREENS.workspace`, `drawWorkspaceOverview` (older GitHub view), `projectInWorkspace`, `wireProjectInWorkspace`, `offerSomething`/`offerFile`/`offerFolder`, `whatTheyShare`, `drawWorkspaceNotes`/`noteArrived`/`sendOneNote` |
| Activity feed | `SCREENS.activity` (backend: `activity.mjs`, `jobs.mjs`) |
| Deploy/Ship | `SCREENS.ship` (backend: `deploy.mjs`, `providers.mjs`) |
| Settings (accounts, AI keys, updates, diagnostics) | `SCREENS.settings`, `drawGitHubSettings`, `drawGoogleSettings`, `drawNewerSettings` |
| Feedback form | `SCREENS.feedback` |

## 6. Backend / Server Architecture

`app/server.mjs` exports nothing; it is the composition root. Structure:

1. Imports every `app/*.mjs` module as a namespace.
2. Module-level mutable session state: `current` (open project), `machine`
   (this device's id/name cache).
3. `const routes = { 'GET /x': async ({ url, body }) => {...}, ... }` — one
   object, ~150 entries, grouped by comment headers (who/where, projects,
   GitHub, deploy, AI, workspace, remote, etc). `grep -n "// --" app/server.mjs`
   shows the section boundaries.
4. A plain `createServer` request handler parses the method+path, looks it up
   in `routes`, parses JSON body for POST, calls the handler, writes JSON back.
   Unmatched routes serve static files from `app/ui/`.
5. `GET /events` is handled specially: it's a long-lived SSE connection fed by
   `chatter.listen(fn)`.
6. `anywhere.whenSomebodyArrives((peer) => {...})` is registered once at
   startup — this is the **inbound** side of the peer protocol, separate from
   the HTTP routes, and is how another computer's browser-triggered actions
   (asking for a sync, asking what's offered, sending a note) reach this
   process. Dispatch is `answerPeer(peer, asked)` with one `if (asked.what ===
  '...')` branch per message kind (see `AGENTS.md` high-risk note about
  duplicate branches).

Request flow for a typical UI action: browser `fetch('/x')` → route handler in
`server.mjs` → one or more `app/*.mjs` module calls → JSON response. For a
cross-computer action: browser `fetch('/workspace/changes')` → route handler
→ `anywhere.reach(deviceId)` (dials the other computer) → `askPeer(peer, {what:
'...'})` → the other computer's `answerPeer` → response relayed back → JSON to
this browser.

## 7. Data / Persistence

Everything lives under the OS home folder (typically a `.viberant`-style
directory per module — check each module's own `*_FILE`/`*_AT` constant, e.g.
`members.mjs`'s `BOOK_FILE`, `chatter.mjs`'s `CHATTER_FILE`, `activity.mjs`'s
`BOOK_AT`, `carried.mjs`'s `BOOK_AT`). Formats are plain JSON (one file) or
JSONL (append-only logs like chatter). No database, no ORM, no migrations —
each module owns its own read/write and its own "if the file doesn't exist,
here's the default shape" logic.

Key stores:
* **Membership book** (`members.mjs`) — all workspaces this computer knows
  about, keyed by workspace id, with `devices`, `revoked`, invite codes.
* **Chatter log** (`chatter.mjs`) — append-only JSONL of workspace events
  (notes, `project.changed`, `sync.completed/failed`), pruned to `KEEP` most
  recent.
* **Offers registry** (`lan.mjs`) — what this computer is currently sharing.
* **Settings** (`settings.mjs`) — single JSON file, schema declared in `KNOWN`.
* **Projects list** (`projects.mjs`) — remembered project paths + marks.
* **Device identity** (`device.mjs`, `KEY_FILE`) — the Ed25519/X25519 keypair;
  never transmitted, never logged.
* **core/reference** — its own append-only event store (`core/reference/src/store.mjs`),
  independent of everything above.

## 8. Major Feature Maps

### Projects
UI: `SCREENS.projects` (`app/ui/app.js`).
Logic: `app/projects.mjs` (remembered list, marks, `situation()`), `app/github.mjs`
(save/send).
Persistence: `projects.mjs`'s own JSON file.

### Workspace
UI: `SCREENS.workspace`, `projectInWorkspace`, inspector functions (`app/ui/app.js`).
Server: routes under `/team/*`, `/workspace/*`, `/local/*` in `server.mjs`.
Membership: `app/members.mjs`.
Realtime/Presence: `app/anywhere.mjs`, `app/peers.mjs`, `GET /events` SSE.
Chat/Notes: `app/chatter.mjs` (`GET /workspace/notes`, `POST /workspace/say`).
Sync: `app/sync.mjs`, `app/snapshots.mjs` (`POST /workspace/changes`,
`POST /sync/bring`).
Shares (file/folder offers): `app/lan.mjs` (`POST /local/offer`, `GET
/local/offers`, `POST /local/withdraw`, `POST /local/take`).
Important files: `app/members.mjs`, `app/anywhere.mjs`, `app/peers.mjs`,
`app/chatter.mjs`, `app/sync.mjs`, `app/lan.mjs`, `app/ui/app.js` (§ Workspace
section, roughly lines 6000–7600).

### File/Folder Transfer (general, not just Workspace)
Offer flow: `app/lan.mjs` `offer`/`offeredBy`/`withdraw`.
Download/bring flow: `POST /local/take` → `lan.take` → `app/parcel.mjs` `wrap`/stream.
Progress/resume: `app/jobs.mjs` (job tracking shown in Activity), `app/carried.mjs`
(resumable transfer bookkeeping).
Important files: `app/lan.mjs`, `app/parcel.mjs`, `app/carried.mjs`, `app/jobs.mjs`.

### GitHub
Authentication: `app/github.mjs` `signin`/`session`/`who`, `app/signin.mjs`
(shared OAuth-device-flow helper).
Repository binding: `bindingOf`/`connectTo`/`destinationFor`.
Push/save flow: `saveOnly`/`getLatest`/`undoLastSave`.
Important files: `app/github.mjs`, `app/signin.mjs`, `app/firstpublish.mjs`.

### Deployment (Vercel)
Connection/auth: `app/providers.mjs` `bind`.
Project detection: `providers.mjs` `inspect`.
Deployment: `app/deploy.mjs` `putSiteOnline`/`makeApplication`.
Status polling: `providers.mjs` `health`.
Important files: `app/deploy.mjs`, `app/providers.mjs`.

### AI
Providers: `app/assistant.mjs` `CATALOGUE`/`MODELS` (Claude/OpenAI/Gemini).
Model configuration: `assistant.mjs` `whatTheyOffer` (audits configured model
IDs against what the account actually supports).
API flow: `askAbout`/`diagnose`/`reviewChanges`/`proposeChange`/`apply`.
Error handling: `TROUBLE` enum + `whatThatMeant()` (classifies provider HTTP
status/error code into user-facing categories — invalid key, billing required,
rate limit, model unavailable, provider/network failure — never guesses).
Important files: `app/assistant.mjs`, routes `/ai/*` in `server.mjs`,
`SCREENS.ask` in `app.js`.

### Accounts / Profiles
Flow: `app/profiles.mjs` (save/use/forget a named account profile per tool),
`app/github.mjs` + `app/google.mjs` (the two sign-in-able services).
Storage: `profiles.mjs`'s own JSON file; device keys in `app/device.mjs`.
Important files: `app/profiles.mjs`, `app/github.mjs`, `app/google.mjs`,
`app/device.mjs`.

## 9. Realtime / Networking

* **SSE**: `GET /events` — one persistent connection per open browser tab,
  fed by `chatter.listen(fn)`. This is how the Workspace screen gets live
  notes/change events without polling.
* **LAN discovery**: `app/lan.mjs` — UDP broadcast on a fixed port
  (`CALL_PORT`) so computers that have never talked before can find each
  other; a separate `CARRY_PORT` (offset by `VIBERANT_PORT_SHIFT` in tests) is
  used for the actual TCP data connection so two test instances on one
  machine don't collide.
* **Presence**: `app/anywhere.mjs` `around()`/`beAbout()` — tracks who's
  reachable right now; `members.now()` is a synchronous snapshot read used
  inside socket handlers where `await` would drop the incoming message.
* **Peer protocol**: one TCP (or relay) connection per pair of computers,
  multiplexed into channels by `app/channels.mjs`. Outbound: `anywhere.reach(id)`
  → `askPeer(peer, {what, ...})` (in `server.mjs`). Inbound: registered once via
  `anywhere.whenSomebodyArrives(peer => ...)` → `answerPeer(peer, asked)`.
* **Workspace membership**: `app/members.mjs` — who's allowed to connect at
  all is decided by workspace membership + `isRevoked`, checked fresh on every
  connection attempt (not cached at listener setup — this was a real bug, see
  `00_DECISIONS.md` D-206-ish entries and `app/test/delivery.test.mjs`).
* **Port handling**: ports are fixed constants in `lan.mjs`/`peers.mjs`
  (`CALL_PORT`, `CARRY_PORT`, a direct-connect port in `peers.mjs`); only
  shiftable via `VIBERANT_PORT_SHIFT` env var, and only for running two test
  instances on one machine — never expose this as a user setting.

## 10. External Integrations

| Service | Config lives in | Auth method | Primary files |
|---|---|---|---|
| GitHub | `app/github.mjs`, `app/settings.mjs` | OAuth device flow (`app/signin.mjs`) | `github.mjs` |
| Google | `app/google.mjs` | OAuth device flow (`app/signin.mjs`) | `google.mjs` |
| Vercel | `app/providers.mjs` | Personal access token, stored via `settings.mjs` | `providers.mjs`, `deploy.mjs` |
| Anthropic (Claude) | `app/assistant.mjs` `CATALOGUE.claude` | API key via `settings.mjs` | `assistant.mjs` |
| OpenAI | `app/assistant.mjs` `CATALOGUE.openai` | API key via `settings.mjs` | `assistant.mjs` |
| Google Gemini | `app/assistant.mjs` `CATALOGUE.gemini` | API key via `settings.mjs` | `assistant.mjs` |

No secrets are ever written to `00_DECISIONS.md`/`STATUS.md`/logs — every
module that touches a key redacts it before it could reach a log line or the
AI assistant's context (see `withoutSecrets` in `assistant.mjs`).

## 11. Important Shared Utilities

* `app.js`: `draw()`/`fill()` (redraw-avoidance), `inspect()` (right panel),
  `sheet()` (modal), `esc()` (HTML-escaping — used everywhere text is
  interpolated into a template literal).
* `server.mjs`: `noProject` (shared "no project open" error shape), the
  `routes` object itself as the map of everything the backend can do.
* `sync.mjs`: `manifest`/`compare` are reused by every "what's different"
  check in the app (Workspace project diff, machine comparison, etc).
* `parcel.mjs`: `survey`/`wrap` are reused by every transfer path (sync,
  live-take, remote-bring-built, artifact send).
* `jobs.mjs`: the single mechanism for showing a long errand's progress in
  the Activity tab, used by transfers, builds, and syncs alike.

## 12. Testing Architecture

Framework: Node's built-in `node:test` + `node:assert/strict`. No Jest/Mocha/
Vitest. Two independent suites, both run by `npm test`:

* `core/reference/test/*.test.mjs` — the effort/event-sourcing engine.
* `app/test/*.test.mjs` — everything else, ~40 files.

Strong, explicit coverage: cross-computer workspace behavior (membership,
presence, delivery, sync, conflicts) is proven by spinning up two real
`server.mjs` processes (`workspace-flow.test.mjs`, `delivery.test.mjs`,
`across.test.mjs`, `syncing-across.test.mjs`) rather than mocking the network.
`words.test.mjs` and `wiring.test.mjs` are static-analysis-style tests over
the source text itself (checked directly — these exist and do exactly this).

**Not verified by this map**: whether every screen/route has a corresponding
UI-level test — the UI (`app/ui/app.js`) is largely tested by static
string/pattern assertions against its source (see `offering.test.mjs`,
`queued.test.mjs`), not by executing it in a DOM. Treat runtime-only UI logic
as lower-coverage than the backend.

Useful targeted commands:
```bash
node --test app/test/workspace-flow.test.mjs   # the whole cross-computer workspace errand
node --test app/test/delivery.test.mjs         # peer message delivery shape checks
node --test app/test/offering.test.mjs         # file/folder offer UI + chooser
node --test app/test/words.test.mjs            # jargon scan (fast, run after any UI text change)
node --test app/test/wiring.test.mjs           # route/fetch-call consistency
```

## 13. Common Change Paths

### Changing a Workspace UI element
Start with: `app/ui/app.js` → `SCREENS.workspace` / `projectInWorkspace` /
`wireProjectInWorkspace` / `drawWorkspaceNotes`.
Likely related: `app/server.mjs` routes under `/team/*`, `/workspace/*`.
Usually do NOT need: `app/peers.mjs`, `app/anywhere.mjs` (unless the change
touches presence/delivery, not just display).

### Fixing a Workspace realtime bug (notes/presence/sync not appearing live)
Start with: `app/chatter.mjs` (is the event being written/read from the right
store?), then `GET /events` handling in `server.mjs`.
Then inspect: `app/anywhere.mjs`/`app/peers.mjs` if the bug is cross-computer
(delivery) rather than same-computer (display).
Relevant tests: `app/test/delivery.test.mjs`, `app/test/workspace-flow.test.mjs`.

### Changing project management UI (list/open/save/send)
Start with: `app/ui/app.js` → `SCREENS.projects`.
Related: `app/projects.mjs`, `app/github.mjs`.
Usually do NOT need: workspace/sync modules.

### Fixing deployment
Start with: `app/deploy.mjs`, `app/providers.mjs`.
UI: `SCREENS.ship` in `app.js`.
Relevant tests: `app/test/deploying.test.mjs`.

### Changing AI provider behavior
Start with: `app/assistant.mjs` (`CATALOGUE`, `TROUBLE`, `whatThatMeant`).
UI: `SCREENS.ask` in `app.js`.
Relevant tests: `app/test/assistant.test.mjs`, `app/test/models.test.mjs`,
`app/test/runninglow.test.mjs`, `app/test/queued.test.mjs`,
`app/test/whoisasked.test.mjs`.

### Adding/changing a route
Start with: `app/server.mjs` `routes` object (find the right comment-delimited
section).
Then: the corresponding `fetch()` call site in `app/ui/app.js`.
Relevant test: `app/test/wiring.test.mjs` will fail if the two disagree.

### Changing what a user-facing sentence says
Check it against: `app/test/words.test.mjs` (no version-control jargon) and
the `{ ok, sentence, action }` failure-shape convention (see `AGENTS.md`).

## 14. Dependency / Impact Notes

* Changing `app/members.mjs`'s workspace shape can affect `anywhere.mjs`,
  `peers.mjs`, `chatter.mjs`, and every Workspace UI element, since membership
  gates both connection acceptance and what the UI is allowed to show.
* Changing `app/sync.mjs`'s `manifest`/`compare` output shape affects every
  "what's different" feature (Workspace project diff, machine comparison) —
  it's a shared primitive, not Workspace-specific.
* Changing `app/chatter.mjs`'s event shape affects `GET /events` (SSE),
  `GET /workspace/notes`, and the Activity feed's expectations about
  `project.changed`/`sync.completed` events.
* `app/parcel.mjs` changes affect every transfer path: sync, live-take,
  artifact send, remote-bring-built.
* `app/ui/app.js`'s `draw()`/`fill()` redraw-avoidance means a screen that
  doesn't call `fill()` (writes `innerHTML` directly) can reintroduce flicker/
  scroll-reset bugs that were previously fixed elsewhere — check how sibling
  `SCREENS.*` functions handle their own redraws before adding a new pattern.

## 15. Known Legacy / Fragile Areas

* **Two workspace implementations coexist.** `app/workspace.mjs` (GitHub-repo-
  backed, older) is still reachable from the Workspace screen's "your own
  computers, through GitHub" section. `app/members.mjs` + `app/anywhere.mjs` +
  `app/chatter.mjs` is the current, primary one. Don't assume a "workspace"
  reference means the newer system without checking which module it's in.
* **The peer-connection listener is a documented source of past bugs**: it
  must decide synchronously (no `await`) whether to accept a connection, and
  must read live membership state rather than a value captured when the
  listener was set up. See `app/test/delivery.test.mjs`'s own doc comment for
  the specific history.
* **`answerPeer` in `server.mjs` dispatches by `asked.what` string** — a
  duplicate case silently shadows an earlier one with no error. Check for
  existing cases before adding a new message kind.
* **`inspectPerson` is called from `app/ui/app.js` (in the Workspace person-row
  click handler, `SCREENS.workspace`) but no function definition of that name
  exists anywhere in the file** as of this writing. This would throw at
  runtime when a person row is clicked. No test currently exercises this path
  (UI tests are static-source-pattern tests, not DOM execution — see §12), so
  it would not show up in `npm test`. Verify before relying on that click
  handler, and verify again after any refactor near `SCREENS.workspace`.
* **`app/live.mjs`** is an older cross-computer "take a live project" mechanism
  that predates `app/sync.mjs` + the Workspace sync flow; check whether new
  transfer work should extend `sync.mjs` instead of `live.mjs`.

## 16. Files Usually Safe to Ignore

* `dist/` — build output, gitignored.
* `node_modules/` — only `electron`/`electron-builder` (devDependencies).
* `.twoup/`, `.smoke/`, `.packed/` (and their `.log` files) — gitignored
  scratch homes used by manual two-instance test scripts; never real user data.
* `build/icon.png` / `build/icon.ico` — generated by `build/icon.mjs`, not
  hand-maintained.
* `VIBE.txt` — the original specification; explicitly superseded by
  `00_DECISIONS.md` per `CLAUDE.md`. Historical context only.
* `DESIGN_REVIEW_REPORT.md` — one-time analysis document, not living
  documentation.
* `experiments/` — point-in-time measurement writeups that justified specific
  constants; not code to maintain.

## 17. Quick Navigation Table

| Need to change/debug | Start here | Related areas |
|---|---|---|
| Projects list/open/save/send | `app/ui/app.js` `SCREENS.projects` | `app/projects.mjs`, `app/github.mjs` |
| Ask-the-AI feature | `app/assistant.mjs` | `SCREENS.ask` in `app.js`, `/ai/*` routes |
| AI provider error messages | `app/assistant.mjs` `TROUBLE`/`whatThatMeant` | `app/test/runninglow.test.mjs` |
| AI coding-app launcher | `app/tools.mjs` | `SCREENS.apps`, `app/profiles.mjs` |
| Terminals launcher | `app/terminals.mjs` | `SCREENS.terminals` |
| Workspace screen/layout | `app/ui/app.js` `SCREENS.workspace` | `projectInWorkspace`, `wireProjectInWorkspace` |
| Workspace membership/roles | `app/members.mjs` | `/team/*` routes |
| Workspace presence/connections | `app/anywhere.mjs`, `app/peers.mjs` | `app/channels.mjs`, `answerPeer` in `server.mjs` |
| Workspace live notes/events | `app/chatter.mjs` | `GET /events`, `GET /workspace/notes` |
| Workspace file/folder sharing | `app/lan.mjs` | `/local/*` routes, `app/parcel.mjs` |
| Project sync/conflicts | `app/sync.mjs` | `app/snapshots.mjs`, `/workspace/changes`, `/sync/bring` |
| Any transfer/download | `app/parcel.mjs` | `app/jobs.mjs`, `app/carried.mjs` |
| GitHub save/send | `app/github.mjs` | `app/signin.mjs`, `app/firstpublish.mjs` |
| Deployment (Vercel) | `app/deploy.mjs`, `app/providers.mjs` | `SCREENS.ship` |
| Accounts/profiles per tool | `app/profiles.mjs` | `app/github.mjs`, `app/google.mjs` |
| Activity feed | `app/activity.mjs`, `app/jobs.mjs` | `SCREENS.activity` |
| Settings screen | `app/settings.mjs` | `SCREENS.settings` |
| Adding/fixing a route | `app/server.mjs` `routes` | matching `fetch()` in `app.js`, `wiring.test.mjs` |
| Electron packaging/startup | `desktop/main.js` | `package.json` `build` config |
| User-facing wording rules | `app/test/words.test.mjs` | `CLAUDE.md`, `00_DECISIONS.md` |
