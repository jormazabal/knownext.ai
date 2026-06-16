import type { CSSProperties } from "react";

type MarkdownSourceViewerProps = {
  markdown: string;
  zoomPercent: number;
  ariaLabel?: string;
};

export function MarkdownSourceViewer({ markdown, zoomPercent, ariaLabel = "Markdown puro" }: MarkdownSourceViewerProps) {
  const displayMarkdown = formatMarkdownSourceForDisplay(markdown);

  return (
    <div
      className="knownext-markdown-source-viewer"
      style={{ "--knownext-markdown-zoom": String(zoomPercent / 100) } as CSSProperties}
      aria-label={ariaLabel}
    >
      <pre>
        <code>{displayMarkdown}</code>
      </pre>
    </div>
  );
}

export function formatMarkdownSourceForDisplay(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const previousLine = output[output.length - 1];
    const nextLine = lines[index + 1];

    if (line.trim() === "" && previousLine !== undefined && nextLine !== undefined) {
      const previousListIndent = getListMarkerIndent(previousLine);
      const nextListIndent = getListMarkerIndent(nextLine);
      if (previousListIndent !== null && previousListIndent === nextListIndent) continue;
    }

    output.push(line);
  }

  return output.join("\n");
}

function getListMarkerIndent(line: string) {
  const match = line.match(/^(\s*)(?:[-+*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/);
  return match ? match[1].length : null;
}
