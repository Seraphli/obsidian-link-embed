import { Parser, ParsedLinkData } from './parser';
import { LinkPreviewParser } from './LinkPreviewParser';
import { JSONLinkParser } from './JSONLinkParser';
import { MicroLinkParser } from './MicroLinkParser';
import { IframelyParser } from './IframelyParser';
import { LocalParser } from './LocalParser';

// Export all image utility functions
export * from './utils/imageUtils';

// Export all parser classes and types
export { Parser };
export type { ParsedLinkData };
export {
	LinkPreviewParser,
	JSONLinkParser,
	MicroLinkParser,
	IframelyParser,
	LocalParser,
};

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
				throw new Error('JSONLink API key is not set');
			}
			parser = new JSONLinkParser(jsonlinkApiKey);
			break;
		case 'microlink':
			parser = new MicroLinkParser();
			break;
		case 'iframely':
			const iframelyApiKey = settings.iframelyApiKey;
			if (!iframelyApiKey) {
				console.log('[Link Embed] Iframely API key is not set');
				throw new Error('Iframely API key is not set');
			}
			parser = new IframelyParser(iframelyApiKey);
			break;
		case 'local':
			parser = new LocalParser();
			break;
		case 'linkpreview':
			const apiKey = settings.linkpreviewApiKey;
			if (!apiKey) {
				console.log('[Link Embed] LinkPreview API key is not set');
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
