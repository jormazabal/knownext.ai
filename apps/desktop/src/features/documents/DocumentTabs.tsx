import { FileText, X } from "lucide-react";
import type { OpenDocumentTab } from "../../types/domain";

type DocumentTabsProps = {
  tabs: OpenDocumentTab[];
  activeDocumentId: string;
  dirtyDocumentIds: string[];
  onSelectTab: (documentId: string) => void;
  onCloseTab: (documentId: string) => void;
};

export function DocumentTabs({ tabs, activeDocumentId, dirtyDocumentIds, onSelectTab, onCloseTab }: DocumentTabsProps) {
  const dirtyIds = new Set(dirtyDocumentIds);

  return (
    <div className="flex h-[54px] items-end border-b border-line bg-white">
      <div className="flex h-full min-w-0 items-end">
        {tabs.map((tab) => {
          const active = tab.id === activeDocumentId;
          const dirty = dirtyIds.has(tab.id);
          return (
            <button
              key={tab.id}
              className={[
                "group relative flex h-full min-w-[180px] max-w-[230px] items-center gap-2 border-r border-line px-4 text-[13px]",
                active ? "bg-white font-semibold" : "text-ink-primary hover:bg-panel",
              ].join(" ")}
              onClick={() => onSelectTab(tab.id)}
            >
              <FileText size={15} className={active ? "text-brand-orange" : "text-ink-secondary"} />
              <span className="truncate">{tab.name}</span>
              <span
                className="ml-auto grid h-6 w-6 place-items-center rounded hover:bg-brand-hover"
                aria-label={dirty ? `Cerrar ${tab.name}, con cambios sin guardar` : `Cerrar ${tab.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.id);
                }}
              >
                {dirty ? <span className="h-2.5 w-2.5 rounded-full bg-brand-orange" /> : <X size={13} />}
              </span>
              {active ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-brand-orange" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
