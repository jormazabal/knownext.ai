import { AlertTriangle } from "lucide-react";
import { Fragment,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState } from "react";
import type {DocumentPreview,DocumentPreviewTextResponse,Project,ReferenceDocumentWorkspaceTab,SpreadsheetSheetResponse} from "../../types/domain";
import {createDocumentPreview,getDocumentPreviewPdfUrl,getDocumentPreviewText,getSpreadsheetSheet,openDocumentPreviewExternal,refreshDocumentPreview} from "../../lib/api/documentPreviews";
import {DocumentPreviewToolbar} from "./DocumentPreviewToolbar";
import {createDeferredView} from "../../components/ui/createDeferredView";
import type {PdfPreviewSurfaceProps} from "./PdfPreviewSurface";
import {PreviewStatusState} from "./PreviewStatusState";
import {emptyPreviewReadingState,previewReadingMemory,previewReadingScope,previewSourceRevision} from "./previewReadingMemory";
import type {PdfReadingPosition,SheetReadingPosition} from "./previewReadingMemory";
import {previewErrorMessage} from "./previewErrorMessage";
const PdfPreviewSurface=createDeferredView<PdfPreviewSurfaceProps>(()=>import("./PdfPreviewSurface").then(module=>({default:module.PdfPreviewSurface})),"Preparando visor PDF…","No se pudo cargar el visor PDF. El original se conserva.");

type ReferenceDocumentViewerProps = {
  project: Project;
  tab: ReferenceDocumentWorkspaceTab;
};

