import { ProjectConfig } from "@/aiParams";
import { PDFCache } from "@/cache/pdfCache";
import { ProjectContextCache } from "@/cache/projectContextCache";
import { logError, logInfo, logWarn } from "@/logger";
import { MiyoClient } from "@/miyo/MiyoClient";
import { getMiyoCustomUrl } from "@/miyo/miyoUtils";
import { getSettings } from "@/settings/model";
import { saveConvertedDocOutput as saveConvertedDocOutputCore } from "@/utils/convertedDocOutput";
import { extractRetryTime, isRateLimitError } from "@/utils/rateLimitUtils";
import { Notice, TFile, Vault } from "obsidian";
import { CanvasLoader } from "./CanvasLoader";
import { extractDocxText, extractPdfText, extractXlsxText } from "./localDocParsers";

interface FileParser {
  supportedExtensions: string[];
  parseFile: (file: TFile, vault: Vault) => Promise<string>;
}

/**
 * Minimum number of extracted characters before we trust a local parse. Below
 * this we treat the document as having no usable text layer (e.g. a scanned PDF)
 * and fall back to other strategies / report failure.
 */
const MIN_EXTRACTED_TEXT_CHARS = 16;

/**
 * Thin wrapper that reads the output folder from settings and delegates to the pure function.
 */
export async function saveConvertedDocOutput(
  file: TFile,
  content: string,
  vault: Vault
): Promise<void> {
  const outputFolder = getSettings().convertedDocOutputFolder ?? "";
  await saveConvertedDocOutputCore(file, content, vault, outputFolder);
}

/** Result from SelfHostPdfParser: null = not applicable, { content } = success, { error } = tried and failed. */
type MiyoParseResult = { content: string } | { error: string } | null;

/**
 * Self-host PDF parser bridge using Miyo parse-doc endpoint.
 */
class SelfHostPdfParser {
  private miyoClient: MiyoClient;

  /**
   * Create a new self-host PDF parser.
   */
  constructor() {
    this.miyoClient = new MiyoClient();
  }

  /**
   * Parse a PDF via Miyo when self-host mode is active.
   *
   * @param file - PDF file to parse.
   * @param vault - Obsidian vault instance.
   * @returns Content on success, error reason on failure, or null when not applicable.
   */
  public async parsePdf(file: TFile, vault: Vault): Promise<MiyoParseResult> {
    const settings = getSettings();
    if (!settings.enableMiyo || file.extension.toLowerCase() !== "pdf") {
      return null;
    }

    try {
      const baseUrl = await this.miyoClient.resolveBaseUrl(getMiyoCustomUrl(settings));
      const folderName = vault.getName();
      const response = await this.miyoClient.parseDoc(baseUrl, folderName, file.path);
      if (typeof response.text !== "string" || response.text.trim().length === 0) {
        return { error: "Miyo parse-doc returned empty text" };
      }

      logInfo(`[SelfHostPdfParser] Parsed PDF via Miyo: ${file.path}`);
      return { content: response.text };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logWarn(`[SelfHostPdfParser] Failed to parse ${file.path} via Miyo parse-doc: ${reason}`);
      return { error: reason };
    }
  }
}

class MarkdownParser implements FileParser {
  supportedExtensions = ["md", "base"];

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    return await vault.read(file);
  }
}

class PDFParser implements FileParser {
  supportedExtensions = ["pdf"];
  private pdfCache: PDFCache;
  private selfHostPdfParser: SelfHostPdfParser;

  constructor() {
    this.pdfCache = PDFCache.getInstance();
    this.selfHostPdfParser = new SelfHostPdfParser();
  }

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      logInfo("Parsing PDF file:", file.path);

      // Try to get from cache first
      const cachedResponse = await this.pdfCache.get(file);
      if (cachedResponse) {
        logInfo("Using cached PDF content for:", file.path);
        // Ensure output file exists even on cache hit (user may have just enabled the setting)
        await saveConvertedDocOutput(file, cachedResponse.response, vault);
        return cachedResponse.response;
      }

