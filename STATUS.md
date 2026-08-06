# STATUS

*What is done and what is left, in plain language. Updated every session.*

**Last updated:** 6 August 2026
**Tests:** 233 passing on Windows — 107 in the core, 126 in the app
**What it is now:** a manager for one project across every AI app, every terminal, GitHub, the world, and every computer you own.

---

## Run it

**Installed.** Run the installer in `dist/` — 87 MB to download, 302 MB installed, and it carries everything it needs, so a computer with no Node still runs it. This is the one to put on your other devices. The code is at github.com/rSlashGIT/Viberant (private).

**Double-click.** `start.bat`. Starts the manager and opens your browser at it. Needs Node 22 or newer.

**From a terminal.** `node app/server.mjs`, then `http://localhost:7777`.

To start it with Windows: run `make-shortcut.ps1`, press Win+R, type `shell:startup`, drop `Viberant.lnk` in the folder that opens.

---

## What works

Six places, and the number keys 1 to 6 go straight to them. Your GitHub account sits in the bottom-left corner, always, with switching and signing in behind it.

**Projects.** A stack, newest on top, one per line. Each carries the four things worth knowing at a glance: what state it is in, when you last stopped, **what you were doing when you stopped**, and where it is — plus what kind of project it is and whether it has a copy on GitHub. Mark one working on it, waiting or finished; that is yours to set and the manager never touches it. Any project can be kept private to this computer in one press. Folders are chosen by clicking down to them or with the Windows folder chooser. **Nothing is typed.**

**AI apps.** Eleven of them, each offered by the ways it actually opens on this computer. Some open a window through a file; some open one through their own command — `codex app` takes the folder and even fetches the window if it is missing, and OpenCode serves its own page. Claude Code's window is a separate download, so its Open button says so and offers the page. Apps you do not have are listed with a link to their own install guide. One "Start in" for the page rather than a folder on every card.

**Accounts, where you use them.** No separate accounts page. Each app's card has its own account control: the services it signs in with along the top, the accounts kept on this computer below. Pick one, press Open, and it opens as that account. The old promise still holds underneath — nothing is replaced without being kept first, and nothing is swapped underneath a running app.

**Terminals, in their own place.** Command Prompt, Windows PowerShell, PowerShell 7, Windows Terminal, Git Bash and WSL. A test fails if a terminal ever appears among the AI apps.

**One "Start in" per page.** Everything on the Apps and Terminals pages opens in the folder named at the top, which is the project you have open unless you pick another.

**Save and send, and everything behind it.** One button most days. Behind More: save here only, get the latest, make a copy on GitHub, let anyone see it, take back the last save, see what changed, open it on GitHub, and let this computer send to GitHub. Anything not possible right now is visibly not possible.

**Deploy, in two halves.** A website to GitHub Pages, Vercel or Netlify — whichever you actually have. An application built with the project's own build step and handed out under a version. Both in the open, with every line the build printed.

**Shared workspace.** Joined and working on this computer. A private project called `viberant-workspace` on your own GitHub account is the meeting point: every computer signed in to that account appears here, with what it is working on and whether it is about. You can leave notes between computers.

**Folders move across your own network, never through the cloud.** GitHub says which computers are yours — joining puts one random key in that private project, and holding it is the proof. The files themselves go straight from one computer to the other over the local network. One computer offers a folder; the other sees it, picks where it goes, and asks for it. **Nothing arrives without being asked for**, and a transfer cut off half way leaves nothing that looks finished.

**Settings.** Eight of them, and a rule keeping the list short: nothing here changes what the manager tells you is true, only how it behaves while telling you.

**Pick up where you left off.** What you have open in a project is one card per app, however many times you opened it. Press one and that app opens again *carrying on the conversation you were having* — Claude Code, Codex and OpenCode each have their own word for it and the manager knows which. Apps with no such word open fresh and say so.

**It notices when a folder changes underneath it.**

---

## What was found by pressing the buttons

Three real faults, all of which would have hit you first:

**The folder chooser opened behind everything.** It used the older Windows folder browser, which has no owner window and starts at Desktop with no way up to the drives. Replaced with the shell's own browser, rooted at This PC and given the front window as its owner. Verified opening.

**Joining the shared workspace reported success and had sent nothing.** Being signed in to the GitHub helper does not let *saving* reach GitHub — they keep separate credentials, and on this computer git was using the Windows credential store, which had never been told about GitHub. Every send came back "Repository not found", which reads like the project does not exist. The non-obvious part, which took a real attempt to find: **credential helpers are a list, not a setting** — adding ours to the end changed nothing because what was already there was asked first and won. Fixed for folders the manager makes; the global fix is a button with a sentence on it. Full detail in D-42.

**A transfer cut off half way threw instead of answering.** Found by a test, fixed, and now leaves nothing behind that looks like a finished project.

---

## What is left

**The other device.** The code is now on GitHub and the installer is built. Everything on this computer is verified — the workspace is joined, the key is in place, this machine is findable, offering and taking a folder are proved end to end against the real network code. What has not happened is a **second** computer. That is the next thing to do and it needs the installer, not more code.

**Signing in to an AI app has not been checked against a real provider.** The manager opens a terminal and runs that app's own sign-in. Whether the app then ends up signed in exactly as it would have otherwise is believed, not verified. Same family of unknown as account switching, which is still untried against real Claude Code or Codex — **try that with a throwaway account before you trust it.**

**The last step of a deploy has never run.** What is offered, what is missing, what builds, what came out — all tested. The step that actually reaches Vercel or cuts a release has not, because running it means putting something real into the world.

**Nothing prunes the shared workspace.** Being about writes a small save every two minutes. Left running for a year that is a lot of saves in a project nobody reads.

**Still no icon of its own.** It wears Electron's default. That needs a drawing, not code.

**It does not know your accounts are running low.** Nothing tracks usage.

---

## Measured, not guessed

**Giving each effort its own copy of a project costs about the full size of that project.** Over a gigabyte for a large one.

**Telling "still working" from "stopped and waiting" takes three minutes.**

**Being a real window costs 95 MB to download and 347 MB on disk.** The argument is D-24.

**A program says whether it is a window or a terminal thing, and has since 1993.** Fifteen lines reads it. Every Claude, Codex and OpenCode executable on this computer is a console program.

**And that answered the wrong question.** Reading their own help showed Codex ships `codex app`, which opens its window at a folder and fetches it if missing, and OpenCode ships `opencode web`. Checking what is *installed* is not the same as checking what an app *can do* — the first was measured carefully and confidently produced the wrong answer to the second.

**A CSS selector that matches nothing fails silently and looks like a layout bug.** The corner menu ran off two edges of the screen because it was styled with `.who .panel`, and the panel is that button's sibling rather than its child.

**A convenience that infers intent from the shape of its arguments will eventually infer it wrongly.** One function decided whether it was asking or instructing by whether you passed it anything, so every button with nothing to say asked a question where it meant to give an order — and did nothing, silently. Now two functions, and a test that reads the page and the server and checks every address exists by the verb the page uses.

**The same Windows trap has now been hit three times in three files:** a folder with a space in its name, handed to a shell, arrives as half a path. Launching, then the build runner, then the parcel of arguments to a release. All three fixed, all three commented.

---

## The one thing I still need from you

**Put the installer on the second device and press Join.** That is the only untested half of the thing you asked for, and no test here can reach it.

After that: use it for a week and tell me where it annoys you.
