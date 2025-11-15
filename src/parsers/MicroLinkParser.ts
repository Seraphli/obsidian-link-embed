import { Parser } from './parser';

export class MicroLinkParser extends Parser {
    constructor() {
        super();
        this.api =
            'https://api.microlink.io?url={{{url}}}&palette=true&audio=true&video=true&iframe=true';
    }

    process(data: any): { title: string; image: string; description: string } {
        const title = data.data.title || '';
        const image = data.data.image?.url || data.data.logo?.url || '';
        let description: string = data.data.description || '';
        description = description.replace(/\n/g, ' ').replace(/\\/g, '\\\\');
        return { title, image, description };
    }
}
