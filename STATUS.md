# STATUS

*What is done and what is left, in plain language. Updated every session.*

**Last updated:** 8 August 2026
**Tests:** 558 in the app and 107 in core — 665 in all — passing on Windows. The ones added last hold the two decisions
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

## Viberant Anywhere

**Two computers on different networks are in the same workspace, and the
existing transfer carries the project.** Not a second application and not a
second transfer path: `peers.mjs` offers this network, direct across the
internet, or a relay, tries them in that order, and hands back the same kind of
thing either way — so `parcel.wrap`/`unwrap`, resuming and the three-way
integrity check work unchanged on all three. D-143.

**A computer is a key it made itself.** Ed25519 for signing, X25519 for agreeing
a secret, both from Node's own crypto. The identifier is the fingerprint of the
public key, so it cannot be claimed by anybody without the private half — which
never leaves, by any route, and a test proves it. D-141.

**The relay carries ciphertext.** A test runs a real project through a real
relay on a real socket, then searches everything the relay carried for the file
contents and a run of every real file. None of it is there. D-144.

**The service knows who is about and nothing else.** Members, public keys,
unused invitations, presence, relay tickets. Pluggable, and the one that ships
runs inside the app and needs no account. A test fails if it can open a file at
all. With it unreachable, a workspace already on this disk keeps working on this
network — losing the internet must not cost you the next room. D-145.

**Joining is never a reason to run a command on somebody's computer.** Terminal,
run and build are off even for a full member; the owner of the target machine
grants them per device, one at a time, and a role cannot bypass that. Every check
happens where the command would run. Nothing anybody sends becomes a command —
the target reads the project's own scripts to decide what `build` means. D-142.

**Send the twenty megabytes that changed.** Two manifests, compared on path,
size and time, hashed only where that is ambiguous. A file here and not there is
never deleted. A file both sides changed is a conflict with three answers and
none chosen automatically. Before anything is replaced, what would be replaced is
copied and can be put back. D-146.

**Why does this work here and not there.** Two computers side by side —
versions, package manager, what the project expects. Names and counts, never
values, held by a test that fails if the module can open a file. D-147.

**A project catches up with another computer, over a real connection.** Two
manifests, only what changed crosses, a way back kept for anything it would
replace — and then the folder that results is held against what the far end said
the project comes to. That last check caught something nothing else could: a
sync was *replacing* the folder with the handful of files that changed, and
every number about the stream was correct while it did it. D-153.

**A short list of what happened**, and deliberately not a feed. A closed list of
kinds, each an event that measurably occurred; a test asserts there is no kind
for anything that would have to be inferred. D-154.

**What a build made comes back**, beside the project rather than into it and
named for the machine that made it, as an ordinary parcel with every integrity
check that implies. The output folder is read from the project and checked to be
inside it — a caller who could name one could name anything. D-150.

**Looking at something running there** opens an address on this computer only.
Each request is carried over the connection those two machines already have; the
far half talks to loopback and only to ports something running there has printed.
Nothing is put on the internet, and turning Viberant off turns it off. D-149.

All of it over one connection split into channels — question and answer, build
output, and a page — rather than three connections with three protocols. D-148.

**What a relay carried is counted**, in memory and one file here, by day for a
month and then folded into a total. Nothing about who or what, and a test
asserts the module cannot reach the network at all. D-151.

**The background is four percent brighter while something is running**, eased
over two seconds, from the same list the jobs corner uses. D-152.

**Nineteen hostile tests**, written as the attempt rather than as the rule: path
traversal, absolute paths, a parcel that lies about its size, a forged proof, a
frame length asking for three gigabytes, bad relay tickets, a dressed-up terminal
request, a command name carrying a shell.

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

**The scenes actually show now.** The panels were 92% opaque because somebody
picked 92, and the note beside them said the scenes were barely visible but that
this was the price of being readable. It was not the price: at 92% the faintest
readable text sits at 6.5 to 1 against a line of 4.5. They are 84% now, held
there by a test that checks the worst case the app permits — a white star in the
scene at the lowest covering the slider allows.