      // Try local, on-device text extraction first — no remote service needed.
      // Falls through to Miyo/error only when the PDF has little/no text layer
      // (e.g. a scanned PDF), which the remote parser may still OCR.
      try {
        const data = await vault.readBinary(file);
        const localText = await extractPdfText(new Uint8Array(data));
        if (localText.trim().length >= MIN_EXTRACTED_TEXT_CHARS) {
          await this.pdfCache.set(file, { response: localText, elapsed_time_ms: 0 });
          await saveConvertedDocOutput(file, localText, vault);
          return localText;
        }
        logInfo(
          `[PDFParser] Local extraction found little text for ${file.path}; trying fallbacks.`
        );
      } catch (error) {
        logWarn(`[PDFParser] Local PDF extraction failed for ${file.path}:`, error);
      }

      const settings = getSettings();
      if (settings.enableMiyo && file.extension.toLowerCase() === "pdf") {
        const miyoResult = await this.selfHostPdfParser.parsePdf(file, vault);
        if (miyoResult && "content" in miyoResult) {
          await this.pdfCache.set(file, {
            response: miyoResult.content,
            elapsed_time_ms: 0,
          });
          await saveConvertedDocOutput(file, miyoResult.content, vault);
          return miyoResult.content;
        }

        if (miyoResult && "error" in miyoResult) {
          logWarn(`[PDFParser] Miyo parse failed for ${file.path}: ${miyoResult.error}`);
          // Fall through to SelfHostPdfParser direct attempt
        }
      }

      // Try direct SelfHostPdfParser as last resort
      const directResult = await this.selfHostPdfParser.parsePdf(file, vault);
      if (directResult && "content" in directResult) {
        await this.pdfCache.set(file, {
          response: directResult.content,
          elapsed_time_ms: 0,
        });
        await saveConvertedDocOutput(file, directResult.content, vault);
        return directResult.content;
      }

      return `[Error: Could not extract content from PDF ${file.basename}. No PDF processing service is configured.]`;
    } catch (error) {
      logError(`Error extracting content from PDF ${file.path}:`, error);
      return `[Error: Could not extract content from PDF ${file.basename}]`;
    }
  }

  async clearCache(): Promise<void> {
    logInfo("Clearing PDF cache");
    await this.pdfCache.clear();
  }
}

class CanvasParser implements FileParser {
  supportedExtensions = ["canvas"];

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      logInfo("Parsing Canvas file:", file.path);
      const canvasLoader = new CanvasLoader(vault);
      const canvasData = await canvasLoader.load(file);

      // Use the specialized buildPrompt method to create LLM-friendly format
      return canvasLoader.buildPrompt(canvasData);
    } catch (error) {
      logError(`Error parsing Canvas file ${file.path}:`, error);
      return `[Error: Could not parse Canvas file ${file.basename}]`;
    }
  }
}

/**
 * Local Word (.docx) parser — extracts plain text on-device via mammoth.
 * Registered in non-project mode so uploaded/attached Word docs work without a
 * remote document-processing service.
 */
class LocalDocxParser implements FileParser {
  supportedExtensions = ["docx"];

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      logInfo("Parsing DOCX file:", file.path);
      const data = await vault.readBinary(file);
      const text = await extractDocxText(data);
      if (text.trim().length === 0) {
        return `[Error: No extractable text found in ${file.basename}]`;
      }
      return text;
    } catch (error) {
      logError(`Error extracting content from DOCX ${file.path}:`, error);
      return `[Error: Could not extract content from ${file.basename}]`;
    }
  }
}

/**
 * Local spreadsheet (.xlsx/.xls) parser — extracts each sheet as CSV on-device
 * via SheetJS. Registered in non-project mode.
 */
class LocalXlsxParser implements FileParser {
  supportedExtensions = ["xlsx", "xls"];

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      logInfo("Parsing spreadsheet file:", file.path);
      const data = await vault.readBinary(file);
      const text = extractXlsxText(new Uint8Array(data));
      if (text.trim().length === 0) {
        return `[Error: No extractable text found in ${file.basename}]`;
      }
      return text;
    } catch (error) {
      logError(`Error extracting content from spreadsheet ${file.path}:`, error);
      return `[Error: Could not extract content from ${file.basename}]`;
    }
  }
}

/**
 * All file extensions supported by Docs4LLMParser.
 * Extracted as a module-level constant so FileParserManager.getProjectSupportedExtensions()
 * can read the list statically without constructing a full Docs4LLMParser instance.
 *
 * Reason: The static method needs these extensions at UI layer (before any real API client exists),
 * so we can't safely construct Docs4LLMParser just to read a property.
 */
