import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  createDocumentPreview,
  getDocumentPreviewPdfUrl,
  getDocumentPreviewText,
  getSpreadsheetSheet,
  openDocumentPreviewExternal,
  refreshDocumentPreview,
} from "../../lib/api/documentPreviews";
import { ReferenceDocumentViewer } from "./ReferenceDocumentViewer";
import type { DocumentPreview, Project, ReferenceDocumentWorkspaceTab, SpreadsheetSheetResponse } from "../../types/domain";

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
}));

vi.mock("pdfjs-dist/legacy/build/pdf.worker.mjs?url", () => ({
  default: "pdf.worker.js",
}));

vi.mock("../../lib/api/documentPreviews", () => ({
  createDocumentPreview: vi.fn(),
  getDocumentPreviewPdfUrl: vi.fn(),
  getDocumentPreviewText: vi.fn(),
  getSpreadsheetSheet: vi.fn(),
  openDocumentPreviewExternal: vi.fn(),
  refreshDocumentPreview: vi.fn(),
}));

const createDocumentPreviewMock = vi.mocked(createDocumentPreview);
const getDocumentPreviewPdfUrlMock = vi.mocked(getDocumentPreviewPdfUrl);
const getDocumentPreviewTextMock = vi.mocked(getDocumentPreviewText);
const getSpreadsheetSheetMock = vi.mocked(getSpreadsheetSheet);
const openDocumentPreviewExternalMock = vi.mocked(openDocumentPreviewExternal);
const refreshDocumentPreviewMock = vi.mocked(refreshDocumentPreview);

describe("ReferenceDocumentViewer", () => {
  beforeEach(() => {
    createDocumentPreviewMock.mockReset();
    getDocumentPreviewPdfUrlMock.mockReset();
    getDocumentPreviewTextMock.mockReset();
    getSpreadsheetSheetMock.mockReset();
    openDocumentPreviewExternalMock.mockReset();
    refreshDocumentPreviewMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  it("opens an XLSX reference as a local spreadsheet preview with sheet switching and search", async () => {
    createDocumentPreviewMock.mockResolvedValue(workbookPreview);
    getDocumentPreviewTextMock.mockResolvedValue({
      previewId: "preview-1",
      text: "Cliente Importe Pendiente",
      searchable: true,
      warnings: [],
    });
    getSpreadsheetSheetMock.mockImplementation(async (_projectId, _previewId, sheetId) => {
      return sheetId === "sheet-2" ? secondSheet : firstSheet;
    });

    render(<ReferenceDocumentViewer project={project} tab={xlsxTab} />);

    expect(await screen.findByText("Presupuesto")).toBeInTheDocument();
    expect(await screen.findByText("Cliente A")).toBeInTheDocument();
    expect(screen.getByText("1200")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Buscar en documento"), { target: { value: "cliente" } });
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText("Seleccionar hoja"));
    fireEvent.click(await screen.findByText("Riesgos"));

    await waitFor(() => {
      expect(getSpreadsheetSheetMock).toHaveBeenLastCalledWith("project-1", "preview-1", "sheet-2");
      expect(screen.getByText("Riesgo alto")).toBeInTheDocument();
    });
  });

  it("refreshes and opens the prepared reference through runtime commands", async () => {
    createDocumentPreviewMock.mockResolvedValue(workbookPreview);
    refreshDocumentPreviewMock.mockResolvedValue(workbookPreview);
    getDocumentPreviewTextMock.mockResolvedValue({ previewId: "preview-1", text: "", searchable: true, warnings: [] });
    getSpreadsheetSheetMock.mockResolvedValue(firstSheet);

    render(<ReferenceDocumentViewer project={project} tab={xlsxTab} />);

    await screen.findByText("Cliente A");
    fireEvent.click(screen.getByLabelText("Actualizar vista"));
    fireEvent.click(screen.getByLabelText("Abrir externo"));

    await waitFor(() => {
      expect(refreshDocumentPreviewMock).toHaveBeenCalledWith("project-1", "preview-1");
      expect(openDocumentPreviewExternalMock).toHaveBeenCalledWith("project-1", "preview-1");
    });
  });

  it("opens a PDF reference as a paginated local preview with text search and page controls", async () => {
    const canvasContext = { setTransform: vi.fn() } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      disconnect() {}
    });
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn().mockResolvedValue({
          getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
          render: vi.fn(() => ({ cancel: vi.fn(), promise: Promise.resolve() })),
          getTextContent: vi.fn().mockResolvedValue({
            items: [{ str: "Contrato cliente", width: 120, height: 12, transform: [1, 0, 0, 1, 24, 48] }],
          }),
        }),
      }),
      destroy: vi.fn(),
    } as unknown as ReturnType<typeof pdfjsLib.getDocument>);
    createDocumentPreviewMock.mockResolvedValue(pdfPreview);
    getDocumentPreviewTextMock.mockResolvedValue({
      previewId: "preview-pdf",
      text: "Contrato cliente\nAnexo cliente",
      searchable: true,
      warnings: [],
    });
    getDocumentPreviewPdfUrlMock.mockResolvedValue("data:application/pdf;base64,AA==");

    render(<ReferenceDocumentViewer project={project} tab={pdfTab} />);

    expect(await screen.findByText("Página 1")).toBeInTheDocument();
    expect(screen.getByText("Página 2")).toBeInTheDocument();
    expect(getDocumentPreviewPdfUrlMock).toHaveBeenCalledWith("project-1", "preview-pdf");
    expect(pdfjsLib.getDocument).toHaveBeenCalledWith({ url: "data:application/pdf;base64,AA==" });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Buscar en documento"), { target: { value: "cliente" } });
    expect(screen.getByText("2")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Página siguiente"));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Reducir zoom"));
    expect(screen.getByText("90%")).toBeInTheDocument();
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

