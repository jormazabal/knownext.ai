import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InsertImageDialog } from "./InsertImageDialog";
import type { AssetImportResponse, AssetMetadata, DocumentTreeNode } from "../../types/domain";

describe("InsertImageDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("filters project images and inserts the selected asset reference", async () => {
    const onBuildReference = vi.fn().mockResolvedValue({ markdown: "![Arquitectura](assets/arquitectura.png)", asset });
    const onInsert = vi.fn();

    renderDialog({ onBuildReference, onInsert });

    fireEvent.change(screen.getByLabelText(/Texto alternativo/), {
      target: { value: "Arquitectura" },
    });
    fireEvent.change(screen.getByPlaceholderText("Buscar imagen del proyecto"), {
      target: { value: "arquitectura" },
    });
    expect(screen.queryByRole("button", { name: "Logo.png" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Arquitectura.png/ }));
    fireEvent.click(screen.getByRole("button", { name: "Insertar" }));

    await waitFor(() => expect(onBuildReference).toHaveBeenCalledWith("doc-1", "asset-2", "Arquitectura"));
    expect(onInsert).toHaveBeenCalledWith("![Arquitectura](assets/arquitectura.png)");
  });

  it("uploads an image to the active document folder and inserts the generated reference", async () => {
    const onImportImage = vi.fn().mockResolvedValue(importedImage);
    const onBuildReference = vi.fn().mockResolvedValue({ markdown: "![Nueva](docs/nueva.png)", asset: importedImage.asset });
    const onInsert = vi.fn();
    const { container } = renderDialog({ onImportImage, onBuildReference, onInsert });

    fireEvent.click(screen.getByRole("button", { name: "Subir" }));
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, {
      target: { files: [new File(["image"], "nueva.png", { type: "image/png" })] },
    });

    await waitFor(() => expect(onImportImage).toHaveBeenCalledWith("folder-docs", expect.objectContaining({ name: "nueva.png" })));
    expect(onBuildReference).toHaveBeenCalledWith("doc-1", "asset-new", "Nueva");
    expect(onInsert).toHaveBeenCalledWith("![Nueva](docs/nueva.png)");
  });

  it("inserts an external URL without importing a local asset", () => {
    const onImportImage = vi.fn();
    const onBuildReference = vi.fn();
    const onInsert = vi.fn();

    renderDialog({ onImportImage, onBuildReference, onInsert });

    fireEvent.click(screen.getByRole("button", { name: "URL" }));
    fireEvent.change(screen.getByLabelText(/Texto alternativo/), {
      target: { value: "Diagrama remoto" },
    });
    fireEvent.change(screen.getByLabelText(/URL de la imagen/), {
      target: { value: "https://example.com/diagrama.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Insertar" }));

    expect(onInsert).toHaveBeenCalledWith("![Diagrama remoto](https://example.com/diagrama.png)");
    expect(onImportImage).not.toHaveBeenCalled();
    expect(onBuildReference).not.toHaveBeenCalled();
  });

  it("shows edit mode with current alt text and delete action", () => {
    const onDelete = vi.fn();

    renderDialog({
      variant: "edit",
      initialAltText: "Proceso de fermentacion",
      initialUrl: "https://example.com/old.png",
      onDelete,
    });

    expect(screen.getByRole("heading", { name: "Editar imagen" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Texto alternativo/)).toHaveValue("Proceso de fermentacion");

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("saves URL changes in edit mode", () => {
    const onInsert = vi.fn();

    renderDialog({
      variant: "edit",
      initialAltText: "Imagen antigua",
      initialUrl: "https://example.com/old.png",
      onInsert,
    });

    fireEvent.click(screen.getByRole("button", { name: "URL" }));
    expect(screen.getByLabelText(/URL de la imagen/)).toHaveValue("https://example.com/old.png");
    fireEvent.change(screen.getByLabelText(/Texto alternativo/), {
      target: { value: "Nueva imagen contextual" },
    });
    fireEvent.change(screen.getByLabelText(/URL de la imagen/), {
      target: { value: "https://example.com/new.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(onInsert).toHaveBeenCalledWith("![Nueva imagen contextual](https://example.com/new.png)");
  });

  it("does not expose document display size configuration when inserting images", async () => {
    const onBuildReference = vi.fn().mockResolvedValue({ markdown: "![Arquitectura](assets/arquitectura.png)", asset });
    const onInsert = vi.fn();

    renderDialog({ onBuildReference, onInsert });

    expect(screen.queryByText("Tamaño en el documento")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Anchura de imagen")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Arquitectura.png/ }));
    fireEvent.click(screen.getByRole("button", { name: "Insertar" }));

    await waitFor(() => expect(onInsert).toHaveBeenCalledWith("![Arquitectura](assets/arquitectura.png)"));
  });
});

function renderDialog(overrides: Partial<Parameters<typeof InsertImageDialog>[0]> = {}) {
  return render(
    <InsertImageDialog
      activeProjectId="project-1"
      activeDocumentId="doc-1"
      activeDocumentPath="docs/Notas.md"
      tree={tree}
      onClose={vi.fn()}
      onImportImage={vi.fn()}
      onBuildReference={vi.fn()}
      onInsert={vi.fn()}
      {...overrides}
    />,
  );
}

const tree: DocumentTreeNode[] = [
  {
    id: "folder-docs",
    name: "docs",
    type: "folder",
    path: "docs",
    children: [
      {
        id: "doc-1",
        name: "Notas.md",
        type: "document",
        path: "docs/Notas.md",
      },
      {
        id: "asset-1",
        name: "Logo.png",
        type: "image",
        path: "docs/assets/logo.png",
        mimeType: "image/png",
        width: 320,
        height: 180,
      },
      {
        id: "asset-2",
        name: "Arquitectura.png",
        type: "image",
        path: "docs/assets/arquitectura.png",
        mimeType: "image/png",
        width: 800,
        height: 450,
      },
    ],
  },
];

const asset: AssetMetadata = {
  id: "asset-2",
  projectId: "project-1",
  name: "Arquitectura.png",
  path: "docs/assets/arquitectura.png",
  mimeType: "image/png",
  sizeBytes: 4096,
  width: 800,
  height: 450,
  colorDepthBits: 24,
  updatedAt: "2026-06-04T10:00:00.000Z",
  usageCount: 1,
  indexed: true,
  indexStatus: "indexed",
  visualDescription: null,
};

const importedImage: AssetImportResponse = {
  tree,
  asset: {
    ...asset,
    id: "asset-new",
    name: "Nueva.png",
    path: "docs/nueva.png",
  },
};
