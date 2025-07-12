# Obsidian Link Embed

This plugin allows you to convert URLs in your notes into embedded previews.

This is how it looks.

![demo](https://raw.githubusercontent.com/Seraphli/obsidian-link-embed/main/docs/demo.gif)

**Note** Starting from 2.0.0, embeds are rendered with `MarkdownCodeBlockProcessor`, which avoids expanding the HTML block. You can convert your old embeds to new code blocks with the `Convert` button in the setting.

PS: If you happen to know any other website that provides free API for users to grab metadata from URLs, please let me know. This plugin can be more robust with your help.

## Usage

The easiest way to use is by pasting your link and then creating an embed preview.

When pasting a URL, a popup suggestion menu will appear (if enabled) with options to:

-   Create Embed - Converts the URL into an embedded preview
-   Create Markdown Link - Converts the URL into a standard markdown link `[title](url)`
-   Dismiss - Closes the popup (can be removed in settings)

Additionally, there are three ways to pass the URL to this plugin.

1. Selecting the URL you want to parse

If nothing is selected

2. Put your cursor within the URL text that you want to parse

Or

3. Copy the URL into the clipboard

Then

-   Open the command Palette
-   Select the command `Link Embed: Embed link`

In case some parsers are not working, you can also use the `Link Embed: Embed link with ...` to specify one parser.

### Settings

If you enable `Auto Embed` in the setting, the plugin will automatically replace the link with an embed preview when you paste the link into an empty line. Although this option is quite convenient, I set the default setting to false in case someone doesn't know what happened.

You can change the default parser in the plugin settings. The plugin supports a primary and secondary parser configuration with fallback mechanism - if the primary parser fails, the plugin will try the secondary parser.

`In Place` means the selection in the editor will be removed and replaced with the embed.

By default, the embedded preview will be inserted into the next line, but this can be changed with the `In Place` option.

#### Advanced Settings

-   **Save Images to Vault**: When enabled, images from embedded links will be downloaded and saved to your vault.
-   **Image Folder Path**: Specify the folder where images will be saved (default: "link-embed-images").
-   **Respect Aspect Ratio**: Preserves the original aspect ratio of embedded images for better visual layout.
-   **Use Cache**: When enabled, the plugin will cache favicon images and aspect ratios to improve performance.
-   **Enable Favicon**: When enabled, website favicons will be displayed in link embeds.
-   **Max Concurrent Local Parsers**: Maximum number of simultaneous local parsing operations. Lower values reduce system load but might make link embeds appear more slowly.
-   **Metadata**: A feature that allows you to include custom information with your embeds. This can be used to add notes, tags, or any additional data you want to associate with the embedded link.
-   **Metadata Template**: Customize metadata with variables like `{{parser}}` for parser type, `{{date}}` for date. For custom date format use `{{#formatDate}}YYYY-MM-DD HH:mm:ss{{/formatDate}}`.

## Supported Parsers

The plugin supports the following parsers:

-   Local (Default) - No API needed, parses HTML directly
-   [JSONLink](https://jsonlink.io/) - Requires API key
-   [MicroLink](https://microlink.io/) - Limited to 50 requests per day
-   [Iframely](https://iframely.com/) - Limited to 1000 requests per month
-   [LinkPreview](https://www.linkpreview.net/) - Requires API key

## Embed Format

MDC format:

```
::embeded
---
title: "Example Title"
image: "https://example.com/image.jpg"
description: "This is an example description"
url: "https://example.com"
favicon: "https://example.com/favicon.ico"
aspectRatio: "1.5"
metadata: "Additional custom metadata can be included here"
parser: "local"
date: "2023-04-01"
custom_date: "2023-04-01 13:45:22"
---
::
```

The `aspectRatio` parameter is optional and helps maintain the proper image dimensions.

The `favicon` parameter is optional and displays the website's favicon icon.

The `metadata` field is also optional and can be used to include any additional information you want to associate with the link.

## Interface Features

-   **Refresh Button**: When hovering over an embedded link, a refresh button appears that allows you to update the link metadata and preview without recreating the embed. This is particularly useful when the content of the original link has been updated and you want to refresh the embedded preview to reflect these changes.
-   **Copy Button**: When hovering over an embedded link, a copy button appears that allows you to quickly copy the embed code for sharing or reusing elsewhere in your notes.
-   **Popup Menu**: When enabled, pasting a URL will show a popup menu with options to create an embed, create a markdown link, or dismiss.
-   **In-place Replacement**: Option to replace the selected URL with the embed instead of inserting on the next line.

## Performance Features

-   **Caching System**: Images and favicons are cached to improve performance and reduce API calls.
-   **Concurrency Limiter**: Controls how many local parsers can run simultaneously to prevent system overload.
-   **Lazy Loading**: Images are loaded asynchronously to improve rendering performance.

## Current Version

The current plugin version is 2.8.4. Check the [GitHub repository](https://github.com/Seraphli/obsidian-link-embed) for the latest updates and changes.

## See Also

[obsidian-aggregator](https://github.com/Seraphli/obsidian-aggregator)

## Thanks

-   [Obsidian Rich Link](https://github.com/dhamaniasad/obsidian-rich-links)
-   [Obsidian Auto Link Title](https://github.com/zolrath/obsidian-auto-link-title)
