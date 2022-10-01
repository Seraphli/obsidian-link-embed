import { App, PluginSettingTab, Setting } from 'obsidian';
import ObsidianLinkEmbedPlugin from 'main';
import { parseOptions } from './parser';

export interface ObsidianLinkEmbedPluginSettings {
	popup: boolean;
	parser: string;
	backup: string;
	inPlace: boolean;
	debug: boolean;
}

export const DEFAULT_SETTINGS: ObsidianLinkEmbedPluginSettings = {
	popup: true,
	parser: 'microlink',
	backup: 'jsonlink',
	inPlace: false,
	debug: false,
};

export class ObsidianLinkEmbedSettingTab extends PluginSettingTab {
	plugin: ObsidianLinkEmbedPlugin;

	constructor(app: App, plugin: ObsidianLinkEmbedPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Link Embed' });

		new Setting(containerEl)
			.setName('Popup Menu')
			.setDesc('Auto popup embed menu after paste url.')
			.addToggle((value) => {
				value.setValue(this.plugin.settings.popup).onChange((value) => {
					this.plugin.settings.popup = value;
					this.plugin.saveSettings();
				});
			});
		new Setting(containerEl)
			.setName('Primary Parser')
			.setDesc('Select a primary parser to use for link embeds.')
			.addDropdown((value) => {
				value
					.addOptions(parseOptions)
					.setValue(this.plugin.settings.parser)
					.onChange((value) => {
						this.plugin.settings.parser = value;
						this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName('Secondary Parser')
			.setDesc(
				'Select a secondary parser. It will be used if the primary parser fails.',
			)
			.addDropdown((value) => {
				value
					.addOptions(parseOptions)
					.setValue(this.plugin.settings.backup)
					.onChange((value) => {
						this.plugin.settings.backup = value;
						this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName('In Place')
			.setDesc('Always replace selection with embed.')
			.addToggle((value) => {
				value
					.setValue(this.plugin.settings.inPlace)
					.onChange((value) => {
						this.plugin.settings.inPlace = value;
						this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName('Debug')
			.setDesc('Enable debug mode.')
			.addToggle((value) => {
				value.setValue(this.plugin.settings.debug).onChange((value) => {
					this.plugin.settings.debug = value;
					this.plugin.saveSettings();
				});
			});
	}
}
