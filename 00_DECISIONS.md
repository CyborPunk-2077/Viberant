# 00_DECISIONS.md

*The permanent record of what was decided, why, what was considered instead, and what each decision changed upstream. This document outranks nothing — it explains. Where a decision amends another document, the amendment text here is authoritative until that document is edited.*

**Status markers used throughout the corpus from this point forward:**

| Marker | Meaning |
|---|---|
| `[LOCKED]` | Founder decision. Reopening requires a founder decision. |
| `[DECIDED]` | Engineering decision made with reasoning. Reopen freely with better evidence. |
| `[ASSUMED]` | Believed true, not verified. Treat as a risk. |
| `[OPEN]` | Known unmade decision with a named owner. |

---

## Part I — Decisions

### D-1 `[LOCKED]` — Accepting an effort can publish it

**Decision.** Accepting settles the work into the project's mainline. For projects the developer marks as shared, accepting also sends it onward. One verdict, one gesture, no new state, no new vocabulary on any surface.

**Why.** The specification's terminal state was local settlement, which meant every working day still ended with the developer opening a terminal to type a Git command. That is a direct failure of the core promise ("without forcing developers to think in Git terminology"). Closing the last mile inside the existing `accept` verdict was the only option that did it without adding a fourth state or a fourth verb — both of which the closed grammar forbids.

**Alternatives considered.**
- *Done means settled locally, full stop.* Smallest surface, most honest scope. Rejected: it leaves the product's most-repeated daily action outside the product.
- *Track work through review, CI, and merge.* Most complete story. Rejected: requires new states, pulls in remote services, and lands squarely inside the "not a project-management tool" anti-goal.

**Consequences.** See A-1, A-2, A-5 below.

---

### D-2 `[LOCKED]` — Windows first

**Decision.** The first platform is Windows. The substrate must make macOS a port, not a rewrite.

**Why.** This product's differentiation is *feel* — glance quality, sentence quality, calm. That cannot be built by someone who does not live in it daily. A broken dogfooding loop is the most common cause of death for taste-driven products, and it outweighs the fact that terminal-based AI assistant users currently concentrate on macOS.

**Alternatives considered.**
- *macOS first.* Better market concentration, cleanest OS integration. Rejected: six months of designing blind.
- *Cross-platform simultaneously.* Rejected: contradicts the MVP's own depth-over-breadth discipline, and doubles the surface where polish matters most.

**Consequences.** See D-6, D-7, and R-1 below. This is the decision with the largest unexamined risk attached.

---

### D-3 `[LOCKED]` — Ambient presence, never push

**Decision.** The product may render a passive state reflection outside its two surfaces (Windows taskbar / system tray; later, macOS menu bar). It never buzzes, badges with counts, animates, sounds, or demands. You look at it; it never looks at you.

**Why.** An AI agent paused for permission is silently idle. Under absolute silence, "delegate and leave" becomes "delegate and lose ninety minutes." The rule held while the promise it existed to protect broke.

**Alternatives considered.**
- *Strict silence.* Purest. Rejected for the reason above.
- *Presence plus an opt-in alert for blocked agents.* Most practical. Rejected: it creates a notification pathway, and once one exists the architecture's structural guarantee of silence is gone permanently. Presence gets us most of the value at none of that cost.

**Consequences.** See A-3, D-10.

---

### D-4 `[LOCKED]` — Summaries come from the developer's own assistant

**Decision.** Compression ("forty actions read as one sentence") is performed by calling an AI assistant already present on the developer's machine, using the developer's own credentials, through the Assistant Gateway. No model ships inside the app. No service is operated by us. No account is issued.

**Why.** The one-sentence account is the product. Templates cannot produce it — they produce "4 files changed in auth," which is the exact plumbing vocabulary the constitution bans. A bundled local model competes for the machine the AI agents are already saturating, and carries a real quality ceiling. Borrowing the assistant introduces *zero new trust boundary*: that code already went to that provider, by the developer's own choice, minutes earlier.

**Alternatives considered.**
- *Local model.* Purest local-first story. Rejected on quality ceiling and resource contention, and revisitable — it sits behind the same seam.
- *Deterministic templates only.* Rejected: does not deliver the product's core promise.

**Consequences.** See A-4, A-5, D-8, D-9. This decision creates a genuine new risk to voice uniformity and to tool neutrality, both resolved below.

---

### D-5 `[DECIDED]` — Ground is prepared at first delegation, not at effort creation

**Decision.** Creating an effort allocates nothing but an identity and an intent event. The isolated working ground is prepared the first time the effort is delegated. Parked efforts hold no ground.

**Why.** Measured, not assumed (Part III). Preparing ground costs a full working-tree checkout — roughly 0.15 ms per file and 100% of the tree's disk size, every time. Under the specification as written, every parked idea cost a full copy of the repository for work that might never begin. Deferring preparation makes effort creation genuinely free, which makes Architecture §7's claim ("efforts are cheap… allocates no scarce resource") *true* rather than aspirational, and it moves the unavoidable wait to delegation — the one moment where the developer is already handing off and walking away.

**Alternatives considered.**
- *Prepare at creation (as specified).* Rejected on measurement.
- *Prepare lazily via sparse or partial checkout.* Deferred, not rejected — it is a strict improvement behind the Engine seam and can land later without touching the domain.

---

### D-6 `[DECIDED]` — Substrate: Rust core, webview shell

**Decision.** Core, Workspace Engine, Assistant Gateway, World Watcher, and Sync Carrier in Rust. Shell in a webview (WebView2 on Windows, WKWebView on macOS) via Tauri.

**Why.**
- The architecture's central requirement is that *illegal state transitions be unrepresentable, not merely rejected* (§2.3). Rust's enums and exhaustive matching make that literally true at compile time. This is the language matching the specification's hardest constraint, not a preference.
- The architecture declares the Shell disposable and truth-free (§1.2). A webview shell is that idea made physical.
- The product is prose-first and typography-carried (Design §10.1). Text layout and type control are what HTML and CSS are best in the world at.
- Startup must be fast enough for ten-second orientation on a cold machine. Tauri ships no browser engine; binaries are small and start quickly.
- Memory matters unusually here: this app runs *alongside* AI agents already consuming the machine.

**Alternatives considered.**
- *.NET + WinUI 3.* Most native Windows feel. Rejected: the macOS port is a rewrite, violating D-2's stated requirement.
- *Electron.* Familiar, mature. Rejected: bundled Chromium, slower start, heavier memory — all three fight constitutional guarantees.
- *Flutter.* Strong cross-platform story. Rejected: weaker for text-heavy prose interfaces, and a less mature desktop filesystem/process story.

---

### D-7 `[DECIDED]` — Projects inside WSL are out of scope for the MVP

**Decision.** The MVP binds to projects living on Windows filesystems. A project detected inside a WSL distribution is declined honestly at discovery, in one sentence, with no pretense — the same pattern MVP §7.3 already establishes for unsupported version-control realities.

**Why.** Change notifications do not propagate reliably across the WSL filesystem boundary. Effect observation is the universal integration path and the neutrality proof; building it on an unreliable signal would make the product quietly wrong rather than honestly limited.

**Risk.** If a large share of Windows developers keep repositories inside WSL, this cut is larger than it looks. Flagged as R-1 — needs a founder check, not a decision.

**Post-MVP path.** A small helper process inside the distribution, reporting facts across the seam. The World Watcher boundary already accommodates it.

---

### D-8 `[DECIDED]` — Core owns the sentence; the assistant is only an engine

**Decision.** Core composes the summarization prompt, defines the output schema, and validates every returned sentence against the vocabulary contract before it becomes a summary. A sentence that fails validation is retried once, then falls back to a template. The assistant supplies inference and nothing else.

**Why.** D-4 threatened Architecture §9.1's guarantee that "adapters never summarize; Core does — this keeps the one-sentence voice uniform across every assistant." Without this rule, the product's voice would vary by whichever model the developer happened to install. Making Core the author and the assistant the engine preserves the guarantee exactly.

**Consequence.** The vocabulary contract must become machine-readable — it is now a runtime validator, not just a style guide. This raises the priority of the Vocabulary & Voice Standard from "important" to "blocking."

---

### D-9 `[DECIDED]` — Inference source is chosen mechanically, never preferentially

**Decision.** For a given effort, summarization uses, in order: the assistant that performed the work if it exposes inference; otherwise any inference-capable assistant present; otherwise templates. Zero configuration.

**Why.** Constitutional non-negotiable: "works with every AI coding tool, favors none." Any ranked or configurable preference would be favoritism encoded in Core. This rule is mechanical and contextual — it also happens to pick the assistant that already holds the effort's context.

**Accepted asymmetry.** A developer using only tools without a headless mode receives template summaries. This is consistent with existing doctrine (Architecture §9.2: adapted and unadapted tools differ in *richness of account*, never in capability of the loop).

---

### D-10 `[DECIDED]` — The presence indicator shows one mark and no number

**Decision.** The ambient indicator renders exactly one thing: the mark and hue of the highest-ranked state currently present. Never a count. Never a change in appearance to attract attention.

**Why.** Counts are the mechanism by which calm products become guilt-inducing ones. "3" is a demand; a state mark is a fact. The design system's rank order (§2.1) already tells us which single state matters.

---

### D-11 `[DECIDED]` — Settling produces one commit whose message is the developer's own sentence

**Decision.** Accepting an effort settles its work as a single commit on the project's mainline, with the developer's intent sentence as the message. Publishing (D-1) sends that commit onward.

**Why.** The teammate invariant (Architecture §10.4) requires the repository to stay comprehensible to people who do not run this app. One clean commit per intention, titled in a human's own words, makes a shared repository *more* legible than forty machine commits would — the app improves the repo for non-users rather than merely not harming it. Nothing is lost: the full story lives in the event log.

**Alternatives considered.** Preserving the agent's incremental commits (rejected: noise, and it leaks machine activity into a human-readable history); a merge commit (rejected: introduces branch topology into a shared repository for no reader's benefit).

---

### D-12 `[LOCKED]` — Dogfooding outranks everything

**Decision.** The first usable version is judged against one question: does the founder stop reaching for their old workflow? Features are prioritised by that test, not by the MVP specification's panel of hypothetical target developers.

**Consequence.** The MVP's release criterion 11.16 (a two-week panel of unexposed developers) is suspended, not deleted. It returns before any external release.

---

### D-13 `[DECIDED]` — Multi-machine truth sync moves into v1

**Decision.** Reverses MVP locked decision 3, which deferred synchronisation. Effort truth — intents, states, story, verdicts — travels between machines from the first usable version. Working ground still does not travel.

**Why.** The founder's stated problem, in their own words, opens with working across multiple PCs. Under D-12 that makes deferral indefensible: a version that does not follow them between machines cannot replace their workflow. It is also now cheap. The expensive half — globally unique identities, a hybrid logical clock, causally ordered origin-attributed events, and a deterministic fold — was built and tested this session. What remains is file I/O and a directory the developer already synchronises.

**What is not included.** In-flight assistant sessions do not follow you. Walking to another machine shows you the whole picture and lets you start or judge anything; it does not let you resume a running agent. Ground is per-machine by definition (Architecture §11.2). This is honest and, I believe, sufficient — what is lost when switching machines today is knowing what you were doing, not the files.

**Alternatives considered.** Keeping the deferral and shipping single-machine first (rejected: fails D-12's one test). A relay service to move sessions too (rejected: requires a backend, permanently barred).

---

### D-14 `[DECIDED]` — Deliberate cuts from the first usable version

Each was in the MVP and each fails the D-12 test. All are recorded here rather than dropped silently, and each names what it costs.

| Cut | Why it fails the test | Cost of cutting |
|---|---|---|
| Overlap analysis | The founder switches *tools* on one effort more than running colliding efforts on one project. Also the highest-risk unspecified mechanism in the corpus — a noisy detector would flood the calmest surface. | Two efforts touching the same ground go unnoticed. Acceptable for one user who will notice. |
| Partial judgement (Workflow E.4) | Convenience within a review, not a reason to open the app. Also depends on a "settle part of an effort" operation absent from the Engine's sealed interface. | Judge the whole effort or redirect the whole effort. |
| Reversing settled work (Workflow F, second half) | Rare, and the entangled-history reframe is expensive to do honestly. | The developer's existing tools already undo work. |
| Pre-organised evidence rendering at depth 3 | Real polish, but a plain honest view of the work is enough to decide. | Review is functional, not yet delightful. |
| Full assistive-technology parity | A one-user product where the user is the founder. | **Re-enters scope before any external release.** Recorded as a debt, not a decision. |

Keyboard-first, both appearances, and reduced-motion parity are **kept** — the founder wants them, and they are cheap when built in rather than retrofitted.

---

### D-15 `[DECIDED]` — Efforts capture an account, so tools can be swapped mid-effort

**Decision.** A new event type, `effort.account_captured`, records what each assistant did and where its transcript lives. An effort remembers every assistant that touched it, in order.

**Why.** The founder moves a single project between Claude Code, Codex CLI, Gemini CLI, Cursor, Windsurf and Aider "whenever one reaches its limits," and every switch today starts the new tool cold. Carrying the account across the switch is the difference between changing tools and starting over. This is the founder's wedge feature, and it turns out to be the one the specification already implied (Workflow D's handoff duty) without ever emphasising.

**Not a chat.** Reading a past conversation as evidence at depth 2 is not conversation. Nothing composes, nothing sends. The anti-goal stands.

---

### D-16 `[DECIDED]` — Redirecting is legal while an effort is moving

**Decision.** The developer may redirect an effort without waiting for the assistant to stop.

**Why.** Workflow E implies redirection happens from `waiting`. But Workflow F already establishes that the developer never waits for a machine's permission to *stop* it. Making them wait for a wrong-headed agent to finish before *steering* it would be an odd kind of respect for the machine. Resolves a gap the specification did not notice.

---

### D-17 `[DECIDED]` — Rank-1 ordering is by cost of delay

**Decision.** Efforts waiting on the developer are ordered: question, overlap, failed, review_ready, unknown, parked. Not configurable.

**Why.** The design system said rank-1 items are "led by their reasons" but never said in what order, leaving the product's most important surface undefined (ambiguity A-5 in the design review). Cost of delay is the honest metric: an assistant idle on a one-word question loses more per hour than a completed review does.

---

### D-18 `[DECIDED]` — A dependency-free reference implementation is the executable specification

**Decision.** The domain core is specified as running, tested JavaScript with zero dependencies, held to a conformance suite. The product core remains Rust (D-6). The reference is not shipped.

**Why.** The event schema is permanent on first write and will one day be read by a second machine, a repository projection, and a reinstalled app. A cross-language, permanently-frozen format deserves a conformance suite that outlives any single implementation — the same practice used for other long-lived formats. It also means the Rust core has an executable definition of correctness on day one instead of a prose document someone interprets.

**Honest note.** The immediate cause was that this environment has no Rust toolchain and no package registry. I judged that writing unverifiable Rust would be worse than writing verified JavaScript that defines what the Rust must do. The substrate decision did not change to suit the tooling.

---

### D-19 `[DECIDED]` — Settling refuses while the developer has work of their own in progress

**Decision.** Accepting an effort is refused, kindly, if the developer has uncommitted work of their own sitting in the project. One sentence, one action: put your own work somewhere safe first.

**Why.** Found by a test rather than by reasoning, which is the honest way to report it. Recovering from a collision means putting the project back exactly as it was — and doing that on top of the developer's own in-flight work would destroy it. The constitution says the app never silently acts on the developer's work; this is the one place where an unguarded implementation would have done exactly that.

**Alternatives considered.** Setting the developer's work aside automatically before settling (rejected: acting on their work without their intent). Settling anyway and hoping (rejected outright).

---

### D-20 `[DECIDED]` — The Engine's six operations, and no seventh

**Decision.** The sealed interface is: `prepare`, `describe`, `settle`, `publish`, `abandon`/`recover`/`release`. Reversal of settled work (`unwind`) is not implemented, per the D-14 cut.

**Why.** Architecture §10 specifies the operations as "exactly the domain's needs and nothing more." With reversal cut and overlap analysis cut, the domain needs six. Every argument in is a domain object; every value out is a domain object; every sentence out has passed the vocabulary contract before it leaves. There is a test that drives every refusal path and fails if any sentence leaks — which is how the constitution's hardest promise stops being a matter of discipline.

---

### D-21 `[DECIDED]` — Silence of 180 seconds means the assistant has stopped

**Decision.** An effort's ground going completely quiet for three minutes is taken as the assistant having stopped.

**Why.** Measured, not chosen — `experiments/quiescence/FINDINGS.md`. At 30 seconds we would wrongly interrupt the developer nearly nine times per session; at 90 seconds, once every third session; at 180, once every hundred. Finding out twice as fast is not worth teaching the developer to disbelieve the picture, and the picture being believable is the entire product.

**Alternatives considered.** 90 seconds (rejected: one false alarm every third session). An adaptive threshold that learns each effort's rhythm (deferred, not rejected — a fixed threshold that is honest beats a clever one that is unproven).

---

### D-22 `[DECIDED]` — Liveness and change are watched at different scopes

**Decision.** Watch the *entire* ground — including build output, caches and dependencies — to decide whether anything is alive. Report only meaningful paths when saying what changed.

**Why.** Also from the experiment. A test run may touch nothing but build output for minutes. Watching only source files would call that silence and be wrong. But build output is not a change any developer would want reported. Two questions, two scopes.

---

### D-23 `[DECIDED]` — Home shows seven efforts in full, then compresses

**Decision.** Each rank shows up to seven efforts in full; the remainder becomes one honest sentence naming how many and how urgent.

**Why.** The constitution forbids scrolling to understand the situation and forbids paginating the truth, which leaves compression — and compression needs a threshold that nobody had chosen. Seven is about as many distinct things as a person holds at a glance, and the whole product is built around a glance. The rule that matters more than the number: the most important effort is never the one compressed away, which is tested.

---

### D-24 `[DECIDED]` — Electron, not Tauri, and it is the only dependency

**Decision.** The desktop shell is Electron, packaged into a Windows installer with electron-builder. This reverses the shell half of D-6. Electron and electron-builder are the only dependencies this project has, they live at the root and are used for packaging only. Everything in `app/` and `core/` remains Node standard library with nothing installed.

**Why.** D-6 chose Tauri as the partner to a Rust core: Rust for the domain, a webview for the shell, one toolchain across both. That premise is gone. D-18 made the domain running JavaScript, and the app that exists today is Node — `app/server.mjs` and the core it imports. Tauri would now mean introducing Rust solely to host a window, and shipping a sidecar Node runtime beside it anyway, because the product's actual logic is JavaScript. Electron already carries the Node the server needs; `ELECTRON_RUN_AS_NODE` turns the same binary into the runtime that runs `app/server.mjs`, which is what makes the installer work on a machine with no Node on it. One dependency replaces one language plus one runtime plus a seam between them.

**The size cost, honestly.** D-6 rejected Electron for "bundled Chromium, slower start, heavier memory — all three fight constitutional guarantees." That objection was correct then and is still correct now; what changed is what the alternative costs, not what Electron costs. The numbers, measured on this build rather than recalled:

