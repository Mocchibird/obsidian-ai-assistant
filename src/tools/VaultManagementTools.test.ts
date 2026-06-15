import { mockTFile, mockTFolder } from "@/__tests__/mockObsidian";
import { TFile, TFolder } from "obsidian";
import { deleteFilesTool, moveFilesTool } from "./VaultManagementTools";

// ensureFolderExists pulls in a heavy import chain; stub it for these tests.
jest.mock("@/utils", () => ({
  ensureFolderExists: jest.fn().mockResolvedValue(undefined),
}));

import { ensureFolderExists } from "@/utils";

/** Shape of the JSON summary both bulk tools return. */
interface BulkResult {
  moved?: number;
  deleted?: number;
  failed: number;
  skipped?: number;
  total: number;
  results: Array<{
    status: "ok" | "skipped" | "failed";
    message: string;
    from?: string;
    to?: string;
    path?: string;
  }>;
}

/** Build a TFile mock for a given vault path. */
function makeFile(path: string): TFile {
  return mockTFile({ path, name: path.split("/").pop() ?? "" });
}

/** Build a TFolder mock for a given vault path. */
function makeFolder(path: string): TFolder {
  return mockTFolder({ path, name: path.split("/").pop() ?? "" });
}

let files: Map<string, TFile | TFolder>;
let getAbstractFileByPath: jest.Mock;
let renameFile: jest.Mock;
let trashFile: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();

  files = new Map<string, TFile | TFolder>();
  getAbstractFileByPath = jest.fn((path: string) => files.get(path) ?? null);
  renameFile = jest.fn(async (file: TFile | TFolder, newPath: string) => {
    files.delete(file.path);
    (file as { path: string }).path = newPath;
    files.set(newPath, file);
  });
  trashFile = jest.fn().mockResolvedValue(undefined);

  const appMock = {
    vault: { getAbstractFileByPath },
    fileManager: { renameFile, trashFile },
  };
  (window as unknown as { app: typeof appMock }).app = appMock;
});

/** Invoke a bulk tool and parse its JSON summary. */
async function run(
  tool: { invoke: (args: unknown) => Promise<unknown> },
  args: unknown
): Promise<BulkResult> {
  const raw = (await tool.invoke(args)) as string;
  return JSON.parse(raw) as BulkResult;
}

describe("moveFilesTool", () => {
  test("moves multiple files and reports success", async () => {
    files.set("a/note1.md", makeFile("a/note1.md"));
    files.set("a/note2.md", makeFile("a/note2.md"));

    const result = await run(moveFilesTool, {
      operations: [
        { from: "a/note1.md", to: "b/note1.md" },
        { from: "a/note2.md", to: "b/note2.md" },
      ],
    });

    expect(result.moved).toBe(2);
    expect(result.failed).toBe(0);
    expect(renameFile).toHaveBeenCalledTimes(2);
    expect(ensureFolderExists).toHaveBeenCalledWith("b");
  });

  test("moves a folder in a single operation", async () => {
    files.set("30_Episodic/Japanese", makeFolder("30_Episodic/Japanese"));

    const result = await run(moveFilesTool, {
      operations: [{ from: "30_Episodic/Japanese", to: "30_Areas/Japanese" }],
    });

    expect(result.moved).toBe(1);
    expect(renameFile).toHaveBeenCalledTimes(1);
  });

  test("fails when source is missing", async () => {
    const result = await run(moveFilesTool, {
      operations: [{ from: "missing.md", to: "x/missing.md" }],
    });

    expect(result.moved).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0].message).toContain("Source not found");
    expect(renameFile).not.toHaveBeenCalled();
  });

  test("does not overwrite an existing destination", async () => {
    files.set("a.md", makeFile("a.md"));
    files.set("b.md", makeFile("b.md"));

    const result = await run(moveFilesTool, {
      operations: [{ from: "a.md", to: "b.md" }],
    });

    expect(result.failed).toBe(1);
    expect(result.results[0].message).toContain("already exists");
    expect(renameFile).not.toHaveBeenCalled();
  });

  test("skips identical source and destination", async () => {
    files.set("a.md", makeFile("a.md"));

    const result = await run(moveFilesTool, {
      operations: [{ from: "a.md", to: "a.md" }],
    });

    expect(result.skipped).toBe(1);
    expect(renameFile).not.toHaveBeenCalled();
  });

  test("processes each operation independently when one fails", async () => {
    files.set("ok.md", makeFile("ok.md"));

    const result = await run(moveFilesTool, {
      operations: [
        { from: "ok.md", to: "moved/ok.md" },
        { from: "ghost.md", to: "moved/ghost.md" },
      ],
    });

    expect(result.moved).toBe(1);
    expect(result.failed).toBe(1);
  });
});

describe("deleteFilesTool", () => {
  test("trashes multiple targets", async () => {
    files.set("inbox/Test.md", makeFile("inbox/Test.md"));
    files.set("old", makeFolder("old"));

    const result = await run(deleteFilesTool, {
      paths: ["inbox/Test.md", "old"],
    });

    expect(result.deleted).toBe(2);
    expect(result.failed).toBe(0);
    expect(trashFile).toHaveBeenCalledTimes(2);
  });

  test("reports missing paths as failures", async () => {
    const result = await run(deleteFilesTool, { paths: ["nope.md"] });

    expect(result.deleted).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0].message).toContain("Not found");
  });
});
