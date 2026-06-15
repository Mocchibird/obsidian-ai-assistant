import React from "react";
import { SettingItem } from "@/components/ui/setting-item";
import { AGENT_MAX_ITERATIONS_LIMIT, DEFAULT_SETTINGS } from "@/constants";
import { updateSetting, useSettingsValue } from "@/settings/model";
import { ToolDefinition } from "@/tools/ToolRegistry";
import { ToolRegistry } from "@/tools/ToolRegistry";

export const ToolSettingsSection: React.FC = () => {
  const settings = useSettingsValue();
  const registry = ToolRegistry.getInstance();

  const enabledToolIds = new Set(settings.autonomousAgentEnabledToolIds || []);

  // Get configurable tools grouped by category
  const toolsByCategory = registry.getToolsByCategory();
  const configurableTools = registry.getConfigurableTools();

  const handleToolToggle = (toolId: string, enabled: boolean) => {
    const newEnabledIds = new Set(enabledToolIds);
    if (enabled) {
      newEnabledIds.add(toolId);
    } else {
      newEnabledIds.delete(toolId);
    }

    updateSetting("autonomousAgentEnabledToolIds", Array.from(newEnabledIds));
  };

  /**
   * Toggle all CLI tools on or off at once.
   */
  const handleCliMasterToggle = (enabled: boolean, cliTools: ToolDefinition[]) => {
    const newEnabledIds = new Set(enabledToolIds);
    for (const { metadata } of cliTools) {
      if (enabled) {
        newEnabledIds.add(metadata.id);
      } else {
        newEnabledIds.delete(metadata.id);
      }
    }
    updateSetting("autonomousAgentEnabledToolIds", Array.from(newEnabledIds));
  };

  const renderToolsByCategory = () => {
    const categories = Array.from(toolsByCategory.entries()).filter(([_, tools]) =>
      tools.some((t) => configurableTools.includes(t))
    );

    return categories.map(([category, tools]) => {
      const configurableInCategory = tools.filter((t) => configurableTools.includes(t));

      if (configurableInCategory.length === 0) return null;

      // CLI tools get a special grouped section with a single master toggle
      if (category === "cli") {
        const allEnabled = configurableInCategory.every(({ metadata }) =>
          enabledToolIds.has(metadata.id)
        );

        return (
          <div
            key="cli"
            className="tw-flex tw-flex-col tw-gap-2 tw-rounded-md tw-border tw-border-border tw-pb-3"
          >
            <SettingItem
              type="switch"
              title="Obsidian CLI (Experimental)"
              description="Enable direct vault operations via the Obsidian desktop CLI"
              checked={allEnabled}
              onCheckedChange={(checked) => handleCliMasterToggle(checked, configurableInCategory)}
            />
            <div className="tw-ml-4 tw-flex tw-flex-col tw-gap-1 tw-border-l tw-border-border tw-px-3">
              {configurableInCategory.map(({ metadata }) => (
                <div key={metadata.id} className="tw-flex tw-flex-col">
                  <span className="tw-text-xs tw-font-medium tw-text-normal">
                    {metadata.displayName}
                  </span>
                  <span className="tw-text-xs tw-text-muted">{metadata.description}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      return (
        <React.Fragment key={category}>
          {configurableInCategory.map(({ metadata }) => (
            <SettingItem
              key={metadata.id}
              type="switch"
              title={metadata.displayName}
              description={metadata.description}
              checked={enabledToolIds.has(metadata.id)}
              onCheckedChange={(checked) => handleToolToggle(metadata.id, checked)}
            />
          ))}
        </React.Fragment>
      );
    });
  };

  return (
    <section className="tw-space-y-4">
      <div className="tw-text-xl tw-font-bold">Agent</div>
      <SettingItem
        type="slider"
        title="Max Iterations"
        description="Maximum number of tool-call rounds the autonomous agent can perform before stopping. Higher values allow more complex, multi-step tasks (e.g. bulk vault restructuring) but may take longer."
        value={
          settings.autonomousAgentMaxIterations ?? DEFAULT_SETTINGS.autonomousAgentMaxIterations
        }
        onChange={(value) => {
          updateSetting("autonomousAgentMaxIterations", value);
        }}
        min={4}
        max={AGENT_MAX_ITERATIONS_LIMIT}
        step={1}
      />

      <div className="tw-rounded-lg tw-bg-secondary tw-p-4">
        <div className="tw-mb-2 tw-text-sm tw-font-medium">Agent Accessible Tools</div>
        <div className="tw-mb-4 tw-text-xs tw-text-muted">
          Toggle which tools the autonomous agent can use
        </div>

        <div className="tw-flex tw-flex-col tw-gap-2">{renderToolsByCategory()}</div>
      </div>

      <SettingItem
        type="switch"
        title="Periodic Knowledge Audit"
        description="Periodically review learned memories and skills, pruning stale, low-value, or duplicate ones. Runs in the background at launch; removed notes go to your trash (recoverable) and are recorded in a Knowledge Audit Log note."
        checked={settings.enableKnowledgeAudit}
        onCheckedChange={(checked) => updateSetting("enableKnowledgeAudit", checked)}
      />

      {settings.enableKnowledgeAudit && (
        <SettingItem
          type="slider"
          title="Audit Interval (days)"
          description="How often each memory/skill is re-reviewed. Each entry is audited at most once per this many days."
          value={settings.knowledgeAuditIntervalDays ?? DEFAULT_SETTINGS.knowledgeAuditIntervalDays}
          onChange={(value) => updateSetting("knowledgeAuditIntervalDays", value)}
          min={1}
          max={30}
          step={1}
        />
      )}
    </section>
  );
};
