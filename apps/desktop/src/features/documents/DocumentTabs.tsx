import { ChevronLeft, ChevronRight, FileText, FileSpreadsheet, Image, List, PanelLeftOpen, ScrollText, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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
  const tabsViewportRef = useRef<HTMLDivElement | null>(null);
  const tabListMenuRef = useRef<HTMLDivElement | null>(null);
  const [tabsOverflowing, setTabsOverflowing] = useState(false);
  const [tabListOpen, setTabListOpen] = useState(false);
  const activeTabIndex = tabs.findIndex((tab) => tab.id === activeTabId);
  const canSelectPreviousTab = activeTabIndex > 0;
  const canSelectNextTab = activeTabIndex >= 0 && activeTabIndex < tabs.length - 1;

  useEffect(() => {
    const viewport = tabsViewportRef.current;
    if (!viewport) return;
    const tabsViewport = viewport;

    function updateOverflow() {
      setTabsOverflowing(tabsViewport.scrollWidth > tabsViewport.clientWidth + 1);
    }

    updateOverflow();
    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(updateOverflow);
      resizeObserver.observe(tabsViewport);
      return () => resizeObserver.disconnect();
    }
    window.addEventListener("resize", updateOverflow);
    return () => window.removeEventListener("resize", updateOverflow);
  }, [tabs.length]);

  useEffect(() => {
    const activeTab = Array.from(tabsViewportRef.current?.querySelectorAll("[data-tab-id]") ?? [])
      .find((element) => element.getAttribute("data-tab-id") === activeTabId);
    if (activeTab instanceof HTMLElement && typeof activeTab.scrollIntoView === "function") {
      activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeTabId]);

  useEffect(() => {
    if (!tabListOpen) return;
    function closeOnOutsideInteraction(event: PointerEvent) {
      if (!tabListMenuRef.current?.contains(event.target as Node)) setTabListOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setTabListOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [tabListOpen]);

  function selectAdjacentTab(direction: "previous" | "next") {
    const nextIndex = direction === "previous" ? activeTabIndex - 1 : activeTabIndex + 1;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    onSelectTab(nextTab.id);
    setTabListOpen(false);
  }

  return (
    <div className="knownext-document-tabs flex h-9 shrink-0 items-end border-b border-line bg-white">
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
      <div ref={tabsViewportRef} className="flex h-full min-w-0 flex-1 items-end overflow-x-hidden overflow-y-hidden">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const dirty = tab.kind === "document" && dirtyIds.has(tab.id);
          const Icon = tab.kind === "release-notes" ? ScrollText : tab.kind === "ai-conversation" ? Sparkles : tab.kind === "image" ? Image : tab.kind === "reference-document" && tab.format === "xlsx" ? FileSpreadsheet : FileText;
          const isAiTab = tab.kind === "ai-conversation";
          return (
            <button
              key={tab.id}
              aria-label={isAiTab ? "IA" : tab.name}
              data-tab-id={tab.id}
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
      {tabsOverflowing ? (
        <div ref={tabListMenuRef} className="relative flex h-full shrink-0 items-center border-l border-line bg-white px-1">
          <button
            className="grid h-7 w-7 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-secondary"
            type="button"
            data-tooltip="Pestañas abiertas"
            data-tooltip-placement="bottom"
            aria-label="Mostrar pestañas abiertas"
            aria-expanded={tabListOpen}
            onClick={() => setTabListOpen((open) => !open)}
          >
            <List size={14} />
          </button>
          <button
            className="grid h-7 w-7 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-secondary"
            type="button"
            data-tooltip="Pestaña anterior"
            data-tooltip-placement="bottom"
            aria-label="Pestaña anterior"
            disabled={!canSelectPreviousTab}
            onClick={() => selectAdjacentTab("previous")}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            className="grid h-7 w-7 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-secondary"
            type="button"
            data-tooltip="Pestaña siguiente"
            data-tooltip-placement="bottom"
            aria-label="Pestaña siguiente"
            disabled={!canSelectNextTab}
            onClick={() => selectAdjacentTab("next")}
          >
            <ChevronRight size={14} />
          </button>
          {tabListOpen ? (
            <div className="absolute right-1 top-9 z-50 max-h-80 w-72 overflow-y-auto rounded-md border border-line bg-white p-1 shadow-lg">
              {tabs.map((tab) => {
                const active = tab.id === activeTabId;
                const dirty = tab.kind === "document" && dirtyIds.has(tab.id);
                const Icon = tab.kind === "release-notes" ? ScrollText : tab.kind === "ai-conversation" ? Sparkles : tab.kind === "image" ? Image : tab.kind === "reference-document" && tab.format === "xlsx" ? FileSpreadsheet : FileText;
                return (
                  <button
                    key={tab.id}
                    className={[
                      "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] outline-none",
                      active ? "bg-brand-hover text-brand-orange" : "text-ink-primary hover:bg-panel",
                    ].join(" ")}
                    type="button"
                    onClick={() => {
                      onSelectTab(tab.id);
                      setTabListOpen(false);
                    }}
                  >
                    <Icon size={14} className={active ? "shrink-0 text-brand-orange" : "shrink-0 text-ink-secondary"} />
                    <span className="min-w-0 flex-1 truncate font-medium">{tab.name}</span>
                    {dirty ? <span className="h-2 w-2 shrink-0 rounded-full bg-brand-orange" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
      {rightSlot}
    </div>
  );
}
