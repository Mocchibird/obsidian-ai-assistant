import { TFile, Vault } from "obsidian";
import { mockTFile } from "@/__tests__/mockObsidian";
import {
  getFileExtension,
  isSupportedDocument,
  saveAndParseDocument,
  uniqueVaultPath,
} from "./documentUpload";

/**
 * Minimal in-memory Vault stub covering only the methods the orchestrator uses:
 * getAbstractFileByPath, createBinary, create.
 */
function makeVault() {
  const files = new Map<string, TFile>();
  const created: Array<{ path: string; content: string }> = [];
  const vault = {
    files,
    created,
    getAbstractFileByPath: jest.fn((path: string) => files.get(path) ?? null),
    createBinary: jest.fn(async (path: string) => {
      const f = mockTFile({
        path,
        name: path.split("/").pop() ?? "",
        basename: (path.split("/").pop() ?? "").replace(/\.[^.]+$/, ""),
        extension: path.split(".").pop() ?? "",
      });
      files.set(path, f);
      return f;
    }),
    create: jest.fn(async (path: string, content: string) => {
      const f = mockTFile({
        path,
        name: path.split("/").pop() ?? "",
        basename: (path.split("/").pop() ?? "").replace(/\.[^.]+$/, ""),
        extension: "md",
      });
      files.set(path, f);
      created.push({ path, content });
      return f;
    }),
  };
  return vault;
}

function asVault(v: ReturnType<typeof makeVault>): Vault {
  return v as unknown as Vault;
}

describe("getFileExtension / isSupportedDocument", () => {
  test("extracts lower-cased extension", () => {
    expect(getFileExtension("Report.PDF")).toBe("pdf");
    expect(getFileExtension("data.xlsx")).toBe("xlsx");
    expect(getFileExtension("noext")).toBe("");
  });

  test("recognizes supported document types only", () => {
    expect(isSupportedDocument("a.pdf")).toBe(true);
    expect(isSupportedDocument("a.docx")).toBe(true);
    expect(isSupportedDocument("a.xlsx")).toBe(true);
    expect(isSupportedDocument("a.xls")).toBe(true);
    expect(isSupportedDocument("a.png")).toBe(false);
    expect(isSupportedDocument("a.md")).toBe(false);
    expect(isSupportedDocument("a.txt")).toBe(false);
  });
});

describe("uniqueVaultPath", () => {
  test("returns the plain path when nothing collides", () => {
    const vault = makeVault();
    expect(uniqueVaultPath(asVault(vault), "copilot/files", "report.pdf")).toBe(
      "copilot/files/report.pdf"
    );
  });

  test("appends an index before the extension on collision", () => {
    const vault = makeVault();
    vault.files.set("copilot/files/report.pdf", mockTFile({ path: "copilot/files/report.pdf" }));
    expect(uniqueVaultPath(asVault(vault), "copilot/files", "report.pdf")).toBe(
      "copilot/files/report (1).pdf"
    );
  });
});

describe("saveAndParseDocument", () => {
  function makeFile(name: string): File {
    // jsdom's File lacks arrayBuffer(); stub it (Electron's File has it). Content
    // is irrelevant here since parseFile is injected.
    return {
      name,
      size: 3,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as unknown as File;
  }

  test("saves original and writes a sidecar with extracted text", async () => {
    const vault = makeVault();
    const result = await saveAndParseDocument(
      asVault(vault),
      makeFile("report.pdf"),
      "copilot/files",
      async () => "Hello from the PDF"
    );

    expect(result.original.path).toBe("copilot/files/report.pdf");
    expect(result.sidecar?.path).toBe("copilot/files/report.md");
    const sidecar = vault.created.find((c) => c.path === "copilot/files/report.md");
    expect(sidecar?.content).toContain("<!-- source: copilot/files/report.pdf -->");
    expect(sidecar?.content).toContain("Hello from the PDF");
  });

  test("keeps the original but writes no sidecar when extraction is empty", async () => {
    const vault = makeVault();
    const result = await saveAndParseDocument(
      asVault(vault),
      makeFile("scan.pdf"),
      "copilot/files",
      async () => "   "
    );

    expect(result.original.path).toBe("copilot/files/scan.pdf");
    expect(result.sidecar).toBeNull();
    expect(result.failureReason).toBe("no extractable text");
    expect(vault.created).toHaveLength(0);
  });

  test("treats parser '[Error:' output as a failure (no sidecar)", async () => {
    const vault = makeVault();
    const result = await saveAndParseDocument(
      asVault(vault),
      makeFile("broken.docx"),
      "copilot/files",
      async () => "[Error: Could not extract content from broken.docx]"
    );

    expect(result.sidecar).toBeNull();
    expect(vault.created).toHaveLength(0);
  });

  test("captures a thrown parser error as failureReason", async () => {
    const vault = makeVault();
    const result = await saveAndParseDocument(
      asVault(vault),
      makeFile("x.xlsx"),
      "copilot/files",
      async () => {
        throw new Error("boom");
      }
    );

    expect(result.original.path).toBe("copilot/files/x.xlsx");
    expect(result.sidecar).toBeNull();
    expect(result.failureReason).toBe("boom");
  });

  test("does not collide the sidecar with an existing note of the same name", async () => {
    const vault = makeVault();
    vault.files.set("copilot/files/report.md", mockTFile({ path: "copilot/files/report.md" }));
    const result = await saveAndParseDocument(
      asVault(vault),
      makeFile("report.pdf"),
      "copilot/files",
      async () => "content"
    );
    expect(result.sidecar?.path).toBe("copilot/files/report (1).md");
  });
});
