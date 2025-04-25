import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import ObsidianLinkEmbedPlugin from 'main';
import { parseOptions } from './parser';
import { REGEX, MarkdownTemplate } from './constants';
import Mustache from 'mustache';
import he from 'he';

export interface ObsidianLinkEmbedPluginSettings {
	popup: boolean;
	rmDismiss: boolean;
	autoEmbedWhenEmpty: boolean;
	primary: string;
	backup: string;
	inPlace: boolean;
	debug: boolean;
	delay: number;
	linkpreviewApiKey: string;
	jsonlinkApiKey: string;
	metadataTemplate: string;
	useMetadataTemplate: boolean;
	saveImagesToVault: boolean;
	imageFolderPath: string;
	respectImageAspectRatio: boolean;
	defaultImageWidth: number;
	maxImageWidth: number;
}

export const DEFAULT_SETTINGS: ObsidianLinkEmbedPluginSettings = {
	popup: true,
	rmDismiss: false,
	autoEmbedWhenEmpty: false,
	primary: 'local',
	backup: 'microlink',
	inPlace: false,
	debug: false,
	delay: 0,
	linkpreviewApiKey: '',
	jsonlinkApiKey: '',
	metadataTemplate:
		'createdby: "linkembed"\nparser: "{{parser}}"\ndate: "{{date}}"\ncustom_date: "{{#formatDate}}YYYY-MM-DD HH:mm:ss{{/formatDate}}"',
	useMetadataTemplate: false,
	saveImagesToVault: false,
	imageFolderPath: 'link-embed-images',
	respectImageAspectRatio: true,
	defaultImageWidth: 160,
	maxImageWidth: 320,
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
		new Setting(containerEl)
			.setName('Convert Old Embed')
			.setDesc(
				'Convert old html element into new code block. Warning: Use with caution.',
			)
			.addButton((component) => {
				component.setButtonText('Convert');
				component.setTooltip('Use with caution');
				component.setWarning();
				component.onClick(async () => {
					new Notice(`Start Conversion`);
					let listFiles = this.app.vault.getMarkdownFiles();
					for (const file of listFiles) {
						let content = await this.app.vault.read(file);
						const htmlRegex = new RegExp(REGEX.HTML, 'gm');
						let elems = content.matchAll(htmlRegex);
						let bReplace = false;
						for (let elem of elems) {
							let description = elem[5] || '';
							description = description
								.replace(/\n/g, ' ')
								.replace(/\\/g, '\\\\');
							description = he.unescape(description);
							let title = he.unescape(elem[4] || '');
							const origin = elem[0];
							const data = {
								title: title,
								image: elem[2] || '',
								description: description,
								url: elem[1],
							};
							const embed = Mustache.render(
								MarkdownTemplate,
								data,
							);
							if (this.plugin.settings.debug) {
								console.log(
									`[Link Embed] Replace:\nOrigin\n${origin}\nNew\n${embed}\nBefore\n${content}\nAfter\n${content
										.split(origin)
										.join(embed)}`,
								);
							}
							content = content.split(origin).join(embed);
							// content = content.replace(elem[0], embed);
							bReplace = true;
						}
						const errorMatch = content.match(
							new RegExp(REGEX.ERROR, 'gm'),
						);
						if (
							bReplace &&
							errorMatch != null &&
							errorMatch.length
						) {
							new Notice(`Conversion Fail on ${file.path}`);
							if (this.plugin.settings.debug) {
								console.log('[Link Embed] Convert:', content);
							}
						} else {
							await this.app.vault.modify(file, content);
						}
					}
					new Notice(`Conversion End`);
				});
			});

		containerEl.createEl('h3', { text: 'Embed Metadata' });

		new Setting(containerEl)
			.setName('Use Metadata Template')
			.setDesc(
				'Add metadata about what created the embed (plugin name, parser type, date).',
			)
			.addToggle((value) => {
				value
					.setValue(this.plugin.settings.useMetadataTemplate)
					.onChange((value) => {
						this.plugin.settings.useMetadataTemplate = value;
						this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Metadata Template')
			.setDesc(
				'Customize metadata template. Variables: {{parser}} for parser type, {{date}} for date in YYYY-MM-DD format. For custom date format use {{#formatDate}}YYYY-MM-DD HH:mm:ss{{/formatDate}}.',
			)
			.addTextArea((text) => {
				text.inputEl.rows = 4;
				text.inputEl.cols = 50;
				text.setValue(this.plugin.settings.metadataTemplate).onChange(
					(value) => {
						// Try to parse as YAML to ensure it's valid
						try {
							// A simple check to see if the format is valid YAML
							const lines = value.split('\n');
							const isValid = lines.every((line) => {
								if (line.trim() === '') return true;
								return line.includes(':');
							});

							if (isValid) {
								this.plugin.settings.metadataTemplate = value;
								this.plugin.saveSettings();
							}
						} catch (e) {
							// Invalid YAML format, don't save
							if (this.plugin.settings.debug) {
								console.log(
									'[Link Embed] Invalid YAML format in metadata template:',
									e,
								);
							}
						}
					},
				);
			});

		containerEl.createEl('h3', { text: 'Image Settings' });

		new Setting(containerEl)
			.setName('Respect Image Aspect Ratio')
			.setDesc(
				'When enabled, embedded images will maintain their original aspect ratio instead of being forced into a square shape.',
			)
			.addToggle((value) => {
				value
					.setValue(this.plugin.settings.respectImageAspectRatio)
					.onChange((value) => {
						this.plugin.settings.respectImageAspectRatio = value;
						this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Save Images to Vault')
			.setDesc(
				'When enabled, images from links will be saved to your vault.',
			)
			.addToggle((value) => {
				value
					.setValue(this.plugin.settings.saveImagesToVault)
					.onChange((value) => {
						this.plugin.settings.saveImagesToVault = value;
						this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Image Folder Path')
			.setDesc(
				"Folder in your vault where images will be saved. The folder will be created if it doesn't exist.",
			)
			.addText((value) => {
				value
					.setValue(this.plugin.settings.imageFolderPath)
					.onChange((value) => {
						this.plugin.settings.imageFolderPath = value;
						this.plugin.saveSettings();
					});
			});

		containerEl.createEl('h3', { text: 'Provider Settings' });

		new Setting(containerEl)
			.setName('LinkPreview API Key')
			.setDesc('Enter your API key for the LinkPreview provider.')
			.addText((value) => {
				value
					.setValue(this.plugin.settings.linkpreviewApiKey)
					.onChange((value) => {
						this.plugin.settings.linkpreviewApiKey = value;
						this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('JSONLink API Key')
			.setDesc('Enter your API key for the JSONLink provider.')
			.addText((value) => {
				value
					.setValue(this.plugin.settings.jsonlinkApiKey)
					.onChange((value) => {
						this.plugin.settings.jsonlinkApiKey = value;
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
