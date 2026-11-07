import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import {PreviewStatusState} from "./PreviewStatusState";
import {useElementSize} from "./useElementSize";
import type {PdfReadingPosition} from "./previewReadingMemory";
import { rasterRatio } from "./pdfViewport";

pdfjsLib.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
type PdfSearchHighlight={id:string;left:number;top:number;width:number;height:number};

export type PdfPreviewSurfaceProps = {url:string;query:string;zoomPercent:number;fitMode:"width"|"page"|null;pageNumber:number;navigationSequence:number;onPageChange:(page:number)=>void;onPageCountChange:(count:number|null)=>void;onSearchCountChange:(count:number|null)=>void;readingPosition?:PdfReadingPosition|null;onReadingPositionChange?:(position:PdfReadingPosition)=>void};

export function PdfPreviewSurface({url,query,zoomPercent,fitMode,pageNumber,navigationSequence,onPageChange,onPageCountChange,onSearchCountChange,readingPosition,onReadingPositionChange}:PdfPreviewSurfaceProps) {
  const [containerRef,size] = useElementSize<HTMLDivElement>();
  const [pdf,setPdf] = useState<pdfjsLib.PDFDocumentProxy|null>(null);
  const [error,setError] = useState<string|null>(null);
  const currentPage=useRef(pageNumber);
  const readingPositionRef=useRef(readingPosition);readingPositionRef.current=readingPosition;
  const onReadingPositionRef=useRef(onReadingPositionChange);onReadingPositionRef.current=onReadingPositionChange;
  const restoringPosition=useRef(false);
  const scrollFrame=useRef<number>();
  const positionFrame=useRef<number>();
  const releaseFrame=useRef<number>();
  const restorationNeeded=useRef(false);
  const geometry=useMemo(()=>({pages:new Set<number>()}),[pdf,size.width,size.height,fitMode,zoomPercent]);
  const latestGeometry=useRef(geometry);
  const matchCounts=useRef(new Map<number,number|null>());
  currentPage.current=pageNumber;
  const reportMatches=useCallback((page:number,count:number|null)=>{
    matchCounts.current.set(page,count);
    const counts=[...matchCounts.current.values()];
    onSearchCountChange(pdf && counts.length===pdf.numPages && counts.every(n=>n!==null) ?
      counts.reduce<number>((sum,n)=>sum+(n??0),0) : null);
  },[pdf,query,onSearchCountChange]);
  useEffect(()=>{matchCounts.current.clear();onSearchCountChange(null);},[pdf,query,onSearchCountChange]);
  useEffect(()=>{
    let cancelled=false;
    setPdf(null);setError(null);onPageCountChange(null);
    const loadingTask=pdfjsLib.getDocument({url});
    loadingTask.promise.then(document=>{
      if(cancelled)return;
      if(!Number.isSafeInteger(document.numPages)||document.numPages<1)throw new Error("PDF sin páginas válidas");
      setPdf(document);onPageCountChange(document.numPages);
    }).catch(()=>{if(!cancelled)setError("No se pudo renderizar el PDF. Puedes actualizar la vista o abrir el original externamente.");});
    return ()=>{cancelled=true;void loadingTask.destroy().catch(()=>{});};
  },[url,onPageCountChange]);
  const restorePosition=useCallback(()=>{
    if(!restorationNeeded.current || latestGeometry.current!==geometry || positionFrame.current!==undefined || !pdf)return;
    const target=Math.max(1,Math.min(currentPage.current,pdf.numPages));
    for(let number=1;number<=target;number++)if(!geometry.pages.has(number))return;
    positionFrame.current=requestAnimationFrame(()=>{
      positionFrame.current=undefined;
      if(latestGeometry.current!==geometry)return;
      const target=Math.max(1,Math.min(currentPage.current,pdf.numPages));
      for(let number=1;number<=target;number++)if(!geometry.pages.has(number))return;
      const page=containerRef.current?.querySelector(`[data-pdf-page="${target}"]`);
      if(page instanceof HTMLElement){
        page.scrollIntoView({block:"start",behavior:"auto"});
        const surface=containerRef.current;const saved=readingPositionRef.current;
        if(surface&&saved?.pageNumber===target){
          const rect=page.getBoundingClientRect();const bounds=surface.getBoundingClientRect();
          surface.scrollTop+=rect.top-bounds.top+Math.max(0,Math.min(1,saved.offsetRatio))*rect.height;
          surface.scrollLeft=Math.max(0,surface.scrollWidth-surface.clientWidth)*Math.max(0,Math.min(1,saved.horizontalRatio));
        }
      }
      restorationNeeded.current=false;
      releaseFrame.current=requestAnimationFrame(()=>{restoringPosition.current=false;});
    });
  },[geometry,pdf,containerRef]);
  useLayoutEffect(()=>{
    latestGeometry.current=geometry;
    restorationNeeded.current=true;restoringPosition.current=true;
    restorePosition();
    return ()=>{
      if(positionFrame.current!==undefined)cancelAnimationFrame(positionFrame.current);
      if(releaseFrame.current!==undefined)cancelAnimationFrame(releaseFrame.current);
      positionFrame.current=undefined;releaseFrame.current=undefined;
    };
  },[geometry,navigationSequence,restorePosition]);
  const reportLayout=useCallback((page:number)=>{
    if(latestGeometry.current!==geometry)return;
    geometry.pages.add(page);restorePosition();
  },[geometry,restorePosition]);
  useEffect(()=>()=>{if(scrollFrame.current!==undefined)cancelAnimationFrame(scrollFrame.current);},[]);
  function trackReadingPosition() {
    if(restoringPosition.current||scrollFrame.current!==undefined)return;
    scrollFrame.current=requestAnimationFrame(()=>{
      scrollFrame.current=undefined;
      const surface=containerRef.current;
      if(!surface||restoringPosition.current)return;
      const bounds=surface.getBoundingClientRect();
      let best=currentPage.current;let overlap=0;
      for(const element of surface.querySelectorAll<HTMLElement>('[data-pdf-page]')){
        const rect=element.getBoundingClientRect();
        if(rect.top>=bounds.bottom)break;
        const visible=Math.max(0,Math.min(rect.bottom,bounds.bottom)-Math.max(rect.top,bounds.top));
        if(visible>overlap){overlap=visible;best=Number(element.dataset.pdfPage);}
      }
      if(best!==currentPage.current)onPageChange(best);
      const page=surface.querySelector<HTMLElement>(`[data-pdf-page="${best}"]`);
      const rect=page?.getBoundingClientRect();
      if(rect&&rect.height>0)onReadingPositionRef.current?.({pageNumber:best,offsetRatio:Math.max(0,Math.min(1,(bounds.top-rect.top)/rect.height)),horizontalRatio:surface.scrollWidth>surface.clientWidth?surface.scrollLeft/(surface.scrollWidth-surface.clientWidth):0});
    });
  }
  // This surface remains mounted during loading: its observer sees the first
  // real panel dimensions before any page canvas is created.
  return <div ref={containerRef} onScroll={trackReadingPosition} className="h-full min-h-0 min-w-0 overflow-auto bg-panel/60 px-4 py-4" data-testid="pdf-scroll-surface">
    {error ? <PreviewStatusState title="No se pudo renderizar el PDF" message={error}/> : !pdf || !size.width || !size.height ?
      <PreviewStatusState title="Preparando páginas" message="PDF.js está cargando el documento."/> :
      <div className="mx-auto flex w-fit flex-col gap-4">
        {Array.from({length:pdf.numPages},(_,index)=><PdfPageCanvas key={index+1} pdf={pdf} pageNumber={index+1} minimumHeight={index===pdf.numPages-1?Math.max(0,size.height-32):0} containerWidth={size.width} containerHeight={Math.max(1,size.height-24)} query={query} zoomPercent={zoomPercent} fitMode={fitMode} onMatches={reportMatches} onLayout={reportLayout}/>)}
      </div>}
  </div>;
}

