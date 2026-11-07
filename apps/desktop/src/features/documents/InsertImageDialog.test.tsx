import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InsertImageDialog } from "./InsertImageDialog";
import type { AssetImportResponse, AssetMetadata, DocumentTreeNode } from "../../types/domain";

describe("InsertImageDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the selected file and ALT after an upload failure and retries explicitly",async()=>{
    const upload=vi.fn().mockRejectedValueOnce(new Error("No hay espacio suficiente")).mockResolvedValue(importedImage);
    const build=vi.fn().mockResolvedValue({markdown:"![Texto conservado](docs/nueva.png)",asset:importedImage.asset});
    const insert=vi.fn();const {container}=renderDialog({onImportImage:upload,onBuildReference:build,onInsert:insert});
    fireEvent.change(screen.getByLabelText(/Texto alternativo/),{target:{value:"Texto conservado"}});
    fireEvent.click(screen.getByRole("button",{name:"Subir"}));
    const file=new File(["image"],"nueva.png",{type:"image/png"});
    fireEvent.change(container.querySelector('input[type="file"]')!,{target:{files:[file]}});
    expect(await screen.findByRole("alert")).toHaveTextContent("No hay espacio suficiente");
    expect(screen.getByLabelText(/Texto alternativo/)).toHaveValue("Texto conservado");
    fireEvent.click(screen.getByRole("button",{name:"Reintentar subida"}));
    await waitFor(()=>expect(insert).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledTimes(2);expect(upload.mock.calls[1][1]).toBe(file);
  });

  it("retries only the reference after the image was imported and prevents duplicate uploads",async()=>{
    let resolve!: (value:AssetImportResponse)=>void;
    const upload=vi.fn().mockReturnValue(new Promise<AssetImportResponse>(r=>{resolve=r;}));
    const build=vi.fn().mockRejectedValueOnce(new Error("Referencia no disponible")).mockResolvedValue({markdown:"![Nueva](docs/nueva.png)",asset:importedImage.asset});
    const insert=vi.fn();const {container}=renderDialog({onImportImage:upload,onBuildReference:build,onInsert:insert});
    fireEvent.click(screen.getByRole("button",{name:"Subir"}));
    const input=container.querySelector('input[type="file"]')!;
    const file=new File(["image"],"nueva.png",{type:"image/png"});
    fireEvent.change(input,{target:{files:[file]}});fireEvent.change(input,{target:{files:[file]}});
    expect(upload).toHaveBeenCalledTimes(1);
    await act(async()=>resolve(importedImage));
    expect(await screen.findByRole("alert")).toHaveTextContent("La imagen ya está en el proyecto");
    fireEvent.click(screen.getByRole("button",{name:"Reintentar inserción"}));
    await waitFor(()=>expect(insert).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledTimes(1);expect(build).toHaveBeenCalledTimes(2);
  });

  it("does not insert a late imported image after changing document or closing",async()=>{
    let resolve!: (value:AssetImportResponse)=>void;
    const upload=vi.fn().mockImplementation(()=>new Promise<AssetImportResponse>(r=>{resolve=r;}));
    const build=vi.fn();const insert=vi.fn();const {container,unmount,rerender}=renderDialog({onImportImage:upload,onBuildReference:build,onInsert:insert});
    fireEvent.click(screen.getByRole("button",{name:"Subir"}));
    fireEvent.change(container.querySelector('input[type="file"]')!,{target:{files:[new File(["image"],"nueva.png")]}});
    const props={activeProjectId:"project-1",activeDocumentPath:"docs/Notas.md",tree,onClose:vi.fn(),onImportImage:upload,onBuildReference:build,onInsert:insert};
    rerender(<InsertImageDialog {...props} activeDocumentId="doc-2"/>);
    rerender(<InsertImageDialog {...props} activeDocumentId="doc-1"/>);
    await act(async()=>resolve(importedImage));
    expect(build).not.toHaveBeenCalled();expect(insert).not.toHaveBeenCalled();
    fireEvent.change(container.querySelector('input[type="file"]')!,{target:{files:[new File(["image"],"another.png")]}});
    unmount();await act(async()=>resolve(importedImage));
    expect(build).not.toHaveBeenCalled();expect(insert).not.toHaveBeenCalled();
  });

  it("reviews a kept copy before inserting its effective name",async()=>{
    const imported={...importedImage,asset:{...importedImage.asset,name:"nueva (2).png"},warnings:["Importado como nueva (2).png; el archivo existente se ha conservado"],importReceipt:{id:"import-qa",projectId:"project-1",requestedName:"nueva.png",storedName:"nueva (2).png",path:"docs/nueva (2).png",renamed:true,committed:true as const,bytes:10,sha256:"a".repeat(64),treeAvailable:true,checkedAt:"2026-11-01T00:00:00Z"}};
    const upload=vi.fn().mockResolvedValue(imported);const build=vi.fn().mockResolvedValue({markdown:"![Nueva](docs/nueva%20(2).png)",asset:imported.asset});const insert=vi.fn();
    const {container}=renderDialog({onImportImage:upload,onBuildReference:build,onInsert:insert});
    fireEvent.click(screen.getByRole("button",{name:"Subir"}));
    fireEvent.change(container.querySelector('input[type="file"]')!,{target:{files:[new File(["image"],"nueva.png")]}});
    expect(await screen.findByRole("status")).toHaveTextContent("el archivo existente se ha conservado");
    expect(build).not.toHaveBeenCalled();expect(insert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Insertar imagen guardada"}));
    await waitFor(()=>expect(insert).toHaveBeenCalledTimes(1));expect(upload).toHaveBeenCalledTimes(1);
  });

  it("filters project images and inserts the selected asset reference", async () => {
    const onBuildReference = vi.fn().mockResolvedValue({ markdown: "![Arquitectura](assets/arquitectura.png)", asset });
    const onInsert = vi.fn();

    renderDialog({ onBuildReference, onInsert });

    fireEvent.change(screen.getByLabelText(/Texto alternativo/), {
      target: { value: "Arquitectura" },
    });
    fireEvent.change(screen.getByPlaceholderText("Buscar imagen o nota"), {
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

  it("changing only a local image description preserves its exact source query and fragment", async()=>{
    const onInsert=vi.fn();const onBuildReference=vi.fn();
    renderDialog({variant:'edit',initialAltText:'Antes',initialUrl:'assets/arquitectura.png?raw=1#detalle',onInsert,onBuildReference});
    fireEvent.change(screen.getByLabelText(/Texto alternativo/),{target:{value:'Plano [A] *literal*'}});
    fireEvent.click(screen.getByRole('button',{name:'Guardar cambios'}));
    await waitFor(()=>expect(onInsert).toHaveBeenCalledWith('![Plano \\[A\\] \\*literal\\*](assets/arquitectura.png?raw=1#detalle)'));
    expect(onBuildReference).not.toHaveBeenCalled();
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

  it("inserts a handwritten note as a visual project reference", async () => {
    const onBuildReference = vi.fn();
    const onBuildHandwrittenReference = vi.fn().mockResolvedValue({
      markdown: "![Boceto](assets/handwritten/boceto-page-1.png)",
      asset: { ...asset, id: "handwritten-render-1", name: "boceto-page-1.png", path: "assets/handwritten/boceto-page-1.png" },
      noteId: "note-1",
      pageId: "page-1",
    });
    const onInsert = vi.fn();

    renderDialog({ onBuildReference, onBuildHandwrittenReference, onInsert });

    fireEvent.change(screen.getByPlaceholderText("Buscar imagen o nota"), {
      target: { value: "boceto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Boceto.knote" }));
    fireEvent.click(screen.getByRole("button", { name: "Insertar" }));

    await waitFor(() => expect(onBuildHandwrittenReference).toHaveBeenCalledWith("doc-1", "note-1", "Boceto"));
    expect(onBuildReference).not.toHaveBeenCalled();
    expect(onInsert).toHaveBeenCalledWith("![Boceto](assets/handwritten/boceto-page-1.png)");
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
        id: "note-1",
        name: "Boceto.knote",
        type: "handwritten-note",
        path: "docs/Boceto.knote",
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
