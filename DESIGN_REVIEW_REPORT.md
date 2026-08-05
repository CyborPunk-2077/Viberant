# DESIGN_REVIEW_REPORT.md

*A structural review of the Product Constitution, Workflow Specification, System Architecture, UI Design System, and MVP Specification — conducted as co-founder and product owner, not as editor.*

**Reviewed artifact:** `VIBE.txt` (phases 0–4, ~2,000 lines)
**Date:** 5 August 2026
**Status of this document:** review only. No specification text has been modified.

---

## 1. Executive Summary

This is a strong specification. It is in the top decile of product documents I have read for internal coherence, for the discipline of subordinating each document to the one above it, and for encoding values as structural constraints rather than as aspirations. The vocabulary gradient (Architecture §4) and the unrepresentable machine-authored `Done` (Architecture §2.3) are the two best ideas in the set: they turn philosophy into something a compiler can enforce. Most product specs of this length are decoration. This one has load-bearing walls.

It is also not ready to build.

The weakness is systematic and diagnosable: **the specification is most confident exactly where it is cheapest, and thinnest exactly where it is most expensive.** Roughly 1,400 of its 2,000 lines govern philosophy, grammar, hierarchy, and restraint — all excellent, all essentially free to decide. The five mechanisms that will actually determine whether this product works at all are each handled in a single table row or a single paragraph:

1. **The Summarizer.** "Forty actions read as one sentence" is the product's entire value proposition. How that sentence is produced is never specified — and the MVP simultaneously commits to *no network activity whatsoever* (§9.1, §9.4), which forecloses the only obvious implementation.
2. **Assistant session lifecycle.** The domain model has no concept of a session. The handoff to a terminal assistant either requires the app to own a terminal (a third surface, forbidden) or to cede observability (weakening the whole loop). Undecided.
3. **Quiescence detection.** The neutrality proof (MVP §11.2, release-gating) rests entirely on inferring "the assistant finished" from file-system silence. No heuristic, threshold, or error budget is given.
4. **Overlap analysis.** Every false positive drives *two* efforts into the product's most expensive state. No precision policy, no false-positive budget, and the acceptance criteria only test detection, never restraint.
5. **Home at scale.** "Compression, never pagination" is a non-negotiable with no defined mechanism. The success metrics explicitly want effort counts to rise; this is the first constraint that will break.

Beyond these, I found **12 genuine contradictions**, **12 material ambiguities**, and **12 unmade decisions** — several of them constitution-level, not implementation-level. The most consequential single gap is a product-scope question the documents never ask: **`Done` is not `shipped`.** The state model ends at "settled locally." Real developers must push, open reviews, pass CI, and merge. That entire last mile is invisible in a 2,000-line specification, and it cannot be added later without either version-control vocabulary on a surface (constitutionally banned) or new grammar (architecturally banned).

There is also a live commercial question the documents do not touch. Since these documents were drafted, isolation-per-agent has commoditized: Claude Code shipped built-in git worktree management in v2.1.49 (February 2026), and several products — Conductor, AgentsRoom, Composio AO — already ship "multiple agents in isolated worktrees with a dashboard and a diff-first review UI." That is a substantial overlap with this MVP's feature list. The differentiation here is real but narrow: it is *taste, calm, and abstraction quality*, not capability. That is a defensible moat, but it is a moat made of craft rather than of function, and the specification should say so out loud so the team never mistakes feature parity for progress.

**Verdict: Conditional Go.** No-go for product implementation. Go for a tightly scoped, explicitly disposable technical probe (five questions, three weeks), followed by four specification amendments. Several of the open questions cannot be resolved by writing more prose — they are empirical, and continuing to write will only produce more confident sentences about things nobody has measured.

**Readiness: 62%.**

---

## 2. Overall Product Assessment

### The thesis is right

The premise — that AI-assisted development has changed the developer's job from typing to directing, and that tooling has not followed — is correct and well-argued. The reframe of the developer as editor-in-chief is not a slogan; it produces real design consequences throughout (read-only review, three verdicts, the intent sentence outranking the app's words). The mental model of the workshop foyer earns its place: I tested several proposed features against it during this review and it discriminated usefully every time.

### The abstraction is the product

Efforts / three states / three verdicts / two surfaces / one failure shape is a closed grammar, and closure is the rarest and most valuable property a long-lived product can have. Most tools decay because their grammar is open — every feature adds a noun. This one cannot, structurally. If this product succeeds in ten years, this will be why.

### The abstraction is also the bet

The same closure is the primary product risk. A closed grammar is only safe if it is *complete*. Two gaps suggest it may not be:

- **`Waiting on you` conflates five distinct situations** with wildly different urgency and cost: parked-by-choice, ready-for-review, assistant-blocked-on-a-question, failed, and unknown. Three of these need action within seconds; two can wait weeks. They occupy one rank with no specified internal ordering.
- **There is no state for "shipped."** See §5, C-1.

Neither is fatal. Both are the kind of thing that is cheap to fix now and very expensive to fix after the event log schema is frozen (and the specification promises that log history is *never* rewritten — Architecture §19.3, MVP §8.4).

### The philosophy occasionally outruns the physics

Several constitutional commitments are asserted with more confidence than the underlying mechanism can currently support:

| Commitment | Physical reality |
|---|---|
| "Efforts are cheap... allocates no scarce resource" (Arch §7) | One isolated ground per effort consumes disk proportional to repository size. Ten efforts on a monorepo is not cheap. |
| "A compromised assistant can damage at most one effort's ground" (Arch §14.3) | Filesystem separation is not process confinement. An agent with shell access can reach anything the user can. This claim is false as written. |
| "Nothing leaves the machine" (MVP §9.4) + "forty actions read as one sentence" (Const.) | These are in direct tension unless a local model is committed to, with all its quality and latency consequences. |
| "No interruption pathway exists at all" (Arch §13) | An assistant blocked on a permission prompt is silently idle. Under strict silence, the developer may discover this hours later. The "leaving is safe" promise of Workflow D fails in the single most common real-world case. |

