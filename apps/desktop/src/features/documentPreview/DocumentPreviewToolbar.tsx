import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Maximize2, Minus, RefreshCw, Search, ZoomIn } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { DocumentPreview } from "../../types/domain";
import { useElementSize } from "./useElementSize";
import "./ReferenceDocumentViewer.css";

type Props = {
  preview: DocumentPreview | null;
  query: string;
  searchCount: number | null;
  zoomPercent: number;
  fitMode: "width" | "page" | null;
  pageNumber: number;
  pageCount: number | null;
  activeSheetId: string;
  busy: boolean;
  openingExternal: boolean;
  onQueryChange: (query: string) => void;
  onZoomChange: (zoom: number) => void;
  onFitModeChange: (mode: "width" | "page") => void;
  onSelectSheet: (id: string) => void;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  onOpenExternal: () => void;
};

export function DocumentPreviewToolbar(props: Props) {
  const [ref, size] = useElementSize<HTMLElement>();
  const compact = size.width < 680;
  const [viewOpen, setViewOpen] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const viewToggle = useRef<HTMLButtonElement>(null);
  const optionsId = useId();
  const workbook = props.preview?.format === "xlsx";
  const pdf = Boolean(props.preview && !workbook);
  const searchAvailable = props.preview?.availableRenditions.includes("text") ?? false;
  const optionsVisible = !compact || viewOpen;
  function selectFit(mode:"width"|"page") {
    props.onFitModeChange(mode);
    if(compact){setViewOpen(false);viewToggle.current?.focus();}
  }

  useEffect(() => { setViewOpen(false); }, [compact, props.preview?.id]);
  useEffect(() => {
    if (!compact || !viewOpen) return;
    viewRef.current?.querySelector<HTMLButtonElement>('[aria-label="Reducir zoom"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!viewRef.current?.contains(event.target as Node)) setViewOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [compact, viewOpen]);

  return <header ref={ref} className="reference-toolbar" data-compact={compact} aria-label="Herramientas de consulta">
    {workbook && <SheetSelect sheets={props.preview?.sheets ?? []} activeId={props.activeSheetId} onSelect={props.onSelectSheet}/>}
    <label className="reference-search" data-workbook={workbook}>
      <Search size={15} aria-hidden="true"/>
      <input aria-label="Buscar en documento" maxLength={512} value={props.query} disabled={!searchAvailable} placeholder={searchAvailable ? "Buscar en documento" : "Búsqueda no disponible"} onChange={event=>props.onQueryChange(event.target.value)}/>
      {props.query && <span aria-label="Coincidencias" title={props.searchCount===null ? "Recuento no disponible o todavía en preparación" : undefined}>{props.searchCount ?? "?"}</span>}
    </label>
    {pdf && <div className="reference-pdf-tools">
      <div ref={viewRef} className="reference-view-options" onBlur={event=>{
        if (compact && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setViewOpen(false);
      }} onKeyDown={event=>{
        if (compact && viewOpen && event.key==="Escape") {
          event.preventDefault(); event.stopPropagation(); setViewOpen(false); viewToggle.current?.focus();
        }
      }}>
        {compact && <button ref={viewToggle} type="button" className="reference-button reference-view-toggle" aria-expanded={viewOpen} aria-controls={optionsId} onClick={()=>setViewOpen(value=>!value)}>Vista <ChevronDown size={14}/></button>}
        <div id={optionsId} role="group" aria-label="Opciones de vista" hidden={!optionsVisible} className="reference-view-controls" data-popover={compact} style={compact ? {width:Math.min(244,Math.max(0,size.width-16))} : undefined}>
          <div className="reference-zoom">
            <button type="button" className="reference-button" aria-label="Reducir zoom" disabled={!props.fitMode && props.zoomPercent<=50} onClick={()=>props.onZoomChange(props.zoomPercent-10)}><Minus size={15}/></button>
            <span>{props.fitMode ? props.fitMode==="width" ? "Ancho" : "Página" : `${props.zoomPercent}%`}</span>
            <button type="button" className="reference-button" aria-label="Aumentar zoom" disabled={!props.fitMode && props.zoomPercent>=220} onClick={()=>props.onZoomChange(props.zoomPercent+10)}><ZoomIn size={15}/></button>
          </div>
          <button type="button" className="reference-button reference-fit" aria-pressed={props.fitMode==="width"} onClick={()=>selectFit("width")}>Ancho</button>
          <button type="button" className="reference-button reference-fit" aria-label="Ajustar página" aria-pressed={props.fitMode==="page"} onClick={()=>selectFit("page")}><Maximize2 size={15}/><span className="reference-fit-label">Página</span></button>
        </div>
      </div>
      <div className="reference-pagination" role="group" aria-label="Páginas del documento">
        <button type="button" className="reference-button" disabled={!props.pageCount || props.pageNumber<=1} aria-label="Página anterior" onClick={()=>props.onPageChange(Math.max(1,props.pageNumber-1))}><ChevronLeft size={16}/></button>
        <span aria-live="polite">{props.pageNumber} / {props.pageCount ?? "?"}</span>
        <button type="button" className="reference-button" disabled={!props.pageCount || props.pageNumber>=props.pageCount} aria-label="Página siguiente" onClick={()=>props.onPageChange(Math.min(props.pageCount ?? 1,props.pageNumber+1))}><ChevronRight size={16}/></button>
      </div>
    </div>}
    <div className="reference-actions">
      <button type="button" className="reference-button" aria-label="Actualizar vista" title="Actualizar vista" disabled={props.busy} onClick={props.onRefresh}><RefreshCw size={16}/></button>
      <button type="button" className="reference-button" aria-label="Abrir externo" title="Abrir externo" disabled={!props.preview || props.openingExternal} onClick={props.onOpenExternal}><ExternalLink size={16}/></button>
    </div>
  </header>;
}

function SheetSelect({sheets,activeId,onSelect}:{sheets:NonNullable<DocumentPreview["sheets"]>;activeId:string;onSelect:(id:string)=>void}) {
  return <label className="reference-sheet"><span className="sr-only">Seleccionar hoja</span>
    <select aria-label="Seleccionar hoja" value={activeId} disabled={!sheets.length} onChange={event=>onSelect(event.target.value)}>
      {!sheets.length && <option value="">Sin hojas</option>}
      {sheets.map(sheet=><option key={sheet.id} value={sheet.id}>{sheet.name}{sheet.hidden ? " · Oculta" : ""} · {sheet.rowCount} × {sheet.columnCount}</option>)}
    </select>
  </label>;
}
