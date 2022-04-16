## Obsidian Link Embed

This plugin allow you to convert URLs in your notes into embeded previews.

This plugin is inspired by [Obsidian Rich Link](https://github.com/dhamaniasad/obsidian-rich-links), and provide more features than the original plugin.

### Usage

-   Select the link you want to convert in the note
-   Open the Command Palette
-   Select **Create link embed (in place)** or **Create link embed (new line)**

### Settings

You can change the default parser in the plugin settings.

Here is the table comparing the supported parsers.

| Parser                                      | Speed  | Stable | Desc Length | Limitation |
| ------------------------------------------- | ------ | ------ | ----------- | ---------- |
| [JSONLink](https://jsonlink.io/)            | \*\*   | \*     | \*\*\*      | Unlimited  |
| [MicroLink(Default)](https://microlink.io/) | \*\*\* | \*\*\* | \*\*        | 50/day     |
| [Iframely](https://iframely.com/)           | \*\*   | \*\*   | \*          | 1000/month |

Example of different parsers results:

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