None of these require abandoning the philosophy. All require the specification to state the trade honestly rather than assert both sides.

### What kind of company this is

The constitution bans, individually and explicitly: accounts, backends, telemetry, lock-in, enterprise features, and third-party plugin surfaces. Each ban is well-reasoned. Collectively they eliminate every conventional monetization and measurement mechanism, and the documents never acknowledge this. The north-star metric ("share of working days that begin here") is *structurally unmeasurable* under §9.4. That is not a design flaw, but it is an unmade decision with a permanent shape, and it belongs in the constitution rather than in a later, painful amendment.

---

## 3. Strengths

These should be protected under any revision. Where a recommendation below touches one of these, I have said so.

**S-1 — Vocabulary enforced by architecture, not discipline (Arch §1.2, §4).** "No Git on any surface" is guaranteed by the seam not carrying the vocabulary, in either direction. This is the single best idea in the document set. Discipline decays; structure does not.

**S-2 — Machine-authored `Done` is unrepresentable (Arch §2.3).** A value encoded as a type constraint. Verdicts as first-class domain objects that only a human can author is exactly right, and it makes the trust story provable rather than promised.

**S-3 — Observation is the universal path; adapters are enrichment (Arch §9.2).** Most products would build adapters first and treat the generic path as degraded. Inverting it is what makes tool neutrality *true* rather than claimed, and it is what lets the acceptance criteria include "a tool that does not yet exist." Do not let this invert under schedule pressure.

**S-4 — The event log chosen for the right reasons (Arch §2.2).** Reversibility, replay, attribution, and sync-readiness — four real payoffs, not architectural fashion. The insight that sync becomes log-merge rather than state-merge is correct and worth the day-one cost.

**S-5 — One failure shape, enforced by schema (Arch §2.3, §18; Design §14).** Collapsing all error presentation into "effort in Waiting-on-you + one sentence + one action," and making the reason a *schema requirement* rather than a UI convention, eliminates an entire category of interface sprawl before it starts.

**S-6 — Explicit subordination and obligation-tracing.** Every document opens by naming its authority and tabling the upstream constraints it must honor. This is rare, and it is why the four documents read as one system.

**S-7 — Acceptance tests terminate every document.** Workflow §4, Architecture §20, Design §19, MVP §11 convert philosophy into gates. The MVP's criteria in particular are unusually falsifiable ("a vocabulary audit finds zero version-control terms," "killing any process loses no acknowledged verdict").

**S-8 — "Growth ships at depth, never at surface" (Design §16.3).** One sentence that will save this product in year four. It gives every future feature request a default answer that is not "no" but "deeper."

**S-9 — Anti-goals are specific and falsifiable.** "Not a dashboard," "not an IDE," "not a notification hub" are each accompanied by the reasoning that makes them testable, not just tonal.

**S-10 — Reversibility as a courage mechanism.** The framing that cheap abandonment causes bolder delegation everywhere else is a genuine psychological insight, and Workflow F is well-constructed around it — particularly the honest reframe of entangled reversal as a new "undo X" effort.

---

## 4. Weaknesses

**W-1 — Confidence is uniform; certainty is not.** The prose is aesthetically consistent across decided facts and unsolved problems. A future engineer cannot distinguish "this was decided after debate" from "this was written because it sounded right." *Recommend a decision-status convention* (e.g. `[LOCKED]`, `[DECIDED]`, `[ASSUMED]`, `[OPEN]`) applied per claim. This is the single cheapest high-value change available.

**W-2 — There are no numbers.** Beyond "100ms" and "ten seconds," the specification contains not one threshold, duration, or budget. Missing: grace period length, quiescence timeout, staleness threshold, Home effort-count ceilings, summarizer latency budget, the "slowest hardware we respect," overlap false-positive budget, log-replay ceiling. Every one of these will be invented under implementation pressure and become permanent.

**W-3 — The hardest components are one table row each.** The Summarizer, the Overlap Analyst, and the Effect Observer share three lines in Architecture §3 with Intent Capture, which is trivial. Difficulty is not represented anywhere in the document structure.

**W-4 — "When in doubt, we subtract" appears five times; nothing was subtracted.** There is no record of a rejected feature, a considered-and-declined idea, or a scope fight. The "feature restraint ratio" is a stated health metric (Const., Success Metrics) with no baseline. A decisions/rejections log would make the discipline real rather than declared.

**W-5 — No evidence base.** The user-psychology table (Const.) is asserted with great specificity — five feelings, five realities, five responses — and cites no research, no interviews, no observation. It may well be correct; the author lives the problem. But the MVP's entire panel test (§11.16) is designed to validate feelings that were never measured in the first place, which means a failing panel will be ambiguous: wrong product, or wrong hypothesis about users?

**W-6 — No prior-art positioning.** The category the documents describe now exists commercially. Claude Code has shipped native worktree management (v2.1.49, Feb 2026); Conductor, AgentsRoom, and Composio AO ship agent-per-worktree dashboards with review UIs. The specification never names an alternative, never says what it does differently, and therefore never tests its differentiation. This is not a minor omission: the MVP's required capabilities 1–6 substantially overlap with shipping products.

**W-7 — MVP §11 acceptance criteria depend on unspecified mechanisms.** Criterion 3 tests overlap detection but not false positives. Criterion 2 tests observation-only integration but defines no quiescence correctness bar. Criterion 7 requires no-scroll comprehension "at any effort volume achievable in the MVP" — undefined volume, therefore untestable.

