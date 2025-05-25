import { Editor, Plugin, MarkdownView } from 'obsidian';
import { ExEditor } from './src/exEditor';
import { ObsidianLinkEmbedSettingTab, DEFAULT_SETTINGS } from './src/settings';
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
	settings: any;
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
					this.cache,
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
					this.cache,
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

		// Add access to app within settings object for convenience
		this.settings.app = this.app;
		this.settings.vault = this.app.vault;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
