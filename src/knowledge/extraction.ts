/**
 * Prompts and parsers for automatically extracting durable memories and reusable
 * skills from a conversation. The prompts are adapted from the odysseus project's
 * memory/skill extractors and are deliberately conservative: when in doubt, the
 * model is told to extract nothing.
 *
 * Parsing is kept pure (no LLM, no Obsidian) so it can be unit-tested directly.
 */

import type { MemoryCategory } from "@/knowledge/types";

const MEMORY_CATEGORIES: MemoryCategory[] = [
  "identity",
  "preference",
  "fact",
  "contact",
  "project",
  "goal",
];

/** A raw fact candidate returned by the memory extractor. */
export interface ExtractedMemory {
  text: string;
  category: MemoryCategory;
}

/** A raw skill candidate returned by the skill extractor. */
export interface ExtractedSkill {
  title: string;
  description: string;
  whenToUse: string;
  steps: string[];
  pitfalls: string;
  tags: string[];
  confidence: number;
}

/** System prompt that drives automatic memory extraction. */
export const MEMORY_EXTRACT_SYSTEM_PROMPT = `You are a memory extraction assistant. Analyze the conversation and extract ONLY durable personal facts about the user that would be useful across many future conversations.

Good examples: name, job title, city, family members, long-term projects, strong preferences.
Bad examples: what they asked about today, temporary moods, generic statements, things the assistant said, one-off tasks, opinions on the current topic.

Rules:
- MAX 2 facts per conversation — only the most important.
- Only extract facts the USER stated or clearly implied.
- Each fact must be a single short sentence (under 15 words).
- If a fact is likely already known or trivial, skip it.
- If nothing durable was revealed, return [].

Return a JSON array of objects with "text" and "category" fields.
Categories: "identity", "preference", "fact", "contact", "project", "goal".
Return ONLY valid JSON, no markdown fences.`;

/** System prompt that drives automatic skill extraction after an agent run. */
export const SKILL_EXTRACT_SYSTEM_PROMPT = `You are analyzing an AI agent's work session inside a note-taking app (Obsidian).

Extract a reusable "skill" ONLY IF the session contains a concrete, repeatable procedure the agent could follow to solve a similar problem next time (e.g. a sequence of vault searches, note edits, tool calls, or a workflow).

Return the bare word null (no JSON) when the session is NOT a reusable procedure, including:
- A one-off, personal, or context-specific task that won't recur.
- A pure question/answer or explanation with no transferable method.
- The agent failed, gave up, or the approach is not worth repeating.

When (and only when) a genuine reusable procedure exists, return a JSON object with:
- "title": short name (under 10 words)
- "description": one sentence describing what the skill does
- "whenToUse": one sentence on when to reach for it
- "steps": array of 3-7 short step-by-step instructions
- "pitfalls": short note on gotchas (empty string if none)
- "tags": array of 3-5 keyword tags
- "confidence": 0.0-1.0 how reliable AND reusable this procedure is

Be conservative: if in doubt, return null.
Return ONLY valid JSON (or the bare word null), no markdown fences.`;

/** Build the human turn for skill extraction, noting how complex the run was. */
export function buildSkillExtractionHuman(
  transcript: string,
  rounds: number,
  toolCalls: number
): string {
  return `The agent took ${rounds} round(s) and ${toolCalls} tool call(s) to complete the task.

<session_transcript>
${transcript}
</session_transcript>

Extract a reusable skill if one exists, otherwise return null.`;
}

/** Strip reasoning-model `<think>` blocks and surrounding markdown fences. */
function stripModelNoise(content: string): string {
  let text = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) text = fence[1].trim();
  return text;
}

/**
 * Parse the memory extractor response into validated fact candidates.
 * Returns an empty array on any malformed/empty response (never throws).
 */
export function parseMemoryExtraction(content: string): ExtractedMemory[] {
  const text = stripModelNoise(content);
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const results: ExtractedMemory[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const obj = entry as Record<string, unknown>;
    const factText = typeof obj.text === "string" ? obj.text.trim() : "";
    if (!factText) continue;
    const rawCategory = typeof obj.category === "string" ? obj.category.toLowerCase() : "fact";
    const category = (MEMORY_CATEGORIES as string[]).includes(rawCategory)
      ? (rawCategory as MemoryCategory)
      : "fact";
    results.push({ text: factText, category });
  }
  return results.slice(0, 2);
}

/**
 * Parse the skill extractor response into a validated skill candidate, or null
 * when the model declined (the bare word `null`) or the response is malformed.
 */
export function parseSkillExtraction(content: string): ExtractedSkill | null {
  const text = stripModelNoise(content);
  if (text === "" || text.toLowerCase() === "null") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  if (!title) return null;
  const steps = Array.isArray(obj.steps)
    ? obj.steps.filter((s): s is string => typeof s === "string").map((s) => s.trim())
    : [];
  if (steps.length === 0) return null;
  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim())
    : [];
  const confidenceRaw = typeof obj.confidence === "number" ? obj.confidence : 0;
  const confidence = Math.max(0, Math.min(1, confidenceRaw));
  return {
    title,
    description: typeof obj.description === "string" ? obj.description.trim() : title,
    whenToUse: typeof obj.whenToUse === "string" ? obj.whenToUse.trim() : "",
    steps,
    pitfalls: typeof obj.pitfalls === "string" ? obj.pitfalls.trim() : "",
    tags,
    confidence,
  };
}
