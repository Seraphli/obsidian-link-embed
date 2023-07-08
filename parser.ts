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
	process(data: any): { title: string; image: string; description: string; } {
		throw new Error('Method not implemented.');
	}
	constructor() {
		super();
	}
	
	getTitle(doc: Document): string {
		let element = doc.querySelector('head meta[property="og:title"]');
		console.log("Title1 ",element)
		if (element instanceof HTMLMetaElement) {
			return element.content;
		}
		element = doc.querySelector('head title')
		console.log("Title2 ",element)
		if (element){
			return element.textContent;
		}
		return null;
	}
	
	getImage(doc: Document): string {
		let element = doc.querySelector('head meta[property="og:image"]');
		if (element instanceof HTMLMetaElement) {
			return element.content;
		}
		return '';
	}

	getDescription(doc: Document): string {
		let element = doc.querySelector('head meta[property="og:description"]');
		if (element instanceof HTMLMetaElement) {
			return element.content;
		}
		element = doc.querySelector('head meta[name="description"]')
		if (element instanceof HTMLMetaElement) {
			return element.content;
		}
		return '';
	}

	async parse(url: string): Promise<{ title: string; image: string; description: string; url: string;}> {
		const html = await requestUrl({url: url}).then((site) => { return site.text} )
		console.log(html)
		let parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html')
		console.log(doc)

		let title = this.getTitle(doc)
		if(!title){
			title = (new URL(url).hostname)
		}

		let image = this.getImage(doc);
		let description = this.getDescription(doc);


		return { title, image, description, url };
	}
}

export const parseOptions = {
	jsonlink: 'JSONLink',
	microlink: 'MicroLink',
	iframely: 'Iframely',
	local: 'Local'
};

export const parsers: { [key: string]: Parser } = {
	jsonlink: new JSONLinkParser(),
	microlink: new MicroLinkParser(),
	iframely: new IframelyParser(),
	local: new LocalParser(),
};
