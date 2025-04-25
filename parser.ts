import { Notice, TFile, normalizePath } from 'obsidian';
import Mustache from 'mustache';
import { requestUrl } from 'obsidian';
import * as path from 'path';
import * as crypto from 'crypto';
const electronPkg = require('electron');

// Define image dimensions type
export type ImageDimensions = {
	width: number;
	height: number;
	aspectRatio: number;
};

// Define interface for parsed link data
export interface ParsedLinkData {
	title: string;
	image: string;
	description: string;
	url: string;
	aspectRatio?: number;
}

/**
 * Utility function to get image dimensions and calculate aspect ratio
 * Works with both regular URLs and base64 data URLs
 * Uses a cache to avoid fetching the same image dimensions multiple times
 *
 * @param imageUrl - URL or data URL of the image
 * @param cache - Map to store cached image dimensions
 * @returns Promise with width, height, and aspectRatio or null on error
 */
export async function getImageDimensions(
	imageUrl: string,
	cache?: Map<string, ImageDimensions>,
): Promise<ImageDimensions | null> {
	try {
		// Check if dimensions are already in cache
		if (cache && cache.has(imageUrl)) {
			console.log(
				'[Link Embed] Using cached image dimensions for:',
				imageUrl.substring(0, 50) + (imageUrl.length > 50 ? '...' : ''),
			);
			return cache.get(imageUrl);
		}

		// Not in cache, fetch dimensions
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				// Calculate aspect ratio as (height/width * 100) for padding-bottom CSS technique
				const aspectRatio = (img.height / img.width) * 100;
				const dimensions: ImageDimensions = {
					width: img.width,
					height: img.height,
					aspectRatio: aspectRatio,
				};

				// Store in cache for future use if available
				if (cache) {
					cache.set(imageUrl, dimensions);
					console.log(
						'[Link Embed] Cached image dimensions for:',
						imageUrl.substring(0, 50) +
							(imageUrl.length > 50 ? '...' : ''),
					);
				}

				resolve(dimensions);
			};
			img.onerror = () => {
				reject(
					new Error(
						`Failed to load image: ${imageUrl.substring(0, 150)}${
							imageUrl.length > 150 ? '...' : ''
						}`,
					),
				);
			};
			img.src = imageUrl;
		});
	} catch (error) {
		console.error(
			`[Link Embed] Error getting image dimensions for ${imageUrl.substring(
				0,
				150,
			)}${imageUrl.length > 150 ? '...' : ''}:`,
			error,
		);
		return null;
	}
}

// Utility function to download and save an image to the vault
export async function downloadImageToVault(
	url: string,
	vault: any,
	folderPath: string,
): Promise<string> {
	if (!url || url.startsWith('data:')) {
		return url; // Return as is if it's already a data URL or empty
	}

	try {
		// Create folder if it doesn't exist
		const normalizedFolderPath = normalizePath(folderPath);
		try {
			await vault.createFolder(normalizedFolderPath);
		} catch (e) {
			// Folder likely already exists, which is fine
		}

		// Generate a unique filename based on URL
		const urlHash = crypto
			.createHash('md5')
			.update(url)
			.digest('hex')
			.slice(0, 8);
		const urlObj = new URL(url);
		let fileName = path.basename(urlObj.pathname);

		// If no extension or filename is empty, use default
		if (!fileName || fileName === '' || !path.extname(fileName)) {
			fileName = `image-${urlHash}.png`;
		} else {
			// Add hash to filename to prevent collisions
			const ext = path.extname(fileName);
			const nameWithoutExt = path.basename(fileName, ext);
			fileName = `${nameWithoutExt}-${urlHash}${ext}`;
		}

		// Download the image
		const response = await requestUrl({ url });

		// Full path to save the file
		const filePath = normalizePath(`${folderPath}/${fileName}`);

		// Save to vault
		const buffer = response.arrayBuffer;

		// Check if file already exists
		const existingFile = vault.getAbstractFileByPath(filePath);
		if (existingFile) {
			await vault.delete(existingFile);
		}

		await vault.createBinary(filePath, buffer);

		return filePath;
	} catch (error) {
		console.error('[Link Embed] Error downloading image:', error);
		return url; // Return original URL on error
	}
}

// Utility function to convert image file to base64
export async function imageFileToBase64(
	vault: any,
	filePath: string,
): Promise<string> {
	try {
		const file = vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			// Read the file as ArrayBuffer
			const buffer = await vault.readBinary(file);

			// Convert to base64
			const base64 = arrayBufferToBase64(buffer);

			// Get the MIME type based on file extension
			const mimeType = getMimeType(file.extension);

			// Create a data URL
			return `data:${mimeType};base64,${base64}`;
		}
	} catch (error) {
		console.error(
			'[Link Embed] Failed to convert local image to base64:',
			error,
		);
	}

	return ''; // Return empty string on error
}

