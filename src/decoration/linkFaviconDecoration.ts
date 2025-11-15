import {
    EditorView,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
    Decoration,
    DecorationSet,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { StateEffect, StateField } from '@codemirror/state';
import { editorLivePreviewField, debounce, Debouncer } from 'obsidian';
import type ObsidianLinkEmbedPlugin from '../../main';
import { getFavicon } from '../embedUtils';

/**
 * Widget for displaying favicon
 */
class FaviconWidget extends WidgetType {
    constructor(private faviconUrl: string) {
        super();
    }

    eq(other: FaviconWidget): boolean {
        return other.faviconUrl === this.faviconUrl;
    }

    toDOM(): HTMLElement {
        const img = activeDocument.createElement('img');
        img.src = this.faviconUrl;
        img.className = 'link-favicon';
        img.alt = 'favicon';

        // Add inline styles to prevent other themes/plugins from overriding
        img.style.height = '0.8em';
        img.style.display = 'inline-block';

        return img;
    }

    ignoreEvent(): boolean {
        return true;
    }
}

/**
 * Token specification for link positions
 */
interface TokenSpec {
    from: number;
    to: number;
    value: string;
}

/**
 * Define stateful decoration
 */
function defineStatefulDecoration(): {
    update: ReturnType<typeof StateEffect.define<DecorationSet>>;
    field: StateField<DecorationSet>;
} {
    const update = StateEffect.define<DecorationSet>();
    const field = StateField.define<DecorationSet>({
        create(): DecorationSet {
            return Decoration.none;
        },
        update(deco, tr): DecorationSet {
            return tr.effects.reduce(
                (deco, effect) => (effect.is(update) ? effect.value : deco),
                deco.map(tr.changes),
            );
        },
        provide: (field) => EditorView.decorations.from(field as any),
    });
    return { update, field };
}

const faviconDecorations = defineStatefulDecoration();

/**
 * Decoration set manager
 */
class FaviconDecorationSet {
    editor: EditorView;
    plugin: ObsidianLinkEmbedPlugin;
    decoCache: { [url: string]: Decoration } = Object.create(null);
    debouncedUpdate: Debouncer<[tokens: TokenSpec[]], void>;

    constructor(editor: EditorView, plugin: ObsidianLinkEmbedPlugin) {
        this.editor = editor;
        this.plugin = plugin;
        this.debouncedUpdate = debounce(
            this.updateAsyncDecorations.bind(this),
            300,
            true,
        );
    }

    /**
     * Clear decoration cache - call this when settings change
     */
    clearCache(): void {
        this.decoCache = Object.create(null);
    }

    async computeAsyncDecorations(
        tokens: TokenSpec[],
    ): Promise<DecorationSet | null> {
        const decorations: Array<{
            from: number;
            to: number;
            deco: Decoration;
        }> = [];

        for (const token of tokens) {
            let deco = this.decoCache[token.value];

            if (!deco) {
                try {
                    const favicon = await getFavicon(
                        token.value,
                        this.plugin.settings,
                        this.plugin.cache,
                        this.plugin.settings.debug,
                    );

                    if (favicon) {
                        deco = this.decoCache[token.value] = Decoration.widget({
                            widget: new FaviconWidget(favicon),
                            side:
                                this.plugin.settings
                                    .markdownLinkFaviconPosition === 'before'
                                    ? -1
                                    : 1,
                        });
                    }
                } catch (error) {
                    if (this.plugin.settings.debug) {
                        console.error(
                            '[Link Embed] Error fetching favicon:',
                            error,
                        );
                    }
                }
            }

            if (deco) {
                decorations.push({ from: token.from, to: token.from, deco });
            }
        }

        if (decorations.length === 0) {
            return null;
        }

        return Decoration.set(
            decorations.map((d) => d.deco.range(d.from, d.to)),
            true,
        );
    }

    async updateAsyncDecorations(tokens: TokenSpec[]): Promise<void> {
        const decorations = await this.computeAsyncDecorations(tokens);

        if (
            decorations ||
            (
                this.editor.state.field(
                    faviconDecorations.field as any,
                ) as DecorationSet
            ).size
        ) {
            this.editor.dispatch({
                effects: (faviconDecorations.update as any).of(
                    decorations || Decoration.none,
                ),
            });
        }
    }
}

/**
 * Find matching opening bracket
 */
function findOpenParen(text: string, closePos: number): number {
    if (!text.includes('[')) return 0;
    let openPos = closePos;
    let counter = 1;
    while (counter > 0) {
        const c = text[--openPos];
        if (c === undefined) break;
        if (c === '[') {
            counter--;
        } else if (c === ']') {
            counter++;
        }
    }
    return openPos;
}

/**
 * Build view plugin
 */
function buildViewPlugin(plugin: ObsidianLinkEmbedPlugin) {
    return ViewPlugin.fromClass(
        class {
            decoManager: FaviconDecorationSet;
            view: EditorView;

            constructor(view: EditorView) {
                this.view = view;
                this.decoManager = new FaviconDecorationSet(view, plugin);
                activeViewPlugins.add(this);
                this.buildAsyncDecorations(view);
            }

            update(update: ViewUpdate) {
                this.view = update.view;
                const differentModes =
                    update.startState.field(editorLivePreviewField as any) !==
                    update.state.field(editorLivePreviewField as any);
                if (
                    update.docChanged ||
                    update.viewportChanged ||
                    differentModes
                ) {
                    this.buildAsyncDecorations(update.view);
                }
            }

            destroy() {
                activeViewPlugins.delete(this);
            }

            buildAsyncDecorations(view: EditorView) {
                const targetElements: TokenSpec[] = [];
                const settings = plugin.settings;

                // Check if feature is enabled
                if (!settings.enableMarkdownLinkFavicon) {
                    this.decoManager.debouncedUpdate(targetElements);
                    return;
                }

                // Check mode settings
                const isLivePreview = view.state.field(
                    editorLivePreviewField as any,
                );

                // In Live Preview mode
                if (
                    isLivePreview &&
                    !settings.enableMarkdownLinkFaviconInLivePreview
                ) {
                    this.decoManager.debouncedUpdate(targetElements);
                    return;
                }

                // In Source mode
                if (
                    !isLivePreview &&
                    !settings.enableMarkdownLinkFaviconInSource
                ) {
                    this.decoManager.debouncedUpdate(targetElements);
                    return;
                }

                for (const { from, to } of view.visibleRanges) {
                    const tree = syntaxTree(view.state);
                    tree.iterate({
                        from,
                        to,
                        enter: (node) => {
                            // Check node name instead of using tokenClassNodeProp
                            const nodeName = node.name;

                            // Look for URL nodes - check if it's a link
                            if (
                                nodeName === 'URL' ||
                                nodeName === 'link' ||
                                nodeName.includes('url')
                            ) {
                                let linkText = view.state.sliceDoc(
                                    node.from,
                                    node.to,
                                );

                                // Check if it contains ":" which indicates a URL
                                if (linkText.includes(':')) {
                                    linkText = linkText.replace(/[<>]/g, '');

                                    // Check if it's an HTTP(S) link
                                    if (
                                        !linkText.startsWith('http://') &&
                                        !linkText.startsWith('https://')
                                    ) {
                                        return;
                                    }

                                    const before = view.state.doc.sliceString(
                                        node.from - 1,
                                        node.from,
                                    );

                                    // Plain link (not in markdown link syntax)
                                    if (before !== '(') {
                                        if (
                                            !settings.showMarkdownLinkFaviconOnPlain
                                        )
                                            return;

                                        if (
                                            settings.markdownLinkFaviconPosition ===
                                            'before'
                                        ) {
                                            targetElements.push({
                                                from: node.from,
                                                to: node.to,
                                                value: linkText,
                                            });
                                        } else {
                                            targetElements.push({
                                                from: node.to,
                                                to: node.to + 1,
                                                value: linkText,
                                            });
                                        }
                                        return;
                                    }

                                    // Markdown link with alias
                                    if (
                                        !settings.showMarkdownLinkFaviconOnAliased
                                    )
                                        return;

                                    // Find the opening bracket of the alias
                                    const line = view.state.doc.lineAt(
                                        node.from,
                                    );
                                    const toLine = line.to - node.to;
                                    const toLineT = line.length - toLine;
                                    const lastIndex = line.text.lastIndexOf(
                                        ']',
                                        toLineT,
                                    );
                                    const open = findOpenParen(
                                        line.text,
                                        lastIndex,
                                    );
                                    if (open === -1) {
                                        return;
                                    }

                                    const fromTarget = line.from + open;
                                    const fullText = view.state.sliceDoc(
                                        fromTarget,
                                        node.to,
                                    );
                                    if (fullText.includes('|nofavicon')) return;

                                    if (
                                        settings.markdownLinkFaviconPosition ===
                                        'before'
                                    ) {
                                        targetElements.push({
                                            from: fromTarget,
                                            to: node.to,
                                            value: linkText,
                                        });
                                    } else {
                                        targetElements.push({
                                            from: node.to,
                                            to: node.to + 1,
                                            value: linkText,
                                        });
                                    }
                                }
                            }
                        },
                    });
                }
                this.decoManager.debouncedUpdate(targetElements);
            }
        },
    );
}

/**
 * Global registry of active view plugins
 */
const activeViewPlugins = new Set<{
    decoManager: FaviconDecorationSet;
    buildAsyncDecorations: (view: EditorView) => void;
    view: EditorView;
}>();

/**
 * Clear all decoration caches and trigger refresh
 */
export function refreshAllFaviconDecorations(): void {
    activeViewPlugins.forEach((plugin) => {
        plugin.decoManager.clearCache();
        // Directly call buildAsyncDecorations to force a rebuild
        plugin.buildAsyncDecorations(plugin.view);
    });
}

/**
 * Export the plugin extension
 */
export const linkFaviconDecorationPlugin = (
    plugin: ObsidianLinkEmbedPlugin,
) => {
    return [faviconDecorations.field, buildViewPlugin(plugin)];
};
