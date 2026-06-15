import { App, Notice, TFile } from "obsidian";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getSettings } from "@/settings/model";
import { ensureFolderExists } from "@/utils";
import { logError, logInfo } from "@/logger";
import type { ChatMessage } from "@/types/message";
import { MemoryStore } from "@/knowledge/MemoryStore";
import { SkillStore } from "@/knowledge/SkillStore";
import {
  MEMORY_EXTRACT_SYSTEM_PROMPT,
  SKILL_EXTRACT_SYSTEM_PROMPT,
  buildSkillExtractionHuman,
  parseMemoryExtraction,
  parseSkillExtraction,
} from "@/knowledge/extraction";
import {
  MEMORY_AUDIT_SYSTEM_PROMPT,
  SKILL_AUDIT_SYSTEM_PROMPT,
  buildMemoryAuditHuman,
  buildSkillAuditHuman,
  isAuditDue,
  parseAuditVerdicts,
} from "@/knowledge/audit";

/** Max recent messages fed to the memory extractor. */
const MEMORY_CONTEXT_WINDOW = 6;
/** Memories injected per recall (beyond always-on pinned memories). */
const MEMORY_RECALL_K = 3;
/** Skills injected in full per recall. */
const SKILL_RECALL_K = 3;
/** Minimum agent complexity before attempting skill extraction. */
const SKILL_MIN_TOOL_CALLS = 2;
const SKILL_MIN_ROUNDS = 2;
/** Skills below this model-reported confidence are dropped (likely one-offs). */
const SKILL_MIN_CONFIDENCE = 0.6;

/**
 * Orchestrates automatic memory creation, automatic skill creation, and
 * RAG-ranked recall of both into the prompt. Extraction runs in the background
 * (fire-and-forget) so it never blocks the chat UX. This is the single edge
 * where the knowledge subsystem touches settings and the Obsidian app.
 */
export class AutoKnowledgeManager {
  private static instance: AutoKnowledgeManager | undefined;
  private readonly app: App;
  private extractingMemory = false;
  private extractingSkill = false;
  private auditing = false;

  private constructor(app: App) {
    this.app = app;
  }

  /** Get (or lazily create) the singleton bound to the current app. */
  static getInstance(app: App): AutoKnowledgeManager {
    if (!AutoKnowledgeManager.instance) {
      AutoKnowledgeManager.instance = new AutoKnowledgeManager(app);
    }
    return AutoKnowledgeManager.instance;
  }

  /** Reset the singleton (used on plugin reload/unload). */
  static reset(): void {
    AutoKnowledgeManager.instance = undefined;
  }

  private memoryStore(): MemoryStore {
    return new MemoryStore(this.app, getSettings().autoMemoryFolder);
  }

  private skillStore(): SkillStore {
    return new SkillStore(this.app, getSettings().skillsFolder);
  }

  /**
   * Inspect a finished conversation and, in the background, extract up to two
   * durable personal facts into the Memory folder. No-op when disabled.
   *
   * @param messages - The full chat transcript for the current conversation.
   * @param chatModel - Model used to perform the extraction.
   */
  maybeExtractMemory(messages: ChatMessage[], chatModel?: BaseChatModel): void {
    if (!getSettings().enableAutoMemory || !chatModel || messages.length === 0) return;
    if (this.extractingMemory) return;
    this.extractingMemory = true;
    void this.extractMemory(messages, chatModel)
      .catch((error) => logError("[AutoKnowledge] Memory extraction failed:", error))
      .finally(() => {
        this.extractingMemory = false;
      });
  }

  private async extractMemory(messages: ChatMessage[], chatModel: BaseChatModel): Promise<void> {
    const transcript = messages
      .slice(-MEMORY_CONTEXT_WINDOW)
      .map((m) => `${m.sender}: ${m.message}`)
      .join("\n\n");
    const response = await chatModel.invoke([
      new SystemMessage(MEMORY_EXTRACT_SYSTEM_PROMPT),
      new HumanMessage(transcript),
    ]);
    const facts = parseMemoryExtraction(response.text ?? "");
    if (facts.length === 0) {
      logInfo("[AutoKnowledge] No durable memories extracted.");
      return;
    }
    const store = this.memoryStore();
    for (const fact of facts) {
      await store.add(fact.text, fact.category, "auto");
    }
  }

