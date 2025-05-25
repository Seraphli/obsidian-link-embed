import { Parser } from './parser';

export class LinkPreviewParser extends Parser {
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
