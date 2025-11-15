import { Editor, Notice, MarkdownPostProcessorContext } from 'obsidian';
import Mustache from 'mustache';
import { Selected } from './exEditor';
import { showNotice } from './errorUtils';
import {
    MarkdownTemplate,
    SPINNER,
    EmbedInfo,
    HTMLTemplate,
} from './constants';
import { formatDate } from './utils';
import { LocalParser, createParser } from './parsers';
import { ObsidianLinkEmbedPluginSettings } from './settings';

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
        showNotice(
            error instanceof Error
                ? error
                : `Error fetching favicon: ${String(error)}`,
            { debug, context: 'Link Embed - Favicon', type: 'error' },
        );
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
 * Tries to parse a URL using multiple parsers, returning the first successful result
 *
 * @param url The URL to parse
 * @param selectedParsers Array of parser types to try
 * @param settings Plugin settings
 * @param locationInfo Location info for error reporting
 * @returns An object containing the parsed data and the parser that was successful
 * @throws Error if all parsers fail
 */
export async function tryParsers(
    url: string,
    selectedParsers: string[],
    settings: any,
    locationInfo: string,
): Promise<{ data: any; selectedParser: string }> {
    let notice: Notice | null = null;
    try {
        let idx = 0;
        while (idx < selectedParsers.length) {
            const selectedParser = selectedParsers[idx];
            if (settings.debug) {
                console.log('[Link Embed] Parser:', selectedParser);
            }

            if (notice) {
                notice.hide();
            }
            notice = new Notice(
                `Fetching link metadata using ${selectedParser}...`,
                0,
            );

            try {
                const parser = createParser(selectedParser, settings, null);
                parser.debug = settings.debug;
                parser.location = locationInfo;

                const data = await parser.parse(url);
                if (settings.debug) {
                    console.log('[Link Embed] Meta data:', data);
                }

                notice.hide();
                return { data, selectedParser };
            } catch (error) {
                showNotice(error instanceof Error ? error : String(error), {
                    debug: settings.debug,
                    context: 'Link Embed - Parser',
                    type: 'error',
                });
                idx += 1;
                if (idx === selectedParsers.length) {
                    if (notice) {
                        notice.hide();
                    }
                    throw error;
                }
            }
        }
        if (notice) {
            notice.hide();
        }
        throw new Error('All parsers failed');
    } catch (error) {
        if (notice) {
            notice.hide();
        }
        throw error;
    }
}

/**
 * Converts a URL to Markdown link format [title](url)
 * Tries multiple parsers to fetch the title
 *
 * @param url The URL to convert
 * @param selectedParsers Array of parser types to try
 * @param settings Plugin settings
 * @param vault The vault instance
 * @returns The markdown link string or null if failed
 */
export async function convertUrlToMarkdownLink(
    url: string,
    selectedParsers: string[],
    settings: any,
    vault: any,
): Promise<string | null> {
    try {
        const { data } = await tryParsers(
            url,
            selectedParsers,
            settings,
            'create-markdown-link',
        );
        if (data.title) {
            return `[${data.title}](${url})`;
        }
        return null;
    } catch (error) {
        if (settings.debug) {
            console.log(
                'Link Embed: Failed to fetch title for markdown link',
                error,
            );
        }
        return null;
    }
}

/**
 * Refreshes an embed by fetching new metadata and replacing the code block
 *
 * @param url The URL to refresh
 * @param element The element containing the embed
 * @param ctx The markdown post processor context
 * @param settings Plugin settings
 * @param vault The vault instance
 */
