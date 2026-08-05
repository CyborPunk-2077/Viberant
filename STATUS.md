# STATUS

*What is done and what is left, in plain language. Updated every session.*

**Last updated:** 6 August 2026
**Tests:** 141 passing
**What it is now:** a manager for opening one project across several AI apps.

---

## Run it

```
node app/server.mjs
```

Open `http://localhost:7777`. Node 22 or newer, nothing to install.

---

## What works

**Picking a project.** Type a folder path, or point it at the folder that holds all your projects and it finds them. It remembers the ones you use, so next time is one click. Each one shows in plain words where it stands — how many files changed since you last saved, whether anything is waiting to be sent.

**Starting any AI app in that project.** It looks for Claude Code, Codex, Gemini, Aider, Cursor, Windsurf, Antigravity and VS Code, and offers whichever are installed. Command-line ones open a terminal already in the folder. Desktop ones open with the folder loaded. **You never add the folder by hand again.** It has no favourite among them and never suggests one.

**More than one account per app, switched without signing out.** Save the account you are signed in to under a name, then switch whenever. It swaps the folder each tool keeps your sign-in in — the same idea as browser profiles. It refuses to swap while that app is open, because that would sign you out mid-sentence. It refuses to throw away the account you are using. Nothing is ever replaced without being kept first.

**Save and send in one press.** Type what you did, press the button. It saves everything and sends it to GitHub, creating the copy on GitHub if there is none. If GitHub cannot be reached it still saves your work and tells you exactly that — it will never claim something is sent when it is not.

**A record of what happened.** Everything is written to a plain text file in `%USERPROFILE%\.viberant`, one line at a time. You can open it in Notepad. Delete the folder and it is as if this never ran.

---

## What is left

**It has never run on Windows.** Everything was tested on Linux. Windows will be slower because antivirus checks every file, long paths can break things, and the way terminals open is different code that has not been exercised. **This is the biggest unknown and only you can settle it** — run it and tell me what breaks.

**Account switching has never been tried on a real tool.** The mechanism works and is well tested, but against a made-up tool. Whether Claude Code and Codex actually keep everything they need in the folder we swap is unverified. If one of them also keeps something in the Windows credential store, switching will half-work. Needs one careful try with a throwaway account before you trust it.

**It runs in a browser tab, not a real window.** Making it a proper app you launch from the taskbar, and can put in startup, is a later step. It works fine as a tab in the meantime.

**It does not notice when you change the folder from inside an app.** You asked for this. Right now the page refreshes what it knows when you look at it, but it does not watch. Straightforward to add.

**No custom apps yet.** The list of AI apps is fixed. Adding your own — anything with a command — is small and worth doing.

**It does not know your accounts are running low.** Nothing tracks usage, so it cannot tell you which account has room left. That would take each provider's own reporting, which not all of them expose.

---

## Things I built earlier that are now sitting quietly underneath

These work and are tested, but the app does not lean on them yet. Worth knowing they are there rather than assuming we start from nothing.

**Following you between computers.** Because the record is a list of what happened rather than a picture of how things stand, two computers merge by putting their files side by side. Tested, no server involved. Not wired into the manager yet.

**Running assistants in their own private copy of your project** so several can work at once without touching each other, and throwing one away costs nothing. This was the heart of the earlier design. It is intact and may matter again later; for now the manager just opens apps in the real folder, which is what you asked for.

**Writing one honest sentence about what changed**, by borrowing whichever assistant you already have and checking what it says before showing you.

---

## Measured, not guessed

**Giving each effort its own copy of a project costs about the full size of that project.** A big project with dependencies is over a gigabyte each time.

**Telling "still working" from "stopped and waiting" takes three minutes.** Assistants pause to think, and thinking looks exactly like stopping. Guessing faster means interrupting you for nothing several times an hour.

---

## The one thing I still need from you

**Run it on Windows and tell me what breaks.** Everything above is untested on the machine it is for. That is the single largest risk in the project and one evening of yours removes it.

Also still unanswered from two sessions ago: **do your projects live on a normal Windows drive, or inside the Linux environment?** It changes what I build next.
