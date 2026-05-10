import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

type ReleaseNotesViewerProps = {
  markdown: string;
};

export function ReleaseNotesViewer({ markdown }: ReleaseNotesViewerProps) {
  const hasMarkdown = markdown.trim().length > 0;

  return (
    <article aria-label="Notas de release" data-testid="release-notes-viewer">
      {hasMarkdown ? (
        <MilkdownProvider key={markdown}>
          <ReadonlyMilkdown markdown={markdown} />
        </MilkdownProvider>
      ) : (
        <div className="knownext-editor">
          <p className="text-[13px] text-ink-secondary">No se pudieron cargar las notas de release.</p>
        </div>
      )}
    </article>
  );
}

function ReadonlyMilkdown({ markdown }: ReleaseNotesViewerProps) {
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

    crepe.setReadonly(true);
    return crepe;
  }, []);

  return (
    <div className="knownext-editor knownext-readonly-editor">
      <Milkdown />
    </div>
  );
}
