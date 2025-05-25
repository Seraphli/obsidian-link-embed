import { Editor, MarkdownView, parseYaml, stringifyYaml } from 'obsidian';
import { embedUrl, getFavicon } from './embedUtils';
import { getImageDimensions } from './parsers';
import { EmbedInfo } from './constants';
import Mustache from 'mustache';
import { ObsidianLinkEmbedPluginSettings } from './settings';
import { imageFileToBase64 } from './parsers';
import { HTMLTemplate } from './constants';

/**
 * Handler for the editor-paste event.
 * Checks if the pasted text is a URL and updates the pasteInfo accordingly.
 *
 * @param evt The clipboard event
 * @param editor The editor instance
 * @param markdownView The markdown view
 * @param pasteInfo Object to update with paste information
 * @param isUrl Function to check if text is a URL
 */
export function handleEditorPaste(
	evt: ClipboardEvent,
	editor: Editor,
	markdownView: MarkdownView,
	pasteInfo: { trigger: boolean; text: string },
	isUrl: (text: string) => boolean,
): void {
	pasteInfo.trigger = false;
	pasteInfo.text = '';

	const text = evt.clipboardData.getData('text/plain');
	if (isUrl(text)) {
		pasteInfo.trigger = true;
		pasteInfo.text = text;
	}
}

/**
 * Handler for the markdown code block processor for 'embed' blocks.
 * Processes embed code blocks and renders them as HTML.
 *
 * @param source The source code inside the code block
 * @param el The HTML element to render into
 * @param ctx The context object
 * @param settings Plugin settings
 * @param cache Cache object to use
 */
export async function handleEmbedCodeBlock(
	source: string,
	el: HTMLElement,
	ctx: any,
	settings: ObsidianLinkEmbedPluginSettings,
	cache: Map<string, any>,
	vault: any,
): Promise<void> {
	const info = parseYaml(source.replace(/^\s+|\s+$/gm, '')) as EmbedInfo;

	// Automatically fetch favicon for embeds that don't have one
	if (!info.favicon && info.url) {
		if (settings.debug) {
			console.log('[Link Embed] Fetching missing favicon for:', info.url);
		}
		try {
			// Check cache directly with URL as the key if caching is enabled
			if (settings.useCache && cache.has(info.url)) {
				info.favicon = cache.get(info.url);
				if (settings.debug) {
					console.log(
						'[Link Embed] Using cached favicon for:',
						info.url,
					);
				}
			} else {
				info.favicon = await getFavicon(
					info.url,
					settings,
					cache,
					settings.debug,
				);
			}
		} catch (error) {
			console.error(
				'[Link Embed] Error fetching favicon for existing embed:',
				error,
			);
		}
	}

	// Process image path if it's a local file path
	let imageUrl = info.image;
	if (
		imageUrl &&
		!imageUrl.startsWith('http') &&
		!imageUrl.startsWith('data:')
	) {
		try {
			// Convert local image path to base64 data URL
			const base64Image = await imageFileToBase64(vault, imageUrl);
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
	if (settings.respectImageAspectRatio && !aspectRatio && imageUrl) {
		try {
			// Use imageUrl directly as the cache key
			let dimensions;

			// Check cache first if caching is enabled
			if (settings.useCache && cache.has(imageUrl)) {
				dimensions = cache.get(imageUrl);
				if (settings.debug) {
					console.log(
						'[Link Embed] Using cached image dimensions for:',
						imageUrl,
					);
				}
			} else {
				// Get dimensions and store in cache if enabled
				dimensions = await getImageDimensions(
					imageUrl,
					settings.useCache ? cache : null,
				);
				if (dimensions && settings.useCache) {
					cache.set(imageUrl, dimensions);
				}
			}

			if (dimensions) {
				aspectRatio = dimensions.aspectRatio;
				if (settings.debug) {
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
						  (ctx.getSectionInfo(el)?.lineStart + 1 || 'unknown')
						: 'unknown location') +
					':',
				error,
			);
		}
	}

	// Calculate width based on aspect ratio
	const baseWidth = 160;
	const calculatedWidth = Math.round((baseWidth * 100) / aspectRatio);

	// Use the processed image URL and any aspect ratio information
	const templateData = {
		title: info.title,
		image: imageUrl,
		description: info.description,
		url: info.url,
		respectAR: settings.respectImageAspectRatio,
		calculatedWidth: calculatedWidth,
		favicon: info.favicon,
	};

	const html = Mustache.render(HTMLTemplate, templateData);

	let parser = new DOMParser();
	var doc = parser.parseFromString(html, 'text/html');
	el.replaceWith(doc.body.firstChild);
}

/**
 * Handler for the "embed-link" command.
 * Embeds the selected URL or clipboard content if it's a URL.
 *
 * @param editor The editor instance
 * @param plugin The plugin instance for access to settings and methods
 */
export async function handleEmbedLinkCommand(
	editor: Editor,
	getText: (editor: Editor) => Promise<any>,
	checkUrlValid: (selected: any) => boolean,
	embedUrl: (
		editor: Editor,
		selected: any,
		selectedParsers: string[],
		settings: any,
		cache: Map<string, any>,
		inPlace?: boolean,
	) => Promise<void>,
	settings: ObsidianLinkEmbedPluginSettings,
	cache: Map<string, any>,
): Promise<void> {
	let selected = await getText(editor);
	if (!checkUrlValid(selected)) {
		return;
	}
	await embedUrl(
		editor,
		selected,
		[settings.primary, settings.backup],
		settings,
		cache,
		settings.inPlace,
	);
}

/**
 * Create a handler for a specific parser command.
 *
 * @param parserName The name of the parser to use
 * @returns A command handler function
 */
export function createParserCommandHandler(
	parserName: string,
	getText: (editor: Editor) => Promise<any>,
	checkUrlValid: (selected: any) => boolean,
	embedUrl: (
		editor: Editor,
		selected: any,
		selectedParsers: string[],
		settings: any,
		cache: Map<string, any>,
		inPlace?: boolean,
	) => Promise<void>,
	settings: ObsidianLinkEmbedPluginSettings,
	cache: Map<string, any>,
): (editor: Editor) => Promise<void> {
	return async (editor: Editor) => {
		let selected = await getText(editor);
		if (!checkUrlValid(selected)) {
			return;
		}
		await embedUrl(
			editor,
			selected,
			[parserName],
			settings,
			cache,
			settings.inPlace,
		);
	};
}
