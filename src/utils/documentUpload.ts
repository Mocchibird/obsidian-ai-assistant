import { TFile, Vault } from "obsidian";

/** Document extensions accepted by the chat upload flow. */
export const SUPPORTED_DOCUMENT_EXTENSIONS = ["pdf", "docx", "xlsx", "xls"];

/** Reject uploads larger than this to avoid renderer OOM / token blowup. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25 MB

/** Lower-cased extension (without the dot) of a filename, or "" if none. */
export function getFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** Whether a filename has a supported document extension. */
export function isSupportedDocument(fileName: string): boolean {
  return SUPPORTED_DOCUMENT_EXTENSIONS.includes(getFileExtension(fileName));
}

/**
 * Find a collision-free vault path for `fileName` inside `folder`, appending
 * " (1)", " (2)", … before the extension when needed. Uses the vault cache for
 * existence checks (mirrors ChatPersistenceManager's uniquify behavior).
 */
export function uniqueVaultPath(vault: Vault, folder: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const stem = dot === -1 ? fileName : fileName.slice(0, dot);
  const ext = dot === -1 ? "" : fileName.slice(dot); // includes the leading dot
  let candidate = `${folder}/${fileName}`;
  let i = 1;
  while (vault.getAbstractFileByPath(candidate)) {
    candidate = `${folder}/${stem} (${i})${ext}`;
    i++;
  }
  return candidate;
}

/** Outcome of saving + parsing one uploaded document. */
export interface DocumentUploadResult {
  /** The saved original document (binary) in the upload folder. */
  original: TFile;
  /** The extracted-text markdown sidecar, or null when extraction yielded nothing. */
  sidecar: TFile | null;
  /** Set when no usable text was extracted (e.g. scanned PDF, parse error). */
  failureReason?: string;
}

/**
 * Save an uploaded document to `folder`, extract its text via `parseFile`, and
 * write the text as a markdown sidecar next to the original. The sidecar is
 * created with `vault.create` so it is registered in the vault cache
 * immediately — available both as context this turn and to live grep search.
 *
 * The original binary is always saved (even when text extraction fails) so it
 * is kept for future reference. Pure orchestration: all I/O goes through the
 * injected `vault` and `parseFile`, so it is unit-testable with fakes. The
 * caller must ensure `folder` exists before calling.
 *
 * @param vault - Obsidian vault.
 * @param file - The uploaded browser File.
 * @param folder - Destination folder (e.g. "copilot/files"), already created.
 * @param parseFile - Extracts plain text from the saved original TFile.
 */
export async function saveAndParseDocument(
  vault: Vault,
  file: File,
  folder: string,
  parseFile: (file: TFile) => Promise<string>
): Promise<DocumentUploadResult> {
  const originalPath = uniqueVaultPath(vault, folder, file.name);
  const original = await vault.createBinary(originalPath, await file.arrayBuffer());

  let text: string;
  try {
    text = await parseFile(original);
  } catch (error) {
    return {
      original,
      sidecar: null,
      failureReason: error instanceof Error ? error.message : String(error),
    };
  }

  if (!text || text.startsWith("[Error:") || text.trim().length === 0) {
    return { original, sidecar: null, failureReason: "no extractable text" };
  }

  // Source comment mirrors saveConvertedDocOutput for traceability.
  const content = `<!-- source: ${original.path} -->\n${text}\n`;
  const sidecarPath = uniqueVaultPath(vault, folder, `${original.basename}.md`);
  const sidecar = await vault.create(sidecarPath, content);

  return { original, sidecar };
}
