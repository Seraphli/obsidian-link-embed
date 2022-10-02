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

interface IDateCompletion {
	choice: string;
}

export default class EmbedSuggest extends EditorSuggest<IDateCompletion> {
	private plugin: ObsidianLinkEmbedPlugin;
	private app: App;
	private editor: Editor;
	private cursor: EditorPosition;

	constructor(app: App, plugin: ObsidianLinkEmbedPlugin) {
		super(app);
		this.app = app;
		this.plugin = plugin;
	}

	getSuggestions(context: EditorSuggestContext): IDateCompletion[] {
		// catch-all if there are no matches
		return [{ choice: 'Create Embed' }, { choice: 'Dismiss' }];
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
			this.plugin.embedUrl(
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
				true,
			);
		}
		this.close();
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile,
	): EditorSuggestTriggerInfo {
		if (!this.plugin.settings.popup || !this.plugin.pasteInfo.trigger) {
			return null;
		}
		this.plugin.pasteInfo.trigger = false;
		this.editor = editor;
		this.cursor = cursor;

		return {
			start: cursor,
			end: cursor,
			query: this.plugin.pasteInfo.text,
		};
	}
}
