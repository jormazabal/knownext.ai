import { Crepe } from "@milkdown/crepe";
import { prosePluginsCtx } from "@milkdown/kit/core";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import type { CSSProperties } from "react";
import {
  clearHighlightCommand,
  configureHighlightMarkdownSerialization,
  highlightSchema,
  remarkHighlightHtmlPlugin,
  toggleHighlightCommand,
} from "./highlightExtension";
import {
  configureUnderlineMarkdownSerialization,
  remarkUnderlineHtmlPlugin,
  toggleUnderlineCommand,
  underlineSchema,
} from "./underlineExtension";
import { createMermaidDiagramPlugin, createMermaidDiagramViewPlugin } from "./mermaidNodeView";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

type ReadonlyMarkdownViewerProps = {
  markdown: string;
  ariaLabel: string;
  emptyMessage: string;
  zoomPercent?: number;
};

export function ReadonlyMarkdownViewer({ markdown, ariaLabel, emptyMessage, zoomPercent = 100 }: ReadonlyMarkdownViewerProps) {
  const hasMarkdown = markdown.trim().length > 0;

  return (
    <article aria-label={ariaLabel} data-testid="readonly-markdown-viewer">
      {hasMarkdown ? (
        <MilkdownProvider key={markdown}>
          <ReadonlyMilkdown markdown={markdown} zoomPercent={zoomPercent} />
        </MilkdownProvider>
      ) : (
        <div className="knownext-editor" style={{ "--knownext-markdown-zoom": String(zoomPercent / 100) } as CSSProperties}>
          <p className="text-[13px] text-ink-secondary">{emptyMessage}</p>
        </div>
      )}
    </article>
  );
}

function ReadonlyMilkdown({ markdown, zoomPercent }: Pick<ReadonlyMarkdownViewerProps, "markdown" | "zoomPercent">) {
  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: markdown,
      features: {
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.LinkTooltip]: false,
        [Crepe.Feature.Toolbar]: false,
      },
    });

    crepe.editor.config((ctx) => {
      configureUnderlineMarkdownSerialization(ctx);
      configureHighlightMarkdownSerialization(ctx);
      ctx.update(prosePluginsCtx, (plugins) => [createMermaidDiagramPlugin(), ...plugins]);
    });
    crepe.editor.use(createMermaidDiagramViewPlugin());
    crepe.editor.use(remarkUnderlineHtmlPlugin).use(underlineSchema).use(toggleUnderlineCommand);
    crepe.editor.use(remarkHighlightHtmlPlugin).use(highlightSchema).use(toggleHighlightCommand).use(clearHighlightCommand);
    crepe.setReadonly(true);

    return crepe;
  }, []);

  return (
    <div className="knownext-editor knownext-readonly-editor" style={{ "--knownext-markdown-zoom": String((zoomPercent ?? 100) / 100) } as CSSProperties}>
      <Milkdown />
    </div>
  );
}
