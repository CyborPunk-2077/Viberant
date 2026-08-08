# STATUS

*What is done and what is left, in plain language. Updated every session.*

**Last updated:** 8 August 2026
**Tests:** 328 passing on Windows. The ones added last hold the two decisions
that would be most expensive to lose: nothing that decides where work goes can
read a Google account, and there is no code anywhere that could download an
update and run it.
**What it is now:** a manager for one project across every AI app, every terminal, GitHub, the world, and every computer you own.

## Viberant 2.0, so far

**You can ask about this project.** Four questions — why did this fail, is
anything wrong here, look over my changes, and a question answered from a small
local search. Each shows what it is doing while it works, and says where the
answer came from. Not a chat: the question was the button. D-127.

**Two rules were built before anything that stands on them.** A secret never
leaves this computer in a prompt — one function does the redacting and
everything goes through it, the file with real values is never opened, and a
test puts real-looking credentials through every shape to check. And nothing a
model suggests reaches a file without being agreed to: a proposal is applied by
a separate route, cannot be applied twice, and one naming a path outside its
project is refused entirely, including the parts that were fine. D-125, D-126.

**One list of everything happening, and it follows you.** Every errand says what
kind it is when it begins, so the corner groups them and a build stays visible
when you walk away from Deploy. D-128.

**How a project stands**, in the panel beside it: dependencies, runtime, build
command, expected settings. Only what was actually checked. D-129.

**No account name decides anything.** The source was searched; one name exists —
Viberant's own issue list — and it was called `HOME`, which beside an owner/name
pair reads like somebody's account. A test now reads every file that decides
where work goes and fails on any owner/name literal in it. D-119.

**The account popover floats.** It hung inside the rail, which scrolls, so it was
clipped by it and gave the rail a sideways scrollbar. Verified with a
55-character account name at a 60px rail: fully inside the window, nothing
clipped, no scrollbar anywhere. D-120.

**A foreign remote no longer offers to switch accounts.** It states both facts
and offers to connect *this project* to the account in use — one project rather
than every project. The old address is kept under another name. D-121.

**Vercel is a real provider.** One shape for places a website can go, so a second
is a file rather than a rewrite. The first deploy connects it in the same errand;
after that it is one press. The address is read out of what Vercel printed and
remembered against that project. D-122.

**A project knows what it is.** Next, Nuxt, Astro, SvelteKit, Remix, Vite, Vue
and React from a real dependency; the package manager from the lock file. The
names of environment settings are read and **the values never are** — held by a
test that fails if any value appears in what inspection returns. D-123, D-124.


**Work goes where the app says it goes.** Viberant showed one GitHub account and
pushed as another, because those are two identity systems that nothing was
holding against each other: `gh` has an active account, and `git push`
authenticates through the computer's credential store, which may hold somebody
else. There is now one session, one per-project binding read from the project,
and a check that **refuses when they disagree** rather than picking. The
destination is on screen beside the button. D-107.

**The workspace is infrastructure, and told apart by path.** A project called
`Viberant` is one hyphen from `viberant-workspace`. Writing the test found the
guard was broken as written — `git rev-parse --show-toplevel` answers in
Windows' long name while paths elsewhere may be the short one, so it compared
`ADMINI~1` against `Administrator` and would have said "not the workspace" every
time. D-108.

**Projects can be removed, two ways that share no wording.** Off the list touches
no file; delete puts the folder in the recycle bin and asks for the project's
name. Verified against real folders. D-109.

**Every address is defined exactly once**, held by a test — a duplicate key in
the routes object silently replaces the earlier one, which is a fault with no
symptom until somebody presses the button that used to work. D-110.

**Projects, AI apps and Terminals are tables.** Eleven apps now occupy a third of
the screen instead of all of it. D-111.


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

**Deploy is a tool screen now.** A fact bar saying which project and which
repository it will act on, two labelled sections of typed rows, and buttons
called Build installer and Build & publish. A finished errand offers what it
made — the artifact by name and size with Show in Explorer, a release or a site
with Open and Copy the address, opened in the computer's browser rather than
this window. D-114.

**Build never closed the app; the report of it vanished.** `paintJob` rebuilt
its scaffolding only when the errand changed, but every redraw replaces the
page — so it wrote each piece into elements that no longer existed. The build
itself was correct all along, which is worse than it being broken. D-112.

**A website deploy waits for GitHub to say what it built** rather than calling a
push a success. Three honest answers where there was one assumption. D-113.

