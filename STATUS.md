# STATUS

*What is done and what is left, in plain language. Updated every session.*

**Last updated:** 8 August 2026
**Tests:** 269 passing on Windows, and the new ones are the ones that matter:
a parcel that lies about its own size is caught, a folder that is empty on
purpose survives, and two transfers cannot fight over one folder.
**What it is now:** a manager for one project across every AI app, every terminal, GitHub, the world, and every computer you own.

## Viberant 2.0, so far

**The download was never the parcel.** Bringing a project from the Workspace
went through `gh repo clone`, which carries what has been saved and sent and
nothing else — so a 1.3 GB folder arrived as the committed fraction of it.
Measured over a real socket: a 58 MB folder comes through GitHub as **493
bytes**, and across the network **whole**. It now takes the network whenever the
other computer is reachable, and when it is not, it says what a copy from GitHub
carries before you agree to it. Every parcel check added last time could never
have caught this, because a clone is not a parcel. D-103.

**A folder that arrived never appeared in Projects.** `jobs.end` picked three
fields out of its result by name and dropped the rest, including where the thing
had landed — so the line that registers it was reading `undefined` and silently
doing nothing. D-104.

**The Offer button opened a menu and hid it in the same click**, because the
menu wore the class the dropdown-closer owns. D-105.


**The transfer is the part that had to be right, and it was not.** A folder now
arrives whole or does not arrive. Three numbers have to agree — what was
promised before anything moved, what the far end says it sent, what landed on
this disk — and any two of them agreeing proves nothing, because a sender that
skipped a folder tells itself a consistent story the whole way through. Empty
folders survive. The number on the card and the number that travels come from
one walk, taken at the moment of asking. A folder that cannot be read stops the
send rather than vanishing from it. D-96, D-97.

**Nothing is offered until somebody offers it.** Reversed from D-44 by reading
the other computer's screen, which listed two of Windows' own folders because
being in the projects list *was* the offer. Files can be offered now as well as
folders, into the same register, and that register is the only thing another
computer is ever told about. Stopping an offer is not deleting. D-98.

**Three complaints, one cause.** Every screen that could show a long errand
started another loop watching it, and nothing stopped the one already running —
so each redraw added a poller. That was the flashing, the constant refreshing,
and why it got worse the longer you used it. One owned timer now: two pending
after sixteen tab switches, against unbounded growth. D-99.

**Scrolling stays where you put it.** Nothing ever called `scrollTo`; replacing
the page empties the thing that scrolls, and the browser clamps you to the top.
Measured: parked at 2,190 of 3,801, still at 2,190 after a live update. D-100.

**Two transfers into one folder is refused** rather than allowed to fight over
the same half-finished folder. D-102.

---

**The look, rebuilt from tokens up.** Every screen is already drawn on it,
because they all share the same handful of classes:

*Done.* Tokens, and a rule that survives editing — a literal value in the
stylesheet is now visibly wrong (D-89). Lists are one panel with lines in them
rather than columns of floating cards (D-90). One accent, spent on four things,
with the violet-into-cyan gradient gone (D-91). A grouped rail and a shallow bar
across the work, keeping every place when the window narrows (D-93). Everything
by typing on `Ctrl K`, and nothing living only there (D-92). Tooltips, context
menus with the same items one visible press away (D-95), and a wait that shows
the shape of what is coming after a beat (D-94). Measured against the brief:
rail rows 32px, bar 48px, buttons 36 and 32, radii 6/7/9/12, page title 24px.
No sideways scroll at 1440, 1000 or 620. Seven screens, no errors.

*Left, and stated plainly rather than glossed.*

- **A background engine.** There is no wallpaper layer at all, so brightness,
  dim, blur and motion controls have nothing to control yet.
- **The imagery themes.** Deep Space, Orbital, Nebula and Rig Room need licensed
  4K assets, a pipeline, and a dim-and-blur layer that costs nothing at rest.
  Not started, and deliberately not faked with a name.
- **No inspector beside the work.** The shell has room for one; nothing fills it.
- **A detail pass on AI apps, Terminals, Deploy and Settings.** They inherit the
  system and are consistent, but have not had individual attention.
- **Resuming an interrupted transfer.** It fails honestly and can be retried
  from the start. It does not pick up where it stopped.
- **Whether notes belong in a corner** or stay in the one place a sentence is
  shown. A real question about what this product is, not a styling one.

