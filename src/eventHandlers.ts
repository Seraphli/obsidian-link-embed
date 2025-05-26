import {
	Editor,
	MarkdownView,
	parseYaml,
	MarkdownPostProcessorContext,
} from 'obsidian';
import { getFavicon } from './embedUtils';
import { getImageDimensions } from './parsers';
import { EmbedInfo, SPINNER, HTMLTemplate } from './constants';
import Mustache from 'mustache';
import { ObsidianLinkEmbedPluginSettings } from './settings';
import { imageFileToBase64 } from './parsers';

/**
 * Renders an embed with the given information
 *
 * @param renderInfo The embed information to render
 * @param imageUrl The URL of the image to display
 * @param aspectRatio The aspect ratio for the image, if known
 * @param el The HTML element to replace with the rendered embed
 * @param settings Plugin settings
 * @returns The new HTML element that replaced the original element
 */
function renderEmbed(
	renderInfo: EmbedInfo,
	imageUrl: string,
	aspectRatio: number | undefined,
	el: HTMLElement,
	settings: ObsidianLinkEmbedPluginSettings,
): HTMLElement {
	// Calculate width based on aspect ratio
	const baseWidth = 160;
	const calculatedWidth = aspectRatio
		? Math.round((baseWidth * 100) / aspectRatio)
		: baseWidth * 100;

	// Prepare template data
	const templateData = {
		title: renderInfo.title,
		image: imageUrl,
		description: renderInfo.description,
		url: renderInfo.url,
		respectAR: settings.respectImageAspectRatio,
		calculatedWidth: calculatedWidth,
		favicon: settings.enableFavicon ? renderInfo.favicon : '', // Only include favicon if enabled
	};

	const html = Mustache.render(HTMLTemplate, templateData);

	let parser = new DOMParser();
	var doc = parser.parseFromString(html, 'text/html');
	const newEl = doc.body.firstChild as HTMLElement;
	el.replaceWith(newEl);
	return newEl;
}

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
	ctx: MarkdownPostProcessorContext,
	settings: ObsidianLinkEmbedPluginSettings,
	cache: Map<string, any>,
	vault: any,
): Promise<void> {
	const info = parseYaml(source.replace(/^\s+|\s+$/gm, '')) as EmbedInfo;

	// Check if this is a dummy embed (produced by embedUrl function)
	const isDummyEmbed =
		info.title === 'Fetching' &&
		info.image === SPINNER &&
		info.description?.startsWith('Fetching ');

	// If this is a dummy embed, just render it directly without any expensive operations
	if (isDummyEmbed) {
		// Render the dummy embed with default aspect ratio
		renderEmbed(info, info.image, 1, el, settings);
		return; // Exit early, skip all the fetching operations
	}

	// For normal embeds, proceed with two-phase rendering
	const originalInfo = { ...info }; // Store original info for second render

	// Process image path if it's a local file path
	if (
		info.image &&
		!info.image.startsWith('http') &&
		!info.image.startsWith('data:')
	) {
		try {
			// Convert local image path to base64 data URL
			const base64Image = await imageFileToBase64(vault, info.image);
			if (base64Image) {
				info.image = base64Image; // Update info for initial render
				originalInfo.image = base64Image; // Update original info for final render
			}
		} catch (error) {
			console.error(
				'[Link Embed] Failed to convert local image to base64:',
				error,
			);
			// Keep original path on failure
		}
	}

	// Collect all promises for async operations
	const promises: Promise<void>[] = [];

	// Check if favicon is missing and enabled - use SPINNER for first render
	if (!info.favicon && info.url && settings.enableFavicon) {
		if (settings.debug) {
			console.log('[Link Embed] Fetching missing favicon for:', info.url);
		}

		// Set placeholder for initial render
		info.favicon = SPINNER;

		// Fetch real favicon in the background
		try {
			// Check cache first if caching is enabled
			if (settings.useCache && cache.has(info.url)) {
				const cachedFavicon = cache.get(info.url);
				originalInfo.favicon = cachedFavicon;
				info.favicon = cachedFavicon; // Also update info for initial render
				if (settings.debug) {
					console.log(
						'[Link Embed] Using cached favicon for:',
						info.url,
					);
				}
			} else {
				// Add promise for favicon fetching
				const faviconPromise = getFavicon(
					info.url,
					settings,
					cache,
					settings.debug,
				)
					.then((favicon) => {
						originalInfo.favicon = favicon;
						info.favicon = favicon; // Also update info for initial render if it happens after this completes
						// Store in cache if enabled
						if (settings.useCache && favicon) {
							cache.set(info.url, favicon);
							if (settings.debug) {
								console.log(
									'[Link Embed] Cached favicon for:',
									info.url,
								);
							}
						}
					})
					.catch((error) => {
						console.error(
							'[Link Embed] Error fetching favicon for existing embed:',
							error,
						);
					});
				promises.push(faviconPromise);
			}
		} catch (error) {
			console.error(
				'[Link Embed] Error setting up favicon fetching:',
				error,
			);
		}
	}

	// Check if aspect ratio needs to be calculated - use default for first render
	if (settings.respectImageAspectRatio && !info.aspectRatio && info.image) {
		// Set placeholder for initial render
		info.aspectRatio = 1;

		try {
			// Check cache first if caching is enabled
			if (settings.useCache && cache.has(info.image)) {
				const dimensions = cache.get(info.image);
				if (dimensions) {
					originalInfo.aspectRatio = dimensions.aspectRatio;
					info.aspectRatio = dimensions.aspectRatio;
				}

				if (settings.debug) {
					console.log(
						'[Link Embed] Using cached image dimensions for:',
						info.image,
					);
				}
			} else {
				// Add promise for aspect ratio calculation
				const aspectRatioPromise = getImageDimensions(
					info.image,
					settings.useCache ? cache : null,
				)
					.then((dimensions) => {
						if (dimensions) {
							originalInfo.aspectRatio = dimensions.aspectRatio;
							if (settings.useCache) {
								cache.set(info.image, dimensions);
							}

							if (settings.debug) {
								console.log(
									'[Link Embed] Calculated image aspect ratio:',
									originalInfo.aspectRatio,
								);
							}
						}
					})
					.catch((error) => {
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
					});
				promises.push(aspectRatioPromise);
			}
		} catch (error) {
			console.error(
				'[Link Embed] Error setting up aspect ratio calculation:',
				error,
			);
		}
	}

	// First render with placeholder values
	const newEl = renderEmbed(info, info.image, info.aspectRatio, el, settings);

	// If we have any promises, wait for all to complete then do final render
	if (promises.length > 0) {
		Promise.all(promises)
			.then(() => {
				// Final render with all real values
				renderEmbed(
					originalInfo,
					originalInfo.image,
					originalInfo.aspectRatio,
					newEl,
					settings,
				);
				if (settings.debug) {
					console.log(
						'[Link Embed] Final render completed with real values:',
						originalInfo,
					);
				}
			})
			.catch((error) => {
				console.error(
					'[Link Embed] Error during data fetching:',
					error,
				);
			});
	}
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
