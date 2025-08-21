import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	MarkdownView,
	TFile,
} from 'obsidian';
import type ObsidianLinkEmbedPlugin from 'main';
import { createParser } from './parsers';
import { embedUrl } from './embedUtils';

interface IDateCompletion {
	choice: string;
}

export default class EmbedSuggest extends EditorSuggest<IDateCompletion> {
	private plugin: ObsidianLinkEmbedPlugin;
	private editor: Editor;
	private cursor: EditorPosition;

	constructor(app: App, plugin: ObsidianLinkEmbedPlugin) {
		super(app);
		this.plugin = plugin;
	}

	getSuggestions(context: EditorSuggestContext): IDateCompletion[] {
		// catch-all if there are no matches
		if (this.plugin.settings.rmDismiss) {
			return [
				{ choice: 'Create Embed' },
				{ choice: 'Mention' },
				{ choice: 'Mention with Favicon' },
			];
		}
		return [
			{ choice: 'Dismiss' },
			{ choice: 'Create Embed' },
			{ choice: 'Mention' },
			{ choice: 'Mention with Favicon' },
		];
	}

	renderSuggestion(suggestion: IDateCompletion, el: HTMLElement): void {
		el.setText(suggestion.choice);
	}

	selectSuggestion(
		suggestion: IDateCompletion,
		event: KeyboardEvent | MouseEvent,
	): void {
		if (suggestion.choice == 'Create Embed') {
			const cursor = this.editor.getCursor();
			embedUrl(
				this.editor,
				{
					can: true,
					text: this.plugin.pasteInfo.text,
					boundary: {
						start: {
							line: cursor.line,
							ch: cursor.ch - this.plugin.pasteInfo.text.length,
						},
						end: cursor,
					},
				},
				[this.plugin.settings.primary, this.plugin.settings.backup],
				this.plugin.settings,
				true,
			);
		} else if (suggestion.choice == 'Mention') {
			this.convertToMention(false);
		} else if (suggestion.choice == 'Mention with Favicon') {
			this.convertToMention(true);
		}
		this.close();
	}

	private async convertToMention(withFavicon: boolean): Promise<void> {
		const url = this.plugin.pasteInfo.text;
		const cursor = this.editor.getCursor();
		const boundary = {
			start: {
				line: cursor.line,
				ch: cursor.ch - url.length,
			},
			end: cursor,
		};

		let data = null;
		try {
			const parser = createParser(
				this.plugin.settings.primary,
				this.plugin.settings,
				this.plugin.app.vault,
			);
			parser.debug = this.plugin.settings.debug;
			data = await parser.parse(url);
		} catch (error) {
			try {
				const backupParser = createParser(
					this.plugin.settings.backup,
					this.plugin.settings,
					this.plugin.app.vault,
				);
				backupParser.debug = this.plugin.settings.debug;
				data = await backupParser.parse(url);
			} catch (backupError) {
				if (this.plugin.settings.debug) {
					console.log(
						'Link Embed: Failed to fetch title using both parsers',
						error,
						backupError,
					);
				}
			}
		}

		if (!data) return;
		const displayTitle = data.title ? data.title : url;
		const markdownMention = `[${displayTitle}](${url})`;
		if (withFavicon) {
			// Use the favicon from the parser if available, else fallback to getFavicon
			let favicon = data.favicon;
			if (!favicon && this.plugin.getFavicon) {
				favicon = await this.plugin.getFavicon(
					url,
					this.plugin.settings,
					this.plugin.cache,
					this.plugin.settings.debug,
				);
			}
			if (favicon) {
				const htmlMention = `<img src="${favicon}" style="width:1em;height:1em;vertical-align:text-bottom;display:inline-block;margin-right:0.2em;"> ${markdownMention}`;
				this.editor.replaceRange(
					htmlMention,
					boundary.start,
					boundary.end,
				);
				return;
			}
		}
		this.editor.replaceRange(markdownMention, boundary.start, boundary.end);
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile,
	): EditorSuggestTriggerInfo | null {
		if (!this.plugin.pasteInfo.trigger) {
			return null;
		}
		this.plugin.pasteInfo.trigger = false;
		this.editor = editor;
		this.cursor = cursor;
		if (this.plugin.settings.autoEmbedWhenEmpty) {
			const currentCursor = this.editor.getCursor();
			if (currentCursor.ch - this.plugin.pasteInfo.text.length == 0) {
				embedUrl(
					this.editor,
					{
						can: true,
						text: this.plugin.pasteInfo.text,
						boundary: {
							start: {
								line: currentCursor.line,
								ch:
									currentCursor.ch -
									this.plugin.pasteInfo.text.length,
							},
							end: currentCursor,
						},
					},
					[this.plugin.settings.primary, this.plugin.settings.backup],
					this.plugin.settings,
					true,
				);
				return null;
			}
		}
		if (!this.plugin.settings.popup) {
			return null;
		}
		return {
			start: cursor,
			end: cursor,
			query: this.plugin.pasteInfo.text,
		};
	}
}
