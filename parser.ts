import { Notice, TFile, normalizePath } from 'obsidian';
import Mustache from 'mustache';
import { requestUrl } from 'obsidian';
import * as path from 'path';
import * as crypto from 'crypto';
const electronPkg = require('electron');

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
		console.error('Error downloading image:', error);
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
		console.error('Failed to convert local image to base64:', error);
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
	method: string = 'GET'; // Default method is GET
	headers: Record<string, string> = {}; // Default headers
	body: string = ''; // Default body for POST requests
	vault: any = null; // Reference to the vault
	saveImagesToVault: boolean = false; // Whether to save images to vault
	imageFolderPath: string = ''; // Path to save images

	async parseUrl(url: string): Promise<any> {
		const parseUrl = Mustache.render(this.api, { url });
		new Notice(`Fetching ${url}`);

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
			console.error('Error fetching URL:', error);
			throw error;
		}
	}

	async parse(url: string): Promise<{
		title: string;
		image: string;
		description: string;
		url: string;
	}> {
		const rawData = await this.parseUrl(url);
		if (this.debug) {
			console.log('Link Embed: raw data', rawData);
		}

		// Use processWithImageHandling if saving images to vault is enabled
		if (this.saveImagesToVault) {
			const processedData = await this.processWithImageHandling(rawData);
			return { ...processedData, url };
		} else {
			return { ...this.process(rawData), url };
		}
	}

	abstract process(data: any): {
		title: string;
		image: string;
		description: string;
	};

	// Process with image handling capability
	async processWithImageHandling(data: any): Promise<{
		title: string;
		image: string;
		description: string;
	}> {
		// Get basic processed data
		const result = this.process(data);

		// If saveImagesToVault is enabled and image exists and vault is available
		if (this.saveImagesToVault && result.image && this.vault) {
			try {
				// Save image to vault
				const localPath = await downloadImageToVault(
					result.image,
					this.vault,
					this.imageFolderPath,
				);

				// Replace the image URL with local path
				result.image = localPath;
			} catch (error) {
				console.error('Failed to save image to vault:', error);
				// Keep original URL on failure
			}
		}

		return result;
	}
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
	constructor() {
		super();
		this.api = 'https://jsonlink.io/api/extract?url={{{url}}}';
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
		let element = doc.querySelector('head meta[property="og:image"]');
		if (element instanceof HTMLMetaElement) {
			// Handle relative URLs by resolving against the base URL
			try {
				return new URL(element.content, url.origin).href;
			} catch (e) {
				// If URL construction fails, return the original content
				return element.content;
			}
		}

		let selectors = [
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

		for (const selector of selectors) {
			let images = doc.querySelectorAll(selector);

			for (let index = 0; index < images.length; index++) {
				const element = images[index];
				if (!this.meetsCriteria(element)) {
					continue;
				}
				let attribute = element.getAttribute('src');
				// Get image from document and return the full URL
				if (attribute) {
					return (element as HTMLImageElement).src;
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
				console.log('Failed to use electron: ', ex);
			}
			if (window) {
				window.close();
			}
			return null;
		}
	}

	async parse(url: string): Promise<{
		title: string;
		image: string;
		description: string;
		url: string;
	}> {
		let html =
			(await this.getHtmlByElectron(url)) ||
			(await this.getHtmlByRequest(url));

		let parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		// get base url from document
		let uRL = new URL(url);
		if (this.debug) {
			console.log('Link Embed: doc', doc);
		}
		let title = this.getTitle(doc, uRL);
		let image = this.getImage(doc, uRL);
		let description = this.getDescription(doc);

		// Use processWithImageHandling if saving images to vault is enabled
		if (this.saveImagesToVault) {
			const processedData = await this.processWithImageHandling({
				title,
				image,
				description,
			});
			return { ...processedData, url };
		} else {
			return { ...this.process({ title, image, description }), url };
		}
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
			parser = new JSONLinkParser();
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
				console.log('Link Embed: LinkPreview API key is not set');
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
