# Memory and Self-Host

This fork unlocks every feature for free and keeps your data on your machine. This page covers two of the more advanced, local-first capabilities: the **memory system** (so Copilot can remember things across conversations) and **Self-Host Mode** (so you can run your own search, web, and document-parsing infrastructure instead of relying on any cloud service).

---

## Memory System

The memory system lets Copilot remember things across conversations, so you don't have to repeat yourself. Everything it remembers is stored locally in your vault as plain markdown — nothing leaves your machine for this feature.

### Recent Conversations

Copilot can reference your recent conversation history to provide more contextually relevant responses. This is separate from the current chat window — it's a summary of what you've been working on.

- **Enable**: **Settings → Copilot → Reference Recent Conversation** (on by default)
- **How many**: **Settings → Copilot → Max Recent Conversations** — default 30, range 10–50
- All history is stored locally in your vault (no data leaves your machine for this feature)

### Saved Memories

You can ask Copilot to explicitly remember specific facts about you:

```
@memory remember that I'm preparing for JLPT N3 and prefer bullet-point summaries
```

Copilot saves this to a memory file in your vault and references it in future conversations.

- **Enable**: **Settings → Copilot → Reference Saved Memories** (on by default)
- **Memory folder**: **Settings → Copilot → Memory Folder Name** — default: `copilot/memory`
- **Update memory tool**: The AI can add, update, or remove memories when you ask

### Automatic Memory

In addition to memories you ask for explicitly, Copilot can also remember things on its own — so it gradually learns who you are without you having to spell it out.

After a conversation ends, the plugin quietly reviews it and pulls out up to a couple of durable, personal facts — things like your name, your role, your preferences, or a project you're working on. It ignores passing details and only keeps facts that are likely to stay useful over time.

Each fact is saved as its own plain-markdown note in a dedicated **Memory** folder in your vault. These are ordinary notes — you can open, edit, or delete any of them at any time, and they show up in normal vault search like everything else.

A few things worth knowing:

- **Identity facts are pinned** — core facts (like your name) are always remembered. Other facts are brought back only when they're relevant to what you're currently asking.
- **No clutter** — if a new fact closely matches one you already have, it's skipped, so the folder stays tidy.
- **Fully local** — the review uses the same model you've already configured. Nothing is sent anywhere except the provider you chose.

Settings:

- **Enabled by default.** Automatic memory creation is on out of the box (the `enableAutoMemory` setting).
- **Memory folder**: automatic memories are written to a folder named `Memory` at the root of your vault by default (the `autoMemoryFolder` setting). You can rename or move it; the plugin will use whatever folder is configured.

> Automatic memories are also retrieved automatically and added to the AI's context for each message, ranked by how relevant they are to what you asked. See [Automatic recall](#automatic-recall-memory-and-skills) below.

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
- Custom web search via Firecrawl or Perplexity Sonar (using your own keys)
- Local YouTube transcript extraction via Supadata (using your own key)
- Miyo desktop app for local PDF parsing, semantic search, and more

### Enabling Self-Host Mode

1. Go to **Settings → Copilot → Self-Host**
2. Toggle **Enable Self-Host Mode**
3. Toggle **Enable Miyo** to use the Miyo desktop app for local search, PDF parsing, and context.
4. _(Optional)_ Set **Custom Miyo Server URL** only if Miyo is running on a remote machine. Leave blank to use automatic local service discovery.

### Web Search in Self-Host Mode

Choose your web search provider and supply your own key:

- **Firecrawl** — A web crawling and scraping API. Get a key at firecrawl.dev. Enter it in **Settings → Copilot → Self-Host → Firecrawl API Key**.
- **Perplexity Sonar** — An AI-powered search API. Get a key at perplexity.ai. Enter it in **Settings → Copilot → Self-Host → Perplexity API Key**.

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
