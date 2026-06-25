import { App, Notice, TFile } from "obsidian";
import { useCallback } from "react";
import { getSettings } from "@/settings/model";
import { FileParserManager } from "@/tools/FileParserManager";
import { ensureFolderExists } from "@/utils";
import { logError } from "@/logger";
import {
  isSupportedDocument,
  MAX_DOCUMENT_BYTES,
  saveAndParseDocument,
} from "@/utils/documentUpload";

/** Props for the useDocumentUpload hook. */
export interface UseDocumentUploadProps {
  /** Obsidian app instance. */
  app: App;
  /** Setter for the chat's context notes (the extracted sidecar is appended here). */
  setContextNotes: (updater: (prev: TFile[]) => TFile[]) => void;
}

/**
 * Returns a handler that uploads PDF/Word/Excel files into the chat: each file
 * is saved to the configured upload folder, parsed locally to text, written as
 * a markdown sidecar, and attached as a context note for the current turn. The
 * sidecar is also vault-searchable for future questions.
 */
export function useDocumentUpload({ app, setContextNotes }: UseDocumentUploadProps) {
  const uploadDocuments = useCallback(
    async (files: File[]): Promise<void> => {
      const settings = getSettings();
      if (!settings.enableDocumentUpload) {
        new Notice("Document upload is disabled. Enable it in Copilot settings → Agent.");
        return;
      }

      const folder = settings.documentUploadFolder;
      await ensureFolderExists(folder);
      // Non-project FileParserManager so the local PDF/Word/Excel parsers are used.
      const fileParserManager = new FileParserManager(app.vault, false);

      for (const file of files) {
        if (!isSupportedDocument(file.name)) {
          new Notice(
            `Unsupported file type: ${file.name}. Supported: PDF, Word (.docx), Excel (.xlsx).`
          );
          continue;
        }
        if (file.size > MAX_DOCUMENT_BYTES) {
          new Notice(`${file.name} is too large (max ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB).`);
          continue;
        }

        try {
          const { original, sidecar, failureReason } = await saveAndParseDocument(
            app.vault,
            file,
            folder,
            (f) => fileParserManager.parseFile(f, app.vault)
          );

          if (!sidecar) {
            new Notice(
              `Saved ${original.name}, but couldn't extract text${failureReason ? ` (${failureReason})` : ""}.`
            );
            continue;
          }

          setContextNotes((prev) =>
            prev.some((note) => note.path === sidecar.path) ? prev : [...prev, sidecar]
          );
          new Notice(`Added ${original.name} to context.`);
        } catch (error) {
          logError("[useDocumentUpload] Failed to upload document:", error);
          new Notice(`Failed to add ${file.name} to context.`);
        }
      }
    },
    [app, setContextNotes]
  );

  // Return a void-returning handler (fire-and-forget) so it matches the
  // synchronous onAddDocuments callback signature used by the chat UI.
  return useCallback(
    (files: File[]): void => {
      void uploadDocuments(files);
    },
    [uploadDocuments]
  );
}
