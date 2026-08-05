# STATUS

*The whole picture: what exists, what does not, and what stands between here and a product you open every morning. Updated at the end of every session.*

**Last updated:** 5 August 2026
**Tests:** 62 passing
**Target of v1:** you stop reaching for your old workflow.

---

## Where this stands, in one paragraph

The permanent half of the product is built and proven: the record of what happens, the rules about who may change what, the machinery that keeps efforts from colliding, and the ability to follow you between machines. None of it is visible yet. There is no window, no assistant is actually launched, and nothing summarises anything. What exists is the part that would be expensive to get wrong later; what is missing is the part that makes it feel like an application.

---

## Done

### Foundations — `core/reference/`

| Piece | What it does | Proven by |
|---|---|---|
| Identity and clock | Identifiers that never collide across machines without coordination; a clock that keeps causality when two machines disagree about the time | 4 tests |
| Event schema v1 | The permanent record format. Seven fields on every event; who caused it and what caused that, always | conformance suite |
| Vocabulary contract | Refuses version-control words, shouting, error text, and sentences that lead with a file count — as running code, not a style guide | 5 tests |
| Failure shape | One plain sentence plus one action, required by the schema. A failure reason that needs an action cannot be built without one | 4 tests |
| State machine | Three states, closed transition table. **No machine can settle work** — enforced by which code can reach a `Developer` object | 6 tests, including every machine-authored path through the table |
| Append-only store | Plain text, one event per line, openable in any editor. A crash mid-write loses nothing that was acknowledged | 3 tests |
| Multi-machine sync | Union the logs, replay, done. Two machines converge on byte-identical truth. No server exists anywhere in it | 6 tests |
| Workspace Engine | Isolated ground per effort; settling as one entry titled in your own words; letting go; the grace period; sending to the shared copy | 21 tests against real projects on real disk |
| The loop | Begin, delegate, leave, return, read, accept, send — end to end | 2 tests |

### Decisions and measurement

- 20 decisions recorded with reasoning and alternatives (`00_DECISIONS.md`)
- Design review of the original specification: 12 contradictions, 12 ambiguities, 12 missing decisions (`DESIGN_REVIEW_REPORT.md`)
- Ground cost measured, not guessed: **0.15 ms per file, and 100% of the project's size per effort.** A monorepo with dependencies costs ~22 seconds and 1.5 GB per effort. This changed the design — ground is now prepared at first delegation, never at creation

### Things that were cut, deliberately

Overlap detection · partial judgement · reversing settled work · pre-organised evidence rendering · full assistive-technology support *(this one is a debt, not a decision — it returns before anyone outside sees this)*

---

## Not done

Ordered by what stands between here and you opening it every morning.

### 1. Nothing launches an assistant yet — **the biggest gap**

The Engine prepares ground and the record knows an effort was delegated, but no code starts Claude Code, Codex, or anything else. Until this exists there is no product, only bookkeeping.

Needs: launching a tool in an effort's ground with the intent carried in; noticing when it stops; capturing what it did so the next tool starts warm.

**Unresolved inside this:** whether we own the assistant's process or hand off to your terminal. Owning it gives us a much better picture of what happened but needs somewhere to show an interactive session — and the design allows only two surfaces. I will prototype both and let the feel decide.

### 2. Nothing knows when an assistant has finished — **the biggest risk**

Everything about working with any tool rests on inferring "it stopped" from watching files. Thinking, running tests, and waiting-for-permission may be indistinguishable from outside. Nobody has measured this.

**This needs ten minutes of your time.** I will write a small recorder; you run it while working normally; it tells us whether this is achievable or whether the promise needs rethinking.

### 3. No summaries

Forty actions still read as forty actions. The decision is made — borrow whichever assistant you already have — but nothing calls it, and the prompt, the quality bar, and how an uncertain summary admits it are all unwritten.

### 4. No window

No Home, no effort view, no palette, no keyboard shortcuts, no taskbar presence. Nothing to look at.

### 5. Nothing watches your machine

No project discovery, no noticing when you change files yourself, no honest staleness when we lose track.

### 6. Nothing is in Rust yet

The core is specified and proven in JavaScript as an executable definition of correctness. The real core is Rust behind a Tauri window (decision D-6). That transcription has not started, and it is correct when it passes the 62 tests that exist.

### 7. It does not run on Windows yet

Everything so far was proven on Linux. Windows will be slower — antivirus scans every file written into an effort's ground — and paths are longer and more fragile. Unmeasured.

---

## Open questions

| | Question | Who | Blocking? |
|---|---|---|---|
| **R-1** | **Where do your repositories actually live?** If they are inside WSL rather than on a Windows drive, the current scope excludes them — and Windows-first was chosen so you could use this daily. This one contradiction could undo two decisions | You | **Ask now** |
| O-2 | Can we reliably tell when an assistant has finished? | Me, with 10 min of yours | Gates gap 1 and 2 |
| O-3 | What makes a summary good enough, and how does an uncertain one say so? | Both | Gates gap 3 |
| O-1 | How much disk is too much, and what do we say when it is? | Me | Before real use |
| O-7 | Grace period length; how long settled efforts stay on Home; when we call the picture stale | Both | Before real use |
| O-8 | Business model. Untouched. Every conventional route is closed by the constitution | You | Not blocking |

---

## What I would do next, in order

1. **Ask you where your repositories live.** Cheapest possible action; could invalidate two decisions.
2. **The quiescence recorder.** Ten minutes of your time, and it answers the largest unknown in the project. If it fails, better now than in month six.
3. **Launch an assistant for real.** Take one effort from your own work, all the way through, with Claude Code actually running. The first moment this stops being a specification.
4. **A window, however plain.** Home, listing your real efforts, in rank order. Ugly is fine; the point is to look at your own work in it and see whether the glance works.
5. **Summaries.**

Nothing before step 3 makes you want to open this. Everything before step 3 makes step 3 possible without regret.
