/**
 * Lightweight, dependency-free retrieval used to RAG-rank the small memory and
 * skill corpora against the current user message.
 *
 * These corpora are tiny (tens of records), so a token-overlap score — the
 * keyword half of a classic hybrid retriever — is fast, deterministic, and
 * needs no embedding round-trips on the hot path. Records also live in the vault
 * and are covered by the full semantic index for `@vault`-style search.
 */

/** Language-agnostic tokenizer: lowercase alphanumeric runs of length >= 2. */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu);
  return matches ?? [];
}

/** Tokenize into a Set for overlap scoring. */
export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

/**
 * Asymmetric overlap score in [0, 1]: the fraction of query tokens that also
 * appear in the document. Favors documents that cover the query terms without
 * penalizing longer documents (unlike strict Jaccard).
 *
 * @param queryTokens - Pre-tokenized query terms.
 * @param docTokens - Pre-tokenized document terms.
 */
export function overlapScore(queryTokens: Set<string>, docTokens: Set<string>): number {
  if (queryTokens.size === 0 || docTokens.size === 0) return 0;
  let hits = 0;
  for (const t of queryTokens) {
    if (docTokens.has(t)) hits++;
  }
  return hits / queryTokens.size;
}

/**
 * Rank items by relevance to a query, returning the top-k whose score clears a
 * minimum threshold. Items are returned in descending score order. When the
 * query is empty, returns the first `k` items unranked (caller-defined order).
 *
 * @param query - The query text (typically the current user message).
 * @param items - Candidate items.
 * @param getText - Extracts the searchable text from an item.
 * @param k - Maximum number of items to return.
 * @param minScore - Minimum overlap score to be considered relevant.
 */
export function rankByRelevance<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
  k: number,
  minScore = 0.05
): T[] {
  if (items.length === 0) return [];
  const queryTokens = tokenSet(query);
  if (queryTokens.size === 0) {
    return items.slice(0, k);
  }
  const scored = items
    .map((item) => ({ item, score: overlapScore(queryTokens, tokenSet(getText(item))) }))
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((entry) => entry.item);
}

/**
 * Whether two texts are near-duplicates by symmetric token overlap (Jaccard).
 * Used to avoid storing the same fact/skill twice.
 *
 * @param a - First text.
 * @param b - Second text.
 * @param threshold - Jaccard similarity at/above which the texts are duplicates.
 */
export function isNearDuplicate(a: string, b: string, threshold = 0.6): boolean {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter++;
  }
  const union = ta.size + tb.size - inter;
  return union > 0 && inter / union >= threshold;
}
