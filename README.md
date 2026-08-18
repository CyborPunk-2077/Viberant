## 🎬 Product Demo

Watch Viberant in action — from managing local development projects to launching tools and handling project/GitHub workflows from one workspace.

**[▶ Watch the Viberant Demo](https://abhishek-project-demos1.vercel.app/viberant.html)**

> The demo focuses on the product experience. Implementation details and local setup are documented below.

Viberant is a Windows desktop manager for AI-augmented developers. It acts as a central control panel that lets you open a project once, and instantly launch whichever AI coding app you need—already pointed at that folder. 

No more manually adding folders to each app. No more signing out and back in to switch tool accounts. One button to save your work, send it to GitHub, or share it securely peer-to-peer with your team.

---

## 🚀 Getting Started

You need **Node 22** or newer. There are zero npm dependencies in the core application. Nothing else to install.

To start the app in headless/dev mode:
```bash
node app/server.mjs
```
Then open `http://localhost:7777` in your browser.

To start the Electron desktop shell (if built):
```bash
npm run desktop
```

Everything Viberant remembers (settings, accounts, logs) lives securely in `%USERPROFILE%\.viberant` on your machine. Delete that folder, and it is as if the app never ran.

---

## ✨ Core Features

* **Project Context Management**: Pick a project once. Start any AI app (Claude Code, Cursor, Windsurf, Codex, etc.) or terminal directly in that folder.
* **Multi-Account Profiles**: Keep more than one account per AI app (e.g., Work and Personal). Switch between them instantly without signing out.
* **Zero-Setup Version Control**: Type what you did in plain English and press "Git Push." Viberant handles git commits and pushes. If the project isn't on GitHub, it automatically creates a private repo for you.
* **Peer-to-Peer Workspace**: Collaborate securely. Connect multiple computers via LAN or relay. Share projects, see real-time presence, send live notes, and incrementally sync files with conflict resolution—no central database required.
* **AI Diagnostics ("Ask")**: Use Claude, OpenAI, or Gemini directly within Viberant to ask questions about your local code, diagnose issues, or review changes.
* **One-Click Deploy**: Send your web projects live to Vercel instantly from the "Ship" tab.

---

## 📚 Documentation

For a complete understanding of the project, its features, and how it is built, please read the following documentation:

* **[Product Requirements Document (PRD)](./docs/PRD.md)**: The product vision, target audience, core features, and technical constraints. Start here for a high-level product overview.
* **[User Workflows](./docs/WORKFLOWS.md)**: A step-by-step guide to the primary user journeys, including setting up profiles, saving to GitHub, and using the P2P Workspace.
* **[Architecture Map for Developers](./docs/CODEX_PROJECT_MAP.md)**: The definitive guide to the codebase. It details the runtime architecture, HTTP server, frontend design (no-framework Vanilla JS), data persistence, and the peer-to-peer networking layer.
* **[Design Decisions & History](./00_DECISIONS.md)**: A running log of every major architectural decision made on the project, why it was made, and alternatives considered.
* **[Agent & Contributor Rules](./AGENTS.md)**: Strict rules for contributing to the codebase, maintaining zero dependencies, and respecting the plain-language UI constraints.

---

## 🛠️ Repository Structure

```text
app/          The main application (Vanilla JS UI + Node HTTP server)
core/         Event-sourcing engine and reference implementations
docs/         Comprehensive project documentation (PRDs, workflows, architecture)
experiments/  Historical point-in-time measurements that drove architecture decisions
desktop/      The Electron shell wrapper
dist/         Packaged application output
```

## 🧪 Running Tests

The test suite ensures the integrity of the cross-computer sync, server routing, and UI wording constraints.

Run the entire suite (what CI expects):
```bash
npm test
```
Or run them individually:
```bash
node --test "core/reference/test/*.test.mjs"
node --test "app/test/*.test.mjs"
```

---

*Viberant is built with strict adherence to simplicity, longevity, and local-first principles. It relies on standard web technologies and built-in Node modules to ensure it will continue to run for years to come.*
