# Viberant User Workflows

This document outlines the primary user workflows in Viberant, detailing how users navigate the application to accomplish their daily development tasks.

---

## 1. Project Navigation & Tool Launching
**Goal:** Quickly open a project in a preferred AI coding app without manual directory navigation or context setup.

1. **Open Viberant**: The app starts and displays the `Projects` tab.
2. **Select or Add a Project**: 
   - If the project is known, it appears in the list.
   - If new, the user clicks to add a folder. Viberant can also scan a parent directory to find all nested projects.
3. **Launch an AI App**: With the project selected, the user clicks the icon of their preferred AI tool (e.g., Claude Code, Cursor, Windsurf) from the `Apps` tab or the quick launch bar.
4. **Outcome**: The selected app opens natively on the OS, already pointed to the correct project directory. CLI tools open in a new terminal window at the project root.

---

## 2. Managing Multi-Account Profiles
**Goal:** Switch between multiple accounts (e.g., Personal and Work) for a specific AI tool without signing out.

1. **Navigate to Apps**: The user opens the `Apps` tab.
2. **Access Profiles**: Next to an installed app, the user clicks the `accounts` button.
3. **Save Current State**: The user saves their current active session under a name (e.g., "Work Account").
4. **Sign In & Save New**: The user logs into a different account within the app itself, then returns to Viberant to save this new state as "Personal Account".
5. **Switching**: To swap, the user clicks the desired profile name in Viberant. Under the hood, Viberant swaps the local configuration folders the app uses to store its session state.
   - *Safety Mechanism*: Viberant will block the swap if the AI app is currently running, ensuring active sessions aren't corrupted mid-sentence.

---

## 3. The "Save & Send" Workflow (GitHub)
**Goal:** Securely backup code and push to version control without needing to remember git commands.

1. **Make Changes**: The user edits code using their preferred tools.
2. **Review Situation**: In Viberant's `Projects` tab, the UI explains the current state of the folder in plain English (e.g., "3 files changed").
3. **Describe Changes**: The user types a brief, natural language description of what they accomplished.
4. **Action**: The user clicks the "Save and Send" button.
5. **Outcome**:
   - If the project is linked to GitHub, Viberant commits and pushes the code.
   - If the project is local-only, Viberant offers to publish it. It automatically generates a `.gitignore`, creates a private repo on GitHub, and pushes the initial files.
   - If offline, the changes are saved locally, and Viberant clearly states that they will be sent when a connection is restored.

---

## 4. Peer-to-Peer Workspace Collaboration
**Goal:** Collaborate with another computer or team member in real-time, sharing projects and notes without a central server.

1. **Join/Create Workspace**: From the `Workspace` tab, a user either creates a new workspace or redeems an invite code provided by a colleague.
2. **Discovery & Connection**: 
   - Viberant broadcasts over the LAN via UDP to find peers.
   - If off-LAN, it attempts a direct TCP connection or falls back to a relay server.
3. **Live Presence & Notes**: Once connected, the user sees their peers online. They can send messages which appear in a real-time, append-only log (chatter).
4. **Sharing a Project**: 
   - The user selects a local folder and "offers" it to the workspace.
   - A peer sees the offer and clicks to "bring" it to their machine.
5. **Incremental Syncing**: As changes are made, either side can trigger a sync. Viberant computes a manifest, compares differences, safely snapshots data before overwriting, and transfers only the changed files.

---

## 5. One-Click Deployment
**Goal:** Take a web project online instantly.

1. **Select Project**: The user selects a web-based project in the `Projects` tab.
2. **Navigate to Deploy**: The user switches to the `Ship` (Deploy) tab.
3. **Bind Provider**: If not already connected, the user provides a Vercel access token.
4. **Deploy**: The user clicks "Put Site Online". Viberant communicates with the Vercel API to package and deploy the project.
5. **Outcome**: Viberant displays deployment progress and eventually provides the live URL, allowing the user to view their published site immediately.

---

## 6. Using the AI Diagnostic Assistant ("Ask")
**Goal:** Get AI help directly within the context of the current local project.

1. **Navigate to Ask**: The user switches to the `Ask` tab.
2. **Select Provider**: The user chooses between configured providers (Claude, OpenAI, Gemini).
3. **Query**: The user asks a question, requests a code review, or asks for a diagnostic of a bug.
4. **Context-Aware Response**: The assistant securely reads the local project files to provide an accurate, project-specific answer. If an API error occurs (e.g., rate limit), Viberant translates it into a plain English, actionable sentence.
