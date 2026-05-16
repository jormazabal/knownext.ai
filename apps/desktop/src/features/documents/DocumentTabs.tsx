import { FileText, Image, PanelLeftOpen, ScrollText, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkspaceTab } from "../../types/domain";

type DocumentTabsProps = {
  tabs: WorkspaceTab[];
  activeTabId: string;
  dirtyDocumentIds: string[];
  onOpenNavigation?: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  rightSlot?: ReactNode;
};

export function DocumentTabs({ tabs, activeTabId, dirtyDocumentIds, onOpenNavigation, onSelectTab, onCloseTab, rightSlot }: DocumentTabsProps) {
  const dirtyIds = new Set(dirtyDocumentIds);

  return (
    <div className="knownext-document-tabs flex h-9 shrink-0 items-end overflow-y-hidden border-b border-line bg-white">
      {onOpenNavigation ? (
        <button
          className="grid h-full w-10 shrink-0 place-items-center border-r border-line text-ink-secondary hover:bg-brand-hover hover:text-brand-orange lg:hidden"
          data-tooltip="Abrir documentos"
          data-tooltip-placement="bottom"
          aria-label="Abrir panel de documentos"
          onClick={onOpenNavigation}
        >
          <PanelLeftOpen size={16} />
        </button>
      ) : null}
      <div className="flex h-full min-w-0 flex-1 items-end overflow-x-auto overflow-y-hidden">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const dirty = tab.kind === "document" && dirtyIds.has(tab.id);
          const Icon = tab.kind === "release-notes" ? ScrollText : tab.kind === "ai-conversation" ? Sparkles : tab.kind === "image" ? Image : FileText;
          const isAiTab = tab.kind === "ai-conversation";
          return (
            <button
              key={tab.id}
              aria-label={isAiTab ? "IA" : tab.name}
              data-tooltip={isAiTab ? "IA" : undefined}
              data-tooltip-placement={isAiTab ? "bottom" : undefined}
              className={[
                "knownext-document-tab group relative flex h-full items-center gap-1.5 border-r border-line text-[11px]",
                isAiTab ? "w-12 min-w-12 max-w-12 justify-center px-0" : "min-w-[150px] max-w-[210px] px-2.5",
                active ? "knownext-document-tab-active bg-white font-semibold" : "text-ink-primary hover:bg-panel",
              ].join(" ")}
              onClick={() => onSelectTab(tab.id)}
            >
              <Icon size={15} className={active ? "text-brand-orange" : "text-ink-secondary"} />
              {isAiTab ? null : <span className="truncate">{tab.name}</span>}
              {isAiTab ? (
                null
              ) : (
                <span
                  className="knownext-document-tab-close ml-auto grid h-5 w-5 place-items-center rounded hover:bg-brand-hover"
                  aria-label={dirty ? `Cerrar ${tab.name}, con cambios sin guardar` : `Cerrar ${tab.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                >
                  {dirty ? <span className="h-2.5 w-2.5 rounded-full bg-brand-orange" /> : <X size={13} />}
                </span>
              )}
              {active ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-brand-orange" /> : null}
            </button>
          );
        })}
      </div>
      {rightSlot}
    </div>
  );
}
