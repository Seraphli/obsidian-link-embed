import { Notice } from 'obsidian';
import Mustache from 'mustache';
import { requestUrl } from 'obsidian';

export abstract class Parser {
	api: string;
	debug: boolean;
	async parseUrl(url: string): Promise<any> {
		const parseUrl = Mustache.render(this.api, { url });
		new Notice(`Fetching ${url}`);
		const res = await ajaxPromise({
			url: parseUrl,
		});
		const data = JSON.parse(res);
		return data;
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
		return { ...this.process(rawData), url };
	}
	abstract process(data: any): {
		title: string;
		image: string;
		description: string;
	};
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
		description = description.replace(/\n/g, ' ');
		return { title, image, description };
	}
}

class MicroLinkParser extends Parser {
	constructor() {
		super();
		this.api = 'https://api.microlink.io?url={{{url}}}&palette=true&audio=true&video=true&iframe=true';
	}
	process(data: any): { title: string; image: string; description: string } {
		const title = data.data.title || '';
		const image = data.data.image?.url || data.data.logo?.url || '';
		let description: string = data.data.description || '';
		description = description.replace(/\n/g, ' ');
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
		description = description.replace(/\n/g, ' ');
		return { title, image, description };
	}
}

class LocalParser extends Parser {
	process(data: any): { title: string; image: string; description: string } {
		throw new Error('Method not implemented.');
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

	getImage(doc: Document, url: URL): string {
		let element = doc.querySelector('head meta[property="og:image"]');
		if (element instanceof HTMLMetaElement) {
			return element.content;
		}
		element = doc.querySelector('body img');
		if (element) {
			// Get image from document and return the full URL
			let attribute = element.getAttribute('src');
			if (attribute) {
				if (attribute.startsWith('/')) {
					attribute = new URL(attribute, url.origin).href;
				}
				return attribute;
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

	async parse(url: string): Promise<{
		title: string;
		image: string;
		description: string;
		url: string;
	}> {
		const html = await requestUrl({ url: url }).then((site) => {
			return site.text;
		});
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
		return { title, image, description, url };
	}
}

export const parseOptions = {
	jsonlink: 'JSONLink',
	microlink: 'MicroLink',
	iframely: 'Iframely',
	local: 'Local',
};

export const parsers: { [key: string]: Parser } = {
	jsonlink: new JSONLinkParser(),
	microlink: new MicroLinkParser(),
	iframely: new IframelyParser(),
	local: new LocalParser(),
};
