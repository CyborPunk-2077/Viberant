# Can we tell when an assistant has stopped?

*Experiment run 5 August 2026. Reproduce with `node experiments/quiescence/run.mjs`.*

This was the largest unmeasured risk in the project. Everything about working with tools we have never seen rests on inferring "it stopped" from watching files. If that inference is unreliable, the product promises something it cannot deliver.

**It is reliable, at a price, and the price is three minutes.**

---

## What was measured

400 simulated sessions per setting, deterministic seeds. Sessions are built from realistic phases — bursts of editing, pauses while the model thinks, long quiet stretches while tests run — and end one of three ways: the assistant finishes, it dies, or it stops to ask a question and waits.

Two detectors: one that can only see files change (a tool we never launched), and one that also knows when the process ends (a tool we launched ourselves).

The number that matters is **false alarms** — telling the developer an effort needs them while the assistant is in fact still working. Every one of those is precisely the anxiety this product exists to remove, so the bar is deliberately harsh.

## What came back

| Silence before we call it stopped | False alarms per session | Wait before an idle assistant appears |
|---:|---:|---:|
| 30 s | 8.78 | 30 s |
| 60 s | 1.09 | 50 s |
| 90 s | 0.30 | 80 s |
| **180 s** | **0.01** | **169 s** |
| 300 s | 0.00 | 289 s |

## The four findings

**1. Short thresholds are unusable, and it is not close.** At 30 seconds we would interrupt the developer nearly nine times per session for nothing. Assistants pause to think, and thinking is indistinguishable from stopping. Any design that assumed near-instant detection was wrong.

**2. Three minutes is the shortest silence worth trusting.** At 180 seconds false alarms fall to one per hundred sessions. Ninety seconds is tempting — you would find out twice as fast — but one false alarm every third session would teach the developer not to believe the picture, and the picture being believable is the entire product.

**3. Owning the assistant's process solves one ending completely and the other not at all.** For an assistant that finished or crashed, knowing when the process ends cuts the wait from 174 seconds to 1. For an assistant that stopped to ask you a question, it changes nothing — a process waiting for an answer has not ended, so there is nothing to observe. This is worth knowing before we spend weeks building process ownership expecting it to solve the harder case.

**4. There are three honest tiers, and the design already allows them.**

| | When it finishes | When it stops to ask |
|---|---|---|
| A tool we have taught the app about | instant | instant |
| A tool we launched ourselves | instant | ~3 min |
| A tool we have never seen | ~3 min | ~3 min |

The loop is identical in all three. Only how quickly the picture catches up differs — which is exactly the difference the architecture already describes as "richness of the account, never capability of the loop."

---

## What this changes

**A parameter is now set, not guessed.** Silence of 180 seconds means stopped. Recorded as decision D-21.

**The quiet marker outside the app matters more, not less.** Three minutes of an assistant sitting idle is fine if the developer can see it where they are already looking, and bad if it is buried in a window they have closed. This is the strongest argument yet for the taskbar presence indicator.

**Liveness and change are two different questions, and need two different scopes.** A test run may write only to build output and caches — nothing a developer would call a change. If we watched only source files we would call that silence and be wrong. So: watch the *entire* ground to decide whether anything is alive, and report only meaningful paths when saying what changed. Recorded as decision D-22.

---

## What this does not settle

**The simulator's numbers are assumptions, not observations.** They are drawn from how these tools observably behave, but nobody has recorded a real session. The experiment is built so that replacing the parameters changes the conclusion honestly rather than requiring a rewrite — which is the point of building it this way.

The assumption most likely to be wrong, and most consequential if it is: how long a test or build run can go without touching anything in the ground at all. If that can exceed three minutes, the threshold has to rise. Finding 4 above is the mitigation — watching everything makes long silent stretches much rarer.

**A patient-detector would do better.** If an effort has already paused for two minutes once and resumed, we should be slower to judge it the next time. That is a real improvement and it is deferred, not rejected: a fixed threshold that is honest beats an adaptive one that is clever and unproven.