The same measurement found something that was already wrong: `--faint` reads at
4.47 to 1 on an opaque card, so it can never clear the line with anything behind
it, at any opacity that still shows a picture. The rail's labels were that
colour. They take the next one up now. D-140.

**It has an icon of its own.** The same rounded square, violet gradient and V
that sits at the top of its own rail — generated from about a hundred lines
rather than shipped as a file, so it can never drift from the mark it copies.
The small sizes are drawn heavier rather than scaled, because at 16 pixels a
scaled stroke is 1.3 pixels wide and nearly disappears, and 16 pixels is where
an icon lives. D-138.

**Three companies can be asked, and which one is on screen.** Claude, ChatGPT
and Gemini, each with its own key box and its own address. A question costs money
at whichever answers it, so the name of the one about to be asked sits next to
the buttons that ask — and if the chosen one has no key while another does, the
page says which one it is asking instead, by name. Being billed by a company you
did not pick is not a surprise a manager should hand anybody. D-137.

**A transfer that stopped carries on from where it stopped.** Anything over
about 50 MB keeps what it confirmed, with a ledger beside it naming every file
that reached its stated size — so the file that was half written when the
network went is asked for again rather than kept. Asking again sends that
ledger, and the other computer sends only what is missing. A file that changed
between the two attempts is matched by name *and* size, so it is sent again:
skipping it would hand somebody a folder that is a mixture of two moments, which
no count would catch because every count would agree. D-136.

Two faults that were already there came out of building it. `unwrap` piped from
its source without listening for an error on it, so a reply that died half way
through its body raised an error nothing was listening to — and that ends the
whole manager. And a file re-sent because it changed was counted at both its old
and new size. Neither could be reached by any earlier test, because every one of
them ended its stream politely.

Measured over a real socket: 1.2 MB cut at 400 KB kept 6 files, the second ask
carried 15 of 21 files and 840 KB of 1.2 MB, and what landed was byte-identical.

**A picture of your own, and the honest thing that has to happen with it.**
Any picture on this computer. Nothing is copied and nothing is sent — the path
is kept and the file is read where it sits. Every other look here was made dark
on purpose and a photograph somebody chose was not, so it is measured rather
than hoped about: how light the picture actually is comes back as a number, and
a bright one is covered by however much the words on top need, with a sentence
saying so. Later, if you pull the slider back down, it says the cost once and
leaves your slider alone. D-135.

The route that serves it takes no arguments and cannot see the request, so it
can only ever serve the one file already chosen through the picker. Asked for
with `?path=` pointing at the manager's own source, it returns the picture.

**Asking about a project reached the command palette.** Those four buttons live
at the bottom of the project page, which is the right place to find them and the
wrong place to be when the thought arrives.

---

*Left, and stated plainly rather than glossed. In priority order.*

- **Install the rebuilt one.** `dist/Viberant-Setup-0.1.0.exe` was built after
  everything above and carries it — checked by reading `newer.mjs` and the fixed
  stylesheet out of the packed copy, rather than trusting the build. Run it to
  replace the installed copy.
- **Signing an installer.** Until there is a certificate, the update path stops
  at opening the download page, on purpose. Nothing to build here — something to
  buy and keep safe.

> **If you are running the installed copy, install it again.** The installer in
> `dist/` was rebuilt after everything on this page and carries all of it. Until
> you run it, the installed copy has the old code.

---

## Run it

**Installed.** Run the installer in `dist/` — 87 MB to download, 302 MB installed, and it carries everything it needs, so a computer with no Node still runs it. This is the one to put on your other devices. Where the code lives is recorded in `package.json`, not written into the app.

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

## Terminals and AI apps say what they are for

Terminals used to be a list of six names and most of a window of nothing. It
opens with where every one of them will start, how many there are, and how many
are running here for somebody else — then the list, then anything another
computer is running on this one, then what a terminal here can actually reach.

AI apps opens with how many are ready, how many have an account chosen (which is
the fact that page exists to make true, and was never said out loud), and the
folder they open into.

---

## Nobody's account is in this app

