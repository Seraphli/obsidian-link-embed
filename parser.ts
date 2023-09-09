import { Notice } from 'obsidian';
import Mustache from 'mustache';
import { requestUrl } from 'obsidian';
const electronPkg = require('electron');

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
        let title = data.title || '';
        const image = data.image || '';
        let description: string = data.description || '';

        description = description.replace(/\n/g, ' ');
        title = title.replace(/\n/g, ' ');

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
		if(/display:\s*none/.test(element.getAttribute('style'))){
			return false;
		}

		//hide images in navigation bar/header
		let contains_header = false;
		element.classList.forEach((val) => {
			if(val.toLowerCase().contains('header')) {
				contains_header = true;
			}
		})
		if (element.id.toLowerCase().contains('header') || contains_header){
			return false;
		}

		//recurse until <html>
		if(element.parentElement != null){
			return this.meetsCriteria(element.parentElement);
		}

		return true;
	}

	getImage(doc: Document, url: URL): string {
		let element = doc.querySelector('head meta[property="og:image"]');
		if (element instanceof HTMLMetaElement) {
			return element.content;
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
		]

		for (const selector of selectors) {
			let images = doc.querySelectorAll(selector)

			for (let index = 0; index < images.length; index++) {
				const element = images[index];
				if(!this.meetsCriteria(element)){
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
		try {
			const { remote } = electronPkg;
			const { BrowserWindow } = remote;

            const window = new BrowserWindow({
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
				window.webContents.on("did-finish-load", (e: any) => resolve(e));
				window.webContents.on("did-fail-load", (e: any) => reject(e));
				window.loadURL(url);
			});

            let doc = await window.webContents.executeJavaScript("document.documentElement.outerHTML;")
            return doc

        } catch (ex) {
			if (this.debug) {
				console.log('Failed to use electron: ', ex);
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
		let html = await this.getHtmlByElectron(url) || await this.getHtmlByRequest(url);

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

		return { ...this.process({ title, image, description }), url };
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