const DOCS4LLM_SUPPORTED_EXTENSIONS: readonly string[] = [
  // Base types
  "pdf",

  // Documents and presentations
  "602",
  "abw",
  "cgm",
  "cwk",
  "doc",
  "docx",
  "docm",
  "dot",
  "dotm",
  "hwp",
  "key",
  "lwp",
  "mw",
  "mcw",
  "pages",
  "pbd",
  "ppt",
  "pptm",
  "pptx",
  "pot",
  "potm",
  "potx",
  "rtf",
  "sda",
  "sdd",
  "sdp",
  "sdw",
  "sgl",
  "sti",
  "sxi",
  "sxw",
  "stw",
  "sxg",
  "txt",
  "uof",
  "uop",
  "uot",
  "vor",
  "wpd",
  "wps",
  "xml",
  "zabw",
  "epub",

  // Images
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "svg",
  "tiff",
  "webp",
  "web",
  "htm",
  "html",

  // Spreadsheets
  "xlsx",
  "xls",
  "xlsm",
  "xlsb",
  "xlw",
  "csv",
  "dif",
  "sylk",
  "slk",
  "prn",
  "numbers",
  "et",
  "ods",
  "fods",
  "uos1",
  "uos2",
  "dbf",
  "wk1",
  "wk2",
  "wk3",
  "wk4",
  "wks",
  "123",
  "wq1",
  "wq2",
  "wb1",
  "wb2",
  "wb3",
  "qpw",
  "xlr",
  "eth",
  "tsv",

  // Audio (limited to 20MB)
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "wav",
  "webm",
];

export class Docs4LLMParser implements FileParser {
  // Reason: Reference the shared constant so getProjectSupportedExtensions() stays in sync
  // with the actual parser registrations without duplicating the list.
  supportedExtensions = [...DOCS4LLM_SUPPORTED_EXTENSIONS];
  private projectContextCache: ProjectContextCache;
  private selfHostPdfParser: SelfHostPdfParser;
  private currentProject: ProjectConfig | null;
  private static lastRateLimitNoticeTime: number = 0;

  public static resetRateLimitNoticeTimer(): void {
    Docs4LLMParser.lastRateLimitNoticeTime = 0;
  }

  constructor(project: ProjectConfig | null = null) {
    this.projectContextCache = ProjectContextCache.getInstance();
    this.selfHostPdfParser = new SelfHostPdfParser();
    this.currentProject = project;
  }

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      logInfo(
        `[Docs4LLMParser] Project ${this.currentProject?.name}: Parsing ${file.extension} file: ${file.path}`
      );

      if (!this.currentProject) {
        logError("[Docs4LLMParser] No project context for parsing file: ", file.path);
        throw new Error("No project context provided for file parsing");
      }

      const cachedContent = await this.projectContextCache.getOrReuseFileContext(
        this.currentProject,
        file.path
      );
      if (cachedContent) {
        logInfo(
          `[Docs4LLMParser] Project ${this.currentProject.name}: Using cached content for: ${file.path}`
        );
        // Ensure output file exists even on cache hit (user may have just enabled the setting)
        await saveConvertedDocOutput(file, cachedContent, vault);
        return cachedContent;
      }
      logInfo(
        `[Docs4LLMParser] Project ${this.currentProject.name}: Cache miss for: ${file.path}. Proceeding to API call.`
      );

      // For PDFs, try Miyo first when self-host mode is active
      if (getSettings().enableMiyo && file.extension.toLowerCase() === "pdf") {
        const miyoResult = await this.selfHostPdfParser.parsePdf(file, vault);
        if (miyoResult && "content" in miyoResult) {
          await this.projectContextCache.setFileContext(
            this.currentProject,
            file.path,
            miyoResult.content
          );
          await saveConvertedDocOutput(file, miyoResult.content, vault);
          logInfo(
            `[Docs4LLMParser] Project ${this.currentProject.name}: Parsed PDF via Miyo: ${file.path}`
          );
          return miyoResult.content;
        }
        if (miyoResult && "error" in miyoResult) {
          throw new Error(`Miyo failed to parse ${file.basename}: ${miyoResult.error}`);
        }
      }

