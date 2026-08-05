# Viberant

One place to open your project, then start whichever AI app you feel like — already pointed at that folder. No adding the folder again in each app. No signing out and back in to switch accounts. One button to save your work and send it to GitHub.

---

## Run it

You need Node 22 or newer. Nothing to install.

```
node app/server.mjs
```

Then open `http://localhost:7777`.

Everything it remembers lives in `%USERPROFILE%\.viberant`. Delete that folder and it is as if this never ran.

---

## What it does

**Pick a project once.** Type a folder path, or point it at the folder that holds all your projects and it will find them. It remembers the ones you use, so next time it is one click.

**Start any AI app in that folder.** Claude Code, Codex, Gemini, Aider, Cursor, Windsurf, Antigravity, VS Code — whichever are installed. Command-line ones open in a terminal already in the folder. Desktop ones open with the folder loaded. You never add the folder by hand again.

**Keep more than one account per app, and switch without signing out.** Click `accounts` next to an app. Save the account you are signed in to under a name. Switch to another one whenever. Under the hood it swaps the folder each tool keeps your sign-in in — the same idea as browser profiles.

Two things it refuses to do, on purpose: it will not swap an account while that app is open (you would be signed out mid-sentence), and it will not throw away the account you are using.

**Save and send in one press.** Type what you did, press the button. It saves everything and sends it to GitHub. If the project has never been on GitHub it offers to put it there, so you never leave to make a repository by hand.

If GitHub cannot be reached, your work is still saved on your computer and it says so — it will never tell you something is sent when it is not.

---

## What is in here

```
app/          the thing you run
core/         the record of what happened, and the rules about it
experiments/  questions answered by measuring rather than arguing
STATUS.md     what is done and what is left, in plain language
00_DECISIONS.md   every decision, why, and what else was considered
```

Run the tests:

```
node --test "core/reference/test/*.test.mjs"
node --test "app/test/*.test.mjs"
```

---

## A note about accounts

This exists so someone with a work account and a personal account stops signing in and out all day. That is what it is for and that is what it is good at.

Using it to get past what one account is allowed to do is against most AI providers' terms, and the person doing it risks losing the accounts. Worth knowing before relying on it.
