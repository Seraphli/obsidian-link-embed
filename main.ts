import { Editor, Notice, Plugin } from 'obsidian';
import Mustache from 'mustache';
import { parsers } from './parser';
import { TEMPLATE } from './constants';
import type { ObsidianLinkEmbedPluginSettings } from './settings';
import { ObsidianLinkEmbedSettingTab, DEFAULT_SETTINGS } from './settings';

export default class ObsidianLinkEmbedPlugin extends Plugin {
	settings: ObsidianLinkEmbedPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'use-selection',
			name: 'Use selection',
			editorCallback: (editor: Editor) => {
				this.urlToEmbed(
					editor,
					this.settings.inPlace
						? this.inPlace(editor)
						: this.newLine(editor),
				);
			},
		});
		this.addCommand({
			id: 'from-clipboard',
			name: 'From clipboard',
			editorCallback: async (editor: Editor) => {
				const url = await navigator.clipboard.readText();
				this.urlToEmbed(
					url,
					this.settings.inPlace
						? this.inPlace(editor)
						: this.newLine(editor),
				);
			},
		});
		Object.keys(parsers).forEach((name) => {
			this.addCommand({
				id: `from-clipboard-${name}`,
				name: `From clipboard with ${name}`,
				editorCallback: async (editor: Editor) => {
					const url = await navigator.clipboard.readText();
					this.urlToEmbedWithParser(
						url,
						name,
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