There was exactly one account name in the source — Viberant's own issue list
and release address, which was also one person's GitHub account, compiled into
every copy that shipped. It is read out of `package.json` now, in whichever
shape the address was written, and allowed to be absent. Nothing is written
there, so no account exists anywhere in this app. Both features that wanted one
say so: a report is still kept on the computer that wrote it and says there is
nowhere to send it; a version check reports a third kind of not knowing rather
than "up to date". D-182.

## Members can recognise each other without GitHub

Computers that joined with a code appeared in each other's lists and both said
offline forever: recognising each other on a network needs a shared value, and
the only one there was came out of a private project on GitHub they had never
seen. There is one derived from the workspace's own identifier and the public
key of the computer that made it — in every member's record, private to
nobody, and unchanged when somebody joins. D-183.

**Verified:** the value works out identical on both instances after a join, and
being findable now starts from the members workspace alone, with no GitHub
workspace at all.

---

## Somebody can actually join

Joining could not work at all, and the reason was one line. Every message two
computers exchange begins with "are you in this workspace", which is right for
all of them except the one whose whole job is to put somebody in it.

Joining has its own way in now: its own door, one kind of message, hands over
the workspace and closes. The fingerprint of a code is shouted on the network,
whoever holds a live invitation answers, and the real code goes down one
connection to that computer alone. No private key is in any of it. D-178.

**Verified with two independent instances**, separate profiles, separate ports:
A creates — one member. B is not a member and has no workspace. A invites. B
joins. Both sides then list the same two computers, by the names they were
given, in the same workspace. Both restarted: still there. A revokes B: B is
gone from A, and a fresh code does not let it back in.

**Found doing it, and worse than the thing being fixed:** nine routes built
their answer as `{ ...out, ...around() }`, and `around()` ends with `ok: true`.
A refusal came back saying "That invitation does not work" with `ok: true` on
it, so the page reported success. Nothing was let in — the refusal was real
— but everything on screen said otherwise. D-179.

People and computers are drawn as two things now, and a computer has one name
rather than one per list. D-180. A note appears when you press the button
rather than several seconds later behind a page rebuild. D-181.

---

## A workspace is the people who joined it

Two lists of computers sat on one screen under headings that read the same, so a
computer signed in to the same GitHub account looked exactly like somebody who
had joined. The membership list was never wrong — it has always been built
from the workspace and nothing else — the page was conflating two different
things. The workspace comes first now; the account list says, in a sentence,
that being on the same account is not being in a workspace. D-173.

**Verified with two real instances:** A makes a workspace and has one member. B,
running beside it, is not a member and has no workspace. Making an invitation
adds nobody. After all of it A still has exactly one member.

**The gap that remains, stated plainly:** a code is permission to join, not the
workspace itself. The workspace record lives on the computer that made it, and
something has to carry it across; today only a service both computers can reach
does that. Joining from a fresh install cannot work yet, and the refusal now
says so in those words instead of reading like a settings problem. D-174.

The second list of everybody's projects mixed together is gone. One place, and
it is the computer you pressed.

## Asking about a project

"whats this project about ??" used to be answered with a careful explanation of
one deeply nested file, because the search matched the words `project` and
`about` across the folder. README was not among the files it read at all. Broad
questions skip the search and answer from what describes the project. D-175.

"Viberant has no key for Claude yet" is gone: nothing being connected is not a
fact about Claude. D-176. A long answer can be scrolled and read to the end.

The folder chooser opens at the computer rather than at wherever you were, and
takes a typed path. D-177.

---

## Four things that were true and could not be seen

**ValoVault deploys.** It failed with "Project names must be lowercase" — a
rule nobody broke, about a name nobody chose, because the tool names a project
after the folder it runs in. One function now turns a project's name into one
Vercel takes: `ValoVault` becomes `valovault`, `My Cool App` becomes
`my-cool-app`. Deterministic, so the second deploy finds the first site. The
folder is never renamed, held by a test that reads the module. D-168.

What a deploy will do is worked out before anything starts: whether there is a
website here at all, where it is, what builds it, and which project at Vercel it
belongs to. A desktop application says so instead of being deployed. One with a
website inside it deploys the website. A folder of pages with no `index.html` is
a website, because it is one. D-169.