// Convert ArrayBuffer to base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	let binary = '';
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return window.btoa(binary);
}

// Get MIME type from file extension
function getMimeType(extension: string): string {
	const mimeTypes: Record<string, string> = {
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		svg: 'image/svg+xml',
		// Add more as needed
	};
	return mimeTypes[extension.toLowerCase()] || 'image/jpeg';
}

export abstract class Parser {
	api: string;
	debug: boolean;
	location: string = 'unknown'; // Location for error reporting (file:line)
	method: string = 'GET'; // Default method is GET
	headers: Record<string, string> = {}; // Default headers
	body: string = ''; // Default body for POST requests
	vault: any = null; // Reference to the vault
	saveImagesToVault: boolean = false; // Whether to save images to vault
	imageFolderPath: string = ''; // Path to save images

	async parseUrl(url: string): Promise<any> {
		const parseUrl = Mustache.render(this.api, { url });
		// Store the current parser type to help with error reporting
		const parserType = this.constructor.name;
		new Notice(`Fetching ${url} with ${parserType}`);

		try {
			const requestOptions: any = {
				url: parseUrl,
				method: this.method,
				headers: this.headers,
			};

			// Add body for POST requests
			if (this.method === 'POST' && this.body) {
				requestOptions.body = this.body.replace('{{{url}}}', url);
			}

			const response = await requestUrl(requestOptions);
			return response.json;
		} catch (error) {
			console.error('[Link Embed] Error fetching URL:', error);
			// Add parser information and location to the error for better error reporting
			if (error instanceof Error) {
				error.message = `[${parserType} at ${this.location}] ${error.message}`;
			}
			throw error;
		}
	}

	/**
	 * Common method to handle image processing and aspect ratio calculation
	 * @param processedData The data with basic title, image, and description
	 * @param url The URL being processed
	 * @returns ParsedLinkData with image path and aspect ratio
	 */
	async handleImageProcessing(
		processedData: { title: string; image: string; description: string },
		url: string,
	): Promise<ParsedLinkData> {
		// 1. Create the result object with URL
		const result: ParsedLinkData = { ...processedData, url };
		const parserType = this.constructor.name;

		// 2. Handle image storage to vault if needed
		if (this.saveImagesToVault && processedData.image && this.vault) {
			try {
				// Save image to vault
				const localPath = await downloadImageToVault(
					processedData.image,
					this.vault,
					this.imageFolderPath,
				);

				// Replace the image URL with local path
				result.image = localPath;
			} catch (error) {
				console.error(
					'[Link Embed] Failed to save image to vault:',
					error,
				);
				// Keep original URL on failure
			}
		}

		// 3. Calculate aspect ratio if image is available
		if (result.image && result.image.length > 0) {
			try {
				// Get the plugin instance from the main file (if available)
				const plugin = (window as any).app?.plugins?.plugins[
					'obsidian-link-embed'
				];
				const cache = plugin?.imageDimensionsCache;

				const dimensions = await getImageDimensions(
					result.image,
					cache,
				);
				if (dimensions) {
					result.aspectRatio = dimensions.aspectRatio;
					if (this.debug) {
						console.log(
							'[Link Embed] Image dimensions:',
							dimensions,
						);
					}
				}
			} catch (error) {
				console.error(
					`[Link Embed] Error calculating image aspect ratio in ${parserType} at ${this.location}]:`,
					error,
				);
			}
		}

		return result;
	}

	async parse(url: string): Promise<ParsedLinkData> {
		const rawData = await this.parseUrl(url);
		if (this.debug) {
			console.log('[Link Embed] Raw data:', rawData);
		}

		// 1. First, process the raw data to extract basic information
		const processedData = this.process(rawData);

		// 2. Handle image processing and aspect ratio with the common method
		return await this.handleImageProcessing(processedData, url);
	}

	abstract process(data: any): {
		title: string;
		image: string;
		description: string;
	};
}

class LinkPreviewParser extends Parser {
	constructor(apiKey: string = '') {
		super();
		// Use GET method as specified in the example
		this.api = 'https://api.linkpreview.net/?q={{{url}}}';
		this.method = 'GET';
		this.headers = {
			'X-Linkpreview-Api-Key': apiKey,
		};
	}

	process(data: any): { title: string; image: string; description: string } {
		const title = data.title || '';
		const image = data.image || '';
		let description: string = data.description || '';
		description = description.replace(/\n/g, ' ').replace(/\\/g, '\\\\');
		return { title, image, description };
	}
}

class JSONLinkParser extends Parser {
	constructor(apiKey: string = '') {
		super();
		this.api = `https://jsonlink.io/api/extract?url={{{url}}}&api_key=${apiKey}`;
	}
	process(data: any): { title: string; image: string; description: string } {
		const title = data.title || '';
		const image = data.images[0] || '';
		let description: string = data.description || '';
		description = description.replace(/\n/g, ' ').replace(/\\/g, '\\\\');
		return { title, image, description };
	}
}

