import { ReadonlyMarkdownViewer } from "../editor/ReadonlyMarkdownViewer";

type ReleaseNotesViewerProps = {
  markdown: string;
};

export function ReleaseNotesViewer({ markdown }: ReleaseNotesViewerProps) {
  return (
    <ReadonlyMarkdownViewer
      markdown={markdown}
      ariaLabel="Notas de release"
      emptyMessage="No se pudieron cargar las notas de release."
    />
  );
}