> **Read this first if you are running the installed copy.** Everything below was
> fixed in the source. The installer in `dist/` still has the old code, and the
> worst of these faults *only happens in the installed copy* — so it will keep
> happening until it is built again: `npm run build`. Until then, `start.bat`
> or `node app/server.mjs` has the fixes.

---

## Run it

**Installed.** Run the installer in `dist/` — 87 MB to download, 302 MB installed, and it carries everything it needs, so a computer with no Node still runs it. This is the one to put on your other devices. The code is at github.com/rSlashGIT/Viberant (private).

**Double-click.** `start.bat`. Starts the manager and opens your browser at it. Needs Node 22 or newer.

**From a terminal.** `node app/server.mjs`, then `http://localhost:7777`.

To start it with Windows: run `make-shortcut.ps1`, press Win+R, type `shell:startup`, drop `Viberant.lnk` in the folder that opens.

---

## What works

A bar across the top with the mark on it, five places on it, and your GitHub account at the far end. Six themes, which may only change colours.

**Projects.** A stack, newest on top, one per line. Each carries the four things worth knowing at a glance: what state it is in, when you last stopped, **what you were doing when you stopped**, and where it is — plus what kind of project it is and whether it has a copy on GitHub. Mark one working on it, waiting or finished; that is yours to set and the manager never touches it. Any project can be kept private to this computer in one press. Folders are chosen by clicking down to them or with the Windows folder chooser. **Nothing is typed.**

**AI apps.** Eleven of them, each offered by the ways it actually opens on this computer. Some open a window through a file; some open one through their own command — `codex app` takes the folder and even fetches the window if it is missing, and OpenCode serves its own page. Claude Code's window is a separate download, so its Open button says so and offers the page. Apps you do not have are listed with a link to their own install guide. One "Start in" for the page rather than a folder on every card.

**Signing in runs the app's own sign-in.** Pressing Google on Gemini runs Gemini, which opens Google's real account picker. Pressing Anthropic on Claude Code runs its own sign-in, which opens Anthropic's. The manager starts the flow and never tries to be it. Only real accounts are offered; a key sits behind one line labelled as what it is, for the tools where a key is genuinely how they work.

**And when one of them prints an address instead of opening it, you can hand it over.** OpenCode does exactly this: it puts eighty characters into a black window and waits. The manager cannot read that window — taking its output away would break the sign-in it is in the middle of — so instead it offers a box. Paste the line, whole, and your browser opens at the address in it. One press instead of a fight with a mouse.

**Signing in to Viberant itself, with Google or GitHub.** GitHub is the one everything leans on: it is where a second copy of your work goes and how your computers find each other. Google is a name on this computer and the button says so rather than implying more. Google needs an application of your own registered with Google — every Google button anywhere is backed by one, there is no anonymous way in — so it is asked for once, in Settings, and the button says exactly that until it is there. The client secret is never handed to the page.

**Accounts, where you use them.** No separate accounts page. Each app's card has its own account control: the services it signs in with along the top, the accounts kept on this computer below. Pick one, press Open, and it opens as that account. The old promise still holds underneath — nothing is replaced without being kept first, and nothing is swapped underneath a running app.

**Terminals, in their own place.** Command Prompt, Windows PowerShell, PowerShell 7, Windows Terminal, Git Bash and WSL. A test fails if a terminal ever appears among the AI apps.

**One "Start in" per page.** Everything on the Apps and Terminals pages opens in the folder named at the top, which is the project you have open unless you pick another.

**Save and send, and everything behind it.** One button most days. Behind More: save here only, get the latest, make a copy on GitHub, let anyone see it, take back the last save, see what changed, open it on GitHub, and let this computer send to GitHub. Anything not possible right now is visibly not possible.

**Deploy, in two halves.** A website to GitHub Pages, Vercel or Netlify — whichever you actually have. An application built with the project's own build step and handed out under a version. Both in the open, with every line the build printed.

**Shared workspace.** Joined and working on this computer. A private project called `viberant-workspace` on your own GitHub account is the meeting point: every computer signed in to that account appears here, with what it is working on and whether it is about. You can leave notes between computers.

**The same project, on two computers at once.** Each computer keeps a short fingerprint of every project it shares and answers for it on the network; the others ask every few seconds. When your laptop has newer work, a strip appears within seconds saying so — without a single file having moved to find out. Nothing ever syncs by itself. Unsaved work is never walked over. Your copy is moved aside before it is replaced, and put straight back if anything fails on the way. When both computers have changed the same project, it says so and makes you choose rather than merging behind your back. Four rules, locked, in D-55.