class MicroLinkParser extends Parser {
	constructor() {
		super();
		this.api =
			'https://api.microlink.io?url={{{url}}}&palette=true&audio=true&video=true&iframe=true';
	}
	process(data: any): { title: string; image: string; description: string } {
		const title = data.data.title || '';
		const image = data.data.image?.url || data.data.logo?.url || '';
		let description: string = data.data.description || '';
		description = description.replace(/\n/g, ' ').replace(/\\/g, '\\\\');
		return { title, image, description };
	}
}

class IframelyParser extends Parser {
	constructor() {
		super();
		this.api = 'http://iframely.server.crestify.com/iframely?url={{{url}}}';
	}
	process(data: any): { title: string; image: string; description: string } {
		const title = data.meta?.title || '';
		const image = data.links[0]?.href || '';
		let description: string = data.meta?.description || '';
		description = description.replace(/\n/g, ' ').replace(/\\/g, '\\\\');
		return { title, image, description };
	}
}

class LocalParser extends Parser {
	process(data: any): { title: string; image: string; description: string } {
		let title = data.title || '';
		const image = data.image || '';
		let description: string = data.description || '';

		description = description.replace(/\n/g, ' ').replace(/\\/g, '\\\\');
		title = title.replace(/\n/g, ' ').replace(/\\/g, '\\\\');

		return { title, image, description };
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

		const og = doc.querySelector<HTMLMetaElement>(
			'head meta[property="og:image"]',
		);
		if (og?.content) {
			try {
				return new URL(og.content, base).href;
			} catch {
				return og.content;
			}
		}

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
			for (const img of imgs) {
				if (!this.meetsCriteria(img)) continue;
				const src = img.getAttribute('src');
				if (src) {
					try {
						return new URL(src, base).href;
					} catch {
						return src;
					}
				}
			}
		}

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

	async getHtmlByRequest(url: string): Promise<string> {
		const html = await requestUrl({ url: url }).then((site) => {
			return site.text;
		});
		return html;
	}

	async getHtmlByElectron(url: string): Promise<string> {
		let window: any = null;
		try {
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
				window.webContents.on('did-finish-load', (e: any) =>
					resolve(e),
				);
				window.webContents.on('did-fail-load', (e: any) => reject(e));
				window.loadURL(url);
			});

			let doc = await window.webContents.executeJavaScript(
				'document.documentElement.outerHTML;',
			);
			window.close();
			return doc;
		} catch (ex) {
			if (this.debug) {
				console.log('[Link Embed] Failed to use electron: ', ex);
			}
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
		if (this.debug) {
			console.log('[Link Embed] Doc:', doc);
		}
		let title = this.getTitle(doc, uRL);
		let image = this.getImage(doc, uRL);
		let description = this.getDescription(doc);

		// 1. First, process the raw data to extract basic information
		let processedData = this.process({ title, image, description });

		// 2. Use the common method to handle image processing and aspect ratio
		return await this.handleImageProcessing(processedData, url);
	}
}

// Parser factory function to create parser instances on demand
export function createParser(
	parserType: string,
	settings: any,
	vault: any = null,
): Parser {
	let parser: Parser;

	switch (parserType) {
		case 'jsonlink':
			const jsonlinkApiKey = settings.jsonlinkApiKey;
			if (!jsonlinkApiKey) {
				console.log('[Link Embed] JSONLink API key is not set');
				new Notice(
					'JSONLink API key is not set. Please provide an API key in the settings.',
				);
				throw new Error('JSONLink API key is not set');
			}
			parser = new JSONLinkParser(jsonlinkApiKey);
			break;
		case 'microlink':
			parser = new MicroLinkParser();
			break;
		case 'iframely':
			parser = new IframelyParser();
			break;
		case 'local':
			parser = new LocalParser();
			break;
		case 'linkpreview':
			const apiKey = settings.linkpreviewApiKey;
			if (!apiKey) {
				console.log('[Link Embed] LinkPreview API key is not set');
				new Notice(
					'LinkPreview API key is not set. Please provide an API key in the settings.',
				);
				throw new Error('LinkPreview API key is not set');
			}
			parser = new LinkPreviewParser(apiKey);
			break;
		default:
			throw new Error(`Unknown parser type: ${parserType}`);
	}

	// Setup image saving options
	parser.vault = vault;
	parser.saveImagesToVault = settings.saveImagesToVault || false;
	parser.imageFolderPath = settings.imageFolderPath || 'link-embed-images';

	return parser;
}

export const parseOptions: Record<string, string> = {
	jsonlink: 'JSONLink',
	microlink: 'MicroLink',
	iframely: 'Iframely',
	local: 'Local',
	linkpreview: 'LinkPreview',
};
