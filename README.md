<h1 align="center">Copilot for Obsidian</h1>

<h2 align="center">
The Ultimate AI Assistant for Your Second Brain
</h2>

<p align="center">
  <img src="https://img.shields.io/github/v/release/Mocchibird/obsidian-ai-assistant?style=for-the-badge&sort=semver" alt="GitHub release (latest SemVer)">
  <img src="https://img.shields.io/github/license/Mocchibird/obsidian-ai-assistant?style=for-the-badge" alt="License">
</p>

<p align="center">
  <a href="https://github.com/Mocchibird/obsidian-ai-assistant">GitHub</a> |
  <a href="https://github.com/Mocchibird/obsidian-ai-assistant/issues/new?template=bug_report.md">Report Bug</a> |
  <a href="https://github.com/Mocchibird/obsidian-ai-assistant/issues/new?template=feature_request.md">Request Feature</a>
</p>

> **Fork notice:** This is an unofficial fork of [Copilot for Obsidian](https://github.com/logancyang/obsidian-copilot) by [Logan Yang](https://github.com/logancyang) / Brevilabs. It **removes the Copilot Plus cloud service layer and all tiered feature gates** so that every feature — including the autonomous agent — is unlocked and runs locally. **Nothing is ever sent to the obsidiancopilot / Brevilabs servers.** Your prompts and notes only go to the LLM provider you configure (bring your own key), or to a model you self-host. The original plugin remains the upstream reference for core functionality. All credit for the original work goes to Logan Yang and the Brevilabs team.

## The What

_Copilot for Obsidian_ is your in‑vault AI assistant with chat-based vault search, web and YouTube support, powerful context processing, and ever-expanding agentic capabilities within Obsidian's highly customizable workspace - all while keeping your data under **your** control.

## The Why

Today's AI giants want **you trapped**: your data on their servers, prompts locked to their models, and switching costs that keep you paying. When they change pricing, shut down features, or terminate your account, you lose everything you built.

We are building the opposite. Our goal is to create a portable agentic experience with no provider lock-in. **Data is always yours.** Use whatever LLM you like. Imagine that a brand new model drops, you run it on your own hardware, and it already knows about you (_long-term memory_), knows how to run _the same commands and tools_ you have defined over time (as just markdown files), and becomes the thought partner and assistant that you _own_. This is AI that grows with you, not a subscription you're hostage to.

## Key Features

- **🔒 Your data is 100% yours**: Local search and storage, direct-to-provider requests, and full control of your data if you use self-hosted models. No cloud middleman.
- **🧠 Bring Your Own Model**: Tap any OpenAI-compatible or local model to uncover insights, spark connections, and create content.
- **🖼️ Multimedia understanding**: Drop in webpages, YouTube videos, images, PDFs, and EPUBs for quick insights.
- **🔍 Smart Vault Search**: Search your vault with chat, no setup required. Embeddings are optional. Copilot delivers results right away.
- **✍️ Composer and Quick Commands**: Interact with your writing with chat, apply changes with 1 click.
- **🗂️ Project Mode**: Create AI-ready context based on folders and tags. Think NotebookLM but inside your vault!
- **🤖 Agent Mode**: An autonomous agent with built-in tool calling. No commands needed — Copilot automatically triggers vault search, web search, or any other relevant tool when appropriate. **Unlocked for everyone in this fork.**

<p align="center">
  <em>Copilot's Agent can call the proper tools on its own upon your request.</em>
</p>
<p align="center">
  <img src="./images/product-ui-screenshot.png" alt="Product UI screenshot" width="800"/>
</p>

## Table of Contents

- [The What](#the-what)
- [The Why](#the-why)
- [Key Features](#key-features)
- [Get Started](#get-started)
  - [Install](#install)
    - [Option A — BRAT (recommended)](#option-a--brat-recommended)
    - [Option B — Manual install from a release](#option-b--manual-install-from-a-release)
    - [Option C — Build from source](#option-c--build-from-source)
  - [Set API Keys](#set-api-keys)
- [Usage](#usage)
  - [Chat Mode](#chat-mode-reference-notes-and-discuss-ideas-with-copilot)
  - [Vault QA Mode](#vault-qa-mode-chat-with-your-entire-vault)
  - [Copilot's Command Palette](#copilots-command-palette)
  - [Relevant Notes](#relevant-notes-notes-suggestions-based-on-semantic-similarity-and-links)
  - [Agent Mode: Autonomous Tool Calling](#agent-mode-autonomous-tool-calling)
  - [Precision Insights From a Specific Time Window](#precision-insights-from-a-specific-time-window)
  - [Understand Images in Your Notes](#understand-images-in-your-notes)
  - [One Prompt, Every Source](#one-prompt-every-source)
- [Privacy & Local-First Design](#privacy--local-first-design)
- [Need Help?](#need-help)
- [FAQ](#faq)
- [Credits](#credits)

## Get Started

This fork is **not** distributed through the Obsidian Community Plugins store. Install it with one of the methods below. The plugin folder id is `copilot`, so it lives at `<your-vault>/.obsidian/plugins/copilot/`.

### Install

#### Option A — BRAT (recommended)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs and auto-updates plugins straight from a GitHub repository.

1. Install the **BRAT** plugin from **Settings → Community plugins → Browse** and enable it.
2. Open the command palette and run **BRAT: Add a beta plugin for testing**.
3. Paste this repository URL: `https://github.com/Mocchibird/obsidian-ai-assistant`
4. Choose the latest release and confirm. BRAT downloads the plugin and keeps it updated.
5. Go to **Settings → Community plugins**, find **Copilot**, and enable it.

#### Option B — Manual install from a release

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [release](https://github.com/Mocchibird/obsidian-ai-assistant/releases).
2. Create the folder `<your-vault>/.obsidian/plugins/copilot/` and copy the three files into it.
3. Restart Obsidian (or reload it), then go to **Settings → Community plugins**, find **Copilot**, and enable it.

#### Option C — Build from source

Requires Node.js (see `package.json` for the supported version) and `npm`.

```bash
git clone https://github.com/Mocchibird/obsidian-ai-assistant.git
cd obsidian-ai-assistant
npm install
npm run build
```

This produces `main.js`, `manifest.json`, and `styles.css` in the repo root. Copy those three files into `<your-vault>/.obsidian/plugins/copilot/`, then enable **Copilot** under **Settings → Community plugins**.

### Set API Keys

Every feature in this fork is free and unlocked — you only need a key for whichever model provider you want to use.

1. Go to **Obsidian → Settings → Copilot → Basic** and click **Set Keys**.
2. Choose your AI provider(s) (e.g., **OpenRouter, Gemini, OpenAI, Anthropic, DeepSeek, xAI**) and paste your API key(s). **OpenRouter is recommended** for the widest model selection from a single key.
3. Prefer to keep everything on your machine? Point Copilot at a local, OpenAI-compatible endpoint (e.g. **Ollama**, **LM Studio**, or a **LiteLLM** proxy) under **Settings → Copilot → Model** — no API key required.

## Usage

#### **Chat Mode: reference notes and discuss ideas with Copilot**

Use `@` to add context and chat with your note.

<p align="center">
    <img src="./images/Add-Context.png" alt="Chat Mode" width="700">
</p>

Ask Copilot:

> _Summarize [[Q3 Retrospective]] and identify the top 3 action items for Q4 based on the notes in {01-Projects}._

<p align="center">
    <img src="./images/Chat-Mode.png" alt="Chat Mode" width="700">
</p>

#### **Vault QA Mode: chat with your entire vault**

Ask Copilot:

> _What are the recurring themes in my research regarding the intersection of AI and SaaS?_

<p align="center">
    <img src="./images/Vault-Mode.png" alt="Vault Mode" width="700">
</p>

#### Copilot's Command Palette

Copilot's Command Palette puts powerful AI capabilities at your fingertips. Access all commands in chat window via `/` or via
right-click menu on selected text.

**Add selection to chat context**

Select text and add it to context. Recommend shortcut: `ctrl/cmd + L`

<p align="center">
    <img src="./images/Add-Selection-to-Context.png" alt="Add Selection to Context" width="700">
</p>

**Quick Command**

Select text and apply action without opening chat. Recommend shortcut: `ctrl/cmd + K`

<p align="center">
    <img src="./images/Quick-Command.png" alt="Quick Command" width="700">
</p>

**Edit and Apply with One Click**

Select text and edit with one RIGHT click.

<p align="center">
    <img src="./images/One-Click-Commands.png" alt="One-Click Commands" width="700">
</p>

**Create your Command**

Create commands and workflows in `Settings → Copilot → Command → Add Cmd`.

<p align="center">
    <img src="./images/Create-Command.png" alt="Create Command" width="700">
</p>

**Command Palette in Chat**

Type `/` to use Command Palette in chat window.

<p align="center">
    <img src="./images/Prompt-Palette.png" alt="Prompt Palette" width="700">
</p>

#### **Relevant Notes: notes suggestions based on semantic similarity and links**

Appears automatically when there's useful related content and links.

Use it to quickly reference past research, ideas, or decisions—no need to search or switch tabs.

<p align="center">
    <img src="./images/Relevant-Notes.png" alt="Relevant Notes" width="700">
</p>

#### **Agent Mode: Autonomous Tool Calling**

Copilot's agent automatically calls the right tools—no manual commands needed. Just ask, and it searches the web, queries your vault, and combines insights seamlessly.

Ask Copilot in agent mode:

> _Research web and my vault and draft a note on AI SaaS onboarding best practices._

<p align="center">
    <img src="./images/Agent-Mode.png" alt="Agent Mode" width="700">
</p>

#### **Precision Insights From a Specific Time Window**

In agent mode, ask Copilot:

> _What did I do last week?_

<p align="center">
    <img src="./images/Time-Based-Queries.png" alt="Time-Based Queries" width="700">
</p>

#### **Understand Images in Your Notes**

Copilot can analyze images embedded in your notes—from wireframes and diagrams to screenshots and photos. Get detailed feedback, suggestions, and insights based on visual content.

Ask Copilot to analyze your wireframes:

> _Analyze the wireframe in [[UX Design - Mobile App Wireframes]] and suggest improvements for the navigation flow._

<p align="center">
    <img src="./images/Note-Image.png" alt="Image Understanding" width="700">
</p>

#### **One Prompt, Every Source**

In agent mode, ask Copilot to pull together a YouTube video, a PDF, and a web search in a single prompt:

> _Compare the information about [Agent Memory] from this YouTube video: [URL], this PDF [file], and @web[search results]. Start with your conclusion in bullet points._

<p align="center">
    <img src="./images/One-Prompt-Every-Source.png" alt="One Prompt, Every Source" width="700">
</p>

## Privacy & Local-First Design

This fork is built so that **no data ever leaves your machine except to the model provider you explicitly choose.**

- **No Brevilabs / obsidiancopilot backend.** The Copilot Plus cloud service layer, license validation, and all `brevilabs` API calls have been removed from the codebase. There is no account, no license key, and no telemetry.
- **Bring Your Own Key.** Your messages, notes, and attachments are sent only to the LLM provider you configure (OpenAI, Anthropic, Google, OpenRouter, DeepSeek, xAI, etc.) — directly, with your own API key.
- **Fully local option.** Point Copilot at a local OpenAI-compatible endpoint (Ollama, LM Studio, LiteLLM) and nothing leaves your device at all.
- **Local search & storage.** Vault search and the embedding index live in your vault. Indexing is optional.

> **Note on cloud-only features:** features in the upstream plugin that depended on the Brevilabs backend (such as cloud document parsing) have been removed or replaced with local equivalents. Web search and YouTube transcript features work against the services you configure.

## **Need Help?**

- If you're experiencing a bug or have a feature idea, please follow the steps below to help us help you faster:
  - 🐛 Bug Report Checklist
    - ☑️ Use the [bug report template](https://github.com/Mocchibird/obsidian-ai-assistant/issues/new?template=bug_report.md) when reporting an issue
    - ☑️ Enable Debug Mode in Copilot Settings → Advanced for more detailed logs
    - ☑️ Open the dev console to collect error messages:
      - Mac: Cmd + Option + I
      - Windows: Ctrl + Shift + I
    - ☑️ Turn off all other plugins, keeping only Copilot enabled
    - ☑️ Attach relevant console logs to your report
  - 💡 Feature Request Checklist
    - ☑️ Use the [feature request template](https://github.com/Mocchibird/obsidian-ai-assistant/issues/new?template=feature_request.md) for requesting a new feature
    - ☑️ Clearly describe the feature, why it matters, and how it would help

## **FAQ**

<details>
  <summary><strong>Why isn’t Vault search finding my notes?</strong></summary>

If you're using the Vault QA mode (or the `@vault` tool in agent mode), try the following:

- Ensure you have a working embedding model from your AI model's provider (e.g. OpenAI).
- Ensure your Copilot indexing is up-to-date.
- If issues persist, run <strong>Force Re-Index</strong> or use <strong>List Indexed Files</strong> from the Command Palette to inspect what's included in the index.
- ⚠️ <strong>Don’t switch embedding models after indexing</strong>—it can break the results.
</details>

<details>
  <summary><strong>Why is my AI model returning error code 429: ‘Insufficient Quota’?</strong></summary>

Most likely this is happening because you haven’t configured billing with your chosen model provider—or you’ve hit your quota. To resolve:

- 🔍 Verify your billing settings in your provider's dashboard
- 💳 Add a payment method if one isn’t already on file
- 📊 Check your usage dashboard for any quota or limit warnings

If you’re using a local model (Ollama, LM Studio), this error does not apply—run a larger model or reduce concurrency instead.

</details>

<details>
  <summary><strong>Why am I getting a token limit error?</strong></summary>

Please refer to your model provider’s documentation for the context window size.

⚠️ If you set a large <strong>max token limit</strong> in your Copilot settings, you may encounter this error.

- <strong>Max tokens</strong> refers to <em>completion tokens</em>, not input tokens.
- A higher output token limit means less room for input!

🧠 Behind-the-scenes prompts for Copilot commands also consume tokens, so keep your message length reasonable and set a sensible max token value.

</details>

<details>
  <summary><strong>How do I update the plugin?</strong></summary>

- If you installed via **BRAT**, updates are automatic (or run **BRAT: Check for updates**).
- If you installed manually, download the latest release and replace `main.js`, `manifest.json`, and `styles.css` in `<your-vault>/.obsidian/plugins/copilot/`.
- If you built from source, `git pull` and run `npm run build` again.

</details>

## Credits

This project stands entirely on the work of the original **[Copilot for Obsidian](https://github.com/logancyang/obsidian-copilot)** by **[Logan Yang](https://github.com/logancyang)** and the **Brevilabs** team. This fork only removes the premium cloud layer and feature gates to keep everything local and open — all core functionality and design credit belongs to them.

If you find the upstream project valuable, please consider [sponsoring Logan's work](https://github.com/sponsors/logancyang).