**Verified:** ValoVault deployed through the app, live at
`valovault-topaz.vercel.app`, a page fetched back at 200 with 36KB of real
content in it. Its front page is missing and the result says so rather than
handing over an address that shows a not-found page.

**Gemini answers.** A good key was accepted and no question ever got an answer,
for three reasons each hiding the next. Google sends its refusal as a list
holding one object where the shape it copies sends the object — so every
refusal arrived saying nothing, and an account out of allowance came back as
"asking too fast". The model this offered had been retired for new accounts,
which reads like a broken key. And an answer with nothing in it was rendered as
an answer. D-170.

**Verified inside the app:** asked for `VIBERANT_AI_OK` and got exactly that
back from Gemini Flash in three seconds, then asked what this project does and
got two correct sentences citing real files.

**The flicker is gone.** Setting a page's contents to the same string still
throws every element away and rebuilds them — the browser does not compare, it
obeys. Measured: nine rebuilds in fifty idle seconds where nothing had happened.
Now none, and none during a live deploy, with the rail and the bar and the
picture behind everything never replaced once. D-171.

**The inspector was off the side of the screen.** Thirty-three pixels wide, laid
out past the right edge, open and correct and invisible — the worst kind of
layout bug, and it survived two passes because it answered every question except
whether it could be seen. It is placed against the window now: 320 pixels, on
screen at every width, with the table ending before it starts. What it holds
matches what it is for — three counts, the things you can do as a list, and
the two computers with the line between them, whose shape and colour are both
facts. D-172.

---

## Vercel works, end to end, and it was checked by doing it

**Connecting no longer waits on a browser.** It used to start Vercel's own
sign-in as a background command and wait. That command wants a terminal —
somewhere to print the address it needs you to visit, and something to read your
answer from — and inside an app it has neither, so it waited forever and all
anybody saw was a spinner. Three ways to be connected now: a token pasted here
and checked against Vercel before it is kept, the command being signed in on
this computer already, or not connected. Not connected means not connected: a
revoked token reads as revoked, and being unable to ask is its own third state.
D-162.

**A deploy is checked rather than assumed.** The address is asked about until
Vercel says ready, or fetched until something answers when there is no token to
ask with. Deployment protection replying 401 counts — that is a site that is
up and asking who you are. D-163.

**Verified by doing it twice:** a page deployed through the app, live at
`viberant-deploy-check.vercel.app`, fetched back at 200 with the right content
in it, with Open the website, Copy the address and See it on Vercel all on the
result.

Two faults found by doing it rather than by reading it. The address was matched
together with the quotation mark printed after it, so the check threw on
something that was not an address, silently, once every three seconds for five
minutes, and reported that nothing was being served about a site that had been
live the whole time. And the address of the deployment was carried through an
errand by being spread in — an errand only carries fields it knows the names
of, in two separate places, and it was named in neither.

## A queue is not a bill

Adding a good Gemini key and asking one question came back as though the key
were wrong. Google says *Quota exceeded for quota metric* when a free allowance
of so many questions a minute runs out, which refills on its own in seconds.
Read as being about money, it sent somebody off to top up an account that was
fine. Money is now decided by the words that are only ever about money.
Everything else at 429 is a queue, and the sentence says the key is fine,
because that is the thing somebody is about to doubt. D-164.

Every refusal says which of seven things it was, and the page draws four of them
differently because they need four different things from a person. The question
is kept in all of them. A short wait is taken rather than reported; a long one
is reported rather than waited on. Another company with a key here is offered by
name and never switched to quietly.

And a key is no longer refused for being asked to wait — nothing counts a
request it did not recognise, so a limit is proof the key was accepted, which is
the whole reason a good key could not be added.

## The errand you opened to read used to close itself

Look at it on Activity opened the detail and closed it six hundred milliseconds
later. One path served two purposes: when an errand finishes, the screen that
started it is redrawn so what changed underneath appears — and opening a
*finished* errand went down that same path, redrawing over the top of the thing
just opened. A watch now remembers whether it ever saw the errand running.
D-165.

Activity is a real operational screen: filters for the kinds that have actually
happened here, columns for what it was and which project and when, the one being
read marked in the list, the detail in a fixed place rather than a popover.

