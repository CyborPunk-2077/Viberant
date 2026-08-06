# STATUS

*What is done and what is left, in plain language. Updated every session.*

**Last updated:** 6 August 2026
**Tests:** 200 passing on Windows — 107 in the core, 93 in the app
**What it is now:** a manager for one project across every AI app, every terminal, GitHub, the world, and your other computers.

---

## Run it

Three ways, in order of how much you have to know:

**Installed.** Run the installer in `dist/`. It puts Viberant in your Start menu and on your desktop. Nothing else is needed on the computer — no Node, nothing to set up. *(The installer in `dist/` is from the previous session and predates everything below. Build a new one with `npm run build`.)*

**Double-click.** `start.bat`, in this folder. It starts the manager and opens your browser at it. Closing the window stops it. Needs Node 22 or newer.

**From a terminal.** `node app/server.mjs`, then open `http://localhost:7777`. What it always was.

To have it start with Windows: run `make-shortcut.ps1`, then press Win+R, type `shell:startup`, and drop `Viberant.lnk` in the folder that opens.

---

## What works

It opens with the name of the thing, once, for under two seconds, and then it never moves on its own again. After that there are six places, and the number keys 1 to 6 go straight to them.

**Projects.** Every project is a card: what is unsaved, when you last saved, whether it has a copy on GitHub, and where you have got to with it — *working on it*, *waiting*, *finished*, which only you ever set. "What is in it" opens the full picture without leaving the list. You pick a folder by clicking down to it, or by using the folder chooser Windows already has; folders that look like projects are pointed out as you go. **Nobody types a path any more.** You can also bring one down from GitHub without leaving.

**AI apps.** Claude Code, Codex, Gemini, Copilot, OpenCode, Aider, Cursor, Windsurf, Antigravity, VS Code and Zed. Each one is offered by the ways it actually has on *this* computer — a window of its own, a terminal, or both — and you choose which. The ones that are not installed are listed as not installed rather than quietly missing. Nothing is ever marked as the one you should use.

**Terminals, in their own place.** Command Prompt, Windows PowerShell, PowerShell 7, Windows Terminal, Git Bash and WSL. All of them open already inside your project. None of them appears in the list of AI apps, and a test fails if that ever changes.

**Accounts.** Sign in to anything from one page. GitHub sign-in opens the real sign-in and comes back knowing who you are; you can hold several GitHub accounts and move between them. Every AI app has a sign-in button, always, whether or not you have ever signed in — and underneath it, the accounts you have kept, with switching. For the apps that keep their account in a folder we can hold, more than one account works the way it always did: nothing is replaced without being kept first, and nothing is swapped underneath a running app. Your name on saved work is set here too, in two boxes, instead of appearing as a refusal the first time you save.

**Save and send, and everything behind it.** One button most days. Behind "More" is everything else, each with a sentence saying what it does and what it costs: save here only, get the latest from your other computers, make a copy on GitHub, let anyone see it or make it private again, take back the last save, see what changed, see everything you have saved, open it on GitHub. Anything that is not possible right now is visibly not possible rather than failing when you press it.

**Putting it out into the world, in two halves.** A website goes to GitHub Pages, Vercel or Netlify — whichever you actually have, with the ones you are not signed in to saying so. An application is built with the project's own build step and handed out under a version number, with the installable files found and measured first. Both run in the open: named steps, and every line the build printed, kept.

**Your other computers.** Join once and a private project called `viberant-workspace` appears on your own GitHub account. Every computer signed in to that account shows up here — its name, whether it is about right now, what it is working on. You can offer projects from this computer, see what the others are offering (labelled with which computer each came from), bring one down, and leave notes for each other. **There is no server anywhere.** Each computer writes only its own files into that workspace, which is why two of them can be doing this at the same moment and never collide.

**It notices when the folder changes underneath it.** Work in another app, come back, and the picture is already right.

**A record of what happened.** Everything is written to a plain text file in `%USERPROFILE%\.viberant`, one line at a time. You can open it in Notepad. Delete the folder and it is as if this never ran.

---

## What is left

**The workspace has never been joined for real.** The whole mechanism is tested end to end with two computers and a plain folder standing in for GitHub — including both of them writing at once, a half-written file, and one computer leaving. What has not happened is the first press of Join on your actual account, which makes the real project on GitHub. That is one press and it should work; it is listed here because nobody has done it.

**Signing in to an AI app has not been checked against a real provider.** The manager opens a terminal and runs that app's own sign-in. Whether the app then ends up signed in exactly as it would have otherwise is believed, not verified. Same family of unknown as account switching, which is still untried against real Claude Code or Codex — **try that one with a throwaway account before you trust it.**

**Putting things out has been tested up to the point where it would leave this computer.** What is offered, what is missing, what builds, what came out of the build — all tested. The last step of each, the one that actually reaches Vercel or makes a release, has not been run because running it means putting something real into the world.

**Nothing prunes the shared workspace.** Being present writes a small save every two minutes. Left running for a year that is a lot of saves in a project nobody reads. It needs a tidy-up, and does not have one.

**Still no icon of its own.** It wears Electron's default, which looks like someone else's app. That needs a drawing, not code.

**No custom apps yet.** The list is fixed. Adding your own — anything with a command — is small and worth doing.

**It does not know your accounts are running low.** Nothing tracks usage, so it cannot tell you which account has room left.

---

## Things I built earlier that are still sitting quietly underneath

These work and are tested, but the app does not lean on them yet.

**Running assistants in their own private copy of your project** so several can work at once without touching each other. This was the heart of the earlier design. It is intact and may matter again later; for now the manager opens apps in the real folder, which is what you asked for.

**Writing one honest sentence about what changed**, by borrowing whichever assistant you already have and checking what it says before showing you.

---

## Measured, not guessed

**Giving each effort its own copy of a project costs about the full size of that project.** A big project with dependencies is over a gigabyte each time.

**Telling "still working" from "stopped and waiting" takes three minutes.** Guessing faster means interrupting you for nothing several times an hour.

**Being a real window costs 95 MB to download and 347 MB on disk.** Twenty times what the earlier plan would have cost, and worth it. The whole argument is `00_DECISIONS.md`, D-24.

**Two things broke on Windows for the same reason, in two different files.** A folder with a space in its name is handed to a shell as half a path. It broke launching apps once, and it broke the build runner the same way months later. Both are fixed and both now carry their own quotes.

---

## The one thing I still need from you

**Use it for a week and tell me where it annoys you.** What is left is the part no test reaches: whether you stop reaching for your old workflow.

Three things to press first, because they are the ones nobody has pressed: **Join**, on My computers — it makes the workspace on your account. **Sign in**, on any AI app. And **switching accounts**, which has still never been tried against real Claude Code or Codex.