**Folders move across your own network, never through the cloud.** GitHub says which computers are yours — joining puts one random key in that private project, and holding it is the proof. The files themselves go straight from one computer to the other over the local network. One computer offers a folder; the other sees it, picks where it goes, and asks for it. **Nothing arrives without being asked for**, and a transfer cut off half way leaves nothing that looks finished.

**Settings.** Eight of them, and a rule keeping the list short: nothing here changes what the manager tells you is true, only how it behaves while telling you.

**Pick up where you left off.** What you have open in a project is one card per app, however many times you opened it. Press one and that app opens again *carrying on the conversation you were having* — Claude Code, Codex and OpenCode each have their own word for it and the manager knows which. Apps with no such word open fresh and say so.

**It notices when a folder changes underneath it.**

---

## The second computer, at last — and what it found

**The thing that had never been tried has now been tried, and it did not work.**
A second computer joined, and everything about the shared workspace was broken
from that moment. Six faults, and the first one caused four of them.

**That computer had no name set for signing work, so nothing it wrote ever left
it.** Not once, in hours of trying, every couple of minutes. The failure was
swallowed by the one helper whose entire job is swallowing failures, and every
answer said nothing was wrong. What it produced was not one broken feature: the
other computer showed *"Only this computer so far"*; this one was never
reachable on the network; **"Check again now" appeared to do nothing**, because
the reply was thrown away unread; and joining kept saying *press Join again in a
moment* — advice that could never once have worked. Four symptoms, one cause,
and nothing anywhere said the word "name". D-84, and D-85 for the network half.

**Asking the other computer anything went to a network that exists only inside
it.** It advertised three addresses and the real one was in the middle; we asked
the first and stopped. That is why the folder it was offering never appeared
here. Addresses are now ranked and then all tried, with the one that answers
remembered. D-86.

**The whole manager was being killed by watching a folder.** Not an error — an
assertion inside the watcher, in another language, which ends the process where
it stands. It happens when the folder's name is handed over in the shortened
form Windows keeps for anything longer than eight characters. **The last line of
defence D-77 put in cannot see this one**, and it took fourteen tests down with
it, which had been read as fourteen separate faults. D-83.

**A folder that arrived completely was reported as not having arrived.** Twice
in six runs. The final step of putting it in place is a rename, and Windows
refuses that one at random while a scanner or the indexer holds the folder.
Everything either side of it already waited; that step did not. D-88.

**Opening the Workspace tab took between 1.5 and 2.2 seconds, every time,** and
again every twenty seconds, because it reached GitHub before drawing anything.
Now about 210 ms. D-87.

**Four sentences pointed at a page that was deleted by D-35.** "Sign in from the
Accounts tab" — there is no Accounts tab. An action naming a place that does not
exist is a dead end with a helpful tone.

---

## What was found by pressing the buttons, this time

Six faults, found by driving the real app rather than by reading it. Four of them
had the same root and they are the reason it felt like the whole thing had broken.

**Pressing Open on Antigravity did nothing, and it was never about Antigravity.**
Running Viberant as a window of its own starts the manager with one instruction
in its surroundings: *be plain Node, not a window.* That is correct — it is how
this runs on a computer with no Node. It is read once and then means nothing,
except that it was still sitting there and **every app the manager started
inherited it.** Antigravity, VS Code, Cursor and Windsurf are all built the same
way underneath; told not to be a window, they were not one. No window, no error,
nothing to read. And it **only ever happened in the installed copy** — never when
the server was started from a terminal, which is every way it had been checked.
Reproduced, fixed, and now held by a test that starts the server with exactly
that mark set. Verified afterwards through the real window: Antigravity and VS
Code both open. Full account in D-76.

**One app that would not open took the whole manager down with it.** Starting
something in the background and not listening for the child saying it failed is
not a thrown error and no `try` catches it — it ends the process. Five places did
that. What it looks like from the outside is not one broken button; it is *every*
button breaking at once, because the window stays up and everything you press
afterwards says the manager is not answering. Each of the five now listens, and
nothing at all is allowed to end this process. D-77.

**A launch said "it is starting" without looking.** It now waits half a second
for the command to fall over and says so if it does. That is how the Antigravity
fault was finally caught rather than reported as a success.

