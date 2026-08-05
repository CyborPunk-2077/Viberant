# Core

The domain: efforts, states, verdicts, and the log that records them.

This directory holds two things.

**`schema/`** — the permanent event format. Architecture §19.3 promises that log history is never rewritten, which makes this the one part of the product that can never be changed once it ships. It is written down separately from any implementation because it will outlive every implementation.

**`reference/`** — an executable specification, in dependency-free JavaScript. It is *not* the product. The product's core is Rust (decision D-6). This exists so that the schema, the state machine, and the merge semantics can be proven coherent and then held to a conformance suite that any implementation must pass. When the Rust core is written, it is correct when it passes these same tests.

Run it:

```
cd reference && npm test
```

---

## The event format, in one page

Every line of a log file is one event. Every event carries the same seven fields, plus whatever that kind of event needs.

| Field | Meaning |
|---|---|
| `v` | Schema version. `1`. |
| `id` | A ULID. Globally unique without coordination, sortable by creation time. |
| `at` | `{wall, counter}` — a hybrid logical clock reading. |
| `machine` | Which machine this originated on. |
| `actor` | `developer` \| `assistant` \| `world` \| `system`. |
| `project` | Which project's log this belongs to. |
| `type` | What happened. |
| `causedBy` | The event that caused this one, or `null`. |

`actor` and `causedBy` are the traceability guarantee made mechanical. From any change to the developer's work you can walk backwards to the human sentence that caused it.

### Why a hybrid logical clock

Two machines' clocks disagree. If events were ordered by plain timestamps, an event could sort before the event that caused it, and replay would produce different answers on different machines. If they were ordered by a plain counter, the log would lose all relationship to real time and a human could not read it. A hybrid clock keeps causality *and* stays close to wall-clock time. Its cost is two numbers per event.

The total order for replay is `(at.wall, at.counter, machine)`. The machine tiebreak is what guarantees two machines folding the same events reach identical state.

### Why this makes synchronisation nearly free

Truth is a fold over the log. Merging two machines is therefore: concatenate, drop duplicates by `id`, fold. There is no merge algorithm, no conflict resolution pass, and no reconciliation of divergent snapshots — those problems only exist for systems that store current state. This is the entire reason an event log was chosen, and `src/store.mjs` is under 200 lines because of it.

Proven in `test/sync.test.mjs`: two machines, work on both, byte-identical truth at the end, no server anywhere.

### Why the store is a text file

Architecture §11.1 requires the authoritative store to be inspectable and documented. A file the developer can open in any editor is the least hostage-taking format there is. It also means the local store and the copy that travels between machines are the same format — one thing to get right instead of two.

A crash mid-append leaves a torn final line, which the reader skips. The event was never acknowledged, so no developer intent is lost. That is the whole durability story.

---

## The state machine

Three visible states, one invisible terminal one.

```
                    ┌──────── redirect ────────┐
                    ▼                          │
  (nothing) ──delegate──▶ MOVING ──stopped──▶ WAITING ON YOU
      │                     │                   │
      └──park──▶ WAITING    │                   │
                            └─── accept ────────┤
                                                ▼
                                              DONE ──reopen──▶ MOVING
                                                │
   any state ──abandon──▶ DISSOLVED             └──reverse──▶ WAITING
                              │
                              └──restore──▶ (whatever it was)
```

Two properties are enforced, not merely intended:

**No machine can settle work.** A transition into `done` or `dissolved` is refused unless the causing event was authored by the developer. In the reference implementation this is a guard plus a test that tries *every* machine-authored path through the table and fails if any one succeeds. In the Rust core it will be a type. Verdicts can only be minted through a `Developer` object, which nothing in the assistant or filesystem layers is ever handed — so the guarantee holds by what code can reach what, not by a check someone might forget.

**Every arrival in `waiting` carries a reason.** The reason is a `{kind, sentence, action}` record, validated at construction. Failure-shaped reasons cannot be built without a suggested action. The one failure shape is a schema requirement, not a UI convention.

### Reason kinds, in the order Home shows them

The design system said rank-1 items are "led by their reasons" but never said in what order, which left the product's most important surface undefined. The order is cost of delay — how much is lost by not looking at this for an hour.

| Order | Kind | Why here |
|---|---|---|
| 1 | `question` | A machine is idle waiting on one word from you. |
| 2 | `overlap` | Two efforts are diverging further every minute. |
| 3 | `failed` | Work stopped, but nothing degrades further. |
| 4 | `review_ready` | Work is complete and safe; only your time is at stake. |
| 5 | `unknown` | We lost sight of this and cannot say what is true. |
| 6 | `parked` | You chose this. |

---

## The vocabulary contract is running code

`src/lexicon.mjs` refuses version-control terms, shouting, machine error text, and sentences that lead with a file count instead of a meaning. Every summary and every reason passes through it before it can enter the log.

This became necessary when summaries became machine-generated (decision D-4). A rule people are expected to remember is not a rule when nobody writes the text. It also gives MVP release criterion 11.8 — "a full-product vocabulary audit finds zero version-control terms" — something to audit against automatically, from the first commit rather than the last week.