| | Tauri (D-6's estimate) | Electron (measured, this build) |
|---|---:|---:|
| Installer | ~3–6 MB | **95 MB** |
| Installed | ~10 MB | **347 MB** |
| Idle memory | ~80 MB | **266 MB** across 4 processes |

That is roughly **twenty times the download and thirty-five times the disk**. It is a real loss and it is not being dressed up: a person on a slow connection waits minutes rather than seconds, and the app sits alongside AI agents that are already eating the machine — the exact contention D-6 named. The memory figure is the honest one to watch, because it is the one paid continuously rather than once. Startup was the third objection and is the one that mostly survives contact: the window appears in about a second here, against Tauri's claimed near-instant. The ten-second orientation promise is about the *picture being readable*, not the binary being small, and it holds.

The four processes are Electron's main process, the window, its graphics helper, and the manager's own server — that last one being the same `app/server.mjs` a terminal would start, running on the Node that Electron already carries.

**Why the cost is worth paying anyway.** Under D-12 the only question is whether the founder stops reaching for their old workflow, and nothing in that sentence is about megabytes. A 3 MB installer for an app that does not exist is worth less than a 90 MB installer for one that runs tonight. The disk it costs is a rounding error next to the 14.6 GB a monorepo's ten grounds cost in Part III of this same document — a number we accepted without argument.

**Alternatives considered.**
- *Keep Tauri.* Rejected: it now means adding Rust to host a window, and bundling Node beside it regardless, for a project whose stated discipline is subtraction.
- *Stay a browser tab.* Cheapest and honest. Rejected: it is not an app you launch, cannot go in the startup folder, and needs Node installed. `start.bat` keeps this available for anyone who prefers it, so nothing is lost by also having a window.
- *Wrap the existing browser with a WebView2 host of our own.* Smallest real window. Rejected: it is writing a packaging tool instead of the product, and WebView2's presence is a per-machine assumption rather than a guarantee.

**Consequences.** Amends D-6: the Rust core and the webview shell are both withdrawn; the substrate is Node with an Electron shell. Nothing else in D-6's reasoning is disturbed — the shell is still disposable and truth-free, still prose-first HTML and CSS, and the macOS port is still a port rather than a rewrite, because the shell is fifty lines that start a server and open a window. The packaged app runs unarchived (`asar: false`) because the server is a real file that Node has to be able to start, and a file inside an archive is not one.

---

### D-25 `[DECIDED]` — Your computers meet in a private project on your own GitHub account

**Decision.** The shared workspace is a project called `viberant-workspace`, private, on the developer's own GitHub account. Every computer signed in to that account keeps a copy and writes exactly three files into it: who it is, what it is offering, and what it has said. **Each computer only ever writes its own three files.** The picture is read by putting every computer's files side by side.

**Why.** The founder's stated problem opens with working across multiple computers, and D-13 already moved truth sync into v1 on that basis. The obvious mechanism is a server both computers talk to; that is barred permanently and D-13 rejected a relay for exactly this. GitHub is already in the loop — the developer is signed in to it, their projects are already there, and it is already trusted with the code itself. Using it as the meeting point adds no trust boundary and no service of ours.

The per-computer file ownership is the load-bearing part. Two computers writing at the same moment cannot collide because there is no file they both write. That makes the merge a fold over independent files rather than a conflict-resolution problem, which is the same shape the event log already has (Architecture §11). It is tested with two computers and a stand-in for GitHub, including the case where both wrote.

**The cost, stated plainly.** Being present at all writes a small save into that workspace every couple of minutes. Over a long day of two computers being open that is a few hundred tiny saves in a project nobody reads by hand. A server would not have needed them. Presence is written at most every two minutes and anything the developer actually did is written at once, which is the cheapest honest point on that curve. `[OPEN]` O-9: no compaction policy exists yet for a workspace left running for a year.

**What does not travel.** Files. Each computer gets its own copy of a project from GitHub in the ordinary way. What travels is knowing what exists, who is about, and what was said. This is the same honest limit D-13 set for in-flight sessions.

**Alternatives considered.**
- *A relay service of ours.* Rejected by D-13 and by the constitution. Nothing has changed.
- *Discovery over the local network.* Rejected: the founder asked specifically for this to work without a local network or a physical connection, which is the case that actually hurts.
- *One file everybody writes.* Simpler to read, and wrong: two computers open at once would fight over it every two minutes.

---

### D-26 `[DECIDED]` — An app is offered by the ways into it, not by what kind of thing it is

**Decision.** Each AI app declares its ways in — `terminal`, `desktop`, or both — and only the ways actually found on the computer are offered. An app with both gets two buttons. An app with one gets one. An app with neither is listed as absent rather than hidden.

**Why.** The old model gave each app a single `kind`, which was already false for Cursor (a window and a command-line agent) and getting falser. More importantly it made the manager decide for the developer: opening Claude Code in a terminal and opening Cursor in its own window are different acts with different consequences for where your keyboard goes, and that is the developer's call. Offering a way that is not installed would be the one thing worse than not offering it.

**Why absent apps are still listed.** "We looked and it is not here" is more useful than a shorter list, and it is where an offer to install one belongs. It is not a ranking — tested, along with the rule that nothing is ever marked as the one to use (D-9's neutrality, held mechanically).

---

### D-27 `[DECIDED]` — Terminals are their own place, never mixed with the AI apps

**Decision.** Command Prompt, Windows PowerShell, PowerShell 7, Windows Terminal, Git Bash and WSL live in a tab of their own. No terminal ever appears in the list of AI apps, and no AI app appears among the terminals. There is a test that fails if the two sets ever intersect.

**Why.** You go to the AI apps to hand a project to something that writes code. You come here to get a prompt in the right folder. Putting PowerShell in a list of assistants would be a small lie about what it is, and small lies about what things are is how a calm surface becomes a confusing one.

---

### D-28 `[DECIDED]` — One opening, once, and then the app never moves on its own again

**Decision.** Opening Viberant plays a short animation of the name — under two seconds, before there is anything to read — and then nothing in the product animates for the rest of the session except in direct answer to something you pressed. Reduced-motion settings replace it with a fade.

**Why.** D-3 is locked and stands: the ambient indicator never animates, never badges, never asks for you. This does not touch it. D-3's principle is "you look at it; it never looks at you" — an opening plays at the one moment you have already chosen to look, and it is finished before the first sentence appears. It costs nothing in attention because there is no attention to take yet.

**Founder request, and worth saying why it is not merely indulged.** A tool you reach for daily should feel like something rather than nothing when it opens. The whole product is a bet that feel decides whether the old workflow gets abandoned (D-12), and two seconds at launch is the cheapest possible place to spend on that.

---

### D-29 `[DECIDED]` — Putting a website online and giving out an application are two errands, never one button

**Decision.** The Ship surface has two panels that never merge. A website goes to a place and is replaced whole. An application is built into something installable and handed out under a version, and every version handed out stays out there.

**Why.** They fail differently, they are undone differently, and they mean different things to the people on the other end. A single "deploy" button would have to guess which one you meant, and guessing wrong means either a half-uploaded folder or a version number in the world that you cannot take back. The panels say what each one costs before you press: replacing a site is total and immediate; a release is permanent.

**Honest limit.** GitHub Pages serves files exactly as they sit, so a site that has to be built is declined with a sentence pointing at Vercel or Netlify, which build it themselves. Building the site and pushing the output elsewhere was considered and rejected — it is machinery that fails quietly, and this product does not have quiet failures.

---

### D-30 `[DECIDED]` — Program names are the only exception to the vocabulary contract, and the exception is a test

**Decision.** The names of programs the developer already has — GitHub, GitHub Pages, GitHub CLI, Git Bash — may appear on surfaces. Nothing else borrowed may. A test reads every line of prose in the app and the page and fails the run on any other borrowed word.

**Why.** The contract bans describing the developer's work in someone else's terms. It was never meant to ban naming a program on their own machine — the product has said "GitHub" since D-1 without anyone objecting, because a place with a name is not jargon. Refusing to say "Git Bash" would not spare anybody the vocabulary; it would leave them unable to find the entry in their own Start menu.

**What changed.** This was previously a rule a person had to remember while writing a screen. Making it a test is the same move D-8 made for machine-written sentences, applied to the ones humans write. MVP release criterion 11.8 now has something that audits automatically rather than a week of somebody reading.

---

### D-31 `[DECIDED]` — Long errands show what they printed

**Decision.** Building and putting things online run as watched errands: named steps in plain sentences, and underneath, every line the command printed, kept and shown.

**Why.** This is the one place in the product where raw machine output reaches a surface, and it is deliberate. A build that fails at line four hundred cannot honestly be compressed into a shrug, and a spinner for four minutes is indistinguishable from a hang. The verdict is still the manager's — one plain sentence, one action. The lines underneath are evidence, which the design system already permits at depth.

---

### D-32 `[DECIDED]` — A folder is chosen by clicking, never by typing a path

**Decision.** Projects are picked by walking a list of folders, which marks the ones that look like projects, or by handing off to the folder chooser Windows already has. The path box is gone.

**Why.** Typing a path fails in ways the person cannot see — a backslash the wrong way, a folder renamed last week, a trailing space. Every one of those failures lands as "that folder is not there", which is true and useless. Clicking cannot produce a path that does not exist.

---

### D-33 `[DECIDED]` — Where you have got to is yours to say, not ours to infer

**Decision.** A project can be marked *working on it*, *waiting*, or *finished*. The manager never sets or changes a mark by itself.

**Why.** Everything else on a project card is a fact the manager worked out by looking — what is unsaved, when it was last saved, whether it has a copy on GitHub. A project can be perfectly saved and nowhere near done, and it can be a mess on disk and be something you decided months ago was finished. Only the developer knows which. Inferring it would produce exactly the kind of confident wrong statement that makes the whole picture stop being believable.

---

### D-34 `[DECIDED]` — A window has to prove it is a window

**Decision.** Before an app is offered as "open in its own window", the manager reads the program's own header and checks it is a windowed program. Evidence downgrades a way in; the absence of evidence never does — a file we cannot read that way (a `.cmd` or `.ps1` shim, which is how most windowed apps put themselves on the path) is taken at its word.

**Why.** Measured rather than argued, after being asked to add desktop apps for Claude Code, Codex and OpenCode. What is installed on this machine under all three of those names is a *console* program — `claude.exe` is 253 MB of command-line assistant sitting in a folder that looks exactly like where a desktop app would live, and `codex.exe` is the same. Offering either as "open in its own window" would start something invisible and look like the button did nothing.

Every Windows program has said which of the two it is since 1993, so the answer was available for the reading. Fifteen lines in `windowed.mjs` replaces a guess with a fact, and the card now says *why* an app has no Open button instead of leaving it a mystery.

**Consequence.** The moment a real desktop version of any of these is installed, it appears with no change to this code.

---

### D-35 `[DECIDED]` — Accounts live on the app's own card, at the moment of opening

**Decision.** The separate Accounts page is gone. Each AI app's card carries its own account control, holding the services it signs in with and the accounts kept for it. Choosing one selects it; pressing Open opens with it.

**Why.** Which account to use is a decision you make *while opening something*, not an hour earlier on a different page. The old arrangement made you go somewhere else, switch, come back, and then remember what you had switched to. Putting the choice beside the button removes the remembering.

**Consequence.** Switching an account no longer swaps files the moment you choose it — the swap happens when you press Open. That is strictly safer: choosing is now free and reversible, and nothing on disk moves until you commit to opening something.

---

### D-36 `[DECIDED]` — The GitHub account is always visible, bottom left

**Decision.** Who you are on GitHub sits permanently in the bottom-left corner, with switching, signing in, signing out and your name on saved work behind it.

**Why.** It is the one piece of identity that changes what every other button in the app does — which account a project is made under, which computers find each other, whose releases go out. Something with that much reach should not be reachable only through a page you have to think to visit. Bottom-left is where every other tool of this kind puts it, and being unsurprising is worth more here than being original.

---

### D-37 `[DECIDED]` — GitHub says which computers are yours; the network moves the files

**Decision.** Folders never travel through GitHub or through anything of ours. They go directly from one computer to another across the local network. What GitHub provides is *identity*: joining the shared workspace puts one random key in a private project only your account can read, and holding that key is what makes a computer on the network yours.

**Why.** Asked for directly: files should move locally, not "the cloud way". The hard part is not the moving, it is knowing who to move them to. Being signed in to the same GitHub account is a claim anybody on the same coffee-shop network could make, so it cannot be the proof. A random number out of a private repository can be, and the workspace from D-25 was already there to hold it.

This splits the two halves along their honest lines: the thing that works everywhere (knowing what exists, who is about, what was said) goes through GitHub; the thing that should never leave the building (your files) never does.

**Alternatives considered.**
- *No proof at all, trust the network.* Rejected outright: anyone on the same Wi-Fi could take your projects.
- *A pairing code typed on both computers.* Works, and is one more thing to do. Rejected because the workspace already establishes exactly this trust, and asking twice for the same fact is a tax.
- *Sending folders through GitHub.* Rejected: it is what was explicitly not wanted, and it puts private work in a place it did not need to go.

**Honest limit.** Both computers have to be on the same network. When they are not, the workspace still shows them and still carries what was said — it just cannot move a folder. That is said on the card rather than discovered.

---

### D-38 `[DECIDED]` — Nothing arrives on your computer without being asked for

**Decision.** One computer *offers* a folder. The other sees the offer, chooses where it goes, and asks for it. There is no automatic sync, no watched folder, no "keep these in step".

**Why.** Asked for, and right regardless. A folder appearing on your disk without being asked for is the behaviour of something you would uninstall, and automatic two-way syncing is the single most reliable way to destroy work — the failure mode is silent, and by the time you notice, the good copy is gone. Offering and asking are two deliberate acts by two people, which is exactly the number of decisions this deserves.

**Consequence.** A parcel carries a closing line saying how many files and bytes it held, and a folder is only moved into place once that line arrives. A transfer cut off half way leaves nothing that looks finished, which is tested.

---

### D-39 `[DECIDED]` — Opening the same app again is the same thing, not another one

**Decision.** Launching an assistant that is already open in a project records another account against the effort already there, rather than beginning a new one.

**Why.** Opening Codex six times in an afternoon is one thing you are doing, not six. The old behaviour turned the most-looked-at list in the product into a list of times you had clicked — noise wearing the clothes of information, and precisely what D-23's compression rule exists to prevent. `effort.account_captured` (D-15) already meant "this assistant touched this effort", which is exactly what a second press is.

**Also.** The list can now be cleared in one press, which stops nothing and touches no file. Needed because a list you cannot tidy becomes a list you stop reading.

---

### D-40 `[DECIDED]` — An app you do not have is one press away

**Decision.** Apps that are not installed are still listed, and each one carries how it is installed. The ones that install as a command are installed from here as a watched errand; the ones that come as their own installer get their download page.

**Why.** "We looked and it is not here" was already the honest thing to show (D-26). Showing it next to a button that fixes it costs one field per app and removes a search, a download page, and a guess about which package is the real one.

**Never silently.** What would run is shown before you agree to it, and it runs in the open like every other long errand.

---

### D-41 `[DECIDED]` — Settings exist, and there are eight of them

**Decision.** A settings page holding only things somebody would go looking for: what this computer is called, where work lives, which terminal is meant, light or dark, whether the opening plays, whether folders are watched, whether the other computers can reach this one, and whether letting anyone see a project asks twice.

**Why.** Every one of these was previously either impossible or hidden behind a gesture nobody would find. The rule keeping the list short is that **nothing here changes what the manager tells you is true, only how it behaves while telling you** — a setting that could make the product less honest is not a setting, it is a bug with a switch on it.

---

### D-42 `[DECIDED]` — Folders the manager makes carry their own way of proving who you are

**Decision.** Any folder the manager creates or brings down — the shared workspace, a project it puts on GitHub, a project it fetches — has its own credential helper set, pointing at the GitHub account you are signed in to *here*. Folders the manager did not make are left alone, and the setting that would fix all of them at once is offered as a button rather than done quietly.

**Why.** Found by pressing the button, which is the honest way to report it. Joining the shared workspace made the project on GitHub, cloned it, wrote three files into it, and reported success — and nothing had reached GitHub. Every send came back **"Repository not found"**, which reads like the project does not exist rather than like a sign-in problem.

The cause: being signed in to the GitHub helper does not let *git* send anything. They keep separate credentials. On this computer git was using the Windows credential store, which had never been told about GitHub.

**The part that is not obvious, and cost a real attempt to find.** Credential helpers are a **list, not a setting**. Adding ours to the end changed nothing at all, because whatever the computer already had was asked first and won. An empty value clears the list; ours then stands alone. That one line is load-bearing and is commented as such in both places it appears.

**Why not just fix it globally on join.** `gh auth setup-git` fixes every folder on the computer in one command, and it is what GitHub itself recommends. It is also a change to how *all* of somebody's version control behaves, made as a side effect of pressing Join on something else. Doing it per-folder needs no permission because it only touches folders the manager made. The global one is a button, with a sentence saying what it changes.

**Consequence.** Sending failures now tell the two cases apart. "GitHub could not be reached" and "this computer could not prove to GitHub that it is you" have completely different fixes, and telling somebody to wait until they are back online while they are online is the sort of wrong answer that wastes an afternoon.

---

### D-43 `[DECIDED]` — Some apps open their window through their own command

**Decision.** A way into an app can be a *command* rather than a file: `codex app <folder>` opens Codex's window at that folder, `opencode web` opens OpenCode's. Where an app has a window that this computer does not, the Open button still appears and says where to get it.

**Why.** D-34 established that a window has to prove it is a window, and on the evidence Claude Code, Codex and OpenCode were all terminal-only here. That was true about the *files* and wrong about the *apps* — reading their own help showed Codex ships `codex app`, which takes a workspace path and even fetches the window if it is missing, and OpenCode ships `opencode web`. Both are real windows, opened the way those apps expect.

The general lesson, which is the reason this is written down: **checking what is installed answers a different question from checking what the app can do.** The first was measured carefully and confidently produced the wrong answer to the second.

**Claude Code stays honest.** Its window is a separate download that its command-line half cannot start, so its Open button opens the download page and the card says which one is installed here. A button that explains beats a button that is missing.

---

### D-44 `[DECIDED]` — Projects are a stack, and your other computers see them unless you say otherwise

**Decision.** Projects are one per line, most recent on top, each carrying four things: what state it is in, when you last stopped, what you were doing when you stopped, and where it is. Every project is visible to your other computers; private is a per-project opt-out, and private means *left out of the list entirely* rather than refused on request.

**Why.** The grid looked tidier and told you less — three words and a path, in a box sized for a phone. The thing that actually gets somebody back into work is the last line they wrote about it, and there was nowhere to put it.

On the default: they are your own computers, signed in to your own account. Hiding your own work from yourself as the starting position is a strange place to begin, and it made the common case a chore. Private as an absence rather than a permission also means there is nothing to get around — a private project is simply not in what this computer tells the others.

---

### D-45 `[DECIDED]` — One folder for the page, not one per card

**Decision.** The Apps and Terminals pages have a single "Start in" control. The per-card folder chips are gone.

**Why.** Eleven cards each saying "in Viberant" is a lot of ink to say one fact once. The override existed for a case nobody has yet had — opening two different folders in two different apps in the same minute — and cost a line of furniture on every card to serve it.

---

### D-46 `[DECIDED]` — Getting an app you do not have is a page, not an errand

**Decision.** An app that is not installed offers its own install page. The manager no longer runs the install itself.

**Why.** Every one of these has an install page with the current instructions, the right package name, and the notes about what else is needed. Running `npm install -g` from inside the manager duplicated that, went stale the moment a package moved, and failed in ways the manager then had to explain. Deleting it removed a route, a job, and a class of failure.

---

### D-47 `[DECIDED]` — Asking and instructing are different functions, and neither may fail in silence

**Decision.** The page has `get` and `post`, chosen by the person writing the line. Neither ever throws: anything that goes wrong comes back in the product's one failure shape, so a fault reaches the screen as a sentence.

**Why.** There was one function that decided which it was by whether you had passed it anything. Every button whose errand needed no details — clear the list, get the latest, join the workspace, sign in to GitHub — therefore asked a *question* where it meant to give an *instruction*, got a 404, failed while turning that into an answer, and did nothing at all. Silently, because the failure landed inside a promise nobody was watching.

This is the exact failure the constitution's "one failure shape" rule exists to prevent, arriving through a door nobody had thought to guard: not a wrong sentence, but no sentence. **A convenience that infers intent from the shape of the arguments will eventually infer it wrongly**, and when it does there is nothing to read.

**Held by a test.** `wiring.test.mjs` reads the page and the server and checks that every address the page names exists by the verb the page uses. It cannot press a button, but it catches this whole class without a browser.

---

### D-48 `[DECIDED]` — What you have open is one card per app, and pressing it carries on

**Decision.** The list of what is open in a project shows one card per assistant, however many times it was opened, and pressing a card opens that assistant again *carrying on the conversation you were having* — `claude --continue`, `codex resume --last`, `opencode --continue`. Apps with no such word open fresh, and the sentence says so.

**Why.** The list had grown to fifteen rows saying the same four things, because it was recording presses rather than what you were doing. D-39 stopped new duplicates; grouping fixes the ones already recorded and, more to the point, makes the list answer the question people bring to it: *take me back to Codex*, not *how many times did I press this*.

Carrying on is the apps' own trick — every one of them already remembers the conversation, each with its own word for asking. The manager's job is to know the word, which is exactly the errand this product exists for.

---

### D-49 `[DECIDED]` — Four marks, in the order work goes, and no such thing as unmarked

**Decision.** A project is *yet to start*, *working on it*, *finished* or *published*. There is no null state and no "no mark" option.

**Why.** "No mark" is not a fact about a project, it is a fact about the list. A project you added last week and have not opened has not been started — that is a real answer, and offering it as the resting state means the list is telling you something on the day you make it rather than after you have been round labelling things.

The order matters as much as the set: it is the order work actually goes, so the marks read as a position rather than a category.

---

### D-50 `[DECIDED]` — A first time on GitHub asks one question

**Decision.** Putting a project on GitHub for the first time asks what it should be called. The README is written from the project — what it is built with, how it is run, its own description borrowed from its own notes. The `.gitignore` is chosen for the kind of project, with secrets excluded in every case.

**Two rules it will not break.** Nothing you wrote is ever overwritten — a file that exists is left exactly as it is, always, even where what is there is worse than what would have been written. And a licence is never chosen for you: what other people may legally do with your work has consequences outside this app, so it is offered with each option explained in terms of what it permits, defaulting to none.

**Why.** The ordinary way asks a beginner for a dozen decisions they have no basis for making and then produces a page that says nothing about what they built. Every one of those decisions is either answerable from the project itself or not the app's to make.

**Why borrowed rather than generated.** A description lifted from the project's own notes is better writing than any template produces, and — the part that matters — it is *true*. A generated "A Node project" is neither.

---

### D-51 `[DECIDED]` — Closing the window is not quitting, and the tray is presence

**Decision.** Closing the window destroys it, freeing the browser engine — over two hundred of the three hundred megabytes this app uses — and leaves the small server running. A tray icon opens it again and holds the only Quit.

**Why.** Asked for as "running in the background without consuming a process", which cannot be done: a thing that is running is a process. What can be done is to stop paying for the expensive half while nothing is on screen, and the expensive half is Chromium. The server that does the actual work is small, and it is what has to keep running for the quiet things — being findable by your other computers, noticing when a folder changes.

**This is the first thing in the product to exercise D-3.** The tray icon renders one mark and no number, never badges, never animates, never changes to attract attention. You look at it; it never looks at you.

---

### D-52 `[DECIDED]` — Signing in is asked for first and never demanded

**Decision.** A computer that has never signed in is met with a welcome that asks for GitHub. It also carries a plain way past it, and everything that happens on this computer alone works with no account at all.

**Why.** Almost everything worth doing here goes through GitHub — where the second copy of your work lives, and how your other computers recognise each other — so asking first is honest about what the product is. Demanding it would not be: opening projects, starting apps and saving your work need no account, and gating them behind one would be the app taking hostages (MVP §9.5, the no-hostage rule).

**Google is shown and declined, with the reason.** Nothing in this app needs a Google identity, and — the part worth writing down because it will be asked again — **no service exposes which GitHub account belongs to a Google one.** They are unrelated identity systems with no link to discover. Offering the button and quietly failing, or collecting an identity that does nothing, would both be worse than saying so on the screen.

---

### D-53 `[ASSUMED]` — Three hundred megabytes is the floor while this is an Electron app

**Decision.** The build ships one language instead of fifty-odd, taking the installer from 95 MB to 87 MB and the installed size from 347 MB to 302 MB. Nothing further is attempted.

**Why.** Of what remains, 215 MB is the Chromium binary itself and 20 MB is the licence text it is legally required to carry. There is no trimming left that is not either illegal or a different application. D-24 accepted this cost with the numbers stated; the numbers have not changed.

**What would actually change it,** for whoever picks this up next: hosting the page in Edge's WebView2, which every Windows 11 machine already has, would put the whole app in the region of 5 MB. It costs a small native host program and a new class of per-machine assumption. Until then the honest alternative already exists and is one file: `start.bat` runs the same product with no Electron at all, for anyone who has Node.

---

### D-54 `[DECIDED]` — Two computers compare fingerprints, never files

**Decision.** Each computer keeps a short fingerprint of every project it shares — a hash of every meaningful file's path, size and last-written second — and answers for it on the local network. The others ask every few seconds. A difference is noticed by comparing two short strings.

**Why.** "Your laptop has newer work" has to appear while you still care, which means seconds. Copying anything to find out would make noticing cost more than syncing. Only directory entries are touched, so a hundred-megabyte project costs the same to check as an empty one.

**The limit, stated because it is real.** Two files of the same size, written in the same second, with different bytes inside look identical to this. Reading every byte of every project every few seconds is the alternative, and the failure it would protect against does not happen when one person works on their own two computers.

---

### D-55 `[LOCKED]` — Nothing syncs by itself, and four rules say why

**Decision.** Live sync between computers obeys four rules, in this order:

1. **Nothing is ever synced automatically.** A computer noticing a difference raises it. A person decides.
2. **Unsaved work is never walked over.** Syncing refuses outright while the receiving copy has unsaved changes.
3. **Your copy is kept before it is replaced** — moved aside, never deleted, and the sentence afterwards says where it went. If the transfer fails at any point, it is put straight back.
4. **Two changes at once is a fact, not a problem to solve.** When both computers have moved, the manager will not pick a winner or merge anything. It says both changed and makes you choose.

**Why locked.** This is the only thing in the product that can destroy work. Every one of these rules is the difference between a tool you trust with a project and one you use once. Rule 4 especially: an automatic merge nobody asked for is how people lose an afternoon and never find out why — and it fails silently, which is the worst property a data-losing bug can have.

**Held by tests** that assert each refusal, including the roll-back: when the other computer cannot be reached, the folder that was here comes back byte for byte.

---

### D-56 `[DECIDED]` — The stylesheet is written once, not appended to

**Decision.** `app/ui/style.css` is one coherent sheet. It was rewritten from scratch after six rounds of appending.

**Why.** The navigation stacked itself vertically down the left and the content landed on top of it. The cause was not a layout mistake: an early rule said `nav { flex-direction: column }`, a later block added a `.topnav` class that set everything *except* direction, and the element rule kept winning. Six rounds of "add an override at the end" had produced a file where the truth about any property depended on reading all 1,500 lines.

**Contradictory rules in one stylesheet are a correctness problem, not a tidiness one.** The fix for one is never another override. Recorded so the next person to reach for `!important` here reads this first.

---

### D-57 `[DECIDED]` — A hanging menu opens where there is room

**Decision.** Panels measure themselves at the moment of opening and flip above, or leftward, when they would otherwise leave the window.

**Why.** A menu that opens downward off the bottom of the screen is a menu you cannot use, and it happens only to whichever card lands near an edge — so it reads as random rather than as a rule. The answer is only knowable at the moment of opening, so that is when it is measured.

---

### D-58 `[DECIDED]` — Google is a sign-in on the apps that use it

**Decision.** Google appears with its own mark on the account panel of every app that genuinely signs in with it — Gemini, Antigravity, OpenCode — beside the key-based options rather than instead of them. It still does not sign anybody in to Viberant itself.

**Why.** The two things were being run together. "Sign in with Google" is real and useful for the apps that offer it, and hiding it behind "paste a key" made those apps look harder to use than they are. What remains impossible is the linkage — no service says which GitHub account belongs to a Google one — and that is a different claim from "Google is not useful here".

---

### D-59 `[DECIDED]` — A sign-in button runs the app's own sign-in, never a web address

**Decision.** Every way in on an app's card carries the command that app uses to sign you in, and pressing it runs that. The manager starts the flow; it never tries to be the flow.

**Why.** Found by looking at a screenshot. Pressing "Google" opened `accounts.google.com` — the *account settings* page. A page about your account rather than a way to sign in to anything, and nothing was signed in at the end of it. The old model stored a web address per service and opened it, which is a guess dressed as a feature.

Running `gemini` and choosing "Login with Google" opens Google's real account picker, because that is what Gemini asks for. The same holds for every one of these: the provider's genuine OAuth flow is already implemented, by the app, correctly. **Knowing which command to run is the whole job.** Reimplementing somebody else's sign-in is not something this product should ever do, and could not do well.

---

### D-60 `[DECIDED]` — A key is not an account, and is not offered as one

**Decision.** Only real accounts appear under "Sign in with". Pasting a key sits behind one line labelled as what it is, and only for the tools where a key is genuinely how they work.

**Why.** They were listed side by side — "Anthropic" next to "Anthropic key" — as though they were two flavours of the same thing. They are not. A key identifies a project's billing rather than a person, it does not stop working when you sign out somewhere else, and pasting one is a different act with different consequences. Aider only works this way and says so; for everything else an account is the answer and the key is the way round.

---

### D-61 `[LOCKED]` — Signing in must never be the thing that loses an account

**Decision.** Before a GitHub sign-in starts, the token already in use is read and kept. If the flow fails, times out, or is abandoned, that token is put straight back.

**Why.** Found by pressing the button and then watching the app report "Not signed in" for an account that had been working all session. `gh auth login` **clears the active session the moment it begins**, before you have signed in to anything. Start it, change your mind, close the window — and you are signed out of the account everything else here depends on.

This is exactly the promise profiles.mjs already makes about assistant accounts (D-15's neighbours), applied to the one account the rest of the product is built on. Locked for the same reason: an account you have to go and recover is the most expensive thing this app can cost somebody, and it cost it here for the least interesting possible reason — curiosity about a button.

---

### D-62 `[DECIDED]` — A press is acknowledged before anything is asked of the server

**Decision.** Buttons that start something slow mark themselves the instant they are pressed, and the server answers as soon as the thing has *started* rather than when the bookkeeping is filed.

**Why.** Antigravity was reported as not launching. It launched every time — five processes, a language server starting — and took about ten seconds to put a window up. In the meantime the button looked untouched, because the answer waited on writing an event and re-reading the project first. Two seconds of that was ours and the rest was the app's, and neither was visible.

**Speed and the appearance of speed are different problems and both are real.** The first was fixed by answering earlier; the second by acknowledging at once. Neither one alone would have fixed the complaint.

---

### D-63 `[LOCKED]` — Speed is never bought with being wrong about somebody's work

**Decision.** No caching of a project's state. The list asks the four questions in parallel instead of one after another, which is a pure win, and asks them fresh every time.

**Why.** A two-second cache went in and two tests failed immediately: the list could say "everything here is saved" moments after a file had changed. That is the constitution's central promise traded away for a fraction of a second, and it is the exact shape of the two bugs already caught in this product's history.

The parallel version is most of the speed with none of the risk. `forgetSituations()` is kept as a no-op so the next person to reach for a cache finds the reasoning rather than an empty space.

---

### D-64 `[DECIDED]` — A new attempt exists before anything asynchronous happens

**Decision.** Starting a sign-in creates its record synchronously, before the first `await`.

**Why.** Two faults in one week from the same shape. `begin()` created its state inside the async half, so it returned whatever the *previous* attempt had ended as — a failure from ten minutes ago came straight back as the answer to starting a new one, and the button appeared to do nothing. Separately, the page decided a sign-in had succeeded because *somebody* was signed in, which was true before it started; "sign in to another account" closed itself half a second after opening.

Both are the same mistake: **reading a state that belongs to a previous run and treating it as this one's.** The fix in both cases is to establish what "this attempt" means before doing anything that can interleave — a fresh record on one side, and remembering who was signed in before on the other.

---

### D-65 `[LOCKED]` — A handler that throws is invisible, so the page is read for what it calls

**Decision.** A test reads the page and checks that every function its way in depends on is defined, and that the buttons on the welcome are wired to them.

**Why.** `hideGate` was deleted by an edit that replaced the block around it. From then on the Skip button threw a `ReferenceError` inside its `onclick` — and an exception inside a DOM handler surfaces **nowhere a person would look**. No red text, no failed request, no broken layout. From the outside it is a button that does nothing, which is exactly what was reported.

This is the third fault in this product with that shape: something fails silently and the symptom is "it does nothing". The other two were a promise nobody awaited and a 404 parsed as JSON. **Silence is the failure mode this codebase produces**, so it gets a test rather than more care.

**Also recorded, because it caused this.** Replacing a range of a file by matching its start and end markers deletes whatever sits between them. It has now eaten an adjacent function three times — `lastSavedInWords`, `kindOf`, `reachInWords`, and then `hideGate` and `signInToGitHub`. Check what was in the range before replacing it.

---

### D-66 `[DECIDED]` — A failure never closes the way in

**Decision.** When signing in fails or is cancelled, the welcome screen stays up and says why. It is never closed with the reason left behind it.

**Why.** Closing the welcome and putting the explanation on the page underneath is, from where somebody is sitting, indistinguishable from the button having done nothing and the app having moved on by itself. The one moment a person most needs to know what happened is the moment they are least able to go looking for it.

Cancelling likewise returns you to the welcome with the button usable again, rather than dropping you into the app you had not yet chosen to enter.

---

### D-67 `[DECIDED]` — Percentages need something firm to resolve against

**Decision.** The welcome and every sheet size with `width: 100%` plus a `max-width`, inside a flex column. Not `width: min(30rem, 100%)` inside a centred grid item.

**Why.** A centred grid item is sized to its content, so a percentage width has nothing definite to resolve against — the welcome card came out 475px wide inside a 420px window. Measured at five widths down to 360px; nothing leaves the window and no page scrolls sideways.

---

### D-68 `[DECIDED]` — A timed redraw only lands if something changed

**Decision.** Anything that redraws on a timer builds the page and compares it to what is already there, swapping it in only if it differs. Anything you pressed redraws immediately, always.

**Why.** The flicker. Three timers — the folder watcher, the workspace poll, the other-computers poll — each replaced the whole page every few seconds whether or not there was news. Scroll position jumped, hover states dropped, and an open menu closed itself mid-reach. Measured after: **zero view replacements in eleven idle seconds**, against three timers all running.

A poll also now refuses to redraw while a menu is open, because a redraw underneath one closes it in your hand.

---

### D-69 `[DECIDED]` — Places live in a rail, not a bar

**Decision.** Navigation is a narrow column down the left. Settings is a place in it like any other rather than an icon in a corner, and the account sits at its foot.

**Why.** A bar across the top spends vertical room — the scarcest thing on a laptop — on six words. A rail spends horizontal room, of which there is plenty, and gives every page the full height. Settings became a tab because an icon in a corner is where you put something people are not meant to find, and this is a tool whose settings people will want.

---

### D-70 `[DECIDED]` — Grains, and the one rule they obey

**Decision.** Fine sand falls from the pointer as it moves. One canvas, capped at 260 grains, and the loop stops entirely when the last one lands, so a still pointer costs nothing. Off under reduced motion, and there is a switch in Settings.

**Why.** Asked for. It is the second thing in the product allowed to move without being pressed, and like the first — the light that follows the pointer — it carries no meaning. **It never marks anything, never points at anything and never indicates state.** That is the rule that keeps it decoration rather than a notification, which is what D-3 actually forbids.

---

### D-71 `[ASSUMED]` — Claude Code and Codex do not sign in with Google

**Recorded because it has been asked for four times.** Read out of the tools themselves rather than assumed:

- `claude auth login` offers `--claudeai` (Claude subscription), `--console` (Anthropic Console), `--sso` (a company account). No Google.
- `codex login` offers OpenAI, or `--with-api-key`. No Google.

A Google button on those cards would run `claude auth login` and open Anthropic's page, which is worse than not having one. What was done instead: Claude Code's three real ways in are now three separate entries rather than one, which is a genuine gap that had been sitting there the whole time.

Google appears on Gemini, Antigravity and OpenCode, which do use it. If Anthropic or OpenAI add it, the fix is one line each.

---

### D-72 `[DECIDED]` — The manager widens its own PATH before asking whether anything exists

**Decision.** At startup, the places these tools actually install into are added to this process's PATH — GitHub CLI, Git, Node, the per-user npm folder, the editors' shims.

**Why.** This is almost certainly why signing in "did nothing" in the installed app and worked when run from a terminal. **A program started from the Start menu does not inherit the PATH your terminal has.** It gets the one Windows built at sign-in, which misses anything installed since and misses the per-user npm folder more often than not.

The failure that produces is the worst kind: `gh` is plainly installed, works everywhere else, and this app alone cannot see it — so every explanation the app offers is wrong. Measured here: eight places were missing from a bare desktop PATH, including GitHub CLI and the npm folder that holds `claude`, `codex` and `opencode`.

It changes nothing outside this process and nothing on the computer.

---

### D-73 `[DECIDED]` — Closing the way in means closed

**Decision.** Skipping the welcome, or signing in, is written down. It is not offered again on that computer.

**Why.** It came back every launch. An app that re-asks a question you have already answered is overruling you, and doing it at the moment you are least interested in the question.

---

### D-74 `[DECIDED]` — One press installs the ones that install as a command

**Decision.** Apps that install with a single command — Gemini, Copilot, Claude Code, Codex, OpenCode, Aider — install from their own card, in the open, with the exact command shown before you press. The editors, which come as their own installers, keep a download page.

**Why.** Reversed from the earlier decision to make everything a link. That was right about staleness and wrong about the cost: a person who wants Gemini now has to leave, read a page, find a terminal and come back. Verified by running it — Gemini installed and appeared on the page as available, with Google sign-in, in about twenty seconds.

**Never silently.** The command is printed on the card, the install runs as a watched errand, and every line it prints is kept.

---

### D-75 `[DECIDED]` — Grains, and nothing else around the pointer

**Decision.** The light that followed the pointer is gone. Sand remains: drawn at the screen's real pixel density, capped at 900, and living long enough to fall the whole height of the window from wherever it was shed.

**Why.** Two moving things around one pointer is one too many, and the light was the one carrying no detail. The grains are drawn at `devicePixelRatio` so a grain is a grain rather than a soft blob, and fade slowly enough to reach the bottom rather than dissolving mid-air.

---

### D-76 `[LOCKED]` — The manager does not pass its own surroundings on to the apps it starts

**Decision.** Before anything is started, the manager clears the marks its own window left on this process — chiefly the one that says *be plain Node, not a window*. Every app it starts is handed a clean version of that.

**Why.** This is the whole of "Antigravity does not open any more", and nothing about it looked like what it was.

Running Viberant as a window of its own means the window starts the manager with one instruction in its surroundings: be plain Node rather than a window. That is correct, and it is how the manager runs on a computer with no Node installed. The instruction is read once, at the instant that process starts, and afterwards it means nothing — except that it is still sitting there, and **everything the manager starts inherits it.**

Several of the apps in the list are built the same way underneath: Antigravity, VS Code, Cursor, Windsurf. Handed that instruction, they obediently do not put a window up. You press Open and nothing appears. No window, no error, nothing to read.

The reason it survived being tested: **it only happens when Viberant is run from its own window, and never when the server is started from a terminal.** Every check that had been made was made the second way. Now reproduced, fixed, and held by a test that starts the server with exactly that mark set and reads what the app was handed.

**What else was considered.** Filtering the environment at each `spawn` — rejected as five places to remember instead of one, which is four opportunities to forget. Clearing it once, at startup, is the version that cannot be got wrong later.

**The general form, which is the part worth keeping:** anything the manager inherits from *how it was launched* is not automatically fit to pass on. This is the second fault of that exact shape — D-72 was the first, where the PATH it inherited was too narrow. One of them was too narrow and one was too wide. Both were invisible from a terminal.

---

### D-77 `[LOCKED]` — Nothing that goes wrong may end the manager, and a launch is checked rather than assumed

**Decision.** Two things, because they were one fault.

Every background start has somebody listening for it failing. A start is also given half a second to fall over, and if it does, the answer is `ok: false` with a plain sentence — rather than "it is starting", said because nobody looked.

**Why.** Starting something in the background and not listening for the child saying it could not be started is **not a thrown error and no `try` will catch it.** It ends the process. There were five such places.

What that looks like from the outside is not "one app failed". It is *every button in the app breaking at once*: the window stays up, the page still draws, and everything you press afterwards says the manager is not answering. That is the shape of what was reported, and it is why one broken app looked like the whole product dying.

There is now also a last line of defence — nothing at all is allowed to end this process — but that is a net, not the fix. The fix is that each of the five listens.

The second half follows from the first: once somebody is listening, we may as well hear the answer. A command that dies immediately is now reported as having died, which is the difference between *saying* it started and *knowing*. It costs half a second on a button that already takes several, and it is the same rule as everywhere else here — never claim something happened when it did not.

---

### D-78 `[DECIDED]` — What is on this computer is remembered for eight seconds

**Decision.** "Where is this program?" is asked once and the answer kept for eight seconds. Installing something clears it at once. Who GitHub says you are is kept for five, and anything that changes the answer — switching, signing out, signing in — clears it on the way past.

**Why.** Measured. The AI apps page asked the computer about twenty separate things, one after another, before it could draw anything: **1,290 ms, every single visit, and again after every press.** Asked all at once and remembered for a moment, the same page is **4 ms.** Terminals went from 525 ms to 1 ms; the account in the corner from 375 ms to 37 ms.

Nothing installs itself in the gap between two questions asked half a second apart, so the answer cannot go stale in a way anybody could see — and the two cases where it could have, installing something and changing account, both clear it explicitly.

This is the acceptable half of D-63. Speed here is bought with **staleness about the computer**, measured in seconds and invalidated by every event that could matter. It is never bought with being wrong about somebody's work, which remains forbidden.

---

### D-79 `[DECIDED]` — A sign-in watches for the address, not for the question it used to ask

**Decision.** The GitHub sign-in opens your browser as soon as it has a code, and finds the address in whatever the helper prints rather than waiting to be asked.

**Why.** It had stopped opening the browser at all, and said it was opening one anyway.

Older versions of the helper stopped and waited for a keypress before opening a browser, and this app was that keypress. Newer ones do not stop: they print `Open this URL to continue in your web browser: …` and carry on. Watching only for the keypress meant the browser never opened, while the page cheerfully claimed it was opening — a sentence that was true when it was written and silently became a lie.

**The general form:** a rule written against another program's exact words is a rule with an expiry date on it, and nothing tells you when it passes. Watching for the *thing you need* — an address — survives the wording changing.

---

### D-80 `[DECIDED]` — A dead end says which dead end it is, before you fill in the form

**Decision.** Putting a project on GitHub asks whether you are signed in before it asks you anything else, and says so plainly if you are not. The failure afterwards no longer guesses.

**Why.** Not being signed in and a name already taken produce the *same* refusal from the far end. The app read that refusal as the second one and told somebody to pick another name for a project that did not exist — and would have said it again for every name they tried. A loop with no way out of it, built entirely out of one confident guess.

Two changes, in this order of importance: ask first, so the form is never offered when it cannot succeed; and when it does fail, read what came back rather than assuming.

---

### D-81 `[DECIDED]` — A secret is never handed to the page

**Decision.** The page is told *whether* a secret is set, never what it is. The Google client secret goes from the settings file to Google and nowhere else.

**Why.** Its own description says it stays on this computer. Sending it to the page in every settings reply would have made that sentence false — and the page has no use for it, because all it ever draws is "Set…" or "Set — replace it".

---

### D-82 `[DECIDED]` — Google signs you in to Viberant, and says what that is worth

**Decision.** The Google button signs you in to Viberant itself, by the device flow, using a Google application you register once. It does not sign you in to the AI apps; their own cards already do that (D-58, D-59).

**Why.** It was asked for repeatedly, and what was there instead offered a list of apps that use Google — which is not what a button saying "Continue with Google" claims to do.

The one hard fact, stated plainly because it is the reason this took so long: **a Google sign-in cannot exist without an application registered with Google.** Every Google button anywhere is backed by one. There is no anonymous way in, by design. So the flow is built and working, and the two values it needs are asked for once in Settings, with the button saying exactly that until they are there.

**What signing in with Google actually gets you, said honestly on the button itself:** your name on this computer. It is not where a second copy of your work goes — that is what GitHub is for, and conflating them would be the more attractive lie.

---

### D-83 `[LOCKED]` — A folder is watched by the name the computer itself uses for it

**Decision.** Before anything is watched, the folder's real name is asked of the computer. Only that name is handed to the watcher. Everywhere else the folder keeps the name the person chose it by, because that name is how a project is recognised again next time.

**Why.** This one ends the manager outright, and **no `try` anywhere can stop it.**

Windows keeps a second, shortened name for any folder whose name is longer than eight characters — `C:\Users\Administrator` is also `C:\Users\ADMINI~1` — and plenty of ordinary things hand out the short one. The watcher underneath Node takes whichever name it is given and then compares it against the name Windows reports changes under, which is always the long one. They do not match, and it stops the process where it stands:

```
Assertion failed: !_wcsnicmp(filename, dir, dirlen), file src\win\fs-event.c, line 72
```

That is not an error. It is not thrown, it never reaches `uncaughtException`, and **the last line of defence D-77 installed cannot see it** — the process is simply gone. From the outside it is not one broken button; it is the whole app dying the first time a file changes in your project, which is the exact symptom D-77 was written about and a completely different cause.

Reproduced here in about a second: a folder under the system's own temporary directory, which on this computer is a short path, killed the server on the first press of Open. It took fourteen tests down with it and they had been read as fourteen separate faults.

**The general form, and the reason this is locked.** D-77 said nothing at all is allowed to end this process, and made that true for every failure that travels through JavaScript. This is the first one that does not. A guard written in one language cannot catch a decision made in another, so the only defence is never to hand the lower thing a value it cannot live with. The same applies to a folder reached through a linked or substituted drive.

**Where it was already true and nobody noticed.** The same watcher exists in `core/reference/src/gateway.mjs`, where its `catch` carries a comment explaining that some filesystems refuse recursive watching. That comment was correct and the `catch` was useless for this, for the same reason.

---

### D-84 `[LOCKED]` — A computer that cannot write says so, standing, on the page

**Decision.** Putting this computer's three files into the shared workspace returns the product's one failure shape rather than a bare yes-or-no. The reason is kept, and the Workspace page shows it as a standing sentence for as long as it is true — not only during the two seconds an errand happens to be running.

**Why.** Found on a real second computer, and it had been failing every couple of minutes for hours in complete silence.

Saved work has to be signed with a name. That computer had none set — no name, no email, no settings file at all — so **every single write failed.** The failure was swallowed by a helper whose whole purpose is to swallow failures, and the answer that came back said nothing was wrong. What that produces is not one broken feature:

- the other computer showed *"Only this computer so far"*, because nothing this one wrote ever left;
- this computer was never reachable on the network, because that was hung on the same answer (D-85);
- **"Check again now" appeared to do nothing**, because the reply was thrown away unread;
- and joining said *"press Join again in a moment"* — advice that would never once have worked, offered indefinitely.

Four symptoms, four places to look, one cause, and nothing anywhere said the word "name".

**The two failures need opposite things and must not share a sentence.** Being offline fixes itself and "try again in a moment" is right. Having no name set never fixes itself, and telling somebody to wait for it is a loop with no way out — the same fault as D-80, in a different room. So the question is asked *before* writing rather than after it fails, which is what makes the sentence about a name rather than a shrug.

**What was already there and unused.** Saving a project has guarded this since it was written, with a sentence for it. The workspace, doing the same thing to a different folder, did not. A rule enforced in one of the two places it applies is a rule that will be discovered by the person it fails.

---

### D-85 `[DECIDED]` — Being findable does not wait on having been heard

**Decision.** After joining, this computer starts being findable on the network whenever the workspace is actually here — not only when joining reported success. It is tried again on the ordinary beat, rather than once at startup.

**Why.** Joining can succeed at the part that matters and still answer `ok: false`. The workspace is cloned, the key is readable, everything the network half needs is in place — and the answer is a refusal because what this computer *wrote* has not gone out yet. Hanging findability on that answer left this computer permanently invisible to the other one, with a button on screen saying it was not reachable and nothing saying why.

The startup attempt has the opposite problem: it runs before anybody has joined anything, so on a computer's first day it is the one attempt guaranteed to be too early. Between them, a computer that joined on Tuesday was never findable again until it was told to be, by hand.

**These are two different questions.** *Can the others recognise this computer* and *has this computer managed to write anything down* have different answers, and only the first one decides whether to open the door.

---

### D-86 `[DECIDED]` — A computer is asked at every address it offers, not the first one

**Decision.** Addresses are ranked before they are advertised — ordinary private networks first, the ones Windows invents for virtual machines and the ones an adapter gives itself when nothing answered last. Then every address is tried in turn, and whichever one answers is remembered by name.

**Why.** Measured against the real second computer, which advertised this:

```
["172.27.240.1", "192.168.0.3", "172.28.176.1"]
```

The middle one is the only address on the network. The other two are switches Windows makes for its own virtual machines — real addresses of that computer, on networks that exist only inside it. Asking went to the first one and stopped there, so every question went somewhere unreachable and came back as *"could not be reached, even though it says it is here"* — which is a sentence that tells you nothing you can act on, and was in fact describing a computer sitting three feet away with its door open.

**Ranking is a guess; trying them all is the fix.** Both are here, and the order they are in matters: the ranking makes the common case cost one attempt, and the falling-through makes an unusual setup work at all rather than merely work slowly.

**Two details that are load-bearing.** An address on a network that does not exist does not refuse — it says nothing, and this computer waits out its own connect timeout, about twenty seconds. So each address gets a short turn rather than the full wait, which is the difference between trying three and appearing to hang. And the one that answered is written down *by name* rather than by position, because a shout arrives every few seconds and rebuilds the list — a fact kept as "the first one" would be overwritten five seconds later.

---

### D-87 `[DECIDED]` — The Workspace page draws what it knows and reaches out behind it

**Decision.** Opening the Workspace page reads what is already on this computer and answers. Reaching GitHub happens behind the answer, and what it brings back arrives on the next quiet redraw.

**Why.** Measured, three times: **1,500 to 2,200 ms**, on every single press of that tab and again every twenty seconds, because the page reached GitHub before it drew anything. Reading what is here is **2 ms**; the whole route is now about 210 ms, and what remains is asking who you are.

**Why this is allowed and D-63 is not violated.** D-63 forbids buying speed with being wrong about somebody's *work*, and that stands. Nothing on this page is about your work — it is who else is about, what they have, and what was said. Being a few seconds behind another computer is the same trade D-78 already accepted for what is installed here, and it is invalidated by the same thing: anything you press reaches out at once.

**One detail that would have quietly made things worse.** The obvious way to do the reaching-out is to reuse the errand that tells the others what changed here. That one is *due* every time it runs, so putting it on a page that polls every twenty seconds would write a save into the shared workspace three times a minute — making O-9 considerably worse to make a page faster. It fetches every time and writes on the ordinary two-minute beat instead, which is exactly what it cost before.

---

### D-88 `[DECIDED]` — The last step of a folder arriving waits out Windows

**Decision.** Moving a finished folder into place is retried for about a second and a half, on the refusals that pass. Refusals that will not pass are not retried.

**Why.** Found by running the tests six times instead of once. Twice out of six, a folder that had arrived **completely** was reported as not having arrived, because the final rename came back `EPERM`.

Nothing about that refusal concerns this program. A virus scanner reads a file the moment it is written, the search indexer opens the folder, and a folder that was just deleted keeps its name reserved for a moment afterwards. Everything either side of that line already waits — both deletions there ask for five attempts a tenth of a second apart, for exactly this reason. **The one step between them did not, and it is the step where giving up costs the whole transfer.**

**Why this matters more than a flaky test.** Every byte had arrived and the person was told the folder did not come. That is the failure this product is least allowed to have: not a thing going wrong, but the app being wrong about whether it went wrong. It would have happened to somebody moving a real folder at roughly the rate it happened here.

---

### D-89 `[DECIDED]` — The sheet is tokens first, and that is what "written once" has to mean

**Decision.** Every value in `app/ui/style.css` comes from a token declared at the top. A number appearing twice in that file is a token that has not been made yet. This is the second full rewrite of that sheet.

**Why.** D-56 rewrote this file once already, for a good reason, and stated the rule: contradictory rules in one stylesheet are a correctness problem, not a tidiness one. By this session the last 250 lines were four blocks of overrides — re-setting type sizes, radii, shadows and every animation length declared earlier. **The truth about any property once again depended on reading to the end.**

So D-56 was right and insufficient. "Write it once" is a description of a moment; the file is edited afterwards by definition. What survives editing is a *rule you can check*: if the value is a literal, it is wrong. Appending an override becomes visibly the wrong shape rather than merely inelegant.

**The one place this pays immediately.** Reduced motion used to be nine separate `@media` blocks scattered after each animation, and two of them had been missed. It is now one block that sets the motion tokens to zero, so anything using a token is covered whether or not anybody remembered.

---

### D-90 `[DECIDED]` — A list is one panel with lines in it, not a column of cards

**Decision.** `.lane` is a single bordered, rounded surface and its children are rows divided by a hairline. A card is for something conceptually independent of what surrounds it, and nothing else.

**Why.** Every list in the product was a stack of separately bordered, separately rounded, separately shadowed boxes with a gap between them. That spends four pixels of furniture per row to say what one pixel of line says better, and — the part that actually matters — **it makes eleven related things look like eleven unrelated things.** The AI apps page is a list of one kind of thing; it was drawn as eleven floating rectangles.

This is the single loudest signal of a hurriedly-styled interface, and removing it changed the feel of every screen at once without a line of screen code being touched, because every screen already used `.lane`.

**What it cost:** nothing on any screen had to change. That is the argument for having had a shared class in the first place.

---

### D-91 `[DECIDED]` — One accent, and it means selected, primary, or focused

**Decision.** `#7C5CFC`, spent on four things: the active place in the rail, the primary action, the focus ring, and a selected row. Not on borders generally, not on headings, not as a gradient across large surfaces.

**Why.** The gradient from violet to cyan was on the mark, the primary action, the spine of a published project, every progress bar and every chip that wanted to look important. A colour used everywhere means nothing anywhere, and an accent's whole job is to be the thing your eye goes to first.

**What was reversed.** D-56's stated look was "a dark terminal-adjacent surface with one gradient — violet into cyan". The gradient is gone; the accent that replaces it is a single flat colour. The rest of D-56's reasoning — grey with meaning-coloured accents, interactive where interaction tells you something — stands unchanged and is in fact easier to see now.

---

### D-92 `[DECIDED]` — Everything by typing, and nothing only by typing

**Decision.** `Ctrl K` opens a field that reaches every place and every common errand, with the keyboard. **Nothing lives only there.** Every entry in it is something already reachable by pressing something visible.

**Why.** A tool somebody has open all day should not require the mouse to change what they are looking at. The rule attached to it is the load-bearing half: a thing you can do *only* through a palette is a thing that does not exist for anybody who has not been told the palette is there — which is a way of hiding features while feeling like you are adding them.

**Why this is a surface, and why that is allowed.** A-3 draws the line between a surface and a render target: a surface captures intent. This captures intent, so it is the third one. It obeys everything the other two obey — one plain sentence on failure, no counts, nothing that comes at you.

**What was reversed, and it was a bug wearing a feature's clothes.** Bare digits used to move between places, so typing a number anywhere outside a text box teleported you somewhere else. Every shortcut now needs Ctrl.

---

### D-93 `[DECIDED]` — The places are grouped, and the bar across the top is chrome

**Decision.** The rail groups its six places into what you start, what leaves this computer, and what changes the manager. A shallow bar above the work says where you are and holds the way in by typing. Below 68rem the rail keeps every place and loses only its words.

**Why.** Six undivided rows is a list you re-read every time rather than a shape you learn, and the grouping says something true rather than merely tidy. D-69 chose a rail over a bar because vertical room is the scarcest thing on a laptop; a 48px bar that holds only where-you-are and the search does not reopen that decision — it spends the smallest possible amount of the scarce thing on the one question a person asks constantly, which is *where am I*.

**The rule for narrower windows:** nothing becomes unreachable. Words go, places never do.

---

### D-94 `[DECIDED]` — A wait shows the shape of what is coming, after a beat

**Decision.** A screen that has not drawn within 120 ms shows the shape of itself — a heading, a line, and four rows — until it has. Under that, nothing.

**Why.** Every screen here asks the manager something before it can draw, and until now it drew *nothing at all* while it waited. Pressing a place did visibly nothing for as long as that took, which is the reported complaint: not that the app is slow, but that it feels stuck. Those are different faults and this is the second one — D-62 already established that speed and the appearance of speed both have to be fixed, and fixed separately.

**The beat is the load-bearing part.** Showing a skeleton immediately means every fast screen flashes one on the way past, which is a flicker introduced in the name of removing one — precisely what D-68 spent a session undoing. Below the threshold you see the page appear. Above it you see the shape and then the page, which is the difference between waiting and wondering.

**And it is compared, not assumed.** The skeleton only lands if what is on screen has not changed since the wait began, so a screen that draws in two stages is never overwritten by a skeleton arriving late behind it.

---

### D-95 `[DECIDED]` — One action on a row, and everything else behind one more press

**Decision.** A project row carries Open and an overflow. The overflow opens the same list as right-clicking the row.

**Why.** There were four buttons on every row, competing with each other and with the four facts the row exists to show. Only one of them is what anybody came for. Four equal buttons is a claim that they are four equally likely things to want, and that is not true of any of them.

**The rule attached to right-click, which matters more than the feature.** It is never the only way to reach anything. A menu that exists only on right-click is a menu most people never find, so it is a shortcut for those who expect one and nothing else. The same items, in the same order, are one visible press away.

---

### D-96 `[LOCKED]` — Three numbers agree, or nothing is kept

**Decision.** A parcel says what is coming before it sends anything, and says what it sent when it finishes. The receiver holds both against what actually landed on its disk. Unless all three agree on the file count and the byte count, the transfer failed and nothing is kept.

**Why.** The reported fault was one computer advertising 1.3 GB and the other ending up with about 300 MB — **and being told it had worked.** The second half of that sentence is the whole reason for this entry.

The closing line has said what was sent since the format was written. Nobody was comparing it to anything: the receiver read it, threw it away, and reported its own count as the answer. So every way a folder can quietly lose part of itself came out looking like a success — a folder the sender could not open, skipped whole and silently; a file too large for one parcel, dropped without a word; a write that failed on the receiving disk, counted as though it had worked.

**Why two numbers are not enough.** A sender that skipped a subtree tells itself a consistent story the entire way through: it did not see those files, so it does not count them, so its closing line matches what it sent. Only a count taken *before* the walk went wrong disagrees with it. That is what the opening line is for, and it is also what makes an honest percentage possible.

**Locked** for the same reason D-55 is. This is the second thing in the product that can destroy work, and the failure mode is the worst one available: silent, plausible, and discovered weeks later when somebody opens the folder.

---

### D-97 `[DECIDED]` — One walk decides what a thing weighs, and it happens at the moment of asking

**Decision.** `survey()` is the only walk. The number on a card, the opening line of a parcel and the bytes actually put on the wire all come from it, and it runs when somebody asks for the folder rather than whenever it was first offered.

**Why.** There were two walks and they disagreed by design. A project's size came from the fingerprint, which skips the history folder and stops counting at thirty thousand files; the bytes that travelled came from the parcel, which does neither. On a project with a large history or a lot of files those are simply different numbers, **and the one on the screen was never the one that moved.** An offer's size was measured the same way as its send, but at the moment it was offered, which on a project somebody is working in is a different folder by the afternoon.

**A folder that cannot be read is not an empty folder.** `readdir` failures were caught and turned into an empty list, so a subtree this computer could not open disappeared from the parcel and from the count, consistently, and the receiver had no way to know. They are counted now, and the sender refuses to send at all rather than send a folder with a hole in it.

---

### D-98 `[LOCKED]` — Nothing is offered until somebody offers it

**Decision.** Reverses D-44. A project is not visible to your other computers until it is offered, one project at a time, on purpose. Files and folders are offered the same way, into the same register, and that register is the only thing any other computer is ever told about.

**Why.** Read off the other computer's screen:

> 1MS22AI · Contacts · Download · Viberant

Two of those are Windows' own folders. Nobody offered them to anything. They were on another computer because **being in the projects list was the offer**, and the only way out was to notice each one and object to it.

D-44 argued that they are your own computers and your own account, so hiding your work from yourself is a strange place to start. That is a fair thing to say about projects and the wrong shape for a rule: it makes the quiet path the one that gives things away and the loud path the one that keeps them. Offering is one press, once, per thing — and somebody who has pressed it knows what is out there, which is the property that actually matters.

**Kept as an absence, exactly as before.** What is not offered is not in the list this computer publishes, so there is nothing to ask about and nothing to get around.

**Stopping is not deleting**, and the two may never become the same gesture. The sentence says so and a test holds it.

---

### D-99 `[DECIDED]` — One loop watches an errand, and it is owned

**Decision.** One timer, held in one place, cancelled before another is ever set. A screen redrawing while an errand runs paints it once and does not start a second loop.

**Why.** This is where three separate complaints came from — the app refreshing by itself, flashing during a deploy or a transfer, and losing your place. Every screen that can show an errand ended with `if (watching) paintJob()`, and `paintJob` ended by asking for itself again in a second, with nothing stopping the loop already running. **Each redraw added a loop.** Deploy something, change tabs twice, and four independent pollers are replacing the same part of the page on four different beats. Measured after: two pending timers after sixteen tab switches, against unbounded growth before.

**And an errand is edited rather than rebuilt.** Replacing that panel every second threw away whether you had opened what it printed and where you had scrolled inside it. Lines are appended, and it follows to the bottom only if you were already there — scrolling back to read something is a decision, not an accident to be corrected every second.

---

### D-100 `[DECIDED]` — Where you were is restored, because replacing a page does not preserve it

**Decision.** A redraw captures how far down the page is and what was focused, and puts both back.

**Why.** Nothing in this codebase ever called `scrollTo`, which is why it was not found by looking for one. Rebuilding the page empties the one element that scrolls; an empty element has no height; the browser clamps how far down it is to zero; and the new page arrives underneath you at the top. It happened whenever anything at all changed — another computer appearing, a transfer counting up, or "3 min ago" becoming "4 min ago".

**Measured:** parked at 2,190 of 3,801 pixels, still at 2,190 after a live update.

---

### D-101 `[DECIDED]` — Rows get the desk, sentences get a column

**Decision.** Two widths. Screens made of rows use the width of the window; screens made of sentences and controls keep a reading column, and a paragraph keeps its column even on a screen using the full width.

**Why.** One number was serving both. On a 1920 screen it left a third of the workspace empty while the rows inside it squeezed their own contents. Rows are read across — a name, its facts, what you can do — and want the monitor; prose is read down, and a line 1,600 pixels wide is one nobody's eye can track back from.

---

### D-102 `[DECIDED]` — Two of the same transfer cannot fight over one folder

**Decision.** A destination that is already receiving something refuses a second transfer into it, in the product's one failure shape.

**Why.** Both transfers write to the same folder and the same half-finished folder beside it. The second deletes what the first has written, then both try to move a folder into the same place, and whichever finished second was "verified" against files the other was in the middle of removing.

**The button is the wrong place for this rule.** A button can be disabled, and a second window, a keyboard shortcut and the palette all still reach the same errand. It belongs where the errand is, which is also where it can be tested without a browser.

---

### D-103 `[LOCKED]` — Bringing a project brings the project, and GitHub is the fallback that says so

**Decision.** A project comes across the local network whenever the computer that has it is reachable. GitHub is used only when it is not, and says what a copy from GitHub carries **before** you agree to it.

**Why.** This is the reported fault — "only downloading 300MB out of 1.3GB" — and it was in none of the places the previous session had been looking.

Bringing a project from the Workspace went through `gh repo clone`. **A clone carries what has been saved and sent, and nothing else.** So a folder that is 1.3 GB on the other computer arrived as the fraction of it that had been committed, and everything missing was real: assets, local settings, anything deliberately left out of what gets saved, anything not yet saved at all. The card said 1.3 GB because it was describing the folder. The transfer was describing something else entirely, and nothing on any screen said they were different things.

**Measured, two computers over a real socket:** a 58 MB folder comes through GitHub as **493 bytes**, and across the network as 58 MB, 71 files, 38 directories, whole.

**The part worth keeping.** Every check added in D-96 — promised, sent, landed — could never have caught this, because a clone is not a parcel and passed through none of them. Verification protects a path; it says nothing about a path going somewhere else. The lesson is not "add more checks", it is *check that the thing being measured is the thing that happens.*

---

### D-104 `[DECIDED]` — An errand's result carries where the thing landed

**Decision.** `jobs.end` carries `at` through to whatever is watching, and one function registers anything that arrived.

**Why.** A folder that came across the network completely then **never appeared in Projects**. `jobs.end` picked three fields out of its result by name and threw the rest away, including where the thing had gone. The line meant to register it read `if (done.ok && done.at)`, and `done.at` was always undefined, so it silently did nothing.

Nothing failed. A step simply never happened, which is this codebase's signature failure and the fourth time it has been recorded — a promise nobody awaited, a 404 parsed as JSON, a handler that threw inside `onclick`, and now a field dropped by a destructure.

**And the registering is one function**, because the last two lines of a transfer are exactly the sort of thing that gets written three times and corrected twice. A file is left alone: registering it as a project would put something in the list that cannot be opened.

---

### D-105 `[DECIDED]` — A menu that hangs at the pointer is not a dropdown

**Decision.** Menus opened at the pointer carry their own class and their own closing. The handler that closes dropdowns does not touch them.

**Why.** Pressing Offer did nothing at all. The menu was given the class every dropdown in the app uses, so the click that created it carried on up to the document, where the handler that closes dropdowns hid every panel on the page — including the one half a millisecond old. It was created and hidden by the same click.

**Why not `stopPropagation`.** It works, and it works per caller, which means it works until somebody adds a caller. Two mechanisms that can reach each other will eventually be made to.

**Recorded because of how it survived being checked.** It was verified — by asking whether the menu's items existed in the page. They did. It was invisible. **A check that asks the wrong question passes exactly as convincingly as one that asks the right one.** Visibility is now asserted by hit-testing what is on screen, and the same test caught that this environment does not advance animations at all.

---

### D-106 `[DECIDED]` — A look is chosen by looking at it

**Decision.** Appearance is eight small pictures of the actual shell, each drawn with that look's own values. The default palette and `[data-theme="dark"]` are one selector rather than two copies.

**Why.** It was a dropdown reading "Deep blue", which tells you the word somebody chose and not the question anybody is asking. Choosing was picking a name, waiting for the whole app to change, and undoing it.

**What is deliberately not here.** The imagery themes — Deep Space, Orbital, Nebula, Rig Room — are not built and are not pretended at. Naming a theme "Deep Space" with no space in it would be a worse lie than not having it, and they need licensed 4K assets, a pipeline, and a dim-and-blur layer that does not cost anything at rest.

---

### D-107 `[LOCKED]` — One session says who Viberant is, and a mismatch is shown rather than resolved

**Decision.** `github.session()` is the only answer to "who is Viberant on GitHub". `github.bindingOf(dir)` is the only answer to "where does this project send", read from the project itself. `destinationFor(dir)` holds the two together and **refuses when they disagree**. The destination is on screen beside the button, and the press hands back what the page said.

**Why.** Reported: Viberant showed one account and pushed as another.

They are genuinely two identity systems and nothing was holding them against each other. `gh` has an active account. **`git push` does not use it** — it authenticates through whatever credential helper this computer keeps, which on Windows is a store that may hold a different name from a different day. D-42 found this once for the case where the store held *nothing*; the worse case is the one where it holds *somebody else*, because that one succeeds.

**Why it refuses rather than picking.** Either choice is a guess about intent, and one of them puts somebody's work on an account they were not thinking about. That is the worst outcome available at this point in the product, and it is exactly what happens if this code tries to be helpful. A mismatch is a fact to show.

**Locked** because the failure is silent, plausible and discovered late — the same shape as D-96, and for the same reason.

---

### D-108 `[LOCKED]` — The workspace is infrastructure, told apart by path and never by name

**Decision.** The workspace repository declares `PURPOSE = 'workspace'`. Anything asking whether a folder is part of it asks `isInsideWorkspace()`, which compares real paths. No code path decides this by looking at a name.

**Why.** A project called `Viberant` is one hyphen from `viberant-workspace`. A rule that read the name would be wrong the first day somebody named a project after the workspace — and being wrong here means source code entering a repository that exists to hold three small files about which computers are about.

**And the guard was broken when written, which is the part worth recording.** `git rev-parse --show-toplevel` answers with Windows' long name, always. Paths from elsewhere in the app may be the eight-character short form. So the check compared `C:\Users\ADMINI~1\…` against `C:\Users\Administrator\…`, found them different, and would have answered "not the workspace" **every single time, confidently**. Caught by writing the test, not by reading the code. It is the same trap as D-83, which had the decency to end the process rather than merely be wrong.

---

### D-109 `[DECIDED]` — Taking a project off the list and deleting it are two words, two routes, two sentences

**Decision.** *Off the list* touches no file. *Delete* puts the folder in the recycle bin, asks for the project's own name first, and says what it is not touching. Neither goes near GitHub or another computer.

**Why.** A project could be added and never removed, so the feature had to exist; the only question was how to stop the two being confused. The answer is not a well-worded dialog — it is that they share no wording, no route and no code path, so there is nothing to confuse.

**The recycle bin rather than a delete.** This is the only destructive thing in the product, and the undo people already have is the one Windows gives them. If the shell refuses, this refuses too: falling back to deleting outright would turn a recoverable action into an unrecoverable one at the exact moment something was already going wrong.

---

### D-110 `[DECIDED]` — Every address is defined exactly once, and a test says so

**Decision.** A test reads the routes and fails if any address appears twice.

**Why.** The routes are one object literal, and **a duplicate key in an object literal is not an error** — the later one silently replaces the earlier. Writing a route that already exists therefore deletes the old behaviour with no warning, no failing test, and nothing on screen changing until somebody presses the one button that used to work.

Found by doing it: `POST /projects/forget` written a second time, four hundred lines below the first, and the old one stopped existing.

---

### D-111 `[DECIDED]` — A list of one kind of thing is a table

**Decision.** Projects, AI apps and Terminals are tables sharing one column system, built on `subgrid` so rows take their column edges from the table rather than each deciding for itself.

**Why.** Eleven AI apps as eleven cards filled a screen to say what a table says in a third of it, with nine accent buttons competing for the same eye. Sixteen projects as sixteen 97-pixel rows put a hundred-and-twenty-character path under every name, in monospace, each beginning with the same eighty characters.

**Two faults found by photographing it rather than reading it.** The columns were declared on each row, so every row was its own grid and `1fr` resolved against that row's own content — the state, the date and the actions landed somewhere different in every row, drifting further the longer the path. And `.trow.pick` collided with `.pick`, the hanging-menu item, which sets `display: flex` — so a clickable row silently stopped being a grid at all. Neither is visible in the source; both are obvious in a screenshot.

---

### D-112 `[DECIDED]` — An errand's panel is rebuilt when there is nothing to edit

**Decision.** `paintJob` rebuilds its scaffolding when the elements it writes into are missing — not merely when the errand changed.

**Why.** This is the "Build closes the app" report, and it was mine, from D-99's own fix.

Making that panel incremental was right: rebuilding it every second threw away the open state and the scroll position. The condition was wrong. It rebuilt only when the errand *changed*, but **every redraw replaces the page**, so `#job` came back as an empty div while this function still believed it had drawn there a moment ago. It then wrote each piece into an element that no longer existed — silently, because writing into nothing is not an error. Press Build, watch it work, and the entire result disappears.

**The build was never broken.** Driven through the API it produced steps, output, an artifact and a correct verdict, with the server alive throughout. So the fault was purely in reporting it, which is *worse* than a broken build rather than better: the work happened and the person was told nothing.

**"Has this changed" and "is this still here" are different questions**, and an incremental renderer has to ask both.

---

### D-113 `[LOCKED]` — A deploy is finished when the host says so, not when the push returns

**Decision.** Putting a site on GitHub Pages asks GitHub what it built, waits with a growing gap, and reports one of three things: built, errored with GitHub's own reason, or still building.

**Why.** `git push` returning zero means the work arrived. It says nothing at all about whether a website exists at the other end — GitHub builds these on its own schedule and can decide it cannot, leaving an address that serves nothing. Declaring success at the push is how somebody sends a link to a page that is not there.

**Three answers where there was one assumption.** "Still building" is a real answer and is reported as itself rather than being forced into a verdict, because a build that is still going after two minutes is not a failure.

**Locked** under the same rule as everything else here: never claim something happened when it did not.

---

### D-114 `[DECIDED]` — What an errand made is offered, not described

**Decision.** A finished errand carries what it produced — the artifact, its size and where it went; the release address; the site's address — and the panel offers each as something to press. Opening an address goes to the computer's browser, never this window.

**Why.** An errand that built a file and then only says it built a file has stopped one step short of useful. The address of a site that is now live is the single thing anybody wants off that panel, and it was in a sentence.

**Why not this window.** Navigating the manager to somebody's newly published site replaces the manager with the site, and the way back is not obvious to anybody who has not met a window like this before.

---

### D-115 `[DECIDED]` — GitHub has a room with space in it

**Decision.** Which account every GitHub action will use is stated on the Settings page. The corner keeps quick switching.

**Why.** It had no home but the panel at the foot of the rail, which is 272 pixels wide and was being asked to hold a list of accounts, a paragraph explaining what signing in to another does, and two buttons. That is where the reported clipping came from, and **no amount of shortening the paragraph fixes a column that narrow.** The answer to text that does not fit is somewhere with room, not fewer words.

---

### D-116 `[DECIDED]` — Something you do not have is not an interruption

**Decision.** The strip at the top of every screen carries only news about projects **you already have** that have moved somewhere else. A project that exists elsewhere and not here belongs to the Workspace table and appears there only.

**Why.** Both were being drawn, so the same offer appeared twice — and the banner copy followed you onto every other screen in the app. They are genuinely different: a project you are working in whose other copy has changed is a fact you need before you carry on; a project you have never had is a thing that might be nice to fetch, which is what a list is for.

---

### D-117 `[DECIDED]` — The scenes are drawn, not shipped

**Decision.** Deep Space, Orbital, Nebula and Rig Room are generated by about two kilobytes of canvas code rather than bundled as photographs.

**Why.** Four of these are pictures of things nobody can photograph on demand. The alternatives were shipping somebody else's images or shipping nothing, and both are bad answers. Drawn, they carry no licence, they are exactly the size of the window on any screen because there is no pixel grid to run out of, and moving them is a transform rather than a decode.

**The layer order is the readability argument, and it is deliberately not glass:** picture, then a tone the theme controls before anything is drawn on it, then surfaces that stay near-opaque, then text — which therefore never sits on a photograph. Making every panel transparent and blurring what is behind it is the fashionable answer and the wrong one: it puts a moving picture directly underneath the words, and no amount of blur makes that as readable as a surface.

**What it is allowed to cost.** It lives outside the frame, so changing places never touches it. Twelve frames a second, not sixty, because nothing here moves fast enough for anybody to tell and this is the layer that must never take time from a transfer. A window nobody is looking at draws nothing — confirmed by the measurement of it timing out, since `requestAnimationFrame` does not fire in a hidden document. Two megabytes.

**And Minimal Graphite has no scene at all**, on purpose. If the interface only looks good with a picture behind it, the interface is not good.

---

### D-118 `[DECIDED]` — One press selects, two opens, and the panel shows only what is known

**Decision.** Selecting a row opens a column beside the work describing it. Opening the thing takes a second press. The panel omits any fact this computer does not have rather than showing it empty.

**Why.** A row that opened a project on one press meant you could not look at one without leaving the list you were looking at it from. Selecting and opening are two intentions and they get two gestures.

**Its own column, not a floating panel.** A panel that covers the thing you selected is a panel you have to close in order to see what you selected. Below 74rem it becomes a drawer instead, because taking three hundred pixels from a table at that width leaves no table.

**Nothing is invented to fill it.** A machine whose address this computer has not been told is a machine with no address line — not one reading "unknown", which costs a row and says nothing. The same rule the rest of the product already follows about not claiming things.

**The audit that followed found a fault this introduced**, which is the argument for running it every time: a 26px mark in a 26px track overlapped the name beside it by six pixels on every row of two tables. A row carries its own padding while its columns come from the table above it, so an item sized to exactly its track finishes inside the next one. The track is wider than the mark now — sizing the container rather than chasing the padding, so it cannot come back when spacing next changes.

---

### D-119 `[LOCKED]` — One account name exists in the source, and it decides nothing

**Decision.** Exactly one account name is written down: the address of Viberant's own issue list, named `ISSUES_FOR_VIBERANT`. A test reads every file that decides where work goes and fails on any owner/name literal in them.

**Why.** A name left in the source from whichever computer the product was built on acts as a default nobody chose, and the reported fault was work reaching an account nobody chose. The search found only the issue list — but it was called `HOME`, and `HOME` beside an owner/name pair reads like somebody's account, which is exactly the confusion worth removing.

**The test is the point, not the search.** Searching once proves today. The test is what makes it still true after the next person adds a convenience.

---

### D-120 `[DECIDED]` — A panel that hangs out of something that scrolls has to leave it

**Decision.** Panels marked `data-floats` are positioned against the window, measured at the moment their contents are decided.

**Why.** The account menu lives at the foot of the rail, and the rail scrolls. **An absolutely-positioned child of a scrolling box is clipped by that box and counts towards what it has to scroll** — so the menu was cut off at the rail's edge and gave the rail a sideways scrollbar. That is the reported protrusion, and no width fixes it because the container was the problem.

**Measured when its size is decided, not when it appears.** The first attempt measured at opening, while it still said "looking…" — three lines tall. The real content then arrived at ten times that and hung off the bottom of the window. Placing something by its size means placing it whenever its size changes.

---

### D-121 `[LOCKED]` — A foreign remote is not an invitation to switch accounts

**Decision.** When a project belongs to one account and Viberant is signed in as another, both facts are stated and the offer is to connect *this project* to the account in use. The old address is kept under another name, never replaced.

**Why.** Offering "switch to whoever owns this" treats the account somebody deliberately signed in as as the thing that is wrong, and it is the one option that quietly changes what every *other* project on the computer will do. Connecting one project changes one project, which is what somebody in that situation actually meant.

**Why the old address is kept.** Discarding where somebody's work used to go, in order to make a send succeed, is exactly the kind of quiet damage this product is not allowed to do. It is written into the project under `where-it-used-to-go`, before anything is repointed, so there is never a moment where it exists nowhere.

---

### D-122 `[LOCKED]` — The account is per computer; the binding is per project

**Decision.** A deployment provider's sign-in belongs to the computer. Where a project deploys belongs to that project, kept by path and compared without case.

**Why.** These have genuinely different lifetimes, and conflating them produces the failure that costs somebody a website: switch from project A to project B, press Deploy, and B goes over A's site because something about A was still held.

**Held by a test** rather than by care: binding one leaves the other alone, and binding the second does not move the first.

---

### D-123 `[LOCKED]` — The names of settings are read; the values are not

**Decision.** Project inspection reports which environment settings a project expects, from its example file. The file holding real values is never read.

**Why.** Knowing `DATABASE_URL` is expected and missing is the entire useful half. The value is the half that must never enter this process — because what inspection returns is shown on a screen, written into logs, and, the moment anything here can ask a model about a project, sent somewhere.

**A test fails if any value appears in what inspection returns**, which is the only version of this rule that survives somebody adding a field later.

---

### D-124 `[DECIDED]` — What a project is, is read out of the project

**Decision.** Frameworks are recognised by a dependency actually present in `package.json`; the package manager by which lock file exists. A folder with none of those is not called a website.

**Why.** Guessing from folder layout is right until somebody arranges their folders differently, and the cost of being wrong is offering to publish somebody's notes as a website. A folder of notes now gets no offer at all, which is the honest answer.

---

### D-125 `[LOCKED]` — A secret never leaves this computer in a prompt, and one function decides that

**Decision.** Everything that builds text for a model passes through `withoutSecrets`. The file holding real values is never opened; the example file is read for its names. Held by tests that put real-looking credentials through every shape and check what survives.

**Why.** This is the rule most easily broken by accident, because breaking it looks like nothing — the answer comes back fine and somebody's key is on a server. So it is not a rule anybody has to remember at each call site; it is one function everything goes through, applied at the last moment before text leaves.

**Deliberately generous.** A false positive costs a model a little context. A false negative sends somebody's key to a company. Those are not comparable, so it errs the same way every time.

**Locked**, alongside D-96 and D-107, because the failure is silent and the damage is not recoverable by pressing something afterwards.

---

### D-126 `[LOCKED]` — Nothing a model suggests reaches a file without being agreed to

**Decision.** A suggestion is written down as a proposal and applied by a separate route. Applying twice is refused. A proposal naming a path outside its project is refused entirely — including the parts of it that were fine.

**Why.** Reading is free and changing is not, and that line has to be structural rather than a habit. There is no path from an answer to a changed file that does not pass through somebody pressing something that says what will change.

**Why the whole proposal is refused, not the bad part.** It is one decision, not a list of them. Applying the acceptable half of something that also tried to write outside the project means a partial change nobody asked for, from a source that has just demonstrated it cannot be trusted with paths.

**A model is not more trusted than the network.** The path check is the same one a parcel from another computer gets, for the same reason.

---

### D-127 `[DECIDED]` — Asking is a set of questions, not a conversation

**Decision.** Four specific questions — why did this fail, is anything wrong here, look over my changes, and a question about this project — each with a known answer shape and a state while it works. No text box waiting, no history, no bubbles.

**Why.** The question is the button that was pressed, so there is nothing to re-read. Showing a state while it works is not decoration: these take seconds, and a blank panel for seconds is indistinguishable from a broken one. The states are also the honest account of what was looked at — "reading the project" is a real step, and saying it is how somebody knows what was sent.

**Context is this project, and only what the question needs.** A build failure gets the build output and the files that decide how it builds. A question gets a small local search of text files, capped at five. Never the folder.

---

### D-128 `[DECIDED]` — Every errand says what kind it is, when it begins

**Decision.** `transfer`, `build`, `deploy`, `send` — written down at the start, not read back out of the sentence describing it.

**Why.** The corner recognised a transfer by matching its sentence against "Bringing", which breaks the day somebody rewords a sentence, and left a build or a deploy invisible the moment you walked away from the page that started it. Errands belong to the application, not to a screen.

**And the corner disappearing is the transition that must never be missed.** The repaint check was keyed on line counts, which do not change for an errand reporting progress as steps — so it could hold a count of things that had already finished. It now compares what is shown, and always repaints when the list empties.

---

### D-129 `[DECIDED]` — A health panel states what was checked, or says nothing

**Decision.** Each line names something actually looked at and what was found. Anything that could not be checked is absent rather than assumed.

**Why.** A green tick nobody verified is worse than a blank line: it is the thing somebody believes right up until they press Build and find out otherwise. Not a score, not a percentage — a percentage of what?

---

### D-130 `[DECIDED]` — Google is a list of names, and no code that decides a destination may read it

**Decision.** Several Google accounts may be signed in on one computer, in the same shape GitHub already uses: a list with one in use. The file that held exactly one upgrades into the first of a list. Signing the one in use out hands the position to whichever is left rather than leaving nobody in use with accounts still here. And a test asserts that `github.mjs`, `projects.mjs`, `workspace.mjs`, `providers.mjs` and `deploy.mjs` do not import `google.mjs` at all.

**Why.** GitHub decides where work goes; Google decides a name on this computer. They are constantly confused, and confusing them would be expensive — a Google address quietly influencing a destination is D-115's fault wearing a different hat. Holding that by care would last exactly until somebody adds a fifth call site, so it is held structurally instead: the modules that could do harm cannot see the module that could tempt them.

**Considered and rejected.** Merging the two into one "account" concept, which is what every product does and is the reason nobody can tell which one is signing their work. Also rejected: making Google optional-but-recommended. It is optional, and saying more than that oversells it.

---

### D-131 `[DECIDED]` — The workspace is folded back into one save when its history outgrows its use — closes O-9

**Decision.** Three things, all in `workspace.mjs`:

1. **Pruning.** A computer not heard from in ninety days has its three files dropped, and each conversation is trimmed to its last five hundred lines. This computer never prunes its own files, whatever the clock says.
2. **Folding.** Past five hundred saves, the current state is written once and the record of how it got there is dropped. Every file survives exactly as it stands; what is lost is the list of moments they were written.
3. **Recovery.** A computer whose copy no longer lines up takes the other one whole, instead of never pulling again.

**Why.** Being about writes a small save every couple of minutes (D-25). Nobody has ever read one — "danni is here" from three months ago answers no question anybody has — and left alone it is a quarter of a million saves a year in a project every computer keeps a copy of. Joining gets slower forever.

All three would be indefensible against somebody's project and are correct here for one reason, which is the reason to state rather than the mechanism: **nothing in this folder is anybody's work.** It is three small files per computer, each of which rewrites its own within two minutes of noticing they are gone. That fact is what licenses the fold, the reset, and the prune; without it none of them may happen.

Folding is the only irreversible step in the product, so it is guarded by checks a test can stand on rather than by care: it must be inside the workspace folder by resolved path, the address it sends to must carry the workspace's own name, nothing may be unwritten, and what is already there must not have moved since it was last read. Any one of those failing is a refusal, and a refusal leaves the computer exactly as it was found.

**Considered and rejected.** Keeping a shallow copy — that shrinks what this computer holds and not what is on GitHub, so joining stays slow forever. Amending the previous save each time — the same rewrite, dressed up, happening seven hundred times a day instead of twice a year. Doing nothing and calling it honest — the growth is real and it was already written down as O-9.

---

### D-132 `[LOCKED]` — Viberant checks for a newer version and will not install it, until it is signed

**Decision.** The app asks what has been released, says what is new in the words the release was written in, and opens the page in your browser. It does not download anything and it does not run anything. A test reads `newer.mjs` and asserts there is no way in it to fetch a file, write one, or start any program other than the one command that asks what has been released.

**Why.** An updater that fetches and executes is four lines, and it is the most dangerous four lines anybody can put in a desktop application: whoever can answer that request once — a compromised account, a hijacked address, a network you do not control — runs whatever they like on this computer, as you, forever. The protection against that is not care and it is not HTTPS. It is a signature: the installer is signed with a key only the author holds, and the operating system refuses one signed by anybody else before a byte of it runs.

**That signature does not exist yet.** It needs a certificate bought from a certificate authority, kept where it cannot be copied, and a build that signs with it. Until then there are exactly two honest options — do it properly, or do not do it. Fetching and running unsigned code "for now" is worse than having no updater at all, because it teaches somebody to press a button that will one day be the wrong button.

**Locked**, alongside D-96, D-107 and D-125, because the failure is silent and the damage is not recoverable by pressing something afterwards.

**Checked, not assumed.** The build log prints `signing with signtool.exe` four times, which reads exactly like an installer being signed. It is not one — with no certificate configured that step runs and produces nothing. `Get-AuthenticodeSignature` on the built installer answers `NotSigned`. Anybody reading that log and concluding otherwise would ship an update path on a false premise, so the state of the signature is asked of the file rather than of the build.

**Considered and rejected.** Checking a hash published beside the file — a hash from the same place as the file proves only that the file arrived intact from whoever put it there. Prompting before running the downloaded installer — the prompt is the part that gets clicked through; the signature is the part that does not. Saying "not implemented" — that tells nobody what is missing or who can supply it, so `signing()` says exactly what has to be true and the page shows it.

**One correction found on the way.** `gh` reports both "no releases yet" and "could not reach GitHub" as a refusal. Reading them as one would have told somebody to check they were online when the truth was that no version exists — wrong advice, confidently, which is the exact failure this product is meant to be better than. They are told apart by what was said.

---

### D-133 `[DECIDED]` — Workspace rows are a sheet like every other list, and one press tells you about one

**Decision.** Your computers, what this one is offering, and what the others are offering are all sheets with aligned columns, like Projects, AI apps and Terminals. This computer is the first row with a tint rather than its own heading further down. One press on a computer or an offer opens the inspector; it never does anything to the row.

**Why.** It was the last page still built from stacked slabs, so nothing lined up with anything and the count above a list was wrong about itself — this computer was excluded from "your computers" and then described underneath it. The inspector already existed for Projects and had nowhere to put the facts somebody actually wants here: whether a computer can be reached *right now*, and what that means for whether a folder can move.

**One sentence that had to differ.** "Reachable now: no" is a fact about another computer and a misreading about this one, where the question is only whether you have let the others reach it — a switch you decide, on this page. The inspector says the opposite thing for the row you are sitting at.

---

### D-134 `[DECIDED]` — A rule that hides part of a table is aimed at a row's children, never at the sheet's

**Decision.** Dropping a column on a narrow window is written `.projects-cols .trow > :nth-child(4)`, together with the same rule for `.thead`. A test reads the stylesheet and fails on any `-cols > :nth-child` selector that sets `display: none`.

**Why.** It was written `.projects-cols > :nth-child(4)`, and a sheet's direct children are its **rows** — the columns are one level down, inside each row, because the row is a subgrid. So it was not narrowing a table. It was hiding the fourth project. And the third computer. Whichever row landed on that number, in every list that had one of these rules, on any window under 74rem.

It survived every audit this project has run because each list was short enough that the number fell past the last row. The Workspace list of computers was the first with three real rows in it, and the third one vanished at 1120 wide.

**What this says about how it was found.** Not by reading the stylesheet — it had been read several times. By measuring: an audit that walked every row and asked whether any had `display: none`. That is the fourth fault in this project that only a measurement caught, after the mark in the track, the menu hidden by its own click, and the two paths Windows keeps for the same folder. The pattern is now hard to argue with — **anything about layout is checked by asking the browser, never by looking at the rule.**

**Also held.** A column dropped from the rows is dropped from the heading too, or the labels stop naming the columns under them; and a sheet that drops a column restates its columns, or the last item wraps onto a line of its own on top of the first.

---

### D-135 `[DECIDED]` — A picture of your own is measured, not hoped about; and the route that serves it can only serve that one

**Decision.** A look called *A picture of your own* takes any picture on this computer. The path is kept and nothing is copied or sent anywhere. When one is chosen, the app reads how light it actually is and covers it by however much the words on top need — and says that it did. On an ordinary visit to Settings a picture that is too bright is *said*, and the slider is left alone.

**Why the measurement.** Every other look here was made dark on purpose. A photograph somebody chose was not, and a bright one puts text on a picture — the one thing the whole background layer is forbidden from doing. "Turn the slider up if it looks bad" leaves somebody to diagnose their own screen. The brightness of an image is a number, so it is read: a 32×32 copy, luminance-weighted, once.

**Why it fixes on choosing and only speaks afterwards.** Choosing a picture is somebody asking for a picture, not asking for an unreadable page, so the manager sets what it takes and says so. Somebody who *later* pulls the slider down has decided; moving it back for them would be the app overruling a person about their own screen, which nothing here is allowed to do.

**The security property, held by a test.** `servePicture` takes no arguments and cannot see the request. The path is read back from the setting, so the route can serve exactly one file — the one already chosen through the picker — and only if its extension is one of a listed set of picture kinds. A wallpaper route that took a path from the page would be a way to read any file on this computer through a browser: not a wallpaper feature, a hole with a wallpaper feature in front of it. Verified by asking for `?path=…/server.mjs` and getting the PNG.

**Considered and rejected.** Copying the chosen picture into the manager's own folder — that is a second copy of somebody's file that they did not ask for and would not know to delete. Reading it in Node to measure it — no image decoder in the standard library, and the browser already has one that is better.

---

### D-136 `[DECIDED]` — A transfer that stopped carries on, and a file is matched by name *and* size

**Decision.** A folder over about 50 MB that stops part way keeps what it confirmed, in the half-built folder it was already using, with a ledger beside it naming every file that reached its stated size. Asking again sends that ledger to the other computer, which sends only what is missing. Below 50 MB nothing is kept — a folder left lying about to save two seconds is a worse trade.

**Why the ledger and not the folder.** The file being written when the network went is on the disk and is *not* in the ledger, so it is asked for again and written over. Trusting what happens to be lying there would keep a truncated file and call the transfer finished, which is the one kind of wrong this whole format exists to refuse.

**Why name and size, never name alone.** A file that changed between the two attempts has the same name and different bytes. Skipping it would hand somebody a folder that is a mixture of two moments — every file present, every count agreeing, and the contents wrong. No count would catch it, because every count would agree.

**Where the checking moved, and where it did not.** The parcel's three-way check is unchanged and is still about **the stream**: the sender was asked for the rest, so the rest is what it promises, sends and is held to. Whether the *folder* is now complete is a different question, asked one level up where both halves are known, against two new headers saying what the whole comes to. Folding them together would have compared a part against a whole and failed every resumed transfer.

**Two real faults found by building it**, both of which existed before and neither of which any earlier test could reach:

1. **`unwrap` piped from its source without listening for an error on it.** `pipe` does not carry an error forward, so a reply that died half way through its body raised an error on a stream nothing was listening to — and an unheard `error` is not a rejected promise, it comes out of the event loop with nobody expecting it and ends the whole manager (D-77). Every earlier test ended its stream politely, which is the one thing a failing transfer never does.
2. **A file re-sent because it changed was counted twice**, at its old size and its new one, so the total came out larger than the folder. It needs an interruption *and* an edit, in that order, which is why it took a test that did both.

**Measured over a real socket**, not only in process: 1.2 MB cut at 400 KB kept 6 files, the second ask carried 15 of 21 files and 840 KB of 1.2 MB, and what landed was byte-identical to what was sent.

---

### D-137 `[DECIDED]` — Which company is asked is a choice, it is stated on screen, and a key is never used against another company

**Decision.** Claude, ChatGPT and Gemini. Each has its own key box and its own address, the choice lives in Settings, and the name of whichever will be asked is shown next to the buttons that ask. If the chosen one has no key and another does, that one is asked **and the page says so by name**.

**Why a choice and not a fallback order.** A question here costs money at whichever company answers it, which makes this a spending decision rather than a preference. Somebody who already pays for one of these should not have to start paying for another to use this at all. And a manager that quietly asked a company you did not pick would be spending your money without saying so — hence the "not ChatGPT" on screen rather than a silent substitution.

**Why standing in at all, rather than refusing.** Somebody who set exactly one key meant that key. Refusing on the grounds that a menu says otherwise is obtuse. Saying which one is being asked instead costs one phrase and removes the surprise.

**Held by tests**: every model has its own key setting and its own address, no two share either, every one is offered in the Settings choice, every key box is held as a secret, and what the page is told carries names and readiness and never a key (D-81).

---

### D-138 `[DECIDED]` — The icon is the mark the app already wears, generated rather than shipped

**Decision.** `build/icon.mjs` draws the rounded square with the violet gradient and the V — the same mark as the top of the rail and the opening — at seven sizes, and writes a real `.ico`. The build runs it before packaging. The window and the tray both wear it.

**Why generated.** The note said this needed a drawing rather than code. It needed a drawing; it did not need a drawing *program*. The mark already existed, so the icon is that mark, and it cannot drift from it — nothing here is a second version of the logo that somebody has to remember to update. It costs about a hundred lines: PNG is a signature and four chunks, and an ICO entry may hold a whole PNG, which every Windows since Vista understands.

**Why the small sizes are drawn rather than scaled.** Scaling the 256 straight down puts the V's stroke at 1.3 pixels in a 16-pixel icon and it nearly disappears — which is exactly where an icon spends its life, in a taskbar and a title bar. Below 48 the stroke thickens, the corners round less, and the square grows into its space.

**How the number was picked, and a test that was worth nothing.** The first test asked only that the V be more than a twentieth of the picture at 16px. The badly scaled version passes that too — 6.0% against a threshold of 5% — so it proved nothing, and that was found by deliberately putting the fault back and watching it pass. The rule that separates them is the honest one: **a mark drawn smaller must not get lighter.** The letter must take up at least as much of the mark at 16 pixels as at 256. Scaled: 6.0% against 8.7%, fails. Drawn: 10.3%, passes.

**Verified against the built executable**, not only against the file: the icon extracted from `Viberant.exe` is violet in the middle, transparent in the corners, and has the V in it.

---

### D-139 `[DECIDED]` — What a company said about your account is reported; what your account costs is never invented

**Decision.** When a model refuses, the sentence says the thing that actually happened: out of credit, asking too fast, a key that was not accepted, or trouble at their end. Out of credit says what fixes it and adds that nothing on this computer has changed. There is no polling, nothing is kept, and no count of anything is held anywhere.

**Why not a usage meter.** "Nothing tracks whether your accounts are running low" was written down as a gap, and the obvious fix is to count questions, estimate what each cost and draw a bar. That would be a number this manager made up about somebody's money, and it would be wrong within a week of any price changing. A test now reads `assistant.mjs` and fails on any tally, price or estimate in it, because this is the kind of thing somebody adds later with the best of intentions.

**One real fault found writing it.** Being out of credit comes back as 400 at one company, 429 at another and **403 at a third** — the same 403 a rejected key gets. Read by status first, a maxed-out card was reported as a bad key, and the advice was to go and find a new one: the wrong errand entirely, and the person would come back with a fresh key and the same refusal. What they said now outranks what they returned.

---

### D-140 `[DECIDED]` — How much of a scene shows through is decided by a contrast measurement, not by eye

**Decision.** Panels are 84% opaque over a scene, the rail 82%, the top bar 66%. The rule that fixes those numbers is held by a test: against the worst case the app actually permits — a pure white point in the scene, at the lowest covering the slider allows — the faintest text that sits directly on each surface must clear 4.5 to 1, with margin.

**Why it changed.** They were 92 and 88, picked by eye, and a note beside them said the scenes were barely visible but that this was the price of readability. **It was not the price.** At 92% the faintest readable text sits at 6.5 to 1 against a line of 4.5 — eight points of the picture being spent for nothing. Measured rather than argued, which is the third time in this project that has reversed a belief written down as fact.

**And one thing the measurement found that was already wrong.** `--faint` reads at **4.47 to 1 on an opaque card** — the line, to two decimal places, and deliberate. It follows arithmetically that it can never clear the line with anything at all showing through behind it, at any opacity that still shows a picture: the sums say the panel would have to be the card colour itself. The rail's group labels were `--faint`, so they were under the line at 88% too, before any of this. Not a tuning problem — a colour that cannot afford a background. They take the next colour up when a scene is behind them, which costs a shade of hierarchy on four words.

---

### D-141 `[LOCKED]` — A computer is a key it made itself, not a name and not an address

**Decision.** Every installation generates an Ed25519 pair for signing and an X25519 pair for key agreement, both from Node's own `crypto`. The device identifier is the fingerprint of the public signing key. The private halves never leave: no route returns them, nothing in `device.mjs` prints, and a test asserts both.

**Why.** On one network, being on the network is itself a claim. Across the internet it is not: a name proves nothing and an address proves nothing. Everything else in this part of the product — who may join, who may run a command, whether a relay may be trusted — stands on this one fact.

**Nothing here invents cryptography.** Every primitive is one somebody else designed, reviewed and shipped. This file only decides where keys live and who may see them.

**Found by building it**: `identity()` raced on first call — two things asking at once each generated a pair and each wrote one, so the card no longer matched the signature and every handshake failed with nothing to say why. One in-flight promise, shared.

---

### D-142 `[LOCKED]` — Joining a workspace is never a reason to run a command on somebody's computer

**Decision.** Roles are `owner`, `member`, `readOnly`, in a table where every capability defaults to no. The three that run code — terminal, run, build — are **off even for a full member**, and are granted by the owner of the target machine, per device, one capability at a time. A role cannot bypass the per-device decision: promoting somebody to owner without trusting their machine still refuses.

**Why.** Everything else in this product moves data. A mistake there costs somebody a folder; a mistake here costs them a machine. The default anybody gets by being let into a workspace has to be "can see what is offered", and nothing more.

**The far end decides.** Every check happens on the computer that would do the work, from what that computer believes about the workspace on its own disk. A caller asking nicely is not authorisation, and a caller that has already decided it is allowed is not consulted.

**And nothing anybody sends becomes a command.** A caller says `build`; the target decides what that means by reading the project's own scripts. A test finds every call that starts a process and asserts there are exactly two — a shell, and a runner from the project's own list.

---

### D-143 `[DECIDED]` — Three ways to reach a computer, one transfer behind all of them

**Decision.** `peers.mjs` offers this network, direct across the internet, and a relay, tried in that order. All three end in the same handshake and return the same kind of thing, so `parcel.wrap`/`unwrap`, resuming, the three-way integrity check and smart sync serve all of them unchanged.

**Why.** Three transports with three copies of the transfer logic is the same arithmetic written three times and wrong in two of them. The version of this that is worth having is the one where a remote transfer is the ordinary transfer with a different socket under it.

**What a person is told is three words** — "Direct · Internet", "Relay" — and a test asserts none of those sentences contains a protocol. STUN, addresses and which way was tried live in diagnostics.

**Nothing invents NAT traversal.** Learning this computer's address as the internet sees it is STUN, RFC 5389, client side. Where that address is reachable a direct connection is tried; where it is not, the relay is used, and the relay is not a failure — it is how this works on the networks most people actually have.

---

### D-144 `[LOCKED]` — A relay carries ciphertext and holds nothing

**Decision.** Both ends agree a key with X25519 before the relay sees a byte; everything after the handshake is sealed with AES-GCM. The relay reads exactly one frame — a ticket — and forwards the rest without looking. It buffers nothing: the socket's own back-pressure paces it. Tickets work once and expire. One address may hold a bounded number of pairs, and one pair a bounded rate.

**Why this is checkable rather than promised.** A test runs a real project through a real relay on a real socket, captures everything the relay carried, and searches it for the file contents and a run of every real file. None of it is there. That is a fact about what arrives, not a claim about how careful the code is.

**Found by building it**: the relay left the first side's control listener attached, so it read the other computer's handshake as though addressed to itself, decided it was nonsense and hung up. Nothing could ever have got through.

---

### D-145 `[DECIDED]` — The service knows who is about and nothing about what anybody is building

**Decision.** A small control plane holding members, public keys, unused invitations, presence and relay tickets. It is pluggable; the one that ships runs inside the app and needs no account. Messages to a hosted one are signed and carry the time.

**Why the list is short enough to read.** Anybody who read that service end to end would learn who works with whom and nothing about what anybody is building. A test reads `plane.mjs` and fails if it can open a file or wrap a project, so "it never holds your code" is a fact about what it can do.

**And it is allowed to be missing.** A workspace already on this disk keeps working on this network with the service down — the membership and the keys are here, so the check that matters needs nobody. Losing the internet must not cost you the computer in the next room.

---

### D-146 `[DECIDED]` — Send what changed; never delete because something is missing

**Decision.** Two manifests compared on path, size and modified time. Where the same size appears at a different moment, the content is hashed — those files only. What has to move is handed to `wrap` as its `seen`, which is the same door resuming already uses.

**A file here and not there is never deleted.** It is as likely to be new as to be gone, and guessing which is not this program's decision.

**Nothing lands on top of an afternoon.** A file both sides changed since they last agreed is a conflict with three answers and none is chosen automatically. With no record of ever agreeing, anything that differs is asked about.

**And before anything is replaced**, the files that would be replaced are copied and can be put back — only those files, never the whole project, and never the file with real values in it.

---

### D-147 `[DECIDED]` — Two computers are compared by names and counts, never by values

**Decision.** `machines.mjs` collects the short list of facts that have actually been the answer — versions, package manager, what a project expects — and puts two of them side by side. Environment facts are **names and counts only**, the comparison row says so on itself, and a test fails if the module can open a file at all.

**Why not read the real settings file for its key names.** It would be more useful and it means opening the file with values in it, which is never done anywhere in this product (D-125). One careless regex between there and a prompt and somebody's key has left the building. "Expects twelve, has a settings file" answers the question almost every time, and the times it does not are worth losing.

**A model may recommend and never act.** A test asserts `assistant.mjs` cannot start a process by any route, and the remote-build recommendation is told in its own instructions that it cannot run anything.

---

### D-148 `[DECIDED]` — One connection, many channels, and a half-close

**Decision.** `channels.mjs` multiplexes a peer connection: a nine-byte header, either end may open one, channels opened here are even and there are odd so two ends cannot collide. A question and its answer, a build's output coming back, and a page fetched through it all share one connection.

**Why.** Three of those over three connections is three handshakes and three protocols, and three protocols is two that are wrong. Nothing here is encryption or authentication — both happened before it saw a byte — which is why it is small enough to read.

**Found by building it.** Ending the request half closed the whole channel, so a GET with no body closed it the instant it was sent and the answer arrived for a channel nobody was listening on. It was dropped in silence and every preview waited thirty seconds. A channel goes when **both** ends have finished, or when either fails.

---

### D-149 `[LOCKED]` — A preview is on this computer only, and the far half talks to loopback

**Decision.** Looking at a dev server on another machine opens a small server **here**, on `127.0.0.1`, and carries each request over the connection that already exists. The far half connects to `127.0.0.1` on its own machine and nowhere else, and only to ports something running there has actually printed.

**Why nothing is exposed.** A dev server is unauthenticated by design, usually talks to a real database, and prints stack traces at strangers. Putting one on the internet is the obvious answer and the wrong one. The only way in is through Viberant, on a computer already in the workspace, and turning Viberant off turns it off.

**Held by tests**: the address it listens on is a named constant, there is exactly one `listen` in the module, `0.0.0.0` appears nowhere, and the address the far half dials cannot come from the request — otherwise a preview would be a way to reach anything that computer can reach, which is most of a corporate network.

---

### D-150 `[DECIDED]` — What a build made comes back beside the project, never into it

**Decision.** The output folder is read from the project, checked to be inside it, and sent as an ordinary parcel. It lands as `<project>-from-<machine>` beside the project.

**Why beside.** Something built on a different computer landing on top of what is here is exactly the surprise D-146 exists to prevent, and naming it for where it came from means two machines' answers do not overwrite each other either.

**And why the project decides the folder.** A caller who could name one could name somebody's home folder, and the capability would be "send me anything", spelled differently. Sending back what was built needs the same permission as the build itself — asking for the folder is not a smaller thing than asking for the build that filled it.

---

### D-151 `[DECIDED]` — Count what a relay carried, before there is a price on it

**Decision.** Bytes counted by how they travelled, in memory and one small file on this computer. Days for a month, then folded into one total. Nothing is sent anywhere, and nothing records who, what, or when beyond a day.

**Why now.** A relay costs somebody money to run and a direct connection does not. A number invented after there is a price on it is a number nobody can check. A test asserts `carried.mjs` cannot reach the network at all — a counter that can talk is telemetry.

---

### D-152 `[DECIDED]` — The background is four percent brighter while something is genuinely running

**Decision.** One number, moving one thing, eased over two seconds, driven by the same list the jobs corner is drawn from.

**Why so little.** The temptation is to pulse the screen while a build runs and make the app *feel busy*. That is a gaming keyboard, and it costs the one thing a background is for — being ignorable. A test asserts the amount is under six percent and that `--wall-awake` moves nothing but how much of the picture shows.

---

### D-153 `[LOCKED]` — A sync merges into the folder; it never replaces it

**Decision.** When a parcel is deliberately *not* the whole project — which is exactly what a sync is — what arrives is moved into the folder rather than swapped in place of it. And the folder that results is held against what the far end said the whole project comes to, before the sync is called finished.

**Why both halves.** The ordinary way a parcel lands is to build it beside the target and swap it in, which is right when the parcel is everything: nothing of the old folder can survive half a transfer. A sync sends only what changed, so swapping the folder replaces a project with the handful of files that changed and **everything else is gone**.

**And it was found by the second half.** Every number about the stream was correct — promised, sent and landed all agreed — because the stream really did carry exactly what it said. The only check that could see it was the one that asks whether the *folder* is now the project. That check was written for completeness and immediately earned its place, which is the argument for writing it at all.

---

### D-154 `[DECIDED]` — A workspace has a short list of things that happened, and no feed

**Decision.** A closed list of event kinds — joined, connected, brought, synced, built, revoked, allowed — each with its wording in one place, two hundred kept, on this computer, sent nowhere.

**Why a closed list.** The temptation with a workspace is a feed: somebody opened a file, somebody is looking at a project, somebody has been idle eleven minutes. That is a surveillance product wearing a collaboration product's clothes. Every line here is an event that measurably occurred at an instant; a test asserts there is no kind for anything that would have to be inferred, and that no kind describes a *state*.

**The sentence is built when it is read, never stored.** Changing the wording later changes how history reads, rather than rewriting what happened.

---

### D-155 `[DECIDED]` — A stream is listened to before anything is awaited

**Decision.** `unwrap` attaches its error listener as the first statement, before preparing the folder, and hands anything that failed in the meantime to the reader once there is one.

**Why.** Preparing a folder takes a moment, and a source that failed during that moment raised an error on a stream nothing was listening to — which is not a rejected promise, it is the end of the whole manager (D-77). The window was small and entirely real: a peer hanging up the instant after a transfer is asked for lands squarely in it. The third time this exact shape has been found, which is why it is worth a decision of its own rather than a comment.

---

### D-156 `[DECIDED]` — Bytes already read are handed over, never put back

**Decision.** `dialRelay` returns `{ socket, alreadyRead }`, and `greet` takes `alreadyRead` and feeds it to its own reader. Nothing pushes bytes back onto a socket and hopes the next reader attaches in time.

**Why, and what this cost.** Removing a `data` listener does **not** stop a socket reading. Anything arriving between one reader letting go and the next attaching is emitted to nobody — and what arrives in that gap is always the first thing the connection was opened for. It failed one full test run in three: often enough to be real, rare enough that the honest first report of it was "one unexplained failure I could not reproduce".

**Pausing is not the fix, and this is the part worth writing down.** It looks like the fix and it was tried in all four places. A socket paused in one tick and resumed by a listener attached later does not reliably pick up where it left off: pausing the relay's own pairing stopped it forwarding anything at all, and pausing at the end of `greet` stopped every transfer dead. The window it closed did not exist — `greet` hands to `conversation` on the very next line, in the same tick — and the one it opened did.

So the rule is about the shape of the hand-over rather than about stream state: **where a hand-over crosses an `await`, pass the bytes; where it does not, there is nothing to pass.** Held by tests that read the modules rather than by remembering.

**One more found on the way.** The relay attached its rate counter *before* `pipe`, so the counter started the stream flowing and took the first chunks on its own. It had been wrong from the start and was hidden by the stream already flowing for the wrong reason.

---

### D-157 `[DECIDED]` — A key is checked before it is kept, and set up where it is needed

**Decision.** Asking about a project with nothing set up opens the setup where the question was asked, not a page four presses away. The dialog gets a key from whichever company you already pay for, checks it with one eight-token request, and only then writes it down — then runs the question that could not be asked. Settings has one row that opens the same dialog, and the three key boxes it used to have are gone.

**Why not keep both.** Two ways to do one thing, and the easier one was the one that could not tell you it had failed. A key one character short is indistinguishable from a working one until the first real question comes back refused, at which point the refusal is about something else entirely.

**What it must not do.** It does not sign anybody in. Paying one of these companies every month is a different arrangement from a key at all three of them, and a dialog that blurred the two would produce a refusal nobody could interpret. It says so in as many words.

---

### D-158 `[DECIDED]` — Which model each company uses is a choice out of one catalogue

**Decision.** `CATALOGUE` in `assistant.mjs` holds what each company offers, which is its sensible default, and what each is for in words a person can choose by. A stored choice that is no longer offered falls back to that company's default rather than being sent anyway.

**Why.** A model name written into a request is a name nobody finds when it is retired, and everybody who chose one a year ago would get an error about a model they had never heard of, reported as a fault.

**Found writing the test.** The choice was stored in a setting whose kind coerced every value to true, so it was made, saved, and silently ignored. Settings can now be kept without being listed, which is a different thing from being a yes or a no.

---

### D-159 `[DECIDED]` — A feature nobody can reach is not a feature

**Decision.** Ask and Activity are places in the rail. Ask is the four questions about the open project, which were reachable only by opening a project first. Activity is long errands while they run, what the last build made, what another computer is running here, previews still open, and the copies kept before anything was written over.

**Why.** All of it was built, tested and working, and none of it could be found by anybody who had not read the source. An errand was visible only on the screen that started it, so a build begun on one page and finished on another vanished.

**Nothing on Activity starts anything.** It shows, and it stops.

---

### D-160 `[DECIDED]` — The vocabulary audit reads short labels too

**Decision.** The prose extractor reads runs of three characters, not twelve. The machinery this newly reaches is ruled out by what machinery looks like — braces, underscores, shouting capitals, paths — rather than by raising the length back up.

**Why.** Twelve was chosen to keep code out, and it did, along with every short label on every screen. The word `Repository` sat at the top of the deploy page for as long as this audit has existed: ten characters, never once read by it, because a label is one word and a sentence is not. A label is the most read text on a screen.

**Proved by putting the word back and watching the audit fail.**

---

### D-161 `[DECIDED]` — A layer takes what it started away with it, however it goes

**Decision.** Both ways a layer ends — being closed, and being written over by the next one — run whatever it registered to be stopped. Anything that asks repeatedly hands its clock over.

**Why.** Cancel on a sign-in stopped the asking. The corner, and the darkened background, did not: the page went on asking every second for as long as the app stayed open, and then announced the sign-in over the top of whatever screen you had moved on to. Writing a sheet over a sheet ends the first one as finally as closing it does, and that path cleared up nothing.

**Held by counting** rather than by remembering: every clock the page starts must be handed to something that clears it, every named control must have something listening for it, and nothing may be marked up for a handler that has been taken away.


---

### D-162 `[DECIDED]` — Vercel is connected by a token, not by waiting on a browser

**Decision.** Three ways to be connected, in order: a token pasted here and checked against Vercel before it is kept; the command being signed in on this computer already; or not connected. The token reaches the tool through the surroundings of the process, never as an argument.

**Why the old way could not work.** It started Vercel's own sign-in as a background command and waited. That command wants a terminal — somewhere to print the address it needs you to visit, and something to read your answer from. Inside an app it has neither, so it waited forever and all anybody saw was a spinner, sometimes with the browser half having plainly succeeded. Increasing a timeout would not have touched it.

**Not connected now means not connected.** Being unable to ask is a third state, and a token that has been revoked reads as revoked rather than as fine — an expired credential drawn as connected is the failure that costs somebody an afternoon.

**Arguments are written down and surroundings are not.** `runInto` records the command it ran, so a token in the argument list is a token in a log.

---

### D-163 `[LOCKED]` — A command exiting is not a site being online

**Decision.** After a deploy, the address is asked about until Vercel says ready — or, when there is no token to ask with, fetched until something answers. Deployment protection replying 401 counts, because that is a site that is up and asking who you are. Only the two states Vercel serves while there is nothing to serve fail this.

**Why.** It is the same rule as everywhere else in this project, applied to the one place people care about most. Two bugs have already been caught here: saying a save failed when it succeeded, and saying work was sent without knowing.

**Found by actually doing it.** The address was matched together with the quotation mark printed after it. The check then threw on something that was not an address, silently, once every three seconds for five minutes, and reported that nothing was being served about a site that had been live the whole time. And the address of the deployment was carried through an errand by being spread in — an errand only carries fields it knows the names of, in two separate places, and it was named in neither.

---

### D-164 `[DECIDED]` — Money and a queue both say "quota", and they need opposite things

**Decision.** A refusal is about money only when the words are ones that are only ever about money — credit, balance, billing, a plan. Everything else at 429 is a queue. Every refusal carries which of seven things it was.

**Why.** Google says *Quota exceeded for quota metric* when a free allowance of so many questions a minute runs out, which refills on its own in seconds. Read as money, somebody with a working key and a fine account was told to go and top it up. It was the first thing that happened after adding a Gemini key, every time.

**And a key is no longer refused for being asked to wait.** Nothing counts a request it did not recognise, so a limit of either kind is proof the key was accepted. Refusing to keep it on those grounds made a good key impossible to add at all.

**Waiting is bounded and only ever after being told how long.** A one-second wait is taken rather than reported; four minutes is reported rather than waited on. Three attempts, never a loop deciding for itself. Another company that has a key here is offered by name and never switched to quietly — that would be spending money at a company nobody chose.

---

### D-165 `[DECIDED]` — A redraw belongs to an errand you watched, not to one you opened

**Decision.** A watch remembers whether it ever saw the errand running, and only the screen that watched one finish is redrawn.

**Why.** Opening a finished errand to read it went down the same path as watching one finish: it painted, found the errand over, and six hundred milliseconds later redrew the page — throwing away the detail it had just written and putting nothing back. From the outside, Look at it did nothing. Nothing had changed underneath, because nothing had happened.

---

### D-166 `[DECIDED]` — The way between the parts of a page is wired before anything else

**Decision.** On a page drawn in parts, the navigation between them is wired first.

**Why.** Everything below reaches for a control that exists on one part only. The first one that was not written to tolerate its absence threw, which stopped every line after it — including the navigation. A settings page whose own navigation did nothing, on every part except the one that happened to carry that control.

---

### D-167 `[DECIDED]` — The numbers a screen is about go at the top of it, and sand is not a feature

**Decision.** Each screen opens with the three or four numbers it is actually about, as cards. The one graphic is drawn into the card reporting a live connection and nowhere else; it fades out before the text starts and is absent when nothing is connected.

**And the sand from the pointer is removed, not switched off.** On a screen full of work it was a diagonal trail of particles across whatever you were reading. It meant nothing, marked nothing, and was the first thing anybody asked to have taken away. Kept as a setting it would have stayed on for everybody who already had it.


---

### D-168 `[LOCKED]` — A folder keeps its name; the hosting service gets one it will take

**Decision.** One function turns a project's name into a name Vercel accepts: lower case, digits, dots and hyphens, separators collapsed, no run of three, at most a hundred characters, deterministic. The folder is never renamed, and a test reads the module and fails on any rename in it.

**Why.** `ValoVault` was refused with "Project names must be lowercase" — a rule nobody broke, about a name nobody chose. The tool names a project after the folder it runs in, so a capital letter in somebody's folder name became a deploy that could not work and a sentence blaming them for it.

**Deterministic is the load-bearing word.** It is what makes the second deploy find the first site instead of making another one.

---

### D-169 `[DECIDED]` — What a deploy will do is worked out before it starts

**Decision.** Before anything is built: whether there is a website here at all, where it is, what builds it, which settings it expects, and which project at Vercel it belongs to — found, reused or made deliberately. The deploy then runs in that folder and nowhere else.

**Why.** Not everything belongs on a hosting service, and running a deploy against a desktop application is a slow and confusing way to find that out. A desktop application says so instead, found by any script that starts Electron — this project's own is called `desktop`, and looking for the name rather than the thing missed it. A desktop application with a website inside it deploys the website. A folder of pages with no `index.html` is a website, because it is one.

---

### D-170 `[DECIDED]` — What a company sends is read in the shape it sends it

**Decision.** A refusal is unwrapped before it is read, and an answer with nothing in it is not an answer.

**Why, both found by asking a real question.** Google sends its refusal as a list holding one object where the shape it is copying sends the object; read as the object it is not, the reason is simply absent, so every Gemini refusal arrived saying nothing and an account genuinely out of allowance came back as "asking too fast" — the opposite advice. And the newer models think before they speak out of the same allowance as the reply, so a short one can return with a `length` on it and no words in it, which was rendered as success. An empty box is worse than a refusal: there is nothing to act on.

**Model names now move.** `gemini-2.0-flash` was retired for new accounts without being removed from anything, and answers "no longer available to new users" — which reads like a broken key. The names Google keeps pointed at their current models are the only kind that do not quietly stop working, and this is installed once.

---

### D-171 `[LOCKED]` — Writing the same page again is free

**Decision.** A page is compared against what a screen last **produced** before it is written. Identical productions are not written at all.

**Why.** Setting a page's contents to the same string still throws every element away and rebuilds them — the browser does not compare, it obeys. Measured: nine rebuilds in fifty idle seconds on a screen where nothing had happened. That is the flicker.

**Comparing against the page is the version that does not work,** and only measuring shows why: several screens draw in two stages, so the page is never equal to what the screen produces and the guard never matches.

**One thing this broke, fixed with it:** Activity used to notice a new errand only because something else redrew the page. Screens that need to notice now ask on their own — affordable precisely because the answer costs nothing when there is nothing new.

---

### D-172 `[DECIDED]` — The inspector is placed against the window, not given a column

**Decision.** The panel about a selected thing is fixed to the right edge; the work is given room by padding.

**Why.** As the second track of a grid it never opened — measured, the columns stayed `1060px 0px` whatever that track was set to, so the panel was laid out past the right edge at thirty-three pixels wide. Open, correct, full of the right words, entirely off the screen, with nothing visible to say anything was wrong. It survived two passes for exactly that reason. Placed against the window there is no track to fail to open.


---

### D-173 `[LOCKED]` — A computer is in a workspace because it joined one, and for no other reason

**Decision.** The list of who is in a workspace is built from that workspace's own devices, in one loop, and from nothing else. Being on the same network, or signed in to the same account, or having been seen before, decides only *how* somebody is reached and whether they are online — never whether they are in.

**Why it looked broken.** Two lists of computers sat on one screen under headings that read the same, so a computer on the same GitHub account was indistinguishable from somebody who had joined. The membership list was never wrong; the page was conflating two different things and saying neither out loud. The account list now says, in a sentence, that being on the same account is not being in a workspace.

**Held by a test that states it as a sentence,** and by counting the places that add to the list: exactly one. A second source folded in for convenience fails.

---

### D-174 `[OPEN]` — A code is permission to join, not the workspace itself

**The gap, stated rather than papered over.** The workspace record — who is in it, what each may do, the keys they know each other by — lives on the computer that made it. A code authorises joining; something still has to carry the workspace across. Today the only thing that does is a service both computers can reach, so a computer with no address for one has nothing to redeem a code against, and joining from a fresh install cannot work.

**What was fixed now:** the refusal says that, in those words. It used to say something that read like a settings problem and sent people looking for a box that would not have helped.

**What is still owed:** a way for the code to fetch the workspace from whoever made it. The authenticated peer channel already exists and already carries questions; the missing piece is that its every branch requires membership first, which is the wrong check for the one message that creates membership. Owner: Eng.

---

### D-175 `[DECIDED]` — A broad question is answered from what describes the project

**Decision.** "What is this project about" and its kin skip the file search entirely and answer from README, the architecture notes and the project's own metadata, in four parts: what it is, what it does, what it is built with, how it fits together.

**Why.** The search matched the words `project` and `about` against the whole folder and answered out of whichever deeply nested file happened to mention them — a correct description of one file, presented as a description of the whole thing. A README is a person explaining their own project, and it was not in the list of files read at all.

---

### D-176 `[DECIDED]` — Nothing connected is not a fact about Claude

**Decision.** With no AI set up at all the sentence says no AI is connected and names all three companies. Only when one of several is the one without a key is that one named.

**Why.** "Viberant has no key for Claude yet" reads as though Claude were the only one there is, and sends somebody to open an account with a company they did not choose.

---

### D-177 `[DECIDED]` — A folder chooser is rooted at the computer, never at where you are

**Decision.** The Windows chooser always opens at This PC, and the picker has a box for typing or pasting a path.

**Why.** The argument that looked like "start here" is the *root* of the tree. Opened from Documents, Documents was the top of the world and no other drive could be reached — somebody wanting a folder on D: had to cancel and find another way in. There is no way to ask that chooser to open somewhere and still show everything, so it shows everything.


---

### D-178 `[LOCKED]` — Joining has its own way in, and it can do exactly one thing

**Decision.** A separate listener, on its own door, that accepts one kind of message: a code and the joining computer's public card. It hands over the workspace and closes. It is not the channel the rest of the app uses and it never becomes that channel.

**Why it has to be separate.** Every other message between computers begins with "are you in this workspace", which is right for all of them except the one whose whole job is to put somebody in it. That check is why joining could not work at all.

**Why it is safe to let it skip that check.** Because it can do only one thing. A second message on this path would be a way past the check everything else begins with, so a test reads the source and fails if one is ever added.

**What travels:** the fingerprint of the code, shouted; an answer saying where to knock; then the real code and the public card down one connection to that computer alone; then the workspace. Anybody listening learns that somebody is joining something, which they could see anyway, and cannot join with it. No private key is in any of it — held by a test that fails if the file can even name one.

**Invitations do not travel with the workspace.** A computer that had just joined, holding a list of live codes, could let in people the owner never invited.

**And a revoked computer does not get back in with a fresh code.** Invitations are read aloud across desks and forwarded; coming back has to be the owner's decision.

---

### D-179 `[LOCKED]` — The answer wins over the state attached to it

**Decision.** One helper builds `{ ...state, ...answer }`, in that order. Nine routes had written it the other way round by hand.

**Why.** `around()` ends with `ok: true`. A refusal combined with it came back saying "That invitation does not work" **with `ok: true` on it**, so the page reported success. Nothing was let in — the refusal was real — but everything on screen said otherwise. That is worse than the bug it was hiding.

---

### D-180 `[DECIDED]` — A person and a computer are different things, and are drawn as two

**Decision.** The workspace lists people, and each person's computers under them. A person has a role and was invited; a computer is a key, has a platform, and is either reachable or not.

**Why.** One flat list read a computer's name as a person's name, and made somebody with a laptop and a desktop look like two people.

**And a computer has one name.** The setting named it for one list while `device.mjs` kept its own for the other, so renaming changed it in one place and not the other.

---

### D-181 `[DECIDED]` — A note appears when you press the button

**Decision.** It is on the screen immediately, marked as on its way, and the mark changes when it lands. Nothing is redrawn.

**Why.** It used to wait for an errand that reaches GitHub and takes seconds, then redraw the whole page. So Send did nothing visible for several seconds, then the page rebuilt underneath you and put you back at the top — with what you typed already gone from the box and nothing anywhere to show it had been said.


---

### D-182 `[LOCKED]` — No account name is written into this app

**Decision.** Where this app's issues and releases live is read out of `package.json`, in whichever shape the address was written, and is **allowed to be absent**. With nothing written there, no account exists anywhere in the source.

**Why.** There was exactly one, and one was too many. It was Viberant's own issue list and release address — not an identity, not a default for anything, genuinely useful — and also one person's GitHub account, compiled into every copy that shipped. A name in a program travels to computers that have nothing to do with whoever it names, cannot be changed without a rebuild, and tells anybody reading the source whose account it is.

**Both features degrade honestly.** A report is still written down on the computer that wrote it, which was always the half that mattered, and says there is nowhere to send it. A version check reports a third kind of not knowing rather than "up to date", which is the honesty fault that file exists to avoid.

**A path fragment is not an account.** `./app` and `../core` have the same shape and read as nothing.

---

### D-183 `[DECIDED]` — Members recognise each other with something only members can work out

**Decision.** The value two computers prove they share on a network is derived from the workspace's own identifier and the public signing key of the computer that made it. Both are in the record joining hands over; neither is private; neither changes when somebody joins or leaves.

**Why.** The older value came out of a private project on GitHub, so computers that joined with a code held nothing at all — they appeared in each other's lists, correctly, and both said offline forever.

**Why it must not move.** A value derived from the current membership would change the moment anybody joined, and everybody would stop recognising everybody.

**A non-member cannot derive it** because a non-member does not have the record. That is the whole claim, and it is the same claim the older one made.


---

### D-184 `[LOCKED]` — A workspace has a stream, and it is not a second way in

**Decision.** Notes and everything else a workspace says ride the authenticated channel between members that already carries every question, membership-checked exactly like all of them. GitHub is not the transport. Every event carries an identifier, is written down at both ends, and is never acted on twice.

**Why.** A note used to be written, committed, sent, and read back by whoever synced next — minutes, for a sentence typed to somebody in the next room.

**Why one identifier per event matters more than speed.** A stream that reconnects replays what it thinks was missed; two computers tell each other the same thing; a page is open twice. All three end with a note arriving more than once, and one that appears twice is worse than one that appears late.

**Held by a test:** the branch that accepts something *said* checks membership, checks the workspace it claims, and takes whoever it is from off the connection rather than off the message.

---

### D-185 `[DECIDED]` — A door is announced, not assumed

**Decision.** The port a computer accepts connections on travels in its own shout. Ports move together under `VIBERANT_PORT_SHIFT`, which exists so two copies on one machine can be told apart in a test and has no setting and no route.

**Why.** Only one process may hold a listening port, so two copies could never both accept a connection — and mutual anything was untestable, which is why three separate faults in the local-network path went unnoticed for months.

**The shout itself does not move.** Two computers that have never spoken must agree where to shout without being told, and several processes may listen to one broadcast.

---

### D-186 `[LOCKED]` — Being seen and being reachable are different, and both must be true

**Decision.** A computer opens the door others knock on when the app starts, not only when a workspace is made or joined.

**Why, and it is the worst of the three.** Every computer that had simply been restarted sat there present, visible, and correct in every list, and could not be connected to at all. From outside, being seen and being reachable look identical until something tries.

**Two more found the same afternoon, both in the same path.** A peer reached over the local network was spread into a new object, and spreading keeps only what an object owns — so every method the connection carried was left behind, and what came back passed every check and failed at the moment anybody spoke down it. And asking used a channel as though it were a connection: a channel is written to with `write`, a connection with `send`. The answering half had been adapted; the asking half had not.

---

### D-187 `[DECIDED]` — Looking at what changed never moves anything

**Decision.** Comparing a project here with the same project there asks, compares and summarises. Nothing is transferred, and what to do about it is a separate press.

**Why.** Somebody looking at "twelve changed" has not asked for anything to happen. A page that began a transfer because you looked at it would be the worst thing in this product.

**And with no agreed history, anything that differs is a decision.** Not a copy. The comparison is deliberately conservative in that direction, because the failure it prevents is somebody's work being written over.


---

### D-188 `[LOCKED]` — A file somebody chose to keep is held, not asked for

**Decision.** When a sync would replace a file both people changed, the chosen version's bytes are read before anything is written and put back before anything is measured.

**Why the obvious way does not work.** Declaring "I already have one of those" is how resuming says *do not send me that*, and it is a different claim: the far end works out what to send from a list it was given before anybody chose, and two versions of one file are usually the same size. Measured — the file was sent, written, and the person's own version was gone.

**The safe answer is the one already chosen.** Somebody who presses Bring without reading the list keeps every one of their own versions, which is the outcome that cannot lose anybody's work.

**Nothing new carries the bytes.** The existing transfer does it, through the same wrap and unwrap, with the same resume ledger and integrity checks. A test fails if this file ever grows a socket of its own.

---

### D-189 `[DECIDED]` — Only what is offered is watched, and only when it settles

**Decision.** The folders explicitly offered are watched; nothing else is. A change says nothing until the folder has been quiet for two and a half seconds, and what is said is one summary.

**Why.** A project is not shared because it is open. And saving one file makes a handful of notifications while a build makes thousands — one event each would be a storm. Measured: twenty-four writes in two bursts produced exactly one event.

**Found doing it, and it cost three attempts.** The folder was watched at its *resolved* path. On Windows that form is accepted by the watcher and then reports nothing — no error, no events — and the entry stayed in the list so it was never retried. Watched at the path it was offered at, it fires immediately. A watcher that fails is now forgotten rather than kept.

---

### D-190 `[DECIDED]` — Something that happened elsewhere is a line in the corner

**Decision.** A project changing on another computer, or a sync finishing, appears as one line over the corner of the window. It can be pressed to go where something can be done about it, and it goes away on its own.

**Why.** Somebody is in the middle of something. A computer in another room changing a file is not a reason to move anything under their hands, and it is certainly not a reason to redraw a page.

**Amended by D-195.** Inside the workspace, a change to the project on screen is said *on the project*, not in the corner. The corner is for somewhere else; this is here.

---

### D-191 `[DECIDED]` — A workspace is a place you go into, and projects are what is in it

**Decision.** The Workspace page lists the workspaces this computer is in and gets out of the way. **Enter workspace** opens a screen of its own: people down the left with their computers indented under them and the shared projects below, the selected project in the middle with its copies and what can be done about them, and the inspector on the right showing whichever of person, computer or project was last pressed.

**Why.** It was a list of computers, and a list of computers answers the least interesting of the three questions somebody has. What they want to know is what we are working on, who else has a copy, and whether mine is behind. Computers are how a project comes to have more than one copy; they are not the point, and putting them first made everything else look like configuration.

**What was rejected.** Panes that can be dragged, tabs, and anything resembling an editor. The constraint was explicit and it is the right one: this is not Slack, Jira, Dropbox or an editor. Two columns and the inspector the app already has.

**Nothing new was built underneath it.** Presence, transfer, comparison, conflicts, ways back and the stream all existed. This is a screen over them.

---

### D-192 `[DECIDED]` — A project is in a workspace because somebody offered it

**Decision.** `GET /team/projects` folds this computer's own offers together with those of each member who is online, by name, and answers with each project's copies, which of them is yours, and whether it is shared, only here, or only theirs. A folder that has not been offered is not in the answer, whoever it belongs to and whatever else is on the disk beside it.

**Why.** The alternative — showing what is on each computer — is a window into somebody's machine that they did not open. Held by a test that offers one folder, leaves another beside it, and fails if the second one is ever named.

---

### D-193 `[DECIDED]` — A file carries the moment it was written, and a sync can therefore end

**Decision.** A parcel carries each file's moment and puts it back on the far side. `survey` reads it once, which also removes a second pass over the whole project that `manifest` was making to ask the same question again.

**Why, and this is a fault rather than an improvement.** Comparison is by size and moment. Nothing carried the moment, so every file that arrived got today's date, and from then on it differed from the file it had just been copied from — for good. **A sync could never say "up to date".** Pressing it again offered to bring the same files over again, and again. Every part of this worked on its own; only the whole errand, run twice, could show it.

---

### D-194 `[DECIDED]` — What somebody chose to keep is counted as theirs, not as a shortfall

**Decision.** The closing check still holds the folder against what the far end said the project comes to. The expected size now has their version of each kept file taken off and this computer's version added on. A far end too old to say how big its files are says nothing, and then only the count of files is checked, which is what was checked before any of this existed.

**Why.** Two versions of a file are rarely the same size. Keeping one line of your own made the totals disagree and a sync that had done exactly what it was asked reported that it had failed — the inversion of the rule this project cares about most. The errand a person runs ends "settle the disagreement, then up to date", and it could not.

---

### D-195 `[DECIDED]` — Inside the workspace, a change to the project on screen is said on the project

**Decision.** When the stream carries a change naming the project being looked at, one line appears above its copies with what happened and the way to see it. One element is written; nothing else on the page moves. Everywhere else, D-190 stands and it is a line in the corner.

**Why.** The corner is right for "something happened somewhere else". It is wrong for "the thing in front of you just changed", which is not elsewhere at all.

**And the screen is looked at again every ten seconds, almost always for nothing.** What is said arrives on the stream; who is here does not, because going quiet is the absence of a thing rather than a thing. The page is compared against what it last produced and each box against what it is showing, so a workspace where nothing moved is checked and never touched — measured in a browser across a full cycle: same elements, same choice, nothing redrawn.

---

### D-196 `[DECIDED]` — Ask the computer for the name it uses, with the function that exists

**Decision.** `realpathSync.native` from `node:fs`, wrapped once as `asWindowsKnowsIt`, used by both watchers.

**Why this is worth a decision of its own.** D-77's fix for the uncatchable watcher crash used `realpath.native` from `node:fs/promises` — **and the promised version has no `native` at all.** It is `undefined`, calling it threw on the first line, and the `try` that was there for a folder that had gone away swallowed it. So the fix was written, checked by reading, and never once ran: **watching a project has been off entirely, on every machine, since the day it was added.** Nothing threw where anybody could see it, and the only symptom was that something nobody was watching for did not happen.

Meanwhile the other watcher — the one for offered folders — deliberately did not resolve paths at all, on a measurement that resolving them stopped anything arriving. That left the original crash live: a folder under a shortened name (`C:\Users\ADMINI~1\...`, which plenty of ordinary things hand out) fails a check inside the watcher underneath Node and takes the whole manager down with it, uncatchably, the moment anything in it moves. Offering such a folder ended the app. The measurement is kept — the offered path is used wherever it is already the name Windows uses — and only where it is not does the resolved name win, because there the alternative is not a worse option, it is the end of the process.

**Found by starting the app for real, twice, and asking it to share a folder.** Neither half could have been found by testing a part.

---

### D-197 `[DECIDED]` — The whole errand is tested against two copies that are actually running

**Decision.** `app/test/workspace-flow.test.mjs` starts two real `server.mjs` processes with their own homes and their own doors, forms a workspace through the same routes the buttons use, and drives the whole thing over HTTP: both appear to each other, an uninvited third does not, nothing is shared until it is offered, a change made on one is seen from the other, looking writes nothing, bringing it over ends up to date, a file changed in both places is a question and keeping yours keeps yours, and the workspace is still there after the app is stopped and started.

**Why.** Every piece of this had tests and all of them passed. Three faults — D-193, D-194 and both halves of D-196 — were sitting underneath them, and each one broke the errand rather than a part. Two are the kind that only appear the second time you press something.

**The cost is honest and worth saying:** about eleven seconds, and it needs the doors free. `VIBERANT_PORT_SHIFT` already existed for exactly this.

---

### D-198 `[LOCKED]` — A key and a subscription are two accounts, and only one of them is ever empty here

**Decision.** The company is called **OpenAI**, never ChatGPT, everywhere — in the menu, in the settings, in the name of the key. When an account has no credit the sentence names *which* account: "The OpenAI API account at platform.openai.com has no credit left", and the next line says it is not a subscription and that the two are billed separately.

**Why.** The old sentence was *Your ChatGPT account has run out of credit*, said to somebody who pays for ChatGPT every month and whose subscription was perfectly healthy. It is a claim about an account this manager has never seen and could not see. They went and checked the thing that was never the problem, and learnt only that this cannot be trusted about their money.

**Held by a test** that fails on any sentence matching "ChatGPT account has run out", because this is the kind of wording that comes back the next time somebody writes a friendly error message.

---

### D-199 `[DECIDED]` — What they called it outranks what they wrote about it

**Decision.** A refusal is read in this order: **the code**, then **the words**, then **the status**. Every company sends `error.code` and `error.type`; both are carried through with the status and shown, folded away, under "What they said".

**Why the order is the whole design, and it has now been wrong twice.** Status first reported an empty balance as a rejected key, because an empty balance is 400 at one company, 429 at another and 403 at a third — the same 403 a bad key gets. Words first read Google's *Quota exceeded for quota metric*, which is a free allowance refilling in thirty seconds, as a bill. A code does not move: it is the same string this year as last, and it says precisely what a paragraph of English only implies.

**Measured against real accounts before writing a line of it.** An empty OpenAI balance is `429 / insufficient_quota / credit_balance_exhausted`. A rejected OpenAI key is `401 / invalid_request_error / invalid_api_key` — **read by type it is a badly written request, read by code it is the truth**, which is exactly why the code is asked first. A rejected Anthropic key is `401 / authentication_error`.

**Seven kinds now, where there were five.** Credit needed and a ceiling somebody set themselves are different errands: one needs buying, the other needs a number raised. A request the company would not take is no longer filed under "could not answer".

---

### D-200 `[DECIDED]` — The way out of a refusal was unreachable, and had been since it was written

**Decision.** A refusal that is about the company rather than the question — no credit, a ceiling, their own trouble — tries whichever other company has a key, with the same question and the same context, and says in the answer who answered and why. Where it will not switch on its own, it offers the other company as a button that asks **once** and never writes down the choice.

**Two faults, both found by asking for real.** The loop returned on anything that was not a queue, so the only way into the fallback was a rate limit longer than the wait budget — the one refusal it deliberately does not switch for. The case it exists for went straight past it. And the button that did exist posted `/ai/choose`, which changes which company is asked from then on: two presses and somebody was paying a company they had never picked, with nothing on screen saying so. The test guarding that behaviour was named for the right rule and enforced the opposite.

**Verified end to end, in the real page**: OpenAI out of credit, the answer came back headed *Gemini · gemini-flash — OpenAI could not, so this one did*, with the reason underneath.

---

### D-201 `[DECIDED]` — A control shaped like a row starts where the row starts

**Decision.** Any rule that declares itself left-aligned and a flex container must also say where its content starts. Thirteen did not. A test decides it from the stylesheet.

**Why.** `button` sets `justify-content: center`, which is right for a button with a word on it and inherited in silence by every control shaped like a row. Measured in the rail: **eight places, eight different left edges, 62px to 76px, each set by the length of its own label.** Nothing was misaligned by a pixel; every row was aligned to a different thing. It is invisible in the source, because the declaration doing it is four hundred lines away and applies by not being overridden.

Now: one icon position, one label position, one gap, one row height, across all nine places, at 1024, 1280 and 1440. Selecting one does not move its label.

---

### D-202 `[DECIDED]` — A page of sentences keeps its column and still starts where every other page starts

**Decision.** `.hold.reading` keeps its arm's-length width and is left-aligned rather than centred in whatever room is left.

**Why.** Centring put the heading of a reading page thirty-four pixels right of the heading of every other page — measured, same window, switching between two places in the rail. The eye reads that as the whole page having shifted, with nothing on screen to explain it. The column is what needed limiting; where it begins was never the point.

---

### D-203 `[DECIDED]` — "It changed" becomes "one added, one rewritten, one gone"

**Decision.** A folder that settles is held against what it was when watching started, and the summary carries the three counts and up to six names. The comparison is `sync.compare` — the same function a sync uses — applied to one folder at two moments.

**Why.** "Somebody changed Viberant" is a notification. "Three added, eight rewritten, one gone" is something a person can decide about without opening anything. Both cost the same, because the folder was already surveyed to know it had moved.

**And what it must never become.** There is no way for this manager to know which file anybody has open, so it does not say. What each person is working on is derived from which shared project their computer last reported a change in — which is a truthful answer and the only one available. A test fails on the words *editing*, *has open*, *typing*, *cursor* and *viewing* anywhere in that answer, because guessing in front of somebody who can see their own screen is the fastest way to stop being believed.

---

### D-204 `[DECIDED]` — The workspace is a control room, and the project is what it is about

**Decision.** Two columns and the inspector the shell already has. Left: people, their computers indented under them, each person's last reported activity, then the shared projects with a state and a dot. Middle: the chosen project — its state, the one thing waiting with **View changes** and **Sync from whoever**, then every copy with who has it and what they did. What has happened and what was said are folded away under it.

Four project states and no more: **Changes waiting**, **Up to date**, **Only on this computer**, **Not on this computer**. Every extra state is something somebody has to learn before they can read the screen at a glance, which is the only job this screen has.

**Nothing new underneath it.** Presence, transfer, comparison, conflicts, ways back and the stream all existed; the state is a fold over events this computer already holds, so opening the workspace asks nothing of the network and still says something.

---

### D-205 `[DECIDED]` — Two copies on one machine need their doors spaced, not merely shifted

**Decision.** `VIBERANT_PORT_SHIFT` values in tests are twenty apart.

**Why.** The door that carries folders and the door that takes a direct connection are **one apart**. Two copies whose shifts differ by one therefore give the first copy's direct door the same number as the second copy's carrier; one loses the binding, and what it looks like from outside is a computer that is plainly present and cannot be reached by any of the three ways. Measured: with shifts eleven and twelve the second copy could not reach the first at all; spaced out, both reach each other. The whole-errand test had been running with adjacent shifts and only ever driving the direction that happened to work.

---

### D-206 `[LOCKED]` — A door decides who is welcome now, not who was welcome when it was hung

**Decision.** The listener that takes connections asks `members.now()` on every knock. `members.mjs` keeps that answer in step from the two functions every read and every write already pass through, so it costs nothing and cannot be forgotten.

**The fault it fixes, which had been there since the door was built.** `beAbout` hangs the listener once, and its `allow` closed over the workspace it was handed at that moment. **So the computer that *makes* a workspace refuses every computer that joins afterwards, for as long as it stays open.** It could reach them; they could not reach it. Every list was correct, every dot was green, and everything went one way. Proved by restarting that computer and nothing else: both directions started working.

It cut the other way too, and that half is worse: **a computer revoked while the app was running went on being let in until somebody restarted it.**

**Why it is not awaited.** Reading the book from disk inside the socket handler is the obvious way to ask fresh, and it does not work: the far end says what it wants immediately after the handshake, and an `await` there lands between the greeting and the listener that would have heard it. Measured — every connection was then accepted and sat silent.

---

### D-207 `[DECIDED]` — One kind of message, one place that answers it

**Decision.** `answerPeer` answers each `what` in exactly one branch, and a test fails on any duplicate. What a remote terminal printed is asked for as `printed`.

**Why.** It was `said`, which is also what a workspace event is called, and the event branch came first — so the terminal branch could never run, and a question about a terminal arrived as an event with no event in it and was refused. Nothing anywhere said why.

---

### D-208 `[DECIDED]` — Reached is not delivered, and a test may not confuse them

**Decision.** A message is counted when the far end says it kept it, never when a connection opened. The errand between two running copies sends **both ways** and reads what arrived off `/events` — the stream an open page holds — rather than out of a route invented for a test.

**Why.** One direction worked throughout, so every test that asked only one of them passed while half the product did not exist. Being seen, listed, dialled and answered are four facts, and none of them is *heard*.

---

### D-209 `[DECIDED]` — A sync is finished against a project's name, not against a path

**Decision.** `/sync/bring` names what it did after the folder it landed in.

**Why.** It used the name of whichever project happened to be open, falling back to the whole path — and a sync is very often run with nothing open at all. So `D:\...\CodeSage-AI-master` went where the name belonged, nothing that reads these by name ever matched it, and **a sync that finished perfectly left the screen saying changes were still waiting.** The name of a project in a workspace is the name of its folder; that is how the copies are folded together in the first place.

---

### D-210 `[DECIDED]` — A folder that settled with nothing different in it says nothing

**Decision.** After a sync lands, the watcher's baseline is moved to what the sync wrote. A settle that finds no difference is not announced.

**Why.** The folder a sync writes into is a folder this computer offers, so the watcher notices it move — correctly — and told everybody, **including the computer the files had just come from, which then saw changes waiting from us that were its own work returning.** Measured: bring four files over, and the far end immediately reports one added and three rewritten, waiting. Left alone the two would have talked in circles.

**A window of time was tried first and is wrong.** Twenty seconds swallowed a genuine edit made straight after a sync — which is the ordinary case, not an unlikely one. Moving the baseline is exact: the sync's own writing finds nothing to report, and the next real keystroke is still counted.

---

### D-211 `[DECIDED]` — A sync keeps what only this end has, and is not failed for it

**Decision.** The far end sends the paths it does not have; the closing count leaves them out.

**Why.** A sync merges, so a file only this end holds stays — that is the whole point of merging rather than replacing, and it means the two folders are not meant to match afterwards. Counting them against each other made a sync that had done exactly the right thing report a shortfall. The same shape as D-194, one step further out: any folder with anything of its own in it.

---

### D-212 `[DECIDED]` — One copy is an ordinary state and is written as one

**Decision.** A project nobody else has says so, in a sentence, with the two things that change it: invite somebody, or offer another folder. The middle column also carries what is true about the project — how it stands, how many files, how big, how many copies, when anything last came over — and what has happened to *this* project, which is a different question from what has happened in the workspace.

**Why.** It was the name, one row and two collapsed headings over two thirds of an empty column. Nothing was wrong and it read as something half-built. The room was already there; it was not being used to say anything.

---

### D-213 `[DECIDED]` — Notes are drawn from the one place notes are kept

**Decision.** `GET /workspace/notes` answers out of `chatter`, and the box draws that. An arriving note is one element appended, never a redraw. The fold says how many arrived while it was shut.

**Why.** Notes are written to `chatter` — that is where `say` puts them, where a peer's arriving note is kept, and what the stream carries. The box drew the older GitHub-backed workspace's own list, which nothing has put a note in since notes stopped travelling that way. **So a note from another computer arrived, was accepted, was written down and was carried on the stream — and was drawn from somewhere else that was always empty.** Every part of the journey worked and the feature looked broken end to end.

**And the mark on a note says only what is true.** `reached` is how many computers said back that they had written it down — not how many were online, and not how many a connection opened to. A note nobody has yet says so, with the way to try again beside it.

---

### D-214 `[DECIDED]` — A template built for its side effect is built where nothing can read it

**Decision.** The words handed to the file chooser are their own function, `fileChooserScript`, and a test reads them.

**Why.** The line that sets a starting folder named `start`, and nothing in that file has ever been called `start`. It sat in a template built *before* the `try` that was there to catch a chooser refusing to open — so every press of *Offer a file* threw on the way in, and the person read *something went wrong here*, which is the sentence the server keeps for a fault nobody expected. **The chooser never opened once, and everything after it had always worked and had never been reached.**

Two things follow, and both are the general lesson rather than this one line. A template that is only ever built for its side effect cannot be tested, so it is a value now. And a `catch` that reports one sentence whatever happened is how a mistake of this kind hides for months — what the computer said is passed on.

---

### D-215 `[DECIDED]` — What somebody shares belongs to them, not to a list of everything

**Decision.** Offered things appear in the inspector for the computer offering them, asked of that computer at the moment it is looked at, with **Bring here** going through the transfer that already exists.

**Why.** There was one section called *available from your other computers*: a page about the network rather than about anybody's work, and a wall of names with no way to tell whose was whose as soon as there were two computers with a few folders each. Somebody looking for what Rahul is sharing should press Rahul.

Only what was explicitly offered, and a computer that is not here says that rather than showing a stale list.

---

## Part II — Amendments

**Headline finding: the Constitution survives all four founder decisions unchanged.** I previously said three of the four punched holes in constitutional non-negotiables. That was an overstatement and I am correcting it. Checked individually, all eight non-negotiables hold. What actually broke is over-strong *phrasing* in the Architecture and MVP documents — downstream documents that claimed more absoluteness than the constitution ever required.

That distinction matters: it means the founding document was written well enough to absorb four significant decisions without amendment.

### A-1 — MVP §9.1

> **Was:** "With G deferred, the MVP has no networked feature at all — offline is not a degraded mode but the product's whole envelope."

> **Now:** The MVP has exactly two network paths. Both run on the developer's own infrastructure and credentials, both are optional, and neither blocks any workflow: (a) publishing on accept, for projects the developer marks shared (D-1); (b) summarization through the developer's own assistant (D-4). With both unavailable, every workflow still completes end to end — settling stays local and accounts fall back to templates. Offline is fully functional, never merely survivable.

### A-2 — MVP §9.5 and Architecture §5

Add: publishing writes only ordinary commits to the developer's own remote. It creates nothing the app must exist to interpret. The no-hostage rule is unaffected — arguably strengthened, since settled work now reaches the developer's own infrastructure without the app in the path.

### A-3 — Architecture §13

> **Was:** "There is no notification pathway in the architecture at all — not a suppressed one, an absent one. The only way the developer learns anything is by looking."

> **Now:** Both sentences stand. Presence is added as a third *render target* — not a third surface. The distinction is definitional and load-bearing: **a surface captures intent; a render target only displays.** The presence indicator captures no input, holds no state, offers no action, and obeys every rule the two surfaces obey. "The only way the developer learns anything is by looking" remains literally true, because looking is the only thing the indicator permits. Push does not exist; presence does.

*Note: the Constitution needs no change here. "A place you go to, not a thing that comes at you" already draws exactly this line. The Architecture over-claimed.*

### A-4 — Architecture §14.5

> **Was:** "The only network use is the developer's own infrastructure, at the developer's explicit configuration, through the Carrier."

> **Now:** "…through the Carrier or the Gateway." The Gateway's network use is bounded to the developer's own assistant, with the developer's own credentials, carrying only what that assistant has already seen. No telemetry, no phone-home, no service operated by us — all unchanged.

### A-5 — Workflow §1, Workflow E, and the surface lexicon

- The `accept` verdict gains a publishing effect for shared projects. No new state, no new verdict.
- Accepting can now fail for a network reason. The existing accept-failure path already covers this exactly: effort stays in Waiting-on-you, one plain sentence, one suggested action. No new failure shape.
- **Two words enter the closed lexicon:** *send* (verb) and *the shared copy* (noun). "Accepted. Sent to the shared copy." Neither is version-control vocabulary; both pass the constitutional contract. This is a lexicon change and therefore, per Design §18.3, a constitution-level decision — recorded here as made.

### A-6 — Workflow C.3 and Architecture §8.3

Ground preparation moves from effort creation to first delegation (D-5). Contradiction C-3 from the design review ("invisible and instant" vs. "honest progress on a huge project") dissolves: creation becomes genuinely instant because it does no work, and delegation carries an honest "preparing — safe to leave" when the project is large.

---

## Part III — Probe findings: ground cost

*Measured, not estimated. Synthetic repositories at realistic file counts, ext4, no antivirus. These are a **floor** — Windows with NTFS and Defender real-time scanning will be materially worse.*

| Files | Working tree | Time per ground | Disk per ground |
|---:|---:|---:|---:|
| 2,000 | 39 MB | 0.33 s | 39 MB |
| 12,000 | 235 MB | 1.80 s | 235 MB |

**Model.** Time scales linearly at **~0.15 ms per file**. Disk cost per ground is **exactly 100% of the working tree**. Git history is shared across grounds at no marginal cost — that is the one piece of good news.

**Extrapolated:**

| Project shape | Files | One ground | Ten grounds |
|---|---:|---:|---:|
| Small service | 2,000 | 0.3 s | 0.4 GB |
| Large application | 12,000 | 1.8 s | 2.3 GB |
| App with dependencies installed | 60,000 | 8.9 s | 6.8 GB |
| Monorepo with dependencies | 150,000 | 22 s | **14.6 GB** |

**What this settles.**

1. **"Efforts are cheap" was false as written** (Architecture §7). Disk is a scarce resource and ground consumes it linearly. → Fixed by D-5, which makes creation free and confines the cost to efforts that actually receive work.
2. **"Preparation is invisible and instant" was false at scale** (Workflow C.3). Twenty-two seconds is not instant. → Fixed by A-6.
3. **Contention is real.** Under concurrent disk load, one preparation degraded from 1.8 s to 4.3 s. Preparation must never block the interaction path — it already must not, but this confirms the requirement has teeth.
4. **A disk budget is now required.** `[OPEN]` — needs a ceiling, an honest sentence when approached, and a policy for grace-held ground, which currently retains full working trees for an unspecified period.

**What this does not settle.** Windows/NTFS timings, Defender's real-time scanning penalty (expect 2–4×), and long-path behavior with deep dependency trees. These need re-measuring on the target platform once D-2's substrate exists.

---

## Part IV — Still open

| ID | Open item | Owner | Blocking? |
|---|---|---|---|
| `[OPEN]` O-1 | Disk budget: ceiling, honest sentence, grace-ground retention policy | Eng | Before Engine |
| `[OPEN]` O-2 | Quiescence heuristic — how "the assistant finished" is inferred. Needs the instrumentation probe; still the single largest unmeasured risk | Eng | Before Gateway |
| `[OPEN]` O-3 | Summarization quality bar and prompt design; how an uncertain summary is expressed honestly | Both | Before Core ships summaries |
| `[OPEN]` O-4 | Overlap precision policy and false-positive budget | Eng | Before Overlap Analyst |
| `[OPEN]` O-5 | Vocabulary & Voice Standard — now a runtime validator (D-8), not a style guide | Founder | Before Core |
| ~~O-6~~ | ~~Event & reason schema v1~~ — **closed.** Specified, implemented and held to a 39-test conformance suite in `core/`. | — | Done |
| `[OPEN]` O-7 | Every remaining numeric parameter (grace period, staleness, Home ceilings) | Both | Before MVP |
| `[OPEN]` O-8 | Business model. Untouched in the corpus; every conventional lever is constitutionally banned | Founder | Not blocking build |
| ~~O-9~~ | ~~Compaction for a shared workspace left running for months~~ — **closed.** Prunes computers not heard from in ninety days, trims conversations, and folds the history back into one save past five hundred. D-131, held to twelve tests including the four guards on the one irreversible step. | — | Done |
| `[ASSUMED]` R-2 | That signing in to an AI app inside a terminal the manager opened leaves that app signed in the same way it would be otherwise. Believed, never checked against a real provider (see also the untested half of profiles) | Eng | Verify with a throwaway account |
| `[ASSUMED]` R-1 | That the founder's own repositories live on Windows filesystems, not inside WSL. If false, D-7 breaks the dogfooding loop that justified D-2 | Founder | Verify now |

---

*Nothing in the specification documents has been edited. The amendments in Part II are authoritative until folded in, which should happen in one pass rather than four.*
