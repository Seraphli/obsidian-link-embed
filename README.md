# Obsidian Link Embed

This plugin allows you to convert URLs in your notes into embedded previews.

This is how it looks.

![demo](https://raw.githubusercontent.com/Seraphli/obsidian-link-embed/main/docs/demo.gif)

**Note** Starting from 2.0.0, embeds are rendered with `MarkdownCodeBlockProcessor`, which avoids expanding the HTML block. You can convert your old embeds to new code blocks with the `Convert` button in the setting.

PS: If you happen to know any other website that provides free API for users to grab metadata from URLs, please let me know. This plugin can be more robust with your help.

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

`In Place` means the selection in the editor will be removed.

The embedded preview will always be inserted into the next line.

#### Advanced Settings

- **Save Images to Vault**: When enabled, images from embedded links will be downloaded and saved to your vault.
- **Image Folder Path**: Specify the folder where images will be saved (default: "link-embed-images").
- **Respect Aspect Ratio**: Preserves the original aspect ratio of embedded images for better visual layout.
- **Metadata**: A new feature that allows you to include custom information with your embeds. This can be used to add notes, tags, or any additional data you want to associate with the embedded link. The metadata will be preserved in the embed code block.

## Supported Parsers

The plugin supports the following parsers:

- Local - No API needed, parses HTML directly
- [JSONLink](https://jsonlink.io/) - Requires API key
- [MicroLink](https://microlink.io/) (Default) - Limited to 50 requests per day
- [Iframely](https://iframely.com/) - Limited to 1000 requests per month
- [LinkPreview](https://www.linkpreview.net/) - Requires API key

## Embed Format

Starting from version 2.0.0, embeds are stored in code blocks:

```embed
title: "Example Title"
image: "https://example.com/image.jpg"
description: "This is an example description"
url: "https://example.com"
aspectRatio: "1.5"
metadata: "Additional custom metadata can be included here"
```

The `aspectRatio` parameter is optional and helps maintain the proper image dimensions.

The `metadata` field is also optional and can be used to include any additional information you want to associate with the link.

## See Also

[obsidian-aggregator](https://github.com/Seraphli/obsidian-aggregator)

## Thanks

- [Obsidian Rich Link](https://github.com/dhamaniasad/obsidian-rich-links)
- [Obsidian Auto Link Title](https://github.com/zolrath/obsidian-auto-link-title)