      // For PDFs without Miyo, try direct SelfHostPdfParser
      if (file.extension.toLowerCase() === "pdf") {
        const directResult = await this.selfHostPdfParser.parsePdf(file, vault);
        if (directResult && "content" in directResult) {
          await this.projectContextCache.setFileContext(
            this.currentProject,
            file.path,
            directResult.content
          );
          await saveConvertedDocOutput(file, directResult.content, vault);
          return directResult.content;
        }
        throw new Error(
          `Could not parse PDF ${file.basename}. No PDF processing service configured.`
        );
      }

      // Non-PDF document types: no longer supported without external service
      throw new Error(
        "Document conversion for this file type requires a configured document processing service."
      );
    } catch (error) {
      logError(
        `[Docs4LLMParser] Project ${this.currentProject?.name}: Error processing file ${file.path}:`,
        error
      );

      // Check if this is a rate limit error and show user-friendly notice
      if (isRateLimitError(error)) {
        this.showRateLimitNotice(error);
      }

      throw error; // Propagate the error up
    }
  }

  private showRateLimitNotice(error: unknown): void {
    const now = Date.now();

    // Only show one rate limit notice per minute to avoid spam
    if (now - Docs4LLMParser.lastRateLimitNoticeTime < 60000) {
      return;
    }

    Docs4LLMParser.lastRateLimitNoticeTime = now;

    const retryTime = extractRetryTime(error);

    new Notice(
      `⚠️ Rate limit exceeded for document processing. Please try again in ${retryTime}. Having fewer non-markdown files in the project will help.`,
      10000 // Show notice for 10 seconds
    );
  }

  async clearCache(): Promise<void> {
    // This method is no longer needed as cache clearing is handled at the project level
    logInfo("Cache clearing is now handled at the project level");
  }
}

// Future parsers can be added like this:
/*
class DocxParser implements FileParser {
  supportedExtensions = ["docx", "doc"];

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    // Implementation for Word documents
  }
}
*/

export class FileParserManager {
  private parsers: Map<string, FileParser> = new Map();

  /**
   * Returns the set of file extensions supported in project mode (isProjectMode=true).
   *
   * Reason: The UI status panel needs to distinguish between "pending" (will be processed)
   * and "unsupported" (will never be processed) for non-markdown files. This method
   * exposes the exact extension set used when constructing a project-mode FileParserManager,
   * without requiring a full instantiation with real Vault dependencies.
   *
   * Project mode registers: MarkdownParser + Docs4LLMParser + CanvasParser
   * (PDFParser is skipped because Docs4LLMParser already handles PDFs in project mode)
   */
  public static getProjectSupportedExtensions(): Set<string> {
    const extensions = new Set<string>();

    // MarkdownParser: ["md"]
    extensions.add("md");

    // Docs4LLMParser: all document/image/spreadsheet/audio types (read from shared constant)
    for (const ext of DOCS4LLM_SUPPORTED_EXTENSIONS) {
      extensions.add(ext);
    }

    // CanvasParser: ["canvas"]
    extensions.add("canvas");

    return extensions;
  }

  constructor(_vault: Vault, isProjectMode: boolean = false, project: ProjectConfig | null = null) {
    // Register parsers
    this.registerParser(new MarkdownParser());

    // In project mode, use Docs4LLMParser for all supported files including PDFs
    this.registerParser(new Docs4LLMParser(project));

    // Only register PDFParser when not in project mode
    if (!isProjectMode) {
      this.registerParser(new PDFParser());

      // Local document parsers override Docs4LLMParser for these types in
      // non-project mode, enabling on-device parsing without a remote service.
      if (getSettings().enableDocumentUpload) {
        this.registerParser(new LocalDocxParser());
        this.registerParser(new LocalXlsxParser());
      }
    }

    this.registerParser(new CanvasParser());
  }

  registerParser(parser: FileParser) {
    for (const ext of parser.supportedExtensions) {
      this.parsers.set(ext, parser);
    }
  }

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    const parser = this.parsers.get(file.extension);
    if (!parser) {
      throw new Error(`No parser found for file type: ${file.extension}`);
    }
    return await parser.parseFile(file, vault);
  }

  supportsExtension(extension: string): boolean {
    return this.parsers.has(extension);
  }

  async clearPDFCache(): Promise<void> {
    const pdfParser = this.parsers.get("pdf");
    if (pdfParser instanceof PDFParser) {
      await pdfParser.clearCache();
    }
  }
}
