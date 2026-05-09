import type { PointerEvent } from "react";
import { Maximize2, Minus, X } from "lucide-react";
import { closeWindow, minimizeWindow, startWindowDrag, toggleMaximizeWindow } from "../../lib/runtime/windowControls";

export function TitleBar() {
  const handleTitlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (event.detail > 1) {
      void toggleMaximizeWindow();
      return;
    }

    void startWindowDrag();
  };

  return (
    <header className="flex h-[54px] select-none items-center justify-between border-b border-line bg-white">
      <div className="flex h-full min-w-0 flex-1 items-center gap-3 px-5" onPointerDown={handleTitlePointerDown}>
        <img className="h-7 w-7 object-contain" src="/brand/knownext-logo.png" alt="" aria-hidden="true" />
        <span className="text-[15px] font-semibold">KnowNext.ai</span>
      </div>
      <div className="flex h-full items-center gap-1 px-3 text-ink-primary">
        <button className="window-control" data-tooltip="Minimizar" data-tooltip-placement="bottom" aria-label="Minimizar" onClick={() => void minimizeWindow()}>
          <Minus size={16} />
        </button>
        <button className="window-control" data-tooltip="Maximizar" data-tooltip-placement="bottom" aria-label="Maximizar" onClick={() => void toggleMaximizeWindow()}>
          <Maximize2 size={14} />
        </button>
        <button className="window-control window-control-close" data-tooltip="Cerrar" data-tooltip-placement="bottom" aria-label="Cerrar" onClick={() => void closeWindow()}>
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
