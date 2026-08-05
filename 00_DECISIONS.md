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
| `[ASSUMED]` R-1 | That the founder's own repositories live on Windows filesystems, not inside WSL. If false, D-7 breaks the dogfooding loop that justified D-2 | Founder | Verify now |

---

*Nothing in the specification documents has been edited. The amendments in Part II are authoritative until folded in, which should happen in one pass rather than four.*
