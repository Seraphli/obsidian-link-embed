import { requestUrl } from 'obsidian';
import { Parser, ParsedLinkData } from './parser';
import { ConcurrencyLimiter } from '../utils/concurrencyLimiter';
import { getImageDimensions } from './utils/imageUtils';

const electronPkg = require('electron');

export class LocalParser extends Parser {
	// Static limiter shared across all instances
	private static limiter: ConcurrencyLimiter | null = null;

	// Method to initialize the limiter with settings
	public static initLimiter(maxConcurrency: number): void {
		if (!LocalParser.limiter) {
			LocalParser.limiter = new ConcurrencyLimiter(maxConcurrency);
		} else {
			LocalParser.limiter.setMaxConcurrency(maxConcurrency);
		}
	}
	process(data: any): {
		title: string;
		image: string;
		description: string;
		favicon?: string;
	} {
		let title = data.title || '';
		const image = data.image || '';
		let description: string = data.description || '';
		const favicon = data.favicon || '';

		description = description.replace(/\n/g, ' ').replace(/\\/g, '\\\\');
		title = title.replace(/\n/g, ' ').replace(/\\/g, '\\\\');

		return { title, image, description, favicon };
	}

	getTitle(doc: Document, url: URL): string {
		let element = doc.querySelector('head meta[property="og:title"]');
		if (element instanceof HTMLMetaElement) {
			return element.content;
		}
		element = doc.querySelector('head title');
		if (element) {
			return element.textContent;
		}
		return url.hostname;
	}

	meetsCriteria(element: Element): boolean {
		// If inline - display:none
		if (/display:\s*none/.test(element.getAttribute('style'))) {
			return false;
		}

		// Check for logo images which should be allowed even in headers
		if (element instanceof HTMLImageElement) {
			const src = element.getAttribute('src') || '';
			const alt = element.getAttribute('alt') || '';

			// Allow images that are likely logos based on src or alt text
			if (
				src.toLowerCase().includes('logo') ||
				alt.toLowerCase().includes('logo') ||
				src.endsWith('.svg') // SVGs are often used for logos
			) {
				this.debugLog('[Link Embed] Image - Allowing logo image:', src);
				return true;
			}
		}

		// Hide images in navigation bar/header, unless they're potential logos
		let contains_header = false;
		element.classList.forEach((val) => {
			if (val.toLowerCase().includes('header')) {
				contains_header = true;
			}
		});

		if (
			(element.id.toLowerCase().includes('header') || contains_header) &&
			!(element instanceof HTMLImageElement)
		) {
			return false;
		}

		// Recurse until <html>
		if (element.parentElement != null) {
			return this.meetsCriteria(element.parentElement);
		}

		return true;
	}

	// Method to verify if an image URL can be loaded
	private async verifyImageUrl(
		imgUrl: string,
		failedUrls: Set<string>,
	): Promise<string | null> {
		if (failedUrls.has(imgUrl)) return null;

		try {
			// Try to get image dimensions - this will verify the image loads
			const dimensions = await getImageDimensions(imgUrl);
			if (dimensions) {
				this.debugLog(
					'[Link Embed] Image - Successfully verified image loads:',
					imgUrl,
				);
				return imgUrl;
			} else {
				this.debugLog(
					'[Link Embed] Image - Image failed to load properly:',
					imgUrl,
				);
				failedUrls.add(imgUrl);
			}
		} catch (error) {
			this.debugError(
				'[Link Embed] Image - Failed to load image:',
				imgUrl,
				error,
			);
			failedUrls.add(imgUrl);
		}
		return null;
	}