**GitHub has a section on Settings** with room to say which account every action
will use. D-115. **Remote offers appear once**, in the Workspace table. D-116.

**Four scenes exist**, drawn rather than shipped: a star field at three depths,
a planet limb with light in its air, drifting clouds of colour, and a dark
workstation lit like product photography. Twelve frames a second, nothing at all
when the window is hidden, two megabytes. D-117.

---

**There is something beside the work.** One press on a project selects it and
shows what this computer actually knows, with its repository once the project
has been asked; two presses opens it. Its own column above 74rem, a drawer
below. Two scroll containers, neither moving the other. D-118.

---

## What was finished after that

**Google is a list of names now, and names decide nothing.** A work address and
a personal one can both be here; signing in to the second used to sign you out
of the first, silently. Its own section in Settings, well away from GitHub,
because the two are constantly confused and only one of them decides anything.
A test asserts that no file which chooses an account, a remote or a place to
deploy can even import the Google module. D-130.

**The workspace stops growing forever.** Being about wrote a small save every
couple of minutes and nothing ever pruned them — a quarter of a million saves a
year in a project every computer keeps a copy of. Computers not heard from in
ninety days have their word dropped, conversations are trimmed, and past five
hundred saves the whole history is folded back into one. Every file survives
exactly as it stands; what is lost is the list of moments they were written.
A computer whose copy no longer lines up now takes the other one whole instead
of never pulling again, silently, forever. D-131, closing O-9.

That fold is the only irreversible step in the product, so it is guarded by four
checks a test can stand on: the right folder by resolved path, an address
carrying the workspace's own name, nothing unwritten, and nothing moved since it
was last read. One test sends it at somebody's real project and proves it
refuses and leaves the computer exactly as it found it.

**It checks whether there is a newer Viberant, and refuses to install it.** It
asks what has been released, says what is new in the words the release was
written in, and opens the page in your browser. It does not download anything
and it does not run anything, because the protection against a hijacked update
is not care and not HTTPS — it is a signature this app does not have yet. What
has to be true before that step can exist is on the Settings page rather than in
a comment. A test reads the module and proves there is no way in it to fetch a
file, write one, or start any program other than the one that asks what has been
released. D-132.

**The Workspace page had its design pass, and it found a fault everywhere
else.** Its three lists became sheets with aligned columns like every other
page, this computer moved into the list as its first row rather than sitting
under its own heading below the others, and one press on a computer or an offer
opens the inspector. D-133.

The fault: dropping a column on a narrow window was written
`.projects-cols > :nth-child(4)`, and a sheet's direct children are its **rows**.
It was hiding the fourth project, the third computer, whichever row landed on
that number, on any window under 74rem. It survived every audit this project has
run because each list was short enough that the number fell past the last row.
Found by measuring — an audit that walks every row and asks whether any has
`display: none`. D-134.

**Five more looks**, four of them with a picture: Andromeda, Deep Field, Event
Horizon, Mars Horizon, and Tactical. Generated here rather than shipped, which
keeps somebody else's artwork and somebody else's licence out of this entirely.
A test fails on any look that leaves a variable out, because that does not error
— it silently inherits the look above.

**Asking about a project reached the command palette.** Those four buttons live
at the bottom of the project page, which is the right place to find them and the
wrong place to be when the thought arrives.

---

*Left, and stated plainly rather than glossed. In priority order.*

- **The installer has not been built since any of this.** `npm run build`.
  Everything above is in the source; the installed copy still has the old code.
- **Resuming an interrupted transfer.** It fails honestly and retries from the
  start. It does not pick up where it stopped. Per the brief's own priority,
  reliable transfer and honest retry came first and both are done.
- **No custom wallpaper of your own.** Seventeen looks, four of them scenes, and
  no way to point at a picture on this computer. Deliberately last: a picture
  somebody chose is the one thing here that can be unreadable, and the answer to
  that is more work than the picker.
- **The scenes are barely visible** on a screen full of opaque panels. That is
  correct by the readability rule and still worth revisiting: a little more
  breathing room in the gutters would let them read without putting text on a
  picture.
- **No per-provider choice for asking.** One model, named in Settings.
- **Signing an installer.** Until there is a certificate, the update path stops
  at opening the download page, on purpose. Nothing to build here — something to
  buy and keep safe.

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

**~~Nothing prunes the shared workspace.~~** Done. It prunes computers not heard from in ninety days, trims what was said, and folds its whole history back into one save past five hundred. D-131.

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
