import { App } from "obsidian";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getSettings } from "@/settings/model";
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
