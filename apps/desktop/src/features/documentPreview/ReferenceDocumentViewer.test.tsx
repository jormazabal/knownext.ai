import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import {previewReadingMemory} from "./previewReadingMemory";
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
let resizeCallbacks: Map<Element, (width:number,height:number)=>void>;

describe("ReferenceDocumentViewer", () => {
  beforeEach(() => {
    previewReadingMemory.clear();
    resizeCallbacks=new Map();
    vi.stubGlobal("ResizeObserver",class {
      constructor(private callback:(entries:Array<{contentRect:{width:number;height:number}}>)=>void){}
      observe(element:Element){
        const resize=(width:number,height:number)=>this.callback([{contentRect:{width,height}}]);
        resizeCallbacks.set(element,resize);resize(800,900);
      }
      disconnect(){}
    });
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

  it("restores XLSX query, sheet and scroll after A/B/A and invalidates changed source",async()=>{
    createDocumentPreviewMock.mockImplementation(async (_p,{path})=>({...workbookPreview,path}));
    getDocumentPreviewTextMock.mockResolvedValue({previewId:"preview-1",text:"Cliente",searchable:true,warnings:[]});
    getSpreadsheetSheetMock.mockImplementation(async (_p,_v,id)=>id==="sheet-2"?secondSheet:firstSheet);
    const {rerender}=render(<ReferenceDocumentViewer project={project} tab={xlsxTab}/>);
    await screen.findByText("Cliente A");fireEvent.change(screen.getByLabelText("Buscar en documento"),{target:{value:"Riesgo"}});
    fireEvent.change(screen.getByLabelText("Seleccionar hoja"),{target:{value:"sheet-2"}});await screen.findByText("Riesgo alto");
    const surface=screen.getByTestId("spreadsheet-scroll-surface");surface.scrollTop=280;surface.scrollLeft=150;fireEvent.scroll(surface);
    rerender(<ReferenceDocumentViewer project={project} tab={{...xlsxTab,id:"b",path:"Other.xlsx"}}/>);await screen.findByText("Cliente A");expect(screen.getByLabelText("Buscar en documento")).toHaveValue("");
    rerender(<ReferenceDocumentViewer project={project} tab={xlsxTab}/>);await screen.findByText("Riesgo alto");expect(screen.getByLabelText("Buscar en documento")).toHaveValue("Riesgo");expect(screen.getByLabelText("Seleccionar hoja")).toHaveValue("sheet-2");expect(screen.getByTestId("spreadsheet-scroll-surface").scrollTop).toBe(280);expect(screen.getByTestId("spreadsheet-scroll-surface").scrollLeft).toBe(150);
    refreshDocumentPreviewMock.mockResolvedValue({...workbookPreview,sourceFingerprint:{...workbookPreview.sourceFingerprint,sha256:"changed"}});fireEvent.click(screen.getByLabelText("Actualizar vista"));await screen.findByText("Cliente A");expect(screen.getByLabelText("Buscar en documento")).toHaveValue("");expect(screen.getByLabelText("Seleccionar hoja")).toHaveValue("sheet-1");expect(screen.getByTestId("spreadsheet-scroll-surface").scrollTop).toBe(0);
  });
  it("resets reading state for another project location even with the same IDs",async()=>{
    createDocumentPreviewMock.mockResolvedValue(workbookPreview);getDocumentPreviewTextMock.mockResolvedValue({previewId:"preview-1",text:"Cliente",searchable:true,warnings:[]});getSpreadsheetSheetMock.mockResolvedValue(firstSheet);
    const {rerender}=render(<ReferenceDocumentViewer project={project} tab={xlsxTab}/>);await screen.findByText("Cliente A");fireEvent.change(screen.getByLabelText("Buscar en documento"),{target:{value:"private query"}});
    rerender(<ReferenceDocumentViewer project={{...project,folderPath:"C:/another-root"}} tab={xlsxTab}/>);await screen.findByText("Cliente A");expect(screen.getByLabelText("Buscar en documento")).toHaveValue("");expect(createDocumentPreviewMock).toHaveBeenCalledTimes(2);
  });
  it("shows preparation while the PDF representation URL is pending and reports a real rejection",async()=>{
    let reject!:(cause:Error)=>void;
    createDocumentPreviewMock.mockResolvedValue(pdfPreview);
    getDocumentPreviewTextMock.mockResolvedValue({previewId:"preview-pdf",text:"",searchable:true,warnings:[]});
    getDocumentPreviewPdfUrlMock.mockImplementation(()=>new Promise((_,fail)=>{reject=fail;}));
    render(<ReferenceDocumentViewer project={project} tab={pdfTab}/>);
    await screen.findByText("Preparando vista");expect(screen.queryByText("Vista de páginas no disponible")).not.toBeInTheDocument();
    await waitFor(()=>expect(getDocumentPreviewPdfUrlMock).toHaveBeenCalledTimes(1));
    await act(async()=>reject(new Error("Permiso temporal denegado")));
    await screen.findByText(/Permiso temporal denegado/);expect(screen.queryByText("Preparando vista")).not.toBeInTheDocument();
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

    expect(await screen.findByRole("combobox",{name:"Seleccionar hoja"})).toHaveValue("sheet-1");
    expect(await screen.findByText("Cliente A")).toBeInTheDocument();
    expect(screen.getByText("1200")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Buscar en documento"), { target: { value: "cliente" } });
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Seleccionar hoja"),{target:{value:"sheet-2"}});

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

  it("reports PDF content failures without an unhandled rejection", async () => {
    createDocumentPreviewMock.mockResolvedValue(pdfPreview);
    getDocumentPreviewTextMock.mockResolvedValue({previewId:"preview-pdf",text:"",searchable:true,warnings:[]});
    getDocumentPreviewPdfUrlMock.mockRejectedValue(new Error("El recibo PDF no pertenece al proyecto"));
    render(<ReferenceDocumentViewer project={project} tab={pdfTab}/>);
    expect(await screen.findByText("El recibo PDF no pertenece al proyecto")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox",{name:"Buscar en documento"}),{target:{value:"consulta"}});
    expect(screen.getByLabelText("Coincidencias")).toHaveTextContent("?");
  });

  it("shows the useful native string rejection and lets it be retried", async () => {
    createDocumentPreviewMock.mockRejectedValue("No se pudo guardar la vista; el original se conserva");
    render(<ReferenceDocumentViewer project={project} tab={pdfTab}/>);
    expect(await screen.findByText("No se pudo guardar la vista; el original se conserva")).toBeVisible();
    expect(screen.getByRole("button",{name:"Reintentar"})).toBeEnabled();
  });

  it("retries creation after its initial failure instead of requiring a missing receipt", async () => {
    createDocumentPreviewMock.mockRejectedValueOnce(new Error("No se puede crear la vista local")).mockResolvedValue(workbookPreview);
    getDocumentPreviewTextMock.mockResolvedValue({previewId:"preview-1",text:"",searchable:true,warnings:[]});
    getSpreadsheetSheetMock.mockResolvedValue(firstSheet);
    render(<ReferenceDocumentViewer project={project} tab={xlsxTab}/>);
    await screen.findByText("No se puede crear la vista local");
    fireEvent.click(screen.getByRole("button",{name:"Reintentar"}));
    expect(await screen.findByText("Cliente A")).toBeVisible();
    expect(createDocumentPreviewMock).toHaveBeenCalledTimes(2);
    expect(refreshDocumentPreviewMock).not.toHaveBeenCalled();
  });

  it("keeps the current sheet visible when opening externally fails", async () => {
    createDocumentPreviewMock.mockResolvedValue(workbookPreview);
    getDocumentPreviewTextMock.mockResolvedValue({previewId:"preview-1",text:"",searchable:true,warnings:[]});
    getSpreadsheetSheetMock.mockResolvedValue(firstSheet);
    openDocumentPreviewExternalMock.mockRejectedValue(new Error("No hay aplicación externa disponible"));
    render(<ReferenceDocumentViewer project={project} tab={xlsxTab}/>);
    await screen.findByText("Cliente A");
    fireEvent.click(screen.getByLabelText("Abrir externo"));
    expect(await screen.findByRole("alert")).toHaveTextContent("No hay aplicación externa disponible");
    expect(screen.getByText("Cliente A")).toBeVisible();
  });

  it("ignores an old refresh after A to B to A and avoids duplicate refreshes", async () => {
    let resolveOld!: (preview:DocumentPreview)=>void;
    const pending = new Promise<DocumentPreview>(resolve=>{resolveOld=resolve;});
    createDocumentPreviewMock.mockImplementation(async (id)=>({...workbookPreview,projectId:id}));
    refreshDocumentPreviewMock.mockReturnValue(pending);
    getDocumentPreviewTextMock.mockResolvedValue({previewId:"preview-1",text:"",searchable:true,warnings:[]});
    getSpreadsheetSheetMock.mockResolvedValue(firstSheet);
    const {rerender}=render(<ReferenceDocumentViewer project={project} tab={xlsxTab}/>);
    await screen.findByText("Cliente A");
    fireEvent.click(screen.getByLabelText("Actualizar vista"));
    fireEvent.click(screen.getByLabelText("Actualizar vista"));
    expect(refreshDocumentPreviewMock).toHaveBeenCalledTimes(1);
    rerender(<ReferenceDocumentViewer project={{...project,id:"project-2"}} tab={xlsxTab}/>);
    await waitFor(()=>expect(createDocumentPreviewMock).toHaveBeenCalledTimes(2));
    rerender(<ReferenceDocumentViewer project={project} tab={xlsxTab}/>);
    await waitFor(()=>expect(createDocumentPreviewMock).toHaveBeenCalledTimes(3));
    await screen.findByText("Cliente A");
    resolveOld({...workbookPreview,status:"error",error:"obsolete response"});
    await waitFor(()=>expect(screen.queryByText("obsolete response")).not.toBeInTheDocument());
    expect(screen.getByText("Cliente A")).toBeVisible();
  });

  it("opens a PDF reference as a paginated local preview with text search and page controls", async () => {
    const canvasContext = { setTransform: vi.fn() } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
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
      destroy: vi.fn().mockResolvedValue(undefined),
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
    expect(await screen.findByText("2")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Página siguiente"));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Reducir zoom"));
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("measures during deferred PDF loading and uses real page count and resized panel dimensions", async () => {
    vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({} as CanvasRenderingContext2D);
    Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{configurable:true,value:vi.fn()});
    vi.stubGlobal("IntersectionObserver",class {observe(){}disconnect(){}});
    let complete!: (pdf:unknown)=>void;
    const promise=new Promise(resolve=>{complete=resolve;});
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({promise,destroy:vi.fn().mockResolvedValue(undefined)} as unknown as ReturnType<typeof pdfjsLib.getDocument>);
    createDocumentPreviewMock.mockResolvedValue({...pdfPreview,pageCount:1});
    getDocumentPreviewTextMock.mockResolvedValue({previewId:"preview-pdf",text:"",searchable:true,warnings:[]});
    getDocumentPreviewPdfUrlMock.mockResolvedValue("data:application/pdf;base64,AA==");
    const {container}=render(<ReferenceDocumentViewer project={project} tab={pdfTab}/>);
    const surface=await screen.findByTestId("pdf-scroll-surface");
    expect(resizeCallbacks.has(surface)).toBe(true);
    act(()=>resizeCallbacks.get(surface)?.(280,500));
    expect(screen.getByRole("button",{name:"Página siguiente"})).toBeDisabled();
    await act(async()=>complete({numPages:3,getPage:vi.fn().mockResolvedValue({getViewport:({scale}:{scale:number})=>({width:600*scale,height:800*scale}),render:()=>({cancel:vi.fn(),promise:Promise.resolve()}),getTextContent:async()=>({items:[]})})}));
    expect(await screen.findByText("1 / 3")).toBeVisible();
    await waitFor(()=>expect(container.querySelector('canvas')?.style.width).toBe("280px"));
    fireEvent.click(screen.getByRole("button",{name:"Página siguiente"}));
    expect(screen.getByText("2 / 3")).toBeVisible();
    act(()=>resizeCallbacks.get(surface)?.(200,340));
    await waitFor(()=>expect(container.querySelector('canvas')?.style.width).toBe("200px"));
    fireEvent.click(screen.getByRole("button",{name:"Ajustar página"}));
    act(()=>resizeCallbacks.get(surface)?.(600,300));
    await waitFor(()=>expect(parseFloat(container.querySelector('canvas')?.style.height ?? "1000")).toBeLessThanOrEqual(276));
  });

  it("restores PDF page, zoom and query across A/B/A while a new page-focus request takes priority",async()=>{
    vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({} as CanvasRenderingContext2D);
    Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{configurable:true,value:vi.fn()});
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({promise:Promise.resolve({numPages:3,getPage:vi.fn().mockResolvedValue({getViewport:({scale}:{scale:number})=>({width:600*scale,height:800*scale}),render:()=>({cancel:vi.fn(),promise:Promise.resolve()}),getTextContent:async()=>({items:[]})})}),destroy:vi.fn().mockResolvedValue(undefined)} as unknown as ReturnType<typeof pdfjsLib.getDocument>);
    createDocumentPreviewMock.mockImplementation(async(_p,{path})=>({...pdfPreview,path}));getDocumentPreviewPdfUrlMock.mockResolvedValue("data:application/pdf;base64,AA==");getDocumentPreviewTextMock.mockResolvedValue({previewId:"preview-pdf",text:"",searchable:true,warnings:[]});
    const original={...pdfTab,pageFocus:{pageNumber:2,requestId:1}};
    const {rerender}=render(<ReferenceDocumentViewer project={project} tab={original}/>);await screen.findByText("2 / 3");
    fireEvent.click(screen.getByLabelText("Página siguiente"));fireEvent.click(screen.getByLabelText("Reducir zoom"));fireEvent.change(screen.getByLabelText("Buscar en documento"),{target:{value:"clause"}});expect(screen.getByText("3 / 3")).toBeVisible();
    rerender(<ReferenceDocumentViewer project={project} tab={{...pdfTab,id:"b",path:"B.pdf"}}/>);await screen.findByText("1 / 3");expect(screen.getByLabelText("Buscar en documento")).toHaveValue("");
    rerender(<ReferenceDocumentViewer project={project} tab={original}/>);await screen.findByText("3 / 3");expect(screen.getByLabelText("Buscar en documento")).toHaveValue("clause");expect(screen.getByText("90%")).toBeVisible();
    rerender(<ReferenceDocumentViewer project={project} tab={{...original,pageFocus:{pageNumber:1,requestId:2}}}/>);await screen.findByText("1 / 3");expect(screen.getByLabelText("Buscar en documento")).toHaveValue("clause");
  });
  it("applies a PDF page focus after loading and navigates an already open PDF on a new request",async()=>{
    vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({} as CanvasRenderingContext2D);
    Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{configurable:true,value:vi.fn()});vi.stubGlobal("IntersectionObserver",class{observe(){}disconnect(){}});
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({promise:Promise.resolve({numPages:3,getPage:vi.fn().mockResolvedValue({getViewport:({scale}:{scale:number})=>({width:600*scale,height:800*scale}),render:()=>({cancel:vi.fn(),promise:Promise.resolve()}),getTextContent:async()=>({items:[]})})}),destroy:vi.fn().mockResolvedValue(undefined)} as unknown as ReturnType<typeof pdfjsLib.getDocument>);
    createDocumentPreviewMock.mockResolvedValue(pdfPreview);getDocumentPreviewPdfUrlMock.mockResolvedValue("data:application/pdf;base64,AA==");getDocumentPreviewTextMock.mockResolvedValue({previewId:"preview-pdf",text:"",searchable:true,warnings:[]});
    const {rerender}=render(<ReferenceDocumentViewer project={project} tab={{...pdfTab,pageFocus:{pageNumber:2,requestId:1}}}/>);
    expect(await screen.findByText("2 / 3")).toBeVisible();
    fireEvent.click(screen.getByRole("button",{name:"Página siguiente"}));expect(screen.getByText("3 / 3")).toBeVisible();
    rerender(<ReferenceDocumentViewer project={project} tab={{...pdfTab,pageFocus:{pageNumber:2,requestId:2}}}/>);await waitFor(()=>expect(screen.getByText("2 / 3")).toBeVisible());
    rerender(<ReferenceDocumentViewer project={project} tab={{...pdfTab,pageFocus:{pageNumber:99,requestId:3}}}/>);await waitFor(()=>expect(screen.getByText("3 / 3")).toBeVisible());
    expect(createDocumentPreviewMock).toHaveBeenCalledTimes(1);
  });
  it("waits for preceding page dimensions before restoring the current page after resize", async () => {
    const frames=new Map<number,FrameRequestCallback>();let frameId=0;
    vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{frames.set(++frameId,callback);return frameId;});
    vi.stubGlobal("cancelAnimationFrame",(id:number)=>frames.delete(id));
    const flush=()=>act(()=>{const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(0));});
    const scroll=vi.fn();Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{configurable:true,value:scroll});
    vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({} as CanvasRenderingContext2D);
    const page={getViewport:({scale}:{scale:number})=>({width:600*scale,height:800*scale}),render:()=>({cancel:vi.fn(),promise:Promise.resolve()}),getTextContent:async()=>({items:[]})};
    let hold=false;const pending=new Map<number,(value:typeof page)=>void>();
    const getPage=vi.fn((number:number)=>hold ? new Promise(resolve=>pending.set(number,resolve)) : Promise.resolve(page));
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({promise:Promise.resolve({numPages:3,getPage}),destroy:vi.fn().mockResolvedValue(undefined)} as unknown as ReturnType<typeof pdfjsLib.getDocument>);
    createDocumentPreviewMock.mockResolvedValue(pdfPreview);
    getDocumentPreviewTextMock.mockResolvedValue({previewId:"preview-pdf",text:"",searchable:true,warnings:[]});
    getDocumentPreviewPdfUrlMock.mockResolvedValue("data:application/pdf;base64,AA==");
    const {container}=render(<ReferenceDocumentViewer project={project} tab={pdfTab}/>);
    await screen.findByText("1 / 3");
    await waitFor(()=>expect(container.querySelector('canvas')?.style.width).toBe("800px"));
    fireEvent.click(screen.getByRole("button",{name:"Página siguiente"}));flush();flush();
    expect(screen.getByText("2 / 3")).toBeVisible();
    scroll.mockClear();hold=true;
    act(()=>resizeCallbacks.get(screen.getByTestId("pdf-scroll-surface"))?.(240,500));
    flush();flush();
    expect(scroll).not.toHaveBeenCalled();
    await act(async()=>pending.get(2)?.(page));flush();flush();
    expect(scroll).not.toHaveBeenCalled();
    await act(async()=>pending.get(1)?.(page));flush();flush();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.instances[0]).toHaveAttribute("data-pdf-page","2");
    expect(container.querySelector('canvas')?.style.width).toBe("240px");
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
