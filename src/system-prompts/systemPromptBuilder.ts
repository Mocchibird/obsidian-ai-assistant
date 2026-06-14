import { App } from "obsidian";
import { DateTime } from "luxon";
import { getSettings } from "@/settings/model";
import { DEFAULT_SYSTEM_PROMPT } from "@/constants";
import { AutoKnowledgeManager } from "@/knowledge/AutoKnowledgeManager";
import {
  getDisableBuiltinSystemPrompt,
  getEffectiveSystemPromptContent,
} from "@/system-prompts/state";

/**
 * Get the effective user custom prompt with legacy fallback.
 * This is the single source of truth for user prompt content.
 *
 * Priority: file-based (session override > global default) > legacy setting > ""
 *
 * @returns The user custom prompt content
 */
export function getEffectiveUserPrompt(): string {
  const fileBasedUserPrompt = getEffectiveSystemPromptContent();

  // Fallback: if file-based prompts are unavailable (e.g. migration failed to write files),
  // continue honoring the legacy settings field to fulfill the promise in migration error message.
  return fileBasedUserPrompt || getSettings()?.userSystemPrompt || "";
}

/**
 * Build the complete system prompt for the current session.
 * Combines builtin prompt with user custom instructions.
 *
 * Priority for user prompt: session override > global default > legacy setting fallback > ""
 *
 * @returns The complete system prompt string
 */
export function getSystemPrompt(): string {
  const userPrompt = getEffectiveUserPrompt();

  // Check if builtin prompt is disabled for current session
  const disableBuiltin = getDisableBuiltinSystemPrompt();

  if (disableBuiltin) {
    // Only return user custom prompt
    return userPrompt;
  }

  // Default behavior: use builtin prompt
  const basePrompt = DEFAULT_SYSTEM_PROMPT;

  if (userPrompt) {
    return `${basePrompt}
<user_custom_instructions>
${userPrompt}
</user_custom_instructions>`;
  }
  return basePrompt;
}

/**
 * Build the system prompt with the current date/time and automatically-recalled
 * knowledge prepended.
 *
 * - A live date/time line grounds the model in the present moment, so it doesn't
 *   answer time-sensitive questions from its (stale) training cutoff.
 * - Relevant memories and skills (ranked against the current message) are fetched
 *   from the {@link AutoKnowledgeManager} so every chat mode benefits from learned
 *   knowledge.
 *
 * Both are emitted as a prefix, leaving the trailing `getSystemPrompt()` portion
 * intact for downstream template processing (ChatManager replaces only that
 * suffix).
 *
 * @param app - Obsidian app instance (edge dependency for the knowledge stores).
 * @param query - Current user message used to rank relevant memories/skills.
 * @returns The complete system prompt, with date and learned-knowledge prefixes.
 */
export async function getSystemPromptWithMemory(app: App, query = ""): Promise<string> {
  const systemPrompt = getSystemPrompt();
  const recall = await AutoKnowledgeManager.getInstance(app).getRecallSection(query);

  const now = DateTime.now();
  const dateLine = `The current date and time is ${now.toFormat("yyyy-MM-dd HH:mm")} (${now.zoneName}, ${now.weekdayLong}). Use this as the present moment when answering time-sensitive questions.`;

  const prefix = recall ? `${dateLine}\n${recall}` : dateLine;
  return `${prefix}\n${systemPrompt}`;
}
