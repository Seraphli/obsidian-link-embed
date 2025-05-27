import { Notice, requestUrl } from 'obsidian';
import Mustache from 'mustache';
import { getImageDimensions, downloadImageToVault } from './utils/imageUtils';

// Define interface for parsed link data
export interface ParsedLinkData {
	title: string;
	image: string;
	description: string;
	url: string;
	aspectRatio?: number;
	favicon?: string;
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

	/**
	 * Utility method for debug logging that only logs if debug is enabled
	 * @param args Arguments to pass to console.log
	 */
	debugLog(...args: any[]): void {
		if (this.debug) {
			console.log(...args);
		}
	}

	/**
	 * Utility method for debug error logging that only logs if debug is enabled
	 * @param args Arguments to pass to console.error
	 */
	debugError(...args: any[]): void {
		if (this.debug) {
			console.error(...args);
		}
	}

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
	 * @param processedData The data with basic title, image, description, and optional favicon
	 * @param url The URL being processed
	 * @returns ParsedLinkData with image path, aspect ratio, and favicon
	 */
	async handleImageProcessing(
		processedData: {
			title: string;
			image: string;
			description: string;
			favicon?: string;
		},
		url: string,
	): Promise<ParsedLinkData> {
		// 1. Create the result object with URL
		const result: ParsedLinkData = { ...processedData, url };
		const parserType = this.constructor.name;

		// If we don't have a favicon but we're a non-LocalParser, try to get one using a favicon fetcher
		// This is handled differently to avoid circular dependencies between Parser and LocalParser
		if (!result.favicon && this.constructor.name !== 'LocalParser') {
			try {
				// Use a function to get favicon that will be provided externally
				// This will be handled by specific parsers that know how to fetch favicons
				const plugin = (window as any).app?.plugins?.plugins[
					'obsidian-link-embed'
				];
				if (plugin && plugin.fetchFavicon) {
					const favicon = await plugin.fetchFavicon(url);
					if (favicon) {
						result.favicon = favicon;
						this.debugLog(
							`[Link Embed] Added favicon: ${result.favicon}`,
						);
					}
				}
			} catch (error) {
				console.error('[Link Embed] Error getting favicon:', error);
			}
		}

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
				// Get cache and useCache setting
				const cache = plugin?.settings?.useCache ? plugin?.cache : null;

				const dimensions = await getImageDimensions(
					result.image,
					cache,
				);
				if (dimensions) {
					result.aspectRatio = dimensions.aspectRatio;
					this.debugLog('[Link Embed] Image dimensions:', dimensions);
				}
			} catch (error) {
				console.error(
					`[Link Embed] Error calculating image aspect ratio in ${parserType} at ${this.location}:`,
					error,
				);
			}
		}

		return result;
	}

	async parse(url: string): Promise<ParsedLinkData> {
		const rawData = await this.parseUrl(url);
		this.debugLog('[Link Embed] Raw data:', rawData);

		// 1. First, process the raw data to extract basic information
		const processedData = this.process(rawData);

		// 2. Handle image processing and aspect ratio with the common method
		return await this.handleImageProcessing(processedData, url);
	}

	abstract process(data: any): {
		title: string;
		image: string;
		description: string;
		favicon?: string;
	};
}