## The shell

The numbers each screen is about are at the top of it as cards. The one graphic
is drawn into the card reporting a live connection and nowhere else, behind the
text rather than over it, absent when nothing is connected. Whether your other
computers can reach this one is in the bar across the top, because it is true of
the whole app. Settings is eight places with a column down the side rather than
one long document. Sand from the pointer is removed. D-167.

Found doing it: a settings page whose own navigation did nothing on seven parts
out of eight, because the first control that only exists on one part threw and
stopped every line after it. The way between parts is wired first now. D-166.

Measured at 1280, 1366, 1440, 1920 and 2560 across every screen: nothing runs
off the right, nothing is cut without a sign, no two controls overlap, no text
under ten and a half pixels, and no line in a colour that means something it
does not mean. Every overlay opens inside the window, stays open, and survives a
press on its own content.

---

## What was fixed in the exposure pass

**Setting up the one that answers no longer sends you somewhere else.** Asking a
question with nothing set up used to end at "Settings has a box for it", four
presses from the question already typed. It is a dialog in front of you now: get
a key from whichever company you pay for, paste it, have it checked with one
tiny request before anything is kept, and go straight back to the question. A key
that does not work is never written down. It signs nobody in to anything, and
says why: paying one of these companies monthly is a different arrangement from a
key, at all three. Settings has one row that opens the same dialog; the three key
boxes that could not tell you they had failed are gone. D-157.

**Which model each company uses is a choice, out of one catalogue,** with words a
person can choose by rather than parameter counts. A name that has since been
retired falls back to that company's sensible one rather than being sent and
having the refusal reported as a fault. D-158.

**Two things that worked and could not be found now have places in the rail.**
Ask is the four questions about the open project, reachable before only by
opening a project first. Activity is what this computer has going on: long
errands while they run, what the last build made, what another computer is
running here, previews still open, and the copies kept before anything was
written over. All of it existed and worked; none of it could be found by anybody
who had not read the source. Nothing on Activity starts anything — it shows,
and it stops. D-159.

**Settings is in parts.** It was one undivided card of twenty-odd rows in the
order they happened to be written in. Now: who you are signed in as, asking about
your projects, how it looks, this computer, your other computers, signing in with
Google, keeping it up to date, and what is written down.

**The red line under Save and send is gone.** It was a one-pixel rule in the
failure colour running the whole width under a bar of controls — which reads
as a divider somebody coloured by accident, because that is what it looked like.
It is a panel now, marked down its own left edge, in amber: nothing has failed,
a send is waiting for two facts to agree, and both are still true.

**Three faults the pass turned up on its own.**

*A model choice that was saved and silently ignored.* It was kept in a setting
whose kind coerced every value to true. Caught by a test that set a model and
asked which one would be sent.

*The word `Repository` at the top of the deploy page,* for as long as the
vocabulary audit has existed. The audit only read runs of twelve characters or
more — which keeps code out, along with every short label on every screen.
It reads down to three now, and machinery is ruled out by what machinery looks
like. Proved by putting the word back and watching it fail. D-160.

*Two ways in that never stopped asking.* Cancel on a sign-in stopped the polling;
the corner and the darkened background did not, so the page asked every second
for as long as the app stayed open and then announced the sign-in over whatever
screen you had moved to. The cause was that only closing a layer cleared up after
it — writing a sheet over a sheet ends the first one just as finally. D-161.

**Measured, at 1280, 1366, 1440 and 1920:** nothing runs off the right, nothing
is cut without a sign, no two controls overlap, and no line anywhere is in a
colour that means something it does not mean.

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

**~~Still no icon of its own.~~** Done. It wears the same mark as the top of its own rail, drawn by `build/icon.mjs` at seven sizes and made fresh by every build. Checked by extracting the icon back out of the built `Viberant.exe`. D-138.

**~~It does not know your accounts are running low.~~** Partly done, and only the honest part. When a company refuses for want of credit, it says so and says what fixes it — no polling, nothing kept, and no counting. A usage meter would be a number this manager made up about your money, and it would be wrong within a week of any price change. D-139.

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