	async getImage(doc: Document, url: URL): Promise<string> {
		const base = url.href;
		const failedUrls = new Set<string>(); // Track failed URLs

		this.debugLog('[Link Embed] Image - Looking for image for:', url.href);
		this.debugLog('[Link Embed] Image - Base URL:', base);

		// First try Open Graph image
		const og = doc.querySelector<HTMLMetaElement>(
			'head meta[property="og:image"]',
		);
		if (og && og.content) {
			this.debugLog(
				'[Link Embed] Image - Found Open Graph image:',
				og.content,
			);
			try {
				const resolvedUrl = new URL(og.content, base).href;
				this.debugLog(
					'[Link Embed] Image - Resolved OG image URL:',
					resolvedUrl,
				);

				// Verify OG image loads
				const verifiedUrl = await this.verifyImageUrl(
					resolvedUrl,
					failedUrls,
				);
				if (verifiedUrl) return verifiedUrl;
			} catch (error) {
				this.debugError(
					'[Link Embed] Image - Error resolving OG image URL:',
					error,
				);
				// No longer trying with original content if URL resolution fails
			}
		}

		// Try each image selector in order
		const selectors = [
			'div[itemtype$="://schema.org/Product"] noscript img',
			'div[itemtype$="://schema.org/Product"] img',
			'#main noscript img',
			'#main img',
			'main noscript img',
			'main img',
			'*[role="main"] img',
			'body noscript img',
			'body img',
		];

		for (const sel of selectors) {
			const imgs = Array.from(
				doc.querySelectorAll<HTMLImageElement>(sel),
			);
			this.debugLog(
				`[Link Embed] Image - Found ${imgs.length} images for selector "${sel}"`,
			);

			for (const img of imgs) {
				if (!this.meetsCriteria(img)) continue;

				const src = img.getAttribute('src');
				if (src) {
					this.debugLog(
						'[Link Embed] Image - Found valid image src:',
						src,
					);
					try {
						const resolvedUrl = new URL(src, base).href;
						this.debugLog(
							'[Link Embed] Image - Resolved image URL:',
							resolvedUrl,
						);

						// Verify image loads
						const verifiedUrl = await this.verifyImageUrl(
							resolvedUrl,
							failedUrls,
						);
						if (verifiedUrl) return verifiedUrl;
					} catch (error) {
						this.debugError(
							'[Link Embed] Image - Error resolving image URL:',
							error,
						);
						// No longer trying with original src if URL resolution fails
					}
				}
			}
		}

		this.debugLog(
			'[Link Embed] Image - No suitable image found or all images failed to load',
		);
		return '';
	}

	getDescription(doc: Document): string {
		let element = doc.querySelector('head meta[property="og:description"]');
		if (element instanceof HTMLMetaElement) {
			return element.content;
		}
		element = doc.querySelector('head meta[name="description"]');
		if (element instanceof HTMLMetaElement) {
			return element.content;
		}
		return '';
	}

	async getFavicon(doc: Document, url: URL): Promise<string> {
		const base = url.href;
		const failedUrls = new Set<string>(); // Track failed URLs

		this.debugLog(
			'[Link Embed] Favicon - Looking for favicon for:',
			url.href,
		);
		this.debugLog('[Link Embed] Favicon - Base URL:', base);

		// Define favicon selectors in priority order
		const faviconSelectors = [
			'link[rel="icon"]',
			'link[rel="shortcut icon"]',
			'link[rel="apple-touch-icon"]',
			'link[rel="apple-touch-icon-precomposed"]',
		];

		// Try each favicon selector with verification
		for (const selector of faviconSelectors) {
			const faviconLink = doc.querySelector<HTMLLinkElement>(selector);
			if (faviconLink) {
				const hrefAttr = faviconLink.getAttribute('href');
				this.debugLog(
					`[Link Embed] Favicon - Found ${selector}:`,
					hrefAttr,
				);
				if (hrefAttr) {
					try {
						const resolvedUrl = new URL(hrefAttr, base).href;
						this.debugLog(
							`[Link Embed] Favicon - Resolved ${selector} URL:`,
							resolvedUrl,
						);

						// Verify favicon URL loads
						const verifiedUrl = await this.verifyImageUrl(
							resolvedUrl,
							failedUrls,
						);
						if (verifiedUrl) {
							this.debugLog(
								'[Link Embed] Favicon - Successfully verified favicon:',
								verifiedUrl,
							);
							return verifiedUrl;
						}
					} catch (error) {
						this.debugError(
							`[Link Embed] Favicon - Error resolving ${selector} URL:`,
							error,
						);
						// Continue to next selector
					}
				}
			}
		}

		// Try default /favicon.ico as fallback
		try {
			const defaultFaviconUrl = new URL('/favicon.ico', base).href;
			this.debugLog(
				'[Link Embed] Favicon - Trying default /favicon.ico:',
				defaultFaviconUrl,
			);

			const verifiedUrl = await this.verifyImageUrl(
				defaultFaviconUrl,
				failedUrls,
			);
			if (verifiedUrl) {
				this.debugLog(
					'[Link Embed] Favicon - Successfully verified default favicon:',
					verifiedUrl,
				);
				return verifiedUrl;
			}
		} catch (error) {
			this.debugError(
				'[Link Embed] Favicon - Error with default /favicon.ico:',
				error,
			);
		}

		// Use Chrome's default globe icon as the final fallback
		// This is a data URI representation of Chrome's globe icon used when sites don't have a favicon
		const defaultFaviconDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABRklEQVR42mKgOqjq75ds7510YNL0uV9nAGqniqwKYiCIHIIjcAK22BGQLRdgBWvc3fnWk/FJhrkPO1xPgGvqPfLfJMHhT1yqurvS48bPaJhjD2efgidnVwa2yv59xecvEvi0UWCXq9t0ItfP2MMZ7nwIpkA8F1n8uLxZHM6yrBH7FIl2gFXDHYsErkn2hyKLHtcKrFntk58uVQJ+kSdQnmjhID4cwLLa8+K0BXsfNWCqBOsFdo2Yldv43DBrkxd30cjnNyYBhK0SQGkI9pG4Mu40D5b374DRCAyhHqXVfTmOwivivMkJxBz5wnHCtBfGgNFC+ChWKWRf3hsQIlyEoIv4IYEo5wkgtBLRekY9DE4Uin4Keae6hydGnljPmE8kRcCine6827AMsJ1IuW9ibnlQpXLBCR/WC875m2BP+VSu3c/0m+8V08OBngc0pxcAAAAASUVORK5CYII=';
		this.debugLog(
			'[Link Embed] Favicon - Using default favicon data URI'
		);
		return defaultFaviconDataUri;
	}

