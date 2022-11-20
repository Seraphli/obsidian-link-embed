# Obsidian Link Embed

This plugin allows you to convert URLs in your notes into embedded previews.

This is how it looks.

![demo](https://raw.githubusercontent.com/Seraphli/obsidian-link-embed/main/docs/demo.gif)

PS: If you happen to know any other website that provides free API for users to grab meta data from URLs, please let me know. This plugin can be more robust with your help.

## Usage

The easiest way to use is by pasting your link and then creating an embed preview.

Additionally, there are three ways to pass the URL to this plugin.

1. Selecting the URL you want to parse

If nothing is selected

2. Put your cursor within the URL text that you want to parse

Or

3. Copy the URL into the clipboard

Then

- Open the command Palette
- Select the command `Link Embed: Embed link`

In case some parsers are not working, you can also use the `Link Embed: Embed link with ...` to specify one parser.

### Settings

If you enable `Auto Embed` in the setting, the plugin will automatically replace the link with an embed preview when you paste the link into an empty line. Although this option is quite convenient, I set the default setting to false in case someone doesn't know what happened.

You can change the default parser in the plugin settings.

And `In Place` means the selection in the editor will be removed.

The embedded preview will always be inserted into the next line.

Here is the table comparing the supported parsers.

| Parser                                      | Speed  | Stable | Desc Length | Limitation |
| ------------------------------------------- | ------ | ------ | ----------- | ---------- |
| [JSONLink](https://jsonlink.io/)            | \*\*   | \*     | \*\*\*      | Unlimited  |
| [MicroLink(Default)](https://microlink.io/) | \*\*\* | \*\*\* | \*\*        | 50/day     |
| [Iframely](https://iframely.com/)           | \*\*   | \*\*   | \*          | 1000/month |

## Thanks

- [Obsidian Rich Link](https://github.com/dhamaniasad/obsidian-rich-links)
- [Obsidian Auto Link Title](https://github.com/zolrath/obsidian-auto-link-title)

## Example results from different parsers

**Example 1**

https://arxiv.org/abs/2202.08434

JSONLink

```json
{
	"title": "[2202.08434] A Survey of Explainable Reinforcement Learning",
	"image": "https://static.arxiv.org/icons/twitter/arxiv-logo-twitter-square.png",
	"description": "Explainable reinforcement learning (XRL) is an emerging subfield of\nexplainable machine learning that has attracted considerable attention in\nrecent years. The goal of XRL is to elucidate the decision-making process of\nlearning agents in sequential decision-making settings. In this survey, we\npropose a novel taxonomy for organizing the XRL literature that prioritizes the\nRL setting. We overview techniques according to this taxonomy. We point out\ngaps in the literature, which we use to motivate and outline a roadmap for\nfuture work.",
	"url": "https://arxiv.org/abs/2202.08434"
}
```

MicroLink

```json
{
	"title": "A Survey of Explainable Reinforcement Learning",
	"image": "https://static.arxiv.org/icons/twitter/arxiv-logo-twitter-square.png",
	"description": "Explainable reinforcement learning (XRL) is an emerging subfield of\nexplainable machine learning that has attracted considerable attention in\nrecent years. The goal of XRL is to elucidate the decision-making process of\nlearning agents in sequential decision-making settings. In this survey, we\npropos…",
	"url": "https://arxiv.org/abs/2202.08434"
}
```

Iframely

```json
{
	"title": "A Survey of Explainable Reinforcement Learning",
	"image": "https://static.arxiv.org/icons/twitter/arxiv-logo-twitter-square.png",
	"description": "Explainable reinforcement learning (XRL) is an emerging subfield of explainable machine learning that has attracted considerable attention in recent years. The goal of XRL is to elucidate the...",
	"url": "https://arxiv.org/abs/2202.08434"
}
```

**Example 2**

https://www.redblobgames.com/articles/visibility/

JSONLink

```json
{
	"title": "2d Visibility",
	"image": "https://www.redblobgames.com/articles/visibility/static-lightmap.png?2012-05-21-15-55-03",
	"description": "In a 2D top-down map it is sometimes useful to calculate which areas are visible from a given point. For example you might want to hide what’s not visible from the player’s location, or you might want to know what areas would be lit by a torch.",
	"url": "https://www.redblobgames.com/articles/visibility/"
}
```

MicroLink

```json
{
	"title": "2d Visibility",
	"image": "https://www.redblobgames.com/favicon.ico",
	"description": "In a 2D top-down map it is sometimes useful to calculate which areas are visible from a given point. For example you might want to hide what’s not visible from the player’s location, or you might want to know what areas would be lit by a torch.",
	"url": "https://www.redblobgames.com/articles/visibility/"
}
```

Iframely

```json
{
	"title": "2d Visibility",
	"image": "https://www.redblobgames.com/favicon.ico",
	"description": "",
	"url": "https://www.redblobgames.com/articles/visibility/"
}
```