function PdfPageCanvas({
  pdf,
  pageNumber,
  containerWidth,
  containerHeight,
  minimumHeight,
  query,
  zoomPercent,
  fitMode,
  onMatches,
  onLayout,
}: {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  containerWidth: number;
  containerHeight: number;
  minimumHeight:number;
  query: string;
  zoomPercent: number;
  fitMode: "width" | "page" | null;
  onMatches: (page:number,count:number|null)=>void;
  onLayout: (page:number)=>void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0, scale: 1 });
  const [highlights, setHighlights] = useState<PdfSearchHighlight[]>([]);
  const [renderError, setRenderError] = useState(false);

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
            ? Math.min(containerWidth / baseViewport.width, containerHeight / baseViewport.height)
            : zoomPercent / 100;
        if (!Number.isFinite(scale) || scale <= 0) throw new Error("Dimensiones de página no válidas");
        const effectiveScale = scale;
        const viewport = page.getViewport({ scale: effectiveScale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;
        const pixelRatio = rasterRatio(viewport.width, viewport.height, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
        canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        onLayout(pageNumber);
        setPageSize({ width: viewport.width, height: viewport.height, scale: effectiveScale });
        renderTask = page.render({ canvas, canvasContext: context, viewport, transform:[pixelRatio,0,0,pixelRatio,0,0] });
        return renderTask.promise;
      })
      .catch((error) => {
        if (!cancelled && error?.name !== "RenderingCancelledException") setRenderError(true);
      });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [containerWidth, containerHeight, fitMode, pageNumber, pdf, zoomPercent,onLayout]);

  useEffect(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery || renderError) {
      setHighlights([]);
      onMatches(pageNumber,renderError?null:0);
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
        onMatches(pageNumber,nextHighlights.length);
      })
      .catch(() => {
        if (!cancelled) {setHighlights([]);onMatches(pageNumber,null);}
      });
    return () => {
      cancelled = true;
    };
  }, [pageNumber, pageSize.height, pageSize.scale, pdf, query, renderError,onMatches]);

  return (
    <div data-pdf-page={pageNumber} className="scroll-mt-3" style={{minHeight:minimumHeight}}>
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
