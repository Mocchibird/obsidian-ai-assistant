/**
 * Derive a filesystem- and Obsidian-safe kebab-case slug from arbitrary text.
 * Used as the basename for memory and skill notes.
 *
 * @param text - Source text (a fact or skill title).
 * @param maxLength - Maximum slug length before truncation.
 */
export function slugify(text: string, maxLength = 60): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    // Collapse every run of non-alphanumeric characters (punctuation, whitespace,
    // control chars, characters illegal in Obsidian filenames) into a single hyphen.
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "untitled";
}