export async function refreshEmbed(
    url: string,
    element: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    settings: ObsidianLinkEmbedPluginSettings,
    vault: any,
): Promise<boolean> {
    try {
        if (settings.debug) {
            console.log('[Link Embed] Refreshing embed for URL:', url);
        }

        // Get the current file
        const file = vault.getAbstractFileByPath(ctx.sourcePath);
        if (!file) {
            showNotice(`File not found: ${ctx.sourcePath}`, {
                debug: settings.debug,
                context: 'Link Embed - Refresh',
                type: 'error',
            });
            return false;
        }

        // Get section info to locate the code block
        const sectionInfo = ctx.getSectionInfo(element);
        if (!sectionInfo) {
            showNotice('Could not get section info', {
                debug: settings.debug,
                context: 'Link Embed - Refresh',
                type: 'error',
            });
            return false;
        }

        // Create location info string from section info for error reporting
        const locationInfo = `${ctx.sourcePath}:${sectionInfo.lineStart}`;

        // Get file content and find the code block
        const content = await vault.read(file);
        const lines = content.split('\n');
        const startLine = sectionInfo.lineStart;
        const endLine = sectionInfo.lineEnd + 1;
        const oldEmbed = lines.slice(startLine, endLine).join('\n');

        try {
            // Try to parse the URL using the configured parsers
            const { data, selectedParser } = await tryParsers(
                url,
                [settings.primary, settings.backup],
                settings,
                locationInfo,
            );

            // Create new embed code block
            const newEmbed = generateEmbedMarkdown(
                data,
                settings,
                selectedParser,
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
            return true;
        } catch (error) {
            showNotice(
                error instanceof Error
                    ? error
                    : `All parsers failed to fetch metadata: ${String(error)}`,
                {
                    debug: settings.debug,
                    context: 'Link Embed - Refresh',
                    type: 'error',
                },
            );
            return false;
        }
    } catch (error) {
        showNotice(
            error instanceof Error
                ? error
                : `Error refreshing embed: ${String(error)}`,
            {
                debug: settings.debug,
                context: 'Link Embed - Refresh',
                type: 'error',
            },
        );
        return false;
    }
}

/**
 * Adds a refresh button event handler to the given element
 *
 * @param element The element containing the refresh button
 * @param embedInfo The embed information
 * @param ctx The markdown post processor context
 * @param settings Plugin settings
 * @param vault The vault instance
 */
export function addRefreshButtonHandler(
    element: HTMLElement,
    embedInfo: EmbedInfo,
    ctx: MarkdownPostProcessorContext,
    settings: ObsidianLinkEmbedPluginSettings,
    vault: any,
): void {
    const refreshButton = element.querySelector('.refresh-button');
    if (refreshButton && embedInfo.url) {
        refreshButton.addEventListener('click', async () => {
            const success = await refreshEmbed(
                embedInfo.url,
                element,
                ctx,
                settings,
                vault,
            );
            if (success) {
                showNotice('Embed refreshed successfully', 'success', {
                    debug: settings.debug,
                    context: 'Link Embed - Refresh',
                });
            }
        });
    }
}

/**
 * Adds a copy button event handler to the given element
 * Copies the exact lines of the embed in the editor
 *
 * @param element The element containing the copy button
 * @param embedInfo The embed information
 * @param ctx The markdown post processor context (needed to find position in document)
 * @param vault The vault instance (needed to read file content)
 */
export function addCopyButtonHandler(
    element: HTMLElement,
    embedInfo: EmbedInfo,
    ctx?: MarkdownPostProcessorContext,
    vault?: any,
    settings?: ObsidianLinkEmbedPluginSettings,
): void {
    const copyButton = element.querySelector('.copy-button');
    if (copyButton) {
        copyButton.addEventListener('click', async () => {
            try {
                // Get the current file - same approach as refreshEmbed
                const file = vault.getAbstractFileByPath(ctx.sourcePath);
                if (!file) {
                    showNotice(`File not found: ${ctx.sourcePath}`, {
                        debug: settings.debug,
                        context: 'Link Embed - Copy',
                        type: 'error',
                    });
                    return;
                }

                // Get section info to locate the code block
                const sectionInfo = ctx.getSectionInfo(element);
                if (!sectionInfo) {
                    showNotice('Could not get section info', {
                        debug: settings.debug,
                        context: 'Link Embed - Copy',
                        type: 'error',
                    });
                    return;
                }

                // Get file content and find the code block
                const content = await vault.read(file);
                const lines = content.split('\n');
                const startLine = sectionInfo.lineStart;
                const endLine = sectionInfo.lineEnd + 1;
                const embedCode = lines.slice(startLine, endLine).join('\n');

                // Copy the exact embed code to clipboard
                navigator.clipboard
                    .writeText(embedCode)
                    .then(() => {
                        showNotice('Embed code copied to clipboard', {
                            debug: settings?.debug || false,
                            context: 'Link Embed - Copy',
                            type: 'success',
                        });
                    })
                    .catch((error) => {
                        showNotice(
                            error instanceof Error
                                ? error
                                : `Error copying to clipboard: ${String(
                                      error,
                                  )}`,
                            {
                                debug: settings?.debug || false,
                                context: 'Link Embed - Copy',
                                type: 'error',
                            },
                        );
                    });
            } catch (error) {
                showNotice(
                    error instanceof Error
                        ? error
                        : `Error copying embed code: ${String(error)}`,
                    {
                        debug: settings?.debug || false,
                        context: 'Link Embed - Copy',
                        type: 'error',
                    },
                );
            }
        });
    }
}

/**
 * Add a click handler for the delete button that removes the entire embed block from the file.
 *
 * @param element The HTML element containing the embed
 * @param embedInfo Embed information (not used but kept for consistency)
 * @param ctx Markdown post processor context
 * @param vault The vault instance (needed to modify file content)
 * @param settings Plugin settings
 */
export function addDeleteButtonHandler(
    element: HTMLElement,
    embedInfo: EmbedInfo,
    ctx?: MarkdownPostProcessorContext,
    vault?: any,
    settings?: ObsidianLinkEmbedPluginSettings,
): void {
    const deleteButton = element.querySelector('.delete-button');
    if (deleteButton) {
        deleteButton.addEventListener('click', async () => {
            try {
                // Get the current file
                const file = vault.getAbstractFileByPath(ctx.sourcePath);
                if (!file) {
                    showNotice(`File not found: ${ctx.sourcePath}`, {
                        debug: settings.debug,
                        context: 'Link Embed - Delete',
                        type: 'error',
                    });
                    return;
                }

                // Get section info to locate the code block
                const sectionInfo = ctx.getSectionInfo(element);
                if (!sectionInfo) {
                    showNotice('Could not get section info', {
                        debug: settings.debug,
                        context: 'Link Embed - Delete',
                        type: 'error',
                    });
                    return;
                }

                // Get file content and remove the embed block
                const content = await vault.read(file);
                const lines = content.split('\n');
                const startLine = sectionInfo.lineStart;
                const endLine = sectionInfo.lineEnd + 1;

                // Remove the embed block lines
                const newLines = [
                    ...lines.slice(0, startLine),
                    ...lines.slice(endLine),
                ];
                const newContent = newLines.join('\n');

                // Write the modified content back to the file
                await vault.modify(file, newContent);

                showNotice('Embed block deleted', {
                    debug: settings?.debug || false,
                    context: 'Link Embed - Delete',
                    type: 'success',
                });
            } catch (error) {
                showNotice(
                    error instanceof Error
                        ? error
                        : `Error deleting embed block: ${String(error)}`,
                    {
                        debug: settings?.debug || false,
                        context: 'Link Embed - Delete',
                        type: 'error',
                    },
                );
            }
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
 * @param inPlace Whether to replace the selection with the embed
 */
export async function embedUrl(
    editor: Editor,
    selected: Selected,
    selectedParsers: string[],
    settings: any,
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

    // Generate a unique ID for this placeholder to track it reliably
    const placeholderId = `embed-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    const dummyEmbed =
        Mustache.render(MarkdownTemplate, {
            title: 'Fetching',
            image: SPINNER,
            description: `Fetching ${url}`,
            url: url,
            favicon: '',
            metadata: `placeholder-id: "${placeholderId}"`,
        }) + '\n';

    editor.replaceSelection(dummyEmbed);

    // if we can fetch result, we can replace the embed with true content
    try {
        // Try to parse the URL using the provided parsers
        const { data, selectedParser } = await tryParsers(
            url,
            selectedParsers,
            settings,
            locationInfo,
        );

        // Generate embed markdown
        const embed = generateEmbedMarkdown(data, settings, selectedParser);

        if (settings.delay > 0) {
            await new Promise((f) => setTimeout(f, settings.delay));
        }

        // Search for the placeholder in the entire document instead of using fixed positions
        // This handles cases where other embeds were inserted/modified before this one
        const fullText = editor.getValue();
        const placeholderIndex = fullText.indexOf(placeholderId);

        if (placeholderIndex === -1) {
            new Notice(
                `Dummy preview has been deleted or modified. Replacing is cancelled.`,
            );
            return;
        }

        // Find the start of the embed block (search backwards for ```embed)
        let embedStart = fullText.lastIndexOf('```embed', placeholderIndex);
        if (embedStart === -1) {
            new Notice(
                `Dummy preview has been deleted or modified. Replacing is cancelled.`,
            );
            return;
        }

        // Find the end of the embed block (search forwards for ```)
        let embedEnd = fullText.indexOf('```', placeholderIndex);
        if (embedEnd === -1) {
            new Notice(
                `Dummy preview has been deleted or modified. Replacing is cancelled.`,
            );
            return;
        }
        embedEnd += 3; // Include the closing ```

        // Extract the dummy embed to verify it's intact
        const dummy = fullText.substring(embedStart, embedEnd);
        const hasUrl = dummy.includes(`url: "${url}"`);

        if (!hasUrl) {
            new Notice(
                `Dummy preview has been deleted or modified. Replacing is cancelled.`,
            );
            return;
        }

        // Convert character positions to line/ch positions
        const startPos = editor.offsetToPos(embedStart);
        const endPos = editor.offsetToPos(embedEnd);

        // Replace the dummy with the actual embed
        editor.replaceRange(embed.trimEnd(), startPos, endPos);
        console.log(`[Link Embed] Parser ${selectedParser} done`);
    } catch (error) {
        console.log('[Link Embed] Error:', error);
        showNotice(error instanceof Error ? error : String(error), {
            debug: settings.debug,
            context: 'Link Embed - Embed URL',
            type: 'error',
        });
    }
}
