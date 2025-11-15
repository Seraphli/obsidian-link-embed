import { Editor, parseYaml, MarkdownPostProcessorContext } from 'obsidian';
import {
    getFavicon,
    renderEmbed,
    addRefreshButtonHandler,
    addCopyButtonHandler,
    addDeleteButtonHandler,
    convertUrlToMarkdownLink,
    embedUrl,
} from './embedUtils';
import { showNotice } from './errorUtils';
import { getImageDimensions } from './parsers';
import { EmbedInfo, SPINNER } from './constants';
import { ObsidianLinkEmbedPluginSettings } from './settings';
import { imageFileToBase64 } from './parsers';
import { checkUrlValid, isUrl } from './urlUtils';
import { ExEditor } from './exEditor';

/**
 * Handler for the editor-paste event.
 * Checks if the pasted text is a URL and updates the pasteInfo accordingly.
 *
 * @param evt The clipboard event
 * @param pasteInfo Object to update with paste information
 */
export function handleEditorPaste(
    evt: ClipboardEvent,
    pasteInfo: { trigger: boolean; text: string },
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
 * @param vault The vault instance
 * @param imageLoadAttempts Map for tracking image loading attempts
 */
export async function handleEmbedCodeBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    settings: ObsidianLinkEmbedPluginSettings,
    cache: Map<string, any>,
    vault: any,
    imageLoadAttempts: Map<string, number>,
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
            showNotice(
                error instanceof Error
                    ? error
                    : `Failed to convert local image to base64: ${String(
                          error,
                      )}`,
                {
                    debug: settings.debug,
                    context: 'Link Embed - Image',
                    duration: 8000,
                    type: 'error',
                },
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
                        showNotice(
                            error instanceof Error
                                ? error
                                : `Error fetching favicon for existing embed: ${String(
                                      error,
                                  )}`,
                            {
                                debug: settings.debug,
                                context: 'Link Embed - Favicon',
                                type: 'error',
                            },
                        );
                    });
                promises.push(faviconPromise);
            }
        } catch (error) {
            showNotice(
                error instanceof Error
                    ? error
                    : `Error setting up favicon fetching: ${String(error)}`,
                {
                    debug: settings.debug,
                    context: 'Link Embed - Favicon Setup',
                    type: 'error',
                },
            );
        }
    }

    // Check if aspect ratio needs to be calculated - use default for first render
    if (settings.respectImageAspectRatio && !info.aspectRatio && info.image) {
        // Set placeholder for initial render
        info.aspectRatio = 100;

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
                    imageLoadAttempts,
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
                        const location = ctx.sourcePath
                            ? `${ctx.sourcePath}:${
                                  ctx.getSectionInfo(el)?.lineStart + 1 ||
                                  'unknown'
                              }`
                            : 'unknown location';
                        showNotice(
                            error instanceof Error
                                ? error
                                : `Error calculating dynamic aspect ratio at ${location}: ${String(
                                      error,
                                  )}`,
                            'error',
                            {
                                debug: settings.debug,
                                context: 'Link Embed - Aspect Ratio',
                                duration: 7000,
                            },
                        );
                    });
                promises.push(aspectRatioPromise);
            }
        } catch (error) {
            showNotice(
                error instanceof Error
                    ? error
                    : `Error setting up aspect ratio calculation: ${String(
                          error,
                      )}`,
                {
                    debug: settings.debug,
                    context: 'Link Embed - Aspect Ratio Setup',
                    type: 'error',
                },
            );
        }
    }

    // First render with placeholder values
    const newEl = renderEmbed(info, info.image, info.aspectRatio, el, settings);

    // Add handlers to the initial render
    addRefreshButtonHandler(newEl, info, ctx, settings, vault);
    addCopyButtonHandler(newEl, info, ctx, vault, settings);
    addDeleteButtonHandler(newEl, info, ctx, vault, settings);

    // If we have any promises, wait for all to complete then do final render
    if (promises.length > 0) {
        Promise.all(promises)
            .then(() => {
                // Final render with all real values
                const finalEl = renderEmbed(
                    originalInfo,
                    originalInfo.image,
                    originalInfo.aspectRatio,
                    newEl,
                    settings,
                );

                // Add handlers to the final render
                addRefreshButtonHandler(
                    finalEl,
                    originalInfo,
                    ctx,
                    settings,
                    vault,
                );
                addCopyButtonHandler(
                    finalEl,
                    originalInfo,
                    ctx,
                    vault,
                    settings,
                );
                addDeleteButtonHandler(
                    finalEl,
                    originalInfo,
                    ctx,
                    vault,
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
                // Using the info type with warning prefix for a less severe notification
                showNotice(
                    error instanceof Error
                        ? error
                        : `Error during data fetching: ${String(error)}`,
                    {
                        debug: settings.debug,
                        context: 'Link Embed - Data Fetch',
                        type: 'warning',
                        prefix: 'Warning',
                    },
                );
            });
    }
}

/**
 * Handler for the "embed-link" command.
 * Embeds the selected URL or clipboard content if it's a URL.
 *
 * @param editor The editor instance
 * @param settings Plugin settings
 */
export async function handleEmbedLinkCommand(
    editor: Editor,
    settings: ObsidianLinkEmbedPluginSettings,
): Promise<void> {
    const selected = await ExEditor.getText(editor, settings.debug);
    if (!checkUrlValid(selected)) {
        return;
    }
    await embedUrl(
        editor,
        selected,
        [settings.primary, settings.backup],
        settings,
        settings.inPlace,
    );
}

/**
 * Create a handler for a specific parser command.
 *
 * @param parserName The name of the parser to use
 * @param settings Plugin settings
 * @returns A command handler function
 */
export function createParserCommandHandler(
    parserName: string,
    settings: ObsidianLinkEmbedPluginSettings,
): (editor: Editor) => Promise<void> {
    return async (editor: Editor) => {
        const selected = await ExEditor.getText(editor, settings.debug);
        if (!checkUrlValid(selected)) {
            return;
        }
        await embedUrl(
            editor,
            selected,
            [parserName],
            settings,
            settings.inPlace,
        );
    };
}

/**
 * Handler for the "create-markdown-link" command.
 * Converts the selected URL or clipboard content to [title](url) format.
 *
 * @param editor The editor instance
 * @param settings Plugin settings
 * @param vault The vault instance
 * @param parsers Optional array of parser names to use (defaults to primary and backup)
 */
export async function handleCreateMarkdownLinkCommand(
    editor: Editor,
    settings: ObsidianLinkEmbedPluginSettings,
    vault: any,
    parsers?: string[],
): Promise<void> {
    const selected = await ExEditor.getText(editor, settings.debug);
    if (!checkUrlValid(selected)) {
        return;
    }
    const url = selected.text;
    const boundary = selected.boundary;
    const selectedParsers = parsers || [settings.primary, settings.backup];
    const mdLink = await convertUrlToMarkdownLink(
        url,
        selectedParsers,
        settings,
        vault,
    );
    if (mdLink) {
        editor.replaceRange(mdLink, boundary.start, boundary.end);
    }
}
