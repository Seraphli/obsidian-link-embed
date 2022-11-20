import { App, PluginSettingTab, Setting } from 'obsidian';
import ObsidianLinkEmbedPlugin from 'main';
import { parseOptions } from './parser';

export interface ObsidianLinkEmbedPluginSettings {
	popup: boolean;
	rmDismiss: boolean;
	autoEmbedWhenEmpty: boolean;
	primary: string;
	backup: string;
	inPlace: boolean;
	debug: boolean;
	delay: number;
}

export const DEFAULT_SETTINGS: ObsidianLinkEmbedPluginSettings = {
	popup: true,
	rmDismiss: false,
	autoEmbedWhenEmpty: false,
	primary: 'microlink',
	backup: 'jsonlink',
	inPlace: false,
	debug: false,
	delay: 0,
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

		containerEl.createEl('h3', { text: 'User Option' });

		new Setting(containerEl)
			.setName('Popup Menu')
			.setDesc('Auto popup embed menu after pasting url.')
			.addToggle((value) => {
				value.setValue(this.plugin.settings.popup).onChange((value) => {
					this.plugin.settings.popup = value;
					this.plugin.saveSettings();
				});
			});
		new Setting(containerEl)
			.setName('Remove Dismiss')
			.setDesc(
				'Remove dismiss from popup menu. You can always use ESC to dismiss the popup menu.',
			)
			.addToggle((value) => {
				value
					.setValue(this.plugin.settings.rmDismiss)
					.onChange((value) => {
						this.plugin.settings.rmDismiss = value;
						this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName('Auto Embed')
			.setDesc('Auto embed link when pasting a link into an empty line.')
			.addToggle((value) => {
				value
					.setValue(this.plugin.settings.autoEmbedWhenEmpty)
					.onChange((value) => {
						this.plugin.settings.autoEmbedWhenEmpty = value;
						this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName('Primary Parser')
			.setDesc('Select a primary parser to use for link embeds.')
			.addDropdown((value) => {
				value
					.addOptions(parseOptions)
					.setValue(this.plugin.settings.primary)
					.onChange((value) => {
						this.plugin.settings.primary = value;
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

		containerEl.createEl('h3', { text: 'Dev Option' });

		new Setting(containerEl)
			.setName('Debug')
			.setDesc('Enable debug mode.')
			.addToggle((value) => {
				value.setValue(this.plugin.settings.debug).onChange((value) => {
					this.plugin.settings.debug = value;
					this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Delay')
			.setDesc('Add delay before replacing preview.(ms)')
			.addText((value) => {
				value
					.setValue(String(this.plugin.settings.delay))
					.onChange((value) => {
						if (!isNaN(Number(value))) {
							this.plugin.settings.delay = Number(value);
							this.plugin.saveSettings();
						}
					});
			});
	}
}
