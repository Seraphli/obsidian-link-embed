import {
	Editor,
	Notice,
	TFile,
	Vault,
	MarkdownPostProcessorContext,
} from 'obsidian';
import Mustache from 'mustache';
import { Selected } from './exEditor';
import { errorNotice } from './errorUtils';
import {
	MarkdownTemplate,
	SPINNER,
	EmbedInfo,
	HTMLTemplate,
} from './constants';
import { formatDate } from './utils';
import { createParser, LocalParser } from './parsers';
import { ObsidianLinkEmbedPluginSettings } from './settings';
import { imageFileToBase64, getImageDimensions } from './parsers';

/**
 * Fetch and return a favicon URL for the given website URL.
 * Uses caching if enabled in settings.
 *
 * @param url The website URL to fetch favicon for
 * @param settings Plugin settings
 * @param cache Cache object to use
 * @param debug Whether to log debug information
 * @returns The favicon URL or empty string if not found
 */
export async function getFavicon(
	url: string,
	settings: any,
	cache: Map<string, any>,
	debug: boolean = false,
): Promise<string> {
	// Check cache first using the URL directly as the key if caching is enabled
	if (settings.useCache && cache.has(url)) {
		if (debug) {
			console.log('[Link Embed] Using cached favicon for:', url);
		}
		return cache.get(url);
	}

	try {
		// Create a local parser to get favicon
		const localParser = createParser(
			'local',
			settings,
			null,
		) as LocalParser;
		localParser.debug = debug;

		// Get HTML content
		let html =
			(await localParser.getHtmlByElectron(url)) ||
			(await localParser.getHtmlByRequest(url));

		// Check if HTML content is null or empty
		if (!html) {
			if (debug) {
				console.log(
					'[Link Embed] Failed to fetch HTML for favicon:',
					url,
				);
			}
			return '';
		}

		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const urlObj = new URL(url);

		// Get favicon
		const favicon = localParser.getFavicon(doc, urlObj);

		// Store in cache if enabled
		if (favicon && settings.useCache) {
			cache.set(url, favicon);
			if (debug) {
				console.log('[Link Embed] Cached favicon for:', url);
			}
			return favicon;
		}

		// Return the favicon even if not cached
		if (favicon) {
			return favicon;
		}

		// Return empty string if no favicon found
		return '';
	} catch (error) {
		console.error('[Link Embed] Error fetching favicon:', error);
		return '';
	}
}

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
export function renderEmbed(
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
 * Generates metadata and formats embed markdown for the given data
 *
 * @param data The data to create markdown from
 * @param settings Plugin settings
 * @param parserName Name of the parser used to generate the data
 * @returns The formatted markdown string
 */
export function generateEmbedMarkdown(
	data: any,
	settings: ObsidianLinkEmbedPluginSettings,
	parserName: string,
): string {
	// Generate metadata if enabled in settings
	let metadata = '';
	if (settings.useMetadataTemplate) {
		const now = new Date();

		// Create a template context with variables that can be used in the metadata template
		const templateContext = {
			// Basic variables
			parser: parserName,
			// Standard date in YYYY-MM-DD format
			date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
				2,
				'0',
			)}-${String(now.getDate()).padStart(2, '0')}`,
			// Function to format date - allows custom date formatting
			formatDate: formatDate,
		};

		// Use Mustache to render the metadata template with the variables
		metadata = Mustache.render(settings.metadataTemplate, templateContext);
	}

	const escapedData = {
		title: data.title.replace(/"/g, '\\"'),
		image: data.image,
		description: data.description.replace(/"/g, '\\"'),
		url: data.url,
		metadata: metadata || false, // Ensure empty string becomes falsy for Mustache conditional
		aspectRatio: data.aspectRatio,
		favicon: settings.enableFavicon ? data.favicon : '', // Only include favicon if enabled in settings
	};

	// Create embed markdown
	return Mustache.render(MarkdownTemplate, escapedData) + '\n';
}

/**
 * Refreshes an embed by fetching new metadata and replacing the code block
 *
 * @param url The URL to refresh
 * @param element The element containing the embed
 * @param ctx The markdown post processor context
 * @param settings Plugin settings
 * @param cache Cache object to use
 * @param vault The vault instance
 */
export async function refreshEmbed(
	url: string,
	element: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	settings: ObsidianLinkEmbedPluginSettings,
	cache: Map<string, any>,
	vault: any,
): Promise<void> {
	try {
		if (settings.debug) {
			console.log('[Link Embed] Refreshing embed for URL:', url);
		}

		// Get the current file
		const file = vault.getAbstractFileByPath(ctx.sourcePath);
		if (!file) {
			console.error('[Link Embed] File not found:', ctx.sourcePath);
			return;
		}

		// Get section info to locate the code block
		const sectionInfo = ctx.getSectionInfo(element);
		if (!sectionInfo) {
			console.error('[Link Embed] Could not get section info');
			return;
		}

		// Get file content and find the code block
		const content = await vault.read(file);
		const lines = content.split('\n');
		const startLine = sectionInfo.lineStart;
		const endLine = sectionInfo.lineEnd + 1;
		const oldEmbed = lines.slice(startLine, endLine).join('\n');

		// Create parsers to fetch new metadata
		const primaryParser = createParser(settings.primary, settings, null);
		let data;

		try {
			// Try primary parser first
			data = await primaryParser.parse(url);
		} catch (error) {
			// If primary fails, try backup parser
			console.error(
				`[Link Embed] Primary parser failed: ${error}. Trying backup...`,
			);
			const backupParser = createParser(settings.backup, settings, null);
			data = await backupParser.parse(url);
		}

		if (!data) {
			console.error('[Link Embed] Both parsers failed to fetch metadata');
			return;
		}

		// Create new embed code block
		const newEmbed = generateEmbedMarkdown(
			data,
			settings,
			settings.primary,
		);

		// Check if the old embed has indentation
		let indentation = '';
		const firstLineMatch = oldEmbed.match(/^(\s+)/);
		if (firstLineMatch && firstLineMatch[1]) {
			indentation = firstLineMatch[1];
		}

		// Apply indentation to each line of the new embed
		const indentedNewEmbed = newEmbed
			.trimEnd() // Remove trailing newlines
			.split('\n')
			.map((line) => indentation + line)
			.join('\n');

		// Replace the old embed with the new one, preserving indentation
		const newContent = content.replace(oldEmbed, indentedNewEmbed);
		await vault.modify(file, newContent);

		if (settings.debug) {
			console.log('[Link Embed] Successfully refreshed embed');
		}
	} catch (error) {
		console.error('[Link Embed] Error refreshing embed:', error);
	}
}

/**
 * Adds a refresh button event handler to the given element
 *
 * @param element The element containing the refresh button
 * @param embedInfo The embed information
 * @param ctx The markdown post processor context
 * @param settings Plugin settings
 * @param cache Cache object to use
 * @param vault The vault instance
 */
export function addRefreshButtonHandler(
	element: HTMLElement,
	embedInfo: EmbedInfo,
	ctx: MarkdownPostProcessorContext,
	settings: ObsidianLinkEmbedPluginSettings,
	cache: Map<string, any>,
	vault: any,
): void {
	const refreshButton = element.querySelector('.refresh-button');
	if (refreshButton && embedInfo.url) {
		refreshButton.addEventListener('click', async () => {
			await refreshEmbed(
				embedInfo.url,
				element,
				ctx,
				settings,
				cache,
				vault,
			);
		});
	}
}

/**
 * Embed a URL into the editor.
 *
 * @param editor The editor instance
 * @param selected The selected text and boundary information
 * @param selectedParsers Array of parser types to try
 * @param settings Plugin settings
 * @param cache Cache object to use
 * @param inPlace Whether to replace the selection with the embed
 */
export async function embedUrl(
	editor: Editor,
	selected: Selected,
	selectedParsers: string[],
	settings: any,
	cache: Map<string, any>,
	inPlace: boolean = false,
): Promise<void> {
	// Get the current file path and cursor position for error reporting
	// We don't have access to the actual file, so we'll use a hardcoded path
	const filePath = 'unknown';
	const cursorPos = editor.getCursor();
	const lineNumber = cursorPos.line + 1; // +1 for human-readable line numbers
	const locationInfo = `${filePath}:${lineNumber}`;

	let url = selected.text;
	// replace selection if in place
	if (selected.can && inPlace) {
		editor.replaceRange('', selected.boundary.start, selected.boundary.end);
	}

	// put a dummy preview here first
	const cursor = editor.getCursor();
	const lineText = editor.getLine(cursor.line);
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
		Mustache.render(MarkdownTemplate, {
			title: 'Fetching',
			image: SPINNER,
			description: `Fetching ${url}`,
			url: url,
			favicon: '',
		}) + '\n';

	editor.replaceSelection(dummyEmbed);
	const endCursor = editor.getCursor();

	// if we can fetch result, we can replace the embed with true content
	let idx = 0;
	while (idx < selectedParsers.length) {
		const selectedParser = selectedParsers[idx];
		if (settings.debug) {
			console.log('[Link Embed] Parser:', selectedParser);
		}
		try {
			// Create parser instance on demand
			const parser = createParser(selectedParser, settings, null);
			parser.debug = settings.debug;
			parser.location = locationInfo; // Pass location for error reporting

			const data = await parser.parse(url);
			if (settings.debug) {
				console.log('[Link Embed] Meta data:', data);
			}

			// Generate embed markdown
			const embed = generateEmbedMarkdown(data, settings, selectedParser);

			if (settings.delay > 0) {
				await new Promise((f) => setTimeout(f, settings.delay));
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
				errorNotice(
					error instanceof Error ? error : new Error(String(error)),
					settings.debug,
				);
			}
		}
	}
}
