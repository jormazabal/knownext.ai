import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentTree } from "./DocumentTree";
import type { DocumentTreeNode } from "../../types/domain";

const nodes: DocumentTreeNode[] = [
  {
    id: "folder-requirements",
    name: "Requisitos",
    type: "folder",
    open: true,
    children: [
      {
        id: "doc-functional",
        name: "requisitos-funcionales.md",
        type: "document",
      },
    ],
  },
  {
    id: "folder-archive",
    name: "Archivo",
    type: "folder",
    open: true,
    children: [],
  },
];

afterEach(() => cleanup());

describe("DocumentTree", () => {
  it("opens documents and toggles folders from the tree", async () => {
    const onOpenDocument = vi.fn();
    const onToggleNode = vi.fn();

    render(
      <DocumentTree
        nodes={nodes}
        activeDocumentId=""
        onOpenDocument={onOpenDocument}
        onRenameNode={vi.fn()}
        onToggleNode={onToggleNode}
        onContextAction={vi.fn()}
        onMoveNode={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("Requisitos"));
    expect(onToggleNode).toHaveBeenCalledWith("folder-requirements");

    await userEvent.click(screen.getByText("requisitos-funcionales.md"));
    expect(onOpenDocument).toHaveBeenCalledWith("doc-functional", "requisitos-funcionales.md");
  });

  it("dispatches folder context menu actions", async () => {
    const onContextAction = vi.fn();

    render(
      <DocumentTree
        nodes={nodes}
        activeDocumentId=""
        onOpenDocument={vi.fn()}
        onRenameNode={vi.fn()}
        onToggleNode={vi.fn()}
        onContextAction={onContextAction}
        onMoveNode={vi.fn()}
      />,
    );

    await userEvent.hover(screen.getByRole("button", { name: /^abrir menú de requisitos$/i }));
    await waitFor(() => expect(screen.getByText("Nueva carpeta")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Nuevo documento"));

    expect(onContextAction).toHaveBeenCalledWith("create-document", nodes[0]);
  });

  it("dispatches document context menu actions", async () => {
    const onContextAction = vi.fn();
    const documentNode = nodes[0].children![0];

    render(
      <DocumentTree
        nodes={nodes}
        activeDocumentId=""
        onOpenDocument={vi.fn()}
        onRenameNode={vi.fn()}
        onToggleNode={vi.fn()}
        onContextAction={onContextAction}
        onMoveNode={vi.fn()}
      />,
    );

    await userEvent.hover(screen.getByRole("button", { name: /abrir menú de requisitos-funcionales\.md/i }));
    await waitFor(() => expect(screen.getByText("Mover")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Mover"));

    expect(onContextAction).toHaveBeenCalledWith("move", documentNode);
  });

  it("moves a document by dragging it onto a folder", () => {
    const onMoveNode = vi.fn();
    const documentNode = nodes[0].children![0];

    render(
      <DocumentTree
        nodes={nodes}
        activeDocumentId=""
        onOpenDocument={vi.fn()}
        onRenameNode={vi.fn()}
        onToggleNode={vi.fn()}
        onContextAction={vi.fn()}
        onMoveNode={onMoveNode}
      />,
    );

    const documentRow = screen.getByText("requisitos-funcionales.md").closest(".tree-row");
    const folderRow = screen.getByText("Archivo").closest(".tree-row");
    expect(documentRow).not.toBeNull();
    expect(folderRow).not.toBeNull();

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(documentRow!, { dataTransfer });
    fireEvent.dragOver(folderRow!, { dataTransfer });
    fireEvent.drop(folderRow!, { dataTransfer });

    expect(onMoveNode).toHaveBeenCalledWith(documentNode, "folder-archive");
  });
});

function createDataTransfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: "",
    dropEffect: "",
    setData: (key: string, value: string) => data.set(key, value),
    getData: (key: string) => data.get(key) ?? "",
  };
}
