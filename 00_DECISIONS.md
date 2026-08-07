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
| `[OPEN]` O-9 | Compaction for a shared workspace left running for months — presence writes a small save every two minutes and nothing prunes them yet (D-25) | Eng | Before it is a year old |
| `[ASSUMED]` R-2 | That signing in to an AI app inside a terminal the manager opened leaves that app signed in the same way it would be otherwise. Believed, never checked against a real provider (see also the untested half of profiles) | Eng | Verify with a throwaway account |
| `[ASSUMED]` R-1 | That the founder's own repositories live on Windows filesystems, not inside WSL. If false, D-7 breaks the dogfooding loop that justified D-2 | Founder | Verify now |

---

*Nothing in the specification documents has been edited. The amendments in Part II are authoritative until folded in, which should happen in one pass rather than four.*
