import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoveDocumentDialog } from "./MoveDocumentDialog";
import type { DocumentTreeNode } from "../../types/domain";

describe("MoveDocumentDialog", () => {
  afterEach(() => cleanup());

  it("moves to the selected folder or to project root", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const folders: DocumentTreeNode[] = [
      { id: "folder-1", name: "Guias", type: "folder", path: "docs/Guias" },
      { id: "folder-2", name: "Archivo", type: "folder", path: "docs/Archivo" },
    ];

    const { rerender } = render(
      <MoveDocumentDialog
        open
        node={{ id: "doc-1", name: "Notas.md", type: "document", path: "docs/Notas.md" }}
        folders={folders}
        onClose={vi.fn()}
        onMove={onMove}
      />,
    );

    expect(screen.getByText("Mover elemento")).toBeInTheDocument();
    expect(screen.getByText("Notas.md")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Carpeta de destino"), "folder-2");
    await user.click(screen.getByRole("button", { name: "Mover" }));
    expect(onMove).toHaveBeenLastCalledWith("folder-2");

    rerender(
      <MoveDocumentDialog
        open={false}
        node={{ id: "doc-1", name: "Notas.md", type: "document", path: "docs/Notas.md" }}
        folders={folders}
        onClose={vi.fn()}
        onMove={onMove}
      />,
    );
    rerender(
      <MoveDocumentDialog
        open
        node={{ id: "doc-1", name: "Notas.md", type: "document", path: "docs/Notas.md" }}
        folders={folders}
        onClose={vi.fn()}
        onMove={onMove}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Mover" }));
    expect(onMove).toHaveBeenLastCalledWith(null);
  });
});
