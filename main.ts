import {
	App,
	Editor,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from 'obsidian';
import Mustache from 'mustache';
import { parseOptions, parsers } from './parser';
import { TEMPLATE } from './constants';

interface ObsidianLinkEmbedPluginSettings {
	parser: string;
	backup: string;
	debug: boolean;
}

const DEFAULT_SETTINGS: ObsidianLinkEmbedPluginSettings = {
	parser: 'microlink',
	backup: 'jsonlink',
	debug: false,
};

export default class ObsidianLinkEmbedPlugin extends Plugin {
	settings: ObsidianLinkEmbedPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'create-link-embed-new-line',
			name: 'Create link embed (new line)',
			editorCallback: (editor: Editor) => {
				this.urlToEmbed(editor, this.newLine(editor));
			},
		});
		this.addCommand({
			id: 'create-link-embed-in-place',
			name: 'Create link embed (in place)',
			editorCallback: (editor: Editor) => {
				this.urlToEmbed(editor, this.inPlace(editor));
			},
		});
		this.addCommand({
			id: 'create-link-embed-from-clipboard',
			name: 'Create link embed (from clipboard)',
			editorCallback: async (editor: Editor) => {
				const url = await navigator.clipboard.readText();
				this.urlToEmbed(url, this.newLine(editor));
			},
		});
		Object.keys(parsers).forEach((name) => {
			this.addCommand({
				id: `create-link-embed-new-line-${name}`,
				name: `Create link embed with ${name} (new line)`,
				editorCallback: (editor: Editor) => {
					this.urlToEmbedWithParser(
						editor,
						name,
						this.newLine(editor),
					);
				},
			});
			this.addCommand({
				id: `create-link-embed-in-place-${name}`,
				name: `Create link embed with ${name} (in place)`,
				editorCallback: (editor: Editor) => {
					this.urlToEmbedWithParser(
						editor,
						name,
						this.inPlace(editor),
					);
				},
			});
			this.addCommand({
				id: `create-link-embed-from-clipboard-${name}`,
				name: `Create link embed with ${name} (from clipboard)`,
				editorCallback: async (editor: Editor) => {
					const url = await navigator.clipboard.readText();
					this.urlToEmbedWithParser(url, name, this.newLine(editor));
				},
			});
		});

		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	newLine(editor: Editor) {
		return (embed: string) => {
			editor.replaceSelection(`${editor.getSelection()}${embed}`);
		};
	}

	inPlace(editor: Editor) {
		return (embed: string) => {
			editor.replaceSelection(embed);
		};
	}

	isUrl(text: string): boolean {
		const urlRegex = new RegExp(
			'^(http:\\/\\/www\\.|https:\\/\\/www\\.|http:\\/\\/|https:\\/\\/)?[a-z0-9]+([\\-.]{1}[a-z0-9]+)*\\.[a-z]{2,5}(:[0-9]{1,5})?(\\/.*)?$',
		);
		return urlRegex.test(text);
	}

	urlToEmbed(editor: Editor | string, cb: (embed: string) => void): void {
		let selectedText;
		if (editor instanceof Editor) {
			selectedText = editor.somethingSelected()
				? editor.getSelection()
				: '';
		} else {
			selectedText = editor;
		}
		if (selectedText && this.isUrl(selectedText)) {
			if (this.settings.debug) {
				console.log('Link Embed: url to embed', selectedText);
			}
			const url = selectedText;
			this.parse(this.settings.parser, url, cb, () => {
				this.parse(this.settings.backup, url, cb, () => {
					this.errorNotice();
				});
			});
		} else {
			new Notice('Select a link to convert to embed.');
		}
	}

	urlToEmbedWithParser(
		editor: Editor | string,
		parser: string,
		cb: (embed: string) => void,
	): void {
		let selectedText;
		if (editor instanceof Editor) {
			selectedText = editor.somethingSelected()
				? editor.getSelection()
				: '';
		} else {
			selectedText = editor;
		}
		if (selectedText && this.isUrl(selectedText)) {
			if (this.settings.debug) {
				console.log('Link Embed: url to embed', selectedText);
			}
			const url = selectedText;
			this.parse(parser, url, cb, () => {
				this.errorNotice();
			});
		} else {
			new Notice('Select a link to convert to embed.');
		}
	}

	parse(
		selectedParser: string,
		url: string,
		cb: (embed: string) => void,
		error?: (err: any) => void,
	): void {
		if (this.settings.debug) {
			console.log('Link Embed: parser', selectedParser);
		}
		const parser = parsers[selectedParser];
		parser.debug = this.settings.debug;
		parser
			.parse(url)
			.then((data) => {
				if (this.settings.debug) {
					console.log('Link Embed: meta data', data);
				}
				const embed = Mustache.render(TEMPLATE, data);
				cb(embed);
			})
			.catch((err) => {
				error(err);
			});
	}

	errorNotice() {
		if (this.settings.debug) {
			console.log('Link Embed: Failed to fetch data');
		}
		new Notice(`Failed to fetch data`);
	}
}

class SampleSettingTab extends PluginSettingTab {
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
