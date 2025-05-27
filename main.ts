import { Editor, Plugin, MarkdownView } from 'obsidian';
import { ExEditor } from './src/exEditor';
import {
	ObsidianLinkEmbedSettingTab,
	DEFAULT_SETTINGS,
	ObsidianLinkEmbedPluginSettings,
} from './src/settings';
import { LocalParser } from './src/parsers/LocalParser';
import { checkUrlValid } from './src/urlUtils';
import { isUrl } from './src/urlUtils';
import { embedUrl } from './src/embedUtils';
import { parseOptions } from './src/parsers';
import {
	handleEditorPaste,
	handleEmbedCodeBlock,
	handleEmbedLinkCommand,
	createParserCommandHandler,
} from './src/eventHandlers';
import EmbedSuggest from './src/suggest';

interface PasteInfo {
	trigger: boolean;
	text: string;
}

export default class ObsidianLinkEmbedPlugin extends Plugin {
	settings: ObsidianLinkEmbedPluginSettings;
	pasteInfo: PasteInfo;
	cache: Map<string, any>; // A unified cache for both image dimensions and favicons

	async onload() {
		await this.loadSettings();

		this.pasteInfo = {
			trigger: false,
			text: '',
		};

		// Initialize a unified cache for both image dimensions and favicons
		this.cache = new Map();

		// Initialize the LocalParser's limiter with the setting
		LocalParser.initLimiter(this.settings.maxConcurrentLocalParsers);

		// Register event handler for clipboard paste
		this.registerEvent(
			this.app.workspace.on(
				'editor-paste',
				(
					evt: ClipboardEvent,
					editor: Editor,
					markdownView: MarkdownView,
				) => {
					handleEditorPaste(
						evt,
						editor,
						markdownView,
						this.pasteInfo,
						isUrl,
					);
				},
			),
		);

		// Register suggestion handler
		this.registerEditorSuggest(new EmbedSuggest(this.app, this));

		// Register the main embed command
		this.addCommand({
			id: 'embed-link',
			name: 'Embed link',
			editorCallback: async (editor: Editor) => {
				await handleEmbedLinkCommand(
					editor,
					ExEditor.getText.bind(ExEditor),
					checkUrlValid,
					embedUrl,
					this.settings,
				);
			},
		});

		// Add commands for each parser type
		Object.keys(parseOptions).forEach((name) => {
			this.addCommand({
				id: `embed-link-${name}`,
				name: `Embed link with ${parseOptions[name]}`,
				editorCallback: createParserCommandHandler(
					name,
					ExEditor.getText.bind(ExEditor),
					checkUrlValid,
					embedUrl,
					this.settings,
				),
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
				);
			},
		);

		// Add the settings tab
		this.addSettingTab(new ObsidianLinkEmbedSettingTab(this.app, this));
	}

	onunload() {
		// Clear cache to prevent memory leaks
		if (this.cache && this.cache.size > 0) {
			console.log('[Link Embed] Clearing cache');
			this.cache.clear();
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
