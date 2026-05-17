import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  {
    id: "attachment-brief",
    name: "brief.pdf",
    type: "attachment",
    path: "brief.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1200,
  },
  { id: "attachment-docx", name: "proposal.docx", type: "attachment", path: "proposal.docx" },
  { id: "attachment-pptx", name: "deck.pptx", type: "attachment", path: "deck.pptx" },
  { id: "attachment-xlsx", name: "budget.xlsx", type: "attachment", path: "budget.xlsx" },
  { id: "attachment-txt", name: "notes.txt", type: "attachment", path: "notes.txt" },
  { id: "attachment-csv", name: "metrics.csv", type: "attachment", path: "metrics.csv" },
  { id: "attachment-generic", name: "bundle.bin", type: "attachment", path: "bundle.bin" },
];

afterEach(() => cleanup());

describe("DocumentTree", () => {
  it("opens documents and toggles folders from the tree", async () => {
    const onOpenDocument = vi.fn();
    const onToggleNode = vi.fn();
    const onActivateTreeNode = vi.fn();

    render(
      <DocumentTree
        nodes={nodes}
        activeDocumentId=""
        onOpenDocument={onOpenDocument}
        onActivateTreeNode={onActivateTreeNode}
        onSelectTreeNode={vi.fn()}
        onCreateFolder={vi.fn()}
        onCreateDocument={vi.fn()}
        onExpandTree={vi.fn()}
        onCollapseTree={vi.fn()}
        onConfigureProject={vi.fn()}
        onRenameNode={vi.fn()}
        onToggleNode={onToggleNode}
        onContextAction={vi.fn()}
        onMoveNode={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("Requisitos"));
    expect(onActivateTreeNode).toHaveBeenCalledWith("folder-requirements");
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
        onActivateTreeNode={vi.fn()}
        onSelectTreeNode={vi.fn()}
        onCreateFolder={vi.fn()}
        onCreateDocument={vi.fn()}
        onExpandTree={vi.fn()}
        onCollapseTree={vi.fn()}
        onConfigureProject={vi.fn()}
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
        onActivateTreeNode={vi.fn()}
        onSelectTreeNode={vi.fn()}
        onCreateFolder={vi.fn()}
        onCreateDocument={vi.fn()}
        onExpandTree={vi.fn()}
        onCollapseTree={vi.fn()}
        onConfigureProject={vi.fn()}
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
        onActivateTreeNode={vi.fn()}
        onSelectTreeNode={vi.fn()}
        onCreateFolder={vi.fn()}
        onCreateDocument={vi.fn()}
        onExpandTree={vi.fn()}
        onCollapseTree={vi.fn()}
        onConfigureProject={vi.fn()}
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

  it("groups project commands and tree visibility controls in the file toolbar", async () => {
    const onCreateFolder = vi.fn();
    const onCreateDocument = vi.fn();
    const onImportFile = vi.fn();
    const onExpandTree = vi.fn();
    const onCollapseTree = vi.fn();
    const onConfigureProject = vi.fn();

    render(
      <DocumentTree
        nodes={nodes}
        activeDocumentId=""
        onOpenDocument={vi.fn()}
        onActivateTreeNode={vi.fn()}
        onSelectTreeNode={vi.fn()}
        onCreateFolder={onCreateFolder}
        onCreateDocument={onCreateDocument}
        onImportFile={onImportFile}
        onExpandTree={onExpandTree}
        onCollapseTree={onCollapseTree}
        onConfigureProject={onConfigureProject}
        onRenameNode={vi.fn()}
        onToggleNode={vi.fn()}
        onContextAction={vi.fn()}
        onMoveNode={vi.fn()}
      />,
    );

    expect(screen.getByText("Archivos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buscar archivos y carpetas" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Añadir" }));
    await userEvent.click(screen.getByRole("button", { name: /^Nueva carpeta/ }));
    await userEvent.click(screen.getByRole("button", { name: "Añadir" }));
    await userEvent.click(screen.getByRole("button", { name: /^Nuevo Markdown/ }));
    await userEvent.click(screen.getByRole("button", { name: "Añadir" }));
    await userEvent.click(screen.getByRole("button", { name: /^Importar archivo/ }));

    await userEvent.click(screen.getByRole("button", { name: "Vista del árbol" }));
    await userEvent.click(screen.getByRole("button", { name: "Solo Markdown" }));
    expect(screen.queryByText("Archivo")).not.toBeInTheDocument();
    expect(screen.queryByText("brief.pdf")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vista del árbol" }));
    await userEvent.click(screen.getByRole("button", { name: "Ver todo" }));
    await userEvent.click(screen.getByRole("button", { name: "Vista del árbol" }));
    await userEvent.click(screen.getByRole("button", { name: "Solo archivos" }));
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vista del árbol" }));
    await userEvent.click(screen.getByRole("button", { name: "Expandir carpetas" }));
    await userEvent.click(screen.getByRole("button", { name: "Vista del árbol" }));
    await userEvent.click(screen.getByRole("button", { name: "Contraer carpetas" }));
    await userEvent.click(screen.getByRole("button", { name: "Ajustes del proyecto" }));

    expect(onCreateFolder).toHaveBeenCalledTimes(1);
    expect(onCreateDocument).toHaveBeenCalledTimes(1);
    expect(onImportFile).toHaveBeenCalledTimes(1);
    expect(onExpandTree).toHaveBeenCalledTimes(1);
    expect(onCollapseTree).toHaveBeenCalledTimes(1);
    expect(onConfigureProject).toHaveBeenCalledTimes(1);
  });

  it("shows distinct support-file type badges and keeps toolbar outside the scroll region", () => {
    const { container } = render(
      <DocumentTree
        nodes={nodes}
        activeDocumentId=""
        onOpenDocument={vi.fn()}
        onActivateTreeNode={vi.fn()}
        onSelectTreeNode={vi.fn()}
        onCreateFolder={vi.fn()}
        onCreateDocument={vi.fn()}
        onExpandTree={vi.fn()}
        onCollapseTree={vi.fn()}
        onConfigureProject={vi.fn()}
        onRenameNode={vi.fn()}
        onToggleNode={vi.fn()}
        onContextAction={vi.fn()}
        onMoveNode={vi.fn()}
      />,
    );

    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("DOC")).toBeInTheDocument();
    expect(screen.getByText("PPT")).toBeInTheDocument();
    expect(screen.getByText("XLS")).toBeInTheDocument();
    expect(screen.getByText("TXT")).toBeInTheDocument();
    expect(screen.getByText("CSV")).toBeInTheDocument();
    expect(screen.queryByText("BIN")).not.toBeInTheDocument();
    expect(container.querySelector(".overflow-y-auto")?.contains(screen.getByText("Archivos"))).toBe(false);
  });

  it("searches folders and documents by name fragments", async () => {
    const onSelectTreeNode = vi.fn();

    render(
      <DocumentTree
        nodes={nodes}
        activeDocumentId=""
        onOpenDocument={vi.fn()}
        onActivateTreeNode={vi.fn()}
        onSelectTreeNode={onSelectTreeNode}
        onCreateFolder={vi.fn()}
        onCreateDocument={vi.fn()}
        onExpandTree={vi.fn()}
        onCollapseTree={vi.fn()}
        onConfigureProject={vi.fn()}
        onRenameNode={vi.fn()}
        onToggleNode={vi.fn()}
        onContextAction={vi.fn()}
        onMoveNode={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Buscar archivos y carpetas" }));
    await userEvent.type(screen.getByPlaceholderText("Buscar archivos y carpetas"), "func");

    const dialog = screen.getByRole("dialog");
    expect(screen.getByText("requisitos-funcionales.md")).toBeInTheDocument();
    expect(within(dialog).getByText("Requisitos")).toBeInTheDocument();

    await userEvent.keyboard("{Enter}");
    expect(onSelectTreeNode).toHaveBeenCalledWith("doc-functional", "document", "requisitos-funcionales.md");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("selects the first folder match with tab when the query is inside the name", async () => {
    const onSelectTreeNode = vi.fn();

    render(
      <DocumentTree
        nodes={nodes}
        activeDocumentId=""
        onOpenDocument={vi.fn()}
        onActivateTreeNode={vi.fn()}
        onSelectTreeNode={onSelectTreeNode}
        onCreateFolder={vi.fn()}
        onCreateDocument={vi.fn()}
        onExpandTree={vi.fn()}
        onCollapseTree={vi.fn()}
        onConfigureProject={vi.fn()}
        onRenameNode={vi.fn()}
        onToggleNode={vi.fn()}
        onContextAction={vi.fn()}
        onMoveNode={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Buscar archivos y carpetas" }));
    await userEvent.type(screen.getByPlaceholderText("Buscar archivos y carpetas"), "quis");
    await userEvent.keyboard("{Tab}");

    expect(onSelectTreeNode).toHaveBeenCalledWith("folder-requirements", "folder", "Requisitos");
  });

  it("dispatches attachment context menu actions without opening an editor", async () => {
    const onContextAction = vi.fn();
    const onActivateTreeNode = vi.fn();
    const attachmentNode = nodes[2];

    render(
      <DocumentTree
        nodes={nodes}
        activeDocumentId=""
        onOpenDocument={vi.fn()}
        onActivateTreeNode={onActivateTreeNode}
        onSelectTreeNode={vi.fn()}
        onCreateFolder={vi.fn()}
        onCreateDocument={vi.fn()}
        onExpandTree={vi.fn()}
        onCollapseTree={vi.fn()}
        onConfigureProject={vi.fn()}
        onRenameNode={vi.fn()}
        onToggleNode={vi.fn()}
        onContextAction={onContextAction}
        onMoveNode={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("brief.pdf"));
    expect(onActivateTreeNode).toHaveBeenCalledWith("attachment-brief");

    await userEvent.hover(screen.getByRole("button", { name: /abrir menú de brief\.pdf/i }));
    await waitFor(() => expect(screen.getByText("Usar como contexto IA")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Usar como contexto IA"));

    expect(onContextAction).toHaveBeenCalledWith("add-attachment-context", attachmentNode);
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
