import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Maximize2,
  Minus,
  RefreshCw,
  Search,
  Sheet,
  ZoomIn,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import type { DocumentPreview, DocumentPreviewTextResponse, Project, ReferenceDocumentWorkspaceTab, SpreadsheetSheetResponse } from "../../types/domain";
import {
  createDocumentPreview,
  getDocumentPreviewPdfUrl,
  getDocumentPreviewText,
  getSpreadsheetSheet,
  openDocumentPreviewExternal,
  refreshDocumentPreview,
} from "../../lib/api/documentPreviews";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ReferenceDocumentViewerProps = {
  project: Project;
  tab: ReferenceDocumentWorkspaceTab;
};

type PdfSearchHighlight = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export function ReferenceDocumentViewer({ project, tab }: ReferenceDocumentViewerProps) {
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [textPreview, setTextPreview] = useState<DocumentPreviewTextResponse | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [sheet, setSheet] = useState<SpreadsheetSheetResponse | null>(null);
  const [activeSheetId, setActiveSheetId] = useState("");
  const [query, setQuery] = useState("");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [fitMode, setFitMode] = useState<"width" | "page" | null>("width");
  const [pageNumber, setPageNumber] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    setPreview(null);
    setTextPreview(null);
    setPdfUrl("");
    setSheet(null);
    setActiveSheetId("");
    createDocumentPreview(project.id, { path: tab.path, preferredMode: tab.format === "xlsx" ? "spreadsheet" : "document" })
      .then((nextPreview) => {
        if (cancelled) return;
        setPreview(nextPreview);
        setActiveSheetId(nextPreview.sheets?.[0]?.id ?? "");
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "No se pudo preparar la vista.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, tab.format, tab.path]);

  useEffect(() => {
    if (!preview) return;
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
      });
    }
    return () => {
      cancelled = true;
    };
  }, [preview, project.id]);

  useEffect(() => {
    if (!preview || preview.format !== "xlsx" || !activeSheetId || !preview.availableRenditions.includes("workbook")) return;
    let cancelled = false;
    setSheet(null);
    getSpreadsheetSheet(project.id, preview.id, activeSheetId)
      .then((nextSheet) => {
        if (!cancelled) setSheet(nextSheet);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "No se pudo cargar la hoja.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeSheetId, preview, project.id]);

  const searchCount = useMemo(() => {
    if (!query.trim() || !textPreview?.text) return 0;
    return textPreview.text.toLowerCase().split(query.trim().toLowerCase()).length - 1;
  }, [query, textPreview?.text]);

  async function reloadPreview(forceRefresh = false) {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const nextPreview = forceRefresh
        ? await refreshDocumentPreview(project.id, preview.id)
        : await createDocumentPreview(project.id, { path: tab.path, preferredMode: tab.format === "xlsx" ? "spreadsheet" : "document" });
      setPreview(nextPreview);
      setActiveSheetId(nextPreview.sheets?.[0]?.id ?? "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo actualizar la vista.");
    } finally {
      setBusy(false);
    }
  }

  const status = preview?.status ?? (busy ? "processing" : "error");
  const canShowPdf = Boolean(pdfUrl && preview?.availableRenditions.includes("pdf"));
  const canShowSheet = Boolean(preview?.format === "xlsx" && preview.availableRenditions.includes("workbook"));
  const workbookHasNoSheets = Boolean(canShowSheet && preview?.sheets?.length === 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <DocumentPreviewToolbar
        preview={preview}
        query={query}
        searchCount={searchCount}
        zoomPercent={zoomPercent}
        fitMode={fitMode}
        pageNumber={pageNumber}
        pageCount={preview?.pageCount ?? null}
        activeSheetId={activeSheetId}
        onQueryChange={setQuery}
        onZoomChange={(nextZoom) => {
          setFitMode(null);
          setZoomPercent(clamp(nextZoom, 50, 220));
        }}
        onFitModeChange={(nextFitMode) => setFitMode(nextFitMode)}
        onSelectSheet={setActiveSheetId}
        onPageChange={setPageNumber}
        onRefresh={() => void reloadPreview(true)}
        onOpenExternal={() => preview && void openDocumentPreviewExternal(project.id, preview.id)}
      />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 bg-panel/40">
          {error || status === "error" || status === "unsupported" || status === "protected" ? (
            <PreviewErrorState
              title={status === "unsupported" ? "Vista integrada no disponible" : "No se pudo generar la vista"}
              message={preview?.error ?? error ?? "El documento no se pudo preparar para lectura."}
              onRetry={() => void reloadPreview(true)}
              onOpenExternal={() => preview && void openDocumentPreviewExternal(project.id, preview.id)}
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
                onOpenExternal={() => preview && void openDocumentPreviewExternal(project.id, preview.id)}
              />
            ) : canShowSheet && sheet ? <SpreadsheetPreviewSurface sheet={sheet} query={query} /> : (
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
            />
          ) : (
            <PreviewErrorState
              title="Vista de páginas no disponible"
              message="No se pudo generar una vista paginada para este documento."
              onRetry={() => void reloadPreview(true)}
              onOpenExternal={() => preview && void openDocumentPreviewExternal(project.id, preview.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentPreviewToolbar({
  preview,
  query,
  searchCount,
  zoomPercent,
  fitMode,
  pageNumber,
  pageCount,
  activeSheetId,
  onQueryChange,
  onZoomChange,
  onFitModeChange,
  onSelectSheet,
  onPageChange,
  onRefresh,
  onOpenExternal,
}: {
  preview: DocumentPreview | null;
  query: string;
  searchCount: number;
  zoomPercent: number;
  fitMode: "width" | "page" | null;
  pageNumber: number;
  pageCount: number | null;
  activeSheetId: string;
  onQueryChange: (query: string) => void;
  onZoomChange: (zoom: number) => void;
  onFitModeChange: (mode: "width" | "page") => void;
  onSelectSheet: (sheetId: string) => void;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  onOpenExternal: () => void;
}) {
  const searchAvailable = preview?.availableRenditions.includes("text") ?? false;
  const showPdfControls = Boolean(preview && preview.format !== "xlsx");
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-white px-2.5 text-[11px]">
      {preview?.format === "xlsx" ? (
        <SpreadsheetSheetSelect
          sheets={preview.sheets ?? []}
          activeSheetId={activeSheetId}
          onSelectSheet={onSelectSheet}
        />
      ) : null}
      <div className="relative flex h-7 w-[220px] items-center rounded-md border border-line bg-white px-2 focus-within:border-brand-orange">
        <Search size={13} className="mr-1.5 shrink-0 text-ink-secondary" />
        <input
          className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-ink-secondary"
          value={query}
          disabled={!searchAvailable}
          placeholder={searchAvailable ? "Buscar en documento" : "Búsqueda no disponible"}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {query ? <span className="ml-1 shrink-0 text-[10px] text-ink-secondary">{searchCount}</span> : null}
      </div>
      {showPdfControls ? (
        <>
          <div className="flex h-7 items-center rounded-md border border-line bg-white">
            <button className="grid h-6 w-7 place-items-center text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" onClick={() => onZoomChange(zoomPercent - 10)} aria-label="Reducir zoom">
              <Minus size={12} />
            </button>
            <span className="w-12 text-center text-[10px] font-semibold text-ink-primary">{fitMode ? (fitMode === "width" ? "Ancho" : "Página") : `${zoomPercent}%`}</span>
            <button className="grid h-6 w-7 place-items-center text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" onClick={() => onZoomChange(zoomPercent + 10)} aria-label="Aumentar zoom">
              <ZoomIn size={12} />
            </button>
          </div>
          <button className={toolbarButtonClass(fitMode === "width")} onClick={() => onFitModeChange("width")}>Ancho</button>
          <button className={toolbarButtonClass(fitMode === "page")} onClick={() => onFitModeChange("page")}>
            <Maximize2 size={13} />
          </button>
          <div className="flex h-7 items-center rounded-md border border-line bg-white">
            <button className="grid h-6 w-7 place-items-center text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" onClick={() => onPageChange(Math.max(1, pageNumber - 1))} aria-label="Página anterior">
              <ChevronLeft size={13} />
            </button>
            <span className="w-20 text-center text-[10px] text-ink-primary">{pageNumber} / {pageCount ?? "?"}</span>
            <button className="grid h-6 w-7 place-items-center text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" onClick={() => onPageChange(pageCount ? Math.min(pageCount, pageNumber + 1) : pageNumber + 1)} aria-label="Página siguiente">
              <ChevronRight size={13} />
            </button>
          </div>
        </>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        <button className="grid h-7 w-7 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" data-tooltip="Actualizar vista" aria-label="Actualizar vista" onClick={onRefresh}>
          <RefreshCw size={14} />
        </button>
        <button className="grid h-7 w-7 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" data-tooltip="Abrir externo" aria-label="Abrir externo" onClick={onOpenExternal}>
          <ExternalLink size={14} />
        </button>
      </div>
    </header>
  );
}

function SpreadsheetSheetSelect({
  sheets,
  activeSheetId,
  onSelectSheet,
}: {
  sheets: NonNullable<DocumentPreview["sheets"]>;
  activeSheetId: string;
  onSelectSheet: (sheetId: string) => void;
}) {
  const disabled = sheets.length === 0;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeSheet = sheets.find((sheet) => sheet.id === activeSheetId) ?? null;

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideInteraction(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Seleccionar hoja"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        className="flex h-7 w-[240px] items-center rounded-md border border-line bg-white pl-2 pr-1 text-left text-[11px] text-ink-primary outline-none transition hover:border-orange-200 hover:bg-brand-hover focus:border-brand-orange disabled:text-ink-secondary"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <Sheet size={13} className="mr-1.5 shrink-0 text-brand-orange" />
        <span className="min-w-0 flex-1 truncate font-semibold">
          {activeSheet?.name ?? (disabled ? "Sin hojas" : "Seleccionar hoja")}
        </span>
        {activeSheet ? (
          <span className="ml-2 shrink-0 text-[9px] font-medium text-ink-secondary">
            {activeSheet.rowCount}x{activeSheet.columnCount}
          </span>
        ) : null}
        <ChevronDown size={13} className={["ml-1.5 shrink-0 text-ink-secondary transition", open ? "rotate-180" : ""].join(" ")} />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label="Hojas del libro"
          className="absolute left-0 top-8 z-40 max-h-72 w-[320px] overflow-auto rounded-md border border-line bg-white p-1 shadow-lg"
        >
          {sheets.map((sheet) => {
            const selected = sheet.id === activeSheetId;
            return (
              <button
                key={sheet.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={[
                  "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] outline-none transition",
                  selected ? "bg-brand-hover text-brand-orange" : "text-ink-primary hover:bg-panel",
                ].join(" ")}
                onClick={() => {
                  onSelectSheet(sheet.id);
                  setOpen(false);
                }}
              >
                <Sheet size={13} className={selected ? "shrink-0 text-brand-orange" : "shrink-0 text-ink-secondary"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{sheet.name}</span>
                  <span className="block text-[9px] text-ink-secondary">{sheet.rowCount} filas x {sheet.columnCount} columnas</span>
                </span>
                {selected ? <Check size={13} className="shrink-0 text-brand-orange" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PdfPreviewSurface({ url, query, zoomPercent, fitMode, pageNumber, onPageChange }: { url: string; query: string; zoomPercent: number; fitMode: "width" | "page" | null; pageNumber: number; onPageChange: (pageNumber: number) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(Math.max(320, width - 32));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setError(null);
    const loadingTask = pdfjsLib.getDocument({ url });
    loadingTask.promise
      .then((document) => {
        if (!cancelled) setPdf(document);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo renderizar el PDF.");
      });
    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [url]);

  useEffect(() => {
    const page = containerRef.current?.querySelector(`[data-pdf-page="${pageNumber}"]`);
    if (page instanceof HTMLElement) page.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [pageNumber]);

  if (error) {
    return <PreviewStatusState title="No se pudo renderizar el PDF" message={error} />;
  }
  if (!pdf) {
    return <PreviewStatusState title="Preparando páginas" message="PDF.js está cargando el documento." />;
  }

  const pages = Array.from({ length: pdf.numPages }, (_, index) => index + 1);
  return (
    <div ref={containerRef} className="h-full overflow-auto bg-panel/60 px-4 py-4">
      <div className="mx-auto flex w-fit flex-col gap-4">
        {pages.map((page) => (
          <PdfPageCanvas
            key={page}
            pdf={pdf}
            pageNumber={page}
            containerWidth={containerWidth}
            query={query}
            zoomPercent={zoomPercent}
            fitMode={fitMode}
            onVisible={onPageChange}
          />
        ))}
      </div>
    </div>
  );
}

function PdfPageCanvas({
  pdf,
  pageNumber,
  containerWidth,
  query,
  zoomPercent,
  fitMode,
  onVisible,
}: {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  containerWidth: number;
  query: string;
  zoomPercent: number;
  fitMode: "width" | "page" | null;
  onVisible: (pageNumber: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0, scale: 1 });
  const [highlights, setHighlights] = useState<PdfSearchHighlight[]>([]);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onVisible(pageNumber);
    }, { threshold: 0.55 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [onVisible, pageNumber]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    setRenderError(false);
    pdf.getPage(pageNumber)
      .then((page) => {
        if (cancelled || !canvasRef.current) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = fitMode === "width"
          ? containerWidth / baseViewport.width
          : fitMode === "page"
            ? Math.min(containerWidth / baseViewport.width, 760 / baseViewport.height)
            : zoomPercent / 100;
        const effectiveScale = Math.max(0.25, scale);
        const viewport = page.getViewport({ scale: effectiveScale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        setPageSize({ width: viewport.width, height: viewport.height, scale: effectiveScale });
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        return renderTask.promise;
      })
      .catch((error) => {
        if (!cancelled && error?.name !== "RenderingCancelledException") setRenderError(true);
      });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [containerWidth, fitMode, pageNumber, pdf, zoomPercent]);

  useEffect(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery || renderError) {
      setHighlights([]);
      return;
    }
    let cancelled = false;
    pdf.getPage(pageNumber)
      .then((page) => page.getTextContent())
      .then((content) => {
        if (cancelled) return;
        const nextHighlights: PdfSearchHighlight[] = [];
        content.items.forEach((item, itemIndex) => {
          if (!("str" in item) || !item.str) return;
          const text = item.str;
          const normalizedText = text.toLowerCase();
          if (!normalizedText.includes(normalizedQuery)) return;
          const [, , , , x, y] = multiplyTransforms(
            [pageSize.scale, 0, 0, -pageSize.scale, 0, pageSize.height],
            item.transform,
          );
          const itemWidth = Math.max(8, item.width * pageSize.scale);
          const itemHeight = Math.max(8, item.height * pageSize.scale);
          const matches = findQueryMatches(normalizedText, normalizedQuery);
          matches.forEach((match, matchIndex) => {
            const leftRatio = match.start / Math.max(text.length, 1);
            const widthRatio = (match.end - match.start) / Math.max(text.length, 1);
            nextHighlights.push({
              id: `${pageNumber}-${itemIndex}-${matchIndex}`,
              left: x + itemWidth * leftRatio,
              top: y - itemHeight * 0.95,
              width: Math.max(6, itemWidth * widthRatio),
              height: itemHeight * 1.15,
            });
          });
        });
        setHighlights(nextHighlights);
      })
      .catch(() => {
        if (!cancelled) setHighlights([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pageNumber, pageSize.height, pageSize.scale, pdf, query, renderError]);

  return (
    <div ref={wrapperRef} data-pdf-page={pageNumber} className="scroll-mt-3">
      <div className="mb-1 px-1 text-[10px] font-semibold text-ink-secondary">Página {pageNumber}</div>
      <div className="relative w-fit bg-white shadow-subtle ring-1 ring-line">
        <canvas ref={canvasRef} className="block bg-white" />
        {highlights.length ? (
          <div className="pointer-events-none absolute inset-0 z-10">
            {highlights.map((highlight) => (
              <span
                key={highlight.id}
                className="absolute rounded-[2px] bg-brand-orange/30 ring-1 ring-brand-orange/45"
                style={{
                  left: `${highlight.left}px`,
                  top: `${highlight.top}px`,
                  width: `${highlight.width}px`,
                  height: `${highlight.height}px`,
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
      {renderError ? <p className="py-2 text-center text-[10px] text-red-700">No se pudo renderizar esta página.</p> : null}
    </div>
  );
}

function SpreadsheetPreviewSurface({ sheet, query }: { sheet: SpreadsheetSheetResponse; query: string }) {
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
    <div className="h-full overflow-auto bg-white">
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

function PreviewStatusState({ title, message, actionLabel, onAction }: { title: string; message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-md border border-orange-100 bg-brand-hover text-brand-orange">
          <FileText size={18} />
        </div>
        <p className="mt-3 text-[13px] font-semibold text-ink-primary">{title}</p>
        <p className="mt-1 max-w-[360px] text-[11px] leading-5 text-ink-secondary">{message}</p>
        {actionLabel && onAction ? (
          <button className="mt-4 h-8 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PreviewErrorState({ title, message, onRetry, onOpenExternal }: { title: string; message: string; onRetry: () => void; onOpenExternal: () => void }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-md border border-orange-100 bg-brand-hover text-brand-orange">
          <AlertTriangle size={18} />
        </div>
        <p className="mt-3 text-[13px] font-semibold text-ink-primary">{title}</p>
        <p className="mt-1 max-w-[420px] text-[11px] leading-5 text-ink-secondary">{message}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button className="h-8 rounded-md border border-line px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange" onClick={onOpenExternal}>Abrir externo</button>
          <button className="h-8 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={onRetry}>Reintentar</button>
        </div>
      </div>
    </div>
  );
}

function toolbarButtonClass(active: boolean) {
  return [
    "inline-flex h-7 items-center justify-center gap-1 rounded-md border px-2 text-[10px] font-semibold transition",
    active ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-line bg-white text-ink-primary hover:bg-brand-hover hover:text-brand-orange",
  ].join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function findQueryMatches(text: string, query: string) {
  const matches: Array<{ start: number; end: number }> = [];
  let start = text.indexOf(query);
  while (start >= 0) {
    matches.push({ start, end: start + query.length });
    start = text.indexOf(query, start + query.length);
  }
  return matches;
}

function multiplyTransforms(first: number[], second: number[]) {
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5],
  ];
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