  /**
   * After a sufficiently complex agent run, extract a reusable skill into the
   * Skills folder in the background. No-op when disabled or when the run was too
   * simple to yield a reusable procedure.
   *
   * @param params.transcript - Formatted agent session transcript.
   * @param params.rounds - Number of agent reasoning rounds.
   * @param params.toolCalls - Number of tool calls made during the run.
   * @param chatModel - Model used to perform the extraction.
   */
  maybeExtractSkill(
    params: { transcript: string; rounds: number; toolCalls: number },
    chatModel?: BaseChatModel
  ): void {
    if (!getSettings().enableAutoSkillCreation || !chatModel) return;
    if (params.toolCalls < SKILL_MIN_TOOL_CALLS && params.rounds < SKILL_MIN_ROUNDS) {
      logInfo("[AutoKnowledge] Agent run too simple for skill extraction; skipping.");
      return;
    }
    if (this.extractingSkill) return;
    this.extractingSkill = true;
    void this.extractSkill(params, chatModel)
      .catch((error) => logError("[AutoKnowledge] Skill extraction failed:", error))
      .finally(() => {
        this.extractingSkill = false;
      });
  }

  private async extractSkill(
    params: { transcript: string; rounds: number; toolCalls: number },
    chatModel: BaseChatModel
  ): Promise<void> {
    const response = await chatModel.invoke([
      new SystemMessage(SKILL_EXTRACT_SYSTEM_PROMPT),
      new HumanMessage(
        buildSkillExtractionHuman(params.transcript, params.rounds, params.toolCalls)
      ),
    ]);
    const skill = parseSkillExtraction(response.text ?? "");
    if (!skill) {
      logInfo("[AutoKnowledge] No reusable skill extracted.");
      return;
    }
    if (skill.confidence < SKILL_MIN_CONFIDENCE) {
      logInfo(
        `[AutoKnowledge] Skill "${skill.title}" below confidence floor (${skill.confidence}); dropped.`
      );
      return;
    }
    await this.skillStore().add({
      name: skill.title,
      description: skill.description,
      whenToUse: skill.whenToUse,
      steps: skill.steps,
      pitfalls: skill.pitfalls,
      tags: skill.tags,
      confidence: skill.confidence,
      source: "auto",
    });
  }

  /**
   * Run a periodic audit of stored memories and skills in the background.
   * Throttled per-entry: only entries not audited within the configured
   * interval are reviewed, so calling this on every launch re-audits each entry
   * roughly once per interval. Stale, low-value, and duplicate entries are moved
   * to the trash (recoverable) and recorded in an audit log. No-op when disabled
   * or when nothing is due.
   *
   * @param chatModel - Model used to evaluate the entries.
   */
  maybeRunAudit(chatModel?: BaseChatModel): void {
    const settings = getSettings();
    if (!settings.enableKnowledgeAudit || !chatModel) return;
    if (!settings.enableAutoMemory && !settings.enableAutoSkillCreation) return;
    if (this.auditing) return;
    this.auditing = true;
    void this.runAudit(chatModel)
      .catch((error) => logError("[AutoKnowledge] Knowledge audit failed:", error))
      .finally(() => {
        this.auditing = false;
      });
  }

  private async runAudit(chatModel: BaseChatModel): Promise<void> {
    const settings = getSettings();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const intervalDays = settings.knowledgeAuditIntervalDays;

    const removed: string[] = [];
    let keptCount = 0;

    if (settings.enableAutoMemory) {
      const res = await this.auditMemories(chatModel, intervalDays, now, nowIso);
      removed.push(...res.removed);
      keptCount += res.kept;
    }
    if (settings.enableAutoSkillCreation) {
      const res = await this.auditSkills(chatModel, intervalDays, now, nowIso);
      removed.push(...res.removed);
      keptCount += res.kept;
    }

    if (removed.length === 0 && keptCount === 0) {
      logInfo("[AutoKnowledge] Audit: nothing due.");
      return;
    }

    if (removed.length > 0) {
      await this.appendAuditLog(nowIso, removed, keptCount);
      new Notice(
        `Copilot knowledge audit: removed ${removed.length} stale/duplicate note(s), kept ${keptCount}. See the audit log; deleted notes are in your trash.`
      );
    }
    logInfo(`[AutoKnowledge] Audit complete: removed ${removed.length}, kept ${keptCount}.`);
  }

  /** Audit memories that are due; returns removed descriptions and kept count. */
  private async auditMemories(
    chatModel: BaseChatModel,
    intervalDays: number,
    now: number,
    nowIso: string
  ): Promise<{ removed: string[]; kept: number }> {
    const store = this.memoryStore();
    const all = await store.list();
    // Never auto-remove pinned (e.g. identity) memories; exclude them entirely.
    const due = all.filter((m) => !m.pinned && isAuditDue(m.audited, intervalDays, now));
    if (due.length === 0) return { removed: [], kept: 0 };

    const items = due.map((m) => ({
      id: m.slug,
      text: m.text,
      category: m.category,
      created: m.created,
    }));
    const response = await chatModel.invoke([
      new SystemMessage(MEMORY_AUDIT_SYSTEM_PROMPT),
      new HumanMessage(buildMemoryAuditHuman(items)),
    ]);
    const byId = new Map(parseAuditVerdicts(response.text ?? "").map((v) => [v.id, v]));

    const removed: string[] = [];
    let kept = 0;
    for (const m of due) {
      const verdict = byId.get(m.slug);
      if (verdict?.action === "remove") {
        await store.remove(m.slug);
        removed.push(`memory "${m.text}" — ${verdict.reason || "flagged by audit"}`);
      } else {
        await store.markAudited(m.slug, nowIso);
        kept++;
      }
    }
    return { removed, kept };
  }

