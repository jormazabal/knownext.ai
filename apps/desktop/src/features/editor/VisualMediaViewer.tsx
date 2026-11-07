import { Maximize2, Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {ModalFrame} from "../../components/ui/ModalFrame";
import { renderMermaidSvg } from "./mermaidDiagrams";

export type VisualMediaViewerMedia =
  | {
      kind: "image";
      src: string;
      alt?: string | null;
    }
  | {
      kind: "diagram";
      svg?: string | null;
      code?: string | null;
      label?: string | null;
    };

type VisualMediaViewerProps = {
  media: VisualMediaViewerMedia;
  onClose: () => void;
};

export function VisualMediaViewer({ media, onClose }: VisualMediaViewerProps) {
  const mediaKind=media.kind,imageSource=media.kind==="image"?media.src:null,providedSvg=media.kind==="diagram"?media.svg??null:null,diagramCode=media.kind==="diagram"?media.code??null:null;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging,setDragging]=useState(false);
  const viewport=useRef<HTMLDivElement>(null),points=useRef(new Map<number,{x:number;y:number}>()),view=useRef({zoom:1,pan:{x:0,y:0}});
  const gesture=useRef<{distance:number;center:{x:number;y:number};zoom:number;pan:{x:number;y:number}}|null>(null);
  const [diagramSvg, setDiagramSvg] = useState(media.kind === "diagram" ? media.svg ?? null : null);
  const [diagramImageUrl, setDiagramImageUrl] = useState<string | null>(null);
  const [diagramError, setDiagramError] = useState<string | null>(null);
  const diagramFrame = useMemo(() => (media.kind === "diagram" ? readSvgFrame(diagramSvg) : null), [diagramSvg, media.kind]);

  useEffect(()=>{cancelGesture();applyView(1,{x:0,y:0});return cancelGesture;},[mediaKind,imageSource,providedSvg,diagramCode]);

  useEffect(() => {
    if (mediaKind !== "diagram") return;
    setDiagramSvg(providedSvg);
    setDiagramError(null);
    if (providedSvg || !diagramCode?.trim()) return;

    let cancelled = false;
    renderMermaidSvg(diagramCode, "knownext-fullscreen-diagram")
      .then((svg) => {
        if (!cancelled) setDiagramSvg(svg);
      })
      .catch((error) => {
        if (!cancelled) setDiagramError(error instanceof Error && error.message ? error.message : "No se pudo renderizar el diagrama.");
      });
    return () => {
      cancelled = true;
    };
  }, [mediaKind,providedSvg,diagramCode]);

  useEffect(() => {
    if (media.kind !== "diagram" || !diagramSvg) {
      setDiagramImageUrl(null);
      return;
    }

    const url = URL.createObjectURL(new Blob([diagramSvg], { type: "image/svg+xml;charset=utf-8" }));
    setDiagramImageUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [diagramSvg, media.kind]);

  function applyView(nextZoom:number,nextPan:{x:number;y:number}){
    const bounded=Math.max(0.5,Math.min(4,Math.round(nextZoom*100)/100));
    if(!Number.isFinite(bounded)||!Number.isFinite(nextPan.x)||!Number.isFinite(nextPan.y))return;
    const position=bounded<=1?{x:0,y:0}:nextPan;view.current={zoom:bounded,pan:position};setZoom(bounded);setPan(position);
  }
  function cancelGesture(){const captured=[...points.current.keys()];points.current.clear();gesture.current=null;setDragging(false);for(const id of captured){try{if(viewport.current?.hasPointerCapture?.(id))viewport.current.releasePointerCapture(id);}catch{/* Capture may already have been cancelled by the device. */}}}
  function setZoomLevel(nextZoom:number){cancelGesture();applyView(nextZoom,view.current.pan);}
  function resetView(){cancelGesture();applyView(1,{x:0,y:0});}
  function baseline(){const values=[...points.current.values()];if(!values.length){gesture.current=null;setDragging(false);return;}const a=values[0],b=values[1];gesture.current={distance:b?Math.hypot(b.x-a.x,b.y-a.y):0,center:b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:a,zoom:view.current.zoom,pan:{...view.current.pan}};setDragging(values.length>1||view.current.zoom>1);}
  function handlePointerDown(event:ReactPointerEvent<HTMLDivElement>){
    if(event.pointerType==="mouse"&&event.button!==0||points.current.size>=2)return;
    points.current.set(event.pointerId,{x:event.clientX,y:event.clientY});try{event.currentTarget.setPointerCapture?.(event.pointerId);}catch{/* Cancellation is handled without retaining capture state. */}baseline();
  }
  function handlePointerMove(event:ReactPointerEvent<HTMLDivElement>){
    if(!points.current.has(event.pointerId)||!gesture.current)return;points.current.set(event.pointerId,{x:event.clientX,y:event.clientY});const base=gesture.current,values=[...points.current.values()],a=values[0],b=values[1];
    if(b){const distance=Math.hypot(b.x-a.x,b.y-a.y);if(base.distance<=0||!Number.isFinite(distance))return;const z=Math.max(0.5,Math.min(4,base.zoom*distance/base.distance)),center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},bounds=event.currentTarget.getBoundingClientRect(),origin={x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2};applyView(z,{x:center.x-origin.x-(base.center.x-origin.x-base.pan.x)*z/base.zoom,y:center.y-origin.y-(base.center.y-origin.y-base.pan.y)*z/base.zoom});}
    else if(view.current.zoom>1)applyView(view.current.zoom,{x:base.pan.x+a.x-base.center.x,y:base.pan.y+a.y-base.center.y});
  }
  function handlePointerUp(event:ReactPointerEvent<HTMLDivElement>){if(!points.current.delete(event.pointerId))return;try{if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}catch{/* A lost capture cannot continue dragging. */}baseline();}
  function handleLostCapture(event:ReactPointerEvent<HTMLDivElement>){if(points.current.has(event.pointerId))cancelGesture();}

  const title = media.kind === "image" ? media.alt || "Imagen" : media.label || "Diagrama";

  return (
    <ModalFrame label={`Vista completa: ${title}`} onClose={onClose} className="!z-[120] !flex !flex-col !items-stretch !justify-start !overflow-hidden !bg-[#111827]/95 !p-0 text-white">
    <div className="flex h-full min-h-0 w-full flex-col" data-knownext-media-viewer="true">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-1 border-b border-white/10 px-2 py-1 sm:flex-nowrap sm:px-4">
        <p className="min-w-0 basis-full truncate text-[12px] font-semibold sm:basis-auto">{title}</p>
        <div className="flex items-center gap-1">
          <button type="button" className="knownext-media-viewer-button !min-h-11 !min-w-11" aria-label="Reducir zoom" title="Reducir zoom" onClick={() => setZoomLevel(zoom - 0.25)}>
            <Minus size={16} />
          </button>
          <button type="button" className="knownext-media-viewer-button !min-h-11 !min-w-11 min-w-12 px-2 text-[11px] font-semibold" aria-label="Zoom al 100%" title="Zoom al 100%" onClick={() => setZoomLevel(1)}>
            <output aria-label="Nivel de zoom">{Math.round(zoom*100)}%</output>
          </button>
          <button type="button" className="knownext-media-viewer-button !min-h-11 !min-w-11 px-2 text-[11px] font-semibold" aria-label="Ajustar a pantalla" title="Ajustar" onClick={resetView}>
            <Maximize2 size={14} />
            <span>Ajustar</span>
          </button>
          <button type="button" className="knownext-media-viewer-button !min-h-11 !min-w-11" aria-label="Aumentar zoom" title="Aumentar zoom" onClick={() => setZoomLevel(zoom + 0.25)}>
            <Plus size={16} />
          </button>
          <button type="button" className="knownext-media-viewer-button !min-h-11 !min-w-11 ml-2" data-autofocus aria-label="Cerrar" title="Cerrar" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
      </header>

      <div
        ref={viewport}
        data-knownext-media-viewport="true"
        style={{touchAction:"none"}}
        className={["relative grid min-h-0 flex-1 place-items-center overflow-hidden p-6", zoom > 1 ? dragging ? "cursor-grabbing" : "cursor-grab" : "cursor-default"].join(" ")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={handleLostCapture}
      >
        <div
          className="knownext-media-viewer-content"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition:dragging?"none":undefined,
          }}
        >
          {media.kind === "image" ? (
            <img className="max-h-[calc(100dvh-120px)] max-w-[calc(100vw-64px)] select-none rounded-md bg-white object-contain" src={media.src} alt={media.alt ?? ""} draggable={false} />
          ) : diagramImageUrl ? (
            <div className="knownext-media-viewer-diagram-frame rounded-md bg-white" style={buildDiagramFrameStyle(diagramFrame)}>
              <img
                className="h-full w-full select-none object-contain"
                src={diagramImageUrl}
                alt={media.label ?? "Diagrama"}
                draggable={false}
                onError={() => setDiagramError("No se pudo visualizar el diagrama a pantalla completa.")}
              />
            </div>
          ) : diagramError ? (
            <div className="max-w-[520px] rounded-md border border-orange-200 bg-white px-4 py-3 text-center text-[12px] font-semibold text-brand-orange">
              {diagramError}
            </div>
          ) : (
            <div className="rounded-md border border-white/10 bg-white/10 px-4 py-3 text-[12px] font-semibold text-white/80">
              Renderizando diagrama...
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalFrame>
  );
}

type SvgFrame = {
  width: number;
  height: number;
};

function readSvgFrame(svg: string | null) {
  if (!svg) return null;
  const viewBoxMatch = svg.match(/\bviewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  if (viewBoxMatch) {
    const width = Number.parseFloat(viewBoxMatch[1]);
    const height = Number.parseFloat(viewBoxMatch[2]);
    if (isValidSvgLength(width) && isValidSvgLength(height)) return { width, height };
  }

  const width = readSvgLength(svg, "width");
  const height = readSvgLength(svg, "height");
  if (typeof width === "number" && typeof height === "number" && isValidSvgLength(width) && isValidSvgLength(height)) return { width, height };
  return null;
}

function readSvgLength(svg: string, attributeName: "width" | "height") {
  const match = svg.match(new RegExp(`\\b${attributeName}=["']([\\d.]+)`, "i"));
  return match ? Number.parseFloat(match[1]) : null;
}

function isValidSvgLength(value: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function buildDiagramFrameStyle(frame: SvgFrame | null): CSSProperties {
  const width = Math.min(Math.max(frame?.width ?? 960, 320), 1400);
  const height = Math.min(Math.max(frame?.height ?? 540, 180), 1000);
  return {
    width: `min(calc(100vw - 64px), ${Math.round(width)}px)`,
    height: `min(calc(100dvh - 120px), ${Math.round(height)}px)`,
    aspectRatio: `${width} / ${height}`,
  };
}
