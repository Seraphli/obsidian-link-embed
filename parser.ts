import { Notice } from 'obsidian';
import Mustache from 'mustache';

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
		const description = data.description || '';
		return { title, image, description };
	}
}

class MicroLinkParser extends Parser {
	constructor() {
		super();
		this.api = 'https://api.microlink.io?url={{{url}}}';
	}
	process(data: any): { title: string; image: string; description: string } {
		const title = data.data.title || '';
		const image = data.data.image?.url || data.data.logo?.url || '';
		const description = data.data.description || '';
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
		const description = data.meta?.description || '';
		return { title, image, description };
	}
}

export const parseOptions = {
	jsonlink: 'JSONLink',
	microlink: 'MicroLink',
	iframely: 'Iframely',
};

export const parsers: { [key: string]: Parser } = {
	jsonlink: new JSONLinkParser(),
	microlink: new MicroLinkParser(),
	iframely: new IframelyParser(),
};
