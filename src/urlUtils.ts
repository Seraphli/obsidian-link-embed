import { Notice } from 'obsidian';
import { REGEX } from './constants';
import { Selected } from './exEditor';

/**
 * Check if the given text is a valid URL.
 * @param text The text to check.
 * @returns Whether the text is a valid URL.
 */
export function isUrl(text: string): boolean {
	const urlRegex = new RegExp(REGEX.URL, 'g');
	return urlRegex.test(text);
}

/**
 * Check if the selected text contains a valid URL.
 * @param selected The selected text and boundary.
 * @returns Whether the selection contains a valid URL.
 */
export function checkUrlValid(selected: Selected): boolean {
	if (!(selected.text.length > 0 && isUrl(selected.text))) {
		new Notice('Need a link to convert to embed.');
		return false;
	}
	return true;
}
