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
import { embedUrl, convertUrlToMarkdownLink } from './embedUtils';

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
        const embedOption = { choice: 'Create Embed Block' };
        const markdownOption = { choice: 'Create Markdown Link' };
        const dismissOption = { choice: 'Dismiss' };

        const isEmbedFirst =
            this.plugin.settings.defaultPasteAction === 'embed';
        const mainOptions = isEmbedFirst
            ? [embedOption, markdownOption]
            : [markdownOption, embedOption];

        if (this.plugin.settings.rmDismiss) {
            return mainOptions;
        }
        return [dismissOption, ...mainOptions];
    }

    renderSuggestion(suggestion: IDateCompletion, el: HTMLElement): void {
        el.setText(suggestion.choice);
    }

    selectSuggestion(
        suggestion: IDateCompletion,
        event: KeyboardEvent | MouseEvent,
    ): void {
        if (suggestion.choice == 'Create Embed Block') {
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
            this.convertToMarkdownLink();
        }
        this.close();
    }

    async convertToMarkdownLink(): Promise<void> {
        const url = this.plugin.pasteInfo.text;
        const cursor = this.editor.getCursor();
        const boundary = {
            start: {
                line: cursor.line,
                ch: cursor.ch - url.length,
            },
            end: cursor,
        };
        const mdLink = await convertUrlToMarkdownLink(
            url,
            [this.plugin.settings.primary, this.plugin.settings.backup],
            this.plugin.settings,
            this.plugin.app.vault,
        );
        if (mdLink) {
            this.editor.replaceRange(mdLink, boundary.start, boundary.end);
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
                if (this.plugin.settings.defaultPasteAction === 'markdown') {
                    this.convertToMarkdownLink();
                } else {
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
                        [
                            this.plugin.settings.primary,
                            this.plugin.settings.backup,
                        ],
                        this.plugin.settings,
                        true,
                    );
                }
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
