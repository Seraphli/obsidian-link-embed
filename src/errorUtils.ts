import { Notice } from 'obsidian';

/**
 * Display an error notice to the user and optionally log to console.
 * @param error The error to display.
 * @param debug Whether to log the error to console.
 */
export function errorNotice(error?: Error, debug: boolean = false): void {
	if (debug) {
		console.log('[Link Embed] Failed to fetch data:', error);
	}
	const errorMessage = error?.message || 'Failed to fetch data';
	new Notice(`Error: ${errorMessage}`);
}
