/**
 * Minimal, dependency-free reader/writer for the markdown notes used by the
 * knowledge subsystem. Each note is `---`-delimited YAML frontmatter followed by
 * a markdown body. We only support the flat value shapes our records use
 * (string, number, boolean, string[]), which keeps this self-contained and
 * testable without pulling in a YAML library or the Obsidian metadata cache.
 */

/** A parsed note: flat frontmatter values plus the markdown body. */
export interface ParsedNote {
  frontmatter: Record<string, string | number | boolean | string[]>;
  body: string;
}

/** Escape a scalar for safe single-line YAML output. */
function serializeScalar(value: string | number | boolean): string {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  // Always quote strings to avoid YAML ambiguity (colons, leading symbols, etc.).
  return JSON.stringify(value);
}

/**
 * Serialize frontmatter + body into a markdown note string.
 * Keys are emitted in insertion order; arrays render as inline JSON-ish lists.
 *
 * @param frontmatter - Flat key/value map.
 * @param body - Markdown body (without frontmatter).
 */
export function serializeNote(
  frontmatter: Record<string, string | number | boolean | string[]>,
  body: string
): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      const items = value.map((v) => serializeScalar(v)).join(", ");
      lines.push(`${key}: [${items}]`);
    } else {
      lines.push(`${key}: ${serializeScalar(value)}`);
    }
  }
  lines.push("---", "");
  return `${lines.join("\n")}\n${body.trim()}\n`;
}

/** Parse a single frontmatter value into its typed form. */
function parseValue(raw: string): string | number | boolean | string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((item) => String(parseScalar(item.trim())));
  }
  return parseScalar(trimmed);
}

/** Parse a scalar token, unwrapping quotes and coercing booleans/numbers. */
function parseScalar(token: string): string | number | boolean {
  if (token === "true") return true;
  if (token === "false") return false;
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    try {
      return JSON.parse(token.startsWith("'") ? `"${token.slice(1, -1)}"` : token) as string;
    } catch {
      return token.slice(1, -1);
    }
  }
  if (token !== "" && !isNaN(Number(token))) return Number(token);
  return token;
}

/**
 * Parse a markdown note string into frontmatter + body. Notes without
 * frontmatter return an empty frontmatter map and the whole input as body.
 *
 * @param content - Raw note file contents.
 */
export function parseNote(content: string): ParsedNote {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content.trim() };
  }
  const frontmatter: Record<string, string | number | boolean | string[]> = {};
  for (const line of match[1].split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    if (!key) continue;
    frontmatter[key] = parseValue(line.slice(sep + 1));
  }
  return { frontmatter, body: match[2].trim() };
}
