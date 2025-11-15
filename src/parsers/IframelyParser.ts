import { Parser } from './parser';

export class IframelyParser extends Parser {
    constructor(apiKey: string = '') {
        super();
        // Use encodeURIComponent in parseUrl method since {{{url}}} will be replaced by Mustache
        this.api = `https://iframe.ly/api/iframely?url={{{url}}}&api_key=${apiKey}`;
    }

    process(data: any): { title: string; image: string; description: string } {
        const title = data.meta?.title || '';
        // Find the first thumbnail with maxresdefault or highest resolution
        const thumbnails = data.links?.thumbnail || [];
        const image =
            thumbnails.reduce((best: string, thumb: any) => {
                // If we already found maxresdefault, keep it
                if (best.includes('maxresdefault')) return best;
                // If this is maxresdefault or we don't have an image yet, use it
                if (thumb.href.includes('maxresdefault') || !best)
                    return thumb.href;
                // Otherwise keep existing image
                return best;
            }, '') || '';

        let description: string = data.meta?.description || '';
        description = description.replace(/\n/g, ' ').replace(/\\/g, '\\\\');
        return { title, image, description };
    }
}
