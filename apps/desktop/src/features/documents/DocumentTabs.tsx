import { ChevronDown, ChevronLeft, ChevronRight, FileText, FileSpreadsheet, Image, List, NotebookPen, PanelLeftOpen, ScrollText, Sparkles, X } from "lucide-react";
import type { DragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { xsViewportQuery } from "../../lib/runtime/responsive";
import type { WorkspaceTab } from "../../types/domain";

type DocumentTabsProps = {
  tabs: WorkspaceTab[];
  activeTabId: string;
  activeDocumentId?: string | null;
  dirtyDocumentIds: string[];
  onOpenNavigation?: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onReorderDocumentTabs?: (draggedTabId: string, targetTabId: string, placement: "before" | "after") => void;
  rightSlot?: ReactNode;
};

export function DocumentTabs({ tabs, activeTabId, activeDocumentId = null, dirtyDocumentIds, onOpenNavigation, onSelectTab, onCloseTab, onReorderDocumentTabs, rightSlot }: DocumentTabsProps) {
  const dirtyIds = new Set(dirtyDocumentIds);
  const fixedTabs = tabs.filter((tab) => isFixedUtilityTab(tab));
  const scrollableTabs = tabs.filter((tab) => !isFixedUtilityTab(tab));
  const compactTabs = useCompactTabsMode();
  const tabsViewportRef = useRef<HTMLDivElement | null>(null);
  const tabListMenuRef = useRef<HTMLDivElement | null>(null);
  const [tabsOverflowing, setTabsOverflowing] = useState(false);
  const [tabListOpen, setTabListOpen] = useState(false);
  const [tabContextMenu, setTabContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [draggedDocumentTabId, setDraggedDocumentTabId] = useState<string | null>(null);
  const draggedDocumentTabIdRef = useRef<string | null>(null);
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

  useEffect(() => {
    if (!tabContextMenu) return;
    function closeContextMenu() {
      setTabContextMenu(null);
    }
    function closeContextMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setTabContextMenu(null);
    }
    document.addEventListener("pointerdown", closeContextMenu);
    document.addEventListener("keydown", closeContextMenuOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeContextMenu);
      document.removeEventListener("keydown", closeContextMenuOnEscape);
    };
  }, [tabContextMenu]);

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

  function openTabContextMenu(tab: WorkspaceTab, event: ReactMouseEvent<HTMLElement>) {
    if (!isCloseableTab(tab)) return;
    event.preventDefault();
    setTabListOpen(false);
    setTabContextMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });
  }

  function closeTabs(tabIds: string[]) {
    setTabContextMenu(null);
    tabIds.forEach((tabId) => onCloseTab(tabId));
  }

  function handleDocumentPointerDown(tabId: string, event: ReactPointerEvent<HTMLElement>) {
    if (!onReorderDocumentTabs || event.button !== 0) return;
    draggedDocumentTabIdRef.current = tabId;
    pointerDragRef.current = { tabId, startX: event.clientX, startY: event.clientY, dragging: false };
    window.addEventListener("pointermove", handleDocumentPointerMove);
    window.addEventListener("pointerup", handleDocumentPointerUp, { once: true });
  }

  function handleDocumentMouseDown(tabId: string, event: ReactMouseEvent<HTMLElement>) {
    if (!onReorderDocumentTabs || event.button !== 0 || pointerDragRef.current) return;
    draggedDocumentTabIdRef.current = tabId;
    pointerDragRef.current = { tabId, startX: event.clientX, startY: event.clientY, dragging: false };
    window.addEventListener("mousemove", handleDocumentMouseMove);
    window.addEventListener("mouseup", handleDocumentMouseUp, { once: true });
  }

  function handleDocumentPointerMove(event: PointerEvent) {
    updateDocumentPointerDrag(event.clientX, event.clientY);
    event.preventDefault();
  }

  function handleDocumentMouseMove(event: globalThis.MouseEvent) {
    updateDocumentPointerDrag(event.clientX, event.clientY);
    event.preventDefault();
  }

  function updateDocumentPointerDrag(clientX: number, clientY: number) {
    const drag = pointerDragRef.current;
    if (!drag) return;
    if (!drag.dragging) {
      const distance = Math.abs(clientX - drag.startX) + Math.abs(clientY - drag.startY);
      if (distance < 8) return;
      drag.dragging = true;
      setDraggedDocumentTabId(drag.tabId);
    }
    const target = findDocumentDropTarget(clientX, clientY, drag.tabId);
    setDropTarget(target);
  }

  function handleDocumentPointerUp(event: PointerEvent) {
    window.removeEventListener("pointermove", handleDocumentPointerMove);
    finishDocumentPointerDrag(event.clientX, event.clientY);
  }

  function handleDocumentMouseUp(event: globalThis.MouseEvent) {
    window.removeEventListener("mousemove", handleDocumentMouseMove);
    finishDocumentPointerDrag(event.clientX, event.clientY);
  }

  function finishDocumentPointerDrag(clientX: number, clientY: number) {
    const drag = pointerDragRef.current;
    pointerDragRef.current = null;
    if (!drag) return;
    const target = drag.dragging ? findDocumentDropTarget(clientX, clientY, drag.tabId) ?? dropTarget : null;
    if (drag.dragging) suppressNextTabClickRef.current = true;
    draggedDocumentTabIdRef.current = null;
    setDraggedDocumentTabId(null);
    setDropTarget(null);
    if (target && onReorderDocumentTabs) onReorderDocumentTabs(drag.tabId, target.tabId, target.placement);
  }

  function startNativeDocumentTabDrag(tabId: string) {
    draggedDocumentTabIdRef.current = tabId;
    setDraggedDocumentTabId(tabId);
  }

  function endNativeDocumentTabDrag() {
    draggedDocumentTabIdRef.current = null;
    setDraggedDocumentTabId(null);
    setDropTarget(null);
  }

  function findDocumentDropTarget(clientX: number, clientY: number, draggedTabId: string) {
    const candidates = Array.from(tabsViewportRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? []);
    for (const candidate of candidates) {
      const tabId = candidate.getAttribute("data-tab-id");
      const tab = tabs.find((item) => item.id === tabId);
      if (!tabId || tabId === draggedTabId || !tab || !isReorderableWorkspaceTab(tab)) continue;
      const rect = candidate.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
      return { tabId, placement: clientX < rect.left + rect.width / 2 ? "before" as const : "after" as const };
    }
    return null;
  }

  if (compactTabs) {
    return (
      <CompactDocumentTabs
        tabs={tabs}
        fixedTabs={fixedTabs}
        scrollableTabs={scrollableTabs}
        activeTabId={activeTabId}
        activeDocumentId={activeDocumentId}
        dirtyIds={dirtyIds}
        onOpenNavigation={onOpenNavigation}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onOpenTabContextMenu={openTabContextMenu}
        rightSlot={rightSlot}
      />
    );
  }

  const closeableTabs = tabs.filter(isCloseableTab);
  const contextMenuTab = tabContextMenu ? tabs.find((tab) => tab.id === tabContextMenu.tabId && isCloseableTab(tab)) ?? null : null;
  const otherCloseableTabIds = contextMenuTab ? closeableTabs.filter((tab) => tab.id !== contextMenuTab.id).map((tab) => tab.id) : [];

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
              onOpenTabContextMenu={openTabContextMenu}
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
            onOpenTabContextMenu={openTabContextMenu}
            onReorderDocumentTabs={onReorderDocumentTabs}
            onDocumentDragStart={startNativeDocumentTabDrag}
            onDocumentDragEnd={endNativeDocumentTabDrag}
            onDocumentDragOver={setDropTarget}
            activeDraggedDocumentTabIdRef={draggedDocumentTabIdRef}
            onDocumentPointerDown={handleDocumentPointerDown}
            onDocumentMouseDown={handleDocumentMouseDown}
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
      {contextMenuTab && tabContextMenu ? (
        <TabContextMenu
          x={tabContextMenu.x}
          y={tabContextMenu.y}
          closeOtherTabsDisabled={otherCloseableTabIds.length === 0}
          onClose={() => closeTabs([contextMenuTab.id])}
          onCloseOthers={() => closeTabs(otherCloseableTabIds)}
          onCloseAll={() => closeTabs(closeableTabs.map((tab) => tab.id))}
        />
      ) : null}
    </div>
  );
}

