import { Maximize2, Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [diagramSvg, setDiagramSvg] = useState(media.kind === "diagram" ? media.svg ?? null : null);
  const [diagramImageUrl, setDiagramImageUrl] = useState<string | null>(null);
  const [diagramError, setDiagramError] = useState<string | null>(null);
  const diagramFrame = useMemo(() => (media.kind === "diagram" ? readSvgFrame(diagramSvg) : null), [diagramSvg, media.kind]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (media.kind !== "diagram") return;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDiagramSvg(media.svg ?? null);
    setDiagramError(null);
    if (media.svg || !media.code?.trim()) return;

    let cancelled = false;
    renderMermaidSvg(media.code, "knownext-fullscreen-diagram")
      .then((svg) => {
        if (!cancelled) setDiagramSvg(svg);
      })
      .catch((error) => {
        if (!cancelled) setDiagramError(error instanceof Error && error.message ? error.message : "No se pudo renderizar el diagrama.");
      });
    return () => {
      cancelled = true;
    };
  }, [media]);

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

  function setZoomLevel(nextZoom: number) {
    const boundedZoom = Math.max(0.5, Math.min(4, Math.round(nextZoom * 100) / 100));
    setZoom(boundedZoom);
    if (boundedZoom <= 1) setPan({ x: 0, y: 0 });
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag?.pointerId === event.pointerId) setDrag(null);
  }

  const title = media.kind === "image" ? media.alt || "Imagen" : media.label || "Diagrama";

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#111827]/95 text-white" data-knownext-media-viewer="true" role="dialog" aria-modal="true" aria-label={`Vista completa: ${title}`}>
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4">
        <p className="min-w-0 truncate text-[12px] font-semibold">{title}</p>
        <div className="flex items-center gap-1">
          <button type="button" className="knownext-media-viewer-button" aria-label="Reducir zoom" title="Reducir zoom" onClick={() => setZoomLevel(zoom - 0.25)}>
            <Minus size={16} />
          </button>
          <button type="button" className="knownext-media-viewer-button min-w-12 px-2 text-[11px] font-semibold" aria-label="Zoom al 100%" title="Zoom al 100%" onClick={() => setZoomLevel(1)}>
            100%
          </button>
          <button type="button" className="knownext-media-viewer-button px-2 text-[11px] font-semibold" aria-label="Ajustar a pantalla" title="Ajustar" onClick={resetView}>
            <Maximize2 size={14} />
            <span>Ajustar</span>
          </button>
          <button type="button" className="knownext-media-viewer-button" aria-label="Aumentar zoom" title="Aumentar zoom" onClick={() => setZoomLevel(zoom + 0.25)}>
            <Plus size={16} />
          </button>
          <button type="button" className="knownext-media-viewer-button ml-2" aria-label="Cerrar" title="Cerrar" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
      </header>

      <div
        className={["relative grid min-h-0 flex-1 place-items-center overflow-hidden p-6", zoom > 1 ? drag ? "cursor-grabbing" : "cursor-grab" : "cursor-default"].join(" ")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="knownext-media-viewer-content"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
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
