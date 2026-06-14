import { z } from "zod";
import { createLangChainTool } from "./createLangChainTool";
import { MemoryStore } from "@/knowledge/MemoryStore";
import { getSettings } from "@/settings/model";
import { logError } from "@/logger";

// Define Zod schema for updateMemoryTool
const memorySchema = z.object({
  statement: z
    .string()
    .min(1)
    .describe("A durable fact about the user to remember across future conversations"),
});

/**
 * Memory tool for saving information the user explicitly asks the assistant to
 * remember. Writes a memory note into the configured memory folder, where it is
 * deduplicated and later recalled automatically alongside auto-created memories.
 */
export const updateMemoryTool = createLangChainTool({
  name: "updateMemory",
  description: "Save a durable fact to memory when the user explicitly asks you to remember it",
  schema: memorySchema,
  func: async ({ statement }) => {
    try {
      const store = new MemoryStore(app, getSettings().autoMemoryFolder);
      const added = await store.add(statement, "fact", "user");

      return added
        ? { success: true, message: `Saved to memory: ${statement}` }
        : { success: false, message: "A similar memory already exists; nothing to add." };
    } catch (error: unknown) {
      logError("[updateMemoryTool] Error updating memory:", error);

      return {
        success: false,
        message: `Failed to save memory: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
