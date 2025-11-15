import { MarkdownPostProcessorContext } from 'obsidian';
import { ObsidianLinkEmbedPluginSettings } from './settings';
import { getFavicon } from './embedUtils';

/**
 * Handler for adding favicons to markdown links in reading mode
 */
export class LinkFaviconHandler {
    private settings: ObsidianLinkEmbedPluginSettings;
    private cache: Map<string, any>;

    constructor(
        settings: ObsidianLinkEmbedPluginSettings,
        cache: Map<string, any>,
    ) {
        this.settings = settings;
        this.cache = cache;
    }

    /**
     * Process markdown links and add favicons
     */
    async processLinks(
        element: HTMLElement,
        ctx: MarkdownPostProcessorContext,
    ): Promise<void> {
        // Only process if markdown link favicon is enabled
        if (!this.settings.enableMarkdownLinkFavicon) {
            return;
        }

        // Check if reading mode is enabled
        if (!this.settings.enableMarkdownLinkFaviconInReading) {
            return;
        }

        // Find all external links that don't already have favicons
        const links = element.querySelectorAll(
            'a.external-link:not([data-link-favicon])',
        );

        for (let i = 0; i < links.length; i++) {
            const link = links.item(i) as HTMLAnchorElement;

            // Skip if link is disabled or already processed
            if (this.isDisabled(link)) {
                continue;
            }

            // Mark as processed
            link.dataset.linkFavicon = 'true';

            try {
                // Get the URL
                const url = link.href;
                if (!url || !url.startsWith('http')) {
                    continue;
                }

                // Get favicon
                const favicon = await getFavicon(
                    url,
                    this.settings,
                    this.cache,
                    this.settings.debug,
                );

                if (favicon) {
                    // Create favicon image element
                    const faviconImg = activeDocument.createElement('img');
                    faviconImg.src = favicon;
                    faviconImg.addClass('link-favicon');
                    faviconImg.alt = 'favicon';

                    // Add inline styles to prevent other themes/plugins from overriding
                    faviconImg.style.height = '0.8em';
                    faviconImg.style.display = 'inline-block';

                    // Add favicon based on position setting
                    if (
                        this.settings.markdownLinkFaviconPosition === 'before'
                    ) {
                        link.prepend(faviconImg);
                    } else {
                        link.append(faviconImg);
                    }

                    if (this.settings.debug) {
                        console.log(
                            '[Link Embed] Added favicon to markdown link:',
                            url,
                        );
                    }
                }
            } catch (error) {
                if (this.settings.debug) {
                    console.error(
                        '[Link Embed] Error adding favicon to link:',
                        error,
                    );
                }
            }
        }
    }

    /**
     * Check if a link should be disabled from favicon processing
     */
    private isDisabled(link: HTMLAnchorElement): boolean {
        // Check if link has data attribute to disable favicon
        if (link.getAttribute('data-no-favicon')) {
            return true;
        }

        // Check if already processed
        if (link.getAttribute('data-link-favicon')) {
            return true;
        }

        // Check if link text contains |nofavicon
        if (link.textContent?.includes('|nofavicon')) {
            return true;
        }

        // Check settings for showing favicon on aliased/non-aliased links
        const isAliased = link.textContent !== link.href;

        if (!this.settings.showMarkdownLinkFaviconOnAliased && isAliased) {
            return true;
        }

        if (!this.settings.showMarkdownLinkFaviconOnPlain && !isAliased) {
            return true;
        }

        return false;
    }
}