	async getHtmlByRequest(url: string): Promise<string> {
		// Use the limiter to control concurrency
		return (
			(await LocalParser.limiter?.enqueue(async () => {
				try {
					this.debugLog(
						'[Link Embed] getHtmlByRequest - Fetching URL:',
						url,
					);
					const response = await requestUrl({ url: url });
					const html = response.text;

					this.debugLog(
						'[Link Embed] getHtmlByRequest - Successfully fetched HTML, size:',
						html.length,
					);
					// Log response headers to check content type
					this.debugLog(
						'[Link Embed] getHtmlByRequest - Response headers:',
						response.headers,
					);

					return html;
				} catch (error) {
					this.debugError(
						'[Link Embed] getHtmlByRequest - Error fetching HTML:',
						error,
					);
					return null;
				}
			})) || null
		);
	}

	async getHtmlByElectron(url: string): Promise<string> {
		// Use the limiter to control concurrency
		return (
			(await LocalParser.limiter?.enqueue(async () => {
				let window: any = null;
				try {
					this.debugLog(
						'[Link Embed] getHtmlByElectron - Attempting to fetch URL:',
						url,
					);

					const { remote } = electronPkg;
					const { BrowserWindow } = remote;

					window = new BrowserWindow({
						width: 1366,
						height: 768,
						webPreferences: {
							nodeIntegration: false,
							contextIsolation: true,
							sandbox: true,
							images: false,
						},
						show: false,
					});
					window.webContents.setAudioMuted(true);

					await new Promise<void>((resolve, reject) => {
						window.webContents.on('did-finish-load', (e: any) => {
							this.debugLog(
								'[Link Embed] getHtmlByElectron - Page loaded successfully',
							);
							resolve(e);
						});
						window.webContents.on('did-fail-load', (e: any) => {
							this.debugError(
								'[Link Embed] getHtmlByElectron - Page failed to load:',
								e,
							);
							reject(e);
						});

						this.debugLog(
							'[Link Embed] getHtmlByElectron - Loading URL:',
							url,
						);
						window.loadURL(url);
					});

					this.debugLog(
						'[Link Embed] getHtmlByElectron - Executing JavaScript to get HTML content',
					);

					let doc = await window.webContents.executeJavaScript(
						'document.documentElement.outerHTML;',
					);
					window.close();
					return doc;
				} catch (ex) {
					this.debugError(
						'[Link Embed] getHtmlByElectron - Failed to use electron:',
						ex,
					);
					if (window) {
						window.close();
					}
					return null;
				}
			})) || null

);
	}

	async parse(url: string): Promise<ParsedLinkData> {
		let html =
			(await this.getHtmlByElectron(url)) ||
			(await this.getHtmlByRequest(url));

		// Add null/empty check to ensure fallback to another parser
		if (!html) {
			this.debugError(
				'[Link Embed] Failed to fetch HTML content for:',
				url,
			);
			throw new Error(`Failed to fetch HTML content from ${url}`);
		}

		let parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		// get base url from document
		let uRL = new URL(url);
		this.debugLog('[Link Embed] Doc:', doc);
		let title = this.getTitle(doc, uRL);
		let description = this.getDescription(doc);
		let favicon = await this.getFavicon(doc, uRL);
		// Get image - now this is an async call
		let image = await this.getImage(doc, uRL);

		// 1. First, process the raw data to extract basic information
		let processedData = this.process({
			title,
			image,
			description,
			favicon,
		});

		// 2. Use the common method to handle image processing and aspect ratio
		return await this.handleImageProcessing(processedData, url);
	}
}