  /** Audit skills that are due; returns removed descriptions and kept count. */
  private async auditSkills(
    chatModel: BaseChatModel,
    intervalDays: number,
    now: number,
    nowIso: string
  ): Promise<{ removed: string[]; kept: number }> {
    const store = this.skillStore();
    const all = await store.list();
    const due = all.filter((s) => isAuditDue(s.audited, intervalDays, now));
    if (due.length === 0) return { removed: [], kept: 0 };

    const items = due.map((s) => ({
      id: s.slug,
      name: s.name,
      description: s.description,
      whenToUse: s.whenToUse,
      created: s.created,
    }));
    const response = await chatModel.invoke([
      new SystemMessage(SKILL_AUDIT_SYSTEM_PROMPT),
      new HumanMessage(buildSkillAuditHuman(items)),
    ]);
    const byId = new Map(parseAuditVerdicts(response.text ?? "").map((v) => [v.id, v]));

    const removed: string[] = [];
    let kept = 0;
    for (const s of due) {
      const verdict = byId.get(s.slug);
      if (verdict?.action === "remove") {
        await store.remove(s.slug);
        removed.push(`skill "${s.name}" — ${verdict.reason || "flagged by audit"}`);
      } else {
        await store.markAudited(s.slug, nowIso);
        kept++;
      }
    }
    return { removed, kept };
  }

  /**
   * Append a dated entry to the knowledge audit log note, creating it if needed.
   * The log lives in the memory folder but carries no record frontmatter, so it
   * is ignored by memory recall and by future audits.
   */
  private async appendAuditLog(
    nowIso: string,
    removed: string[],
    keptCount: number
  ): Promise<void> {
    const folder = getSettings().autoMemoryFolder.replace(/\/+$/, "");
    await ensureFolderExists(folder);
    const path = `${folder}/Knowledge Audit Log.md`;
    const date = nowIso.slice(0, 10);
    const entry = [
      `## ${date}`,
      ...removed.map((r) => `- Removed ${r}`),
      `- Kept ${keptCount} entr${keptCount === 1 ? "y" : "ies"}.`,
    ].join("\n");

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      const current = await this.app.vault.read(existing);
      await this.app.vault.modify(existing, `${current.trimEnd()}\n\n${entry}\n`);
    } else {
      const header =
        "# Copilot Knowledge Audit Log\n\n" +
        "Automatic record of memories and skills pruned by the periodic audit. " +
        "Deleted notes are in your trash and can be restored.\n\n";
      await this.app.vault.create(path, `${header}${entry}\n`);
    }
  }

  /**
   * Build a system-prompt section containing memories and skills relevant to the
   * current message. Memories that are pinned are always included; everything
   * else is RAG-ranked by token overlap. Returns an empty string when there is
   * nothing relevant to inject.
   *
   * @param query - The current user message used for relevance ranking.
   */
  async getRecallSection(query: string): Promise<string> {
    const settings = getSettings();
    const sections: string[] = [];

    if (settings.enableAutoMemory) {
      try {
        const memories = await this.memoryStore().recall(query, MEMORY_RECALL_K);
        if (memories.length > 0) {
          const lines = memories.map((m) => `- ${m.text}`).join("\n");
          sections.push(`<user_memories>\n${lines}\n</user_memories>`);
        }
      } catch (error) {
        logError("[AutoKnowledge] Failed to recall memories:", error);
      }
    }

    if (settings.enableAutoSkillCreation) {
      try {
        const store = this.skillStore();
        const index = await store.index();
        if (index) {
          sections.push(
            `<available_skills>\nReusable procedures you have learned. Consult a relevant one before doing the work yourself.\n${index}\n</available_skills>`
          );
          const relevant = await store.recall(query, SKILL_RECALL_K);
          if (relevant.length > 0) {
            const detailed = relevant
              .map((s) => `### ${s.name}\n${s.description}\n\n${s.body}`)
              .join("\n\n");
            sections.push(`<relevant_skills>\n${detailed}\n</relevant_skills>`);
          }
        }
      } catch (error) {
        logError("[AutoKnowledge] Failed to recall skills:", error);
      }
    }

    if (sections.length === 0) return "";
    return `<learned_knowledge>\nThe following memories and skills were learned automatically from past sessions. Use them only when relevant to the current request.\n\n${sections.join(
      "\n\n"
    )}\n</learned_knowledge>`;
  }
}
