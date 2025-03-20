import { PluginSettingTab, App, Setting } from "obsidian";
import Main from "./main";

export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		override plugin: Main,
	) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Empty index file color")
			.setDesc("Color that empty index files have in graph views")
			.addColorPicker((picker) => {
				picker
					.setValue(this.plugin.settings.emptyIndexFileColor)
					.onChange(async (v) => {
						this.plugin.settings.emptyIndexFileColor = v;
						await this.plugin.saveSettings();
						this.plugin.updateCacheWithVirtualFolders();
						this.plugin.rerenderGraphViews();
					});
			});

		new Setting(containerEl)
			.setName("Non-empty index file color")
			.setDesc("Color that non-empty index files have in graph views")
			.addColorPicker((picker) => {
				picker
					.setValue(this.plugin.settings.nonEmptyIndexFileColor)
					.onChange(async (v) => {
						this.plugin.settings.nonEmptyIndexFileColor = v;
						await this.plugin.saveSettings();
						this.plugin.updateCacheWithVirtualFolders();
						this.plugin.rerenderGraphViews();
					});
			});

		new Setting(containerEl)
			.setName("Root color")
			.setDesc("Color that the root node have in graph views")
			.addColorPicker((picker) => {
				picker
					.setValue(this.plugin.settings.rootIndexFileColor)
					.onChange(async (v) => {
						this.plugin.settings.rootIndexFileColor = v;
						await this.plugin.saveSettings();
						this.plugin.updateCacheWithVirtualFolders();
						this.plugin.rerenderGraphViews();
					});
			});
	}
}
export interface Settings {
	template: string;
}
export const DEFAULT_SETTINGS: Settings = {
	template: `# {{folderName}}
{{folderChildrenList}}
`,
};
