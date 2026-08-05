# Viberant

The place you open before you start working.

It holds what you are building, what each AI assistant is doing, what changed while you were away, and what needs you — without making you think about version control, terminals, or which conversation was in which window.

---

## Try it

You need Node 22 or newer. Nothing else, and nothing to install.

```
node app/server.mjs  C:\path\to\one\of\your\projects
```

Then open `http://localhost:7777`.

Everything it records goes in `~/.viberant`. Delete that folder and it is as if this never ran. Your project is never touched except when you accept work.

### Keys

| | |
|---|---|
| `n` | begin an effort — type what needs doing, press enter |
| `shift+enter` | ...or set it aside instead of starting it now |
| `↑ ↓` | move between efforts |
| `d` | send the current one to an assistant |
| `a` | accept it |
| `r` | send it back with new direction |
| `x` | let it go |
| `esc` | dismiss whatever you are typing |

---

## What is in here

```
app/          the thing you run — a local server and one page
core/         the domain: efforts, states, verdicts, and the record of them
experiments/  questions we answered by measuring rather than arguing
VIBE.txt      the original specification
00_DECISIONS.md   every decision, why it was made, what else was considered
STATUS.md     what is done and what is left
DESIGN_REVIEW_REPORT.md   the review the specification was put through
```

Run everything:

```
node --test "core/reference/test/*.test.mjs"
node --test "app/test/app.test.mjs"
```

---

## How it works, briefly

**An effort** is something you want done, in your own words. It is always in exactly one of three states: moving, waiting on you, or done.

**Each effort works in its own copy of your project**, so several assistants can run at once without touching each other's work, and letting one go costs nothing — your project was never involved.

**Accepting an effort** puts its work into your project as a single entry, titled with the sentence you originally typed. Forty machine steps become one line a person wrote.

**Everything that happens is written to a plain text file**, one line at a time, in `~/.viberant`. You can open it in any editor. Because it is a list of what happened rather than a picture of how things are now, two machines can be brought together by simply putting their files side by side — which is how this follows you between computers with no server anywhere.

**Nothing interrupts you.** There is no notification anywhere in it. You find things out by looking.
