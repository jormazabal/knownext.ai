import { Maximize2, Minus, X } from "lucide-react";

export function TitleBar() {
  return (
    <header className="flex h-[54px] items-center justify-between border-b border-line bg-white px-5">
      <div className="flex items-center gap-3">
        <img className="h-7 w-7 object-contain" src="/brand/knownext-logo.png" alt="" aria-hidden="true" />
        <span className="text-[15px] font-semibold">KnowNext.ai</span>
      </div>
      <div className="flex items-center gap-2 text-ink-primary">
        <button className="window-control" data-tooltip="Minimizar" data-tooltip-placement="bottom" aria-label="Minimizar">
          <Minus size={16} />
        </button>
        <button className="window-control" data-tooltip="Maximizar" data-tooltip-placement="bottom" aria-label="Maximizar">
          <Maximize2 size={14} />
        </button>
        <button className="window-control" data-tooltip="Cerrar" data-tooltip-placement="bottom" aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