**W-8 — Repetition of upstream constraints has a cost.** Each document restates the constitution's obligations in its own table. This is good for standalone readability, but it means an amendment to the constitution now requires four edits, and drift is likely. Recommend a single canonical `00_OBLIGATIONS.md` that others cite by ID rather than restate. *This is the one structural edit I would make to a document set I otherwise want left alone.*

---

## 5. Contradictions

Each is a place where two sentences in the specification cannot both be true as written.

**C-1 — `Done` is not `shipped`, and there is no room for the difference.**
*Where:* Workflow §1 (Done = "settled, safe, dismissible"); Arch §8.2 ("only a verdict settles work back"); MVP §2.6.
The specification's terminal state is local settlement. Real work must then be pushed, reviewed by humans, pass CI, and merge. None of this is modeled. Adding it later requires either version-control/collaboration vocabulary on a surface (banned by the constitution) or a new state or verdict (banned by Design §16.3 and Arch §19.1). This is a constitution-level scope decision that has been silently deferred, and it is the most consequential contradiction in the set.

**C-2 — Local-only vs. machine-quality summarization.**
*Where:* MVP §9.1 ("the MVP has no networked feature at all"), §9.4 ("nothing leaves the machine") vs. Const. Philosophy 3 ("if the AI did forty things, the developer should read one sentence"), Arch §3 (Summarizer).
Producing an honest, plain-language, one-sentence account of arbitrary code changes is an LLM task. Templates ("4 files changed in auth") reproduce exactly the plumbing vocabulary the constitution bans and do not deliver compression. The specification commits to both the outcome and the constraint that forecloses the obvious means, and never notices.

**C-3 — Isolation is "instant" and also "honestly in progress."**
*Where:* Workflow C.3 ("invisible and instant from the developer's perspective") and Arch §8.3 ("preparation is instant") vs. Arch §16.3 and Design §13.3 ("ground preparation on a huge project... proceeds in the background with truthful state").
Both are asserted as normative. Which governs? A developer creating an effort on a 4GB monorepo will wait. Resolve by making the honest-progress path canonical and deleting "instant" from Workflow C, or by specifying a lazy-preparation model where ground materializes on first delegation rather than on creation.