export function ReferenceDocumentViewer(props: ReferenceDocumentViewerProps) {
  const scope=previewReadingScope(props.project,props.tab);
  return <ReferenceDocumentViewerSession key={scope} {...props} scope={scope}/>;
}
function ReferenceDocumentViewerSession({ project, tab, scope }: ReferenceDocumentViewerProps & {scope:string}) {
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [textPreview, setTextPreview] = useState<DocumentPreviewTextResponse | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [sheet, setSheet] = useState<SpreadsheetSheetResponse | null>(null);
  const [activeSheetId, setActiveSheetId] = useState("");
  const [query, setQuery] = useState("");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [fitMode, setFitMode] = useState<"width" | "page" | null>("width");
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfPosition,setPdfPosition]=useState<PdfReadingPosition|null>(null);
  const [sheetPositions,setSheetPositions]=useState<Record<string,SheetReadingPosition>>({});
  const [lastPageFocus,setLastPageFocus]=useState<string|null>(null);
  const sourceRevision=preview?previewSourceRevision(preview.sourceFingerprint):null;
  const latestSource=useRef(sourceRevision);latestSource.current=sourceRevision;
  const [pdfPageCount, setPdfPageCount] = useState<number|null>(null);
  const [pdfSearchCount,setPdfSearchCount] = useState<number|null>(null);
  const [pageNavigationSequence,setPageNavigationSequence] = useState(0);
  const handlePdfPageCount=useCallback((count:number|null)=>{
    setPdfPageCount(count);
    if(count!==null)setPageNumber(current=>Math.max(1,Math.min(current,count)));
  },[]);
  const [openingExternal, setOpeningExternal] = useState(false);
  const externalInFlight = useRef(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const epoch = useRef(0);
  const refreshing = useRef(false);

  useLayoutEffect(()=>{
    const state={query,zoomPercent,fitMode,pageNumber,pdfPosition,activeSheetId,sheetPositions,lastPageFocus};
    if(preview?.status==="ready")previewReadingMemory.write(scope,sourceRevision,state);
  },[scope,sourceRevision,preview?.status,query,zoomPercent,fitMode,pageNumber,pdfPosition,activeSheetId,sheetPositions,lastPageFocus]);
  function acceptPreview(next:DocumentPreview) {
    const revision=previewSourceRevision(next.sourceFingerprint);
    const saved=next.status==="ready"?previewReadingMemory.read(scope,revision):null;
    if(next.status!=="ready")previewReadingMemory.forget(scope);
    const state=saved??emptyPreviewReadingState();
    setQuery(state.query);setZoomPercent(state.zoomPercent);setFitMode(state.fitMode);
    setPageNumber(state.pageNumber);setPdfPosition(state.pdfPosition);setLastPageFocus(state.lastPageFocus);
    setSheetPositions(state.sheetPositions);
    setActiveSheetId(next.sheets?.some(s=>s.id===state.activeSheetId)?state.activeSheetId:next.sheets?.[0]?.id??"");
    setPreview(next);
  }
  useEffect(() => {
    ++epoch.current;
    refreshing.current = true;
    let cancelled = false;
    setBusy(true);
    setError(null);
    setOperationError(null);
    setPageNumber(1);
    setPdfPageCount(null);
    setPdfSearchCount(null);
    setOpeningExternal(false);
    externalInFlight.current = false;
    setPreview(null);
    setTextPreview(null);
    setPdfUrl("");
    setSheet(null);
    setActiveSheetId("");
    createDocumentPreview(project.id, { path: tab.path, preferredMode: tab.format === "xlsx" ? "spreadsheet" : "document" })
      .then((nextPreview) => {
        if (cancelled) return;
        acceptPreview(nextPreview);
      })
      .catch((requestError) => {
        if (!cancelled) setError(previewErrorMessage(requestError,"No se pudo preparar la vista."));
      })
      .finally(() => {
        if (!cancelled) {
          refreshing.current = false;
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
      ++epoch.current;
    };
  }, [project.id, project.folderPath, tab.id, tab.format, tab.path]);

  useEffect(()=>{
    if(!preview||busy||preview.status!=="ready"||tab.format!=="pdf"||!tab.pageFocus||!Number.isSafeInteger(tab.pageFocus.pageNumber)||tab.pageFocus.pageNumber<1)return;
    const token=JSON.stringify([tab.pageFocus.requestId,tab.pageFocus.pageNumber]);
    if(lastPageFocus===token)return;
    const page=Math.max(1,Math.min(tab.pageFocus.pageNumber,pdfPageCount??tab.pageFocus.pageNumber));
    setPageNumber(page);setPdfPosition({pageNumber:page,offsetRatio:0,horizontalRatio:0});
    setLastPageFocus(token);setPageNavigationSequence(sequence=>sequence+1);
  },[preview,busy,tab.format,tab.pageFocus?.requestId,tab.pageFocus?.pageNumber,pdfPageCount,lastPageFocus]);

  useEffect(() => {
    if (!preview || preview.projectId !== project.id || preview.path !== tab.path) return;
    let cancelled = false;
    if (preview.availableRenditions.includes("text")) {
      void getDocumentPreviewText(project.id, preview.id).then((text) => {
        if (!cancelled) setTextPreview(text);
      }).catch(() => {
        if (!cancelled) setTextPreview(null);
      });
    }
    if (preview.availableRenditions.includes("pdf")) {
      void getDocumentPreviewPdfUrl(project.id, preview.id).then((url) => {
        if (!cancelled) setPdfUrl(url);
      }).catch((requestError) => {
        if (!cancelled) setError(previewErrorMessage(requestError,"No se pudo cargar el PDF."));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [preview, project.id, tab.path]);

  useEffect(() => {
    if (!preview || preview.projectId !== project.id || preview.path !== tab.path || preview.format !== "xlsx" || !activeSheetId || !preview.availableRenditions.includes("workbook")) return;
    let cancelled = false;
    setSheet(null);
    getSpreadsheetSheet(project.id, preview.id, activeSheetId)
      .then((nextSheet) => {
        if (!cancelled) setSheet(nextSheet);
      })
      .catch((requestError) => {
        if (!cancelled) setError(previewErrorMessage(requestError,"No se pudo cargar la hoja."));
      });
    return () => {
      cancelled = true;
    };
  }, [activeSheetId, preview, project.id, tab.path]);

  const searchCount = useMemo(() => {
    if (!query.trim() || !textPreview?.text) return 0;
    return textPreview.text.toLowerCase().split(query.trim().toLowerCase()).length - 1;
  }, [query, textPreview?.text]);

  async function reloadPreview(forceRefresh = false) {
    if (refreshing.current || (preview && (preview.projectId !== project.id || preview.path !== tab.path))) return;
    const requestEpoch = epoch.current;
    refreshing.current = true;
    setBusy(true);
    setOperationError(null);
    try {
      const nextPreview = forceRefresh && preview
        ? await refreshDocumentPreview(project.id, preview.id)
        : await createDocumentPreview(project.id, { path: tab.path, preferredMode: tab.format === "xlsx" ? "spreadsheet" : "document" });
      if (epoch.current !== requestEpoch) return;
      setError(null);
      setPdfUrl("");
      setPdfSearchCount(null);
      setTextPreview(null);
      setSheet(null);
      acceptPreview({...nextPreview});
    } catch (requestError) {
      if (epoch.current === requestEpoch) setOperationError(previewErrorMessage(requestError,"No se pudo actualizar la vista."));
    } finally {
      if (epoch.current === requestEpoch) {
        refreshing.current = false;
        setBusy(false);
      }
    }
  }

  async function openExternal() {
    if (!preview || preview.projectId !== project.id || preview.path !== tab.path || externalInFlight.current) return;
    const requestEpoch = epoch.current;
    externalInFlight.current = true;
    setOpeningExternal(true);
    setOperationError(null);
    try {
      await openDocumentPreviewExternal(project.id, preview.id);
    } catch (requestError) {
      if (epoch.current === requestEpoch) setOperationError(previewErrorMessage(requestError,"No se pudo abrir el documento en la aplicación externa."));
    } finally {
      if (epoch.current === requestEpoch) {
        externalInFlight.current = false;
        setOpeningExternal(false);
      }
    }
  }

  const status = preview?.status ?? (busy ? "processing" : "error");
  const canShowPdf = Boolean(pdfUrl && preview?.availableRenditions.includes("pdf"));
  const canShowSheet = Boolean(preview?.format === "xlsx" && preview.availableRenditions.includes("workbook"));
  const workbookHasNoSheets = Boolean(canShowSheet && preview?.sheets?.length === 0);

  return (
    <div className="reference-viewer flex h-full min-h-0 flex-col bg-white">
      <DocumentPreviewToolbar
        preview={preview}
        query={query}
        searchCount={preview?.format === "xlsx" ? searchCount : pdfSearchCount}
        zoomPercent={zoomPercent}
        fitMode={fitMode}
        pageNumber={pageNumber}
        pageCount={pdfUrl ? pdfPageCount : null}
        busy={busy}
        openingExternal={openingExternal}
        activeSheetId={activeSheetId}
        onQueryChange={value=>setQuery(value.slice(0,512))}
        onZoomChange={(nextZoom) => {
          setFitMode(null);
          setZoomPercent(clamp(nextZoom, 50, 220));
        }}
        onFitModeChange={(nextFitMode) => setFitMode(nextFitMode)}
        onSelectSheet={setActiveSheetId}
        onPageChange={page=>{setPageNumber(page);setPdfPosition({pageNumber:page,offsetRatio:0,horizontalRatio:0});setPageNavigationSequence(sequence=>sequence+1);}}
        onRefresh={() => void reloadPreview(true)}
        onOpenExternal={() => void openExternal()}
      />
      {operationError && <p role="alert" className="shrink-0 break-words bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-900">{operationError}</p>}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 bg-panel/40">
          {error || status === "error" || status === "unsupported" || status === "protected" ? (
            <PreviewErrorState
              canOpenExternal={Boolean(preview)}
              title={status === "unsupported" ? "Vista integrada no disponible" : "No se pudo generar la vista"}
              message={preview?.error ?? error ?? "El documento no se pudo preparar para lectura."}
              onRetry={() => void reloadPreview(true)}
              onOpenExternal={() => void openExternal()}
            />
          ) : status === "stale" ? (
            <PreviewStatusState
              title="Vista desactualizada"
              message="El archivo cambió en disco. Actualiza la vista para consultar la versión más reciente."
              actionLabel="Actualizar"
              onAction={() => void reloadPreview(true)}
            />
          ) : busy || !preview || status === "processing" || status === "queued" ? (
            <PreviewStatusState
              title={tab.format === "pdf" ? "Preparando vista" : tab.format === "xlsx" ? "Preparando hoja" : "Convirtiendo documento"}
              message="KnowNext.ai está preparando una vista local de solo lectura."
            />
          ) : preview.format === "xlsx" ? (
            workbookHasNoSheets ? (
              <PreviewErrorState
                title="No se encontraron hojas"
                message="El libro se pudo abrir, pero no se detectaron hojas visibles para la vista integrada."
                onRetry={() => void reloadPreview(true)}
                onOpenExternal={() => void openExternal()}
              />
            ) : canShowSheet && sheet ? <SpreadsheetPreviewSurface key={`${sourceRevision}|${sheet.sheetId}`} sheet={sheet} query={query} position={sheetPositions[sheet.sheetId]} onPositionChange={position=>{
              if(latestSource.current!==sourceRevision)return;
              setSheetPositions(current=>({...Object.fromEntries(Object.entries(current).filter(([id])=>id!==sheet.sheetId).slice(-15)),[sheet.sheetId]:position}));
            }} /> : (
              <PreviewStatusState title="Preparando hoja" message="Cargando la grilla solo lectura." />
            )
          ) : canShowPdf ? (
            <PdfPreviewSurface
              url={pdfUrl}
              query={query}
              zoomPercent={zoomPercent}
              fitMode={fitMode}
              pageNumber={pageNumber}
              onPageChange={setPageNumber}
              onPageCountChange={handlePdfPageCount}
              onSearchCountChange={setPdfSearchCount}
              navigationSequence={pageNavigationSequence}
              readingPosition={pdfPosition}
              onReadingPositionChange={position=>{if(latestSource.current===sourceRevision)setPdfPosition(position);}}
            />
          ) : preview.availableRenditions.includes("pdf") ? (
            <PreviewStatusState title="Preparando vista" message="Obteniendo la representación del documento."/>
          ) : (
            <PreviewErrorState
              title="Vista de páginas no disponible"
              message="No se pudo generar una vista paginada para este documento."
              onRetry={() => void reloadPreview(true)}
              onOpenExternal={() => void openExternal()}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SpreadsheetPreviewSurface({ sheet, query, position, onPositionChange }: { sheet: SpreadsheetSheetResponse; query: string;position?:SheetReadingPosition;onPositionChange:(position:SheetReadingPosition)=>void }) {
  const scrollRef=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{const el=scrollRef.current;if(el&&position){el.scrollTop=position.top;el.scrollLeft=position.left;}},[sheet.sheetId]);
  const cells = useMemo(() => {
    const map = new Map<string, SpreadsheetSheetResponse["cells"][number]>();
    sheet.cells.forEach((cell) => map.set(`${cell.row}:${cell.column}`, cell));
    return map;
  }, [sheet.cells]);
  const rowCount = Math.min(Math.max(sheet.rowCount, 20), 250);
  const columnCount = Math.min(Math.max(sheet.columnCount, 8), 60);
  const rows = Array.from({ length: rowCount }, (_, index) => index + 1);
  const columns = Array.from({ length: columnCount }, (_, index) => index + 1);
  const normalizedQuery = query.trim().toLowerCase();

  return (
    <div ref={scrollRef} data-testid="spreadsheet-scroll-surface" onScroll={event=>onPositionChange({top:event.currentTarget.scrollTop,left:event.currentTarget.scrollLeft})} className="h-full overflow-auto bg-white">
      <div className="inline-grid min-w-full border-b border-r border-line bg-white text-[11px]" style={{ gridTemplateColumns: `42px repeat(${columnCount}, minmax(96px, 136px))` }}>
        <div className="sticky left-0 top-0 z-20 border-b border-r border-line bg-panel" />
        {columns.map((column) => (
          <div key={column} className="sticky top-0 z-10 h-7 border-b border-r border-line bg-panel px-2 py-1 text-center font-semibold text-ink-secondary">
            {columnName(column)}
          </div>
        ))}
        {rows.map((row) => (
          <Fragment key={`row-fragment-${row}`}>
            <div key={`row-${row}`} className="sticky left-0 z-10 h-7 border-b border-r border-line bg-panel px-2 py-1 text-right font-semibold text-ink-secondary">{row}</div>
            {columns.map((column) => {
              const cell = cells.get(`${row}:${column}`);
              const value = cell?.displayValue ?? "";
              const matched = normalizedQuery && value.toLowerCase().includes(normalizedQuery);
              return (
                <button
                  key={`${row}-${column}`}
                  className={[
                    "h-7 min-w-0 truncate border-b border-r border-line px-2 text-left outline-none hover:bg-brand-hover focus:bg-brand-hover",
                    matched ? "bg-brand-hover text-brand-orange" : "bg-white text-ink-primary",
                  ].join(" ")}
                  title={cell?.formula ? `=${cell.formula}` : value}
                  onClick={() => cell && navigator.clipboard?.writeText(value)}
                >
                  {value}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      {sheet.rowCount > rowCount || sheet.columnCount > columnCount ? (
        <p className="px-2 py-2 text-[10px] text-ink-secondary">
          Mostrando una ventana de {rowCount} filas por {columnCount} columnas para mantener la vista fluida.
        </p>
      ) : null}
    </div>
  );
}

function PreviewErrorState({ title, message, onRetry, onOpenExternal, canOpenExternal = true }: { title: string; message: string; onRetry: () => void; onOpenExternal: () => void; canOpenExternal?: boolean }) {
  return (
    <div className="reference-viewer-error grid h-full place-items-center px-6 text-center">
      <div>
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-md border border-orange-100 bg-brand-hover text-brand-orange">
          <AlertTriangle size={18} />
        </div>
        <p className="mt-3 text-[13px] font-semibold text-ink-primary">{title}</p>
        <p className="mt-1 max-w-[420px] text-[11px] leading-5 text-ink-secondary">{message}</p>
        <div className="mt-4 flex justify-center gap-2">
          {canOpenExternal && <button className="h-8 rounded-md border border-line px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange" onClick={onOpenExternal}>Abrir externo</button>}
          <button className="h-8 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={onRetry}>Reintentar</button>
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function columnName(index: number) {
  let value = "";
  let current = index;
  while (current > 0) {
    const modulo = (current - 1) % 26;
    value = String.fromCharCode(65 + modulo) + value;
    current = Math.floor((current - modulo) / 26);
  }
  return value;
}
