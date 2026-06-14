import { App, TFile } from "obsidian";
import { ensureFolderExists } from "@/utils";
import { logError, logInfo } from "@/logger";
import { parseNote, serializeNote } from "@/knowledge/markdownNote";
import { slugify } from "@/knowledge/slug";
import { isNearDuplicate, rankByRelevance } from "@/knowledge/retrieval";
import type { KnowledgeSource } from "@/knowledge/types";

/** A skill as read back from disk: frontmatter fields plus the raw markdown body. */
export interface SkillNote {
  slug: string;
  name: string;
  description: string;
  whenToUse: string;
  tags: string[];
  confidence: number;
  source: KnowledgeSource;
  created: string;
  /** Full markdown body (When to Use / Steps / Pitfalls) for full injection. */
  body: string;
}

/** Fields required to create a new skill note. */
export interface NewSkill {
  name: string;
  description: string;
  whenToUse: string;
  steps: string[];
  pitfalls: string;
  tags: string[];
  confidence: number;
  source: KnowledgeSource;
}

/** Render the human-readable markdown body for a skill. */
function renderSkillBody(skill: NewSkill): string {
  const parts: string[] = [];
  if (skill.whenToUse) parts.push(`## When to Use\n${skill.whenToUse}`);
  if (skill.steps.length > 0) {
    const steps = skill.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
    parts.push(`## Steps\n${steps}`);
  }
  if (skill.pitfalls) parts.push(`## Pitfalls\n${skill.pitfalls}`);
  return parts.join("\n\n");
}

/**
 * Persists reusable skills as individual markdown notes in a dedicated vault
 * folder, in the spirit of odysseus' SKILL.md files. Frontmatter holds the
 * metadata used for indexing and relevance matching; the body holds the
 * human-readable procedure that gets injected when a skill is relevant.
 */
export class SkillStore {
  private readonly app: App;
  private readonly folderPath: string;

  constructor(app: App, folderPath: string) {
    this.app = app;
    this.folderPath = folderPath.replace(/\/+$/, "");
  }

  /** Read and parse every skill note in the folder. */
  async list(): Promise<SkillNote[]> {
    const prefix = `${this.folderPath}/`;
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix));
    const notes: SkillNote[] = [];
    for (const file of files) {
      try {
        const parsed = parseNote(await this.app.vault.cachedRead(file));
        const fm = parsed.frontmatter;
        notes.push({
          slug: file.basename,
          name: String(fm.name ?? file.basename),
          description: String(fm.description ?? ""),
          whenToUse: String(fm.whenToUse ?? ""),
          tags: Array.isArray(fm.tags) ? fm.tags : [],
          confidence: typeof fm.confidence === "number" ? fm.confidence : 0,
          source: ((fm.source as string) || "auto") as KnowledgeSource,
          created: String(fm.created ?? ""),
          body: parsed.body,
        });
      } catch (error) {
        logError("[SkillStore] Failed to read skill note:", file.path, error);
      }
    }
    return notes;
  }

  /**
   * Add a new skill note, skipping near-duplicates of existing skills (matched
   * on name + description).
   *
   * @returns true if a new note was written, false if skipped as a duplicate.
   */
  async add(skill: NewSkill): Promise<boolean> {
    const name = skill.name.trim();
    if (!name) return false;

    const existing = await this.list();
    const signature = `${name} ${skill.description}`;
    if (existing.some((s) => isNearDuplicate(`${s.name} ${s.description}`, signature, 0.7))) {
      logInfo("[SkillStore] Skipping near-duplicate skill:", name);
      return false;
    }

    await ensureFolderExists(this.folderPath);
    const slug = await this.uniqueSlug(slugify(name));
    const created = new Date().toISOString();
    const note = serializeNote(
      {
        name,
        description: skill.description,
        whenToUse: skill.whenToUse,
        tags: skill.tags,
        confidence: skill.confidence,
        source: skill.source,
        created,
      },
      renderSkillBody(skill)
    );
    await this.app.vault.create(`${this.folderPath}/${slug}.md`, note);
    logInfo("[SkillStore] Stored skill:", name);
    return true;
  }

  /**
   * A one-line-per-skill catalogue, always-injected so the agent knows which
   * skills exist before doing domain work.
   */
  async index(): Promise<string> {
    const skills = await this.list();
    if (skills.length === 0) return "";
    return skills.map((s) => `- \`${s.name}\` — ${s.description}`).join("\n");
  }

  /**
   * Recall skills relevant to a query, ranked by token overlap across name,
   * description, when-to-use, tags, and procedure body.
   *
   * @param query - Current user message.
   * @param k - Maximum number of skills to return.
   */
  async recall(query: string, k: number): Promise<SkillNote[]> {
    const skills = await this.list();
    return rankByRelevance(
      query,
      skills,
      (s) => `${s.name} ${s.description} ${s.whenToUse} ${s.tags.join(" ")} ${s.body}`,
      k
    );
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
