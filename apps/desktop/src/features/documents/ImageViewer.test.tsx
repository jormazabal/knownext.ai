import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageViewer } from "./ImageViewer";
import { getProjectImageContentDataUrl, getProjectImageUsage } from "../../lib/api/projects";
import type { AssetMetadata, AssetReference, AssetUsageResponse, Project } from "../../types/domain";

vi.mock("../../lib/api/projects", () => ({
  getProjectImageContentDataUrl: vi.fn(),
  getProjectImageUsage: vi.fn(),
}));

describe("ImageViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
      configurable: true,
      value: 450,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads image content, exposes metadata, copies Markdown reference and opens usages", async () => {
    const onAddToAiContext = vi.fn();
    const onInsertIntoActiveDocument = vi.fn();
    const onAssetMetadataChange = vi.fn();
    const onOpenReference = vi.fn();
    vi.mocked(getProjectImageUsage).mockResolvedValue(imageUsage);
    vi.mocked(getProjectImageContentDataUrl).mockResolvedValue("data:image/png;base64,abc");

    render(
      <ImageViewer
        project={project}
        assetId="asset-1"
        name="Diagrama.png"
        path="assets/Diagrama.png"
        zoomPercent={100}
        fitToWindow
        onAddToAiContext={onAddToAiContext}
        onInsertIntoActiveDocument={onInsertIntoActiveDocument}
        onAssetMetadataChange={onAssetMetadataChange}
        onOpenReference={onOpenReference}
      />,
    );

    expect(screen.getByText("Cargando imagen.")).toBeInTheDocument();
    const image = await screen.findByAltText("Diagrama.png");
    fireEvent.load(image);

    await waitFor(() => expect(onAssetMetadataChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: "asset-1", width: 640, height: 360 })));
    expect(image).toHaveAttribute("src", "data:image/png;base64,abc");
    expect(screen.getByText("assets/Diagrama.png")).toBeInTheDocument();
    expect(screen.getByText("640 x 360 px")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("+1 referencia(s) más")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Contexto IA" }));
    fireEvent.click(screen.getByRole("button", { name: "Insertar" }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir Notas.md/ }));
    fireEvent.click(screen.getByRole("button", { name: "Copiar referencia" }));

    expect(onAddToAiContext).toHaveBeenCalledWith("asset-1");
    expect(onInsertIntoActiveDocument).toHaveBeenCalledWith("asset-1");
    expect(onOpenReference).toHaveBeenCalledWith("doc-1", "Notas.md");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("![Diagrama](assets/Diagrama.png)");
    await waitFor(() => expect(screen.getByRole("button", { name: /Referencia copiada/ })).toBeInTheDocument());
  });

  it("shows runtime errors without offering stale image content", async () => {
    vi.mocked(getProjectImageUsage).mockRejectedValue(new Error("No se pudo cargar el adjunto."));
    vi.mocked(getProjectImageContentDataUrl).mockRejectedValue(new Error("No se pudo cargar el adjunto."));

    render(<ImageViewer project={project} assetId="asset-1" name="Diagrama.png" path="assets/Diagrama.png" zoomPercent={100} fitToWindow />);

    expect(await screen.findByText("No se pudo cargar el adjunto.")).toBeInTheDocument();
    expect(screen.queryByAltText("Diagrama.png")).not.toBeInTheDocument();
  });
});

const project: Project = {
  id: "project-1",
  name: "Proyecto",
  folderPath: "C:\\Docs\\Proyecto",
  icon: "docs",
  iconColor: "#F37021",
  storageMode: "local-files",
  versioningMode: "local-git",
  syncMode: "manual-local",
  authRequired: false,
  githubRepository: null,
  isGitRepository: true,
};

const asset: AssetMetadata = {
  id: "asset-1",
  projectId: "project-1",
  name: "Diagrama.png",
  path: "assets/Diagrama.png",
  mimeType: "image/png",
  sizeBytes: 12_345,
  width: 640,
  height: 360,
  colorDepthBits: 24,
  updatedAt: "2026-06-04T10:00:00.000Z",
  usageCount: 4,
  indexed: true,
  indexStatus: "indexed",
  visualDescription: "Diagrama de arquitectura",
};

const references: AssetReference[] = [
  {
    id: "ref-1",
    projectId: "project-1",
    documentId: "doc-1",
    documentName: "Notas.md",
    documentPath: "Notas.md",
    rawTarget: "assets/Diagrama.png",
    resolvedAssetPath: "assets/Diagrama.png",
    kind: "image",
    status: "valid",
    altText: "Diagrama",
    title: null,
    line: 12,
    column: 1,
  },
  {
    id: "ref-2",
    projectId: "project-1",
    documentId: "doc-2",
    documentName: "Arquitectura.md",
    documentPath: "Arquitectura.md",
    rawTarget: "assets/Diagrama.png",
    resolvedAssetPath: "assets/Diagrama.png",
    kind: "image",
    status: "valid",
    altText: "Diagrama",
    title: null,
    line: 20,
    column: 1,
  },
  {
    id: "ref-3",
    projectId: "project-1",
    documentId: "doc-3",
    documentName: "Release.md",
    documentPath: "Release.md",
    rawTarget: "assets/Diagrama.png",
    resolvedAssetPath: "assets/Diagrama.png",
    kind: "image",
    status: "valid",
    altText: "Diagrama",
    title: null,
    line: 4,
    column: 1,
  },
  {
    id: "ref-4",
    projectId: "project-1",
    documentId: "doc-4",
    documentName: "Oculto.md",
    documentPath: "Oculto.md",
    rawTarget: "assets/Diagrama.png",
    resolvedAssetPath: "assets/Diagrama.png",
    kind: "image",
    status: "valid",
    altText: "Diagrama",
    title: null,
    line: 8,
    column: 1,
  },
];

const imageUsage: AssetUsageResponse = {
  asset,
  references,
};
