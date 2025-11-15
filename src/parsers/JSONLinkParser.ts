import { Parser } from './parser';

export class JSONLinkParser extends Parser {
    constructor(apiKey: string = '') {
        super();
        this.api = `https://jsonlink.io/api/extract?url={{{url}}}&api_key=${apiKey}`;
    }

    process(data: any): { title: string; image: string; description: string } {
        const title = data.title || '';
        const image = data.images[0] || '';
        let description: string = data.description || '';
        description = description.replace(/\n/g, ' ').replace(/\\/g, '\\\\');
        return { title, image, description };
    }
}
