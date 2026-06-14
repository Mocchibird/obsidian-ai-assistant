# Memory and Self-Host

This fork unlocks every feature for free and keeps your data on your machine. This page covers two of the more advanced, local-first capabilities: the **memory system** (so Copilot can remember things across conversations) and **Self-Host Mode** (so you can run your own search, web, and document-parsing infrastructure instead of relying on any cloud service).

---

## Memory System

Copilot remembers durable facts about you across conversations, so you don't have to repeat yourself. There is **one** memory system: each fact is stored as its own plain-markdown note in the `copilot/memory` folder in your vault. These are ordinary notes — you can open, edit, or delete any of them at any time, and they show up in normal vault search like everything else. Nothing leaves your machine for this feature.

Memories are created two ways:

### Automatically

After a conversation ends, the plugin quietly reviews it and pulls out up to a couple of durable, personal facts — things like your name, your role, your preferences, or a project you're working on. It ignores passing details and only keeps facts that are likely to stay useful over time.

### On request

You can also ask Copilot to remember something explicitly:

```
@memory remember that I'm preparing for JLPT N3 and prefer bullet-point summaries
```

A few things worth knowing:

- **Identity facts are pinned** — core facts (like your name) are always remembered. Other facts are brought back only when they're relevant to what you're currently asking.
- **No clutter** — if a new fact closely matches one you already have, it's skipped, so the folder stays tidy.
- **Fully local** — the review uses the same model you've already configured. Nothing is sent anywhere except the provider you chose.

Settings:

- **Enabled by default.** Automatic memory creation is on out of the box (the `enableAutoMemory` setting).
- **Memory folder**: memories are written to the `copilot/memory` folder by default (the `autoMemoryFolder` setting). You can rename or move it; the plugin will use whatever folder is configured.

> Memories are retrieved automatically and added to the AI's context for each message, ranked by how relevant they are to what you asked. See [Automatic recall](#automatic-recall-memory-and-skills) below.

---

## Automatic Recall (Memory and Skills)

You don't have to manage any of this by hand. For every message you send, Copilot automatically looks through your saved memories and your [skills](agent-mode-and-tools.md#automatic-skills) and pulls in the ones most relevant to what you just asked, adding them to the AI's working context. The more relevant something is to your current request, the more likely it is to be brought back.

Because memories and skills are stored as plain notes in your vault, they're also found by normal vault search — nothing is hidden in a database you can't reach.

---

## Document Processor

When Copilot processes PDFs and other non-markdown files, it converts them to markdown for the AI to read.

You can optionally save the converted markdown to a folder in your vault:

- **Setting**: **Settings → Copilot → Store converted markdown at**
- Leave empty to skip saving (conversion still happens, it just isn't persisted)

---

## Self-Host Mode

### What Is Self-Host Mode?

Self-Host Mode lets you run the search, web, and document-parsing services that power some advanced features on **your own infrastructure** instead of using any cloud provider. Everything runs locally or on a server you control — Copilot only talks to the endpoints you point it at.

This mode is available to everyone in this fork — there is no license, account, or subscription required.

### What Self-Host Mode Enables

- Use local or custom LLM servers
- Web search via DuckDuckGo (default, no setup), a self-hosted SearXNG instance, or Firecrawl / Perplexity Sonar
- Local YouTube transcript extraction via Supadata (using your own key)
- Miyo desktop app for local PDF parsing, semantic search, and more

### Enabling Self-Host Mode

1. Go to **Settings → Copilot → Self-Host**
2. Toggle **Enable Self-Host Mode**
3. Toggle **Enable Miyo** to use the Miyo desktop app for local search, PDF parsing, and context.
4. _(Optional)_ Set **Custom Miyo Server URL** only if Miyo is running on a remote machine. Leave blank to use automatic local service discovery.

### Web Search

The agent's web search tool (`@web`) needs a search backend. Pick one under **Settings → Copilot → QA → Web Search Provider** — no separate "self-host mode" toggle is required:

- **DuckDuckGo (default, no setup)** — Works out of the box: no API key, no server, nothing to host. Searches go directly to DuckDuckGo. This is what you get on a fresh install. _(It uses DuckDuckGo's public HTML results page, an unofficial interface that can occasionally rate-limit or change.)_
- **SearXNG (self-hosted)** — Run your own [SearXNG](https://docs.searxng.org/) metasearch instance for maximum privacy and point Copilot at it. No API key — your searches go to a server you control. Enter the instance URL (e.g. `http://localhost:8080`) in **SearXNG URL**. Your instance must allow the JSON output format (`search.formats: [json]` in SearXNG's `settings.yml`).
- **Firecrawl** — A hosted web search/scraping API. Get a key at firecrawl.dev and enter it in **Firecrawl API Key**.
- **Perplexity Sonar** — A hosted AI search API. Get a key at perplexity.ai and enter it in **Perplexity API Key**.

### YouTube Transcription in Self-Host Mode

Use your own Supadata API key for YouTube transcript extraction:

- Get a key at supadata.ai
- Enter it in **Settings → Copilot → Self-Host → Supadata API Key**

---

## Miyo Desktop App

Miyo is a companion desktop app that enhances Copilot with local, offline capabilities. It runs entirely on your own machine (or a server you control) — Copilot connects to your Miyo instance, never to any external service.

### What Miyo Provides

- **Local semantic search** — Fast vector search without embedding API calls
- **PDF parsing** — Converts PDFs to markdown locally (no cloud OCR)
- **Context hub** — Manages your indexed documents locally
- **Custom server URL** — Run Miyo on any machine (local or server)

### Setting Up Miyo

1. Download and install the Miyo desktop app
2. Start the Miyo server
3. In Copilot, go to **Settings → Copilot → Self-Host → Enable Miyo Search**
4. Miyo automatically connects to the local server (or use a custom URL in **Miyo Server URL**)
5. Index your vault — Copilot will use Miyo to generate and store embeddings locally

### Custom Miyo Server URL

If Miyo is running on a different machine (e.g., a home server), enter its address:

```
http://192.168.1.10:8742
```

Leave empty to use automatic local discovery.

---

## Related

- [Agent Mode and Tools](agent-mode-and-tools.md) — Using the autonomous agent
- [Vault Search and Indexing](vault-search-and-indexing.md) — How Miyo enhances semantic search
- [Getting Started](getting-started.md) — First-time setup
  </content>
