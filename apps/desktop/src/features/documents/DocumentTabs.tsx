import { ChevronLeft, ChevronRight, FileText, FileSpreadsheet, Image, List, NotebookPen, PanelLeftOpen, ScrollText, Sparkles, X } from "lucide-react";
import type { DragEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceTab } from "../../types/domain";

type DocumentTabsProps = {
  tabs: WorkspaceTab[];
  activeTabId: string;
  dirtyDocumentIds: string[];
  onOpenNavigation?: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onReorderDocumentTabs?: (draggedTabId: string, targetTabId: string, placement: "before" | "after") => void;
  rightSlot?: ReactNode;
};

export function DocumentTabs({ tabs, activeTabId, dirtyDocumentIds, onOpenNavigation, onSelectTab, onCloseTab, onReorderDocumentTabs, rightSlot }: DocumentTabsProps) {
  const dirtyIds = new Set(dirtyDocumentIds);
  const fixedTabs = tabs.filter((tab) => isFixedUtilityTab(tab));
  const scrollableTabs = tabs.filter((tab) => !isFixedUtilityTab(tab));
  const tabsViewportRef = useRef<HTMLDivElement | null>(null);
  const tabListMenuRef = useRef<HTMLDivElement | null>(null);
  const [tabsOverflowing, setTabsOverflowing] = useState(false);
  const [tabListOpen, setTabListOpen] = useState(false);
  const [draggedDocumentTabId, setDraggedDocumentTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ tabId: string; placement: "before" | "after" } | null>(null);
  const pointerDragRef = useRef<{ tabId: string; startX: number; startY: number; dragging: boolean } | null>(null);
  const suppressNextTabClickRef = useRef(false);
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
  }, [scrollableTabs.length]);

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

  function handleTabClick(tabId: string) {
    if (suppressNextTabClickRef.current) {
      suppressNextTabClickRef.current = false;
      return;
    }
    onSelectTab(tabId);
  }

  function handleDocumentPointerDown(tabId: string, event: ReactPointerEvent<HTMLElement>) {
    if (!onReorderDocumentTabs || event.button !== 0) return;
    pointerDragRef.current = { tabId, startX: event.clientX, startY: event.clientY, dragging: false };
    window.addEventListener("pointermove", handleDocumentPointerMove);
    window.addEventListener("pointerup", handleDocumentPointerUp, { once: true });
  }

  function handleDocumentPointerMove(event: PointerEvent) {
    const drag = pointerDragRef.current;
    if (!drag) return;
    if (!drag.dragging) {
      const distance = Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY);
      if (distance < 8) return;
      drag.dragging = true;
      setDraggedDocumentTabId(drag.tabId);
    }
    const target = findDocumentDropTarget(event.clientX, event.clientY, drag.tabId);
    setDropTarget(target);
    event.preventDefault();
  }

  function handleDocumentPointerUp(event: PointerEvent) {
    window.removeEventListener("pointermove", handleDocumentPointerMove);
    const drag = pointerDragRef.current;
    pointerDragRef.current = null;
    if (!drag) return;

    const target = drag.dragging ? findDocumentDropTarget(event.clientX, event.clientY, drag.tabId) ?? dropTarget : null;
    if (drag.dragging) suppressNextTabClickRef.current = true;
    setDraggedDocumentTabId(null);
    setDropTarget(null);
    if (target && onReorderDocumentTabs) onReorderDocumentTabs(drag.tabId, target.tabId, target.placement);
  }

  function findDocumentDropTarget(clientX: number, clientY: number, draggedTabId: string) {
    const candidates = Array.from(tabsViewportRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? []);
    for (const candidate of candidates) {
      const tabId = candidate.getAttribute("data-tab-id");
      const tab = tabs.find((item) => item.id === tabId);
      if (!tabId || tabId === draggedTabId || tab?.kind !== "document") continue;
      const rect = candidate.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
      return { tabId, placement: clientX < rect.left + rect.width / 2 ? "before" as const : "after" as const };
    }
    return null;
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
      {fixedTabs.length > 0 ? (
        <div className="flex h-full shrink-0 items-end border-r border-line bg-white">
          {fixedTabs.map((tab) => (
            <WorkspaceTabButton
              key={tab.id}
              tab={tab}
              active={tab.id === activeTabId}
              dirty={false}
              fixed
              onSelectTab={handleTabClick}
              onCloseTab={onCloseTab}
            />
          ))}
        </div>
      ) : null}
      <div ref={tabsViewportRef} className="flex h-full min-w-0 flex-1 items-end overflow-x-hidden overflow-y-hidden">
        {scrollableTabs.map((tab) => (
          <WorkspaceTabButton
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            dirty={tab.kind === "document" && dirtyIds.has(tab.id)}
            dragging={tab.id === draggedDocumentTabId}
            draggedDocumentTabId={draggedDocumentTabId}
            dropPlacement={dropTarget?.tabId === tab.id ? dropTarget.placement : null}
            onSelectTab={handleTabClick}
            onCloseTab={onCloseTab}
            onReorderDocumentTabs={onReorderDocumentTabs}
            onDocumentDragStart={setDraggedDocumentTabId}
            onDocumentDragEnd={() => {
              setDraggedDocumentTabId(null);
              setDropTarget(null);
            }}
            onDocumentDragOver={setDropTarget}
            onDocumentPointerDown={handleDocumentPointerDown}
          />
        ))}
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
                const Icon = getTabIcon(tab);
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

function WorkspaceTabButton({
  tab,
  active,
  dirty,
  dragging = false,
  draggedDocumentTabId = null,
  dropPlacement = null,
  fixed = false,
  onSelectTab,
  onCloseTab,
  onReorderDocumentTabs,
  onDocumentDragStart,
  onDocumentDragEnd,
  onDocumentDragOver,
  onDocumentPointerDown,
}: {
  tab: WorkspaceTab;
  active: boolean;
  dirty: boolean;
  dragging?: boolean;
  draggedDocumentTabId?: string | null;
  dropPlacement?: "before" | "after" | null;
  fixed?: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onReorderDocumentTabs?: (draggedTabId: string, targetTabId: string, placement: "before" | "after") => void;
  onDocumentDragStart?: (tabId: string) => void;
  onDocumentDragEnd?: () => void;
  onDocumentDragOver?: (target: { tabId: string; placement: "before" | "after" } | null) => void;
  onDocumentPointerDown?: (tabId: string, event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const Icon = getTabIcon(tab);
  const closeable = !isFixedUtilityTab(tab);
  const draggable = tab.kind === "document" && Boolean(onReorderDocumentTabs);
  return (
    <button
      aria-label={tab.name}
      draggable={draggable}
      data-tab-id={fixed ? undefined : tab.id}
      data-tooltip={fixed ? tab.name : undefined}
      data-tooltip-placement={fixed ? "bottom" : undefined}
      className={[
        "knownext-document-tab group relative flex h-full items-center gap-1.5 border-r border-line text-[11px]",
        fixed ? "w-12 min-w-12 max-w-12 justify-center px-0" : "min-w-[150px] max-w-[210px] px-2.5",
        draggable ? "cursor-grab active:cursor-grabbing" : "",
        dragging ? "opacity-50" : "",
        active ? "knownext-document-tab-active bg-white font-semibold" : "text-ink-primary hover:bg-panel",
      ].join(" ")}
      onClick={() => onSelectTab(tab.id)}
      onPointerDown={(event) => {
        if (draggable) onDocumentPointerDown?.(tab.id, event);
      }}
      onDragStart={(event) => {
        if (!draggable) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-knownext-document-tab", tab.id);
        event.dataTransfer.setData("text/plain", tab.id);
        onDocumentDragStart?.(tab.id);
      }}
      onDragEnd={() => onDocumentDragEnd?.()}
      onDragOver={(event) => {
        if (tab.kind !== "document" || !onReorderDocumentTabs) return;
        const draggedTabId = draggedDocumentTabId || event.dataTransfer.getData("application/x-knownext-document-tab") || event.dataTransfer.getData("text/plain");
        if (!draggedTabId || draggedTabId === tab.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDocumentDragOver?.({ tabId: tab.id, placement: getDropPlacement(event) });
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        onDocumentDragOver?.(null);
      }}
      onDrop={(event) => {
        if (tab.kind !== "document" || !onReorderDocumentTabs) return;
        const draggedTabId = event.dataTransfer.getData("application/x-knownext-document-tab") || event.dataTransfer.getData("text/plain") || draggedDocumentTabId;
        if (!draggedTabId || draggedTabId === tab.id) return;
        event.preventDefault();
        const placement = getDropPlacement(event);
        onReorderDocumentTabs(draggedTabId, tab.id, placement);
        onDocumentDragEnd?.();
      }}
    >
      {dropPlacement === "before" ? <span className="absolute bottom-1 left-0 top-1 w-[2px] rounded-full bg-brand-orange" /> : null}
      <Icon size={15} className={active ? "text-brand-orange" : "text-ink-secondary"} />
      {fixed ? null : <span className="truncate">{tab.name}</span>}
      {!closeable ? (
        null
      ) : (
        <span
          className="knownext-document-tab-close ml-auto grid h-5 w-5 place-items-center rounded hover:bg-brand-hover"
          aria-label={dirty ? `Cerrar ${tab.name}, con cambios sin guardar` : `Cerrar ${tab.name}`}
          draggable={false}
          onClick={(event) => {
            event.stopPropagation();
            onCloseTab(tab.id);
          }}
        >
          {dirty ? <span className="h-2.5 w-2.5 rounded-full bg-brand-orange" /> : <X size={13} />}
        </span>
      )}
      {dropPlacement === "after" ? <span className="absolute bottom-1 right-0 top-1 w-[2px] rounded-full bg-brand-orange" /> : null}
      {active ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-brand-orange" /> : null}
    </button>
  );
}

function getDropPlacement(event: DragEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX < rect.left + rect.width / 2 ? "before" : "after";
}

function isFixedUtilityTab(tab: WorkspaceTab) {
  return tab.kind === "ai-conversation" || tab.kind === "notes";
}

function getTabIcon(tab: WorkspaceTab) {
  if (tab.kind === "release-notes") return ScrollText;
  if (tab.kind === "notes") return NotebookPen;
  if (tab.kind === "ai-conversation") return Sparkles;
  if (tab.kind === "image") return Image;
  if (tab.kind === "reference-document" && tab.format === "xlsx") return FileSpreadsheet;
  return FileText;
}