**C-4 — Optimistic acceptance vs. the accept-failure path.**
*Where:* Arch §6.2 / Design §6.3 (developer actions are "shown as done the instant they are willed," durability follows; failure must never "silently revert what the developer saw") vs. Workflow E failure path ("Accepting fails... The effort **stays** Waiting on you").
Either accept optimistically shows `Done` and then visibly reverts on failure (contradicting Workflow E's word "stays"), or accept blocks until settled (contradicting the optimistic model and possibly the 100ms bound). Two engineers will implement this differently. Decide explicitly, and state whether *any* verdict is exempt from optimism.

**C-5 — Silence is absolute, but a blocked assistant is silent too.**
*Where:* Arch §13 ("there is no notification pathway in the architecture at all — not a suppressed one, an absent one") vs. Workflow D ("Leaving felt safe").
Modern coding agents pause constantly for permission and clarification. Under strict silence, a developer delegates, leaves for ninety minutes, and returns to find the agent stopped after ninety seconds. This does not violate a rule; it destroys the promise the rule exists to protect. The specification must either carve out a *passive, non-interrupting* state signal (a menu-bar/dock reflection is arguably not an interruption — it is a glance surface, and the constitution's rule is about push, not presence), or explicitly accept the cost in writing.

**C-6 — Two surfaces only vs. handing off to a terminal assistant.**
*Where:* Workflow §0 and cross-rule 2 ("two surfaces... a third surface is a signal to redesign") vs. Workflow D.1 (handoff with "context intact, as one action").
If the app spawns the assistant in the developer's own terminal, it loses all session-level observability and the handoff is one-way. If the app owns the process, the assistant's interactive TUI must be displayed *somewhere* — which is a third surface. There is no third option, and the specification picks neither. This is the single most under-specified area in the architecture.

**C-7 — "Never silently acts on the work" vs. Workflow G's automatic rebasing.**
*Where:* Const. non-negotiables ("the app may prepare, summarize, and suggest — it never silently acts on the work itself") vs. Workflow G.4 ("moving efforts continue on the freshest ground when it is safe to bring it under them, and the developer is not consulted about non-decisions").
Bringing new upstream work under an in-flight effort is a mutation of the developer's work, performed without traceable developer intent. Deferred with G, but locked in the workflow spec as written.

**C-8 — Assistant isolation claimed as a security boundary.**
*Where:* Arch §14.3 ("a misbehaving or compromised assistant can damage at most one effort's ground").
Separate working directories do not confine a process. An agent running arbitrary shell commands can write anywhere the user can. Either commit to actual sandboxing (a large, unstated piece of work with real platform consequences) or downgrade the claim to what it is: *accidental* entanglement prevention, not a security boundary.

**C-9 — Replayable forever vs. instant startup forever.**
*Where:* Arch §19.3 / MVP §8.4 ("old logs remain replayable forever"; "log history is never rewritten") vs. Arch §16.5 ("startup is a projection read... orientation in under ten seconds even on a cold, slow machine") and corruption recovery by full replay.
Year-five recovery from a multi-year log will not be fast. Snapshotting is the standard answer, but "no migration ever rewrites history" is written strongly enough to be read as forbidding compaction. Clarify that snapshots are derived state (disposable, rebuildable) and are therefore permitted — or accept unbounded recovery time.

**C-10 — Collision forces `Waiting on you` while the machine keeps working.**
*Where:* Workflow D failure path ("Two moving efforts collide... **Both** efforts move to Waiting on you") vs. Workflow §1 (Moving = "an AI or the developer is actively working").
Does declaring an overlap stop the running assistants? If yes, the app is silently acting on the work (C-7 again) and the developer's agent loses its context. If no, the state on Home is a lie for as long as the agents keep running — violating "the state on Home is always the truth" (Workflow D outcome; Arch §6.3).

**C-11 — "Nothing expires or times out" vs. the grace period.**
*Where:* Design §15 ("Time pressure does not exist. Nothing in the interface expires, times out, or demands response within a window") vs. Workflow F.4 (dissolved efforts are recoverable "for a grace period"; expiry is "automatic and distant").
A timed, silent, irreversible deletion is the strongest form of expiry in the product. The tension is resolvable — the developer is never *asked* for anything — but the design system's absolute phrasing is false as written, and the grace period has no stated duration.

**C-12 — Zero mandatory first-run decisions vs. filesystem discovery.**
*Where:* Const. non-negotiables and Workflow A ("no mandatory decision is presented") vs. Workflow A.1 ("the app discovers the developer's existing work on this machine") and MVP §7.3 (non-supported VCS projects "declined honestly at discovery").
On the likely target platform, scanning the user's filesystem requires an OS-level permission grant — a mandatory decision, presented by the OS, in the first ten seconds, before any value has been delivered. Additionally, detecting *in-progress AI work* requires reading specific assistants' private session state, which is both fragile and quietly non-neutral (only detectable for known tools).

---

## 6. Ambiguities

Places where the text is not contradictory but admits multiple valid implementations. Each is a fork where two competent engineers will build different products.

| ID | Ambiguity | Where | Why it matters |
|---|---|---|---|
| **A-1** | What "settle" physically means — commit to the project's mainline? To a branch? Squashed? Attributed to whom? | Arch §8.2, §10 | Determines the entire relationship to the developer's real repository and to C-1. |
| **A-2** | Effort ↔ assistant session cardinality. One session per effort? Many over time? Does *redirect* type into a live session or start a fresh one with accumulated direction? | Workflow D, E; Arch §9.1 | Two completely different mechanisms behind one word. Also determines whether the assistant's own memory survives a redirect. |
| **A-3** | The developer works directly in an effort's ground with their own editor. | Unaddressed | Extremely common. What state is the effort in? Who transitions it out of Moving? The ground is on disk; this *will* happen. |
| **A-4** | When do `Done` efforts leave Home? | Workflow §1 ("dismissible"), Design §2.1 rank 3 | If automatic, a machine silently changes the picture. If manual, it is ceremony (forbidden by cross-rule 9). No workflow covers it, and it directly governs Home's load. |
| **A-5** | Ordering *within* rank 1. | Design §2.1 ("led by their reasons") | A three-week-old parked idea and a blocked agent sit in the same rank. Configuration is banned, so this must be an opinionated rule — and no rule is given. |
| **A-6** | The compression ladder. What Home looks like at 3, 12, 40 efforts. | Const. non-negotiable; Design §4.2 | "Compresses, never paginates" is a principle with no mechanism. Grouping by project would violate "each effort shows its intent" (Workflow B.2). |
| **A-7** | Partial judgment mechanics. | Workflow E.4; Design §17.5 | Accepting *some* pieces implies partial settling — an operation absent from the Engine's sealed interface (prepare / derive / settle / restore / unwind / describe / hold-release). Either the interface is incomplete or partial judgment is not what it appears to be. |
| **A-8** | `Chapter` vs. new effort vs. duplicate-intent notice. | Arch §2.1; Workflow C failure path | The boundary between "reopening this effort" and "starting a related one" is undefined, and duplicate detection makes it user-visible. |
| **A-9** | What "Arrived" means in the MVP with Workflow G deferred. | MVP §3, §4; Design §18.3 | "Arrived" remains in the closed surface lexicon, and external-mutation facts still surface. What sentence does a developer actually read? |
| **A-10** | Project discovery scope and correction. | Workflow A, C | How deep does discovery scan? How does a developer add, rename, unbind, or ignore a project with no settings surface? These are verbs that must exist and are not enumerated. |
| **A-11** | "Honest liveness" for Moving efforts (Design §8.1.3) as the sole uncaused motion — but Design §8.3 forbids content animating in from background updates. What actually moves, and does it survive reduced-motion parity? | Design §8 | Small, but it is the only continuously animating element in a calm product; it deserves precision. |
| **A-12** | Whether app updates are permitted network activity. | MVP §9.4; Arch §14.5 | "No silent network activity" as written forbids update checks. A product with no telemetry and no update channel cannot ship fixes. Needs an explicit carve-out. |

---

## 7. Missing Decisions

Decisions that must be made by a person, not derived from the existing text. Ordered by blast radius.

| ID | Decision | Blast radius |
|---|---|---|
| **M-1** | **Does the product's scope end at `Done`, or does it reach `shipped`?** (See C-1.) | Constitution-level. Changes the state model, the Engine seam, and the entire competitive position. Decide first. |
| **M-2** | **How summarization works** — local model, remote model with an explicit constitutional carve-out, or deterministic templates with a lower quality ceiling. Includes determinism policy, latency budget, and how an *uncertain or wrong* summary is expressed honestly. | Everything. This is the product. |
| **M-3** | **Process ownership and the terminal question.** (See C-6.) | Architecture-level; determines fact richness, adapter contract shape, and whether the two-surface rule survives. |
| **M-4** | **Target platform.** Named as "one desktop OS" (MVP locked decision 4) but never chosen. | Cascades into filesystem watching, permissions, sandboxing, appearance signals, and distribution. |
| **M-5** | **Named adapter set (2–3)** and **the VCS backend.** Both deferred to "at build time" / "the dominant reality." | The adapter contract will be shaped by whichever tools are chosen; choosing late means designing the contract blind. |
| **M-6** | **Every numeric parameter.** Grace period, quiescence timeout, staleness threshold, Home ceilings, summarizer latency, "slowest hardware we respect," overlap false-positive budget. | Each becomes permanent by accident if not decided deliberately. |
| **M-7** | **Overlap precision policy** — what counts as overlap, what is ignored (lockfiles, formatters, generated files), and the maximum acceptable false-positive rate. | Directly governs whether rank 1 stays calm or becomes an anxiety inbox. |
| **M-8** | **Whether assistants are sandboxed.** (See C-8.) | Large. Determines whether the security claim in §14.3 can stand. |
| **M-9** | **Business model.** Not mentioned once in 2,000 lines. Accounts, backends, telemetry, enterprise features, and lock-in are each individually banned. | Existential, and structurally constrained by decisions already locked. Better decided now than as a later amendment that breaks the constitution. |
| **M-10** | **How success metrics are measured without telemetry.** The north star is currently unmeasurable by construction. | Governs whether the team can ever know if it is winning. |
| **M-11** | **Update and distribution channel**, given §9.4. (See A-12.) | Ship-blocking in practice. |
| **M-12** | **What happens when the developer manipulates ground with their own tools** — deletes a worktree, switches branches, resets. Arch §10.5 says "treat as world activity, never as corruption," which is a posture, not a behavior. | Common in practice; currently undefined behavior. |

---

## 8. Architectural Risks

**R-ARCH-1 — The Summarizer is a single point of product failure with no failure shape.** Every other failure in the system resolves to "Waiting on you + one sentence + one action" (Arch §18). A *wrong* summary produces none of those — it produces false confidence, silently, in a product whose entire value is trustworthy compression. One hallucinated "the auth refactor is complete and tests pass" destroys the trust the constitution spends five sections building. There is no mechanism for expressing summary uncertainty, no user-facing "verify this," and no defined relationship between summary confidence and the depth-2/depth-3 descent. *Severity: highest in the document set.*

**R-ARCH-2 — The adapter contract is being designed blind.** A four-duty contract (presence / handoff / facts / account) validated against 2–3 terminal CLI agents is likely to be wrong for IDE-embedded assistants, editor extensions, and whatever protocol dominates in two years. The specification promises versioned seam contracts (§15), but v1 of a contract designed against three similar tools will need a v2 almost immediately — and the specification's own extensibility rules make contract churn expensive.

**R-ARCH-3 — "Internal seams designed as if third parties will stand on them" (§15) is unpriced over-engineering.** The reasoning ("discipline that makes seams safe for strangers makes them clean for us") is sound in principle and doubles the design cost of every capability module with zero v1 payoff, in a product whose governing instinct is subtraction. *I would challenge this locked decision:* keep the seams, drop the stranger-grade rigor for the two seams (workspace backends, sync carriers) that have exactly one implementation each and no announced second.

**R-ARCH-4 — Facts-up/commands-down forbids boundary components talking to each other (§1.2) — but the Effect Observer and the Overlap Analyst need the same footprint data.** The Observer watches ground (Gateway); the Overlap Analyst compares footprints (Core); footprint computation is Engine work ("describe effect"). Three components, one dataset, a rule forbidding two of them to speak. Workable, but it will route high-frequency filesystem data through Core, which is supposed to know nothing about files. Worth an explicit data-flow design before implementation.

**R-ARCH-5 — Optimistic intent + durable-before-acknowledged are in tension.** MVP §8.4 requires "every developer intent and verdict is durable before the process that acknowledged it would lose it"; Arch §6.2 requires acknowledgment to precede durability. The reconciliation (acknowledge in the Shell, persist in Core, guarantee convergence) is stated but not designed, and it is precisely where crash-consistency bugs live.

**R-ARCH-6 — No snapshot strategy.** (See C-9.) Recovery time grows without bound.

**R-ARCH-7 — The repo projection becomes a permanent public compatibility surface the moment it ships.** It lands in shared repositories where teammates and other tools will see it. Off-by-default reduces exposure but not permanence. It needs a versioned schema specified *before* v1, not derived from whatever the implementation emitted.

---

## 9. UX Risks

**R-UX-1 — `Waiting on you` becomes an anxiety inbox.** The product's central psychological promise is lower heart rate. Rank 1 is a single undifferentiated pile containing "your agent is blocked right now," "review 400 lines," and "an idea you parked in June," with no specified ordering (A-5) and no dismissal path for the parked items. This is the mechanism by which calm products become guilt-inducing ones, and it is one design decision away from happening.

**R-UX-2 — A single wrong summary costs more trust than a hundred right ones earn.** (R-ARCH-1 from the user's side.) Once a developer catches the app being confidently wrong about what an agent did, they will read the raw output forever after — and at that point the app is a launcher.

**R-UX-3 — The read-only conviction fights an irresistible urge.** "The AI got it 95% right, let me fix this one line" is one of the most common moments in AI-assisted development. Design §17.1 forbids editing on principle. The developer's actual next move is to open the ground in their editor — and then A-3 (undefined state) fires. The stance is defensible; the workflow for what actually happens is missing.

**R-UX-4 — Discoverability has no teacher.** No tours, no coach marks, no tooltips (Design §13.2), no settings surface, no documentation surface. The palette is the sole mechanism for learning the verb vocabulary (§7.1), and it must be summoned to teach. A first-run user who never presses that key knows exactly one action — forever. The constitution's ban on tutorials is right; the absence of *any* replacement is a gap.

**R-UX-5 — One column, rank-ordered by state, with no project dimension.** A developer with six projects × four efforts sees 24 intent sentences interleaved by state. Project is rank 4 ("where you are"), so it is visually subordinate to everything. The mental model (a foyer with benches) implies grouping by bench; the layout system forbids grouping by anything but state.

**R-UX-6 — Compression can hide the thing that mattered.** "Forty actions → one sentence" is a promise of lossy compression, and the loss is chosen by the app. For a 40-file refactor, one sentence may be actively insufficient, and descending to depth 3 is exactly the "archaeology" the product promised to eliminate. The review experience needs a defined middle rung between "one sentence" and "all the evidence" — Design §16.1's depth 2 (the story) is *history*, not *scope*, and does not fill that gap.

**R-UX-7 — Silence and the idle agent.** (C-5 from the user's side.) The felt experience of "I left, came back in an hour, and it had been stuck for 58 minutes" is the fastest possible route to abandonment, and the architecture forbids the obvious mitigation.

---

## 10. Scalability Risks

**R-SCALE-1 — Disk.** One isolated ground per effort × repository size. Ten parallel efforts on a large monorepo is tens of gigabytes, plus grace-held ground for dissolved efforts (Workflow F.4) that is retained invisibly for an unspecified period. Contradicts "efforts are cheap" (C, §2). Needs: a ground-cost model, a lazy-preparation option, and a stated disk budget with an honest failure sentence when exceeded.

**R-SCALE-2 — Filesystem watchers.** Watching N grounds on a large repository means thousands of watch descriptors. Platform-specific limits are real and are hit in practice. Unaddressed anywhere.

**R-SCALE-3 — Home density.** (A-6.) Success metric #4 explicitly wants concurrent effort counts to *rise*, while a non-negotiable forbids scrolling. These are on a collision course with no defined mechanism between them.

**R-SCALE-4 — Summarizer throughput.** N moving efforts × continuous re-summarization, with a hard rule that background work yields entirely to a 100ms foreground bound (Arch §12). If summarization is a local model, this is a real resource contest on the developer's machine — competing, notably, with the AI assistants themselves, which are already consuming that machine.

**R-SCALE-5 — Log growth and replay.** (C-9, R-ARCH-6.)

**R-SCALE-6 — Overlap analysis is O(n²) over effort footprints,** recomputed as facts arrive. Fine at 5 efforts, questionable at 40 — which is exactly the scale the vision section aspires to ("dozens of long-running AI efforts").

**R-SCALE-7 — Adapter matrix growth.** Each new assistant × each version of that assistant is a compatibility surface maintained by a first-party-only team (adapters are "strictly first-party," MVP §7.1) with no plugin ecosystem to absorb the load (locked decision 3). This scales linearly in maintenance cost with the ecosystem's growth, forever.

---

## 11. Technical Debt Risks

**T-1 — Summarizer substitution is a constitutional change in disguise.** If v1 ships deterministic templates and v2 adds a model, the app's *voice* changes for every existing user, and — if the model is remote — a product that shipped as network-free acquires a network dependency. That is not a version bump; it is an amendment. Decide M-2 now.

**T-2 — The event schema will be authored under implementation pressure and is permanent.** Arch §19.3 and MVP §8.4 promise that history is never rewritten. The first schema is therefore forever. It does not exist yet, and it is currently scheduled to be invented by whoever writes the first Core module.

**T-3 — The repo projection format is permanent on first release.** (R-ARCH-7.)

**T-4 — Adapter contract v1 → v2 churn.** (R-ARCH-2.)

**T-5 — Missing Engine operations discovered late.** Partial settling (A-7) is already implied by Workflow E.4 and absent from the sealed interface. If the interface is genuinely sealed, discovering a missing operation mid-build means either widening the seam (leaking mechanism upward — explicitly a "rejected contract" per §15) or quietly violating the layering. Enumerate the full operation set before implementation.

**T-6 — Four documents restating one set of obligations.** (W-8.) Drift is a matter of time.

**T-7 — Deferring Workflow G defers the only workflow that stresses the merge/conflict machinery.** The MVP's overlap analyst handles effort-vs-effort only. Effort-vs-arrival is the harder case and is where the log-merge semantics get their first real test. Shipping without it means the sync-readiness investment (day-one causal ordering, machine attribution) is carried but never validated — the most expensive kind of untested code.

---

## 12. Recommended Improvements (Prioritized)

### P0 — Must resolve before any implementation begins

**REC-1 — Decide the `Done`-vs-`shipped` scope question (M-1, C-1).**
Three viable answers: (a) explicitly out of scope, stated in the constitution as an anti-goal with a rationale — the product ends where the developer's collaboration tooling begins; (b) in scope, requiring a constitutional amendment and probably a fourth state; (c) in scope as an *effect of accepting*, invisible in the grammar (accept can be configured per project to settle-and-publish). I lean (a) for the MVP with (c) as the growth path, but this is a founder decision and everything else waits on it.

**REC-2 — Write a Summarization Specification (M-2, R-ARCH-1, T-1).**
Must contain: the engine decision and its constitutional consequences; input contract (what facts, what diff scope); the honesty model for uncertainty; determinism and re-computation policy; latency and resource budget; the quality bar and how it is tested; and the failure shape for "cannot summarize confidently." Without this, nothing else can be built with confidence.

**REC-3 — Write an Assistant Integration Specification (M-3, C-6, A-2).**
Must contain: process ownership model; the terminal question, answered; effort↔session cardinality; redirect semantics (live vs. fresh); the normalized fact schema; quiescence heuristics with thresholds and an error budget; and the *permission-prompt* case, which is the one that decides whether "leaving is safe" is true.

**REC-4 — Resolve C-5 (blocked-agent silence) at the constitutional level.**
My recommendation: distinguish *push* from *presence*. The constitution's real target is interruption — things that come at you. A passive, ambient, never-animating state reflection (menu bar / dock) that the developer can glance at is arguably the foyer extending into the hallway, not a notification. If the founders disagree, write the disagreement down and accept the cost explicitly, because it will be the most common complaint.

**REC-5 — Decide the numbers (M-6, W-2).**
A single table. Every threshold, budget, and duration in one place, each with a rationale. Cheap, fast, and it prevents a dozen accidental permanencies.

### P1 — Must resolve before the specification is called complete

**REC-6 — Write a Vocabulary & Voice Standard.**
The entire product is sentences, produced by two authors (hand-written UI copy and a machine summarizer) who must sound identical. Design §18.3 promises a closed lexicon and then lists eight terms; that is a promise, not a specification. Needs: the closed lexicon; the banned-term blacklist in machine-readable form (MVP §11.8 requires an automated vocabulary audit — it currently has nothing to audit against); sentence grammars per event class; the "honest clerk" voice defined by example; and ~50 worked sentences covering every failure reason. *This is the highest-leverage missing document after REC-2.*

**REC-7 — Amend the Design System with Home composition rules at scale (A-4, A-5, A-6, R-UX-1, R-UX-5).**
The compression ladder, intra-rank ordering, `Done` retirement policy, and whether project ever becomes a grouping dimension. Concretely: what Home shows at 3, 12, and 40 efforts.

**REC-8 — Specify the overlap precision policy (M-7, R-UX-1).**
Definition of overlap, exclusion list, false-positive budget, and a new acceptance criterion testing restraint rather than detection.

**REC-9 — Publish the Event & Reason Schema v1 (T-2, R-ARCH-6).**
Event types, reason codes, the one-sentence/one-action structure as an actual schema, snapshot semantics, and the versioning rule — before Core is written.

**REC-10 — Enumerate the complete verb inventory (A-10, R-UX-4, MVP §11.14).**
Every action in the product, its palette phrasing, whether it earns a direct shortcut, and its context rules. This is required by three existing acceptance criteria and does not exist.

**REC-11 — Correct the security claim (C-8, M-8).**
Either commit to sandboxing with its platform consequences, or downgrade Arch §14.3 to an accidental-entanglement guarantee. Do not ship a false safety claim in a document meant to be authoritative.

**REC-12 — Add a decision-status convention (W-1) and a decisions/rejections log (W-4).**
`[LOCKED] [DECIDED] [ASSUMED] [OPEN]` per claim, plus a record of what was considered and declined. Together these are perhaps two days of work and they change how every future engineer reads the corpus.

### P2 — Should resolve, lower urgency

**REC-13 — Consolidate obligations into one canonical document (W-8, T-6).**
**REC-14 — Write a landscape and differentiation note (W-6).** One page: what exists, what overlaps, what this product does that they structurally cannot. It should be uncomfortable to write.
**REC-15 — Resolve C-3, C-4, C-9, C-10, C-11, C-12** with targeted edits — each is a sentence or two.
**REC-16 — Decide the business model (M-9) and the measurement model (M-10).**
**REC-17 — Reconsider the "stranger-grade seams" lock (R-ARCH-3).** Subtraction applies to architecture too.
**REC-18 — Add ground-cost and disk-budget rules (R-SCALE-1).**
**REC-19 — Revisit whether Workflow G should be fully deferred (T-7).** A minimal arrival path may be worth including precisely because it validates the expensive sync-readiness machinery the MVP is already paying for.

---

## 13. Additional Documents Required

**Required before implementation:**

| # | Document | Why it must exist | Owner |
|---|---|---|---|
| 1 | `25_SUMMARIZATION_SPEC.md` | The product's core mechanism, currently one table row. (REC-2) | Founder + eng |
| 2 | `26_ASSISTANT_INTEGRATION_SPEC.md` | Resolves the two-surface/terminal contradiction and the quiescence heuristic that gates the neutrality proof. (REC-3) | Eng |
| 3 | `15_VOCABULARY_AND_VOICE.md` | The product *is* sentences; two authors must sound like one; an existing acceptance criterion has nothing to audit against. (REC-6) | Founder |
| 4 | `27_EVENT_AND_REASON_SCHEMA.md` | Permanent by construction; currently scheduled to be invented accidentally. (REC-9) | Eng |
| 5 | `05_PARAMETERS.md` | Every number in one place with rationale. (REC-5) | Both |
| 6 | `00_DECISIONS_LOG.md` | What was decided, when, why, and what would reopen it — including rejections. (REC-12) | Founder |

**Required before the Shell is implemented (not before the decision to build):**

| # | Document | Why |
|---|---|---|
| 7 | `35_VISUAL_DESIGN_SPEC.md` | The design system deliberately selects no colors, type, or values (§0). Something must, and it should be derived from §9–§12 rather than improvised. |
| 8 | `36_VERB_INVENTORY.md` | (REC-10.) Could be a section of #7. |

**Recommended, not required:**

| # | Document | Why |
|---|---|---|
| 9 | `01_LANDSCAPE.md` | (REC-14.) One page. Uncomfortable and useful. |
| 10 | `02_BUSINESS_MODEL.md` | (M-9.) Every conventional lever is constitutionally banned; better to know now. |

**Documents that should be consolidated, not added:** the four upstream-obligation tables → one canonical `00_OBLIGATIONS.md` (REC-13).

**Documents that are unnecessary:** a separate PRD (the MVP spec is one), a roadmap beyond the MVP (premature), user personas (the psychology section covers it better than a persona document would), and a formal technical design document per component — the architecture is correctly pitched above that level and should stay there.

---

## 14. Recommended Order of Work

The ordering matters more than the list, because several items are empirical and continuing to write will only produce more confident prose about unmeasured things.

**Stage 0 — Founder decisions (days, not weeks).**
REC-1 (`Done` vs `shipped`), M-4 (platform), M-5 (adapters + VCS), REC-4 (blocked-agent silence), M-9 (business model). These five gate everything and require judgment, not investigation.

**Stage 1 — Disposable technical probes (~3 weeks).**
Explicitly throwaway code, in a scratch repository, never merged. Not implementation — measurement. Five questions:

1. **Summarization quality.** Feed real agent transcripts and diffs to the candidate engines (local model, remote model, templates). Can any produce the promised sentence honestly? What does it cost in latency and memory? Answers REC-2.
2. **Quiescence.** Instrument three real agent sessions. What does file-system activity actually look like during thinking, testing, and blocking-on-permission? Is a reliable heuristic possible at all? Answers REC-3 and gates MVP §11.2.
3. **Ground cost.** Prepare 10 worktrees on a large real repository. Measure time, disk, and watcher count. Answers C-3 and R-SCALE-1/2.
4. **Overlap precision.** Replay a week of real parallel work. How many overlaps would have been declared, and how many were real? Answers REC-8.
5. **The terminal question.** Prototype both handoff models far enough to feel the difference. Answers C-6/REC-3 — and this one must be *felt*, not reasoned about.

Nothing in Stage 1 survives. Its only output is findings.

**Stage 2 — Specification amendments (~2 weeks), in this order.**
REC-2 and REC-3 (now grounded in Stage 1 findings) → REC-5 (numbers) → REC-6 (vocabulary) → REC-9 (schema) → REC-7 and REC-8 (design amendments) → REC-10, REC-11 → REC-12 (status markers and decisions log applied across the corpus) → REC-15 (targeted contradiction fixes).

**Stage 3 — Re-run all four acceptance tests against the amended corpus (~2 days).**
Workflow §4, Architecture §20, Design §19, and the constitution's principle-citation rule, applied to every amendment. If an amendment fails its own test, it does not land. This is the step that keeps the corpus a system rather than a pile.

**Stage 4 — Visual design derivation (parallel with early implementation).**
Documents 7 and 8.

**Stage 5 — Implementation, Core first.**
Core and the event log before the Shell, and before any adapter. The Shell is disposable by design (Arch §1.2) — build the thing that is not.

Total pre-implementation: **five to six weeks**, of which three are measurement rather than writing. I would resist any plan that spends those weeks writing instead.

---

## 15. Final Readiness Score

**62 / 100.**

| Dimension | Score | Note |
|---|---|---|
| Product philosophy and positioning | 92 | Exceptional. Coherent, defensible, and genuinely constraining. Loses points only for absent prior-art positioning and no evidence base. |
| Workflow specification | 78 | Well-formed and complete within its own frame. Loses points for C-1 (`Done` ≠ shipped), C-5/C-10, and the undefined lifecycle of `Done` efforts. |
| System architecture | 64 | Excellent structure; the three hardest components are unspecified, one security claim is false, and several performance guarantees are unbacked. |
| UI design system | 74 | Rigorous and unusually well-reasoned. Loses points for the missing compression ladder, intra-rank ordering, and the absence of any discoverability mechanism. |
| MVP definition | 55 | Scope discipline is good; acceptance criteria depend on mechanisms that do not yet exist, and several are untestable as written. |
| Implementation readiness | 35 | No schema, no parameters, no vocabulary standard, no verb inventory, no visual system. An engineer starting Monday would be inventing permanent decisions by Wednesday. |

The gap between the philosophy score and the readiness score is the whole finding of this review. This is not a specification that needs to be rethought. It is a specification that needs to be *finished* — and the unfinished parts are the expensive ones, which is exactly why they were left for last.

---

## 16. Go / No-Go Recommendation

### **CONDITIONAL GO.**

**No-go** for product implementation today. Starting now means the Summarizer gets invented by whoever writes it first, the event schema gets frozen by accident, the numbers get chosen by defaults, and the terminal question gets answered by whatever was easiest in week two. In a product whose log history is *never rewritten* and whose grammar is *closed*, early accidental decisions are permanent ones. This specification's own values argue against starting.

**Go** for Stage 0 + Stage 1 immediately — founder decisions plus three weeks of explicitly disposable measurement. This is not a delay tactic. Five of the largest open questions cannot be resolved by writing, and the specification's most likely failure mode from here is producing another 2,000 beautifully-written lines about things nobody has measured. The probes are cheap, the findings are decisive, and two of them (summarization quality, quiescence reliability) could plausibly falsify the MVP's core promise — which is worth knowing in week three rather than month nine.

**The one thing that would change this to a full No-Go:** if Stage 1 finds that no summarization approach can produce honest, useful one-sentence accounts within the local-only constraint, then the constitution has to change or the product does. That is a founding-level decision, and it should be made with data.

**The one thing that would change this to a full Go:** completion of REC-1 through REC-6 and REC-9. Those seven items are the difference between a specification and a buildable one.

### What I am protecting

For the avoidance of doubt, none of the above asks for a rewrite. The four documents should survive this review substantially intact. Specifically, I would defend against change: the closed grammar, the vocabulary gradient, the unrepresentable machine `Done`, observation-as-universal-path, the single failure shape, the acceptance tests, "growth ships at depth," and the prose voice of all four documents. Every recommendation here is additive or corrective. The instinct to subtract is correct and should be applied to the *architecture's* speculative generality (REC-17) long before it is applied to the product's philosophy.

The specification's own closing line is the right test for everything above, and I would apply it to this report too:

> When in doubt, we subtract.

Of the nineteen recommendations here, the six in P0 are the ones I would fight for. The rest I would trade.

---

*End of report. No specification text has been modified. Awaiting agreement on findings before proposing any amendment.*
