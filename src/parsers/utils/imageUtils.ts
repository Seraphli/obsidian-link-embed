import { Notice, TFile, normalizePath, requestUrl } from 'obsidian';
import * as path from 'path';
import * as crypto from 'crypto';

// Define image dimensions type
export type ImageDimensions = {
	width: number;
	height: number;
	aspectRatio: number;
};

// Default image dimensions to use after max retry attempts
const DEFAULT_IMAGE_DIMENSIONS: ImageDimensions = {
	width: 160,
	height: 160,
	aspectRatio: 100, // Square aspect ratio (1:1)
};

// Maximum number of attempts before using default dimensions
const MAX_LOAD_ATTEMPTS = 5;

/**
 * Utility function to get image dimensions and calculate aspect ratio
 * Works with both regular URLs and base64 data URLs
 * Uses a cache to avoid fetching the same image dimensions multiple times
 * If an image fails to load 5 times, returns default square dimensions
 *
 * @param imageUrl - URL or data URL of the image
 * @param cache - Map to store cached image dimensions
 * @param imageLoadAttempts - Map to track image loading attempts
 * @returns Promise with width, height, and aspectRatio or null on error
 */
export async function getImageDimensions(
	imageUrl: string,
	cache?: Map<string, any> | null,
	imageLoadAttempts?: Map<string, number> | null,
): Promise<ImageDimensions | null> {
	try {
		// Check if dimensions are already in cache using the URL directly as the key
		if (cache && cache.has(imageUrl)) {
			console.log(
				'[Link Embed] Using cached image dimensions for:',
				imageUrl.substring(0, 50) + (imageUrl.length > 50 ? '...' : ''),
			);
			return cache.get(imageUrl);
		}

		// Check if we've already tried this image multiple times
		const attempts =
			imageLoadAttempts && imageLoadAttempts.has(imageUrl)
				? imageLoadAttempts.get(imageUrl)
				: 0;

		if (attempts >= MAX_LOAD_ATTEMPTS) {
			console.log(
				`[Link Embed] Image load failed ${attempts} times, using default dimensions: ${imageUrl.substring(
					0,
					50,
				)}${imageUrl.length > 50 ? '...' : ''}`,
			);

			// Store default dimensions in cache if available
			if (cache) {
				cache.set(imageUrl, DEFAULT_IMAGE_DIMENSIONS);
				console.log(
					'[Link Embed] Cached default dimensions for problematic image',
				);
			}

			return DEFAULT_IMAGE_DIMENSIONS;
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

				// Store in cache for future use if available and enabled
				if (cache) {
					cache.set(imageUrl, dimensions);
					console.log(
						'[Link Embed] Cached image dimensions for:',
						imageUrl.substring(0, 50) +
							(imageUrl.length > 50 ? '...' : ''),
					);
				}

				// Reset failure counter on success
				if (attempts > 0 && imageLoadAttempts) {
					imageLoadAttempts.delete(imageUrl);
				}

				resolve(dimensions);
			};
			img.onerror = () => {
				// Increment load attempts counter
				const newAttempts = attempts + 1;
				if (imageLoadAttempts) {
					imageLoadAttempts.set(imageUrl, newAttempts);
				}

				console.log(
					`[Link Embed] Failed to load image (attempt ${newAttempts}/${MAX_LOAD_ATTEMPTS}): ${imageUrl.substring(
						0,
						150,
					)}${imageUrl.length > 150 ? '...' : ''}`,
				);

				// If we've reached the limit, use default dimensions
				if (newAttempts >= MAX_LOAD_ATTEMPTS) {
					console.log(
						'[Link Embed] Max attempts reached, using default dimensions',
					);

					// Store default dimensions in cache if available
					if (cache) {
						cache.set(imageUrl, DEFAULT_IMAGE_DIMENSIONS);
						console.log(
							'[Link Embed] Cached default dimensions for problematic image',
						);
					}

					resolve(DEFAULT_IMAGE_DIMENSIONS);
				} else {
					// Otherwise reject as usual
					reject(
						new Error(
							`Failed to load image: ${imageUrl.substring(
								0,
								150,
							)}${imageUrl.length > 150 ? '...' : ''}`,
						),
					);
				}
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
