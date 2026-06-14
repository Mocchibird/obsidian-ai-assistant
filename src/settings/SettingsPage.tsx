import CopilotView from "@/components/CopilotView";
import { CHAT_VIEWTYPE } from "@/constants";
import CopilotPlugin from "@/main";
import { getSettings } from "@/settings/model";
import { logError } from "@/logger";
import { App, Notice, PluginSettingTab } from "obsidian";
import React from "react";
import SettingsMainV2 from "@/settings/v2/SettingsMainV2";
import { createPluginRoot } from "@/utils/react/createPluginRoot";

export class CopilotSettingTab extends PluginSettingTab {
  plugin: CopilotPlugin;

  constructor(app: App, plugin: CopilotPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async reloadPlugin() {
    try {
      const chatView = this.app.workspace.getLeavesOfType(CHAT_VIEWTYPE)[0]?.view as CopilotView;

      // Autosave the current chat before reloading
      if (chatView && getSettings().autosaveChat) {
        await this.plugin.autosaveCurrentChat();
      }

      // Reload the plugin
      const app = this.plugin.app as unknown as {
        plugins: {
          disablePlugin: (id: string) => Promise<void>;
          enablePlugin: (id: string) => Promise<void>;
        };
        setting: { openTabById: (id: string) => { display: () => void } };
      };
      await app.plugins.disablePlugin("copilot");
      await app.plugins.enablePlugin("copilot");

      app.setting.openTabById("copilot").display();
      new Notice("Plugin reloaded successfully.");
    } catch (error) {
      new Notice("Failed to reload the plugin. Please reload manually.");
      logError("Error reloading plugin:", error);
    }
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("tw-select-text");
    const div = containerEl.createDiv("div");
    const sections = createPluginRoot(div, this.app);

    sections.render(<SettingsMainV2 plugin={this.plugin} />);
  }
}
