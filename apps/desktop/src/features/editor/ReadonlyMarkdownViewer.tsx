import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import {
  configureUnderlineMarkdownSerialization,
  remarkUnderlineHtmlPlugin,
  toggleUnderlineCommand,
  underlineSchema,
} from "./underlineExtension";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

type ReadonlyMarkdownViewerProps = {
  markdown: string;
  ariaLabel: string;
  emptyMessage: string;
};

export function ReadonlyMarkdownViewer({ markdown, ariaLabel, emptyMessage }: ReadonlyMarkdownViewerProps) {
  const hasMarkdown = markdown.trim().length > 0;

  return (
    <article aria-label={ariaLabel} data-testid="readonly-markdown-viewer">
      {hasMarkdown ? (
        <MilkdownProvider key={markdown}>
          <ReadonlyMilkdown markdown={markdown} />
        </MilkdownProvider>
      ) : (
        <div className="knownext-editor">
          <p className="text-[13px] text-ink-secondary">{emptyMessage}</p>
        </div>
      )}
    </article>
  );
}

function ReadonlyMilkdown({ markdown }: Pick<ReadonlyMarkdownViewerProps, "markdown">) {
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
    });
    crepe.editor.use(remarkUnderlineHtmlPlugin).use(underlineSchema).use(toggleUnderlineCommand);
    crepe.setReadonly(true);

    return crepe;
  }, []);

  return (
    <div className="knownext-editor knownext-readonly-editor">
      <Milkdown />
    </div>
  );
}
