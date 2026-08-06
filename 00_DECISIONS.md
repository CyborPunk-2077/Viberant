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