function CompactDocumentTabs({
  tabs,
  fixedTabs,
  scrollableTabs,
  activeTabId,
  activeDocumentId,
  dirtyIds,
  onOpenNavigation,
  onSelectTab,
  onCloseTab,
  onOpenTabContextMenu,
  rightSlot,
}: {
  tabs: WorkspaceTab[];
  fixedTabs: WorkspaceTab[];
  scrollableTabs: WorkspaceTab[];
  activeTabId: string;
  activeDocumentId?: string | null;
  dirtyIds: Set<string>;
  onOpenNavigation?: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onOpenTabContextMenu: (tab: WorkspaceTab, event: ReactMouseEvent<HTMLElement>) => void;
  rightSlot?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeWorkspaceTab = scrollableTabs.find((tab) => tab.id === activeTabId)
    ?? scrollableTabs.find((tab) => tab.kind === "document" && tab.id === activeDocumentId)
    ?? scrollableTabs[0]
    ?? null;

  function selectTab(tabId: string) {
    onSelectTab(tabId);
    setOpen(false);
  }

  return (
    <div className="knownext-document-tabs knownext-document-tabs-compact flex h-9 shrink-0 items-end border-b border-line bg-white">
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

      {fixedTabs.map((tab) => (
        <WorkspaceTabButton
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          dirty={false}
          fixed
          onSelectTab={selectTab}
          onCloseTab={onCloseTab}
          onOpenTabContextMenu={onOpenTabContextMenu}
        />
      ))}

      {activeWorkspaceTab ? (
        <div className="knownext-document-tab knownext-document-tab-compact-active relative flex h-full min-w-0 flex-1 cursor-default items-center border-r border-line text-[11px] font-semibold text-ink-primary hover:bg-panel">
          <button
            className="flex h-full min-w-0 flex-1 cursor-default items-center gap-2 px-2.5 text-left"
            type="button"
            aria-label={`Documento activo ${activeWorkspaceTab.name}`}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            onContextMenu={(event) => onOpenTabContextMenu(activeWorkspaceTab, event)}
          >
            {renderTabIcon(activeWorkspaceTab, activeWorkspaceTab.id === activeTabId)}
            <span className="min-w-0 flex-1 truncate">{activeWorkspaceTab.name}</span>
            {activeWorkspaceTab.kind === "document" && dirtyIds.has(activeWorkspaceTab.id) ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-orange" /> : null}
          </button>
          {!isFixedUtilityTab(activeWorkspaceTab) ? (
            <button
              className="grid h-full w-8 shrink-0 cursor-default place-items-center text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
              type="button"
              aria-label={activeWorkspaceTab.kind === "document" && dirtyIds.has(activeWorkspaceTab.id) ? `Cerrar ${activeWorkspaceTab.name}, con cambios sin guardar` : `Cerrar ${activeWorkspaceTab.name}`}
              onClick={() => {
                setOpen(false);
                onCloseTab(activeWorkspaceTab.id);
              }}
            >
              <X size={14} />
            </button>
          ) : null}
          <button
            className="grid h-full w-8 shrink-0 cursor-default place-items-center text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
            type="button"
            aria-label={`Mostrar archivos abiertos, activo ${activeWorkspaceTab.name}`}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <ChevronDown size={14} />
          </button>
          {activeWorkspaceTab.id === activeTabId ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-brand-orange" /> : null}
        </div>
      ) : activeTab ? (
        <div className="min-w-0 flex-1" />
      ) : null}

      {rightSlot}

      {open ? (
        <OpenTabsDialog
          tabs={scrollableTabs}
          activeTabId={activeTabId}
          dirtyIds={dirtyIds}
          onClose={() => setOpen(false)}
          onSelectTab={selectTab}
          onCloseTab={onCloseTab}
        />
      ) : null}
    </div>
  );
}

function OpenTabsDialog({
  tabs,
  activeTabId,
  dirtyIds,
  onClose,
  onSelectTab,
  onCloseTab,
}: {
  tabs: WorkspaceTab[];
  activeTabId: string;
  dirtyIds: Set<string>;
  onClose: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[90] flex items-center justify-center bg-black/20 px-4 py-6" role="presentation" onMouseDown={onClose}>
      <section
        className="flex max-h-[min(520px,calc(100dvh-48px))] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-tabs-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
          <h2 id="open-tabs-title" className="text-[13px] font-semibold text-ink-primary">Archivos abiertos</h2>
          <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" aria-label="Cerrar lista de archivos abiertos" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {tabs.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-ink-secondary">No hay archivos abiertos.</p>
          ) : (
            tabs.map((tab) => {
              const active = tab.id === activeTabId;
              const dirty = tab.kind === "document" && dirtyIds.has(tab.id);
              return (
                <div key={tab.id} className={["flex h-11 items-center gap-2 rounded-md px-2", active ? "bg-brand-hover text-brand-orange" : "text-ink-primary hover:bg-panel"].join(" ")}>
                  <button className="flex min-w-0 flex-1 items-center gap-2 text-left" type="button" onClick={() => onSelectTab(tab.id)}>
                    {renderTabIcon(tab, active)}
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{tab.name}</span>
                    {dirty ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-orange" /> : null}
                  </button>
                  {!isFixedUtilityTab(tab) ? (
                    <button
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-secondary hover:bg-white hover:text-brand-orange"
                      aria-label={dirty ? `Cerrar ${tab.name}, con cambios sin guardar` : `Cerrar ${tab.name}`}
                      onClick={() => onCloseTab(tab.id)}
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>
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
  onOpenTabContextMenu,
  onReorderDocumentTabs,
  onDocumentDragStart,
  onDocumentDragEnd,
  onDocumentDragOver,
  activeDraggedDocumentTabIdRef,
  onDocumentPointerDown,
  onDocumentMouseDown,
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
  onOpenTabContextMenu: (tab: WorkspaceTab, event: ReactMouseEvent<HTMLElement>) => void;
  onReorderDocumentTabs?: (draggedTabId: string, targetTabId: string, placement: "before" | "after") => void;
  onDocumentDragStart?: (tabId: string) => void;
  onDocumentDragEnd?: () => void;
  onDocumentDragOver?: (target: { tabId: string; placement: "before" | "after" } | null) => void;
  activeDraggedDocumentTabIdRef?: RefObject<string | null>;
  onDocumentPointerDown?: (tabId: string, event: ReactPointerEvent<HTMLElement>) => void;
  onDocumentMouseDown?: (tabId: string, event: ReactMouseEvent<HTMLElement>) => void;
}) {
  const Icon = getTabIcon(tab);
  const closeable = isCloseableTab(tab);
  const draggable = isReorderableWorkspaceTab(tab) && Boolean(onReorderDocumentTabs);
  return (
    <button
      aria-label={tab.name}
      draggable={false}
      data-reorderable={draggable ? "true" : undefined}
      data-tab-id={fixed ? undefined : tab.id}
      data-tooltip={fixed ? tab.name : undefined}
      data-tooltip-placement={fixed ? "bottom" : undefined}
      className={[
        "knownext-document-tab group relative flex h-full cursor-default items-center gap-1.5 border-r border-line text-[11px]",
        fixed ? "w-12 min-w-12 max-w-12 justify-center px-0" : "min-w-[150px] max-w-[210px] px-2.5",
        dragging ? "opacity-50" : "",
        active ? "knownext-document-tab-active bg-white font-semibold" : "text-ink-primary hover:bg-panel",
      ].join(" ")}
      onClick={() => onSelectTab(tab.id)}
      onContextMenu={(event) => onOpenTabContextMenu(tab, event)}
      onPointerDown={(event) => {
        if (!draggable) return;
        if (!event.pointerType || event.pointerType === "mouse") return;
        event.preventDefault();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is best-effort; the window listener still handles desktop drags.
        }
        onDocumentPointerDown?.(tab.id, event);
      }}
      onMouseDown={(event) => {
        if (!draggable) return;
        event.preventDefault();
        onDocumentMouseDown?.(tab.id, event);
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
        if (!isReorderableWorkspaceTab(tab) || !onReorderDocumentTabs) return;
        const draggedTabId = draggedDocumentTabId
          || activeDraggedDocumentTabIdRef?.current
          || event.dataTransfer.getData("application/x-knownext-document-tab")
          || event.dataTransfer.getData("text/plain");
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
        if (!isReorderableWorkspaceTab(tab) || !onReorderDocumentTabs) return;
        const draggedTabId = event.dataTransfer.getData("application/x-knownext-document-tab")
          || event.dataTransfer.getData("text/plain")
          || draggedDocumentTabId
          || activeDraggedDocumentTabIdRef?.current;
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
          className="knownext-document-tab-close ml-auto grid h-5 w-5 cursor-default place-items-center rounded hover:bg-brand-hover"
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

function TabContextMenu({
  x,
  y,
  closeOtherTabsDisabled,
  onClose,
  onCloseOthers,
  onCloseAll,
}: {
  x: number;
  y: number;
  closeOtherTabsDisabled: boolean;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
}) {
  return (
    <div
      className="fixed z-[120] w-48 rounded-md border border-line bg-white p-1 text-[11px] text-ink-primary shadow-menu"
      role="menu"
      aria-label="Opciones de pestaña"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <TabContextMenuItem label="Cerrar" onClick={onClose} />
      <TabContextMenuItem label="Cerrar otras pestañas" onClick={onCloseOthers} disabled={closeOtherTabsDisabled} />
      <div className="my-1 border-t border-line" />
      <TabContextMenuItem label="Cerrar todas las pestañas" onClick={onCloseAll} />
    </div>
  );
}

function TabContextMenuItem({ label, disabled = false, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className="flex h-8 w-full items-center rounded px-2 text-left hover:bg-brand-hover hover:text-brand-orange disabled:cursor-default disabled:text-ink-secondary/50 disabled:hover:bg-transparent disabled:hover:text-ink-secondary/50"
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
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

function isCloseableTab(tab: WorkspaceTab) {
  return !isFixedUtilityTab(tab);
}

function isReorderableWorkspaceTab(tab: WorkspaceTab) {
  return tab.kind === "document" || tab.kind === "release-notes";
}

function useCompactTabsMode() {
  const [compact, setCompact] = useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(xsViewportQuery).matches
      : false
  ));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(xsViewportQuery);
    const update = () => setCompact(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.("change", update);
    return () => mediaQuery.removeEventListener?.("change", update);
  }, []);

  return compact;
}

function renderTabIcon(tab: WorkspaceTab, active: boolean) {
  const Icon = getTabIcon(tab);
  return <Icon size={15} className={active ? "shrink-0 text-brand-orange" : "shrink-0 text-ink-secondary"} />;
}

function getTabIcon(tab: WorkspaceTab) {
  if (tab.kind === "release-notes") return ScrollText;
  if (tab.kind === "notes") return NotebookPen;
  if (tab.kind === "ai-conversation") return Sparkles;
  if (tab.kind === "image") return Image;
  if (tab.kind === "reference-document" && tab.format === "xlsx") return FileSpreadsheet;
  return FileText;
}
