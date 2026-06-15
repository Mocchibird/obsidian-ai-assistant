import { TFile, TFolder, normalizePath } from "obsidian";
import { z } from "zod";
import { ensureFolderExists } from "@/utils";
import { trashFile } from "@/utils/vaultAdapterUtils";
import { logInfo, logWarn } from "@/logger";
import { createLangChainTool } from "./createLangChainTool";

/**
 * Result of a single bulk operation, returned in the per-item results array so
 * the agent can report exactly what succeeded and what failed.
 */
interface BulkItemResult {
  status: "ok" | "skipped" | "failed";
  /** Human-readable detail (error message, reason for skip, or summary). */
  message: string;
  from?: string;
  to?: string;
  path?: string;
}

/**
 * Returns the parent folder portion of a vault-relative path, or "" for a path
 * at the vault root.
 */
function parentFolderOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

const moveFilesSchema = z.object({
  operations: z
    .array(
      z.object({
        from: z
          .string()
          .min(1)
          .describe(
            "Current vault-relative path of the file or folder to move (no leading slash)."
          ),
        to: z
          .string()
          .min(1)
          .describe(
            "New vault-relative destination path. For files, include the filename and extension. Missing parent folders are created automatically."
          ),
      })
    )
    .min(1)
    .describe("List of move/rename operations to perform in a single call."),
});

/**
 * Bulk move/rename tool. Moves many files or folders in one call and lets
 * Obsidian rewrite every backlink automatically, so vault restructuring does
 * not break links. Operations are applied in order; each succeeds or fails
 * independently and a per-item report is returned.
 */
const moveFilesTool = createLangChainTool({
  name: "moveFiles",
  description: `Move or rename many files and/or folders in a single operation. Backlinks across the vault are updated automatically so links never break. Use this for bulk vault restructuring instead of moving items one at a time.`,
  schema: moveFilesSchema,
  func: async ({ operations }) => {
    const results: BulkItemResult[] = [];
    let movedCount = 0;

    for (const op of operations) {
      const from = normalizePath(op.from.trim()).replace(/^\/+/, "");
      const to = normalizePath(op.to.trim()).replace(/^\/+/, "");

      if (!from || !to) {
        results.push({ status: "failed", from: op.from, to: op.to, message: "Empty path." });
        continue;
      }

      if (from === to) {
        results.push({
          status: "skipped",
          from,
          to,
          message: "Source and destination are identical.",
        });
        continue;
      }

      const source = app.vault.getAbstractFileByPath(from);
      if (!source) {
        results.push({ status: "failed", from, to, message: `Source not found: "${from}".` });
        continue;
      }

      if (app.vault.getAbstractFileByPath(to)) {
        results.push({
          status: "failed",
          from,
          to,
          message: `Destination already exists: "${to}". Choose a different name or delete the existing item first.`,
        });
        continue;
      }

      try {
        const parent = parentFolderOf(to);
        if (parent) {
          await ensureFolderExists(parent);
        }
        await app.fileManager.renameFile(source, to);
        movedCount++;
        results.push({
          status: "ok",
          from,
          to,
          message:
            source instanceof TFolder ? "Folder moved (links updated)." : "Moved (links updated).",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logWarn(`moveFiles: failed to move "${from}" → "${to}": ${message}`);
        results.push({ status: "failed", from, to, message });
      }
    }

    const failedCount = results.filter((r) => r.status === "failed").length;
    logInfo(`moveFiles: ${movedCount} moved, ${failedCount} failed of ${operations.length}`);

    return {
      moved: movedCount,
      failed: failedCount,
      skipped: results.filter((r) => r.status === "skipped").length,
      total: operations.length,
      results,
    };
  },
});

const deleteFilesSchema = z.object({
  paths: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      "List of vault-relative paths (files or folders) to delete. No leading slash. Deleting a folder removes its contents."
    ),
});

/**
 * Bulk delete tool. Sends each target to the system trash (recoverable) rather
 * than permanently erasing it. Returns a per-item report.
 */
const deleteFilesTool = createLangChainTool({
  name: "deleteFiles",
  description: `Delete many files and/or folders in a single operation by moving them to the system trash (recoverable). Use for bulk cleanup during vault restructuring.`,
  schema: deleteFilesSchema,
  func: async ({ paths }) => {
    const results: BulkItemResult[] = [];
    let deletedCount = 0;

    for (const rawPath of paths) {
      const path = normalizePath(rawPath.trim()).replace(/^\/+/, "");
      if (!path) {
        results.push({ status: "failed", path: rawPath, message: "Empty path." });
        continue;
      }

      const target = app.vault.getAbstractFileByPath(path);
      if (!target) {
        results.push({ status: "failed", path, message: `Not found: "${path}".` });
        continue;
      }

      try {
        // trashFile honors the user's configured deletion preference (system
        // trash, vault .trash folder, or permanent) — recoverable by default.
        await trashFile(app, target);
        deletedCount++;
        results.push({
          status: "ok",
          path,
          message: target instanceof TFile ? "Moved to trash." : "Folder moved to trash.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logWarn(`deleteFiles: failed to delete "${path}": ${message}`);
        results.push({ status: "failed", path, message });
      }
    }

    const failedCount = results.filter((r) => r.status === "failed").length;
    logInfo(`deleteFiles: ${deletedCount} deleted, ${failedCount} failed of ${paths.length}`);

    return {
      deleted: deletedCount,
      failed: failedCount,
      total: paths.length,
      results,
    };
  },
});

export { moveFilesTool, deleteFilesTool };
