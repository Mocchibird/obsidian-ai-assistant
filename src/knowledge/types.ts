/**
 * Shared types for the automatic knowledge subsystem (memories + skills).
 *
 * Both memories and skills are persisted as individual markdown notes with YAML
 * frontmatter inside dedicated vault folders, so they are human-readable, editable,
 * and automatically picked up by the vault's semantic index.
 */

/** Category of a durable memory, used for light grouping and pinning. */
export type MemoryCategory = "identity" | "preference" | "fact" | "contact" | "project" | "goal";

/** Provenance of a knowledge record. */
export type KnowledgeSource = "auto" | "user";

/**
 * A single durable fact about the user, stored as one markdown note in the
 * configured Memory folder.
 */
export interface MemoryRecord {
  /** Filename slug (also the note basename, without extension). */
  slug: string;
  /** The fact itself — a single short sentence. */
  text: string;
  /** Light category used for grouping and auto-pinning identity facts. */
  category: MemoryCategory;
  /** ISO-8601 creation timestamp. */
  created: string;
  /** Whether this fact was extracted automatically or added by the user. */
  source: KnowledgeSource;
  /** Pinned memories are always injected regardless of relevance (e.g. identity). */
  pinned: boolean;
  /** ISO-8601 timestamp of the last knowledge audit, or undefined if never audited. */
  audited?: string;
}

/**
 * A reusable procedure the agent can follow again, stored as one markdown note
 * in the configured Skills folder.
 */
export interface SkillRecord {
  /** Filename slug (kebab-case, also the note basename). */
  slug: string;
  /** Human-readable skill name. */
  name: string;
  /** One-line description of what the skill does (used in the skill index). */
  description: string;
  /** When the agent should reach for this skill. */
  whenToUse: string;
  /** Ordered, concrete steps to perform the procedure. */
  steps: string[];
  /** Known pitfalls / gotchas (optional). */
  pitfalls: string;
  /** Free-form keyword tags used for relevance matching. */
  tags: string[];
  /** Model-reported reliability/reusability, 0..1. */
  confidence: number;
  /** Provenance. */
  source: KnowledgeSource;
  /** ISO-8601 creation timestamp. */
  created: string;
}