const xlsxTab: ReferenceDocumentWorkspaceTab = {
  kind: "reference-document",
  id: "ref-1",
  name: "Presupuesto.xlsx",
  path: "Presupuesto.xlsx",
  format: "xlsx",
  readonly: true,
};

const pdfTab: ReferenceDocumentWorkspaceTab = {
  kind: "reference-document",
  id: "ref-pdf",
  name: "Contrato.pdf",
  path: "Contrato.pdf",
  format: "pdf",
  readonly: true,
};

const workbookPreview: DocumentPreview = {
  id: "preview-1",
  projectId: "project-1",
  path: "Presupuesto.xlsx",
  name: "Presupuesto.xlsx",
  format: "xlsx",
  status: "ready",
  readonly: true,
  sourceFingerprint: { sha256: "hash", size: 1024, mtimeNs: 1 },
  availableRenditions: ["text", "workbook"],
  sheets: [
    { id: "sheet-1", name: "Presupuesto", rowCount: 2, columnCount: 2, hidden: false },
    { id: "sheet-2", name: "Riesgos", rowCount: 1, columnCount: 1, hidden: false },
  ],
  warnings: [],
  generatedAt: "2026-06-04T10:00:00.000Z",
};

const pdfPreview: DocumentPreview = {
  id: "preview-pdf",
  projectId: "project-1",
  path: "Contrato.pdf",
  name: "Contrato.pdf",
  format: "pdf",
  status: "ready",
  readonly: true,
  sourceFingerprint: { sha256: "hash-pdf", size: 2048, mtimeNs: 2 },
  availableRenditions: ["text", "pdf"],
  pageCount: 2,
  warnings: [],
  generatedAt: "2026-06-04T10:00:00.000Z",
};

const firstSheet: SpreadsheetSheetResponse = {
  previewId: "preview-1",
  sheetId: "sheet-1",
  name: "Presupuesto",
  rowCount: 2,
  columnCount: 2,
  warnings: [],
  cells: [
    { row: 1, column: 1, address: "A1", displayValue: "Cliente A" },
    { row: 1, column: 2, address: "B1", displayValue: "1200" },
  ],
};

const secondSheet: SpreadsheetSheetResponse = {
  previewId: "preview-1",
  sheetId: "sheet-2",
  name: "Riesgos",
  rowCount: 1,
  columnCount: 1,
  warnings: [],
  cells: [{ row: 1, column: 1, address: "A1", displayValue: "Riesgo alto" }],
};
