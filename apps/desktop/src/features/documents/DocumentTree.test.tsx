import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentTree } from "./DocumentTree";
import type { DocumentTreeNode } from "../../types/domain";
import { DOCUMENT_TREE_FILE_DRAG_MIME, DOCUMENT_TREE_NODE_DRAG_MIME } from "../../lib/dragData";

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
    id: "image-diagram",
    name: "diagram.png",
    type: "image",
    path: "assets/diagram.png",
    mimeType: "image/png",
    sizeBytes: 640,
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
    await waitFor(() => expect(screen.getByText("Exportar")).toBeInTheDocument());
    expect(screen.queryByText("Exportar PDF")).not.toBeInTheDocument();

    await userEvent.hover(screen.getByText("Exportar"));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /markdown/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("menuitem", { name: /markdown/i }));

    await userEvent.hover(screen.getByRole("button", { name: /abrir menú de requisitos-funcionales\.md/i }));
    await waitFor(() => expect(screen.getByText("Exportar")).toBeInTheDocument());
    await userEvent.hover(screen.getByText("Exportar"));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /pdf/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("menuitem", { name: /pdf/i }));

    await userEvent.hover(screen.getByRole("button", { name: /abrir menú de requisitos-funcionales\.md/i }));
    await waitFor(() => expect(screen.getByText("Exportar")).toBeInTheDocument());
    await userEvent.hover(screen.getByText("Exportar"));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /docx/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("menuitem", { name: /docx/i }));

    expect(onContextAction).toHaveBeenNthCalledWith(1, "export-md", documentNode);
    expect(onContextAction).toHaveBeenNthCalledWith(2, "export-pdf", documentNode);
    expect(onContextAction).toHaveBeenNthCalledWith(3, "export-docx", documentNode);
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
    expect(dataTransfer.effectAllowed).toBe("copyMove");
    expect(JSON.parse(dataTransfer.getData(DOCUMENT_TREE_NODE_DRAG_MIME))).toMatchObject({ id: "doc-functional", type: "document" });
    expect(JSON.parse(dataTransfer.getData(DOCUMENT_TREE_FILE_DRAG_MIME))).toMatchObject({ id: "doc-functional", type: "document" });
    fireEvent.dragOver(folderRow!, { dataTransfer });
    fireEvent.drop(folderRow!, { dataTransfer });

    expect(onMoveNode).toHaveBeenCalledWith(documentNode, "folder-archive");
  });

  it("moves a document with the desktop mouse drag fallback", () => {
    const onMoveNode = vi.fn();
    const onOpenDocument = vi.fn();
    const documentNode = nodes[0].children![0];

    render(
      <DocumentTree
        nodes={nodes}
        activeDocumentId=""
        onOpenDocument={onOpenDocument}
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

    const documentRow = screen.getByText("requisitos-funcionales.md").closest(".tree-row") as HTMLElement;
    const folderRow = screen.getByText("Archivo").closest(".tree-row") as HTMLElement;
    expect(documentRow).not.toBeNull();
    expect(folderRow).not.toBeNull();

    const originalElementsFromPoint = document.elementsFromPoint;
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [folderRow]),
    });

    try {
      fireEvent.mouseDown(documentRow, { button: 0, clientX: 80, clientY: 80 });
      fireEvent.mouseMove(window, { clientX: 120, clientY: 112 });
      fireEvent.mouseUp(window, { clientX: 120, clientY: 112 });
      fireEvent.click(documentRow);
    } finally {
      Object.defineProperty(document, "elementsFromPoint", {
        configurable: true,
        value: originalElementsFromPoint,
      });
    }

    expect(onMoveNode).toHaveBeenCalledWith(documentNode, "folder-archive");
    expect(onOpenDocument).not.toHaveBeenCalled();
  });

  it("moves a folder with the desktop mouse drag fallback", () => {
    const onMoveNode = vi.fn();
    const folderNodes: DocumentTreeNode[] = [
      {
        id: "folder-source",
        name: "Origen",
        type: "folder",
        open: true,
        children: [{ id: "doc-child", name: "child.md", type: "document" }],
      },
      {
        id: "folder-target",
        name: "Destino",
        type: "folder",
        open: true,
        children: [],
      },
    ];

    render(
      <DocumentTree
        nodes={folderNodes}
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

    const sourceRow = screen.getByText("Origen").closest(".tree-row") as HTMLElement;
    const targetRow = screen.getByText("Destino").closest(".tree-row") as HTMLElement;
    const originalElementsFromPoint = document.elementsFromPoint;
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [targetRow]),
    });

    try {
      fireEvent.mouseDown(sourceRow, { button: 0, clientX: 80, clientY: 80 });
      fireEvent.mouseMove(window, { clientX: 130, clientY: 110 });
      fireEvent.mouseUp(window, { clientX: 130, clientY: 110 });
    } finally {
      Object.defineProperty(document, "elementsFromPoint", {
        configurable: true,
        value: originalElementsFromPoint,
      });
    }

    expect(onMoveNode).toHaveBeenCalledWith(folderNodes[0], "folder-target");
  });

  it("adds a dragged document to the prompt context with the desktop mouse drag fallback", () => {
    const onMoveNode = vi.fn();
    const onAddNodeContext = vi.fn();
    const documentNode = nodes[0].children![0];
    const promptTarget = document.createElement("div");
    promptTarget.className = "knownext-ai-prompt";
    document.body.appendChild(promptTarget);

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
        onAddNodeContext={onAddNodeContext}
      />,
    );

    const documentRow = screen.getByText("requisitos-funcionales.md").closest(".tree-row") as HTMLElement;
    const originalElementsFromPoint = document.elementsFromPoint;
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [promptTarget]),
    });

    try {
      fireEvent.mouseDown(documentRow, { button: 0, clientX: 80, clientY: 80 });
      fireEvent.mouseMove(window, { clientX: 700, clientY: 860 });
      fireEvent.mouseUp(window, { clientX: 700, clientY: 860 });
    } finally {
      Object.defineProperty(document, "elementsFromPoint", {
        configurable: true,
        value: originalElementsFromPoint,
      });
      promptTarget.remove();
    }

    expect(onAddNodeContext).toHaveBeenCalledWith(documentNode.id);
    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it("moves a folder by dragging it onto another folder", () => {
    const onMoveNode = vi.fn();
    const folderNodes: DocumentTreeNode[] = [
      {
        id: "folder-source",
        name: "Origen",
        type: "folder",
        open: true,
        children: [{ id: "doc-child", name: "child.md", type: "document" }],
      },
      {
        id: "folder-target",
        name: "Destino",
        type: "folder",
        open: true,
        children: [],
      },
    ];

    render(
      <DocumentTree
        nodes={folderNodes}
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

    const sourceRow = screen.getByText("Origen").closest(".tree-row");
    const targetRow = screen.getByText("Destino").closest(".tree-row");
    expect(sourceRow).not.toBeNull();
    expect(targetRow).not.toBeNull();

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(sourceRow!, { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe("move");
    fireEvent.dragOver(targetRow!, { dataTransfer });
    fireEvent.drop(targetRow!, { dataTransfer });

    expect(onMoveNode).toHaveBeenCalledWith(folderNodes[0], "folder-target");
  });

  it("shows a floating preview during controlled tree dragging", () => {
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
        onMoveNode={vi.fn()}
      />,
    );

    const row = screen.getByText("Requisitos").closest(".tree-row");
    expect(row).not.toBeNull();

    fireEvent.mouseDown(row!, { button: 0, clientX: 72, clientY: 92 });
    fireEvent.mouseMove(window, { clientX: 110, clientY: 116 });

    const preview = screen.getByTestId("document-tree-drag-preview");
    expect(preview).toHaveTextContent("Requisitos");

    fireEvent.mouseUp(window, { clientX: 110, clientY: 116 });
  });

  it("moves a file to the target file parent when dropped onto a file row", () => {
    const onMoveNode = vi.fn();
    const attachmentNode = nodes[3];

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

    const attachmentRow = screen.getByText("brief.pdf").closest(".tree-row");
    const targetFileRow = screen.getByText("requisitos-funcionales.md").closest(".tree-row");
    expect(attachmentRow).not.toBeNull();
    expect(targetFileRow).not.toBeNull();

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(attachmentRow!, { dataTransfer });
    fireEvent.dragOver(targetFileRow!, { dataTransfer });
    fireEvent.drop(targetFileRow!, { dataTransfer });

    expect(onMoveNode).toHaveBeenCalledWith(attachmentNode, "folder-requirements");
  });

  it("moves a nested file to the project root by dropping it outside tree rows", () => {
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
    const rootDropArea = screen.getByTestId("document-tree-root-drop");
    expect(documentRow).not.toBeNull();

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(documentRow!, { dataTransfer });
    fireEvent.dragOver(rootDropArea, { dataTransfer });
    fireEvent.drop(rootDropArea, { dataTransfer });

    expect(onMoveNode).toHaveBeenCalledWith(documentNode, null);
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
    await userEvent.click(screen.getByRole("button", { name: "Ocultar extensiones" }));
    expect(screen.getByText("requisitos-funcionales")).toBeInTheDocument();
    expect(screen.queryByText("requisitos-funcionales.md")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vista del árbol" }));
    await userEvent.click(screen.getByRole("button", { name: "Mostrar extensiones" }));
    expect(screen.getByText("requisitos-funcionales.md")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Vista del árbol" }));
    await userEvent.click(screen.getByRole("button", { name: "Solo Markdown" }));
    expect(screen.getByText("Markdown")).toBeInTheDocument();
    expect(screen.queryByText("Archivo")).not.toBeInTheDocument();
    expect(screen.queryByText("brief.pdf")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vista del árbol" }));
    await userEvent.click(screen.getByRole("button", { name: "Ver todo" }));
    expect(screen.queryByText("Markdown")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vista del árbol" }));
    await userEvent.click(screen.getByRole("button", { name: "Solo imágenes" }));
    expect(screen.getByText("Imágenes")).toBeInTheDocument();
    expect(screen.getByText("diagram.png")).toBeInTheDocument();
    expect(screen.queryByText("requisitos-funcionales.md")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vista del árbol" }));
    await userEvent.click(screen.getByRole("button", { name: "Solo archivos" }));
    expect(screen.getAllByText("Archivos").length).toBeGreaterThan(1);
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
  }, 20_000);

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

  it("keeps the selected tree filter active when the current document is hidden by it", async () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      const { rerender } = render(
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

      await userEvent.click(screen.getByRole("button", { name: "Vista del árbol" }));
      await userEvent.click(screen.getByRole("button", { name: "Solo archivos" }));
      expect(screen.queryByText("requisitos-funcionales.md")).not.toBeInTheDocument();
      expect(screen.getAllByText("Archivos").length).toBeGreaterThan(1);

      rerender(
        <DocumentTree
          nodes={nodes}
          activeDocumentId="doc-functional"
          activeTreeNodeId="doc-functional"
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

      expect(screen.queryByText("requisitos-funcionales.md")).not.toBeInTheDocument();
      expect(screen.getAllByText("Archivos").length).toBeGreaterThan(1);
      expect(scrollIntoView).not.toHaveBeenCalledWith({ block: "nearest" });

      await userEvent.click(screen.getByRole("button", { name: "Vista del árbol" }));
      await userEvent.click(screen.getByRole("button", { name: "Ver todo" }));
      await waitFor(() => expect(screen.getByText("requisitos-funcionales.md")).toBeInTheDocument());
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" }));
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
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
    const onOpenReferenceDocument = vi.fn();
    const attachmentNode = nodes[3];

    render(
      <DocumentTree
        nodes={nodes}
        activeDocumentId=""
        onOpenDocument={vi.fn()}
        onOpenReferenceDocument={onOpenReferenceDocument}
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
    expect(onOpenReferenceDocument).toHaveBeenCalledWith("attachment-brief", "brief.pdf", "brief.pdf");
    expect(onActivateTreeNode).not.toHaveBeenCalled();

    await userEvent.hover(screen.getByRole("button", { name: /abrir menú de brief\.pdf/i }));
    await waitFor(() => expect(screen.getByText("Abrir vista")).toBeInTheDocument());
    expect(screen.getByText("Usar como contexto IA")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Usar como contexto IA"));

    expect(onContextAction).toHaveBeenCalledWith("add-attachment-context", attachmentNode);
  });

  it("dispatches image open and context actions without treating images as Markdown documents", async () => {
    const onContextAction = vi.fn();
    const onActivateTreeNode = vi.fn();
    const onOpenDocument = vi.fn();
    const onOpenImage = vi.fn();
    const imageNode = nodes[2];

    render(
      <DocumentTree
        nodes={nodes}
        activeDocumentId=""
        onOpenDocument={onOpenDocument}
        onOpenImage={onOpenImage}
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

    await userEvent.click(screen.getByText("diagram.png"));
    expect(onOpenImage).toHaveBeenCalledWith("image-diagram", "diagram.png", "assets/diagram.png");
    expect(onOpenDocument).not.toHaveBeenCalled();
    expect(onActivateTreeNode).not.toHaveBeenCalled();

    await userEvent.hover(screen.getByRole("button", { name: /abrir menú de diagram\.png/i }));
    await waitFor(() => expect(screen.getByText("Insertar en documento")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Insertar en documento"));
    expect(onContextAction).toHaveBeenCalledWith("insert-image", imageNode);

    await userEvent.hover(screen.getByRole("button", { name: /abrir menú de diagram\.png/i }));
    await waitFor(() => expect(screen.getByText("Copiar referencia")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Copiar referencia"));
    expect(onContextAction).toHaveBeenCalledWith("copy-image-reference", imageNode);
  });

  it("inserts a dragged image into the active document with the controlled mouse drag", () => {
    const onPreviewImageDropIntoActiveDocument = vi.fn();
    const onDropImageIntoActiveDocument = vi.fn();
    const editorTarget = document.createElement("div");
    editorTarget.className = "knownext-editor";
    document.body.appendChild(editorTarget);

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
        onMoveNode={vi.fn()}
        onPreviewImageDropIntoActiveDocument={onPreviewImageDropIntoActiveDocument}
        onDropImageIntoActiveDocument={onDropImageIntoActiveDocument}
      />,
    );

    const imageRow = screen.getByText("diagram.png").closest(".tree-row") as HTMLElement;
    expect(imageRow).not.toBeNull();
    expect(imageRow).toHaveAttribute("draggable", "false");

    const originalElementsFromPoint = document.elementsFromPoint;
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [editorTarget]),
    });

    try {
      fireEvent.mouseDown(imageRow, { button: 0, clientX: 80, clientY: 80 });
      fireEvent.mouseMove(window, { clientX: 720, clientY: 360 });
      fireEvent.mouseUp(window, { clientX: 720, clientY: 360 });
    } finally {
      Object.defineProperty(document, "elementsFromPoint", {
        configurable: true,
        value: originalElementsFromPoint,
      });
      editorTarget.remove();
    }

    expect(onPreviewImageDropIntoActiveDocument).toHaveBeenCalledWith("image-diagram", 720, 360);
    expect(onDropImageIntoActiveDocument).toHaveBeenCalledWith("image-diagram", 720, 360);
  });
});

function createDataTransfer() {
  const data = new Map<string, string>();
  return {
    types: [] as string[],
    effectAllowed: "",
    dropEffect: "",
    setData(key: string, value: string) {
      data.set(key, value);
      if (!this.types.includes(key)) this.types.push(key);
    },
    getData: (key: string) => data.get(key) ?? "",
  };
}
