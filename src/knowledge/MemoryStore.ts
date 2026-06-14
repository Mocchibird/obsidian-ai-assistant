import { App, TFile } from "obsidian";
import { ensureFolderExists } from "@/utils";
import { logError, logInfo } from "@/logger";
import { parseNote, serializeNote } from "@/knowledge/markdownNote";
import { slugify } from "@/knowledge/slug";
import { isNearDuplicate, rankByRelevance } from "@/knowledge/retrieval";
import type { MemoryCategory, MemoryRecord, KnowledgeSource } from "@/knowledge/types";

/**
 * Persists durable memories as individual markdown notes in a dedicated vault
 * folder. Each note carries frontmatter (category, source, pinned, created) and
 * the fact as its body, so memories are human-editable and indexed for search.
 */
export class MemoryStore {
  private readonly app: App;
  private readonly folderPath: string;

  /**
   * @param app - Obsidian app instance.
   * @param folderPath - Vault-relative folder that holds memory notes.
   */
  constructor(app: App, folderPath: string) {
    this.app = app;
    this.folderPath = folderPath.replace(/\/+$/, "");
  }

  /** Read and parse every memory note in the folder. */
  async list(): Promise<MemoryRecord[]> {
    const prefix = `${this.folderPath}/`;
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix));
    const records: MemoryRecord[] = [];
    for (const file of files) {
      try {
        const parsed = parseNote(await this.app.vault.cachedRead(file));
        const fm = parsed.frontmatter;
        // Only treat notes carrying our frontmatter as memory records. This lets
        // the auto-memory folder coexist with the legacy memory files
        // (Recent Conversations.md / Saved Memories.md) without ingesting them.
        if (fm.created === undefined && fm.category === undefined) continue;
        records.push({
          slug: file.basename,
          text: parsed.body || String(fm.text ?? ""),
          category: ((fm.category as string) || "fact") as MemoryCategory,
          created: String(fm.created ?? ""),
          source: ((fm.source as string) || "auto") as KnowledgeSource,
          pinned: fm.pinned === true,
        });
      } catch (error) {
        logError("[MemoryStore] Failed to read memory note:", file.path, error);
      }
    }
    return records;
  }

  /**
   * Add a durable fact as a new memory note, skipping near-duplicates of
   * existing memories. Identity facts are auto-pinned so they are always
   * recalled.
   *
   * @returns true if a new note was written, false if skipped as a duplicate.
   */
  async add(
    text: string,
    category: MemoryCategory,
    source: KnowledgeSource = "auto"
  ): Promise<boolean> {
    const fact = text.trim();
    if (!fact) return false;

    const existing = await this.list();
    if (existing.some((m) => isNearDuplicate(m.text, fact))) {
      logInfo("[MemoryStore] Skipping near-duplicate memory:", fact);
      return false;
    }

    await ensureFolderExists(this.folderPath);
    const slug = await this.uniqueSlug(slugify(fact));
    const created = new Date().toISOString();
    const pinned = category === "identity";
    const note = serializeNote({ category, source, pinned, created }, fact);
    await this.app.vault.create(`${this.folderPath}/${slug}.md`, note);
    logInfo("[MemoryStore] Stored memory:", fact);
    return true;
  }

  /**
   * Recall memories relevant to a query: all pinned memories (always) plus the
   * top relevance-ranked non-pinned memories.
   *
   * @param query - Current user message used for relevance ranking.
   * @param k - Maximum number of non-pinned memories to include.
   */
  async recall(query: string, k: number): Promise<MemoryRecord[]> {
    const all = await this.list();
    const pinned = all.filter((m) => m.pinned);
    const rest = all.filter((m) => !m.pinned);
    const relevant = rankByRelevance(query, rest, (m) => m.text, k);
    return [...pinned, ...relevant];
  }

  /** Ensure the slug does not collide with an existing note in the folder. */
  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let i = 2;
    while (
      this.app.vault.getAbstractFileByPath(`${this.folderPath}/${candidate}.md`) instanceof TFile
    ) {
      candidate = `${base}-${i++}`;
    }
    return candidate;
  }
}
