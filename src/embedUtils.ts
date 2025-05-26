import { Editor, Notice, TFile, Vault } from 'obsidian';
import Mustache from 'mustache';
import { Selected } from './exEditor';
import { errorNotice } from './errorUtils';
import { MarkdownTemplate, SPINNER, EmbedInfo } from './constants';
import { formatDate } from './utils';
import { createParser, LocalParser } from './parsers';

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
		if (html) {
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
		}

		// Return empty string if no favicon found
		return '';
	} catch (error) {
		console.error('[Link Embed] Error fetching favicon:', error);
		return '';
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

			// Generate metadata if enabled in settings
			let metadata = '';
			if (settings.useMetadataTemplate) {
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
					formatDate: formatDate,
				};

				// Use Mustache to render the metadata template with the variables
				metadata = Mustache.render(
					settings.metadataTemplate,
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
				favicon: settings.enableFavicon ? data.favicon : '', // Only include favicon if enabled in settings
			};

			const embed = Mustache.render(template, escapedData) + '\n';

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
