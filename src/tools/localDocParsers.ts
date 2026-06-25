/**
 * Local, on-device text extraction for uploaded documents (PDF / Word / Excel).
 *
 * These are pure functions: they take raw bytes and return plain text, with no
 * dependency on Obsidian, the Vault, or settings. That keeps them trivially
 * unit-testable (per AGENTS.md "pass data, not services") and lets the heavy
 * parsing libraries be the only thing this module pulls in.
 *
 * All extraction runs in-process — nothing is sent to a remote service.
 */

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
// Importing the worker module and registering it on globalThis makes pdf.js use
// its main-thread "fake worker" path (see PDFWorker.#mainThreadWorkerMessageHandler
// in pdf.mjs), so the whole parser bundles into the single plugin file with no
// separate worker asset and no network/URL dependency.
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { logWarn } from "@/logger";

// Register the bundled worker code for main-thread execution. Idempotent.
// pdf.js reads the JS realm global `globalThis.pdfjsWorker` (not a per-window
// object) to find its main-thread WorkerMessageHandler, so target globalThis.
// eslint-disable-next-line obsidianmd/no-global-this -- pdf.js reads globalThis.pdfjsWorker by spec, not a popout window
(globalThis as Record<string, unknown>).pdfjsWorker = pdfjsWorker;

/** Collapse runs of blank lines/whitespace so extracted text stays compact. */
function tidy(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract text from a PDF's text layer using pdf.js (main thread). Returns the
 * concatenated page text. Scanned/image-only PDFs yield little or no text — the
 * caller should treat a near-empty result as "no extractable text".
 *
 * @param data - Raw PDF bytes.
 */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  // Text extraction needs neither embedded fonts nor CMap network assets.
  const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: false });
  const doc = await loadingTask.promise;

  try {
    const pages: string[] = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      pages.push(pageText);
      page.cleanup();
    }
    return tidy(pages.join("\n\n"));
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Extract plain text from a Word (.docx) document via mammoth's raw-text mode
 * (ignores styling). Legacy binary .doc is not supported by mammoth.
 *
 * @param data - Raw .docx bytes as an ArrayBuffer.
 */
export async function extractDocxText(data: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  for (const message of result.messages) {
    if (message.type === "error") {
      logWarn("[localDocParsers] docx extraction warning:", message.message);
    }
  }
  return tidy(result.value ?? "");
}

/**
 * Extract text from a spreadsheet (.xlsx/.xls) via SheetJS. Each sheet is
 * rendered as CSV under a `## <sheet name>` heading so the model can tell sheets
 * apart. Empty sheets are skipped.
 *
 * @param data - Raw spreadsheet bytes.
 */
export function extractXlsxText(data: Uint8Array): string {
  const workbook = XLSX.read(data, { type: "array" });
  const sections: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
    if (csv.length === 0) continue;
    sections.push(`## ${sheetName}\n${csv}`);
  }
  return tidy(sections.join("\n\n"));
}
