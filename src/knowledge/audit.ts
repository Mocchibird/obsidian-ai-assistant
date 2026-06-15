/**
 * Prompts and parsers for the periodic knowledge audit — a reflective pass over
 * the memories and skills that were learned automatically, in the spirit of the
 * odysseus project's self-maintaining memory. The audit asks the model to flag
 * stale, low-value, or duplicate entries so they can be pruned.
 *
 * Everything here is pure (no LLM, no Obsidian) so it can be unit-tested
 * directly. The IO orchestration lives in AutoKnowledgeManager.
 */

/** Milliseconds in a day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A memory entry presented to the auditor. */
export interface MemoryAuditItem {
  id: string;
  text: string;
  category: string;
  created: string;
}

/** A skill entry presented to the auditor. */
export interface SkillAuditItem {
  id: string;
  name: string;
  description: string;
  whenToUse: string;
  created: string;
}

/** The auditor's verdict for a single entry. */
export interface AuditVerdict {
  /** Slug/id of the entry the verdict applies to. */
  id: string;
  /** "keep" leaves the entry untouched; "remove" trashes it (recoverable). */
  action: "keep" | "remove";
  /** Short justification (e.g. "duplicate of X", "outdated"). */
  reason: string;
}

/**
 * Decide whether an entry is due for auditing. An entry is due when it has
 * never been audited or its last audit is older than the configured interval.
 *
 * @param audited - ISO-8601 timestamp of the last audit, or undefined/empty.
 * @param intervalDays - Re-audit interval in days.
 * @param nowMs - Current time in epoch milliseconds.
 */
export function isAuditDue(
  audited: string | undefined,
  intervalDays: number,
  nowMs: number
): boolean {
  if (!audited) return true;
  const last = Date.parse(audited);
  if (Number.isNaN(last)) return true;
  return nowMs - last >= intervalDays * MS_PER_DAY;
}

/** System prompt driving the memory audit. */
export const MEMORY_AUDIT_SYSTEM_PROMPT = `You are auditing a user's long-term memory store. Each memory is a short durable fact that was saved automatically from past conversations.

For EACH memory, decide whether to "keep" or "remove" it. Remove a memory ONLY when it is clearly:
- Outdated or superseded by another listed memory (keep the most current one).
- A duplicate or subset of another listed memory (keep the clearest one, remove the redundant ones).
- Trivial, generic, or low-value for future conversations.

Be conservative: when in doubt, KEEP. Do not remove a memory just because it is specific or old if it still reflects a durable fact.

Return ONLY a JSON array, one object per memory, each with:
- "id": the exact id of the memory
- "action": "keep" or "remove"
- "reason": a short justification (under 12 words)

Return valid JSON only, no markdown fences.`;

/** System prompt driving the skill audit. */
export const SKILL_AUDIT_SYSTEM_PROMPT = `You are auditing an AI agent's library of learned skills (reusable procedures saved from past sessions in a note-taking app).

For EACH skill, decide whether to "keep" or "remove" it. Remove a skill ONLY when it is clearly:
- A duplicate or near-duplicate of another listed skill (keep the clearer/more general one).
- Obsolete, overly narrow/one-off, or low-quality such that it is unlikely to help again.

Be conservative: when in doubt, KEEP.

Return ONLY a JSON array, one object per skill, each with:
- "id": the exact id of the skill
- "action": "keep" or "remove"
- "reason": a short justification (under 12 words)

Return valid JSON only, no markdown fences.`;

/** Build the human turn listing the memories to audit. */
export function buildMemoryAuditHuman(items: MemoryAuditItem[]): string {
  const lines = items.map(
    (m) => `- id: ${m.id} | category: ${m.category} | created: ${m.created} | "${m.text}"`
  );
  return `Audit these ${items.length} memories and return a verdict for every id:\n\n${lines.join("\n")}`;
}

/** Build the human turn listing the skills to audit. */
export function buildSkillAuditHuman(items: SkillAuditItem[]): string {
  const lines = items.map(
    (s) =>
      `- id: ${s.id} | name: ${s.name} | created: ${s.created}\n  description: ${s.description}\n  whenToUse: ${s.whenToUse}`
  );
  return `Audit these ${items.length} skills and return a verdict for every id:\n\n${lines.join("\n")}`;
}

/** Strip reasoning-model `<think>` blocks and surrounding markdown fences. */
function stripModelNoise(content: string): string {
  let text = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) text = fence[1].trim();
  return text;
}

/**
 * Parse the auditor response into validated verdicts. Unknown or malformed
 * entries are dropped; an unrecognized action defaults to the safe "keep".
 * Never throws — returns an empty array on any malformed/empty response.
 */
export function parseAuditVerdicts(content: string): AuditVerdict[] {
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
  const results: AuditVerdict[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const obj = entry as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    if (!id) continue;
    const rawAction = typeof obj.action === "string" ? obj.action.trim().toLowerCase() : "keep";
    // Anything other than an explicit "remove" is treated as the safe default.
    const action: AuditVerdict["action"] = rawAction === "remove" ? "remove" : "keep";
    const reason = typeof obj.reason === "string" ? obj.reason.trim() : "";
    results.push({ id, action, reason });
  }
  return results;
}
