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
		return [{ choice: 'Dismiss' }, { choice: 'Create Embed' }];
	}

	renderSuggestion(suggestion: IDateCompletion, el: HTMLElement): void {
		el.setText(suggestion.choice);
	}

	selectSuggestion(
		suggestion: IDateCompletion,
		event: KeyboardEvent | MouseEvent,
	): void {
		if (suggestion.choice == 'Create Embed') {
			this.plugin.embedUrl(
				this.plugin.pasteInfo.text,
				this.plugin.defaultParse(),
				this.plugin.inPlace(this.editor, this.cursor),
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
			query: '',
		};
	}
}
