import { Editor, Notice, Plugin } from 'obsidian';
import Mustache from 'mustache';
import { parsers } from './parser';
import { TEMPLATE, REGEX } from './constants';
import type { ObsidianLinkEmbedPluginSettings } from './settings';
import { ObsidianLinkEmbedSettingTab, DEFAULT_SETTINGS } from './settings';
import { ExEditor } from './exEditor';

export default class ObsidianLinkEmbedPlugin extends Plugin {
	settings: ObsidianLinkEmbedPluginSettings;

	async getText(editor: Editor) {
		let selectedText = ExEditor.getSelectedText(
			editor,
			this.settings.debug,
		);
		if (selectedText == '') {
			selectedText = await navigator.clipboard.readText();
		}
		return selectedText;
	}

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'embed-link',
			name: 'Embed link',
			editorCallback: async (editor: Editor) => {
				let selectedText = await this.getText(editor);
				this.urlToEmbed(
					selectedText,
					this.defaultParse(),
					this.settings.inPlace
						? this.inPlace(editor)
						: this.newLine(editor),
				);
			},
		});
		Object.keys(parsers).forEach((name) => {
			this.addCommand({
				id: `embed-link-${name}`,
				name: `Embed link with ${name}`,
				editorCallback: async (editor: Editor) => {
					let selectedText = await this.getText(editor);
					this.urlToEmbed(
						selectedText,
						this.oneParse(name),
						this.settings.inPlace
							? this.inPlace(editor)
							: this.newLine(editor),
					);
				},
			});
		});

		this.addSettingTab(new ObsidianLinkEmbedSettingTab(this.app, this));
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
			let cursor = editor.getCursor();
			let lineText = editor.getLine(cursor.line);
			editor.setCursor({
				line: cursor.line,
				ch: lineText.length,
			});
			editor.replaceSelection(embed);
		};
	}

	inPlace(editor: Editor) {
		return (embed: string) => {
			editor.replaceSelection('');
			this.newLine(editor)(embed);
		};
	}

	isUrl(text: string): boolean {
		const urlRegex = new RegExp(REGEX.URL, 'g');
		return urlRegex.test(text);
	}

	defaultParse() {
		return (url: string, callback: (embed: string) => void) => {
			this.parseWith(this.settings.parser, url, callback, () => {
				this.parseWith(this.settings.backup, url, callback, () => {
					this.errorNotice();
				});
			});
		};
	}

	oneParse(parser: string) {
		return (url: string, callback: (embed: string) => void) => {
			this.parseWith(parser, url, callback, () => {
				this.errorNotice();
			});
		};
	}

	urlToEmbed(
		selectedText: string,
		parse: (url: string, callback: (embed: string) => void) => void,
		callback: (embed: string) => void,
	): void {
		if (this.settings.debug) {
			console.log('Link Embed: url to embed', selectedText);
		}
		if (selectedText.length > 0 && this.isUrl(selectedText)) {
			const url = selectedText;
			parse(url, callback);
		} else {
			new Notice('Need a link to convert to embed.');
		}
	}

	parseWith(
		selectedParser: string,
		url: string,
		callback: (embed: string) => void,
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
				callback(embed);
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