**Signing in to GitHub had stopped opening your browser, and said it was opening
one anyway.** Older versions of the helper stopped and waited for a keypress
before opening a browser, and this app was that keypress. Newer ones just print
the address and carry on. So nothing opened, while the page claimed it was —
a sentence that was true when written and quietly became a lie. It now watches
for the address rather than for the question. D-79.

**"That name may already be taken" was said to somebody who was not signed in.**
The two produce the same refusal from GitHub's end, and the app guessed the wrong
one — then said it again for every new name, a loop with no way out. It now asks
whether you are signed in *before* offering the form at all, and reads what came
back instead of assuming. D-80.

**The AI apps page took 1,290 ms to appear, every single time.** It asked the
computer about twenty things, one after another. Asked at once and remembered for
eight seconds: **4 ms.** Terminals 525 → 1 ms, the account in the corner 375 → 37 ms.
D-78.

---

## What was found by pressing the buttons, before

Three real faults, all of which would have hit you first:

**The folder chooser opened behind everything.** It used the older Windows folder browser, which has no owner window and starts at Desktop with no way up to the drives. Replaced with the shell's own browser, rooted at This PC and given the front window as its owner. Verified opening.

**Joining the shared workspace reported success and had sent nothing.** Being signed in to the GitHub helper does not let *saving* reach GitHub — they keep separate credentials, and on this computer git was using the Windows credential store, which had never been told about GitHub. Every send came back "Repository not found", which reads like the project does not exist. The non-obvious part, which took a real attempt to find: **credential helpers are a list, not a setting** — adding ours to the end changed nothing because what was already there was asked first and won. Fixed for folders the manager makes; the global fix is a button with a sentence on it. Full detail in D-42.

**A transfer cut off half way threw instead of answering.** Found by a test, fixed, and now leaves nothing behind that looks like a finished project.

---

## What is left

**The installer has to be built again.** `npm run build`. The worst fault fixed
this session only happens in the installed copy, so nothing above reaches you
until it is rebuilt.

**Google sign-in has never completed against a real account.** Everything up to
the account picker is verified: refusing plainly when no application is
registered, asking Google for a code, and reporting Google's refusal honestly
when the two values are wrong. What has not happened is a real client ID and a
real account picker, because that needs an application registered in a Google
account and only you can make one.

**The other device — done, and it was worth every minute.** A second computer
joined and broke six things, all of them listed above and all of them fixed.
Both computers now hear each other on the network. What still has to happen on
the second one is the ordinary thing: **set a name for saved work.** Nothing it
writes can leave until that is done, and it now says so on the page instead of
failing in silence.

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

**What the manager inherits from how it was launched is not automatically fit to pass on, and it has now gone wrong in both directions.** Once too narrow — the PATH a desktop process gets, which made an installed `gh` invisible (D-72). Once too wide — the instruction not to be a window, passed on to apps that took it seriously (D-76). Both were invisible from a terminal, which is where all the testing happened.

**Twenty questions asked one after another cost 1,290 ms; asked at once and remembered for eight seconds they cost 4.** The AI apps page. Nothing installs itself in the gap between two questions half a second apart, and the two events that could make the answer wrong — installing something, changing account — clear it explicitly.

**A rule written against another program's exact words has an expiry date on it, and nothing tells you when it passes.** The GitHub sign-in watched for "Press Enter to open", which that program stopped printing. Watching for the thing actually needed — an address — survives the wording changing.

---

**A guard written in one language cannot catch a decision made in another.** D-77
made "nothing may end this manager" true for every failure that travels through
JavaScript. The watcher's assertion does not travel through JavaScript, so the
net was never in its path. The only defence against that class is to never hand
the lower thing a value it cannot live with — which means knowing what it cannot
live with, which means finding out the hard way at least once.

**Six runs of the tests say things one run does not.** Two of six reported a
folder as having failed to arrive when every byte of it was there. One run looks
like a pass; six looks like a bug that would have reached somebody.

**Four sentences named a place that had not existed for several decisions.**
Nothing checks that an action is pointing at something real, and nothing can,
short of somebody reading them — which is what the vocabulary test does for
words and could just as easily do for places.

---

## The one thing I still need from you

**On the second computer, set a name for saved work** — the account button at the
bottom left, then your name and email. Nothing that computer writes can leave it
until that is done. Everything else about the two of them meeting is fixed and
proved; this is the one part that is yours to fill in, because it is your name.

After that: use it for a week and tell me where it annoys you.
