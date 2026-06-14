import { generatePromptDebugReportForAgent, resolveBasePrompt } from "./promptDebugService";
import type ChainManager from "@/LLMProviders/chainManager";
import { ModelAdapter, PromptSection } from "./modelAdapter";
import { PromptDebugReport } from "./toolPromptDebugger";
import { getSystemPromptWithMemory } from "@/system-prompts/systemPromptBuilder";

jest.mock("@/system-prompts/systemPromptBuilder", () => ({
  getSystemPromptWithMemory: jest.fn().mockResolvedValue("base prompt with recalled knowledge"),
}));

const createAdapter = () => ({
  buildSystemPromptSections: jest.fn(
    (
      basePrompt: string,
      toolDescriptions: string,
      toolNames?: string[],
      toolMetadata?: unknown[]
    ): PromptSection[] => [
      {
        id: "system",
        label: "System",
        source: "test",
        content: `${basePrompt}::${toolDescriptions}::${toolNames?.join(",") || ""}::${
          toolMetadata?.length ?? 0
        }`,
      },
    ]
  ),
  enhanceUserMessage: jest.fn((message: string) => `${message} (enhanced)`),
  constructor: { name: "TestAdapter" },
});

const createChainContext = (history: unknown[] = []): ChainManager => {
  const memory = {
    loadMemoryVariables: jest.fn().mockResolvedValue({ history }),
  };

  return {
    memoryManager: {
      getMemory: () => memory,
    },
  } as unknown as ChainManager;
};

describe("promptDebugService", () => {
  it("builds prompt debug report with annotated sections", async () => {
    const adapter = createAdapter();
    const chainManager = createChainContext([{ _getType: () => "human", content: "hello" }]);

    const report: PromptDebugReport = await generatePromptDebugReportForAgent({
      chainManager,
      adapter: adapter as unknown as ModelAdapter,
      basePrompt: "BasePrompt",
      toolDescriptions: "<tool></tool>",
      toolNames: ["localSearch"],
      toolMetadata: [
        {
          id: "localSearch",
          displayName: "Vault Search",
          description: "Search",
          category: "search",
        },
      ],
      userMessage: {
        message: "search my notes",
        originalMessage: "search my notes",
        sender: "user",
        timestamp: null,
        isVisible: true,
      },
    });

    expect(adapter.buildSystemPromptSections).toHaveBeenCalledWith(
      "BasePrompt",
      "<tool></tool>",
      ["localSearch"],
      expect.any(Array)
    );
    expect(adapter.enhanceUserMessage).toHaveBeenCalledWith("search my notes", true);
    expect(report.sections.map((section) => section.id)).toEqual([
      "system",
      "chat-history",
      "user-original-message",
      "user-enhanced-message",
    ]);
    expect(report.annotatedPrompt).toContain("[Section: System | Source: test]");
    expect(report.systemPrompt).toBeDefined();
  });

  it("resolves base prompt via the knowledge-aware system prompt builder", async () => {
    const chainManager = { app: {} } as unknown as ChainManager;

    const prompt = await resolveBasePrompt(chainManager);

    expect(getSystemPromptWithMemory).toHaveBeenCalledWith(chainManager.app);
    expect(prompt).toBe("base prompt with recalled knowledge");
  });
});
