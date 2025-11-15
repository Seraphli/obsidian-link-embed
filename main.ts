import { Editor, Plugin } from 'obsidian';
import {
    ObsidianLinkEmbedSettingTab,
    DEFAULT_SETTINGS,
    ObsidianLinkEmbedPluginSettings,
} from './src/settings';
import { LocalParser } from './src/parsers/LocalParser';
import { parseOptions } from './src/parsers';
import {
    handleEditorPaste,
    handleEmbedCodeBlock,
    handleEmbedLinkCommand,
    createParserCommandHandler,
    handleCreateMarkdownLinkCommand,
} from './src/eventHandlers';
import EmbedSuggest from './src/suggest';
import { LinkFaviconHandler } from './src/linkFaviconHandler';
import { linkFaviconDecorationPlugin } from './src/decoration/linkFaviconDecoration';

interface PasteInfo {
    trigger: boolean;
    text: string;
}

export default class ObsidianLinkEmbedPlugin extends Plugin {
    settings: ObsidianLinkEmbedPluginSettings;
    pasteInfo: PasteInfo;
    cache: Map<string, any>; // A unified cache for both image dimensions and favicons
    imageLoadAttempts: Map<string, number>; // Track image loading attempts
    linkFaviconHandler: LinkFaviconHandler; // Handler for markdown link favicons

    async onload() {
        await this.loadSettings();

        this.pasteInfo = {
            trigger: false,
            text: '',
        };

        // Initialize a unified cache for both image dimensions and favicons
        this.cache = new Map();

        // Initialize the map to track image loading attempts
        this.imageLoadAttempts = new Map();

        // Initialize the LocalParser's limiter with the setting
        LocalParser.initLimiter(this.settings.maxConcurrentLocalParsers);

        // Initialize the link favicon handler
        this.linkFaviconHandler = new LinkFaviconHandler(
            this.settings,
            this.cache,
        );

        // Register event handler for clipboard paste
        this.registerEvent(
            this.app.workspace.on('editor-paste', (evt: ClipboardEvent) => {
                handleEditorPaste(evt, this.pasteInfo);
            }),
        );

        // Register suggestion handler
        this.registerEditorSuggest(new EmbedSuggest(this.app, this));

        // Register the main embed command
        this.addCommand({
            id: 'embed-link',
            name: 'Create Embed Block',
            editorCallback: async (editor: Editor) => {
                await handleEmbedLinkCommand(editor, this.settings);
            },
        });

        // Register the create markdown link command
        this.addCommand({
            id: 'create-markdown-link',
            name: 'Create Markdown Link',
            editorCallback: async (editor: Editor) => {
                await handleCreateMarkdownLinkCommand(
                    editor,
                    this.settings,
                    this.app.vault,
                );
            },
        });

        // Add commands for each parser type
        Object.keys(parseOptions).forEach((name) => {
            this.addCommand({
                id: `embed-link-${name}`,
                name: `Create Embed Block with ${parseOptions[name]}`,
                editorCallback: createParserCommandHandler(name, this.settings),
            });

            this.addCommand({
                id: `create-markdown-link-${name}`,
                name: `Create Markdown Link with ${parseOptions[name]}`,
                editorCallback: async (editor: Editor) => {
                    await handleCreateMarkdownLinkCommand(
                        editor,
                        this.settings,
                        this.app.vault,
                        [name],
                    );
                },
            });
        });

        // Register the markdown code block processor for 'embed' blocks
        this.registerMarkdownCodeBlockProcessor(
            'embed',
            async (source, el, ctx) => {
                await handleEmbedCodeBlock(
                    source,
                    el,
                    ctx,
                    this.settings,
                    this.cache,
                    this.app.vault,
                    this.imageLoadAttempts,
                );
            },
        );

        // Register markdown post processor for adding favicons to links in reading mode
        this.registerMarkdownPostProcessor(async (element, context) => {
            await this.linkFaviconHandler.processLinks(element, context);
        });

        // Register CodeMirror extension for adding favicons to links in live preview mode
        this.registerEditorExtension(linkFaviconDecorationPlugin(this));

        // Add the settings tab
        this.addSettingTab(new ObsidianLinkEmbedSettingTab(this.app, this));
    }

    onunload() {
        // Clear cache to prevent memory leaks
        if (this.cache && this.cache.size > 0) {
            console.log('[Link Embed] Clearing cache');
            this.cache.clear();
        }

        // Clear image load attempts map
        if (this.imageLoadAttempts && this.imageLoadAttempts.size > 0) {
            console.log('[Link Embed] Clearing image load attempts tracking');
            this.imageLoadAttempts.clear();
        }
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData(),
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Update the LocalParser's limiter when settings change
        LocalParser.initLimiter(this.settings.maxConcurrentLocalParsers);
        if (this.settings.debug) {
            console.log('[Link Embed] Settings saved:', this.settings);
        }
    }
}
