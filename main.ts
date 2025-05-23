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
import {
	createParser,
	parseOptions,
	imageFileToBase64,
	getImageDimensions,
} from './parser';
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
	imageDimensionsCache: Map<
		string,
		{ width: number; height: number; aspectRatio: number }
	>;

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

		// Initialize image dimensions cache
		this.imageDimensionsCache = new Map();

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

		this.registerMarkdownCodeBlockProcessor(
			'embed',
			async (source, el, ctx) => {
				const info = parseYaml(
					source.replace(/^\s+|\s+$/gm, ''),
				) as EmbedInfo;

				// Process image path if it's a local file path
				let imageUrl = info.image;
				if (
					imageUrl &&
					!imageUrl.startsWith('http') &&
					!imageUrl.startsWith('data:')
				) {
					try {
						// Convert local image path to base64 data URL
						const base64Image = await imageFileToBase64(
							this.app.vault,
							imageUrl,
						);
						if (base64Image) {
							imageUrl = base64Image;
						}
					} catch (error) {
						console.error(
							'[Link Embed] Failed to convert local image to base64:',
							error,
						);
						// Keep original path on failure
					}
				}

				// Calculate aspect ratio if not present but feature is enabled
				let aspectRatio = info.aspectRatio;
				if (
					this.settings.respectImageAspectRatio &&
					!aspectRatio &&
					imageUrl
				) {
					try {
						const dimensions = await getImageDimensions(
							imageUrl,
							this.imageDimensionsCache,
						);
						if (dimensions) {
							aspectRatio = dimensions.aspectRatio;
							if (this.settings.debug) {
								console.log(
									'[Link Embed] Calculated image aspect ratio:',
									aspectRatio,
								);
							}
						}
					} catch (error) {
						console.error(
							'[Link Embed] Error calculating dynamic aspect ratio at ' +
								(ctx.sourcePath
									? ctx.sourcePath +
									  ':' +
									  (ctx.getSectionInfo(el)?.lineStart + 1 ||
											'unknown')
									: 'unknown location') +
								':',
							error,
						);
					}
				}

				// Calculate width based on aspect ratio
				const baseWidth = 160;
				const calculatedWidth = Math.round(
					(baseWidth * 100) / aspectRatio,
				);

				// Use the processed image URL and any aspect ratio information
				const templateData = {
					title: info.title,
					image: imageUrl,
					description: info.description,
					url: info.url,
					respectAR: this.settings.respectImageAspectRatio,
					calculatedWidth: calculatedWidth,
				};

				const html = Mustache.render(HTMLTemplate, templateData);

				let parser = new DOMParser();
				var doc = parser.parseFromString(html, 'text/html');
				el.replaceWith(doc.body.firstChild);

				// Log metadata information if debugging is enabled
				if (
					this.settings.debug &&
					(info.createdby || info.parser || info.date)
				) {
					console.log('[Link Embed] Metadata:', {
						createdby: info.createdby || 'unknown',
						parser: info.parser || 'unknown',
						date: info.date || 'unknown',
					});
				}
			},
		);

		this.addSettingTab(new ObsidianLinkEmbedSettingTab(this.app, this));
	}

	onunload() {
		// Clear image dimensions cache to prevent memory leaks
		if (this.imageDimensionsCache && this.imageDimensionsCache.size > 0) {
			console.log('[Link Embed] Clearing image dimensions cache');
			this.imageDimensionsCache.clear();
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
		// Get the current file path and cursor position for error reporting
		const activeFile = this.app.workspace.getActiveFile();
		const filePath = activeFile ? activeFile.path : 'unknown';
		const cursorPos = editor.getCursor();
		const lineNumber = cursorPos.line + 1; // +1 for human-readable line numbers
		const locationInfo = `${filePath}:${lineNumber}`;

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
				console.log('[Link Embed] Parser:', selectedParser);
			}
			try {
				// Create parser instance on demand
				const parser = createParser(
					selectedParser,
					this.settings,
					this.app.vault,
				);
				parser.debug = this.settings.debug;
				parser.location = locationInfo; // Pass location for error reporting

				const data = await parser.parse(url);
				if (this.settings.debug) {
					console.log('[Link Embed] Meta data:', data);
				}

				// Generate metadata if enabled in settings
				let metadata = '';
				if (this.settings.useMetadataTemplate) {
					const now = new Date();

					// Create a template context with variables that can be used in the metadata template
					const templateContext = {
						// Basic variables
						parser: selectedParser,
						// Standard date in YYYY-MM-DD format
						date: `${now.getFullYear()}-${String(
							now.getMonth() + 1,
						).padStart(2, '0')}-${String(now.getDate()).padStart(
							2,
							'0',
						)}`,
						// Function to format date - allows custom date formatting
						formatDate: () => {
							return (text: string) => {
								try {
									// If text is empty, return standard ISO format
									if (!text.trim())
										return now.toISOString().split('T')[0];

									// Simple replacements for common formats
									return text
										.replace(
											'YYYY',
											String(now.getFullYear()),
										)
										.replace(
											'MM',
											String(now.getMonth() + 1).padStart(
												2,
												'0',
											),
										)
										.replace(
											'DD',
											String(now.getDate()).padStart(
												2,
												'0',
											),
										)
										.replace(
											'HH',
											String(now.getHours()).padStart(
												2,
												'0',
											),
										)
										.replace(
											'mm',
											String(now.getMinutes()).padStart(
												2,
												'0',
											),
										)
										.replace(
											'ss',
											String(now.getSeconds()).padStart(
												2,
												'0',
											),
										);
								} catch (e) {
									console.log(
										'[Link Embed] Error formatting date:',
										e,
									);
									return now.toISOString().split('T')[0];
								}
							};
						},
					};

					// Use Mustache to render the metadata template with the variables
					metadata = Mustache.render(
						this.settings.metadataTemplate,
						templateContext,
					);
				}

				const escapedData = {
					title: data.title.replace(/"/g, '\\"'),
					image: data.image,
					description: data.description.replace(/"/g, '\\"'),
					url: data.url,
					metadata: metadata || false, // Ensure empty string becomes falsy for Mustache conditional
					aspectRatio: data.aspectRatio,
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
					console.log(`[Link Embed] Parser ${selectedParser} done`);
				} else {
					new Notice(
						`Dummy preview has been deleted or modified. Replacing is cancelled.`,
					);
				}
				break;
			} catch (error) {
				console.log('[Link Embed] Error:', error);
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
			console.log('[Link Embed] Failed to fetch data:', error);
		}
		const errorMessage = error?.message || 'Failed to fetch data';
		new Notice(`Error: ${errorMessage}`);
	}
}
