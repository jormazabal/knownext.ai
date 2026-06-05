import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReleaseNotesViewer } from "./ReleaseNotesViewer";

vi.mock("../editor/ReadonlyMarkdownViewer", () => ({
  ReadonlyMarkdownViewer: ({ markdown, ariaLabel, emptyMessage }: { markdown: string; ariaLabel: string; emptyMessage: string }) => (
    <section aria-label={ariaLabel} data-empty-message={emptyMessage}>
      {markdown}
    </section>
  ),
}));

describe("ReleaseNotesViewer", () => {
  it("renders release notes through the readonly Markdown viewer contract", () => {
    render(<ReleaseNotesViewer markdown="# KnowNext.ai 2.0.2" />);

    const viewer = screen.getByLabelText("Notas de release");
    expect(viewer).toHaveTextContent("KnowNext.ai 2.0.2");
    expect(viewer).toHaveAttribute("data-empty-message", "No se pudieron cargar las notas de release.");
  });
});
