# Product Requirements Document (PRD): Viberant

## 1. Product Vision
Viberant is a local-first, zero-dependency Windows desktop manager designed to streamline the workflow of developers using AI coding assistants. It serves as a central hub to manage projects, AI tool accounts, version control, deployment, and peer-to-peer collaboration, completely eliminating the friction of context switching and credential management.

## 2. Target Audience
- **AI-Augmented Developers**: Developers who use multiple AI coding tools (Claude Code, Cursor, Windsurf, Aider, Antigravity, etc.) and need to seamlessly switch between them.
- **Multi-Context Workers**: Professionals who juggle multiple accounts (e.g., personal vs. work) for the same AI tools and want to avoid constant sign-in/sign-out cycles.
- **Collaborative Teams**: Small teams or individuals working across multiple computers who need real-time syncing, file sharing, and live presence without relying on a centralized cloud service.

## 3. Core Features

### 3.1. Unified Project Management
- **Single Source of Truth**: Select a project folder once in Viberant, and instantly launch any installed AI coding app or terminal directly into that folder.
- **Smart Launch**: Supports CLI tools (opening in a terminal already CD'd into the folder) and GUI apps (opening the folder natively).

### 3.2. Multi-Account Profiles
- **Profile Swapping**: Save the current sign-in state of any supported AI app as a named profile (e.g., "Work", "Personal").
- **Instant Switch**: Swap between profiles with a single click. Under the hood, Viberant seamlessly swaps the local storage directories used by these tools.
- **Safety First**: Viberant will not swap profiles while an app is actively running to prevent mid-session sign-outs.

### 3.3. Zero-Friction "Save & Send" (GitHub Integration)
- **Plain English Version Control**: Users type a simple description of their work and press "Save and Send". Viberant handles the git commit and push operations automatically.
- **Auto-Initialization**: If a project isn't on GitHub, Viberant automatically initializes it, generates a `.gitignore`, and pushes it to a new private repository.
- **No Version Control Jargon**: The UI strictly avoids terms like "commit", "push", "branch", or "merge", focusing instead on user intent ("save", "send", "the shared copy").

### 3.4. Peer-to-Peer (P2P) Workspace
- **Decentralized Collaboration**: Connect multiple computers (yours or your team's) via LAN or a relay server using an Ed25519 device key for authentication. No central database is used.
- **Live Presence & Chatter**: See who is online in real-time and exchange live notes.
- **Incremental Sync**: Share projects across devices with smart incremental syncing, conflict resolution, and snapshot-before-overwrite safety nets.
- **Ad-hoc Sharing**: "Offer" files or folders directly from your local machine to others in the workspace.

### 3.5. AI Assistant ("Ask")
- **Built-in Diagnostic Hub**: Use Claude, OpenAI, or Gemini directly within Viberant to ask questions about the current project, diagnose issues, or review local changes.
- **File-Aware**: The assistant reads project files to provide context-aware answers.

### 3.6. One-Click Deploy
- **Vercel Integration**: Deploy web projects directly to Vercel from the Viberant interface without leaving the app or writing deployment scripts.

## 4. Technical Constraints & Architecture
- **Runtime**: Node.js 22+, ES Modules (`.mjs`).
- **Zero NPM Dependencies**: The core application (`app/` and `core/`) relies solely on built-in Node modules to ensure extreme longevity and security. (Electron is used only as a dev dependency for packaging).
- **Frontend**: Vanilla HTML/JS/CSS. No React, no bundlers, no build steps. UI updates are handled by a custom HTML string-diffing function to prevent DOM flicker.
- **Backend Architecture**: A single `node:http` server routing requests from the UI. Features are strictly isolated into single-purpose ES modules.
- **Data Storage**: Entirely local-first. State is stored as JSON or JSONL (append-only logs) in `%USERPROFILE%\.viberant`. Deleting this folder completely resets the app.
- **Networking**: Custom multiplexed peer protocol over TCP (with UDP broadcast for LAN discovery). `EventSource` (SSE) is used to pipe real-time events to the frontend.

## 5. Non-Goals
- **Not a Cloud IDE**: Viberant does not host your code or provide a code editor. It orchestrates your local tools.
- **Not a SaaS Platform**: There is no Viberant-operated backend database storing user code, chat logs, or project state.
- **Not a Git GUI**: It is not meant to replace advanced git clients for complex branching/merging workflows; it optimizes the "save my work" happy path.
