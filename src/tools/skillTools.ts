import { z } from "zod";
import { createLangChainTool } from "./createLangChainTool";
import { SkillStore } from "@/knowledge/SkillStore";
import { getSettings } from "@/settings/model";
import { logError } from "@/logger";

const skillSchema = z.object({
  action: z
    .enum(["list", "view", "create"])
    .describe("'list' all skills, 'view' one skill's full procedure, or 'create' a new skill"),
  name: z.string().optional().describe("Skill name. Required for 'view' and 'create'."),
  description: z.string().optional().describe("One-line description. Required for 'create'."),
  whenToUse: z.string().optional().describe("When the skill should be used. Used for 'create'."),
  steps: z.array(z.string()).optional().describe("Ordered procedure steps. Required for 'create'."),
  tags: z.array(z.string()).optional().describe("Keyword tags. Used for 'create'."),
  pitfalls: z.string().optional().describe("Known gotchas. Used for 'create'."),
});

/**
 * Lets the agent (or user) consult and curate the learned-skills library:
 * list the catalogue, read a specific skill's full procedure, or explicitly
 * record a new reusable skill alongside the ones created automatically.
 */
export const manageSkillsTool = createLangChainTool({
  name: "manageSkills",
  description:
    "Consult or create reusable skills (learned procedures). Use 'list' to see available skills, 'view' to read one's full steps before doing the work, or 'create' to save a new reusable procedure.",
  schema: skillSchema,
  func: async (args) => {
    try {
      const store = new SkillStore(app, getSettings().skillsFolder);

      if (args.action === "list") {
        const index = await store.index();
        return { success: true, skills: index || "(no skills yet)" };
      }

      if (args.action === "view") {
        if (!args.name) return { success: false, message: "A skill name is required to view." };
        const skills = await store.list();
        const match = skills.find((s) => s.name.toLowerCase() === args.name!.toLowerCase());
        if (!match) return { success: false, message: `No skill named "${args.name}".` };
        return { success: true, skill: `# ${match.name}\n${match.description}\n\n${match.body}` };
      }

      // create
      if (!args.name || !args.description || !args.steps || args.steps.length === 0) {
        return {
          success: false,
          message: "Creating a skill requires name, description, and at least one step.",
        };
      }
      const created = await store.add({
        name: args.name,
        description: args.description,
        whenToUse: args.whenToUse ?? "",
        steps: args.steps,
        pitfalls: args.pitfalls ?? "",
        tags: args.tags ?? [],
        confidence: 0.9,
        source: "user",
      });
      return created
        ? { success: true, message: `Saved skill "${args.name}".` }
        : { success: false, message: `A similar skill already exists; not created.` };
    } catch (error: unknown) {
      logError("[manageSkillsTool] Error:", error);
      return {
        success: false,
        message: `Failed to manage skills: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
