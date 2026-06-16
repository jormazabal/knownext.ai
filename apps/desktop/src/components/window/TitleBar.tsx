import type { MouseEvent, PointerEvent } from "react";
import { useRef } from "react";
import { Maximize2, Minus, X } from "lucide-react";
import { BrandMark } from "../brand/BrandMark";
import { closeWindow, minimizeWindow, startWindowDrag, startWindowResize, toggleMaximizeWindow } from "../../lib/runtime/windowControls";

export function TitleBar() {
  const suppressNextDoubleClickRef = useRef(false);
  const dragCandidateRef = useRef<{ x: number; y: number } | null>(null);

  function clearDragCandidate() {
    dragCandidateRef.current = null;
    window.removeEventListener("pointermove", handleTitlePointerMove);
    window.removeEventListener("pointerup", handleTitlePointerUp);
  }

  const handleTopResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    void startWindowResize("North");
  };

  const handleTitlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (event.detail > 1) {
      event.preventDefault();
      clearDragCandidate();
      suppressNextDoubleClickRef.current = true;
      void toggleMaximizeWindow();
      return;
    }

    dragCandidateRef.current = { x: event.clientX, y: event.clientY };
    window.addEventListener("pointermove", handleTitlePointerMove);
    window.addEventListener("pointerup", handleTitlePointerUp, { once: true });
  };

  function handleTitlePointerMove(event: globalThis.PointerEvent) {
    const candidate = dragCandidateRef.current;
    if (!candidate) return;
    const distance = Math.abs(event.clientX - candidate.x) + Math.abs(event.clientY - candidate.y);
    if (distance < 4) return;
    clearDragCandidate();
    void startWindowDrag();
  }

  function handleTitlePointerUp() {
    clearDragCandidate();
  }

  const handleTitleDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    clearDragCandidate();
    if (suppressNextDoubleClickRef.current) {
      suppressNextDoubleClickRef.current = false;
      return;
    }
    void toggleMaximizeWindow();
  };

  return (
    <header
      className="relative flex h-9 select-none items-center justify-between border-b border-line bg-white px-3"
      onDoubleClick={handleTitleDoubleClick}
      onPointerDown={handleTitlePointerDown}
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 z-30 h-1.5 cursor-n-resize" onPointerDown={handleTopResizePointerDown} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <BrandMark className="h-5 w-5" />
        <span className="text-[11px] font-semibold">KnowNext.ai</span>
      </div>
      <div className="flex items-center gap-1 text-ink-primary" onDoubleClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
        <button className="window-control" data-tooltip="Minimizar" data-tooltip-placement="bottom" aria-label="Minimizar" onClick={() => void minimizeWindow()}>
          <Minus size={14} />
        </button>
        <button className="window-control" data-tooltip="Maximizar" data-tooltip-placement="bottom" aria-label="Maximizar" onClick={() => void toggleMaximizeWindow()}>
          <Maximize2 size={13} />
        </button>
        <button className="window-control window-control-close" data-tooltip="Cerrar" data-tooltip-placement="bottom" aria-label="Cerrar" onClick={() => void closeWindow()}>
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
