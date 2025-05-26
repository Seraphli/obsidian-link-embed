import { requestUrl } from 'obsidian';
import { Parser, ParsedLinkData } from './parser';

const electronPkg = require('electron');

export class LocalParser extends Parser {
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
		//If inline - display:none
		if (/display:\s*none/.test(element.getAttribute('style'))) {
			return false;
		}

		//hide images in navigation bar/header
		let contains_header = false;
		element.classList.forEach((val) => {
			if (val.toLowerCase().contains('header')) {
				contains_header = true;
			}
		});
		if (element.id.toLowerCase().contains('header') || contains_header) {
			return false;
		}

		//recurse until <html>
		if (element.parentElement != null) {
			return this.meetsCriteria(element.parentElement);
		}

		return true;
	}

	getImage(doc: Document, url: URL): string {
		const baseEl = doc.querySelector('base[href]') as HTMLBaseElement;
		const base = (baseEl && baseEl.href) || url.href;

		this.debugLog('[Link Embed] Image - Looking for image for:', url.href);
		this.debugLog('[Link Embed] Image - Base URL:', base);

		// First try Open Graph image
		const og = doc.querySelector<HTMLMetaElement>(
			'head meta[property="og:image"]',
		);
		if (og) {
			this.debugLog(
				'[Link Embed] Image - Found Open Graph image:',
				og.content,
			);
			if (og.content) {
				try {
					const resolvedUrl = new URL(og.content, base).href;
					this.debugLog(
						'[Link Embed] Image - Resolved OG image URL:',
						resolvedUrl,
					);
					return resolvedUrl;
				} catch (error) {
					this.debugError(
						'[Link Embed] Image - Error resolving OG image URL:',
						error,
					);
					return og.content;
				}
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
				if (!this.meetsCriteria(img)) {
					continue;
				}
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
						return resolvedUrl;
					} catch (error) {
						this.debugError(
							'[Link Embed] Image - Error resolving image URL:',
							error,
						);
						return src;
					}
				}
			}
		}

		this.debugLog('[Link Embed] Image - No suitable image found');
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

	getFavicon(doc: Document, url: URL): string {
		const baseEl = doc.querySelector('base[href]') as HTMLBaseElement;
		const base = (baseEl && baseEl.href) || url.href;

		this.debugLog(
			'[Link Embed] Favicon - Looking for favicon for:',
			url.href,
		);
		this.debugLog('[Link Embed] Favicon - Base URL:', base);

		// Check for standard favicon link
		const faviconLink = doc.querySelector<HTMLLinkElement>(
			'link[rel="icon"], link[rel="shortcut icon"]',
		);
		if (faviconLink) {
			const hrefAttr = faviconLink.getAttribute('href');
			this.debugLog(
				'[Link Embed] Favicon - Found standard favicon link:',
				hrefAttr,
			);
			if (hrefAttr) {
				try {
					const resolvedUrl = new URL(hrefAttr, base).href;
					this.debugLog(
						'[Link Embed] Favicon - Resolved standard favicon URL:',
						resolvedUrl,
					);
					return resolvedUrl;
				} catch (error) {
					this.debugError(
						'[Link Embed] Favicon - Error resolving standard favicon URL:',
						error,
					);
					return hrefAttr;
				}
			}
		}

		// Check for apple-touch-icon
		const appleIcon = doc.querySelector<HTMLLinkElement>(
			'link[rel="apple-touch-icon"]',
		);
		if (appleIcon) {
			const hrefAttr = appleIcon.getAttribute('href');
			this.debugLog(
				'[Link Embed] Favicon - Found apple-touch-icon:',
				hrefAttr,
			);
			if (hrefAttr) {
				try {
					const resolvedUrl = new URL(hrefAttr, base).href;
					this.debugLog(
						'[Link Embed] Favicon - Resolved apple-touch-icon URL:',
						resolvedUrl,
					);
					return resolvedUrl;
				} catch (error) {
					this.debugError(
						'[Link Embed] Favicon - Error resolving apple-touch-icon URL:',
						error,
					);
					return hrefAttr;
				}
			}
		}

		// Default to /favicon.ico
		try {
			const defaultFaviconUrl = new URL('/favicon.ico', base).href;
			this.debugLog(
				'[Link Embed] Favicon - Using default favicon.ico URL:',
				defaultFaviconUrl,
			);
			return defaultFaviconUrl;
		} catch (error) {
			this.debugError(
				'[Link Embed] Favicon - Error creating default favicon URL:',
				error,
			);
			return '';
		}
	}

	async getHtmlByRequest(url: string): Promise<string> {
		try {
			this.debugLog('[Link Embed] getHtmlByRequest - Fetching URL:', url);
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
	}

	async getHtmlByElectron(url: string): Promise<string> {
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
	}

	async parse(url: string): Promise<ParsedLinkData> {
		let html =
			(await this.getHtmlByElectron(url)) ||
			(await this.getHtmlByRequest(url));

		let parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		// get base url from document
		let uRL = new URL(url);
		this.debugLog('[Link Embed] Doc:', doc);
		let title = this.getTitle(doc, uRL);
		let image = this.getImage(doc, uRL);
		let description = this.getDescription(doc);
		let favicon = this.getFavicon(doc, uRL);

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
