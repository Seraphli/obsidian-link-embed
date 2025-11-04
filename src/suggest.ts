import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
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
				{ choice: 'Create Markdown Link' },
			];
		}
		return [
			{ choice: 'Dismiss' },
			{ choice: 'Create Embed' },
			{ choice: 'Create Markdown Link' },
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
		} else if (suggestion.choice == 'Create Markdown Link') {
			// Convert URL to [title](link) format
			this.convertToMarkdownLink();
		}
		this.close();
	}

	private async convertToMarkdownLink(): Promise<void> {
		const url = this.plugin.pasteInfo.text;
		const cursor = this.editor.getCursor();
		const boundary = {
			start: {
				line: cursor.line,
				ch: cursor.ch - url.length,
			},
			end: cursor,
		};

		try {
			// Create parser instance on demand
			const parser = createParser(
				this.plugin.settings.primary,
				this.plugin.settings,
				this.plugin.app.vault,
			);
			parser.debug = this.plugin.settings.debug;

			// Try to fetch only the title for the link
			const data = await parser.parse(url);

			if (data.title) {
				// Replace the URL with [title](url) format
				const mdLink = `[${data.title}](${url})`;
				this.editor.replaceRange(mdLink, boundary.start, boundary.end);
			}
			// If title is empty, keep the URL as is (do nothing)
		} catch (error) {
			// If primary parser fails, try the backup parser
			try {
				const backupParser = createParser(
					this.plugin.settings.backup,
					this.plugin.settings,
					this.plugin.app.vault,
				);
				backupParser.debug = this.plugin.settings.debug;

				const backupData = await backupParser.parse(url);
				if (backupData.title) {
					// Replace the URL with [title](url) format
					const mdLink = `[${backupData.title}](${url})`;
					this.editor.replaceRange(
						mdLink,
						boundary.start,
						boundary.end,
					);
				}
				// If title is empty, keep the URL as is (do nothing)
			} catch (backupError) {
				// Both parsers failed, keep the URL as is (do nothing)
				if (this.plugin.settings.debug) {
					console.log(
						'Link Embed: Failed to fetch title using both parsers',
						error,
						backupError,
					);
				}
			}
		}
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
