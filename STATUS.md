# STATUS

*The whole picture: what exists, what does not, and what stands between here and a product you open every morning. Updated at the end of every session.*

**Last updated:** 6 August 2026
**Tests:** 106 passing
**Target of v1:** you stop reaching for your old workflow.

---

## Where this stands, in one paragraph

Every part of the loop now exists in working, tested form except the window. An effort can be begun, given to a real assistant, watched, summarised, judged, settled as one entry in your own words, sent onward, and followed to another machine. The largest unknown in the project — whether we can tell a working assistant from a stopped one — has been measured rather than argued about, and the answer is yes, at a cost of three minutes. What remains is a window, a Rust core, and Windows.

---

## Done

### The domain — `core/reference/`

| Piece | What it does | Tests |
|---|---|---|
| Identity and clock | Identifiers that never collide across machines without coordination; a clock that keeps causality when two machines disagree about the time | 4 |
| Event schema v1 | The permanent record format. Who caused it and what caused that, on every event, always | — |
| Vocabulary contract | Refuses version-control words, shouting, error text, and sentences leading with a file count. Running code, not a style guide | 5 |
| Failure shape | One plain sentence plus one action, required by the schema | 4 |
| State machine | Three states, closed table. **No machine can settle work** — enforced by which code can reach a `Developer` object | 6 |
| Append-only store | Plain text, one event per line. A crash mid-write loses nothing acknowledged | 3 |
| Multi-machine sync | Union the logs, replay, done. Byte-identical truth on both machines, no server | 6 |
| Workspace Engine | Isolated ground; settling as one entry in your own words; letting go; grace; sending to the shared copy | 21 |
| Assistant Gateway | Launches real tools, watches their ground, normalises facts. Observation is the universal path; adapters only enrich it | 11 |
| Summarizer | Core owns the prompt and validates every sentence, so a borrowed assistant cannot make the product speak badly | 19 |
| Home projection | Rank order, compression above seven, time said the way a person says it | 14 |
| The loop | Begin, delegate, leave, return, read, accept, send — end to end | 2 |

### Measured, not guessed

**Ground costs 0.15 ms per file and 100% of the project's size, per effort.** A monorepo with dependencies is ~22 seconds and 1.5 GB each. This changed the design: ground is prepared at first delegation, never at creation, so parking an idea is free.

**Silence of 180 seconds means stopped.** Below that, false alarms make the picture untrustworthy. Owning the assistant's process makes *finishing* instant and does nothing at all for an assistant that stopped to ask you something — worth knowing before building process ownership expecting it to solve the harder case. Three honest tiers, identical loop in all of them. `experiments/quiescence/FINDINGS.md`.

### Decided

23 decisions recorded with reasoning and alternatives. The design review of the original specification stands: 12 contradictions, 12 ambiguities, 12 missing decisions, most now closed.

---

## Not done

### 1. There is no window

The only thing you cannot do yet is look at it. Home exists as a projection and renders as text; there is no Home you can open, no effort view, no palette, no keyboard shortcuts, no taskbar presence.

This is now the top of the list. Everything it needs already exists behind it.

### 2. Nothing is in Rust yet

The domain is specified and proven in dependency-free JavaScript as an executable definition of correctness. The real core is Rust behind a Tauri window. That transcription has not started, and it is correct when it passes the 106 tests that exist.

**Worth reconsidering:** the reference implementation is further along than expected and runs everywhere Node runs. Rewriting it in Rust buys compile-time guarantees and a smaller memory footprint; it costs weeks during which nothing improves for you. I lean towards shipping something you use daily first and transcribing after — but it is a real trade and I will put numbers on it before choosing.

### 3. It has never run on Windows

Everything was proven on Linux. Windows will be slower — antivirus scans every file written into an effort's ground — and paths are longer and more fragile. Unmeasured.

### 4. No project discovery

Nothing scans for your projects, notices when you change files yourself, or marks the picture stale when it loses track.

### 5. No real adapter

Claude Code, Codex and the rest currently work through observation alone, which the experiment shows costs three minutes of latency. A real adapter for the tool you use most makes that instant. Small, and high value for you specifically.

---

## Open questions

| | Question | Who | Blocking? |
|---|---|---|---|
| **R-1** | **Where do your repositories actually live?** If inside WSL rather than on a Windows drive, current scope excludes them — and Windows-first was chosen so you could use this daily. Asked twice now; it could undo two decisions | You | **Ask now** |
| ~~O-2~~ | ~~Can we tell when an assistant has finished?~~ **Closed.** Yes, at 180 seconds | — | Done |
| ~~O-6~~ | ~~Event schema~~ **Closed** | — | Done |
| O-3 | What makes a summary good enough? The machinery is built and validated; the quality bar needs a real assistant answering real prompts | Both | Before you rely on it |
| O-1 | How much disk is too much, and what do we say when it is? | Me | Before real use |
| O-7 | Grace period length; how long settled efforts stay on Home | Both | Before real use |
| O-8 | Business model. Untouched. Every conventional route is closed by the constitution | You | Not blocking |

---

## What I would do next, in order

1. **A window you can open.** Home, listing your real efforts, in rank order. Plain is fine — the point is to look at your own work in it and find out whether the glance works. Everything behind it is built.
2. **A real adapter for the assistant you use most**, so stopping is noticed instantly rather than in three minutes.
3. **Project discovery**, so it finds your work instead of being told about it.
4. **Run it on Windows and measure**, then decide about Rust with numbers rather than instinct.

The first item is now the only thing between you and using this.
