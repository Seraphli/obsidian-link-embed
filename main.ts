import {
	Editor,
	Notice,
	Plugin,
	MarkdownView,
	EditorPosition,
	stringifyYaml,
	parseYaml,
} from 'obsidian';
import Mustache from 'mustache';
import { createParser, parseOptions } from './parser';
import {
	HTMLTemplate,
	REGEX,
	SPINNER,
	MarkdownTemplate,
	EmbedInfo,
} from './constants';
import type { ObsidianLinkEmbedPluginSettings } from './settings';
import { ObsidianLinkEmbedSettingTab, DEFAULT_SETTINGS } from './settings';
import { ExEditor, Selected } from './exEditor';
import EmbedSuggest from './suggest';

interface PasteInfo {
	trigger: boolean;
	text: string;
}

export default class ObsidianLinkEmbedPlugin extends Plugin {
	settings: ObsidianLinkEmbedPluginSettings;
	pasteInfo: PasteInfo;

	async getText(editor: Editor): Promise<Selected> {
		let selected = ExEditor.getSelectedText(editor, this.settings.debug);
		let cursor = editor.getCursor();
		if (!selected.can) {
			selected.text = await navigator.clipboard.readText();
			selected.boundary = {
				start: cursor,
				end: cursor,
			};
		}
		return selected;
	}

	async onload() {
		await this.loadSettings();

		this.pasteInfo = {
			trigger: false,
			text: '',
		};

		this.registerEvent(
			this.app.workspace.on(
				'editor-paste',
				(
					evt: ClipboardEvent,
					editor: Editor,
					markdownView: MarkdownView,
				) => {
					this.pasteInfo = {
						trigger: false,
						text: '',
					};
					const text = evt.clipboardData.getData('text/plain');
					if (ObsidianLinkEmbedPlugin.isUrl(text)) {
						this.pasteInfo.trigger = true;
						this.pasteInfo.text = text;
					}
				},
			),
		);

		this.registerEditorSuggest(new EmbedSuggest(this.app, this));

		this.addCommand({
			id: 'embed-link',
			name: 'Embed link',
			editorCallback: async (editor: Editor) => {
				let selected = await this.getText(editor);
				if (!this.checkUrlValid(selected)) {
					return;
				}
				await this.embedUrl(editor, selected, [
					this.settings.primary,
					this.settings.backup,
				]);
			},
		});
		// Add commands for each parser type
		Object.keys(parseOptions).forEach((name) => {
			this.addCommand({
				id: `embed-link-${name}`,
				name: `Embed link with ${parseOptions[name]}`,
				editorCallback: async (editor: Editor) => {
					let selected = await this.getText(editor);
					if (!this.checkUrlValid(selected)) {
						return;
					}
					await this.embedUrl(editor, selected, [name]);
				},
			});
		});

		this.registerMarkdownCodeBlockProcessor('embed', (source, el, ctx) => {
			const info = parseYaml(
				source.replace(/^\s+|\s+$/gm, ''),
			) as EmbedInfo;
			const html = HTMLTemplate.replace(/{{title}}/gm, info.title)
				.replace(/{{{image}}}/gm, info.image)
				.replace(/{{description}}/gm, info.description)
				.replace(/{{{url}}}/gm, info.url);
			let parser = new DOMParser();
			var doc = parser.parseFromString(html, 'text/html');
			el.replaceWith(doc.body.firstChild);
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

	checkUrlValid(selected: Selected): boolean {
		if (
			!(
				selected.text.length > 0 &&
				ObsidianLinkEmbedPlugin.isUrl(selected.text)
			)
		) {
			new Notice('Need a link to convert to embed.');
			return false;
		}
		return true;
	}

	async embedUrl(
		editor: Editor,
		selected: Selected,
		selectedParsers: string[],
		inPlace: boolean = this.settings.inPlace,
	) {
		let url = selected.text;
		// replace selection if in place
		if (selected.can && inPlace) {
			editor.replaceRange(
				'',
				selected.boundary.start,
				selected.boundary.end,
			);
		}
		// put a dummy preview here first
		const cursor = editor.getCursor();
		const lineText = editor.getLine(cursor.line);
		let template = MarkdownTemplate;
		let newLine = false;
		if (lineText.length > 0) {
			newLine = true;
		}
		if (newLine) {
			editor.setCursor({ line: cursor.line + 1, ch: 0 });
		} else {
			editor.setCursor({ line: cursor.line, ch: lineText.length });
		}
		const startCursor = editor.getCursor();
		const dummyEmbed =
			Mustache.render(template, {
				title: 'Fetching',
				image: SPINNER,
				description: `Fetching ${url}`,
				url: url,
			}) + '\n';
		editor.replaceSelection(dummyEmbed);
		const endCursor = editor.getCursor();
		// if we can fetch result, we can replace the embed with true content
		let idx = 0;
		while (idx < selectedParsers.length) {
			const selectedParser = selectedParsers[idx];
			if (this.settings.debug) {
				console.log('Link Embed: parser', selectedParser);
			}
			try {
				// Create parser instance on demand
				const parser = createParser(selectedParser, this.settings);
				parser.debug = this.settings.debug;

				const data = await parser.parse(url);
				if (this.settings.debug) {
					console.log('Link Embed: meta data', data);
				}
				const escapedData = {
					title: data.title.replace(/"/g, '\\"'),
					image: data.image,
					description: data.description.replace(/"/g, '\\"'),
					url: data.url,
				};
				const embed = Mustache.render(template, escapedData) + '\n';
				if (this.settings.delay > 0) {
					await new Promise((f) =>
						setTimeout(f, this.settings.delay),
					);
				}
				// before replacing, check whether dummy is deleted or modified
				const dummy = editor.getRange(startCursor, endCursor);
				if (dummy == dummyEmbed) {
					editor.replaceRange(embed, startCursor, endCursor);
				} else {
					new Notice(
						`Dummy preview has been deleted or modified. Replacing is cancelled.`,
					);
				}
				break;
			} catch (error) {
				console.log('Link Embed: error', error);
				idx += 1;
				if (idx === selectedParsers.length) {
					this.errorNotice(
						error instanceof Error
							? error
							: new Error(String(error)),
					);
				}
			}
		}
	}

	public static isUrl(text: string): boolean {
		const urlRegex = new RegExp(REGEX.URL, 'g');
		return urlRegex.test(text);
	}

	errorNotice(error?: Error) {
		if (this.settings.debug) {
			console.log('Link Embed: Failed to fetch data', error);
		}
		const errorMessage = error?.message || 'Failed to fetch data';
		new Notice(`Error: ${errorMessage}`);
	}
}
