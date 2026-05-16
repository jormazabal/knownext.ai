import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
  Copy,
  FileImage,
  FileText,
  Folder,
  FolderPlus,
  Eye,
  Image,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  MoveRight,
  FilePlus2,
  FileUp,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DocumentNameSearchResult, DocumentTreeNode } from "../../types/domain";
import { getInlineNameCompletion, searchDocumentTreeByName } from "./documentNameSearch";

type DocumentTreeProps = {
  nodes: DocumentTreeNode[];
  activeDocumentId: string;
  activeTreeNodeId?: string;
  hasActiveProject?: boolean;
  onOpenDocument: (documentId: string, name: string) => void;
  onOpenImage?: (assetId: string, name: string, path: string) => void;
  onActivateTreeNode: (nodeId: string) => void;
  onSelectTreeNode: (nodeId: string, type: "folder" | "document", name: string) => void;
  onCreateFolder: () => void;
  onCreateDocument: () => void;
  onImportFile?: () => void;
  onExpandTree: () => void;
  onCollapseTree: () => void;
  onConfigureProject: () => void;
  onRenameNode: (nodeId: string, name: string) => void;
  onToggleNode: (nodeId: string) => void;
  onContextAction: (action: DocumentTreeAction, node: DocumentTreeNode) => void;
  onMoveNode: (node: DocumentTreeNode, targetFolderId: string | null) => void | Promise<void>;
  changeBadges?: Record<string, string>;
};

type TreeFilter = "all" | "documents" | "images";

export type DocumentTreeAction =
  | "create-folder"
  | "create-document"
  | "import-image"
  | "open-image"
  | "insert-image"
  | "add-image-context"
  | "copy-image-reference"
  | "rename"
  | "delete"
  | "duplicate"
  | "move";

export function DocumentTree({
  nodes,
  activeDocumentId,
  activeTreeNodeId,
  hasActiveProject = true,
  onOpenDocument,
  onOpenImage,
  onActivateTreeNode,
  onSelectTreeNode,
  onCreateFolder,
  onCreateDocument,
  onImportFile,
  onExpandTree,
  onCollapseTree,
  onConfigureProject,
  onRenameNode,
  onToggleNode,
  onContextAction,
  onMoveNode,
  changeBadges = {},
}: DocumentTreeProps) {
  const closeTimer = useRef<number | null>(null);
  const expandTimer = useRef<number | null>(null);
  const autoExpandedNodeIds = useRef<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<{
    node: DocumentTreeNode;
    x: number;
    y: number;
  } | null>(null);
  const [draggedNode, setDraggedNode] = useState<DocumentTreeNode | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string | null; valid: boolean; label: string } | null>(null);
  const [filter, setFilter] = useState<TreeFilter>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const visibleNodes = filterTree(nodes, filter);
  const selectedNodeId = activeTreeNodeId || activeDocumentId;

  useEffect(() => {
    if (!selectedNodeId) return;
    const frame = window.requestAnimationFrame(() => {
      const selectedRow = document.querySelector(`[data-tree-node-id="${escapeCssAttributeValue(selectedNodeId)}"]`);
      if (selectedRow instanceof HTMLElement && typeof selectedRow.scrollIntoView === "function") {
        selectedRow.scrollIntoView({ block: "nearest" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedNodeId, filter]);

  function clearCloseTimer() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleCloseMenu() {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setOpenMenu(null), 120);
  }

  function handleMenuEnter(node: DocumentTreeNode, event: MouseEvent<HTMLButtonElement>) {
    clearCloseTimer();
    const rect = event.currentTarget.getBoundingClientRect();
    setOpenMenu({
      node,
      x: rect.right + 8,
      y: rect.top - 2,
    });
  }

  function clearExpandTimer() {
    if (expandTimer.current !== null) {
      window.clearTimeout(expandTimer.current);
      expandTimer.current = null;
    }
  }

  function startDrag(node: DocumentTreeNode, event: DragEvent<HTMLDivElement>) {
    if (node.isEditing) {
      event.preventDefault();
      return;
    }
    clearCloseTimer();
    setOpenMenu(null);
    setDraggedNode(node);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.id);
  }

  function finishDrag() {
    clearExpandTimer();
    autoExpandedNodeIds.current.clear();
    setDraggedNode(null);
    setDropTarget(null);
  }

  function handleRootDragOver(event: DragEvent<HTMLDivElement>) {
    if (!draggedNode) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const parentId = getParentId(nodes, draggedNode.id);
    setDropTarget({
      id: null,
      valid: parentId !== null && parentId !== undefined,
      label: "Raíz del proyecto",
    });
  }

  function handleRootDrop(event: DragEvent<HTMLDivElement>) {
    if (!draggedNode) return;
    event.preventDefault();
    const parentId = getParentId(nodes, draggedNode.id);
    const valid = parentId !== null && parentId !== undefined;
    if (valid) void onMoveNode(draggedNode, null);
    finishDrag();
  }

  function handleFolderDragOver(targetNode: DocumentTreeNode, event: DragEvent<HTMLDivElement>) {
    if (!draggedNode) return;
    event.preventDefault();
    event.stopPropagation();
    const valid = isValidFolderDrop(nodes, draggedNode, targetNode);
    event.dataTransfer.dropEffect = valid ? "move" : "none";
    setDropTarget({ id: targetNode.id, valid, label: targetNode.name });

    if (valid && targetNode.type === "folder" && !targetNode.open && !autoExpandedNodeIds.current.has(targetNode.id)) {
      clearExpandTimer();
      expandTimer.current = window.setTimeout(() => {
        autoExpandedNodeIds.current.add(targetNode.id);
        onToggleNode(targetNode.id);
      }, 600);
    }
  }

  function handleFolderDrop(targetNode: DocumentTreeNode, event: DragEvent<HTMLDivElement>) {
    if (!draggedNode) return;
    event.preventDefault();
    event.stopPropagation();
    if (isValidFolderDrop(nodes, draggedNode, targetNode)) {
      void onMoveNode(draggedNode, targetNode.id);
    }
    finishDrag();
  }

  return (
    <div
      className="cursor-default text-[11px]"
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
      }}
      onScroll={() => setOpenMenu(null)}
    >
      <div>
        <DocumentTreeToolbar
          filter={filter}
          disabled={!hasActiveProject}
          onFilterChange={setFilter}
          onCreateFolder={onCreateFolder}
          onCreateDocument={onCreateDocument}
          onImportFile={onImportFile}
          onSearch={() => setSearchOpen(true)}
          onExpandTree={onExpandTree}
          onCollapseTree={onCollapseTree}
          onConfigureProject={onConfigureProject}
        />
        {visibleNodes.length > 0 ? (
          visibleNodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              activeNodeId={selectedNodeId}
              onOpenDocument={onOpenDocument}
              onOpenImage={onOpenImage}
              onActivateTreeNode={onActivateTreeNode}
              onRenameNode={onRenameNode}
              onToggleNode={onToggleNode}
              menuNodeId={openMenu?.node.id}
              draggedNodeId={draggedNode?.id}
              dropTarget={dropTarget}
              onMenuEnter={handleMenuEnter}
              onMenuLeave={scheduleCloseMenu}
              onDragStart={startDrag}
              onDragEnd={finishDrag}
              onFolderDragOver={handleFolderDragOver}
              onFolderDrop={handleFolderDrop}
              changeBadges={changeBadges}
            />
          ))
        ) : (
          <div className="px-3 py-2 text-[11px] leading-5 text-ink-secondary">
            {filter === "images" ? "No hay imágenes en este proyecto." : filter === "documents" ? "No hay documentos Markdown en este filtro." : "No hay documentos ni imágenes compatibles en esta carpeta."}
          </div>
        )}
      </div>
      {draggedNode ? (
        <div
          className={[
            "mx-1 mt-2 rounded-lg border border-dashed px-3 py-2 text-[11px] transition",
            dropTarget?.id === null && dropTarget.valid
              ? "border-brand-orange bg-brand-hover text-brand-orange"
              : "border-line bg-white text-ink-secondary hover:border-orange-200 hover:bg-brand-hover",
          ].join(" ")}
          onDragOver={handleRootDragOver}
          onDrop={handleRootDrop}
        >
          Soltar en la raíz del proyecto
        </div>
      ) : null}
      {openMenu
        ? createPortal(
          <ContextMenu
              type={openMenu.node.type}
              x={openMenu.x}
              y={openMenu.y}
              onSelect={(action) => {
                onContextAction(action, openMenu.node);
                setOpenMenu(null);
              }}
              onMouseEnter={clearCloseTimer}
              onMouseLeave={scheduleCloseMenu}
            />,
            document.body,
          )
        : null}
      {searchOpen
        ? createPortal(
            <DocumentNameSearchDialog
              nodes={nodes}
              onClose={() => setSearchOpen(false)}
              onSelect={(result) => {
                setFilter("all");
                setSearchOpen(false);
                onSelectTreeNode(result.id, result.type, result.name);
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

type TreeNodeProps = {
  node: DocumentTreeNode;
  depth: number;
  activeNodeId: string;
  onOpenDocument: (documentId: string, name: string) => void;
  onOpenImage?: (assetId: string, name: string, path: string) => void;
  onActivateTreeNode: (nodeId: string) => void;
  onRenameNode: (nodeId: string, name: string) => void;
  onToggleNode: (nodeId: string) => void;
  menuNodeId?: string;
  draggedNodeId?: string;
  dropTarget: { id: string | null; valid: boolean; label: string } | null;
  onMenuEnter: (node: DocumentTreeNode, event: MouseEvent<HTMLButtonElement>) => void;
  onMenuLeave: () => void;
  onDragStart: (node: DocumentTreeNode, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onFolderDragOver: (node: DocumentTreeNode, event: DragEvent<HTMLDivElement>) => void;
  onFolderDrop: (node: DocumentTreeNode, event: DragEvent<HTMLDivElement>) => void;
  changeBadges: Record<string, string>;
};

function TreeNode({
  node,
  depth,
  activeNodeId,
  onOpenDocument,
  onOpenImage,
  onActivateTreeNode,
  onRenameNode,
  onToggleNode,
  menuNodeId,
  draggedNodeId,
  dropTarget,
  onMenuEnter,
  onMenuLeave,
  onDragStart,
  onDragEnd,
  onFolderDragOver,
  onFolderDrop,
  changeBadges,
}: TreeNodeProps) {
  const isFolder = node.type === "folder";
  const isActive = node.id === activeNodeId;
  const hasOpenMenu = node.id === menuNodeId;
  const isDragging = node.id === draggedNodeId;
  const isDropTarget = node.id === dropTarget?.id;
  const shouldRenderChildren = isFolder && node.open && node.children?.length;
  const changeBadge = node.path ? changeBadges[node.path] : undefined;

  return (
    <div>
      <div
        className={[
          "tree-row group relative flex h-6 select-none items-center rounded-md border pr-1.5 transition",
          node.isEditing ? "cursor-default" : isDragging ? "cursor-grabbing" : "cursor-default",
          isDragging ? "opacity-45" : "",
          isDropTarget && dropTarget?.valid ? "border-brand-orange bg-brand-hover ring-1 ring-inset ring-brand-orange" : "",
          isDropTarget && !dropTarget?.valid ? "border-red-200 bg-red-50 ring-1 ring-inset ring-red-200" : "",
          !isDropTarget && isActive
            ? "border-orange-200 bg-white text-brand-orange shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.18)]"
            : "",
          !isDropTarget && !isActive && hasOpenMenu ? "border-transparent bg-brand-hover" : "",
          !isDropTarget && !isActive && !hasOpenMenu ? "hover:bg-brand-hover" : "",
          !isDropTarget && !isActive ? "border-transparent" : "",
        ].join(" ")}
        style={{ paddingLeft: 6 + depth * 18 }}
        draggable={!node.isEditing}
        onDragStart={(event) => onDragStart(node, event)}
        onDragEnd={onDragEnd}
        onDragOver={isFolder ? (event) => onFolderDragOver(node, event) : undefined}
        onDrop={isFolder ? (event) => onFolderDrop(node, event) : undefined}
        data-tree-node-id={node.id}
        onClick={() => {
          if (node.isEditing) return;
          if (isFolder) {
            onActivateTreeNode(node.id);
            onToggleNode(node.id);
          }
          if (node.type === "document") onOpenDocument(node.id, node.name);
          if (node.type === "image" && node.path) onOpenImage?.(node.id, node.name, node.path);
        }}
      >
        <span className="mr-0.5 grid h-5 w-4 place-items-center">
          {isFolder ? (node.open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </span>
        {isFolder ? (
          <Folder size={15} className="mr-1.5 text-brand-orange" />
        ) : node.type === "image" ? (
          <Image size={14} className={["mr-1.5", isActive ? "text-brand-orange" : "text-ink-secondary"].join(" ")} />
        ) : (
          <FileText size={14} className={["mr-1.5", isActive ? "text-brand-orange" : "text-ink-secondary"].join(" ")} />
        )}
        {node.isEditing ? (
          <input
            className="min-w-0 flex-1 cursor-text rounded border border-brand-orange bg-white px-1 py-0.5 text-[11px] outline-none"
            autoFocus
            defaultValue={node.name}
            onClick={(event) => event.stopPropagation()}
            onBlur={(event) => onRenameNode(node.id, event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                onRenameNode(node.id, node.name);
              }
            }}
          />
        ) : (
          <>
            <span className={["min-w-0 flex-1 truncate", isActive ? "font-semibold" : ""].join(" ")}>{node.name}</span>
            {changeBadge ? (
              <span className="ml-1 max-w-[72px] shrink-0 truncate rounded bg-brand-hover px-1.5 py-0.5 text-[9px] font-semibold text-brand-orange">
                {changeBadge}
              </span>
            ) : null}
            <button
              className="grid h-5 w-5 place-items-center rounded-md opacity-0 hover:bg-white group-hover:opacity-100"
              aria-label={`Abrir menú de ${node.name}`}
              onClick={(event) => event.stopPropagation()}
              onMouseEnter={(event) => onMenuEnter(node, event)}
              onMouseLeave={onMenuLeave}
            >
              <MoreVertical size={14} />
            </button>
          </>
        )}
      </div>
      {shouldRenderChildren
        ? node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeNodeId={activeNodeId}
              onOpenDocument={onOpenDocument}
              onOpenImage={onOpenImage}
              onActivateTreeNode={onActivateTreeNode}
              onRenameNode={onRenameNode}
              onToggleNode={onToggleNode}
              menuNodeId={menuNodeId}
              draggedNodeId={draggedNodeId}
              dropTarget={dropTarget}
              onMenuEnter={onMenuEnter}
              onMenuLeave={onMenuLeave}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onFolderDragOver={onFolderDragOver}
              onFolderDrop={onFolderDrop}
              changeBadges={changeBadges}
            />
          ))
        : null}
    </div>
  );
}

function DocumentNameSearchDialog({
  nodes,
  onClose,
  onSelect,
}: {
  nodes: DocumentTreeNode[];
  onClose: () => void;
  onSelect: (result: DocumentNameSearchResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => searchDocumentTreeByName(nodes, query), [nodes, query]);
  const activeResult = results[activeIndex] ?? results[0];
  const completion = getInlineNameCompletion(query, results[0]);
  const hasMore = query.trim().length > 0 && searchDocumentTreeByName(nodes, query, 11).length > results.length;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function selectResult(result = activeResult) {
    if (result) onSelect(result);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((currentIndex) => (results.length === 0 ? 0 : (currentIndex + 1) % results.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((currentIndex) => (results.length === 0 ? 0 : (currentIndex - 1 + results.length) % results.length));
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      if (!activeResult) return;
      event.preventDefault();
      selectResult(activeResult);
    }
  }

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[90] flex items-start justify-center bg-black/20 px-4 pt-[11vh]" onMouseDown={onClose}>
      <section
        className="w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-lg border border-line bg-white shadow-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-name-search-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <Search size={16} className="shrink-0 text-ink-secondary" />
          <label id="document-name-search-title" className="sr-only">
            Buscar carpetas y documentos
          </label>
          <div className="relative min-w-0 flex-1">
            {completion ? (
              <div className="pointer-events-none absolute inset-0 z-0 flex h-9 items-center overflow-hidden whitespace-pre px-1 text-[13px] text-ink-secondary/35" aria-hidden="true">
                {query}
                {completion}
              </div>
            ) : null}
            <input
              ref={inputRef}
              className="relative z-10 h-9 w-full bg-transparent px-1 text-[13px] text-ink-primary caret-brand-orange outline-none placeholder:text-ink-secondary/70"
              value={query}
              placeholder="Buscar carpetas y documentos"
              aria-autocomplete="list"
              aria-controls="document-name-search-results"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
            type="button"
            data-tooltip="Cerrar"
            aria-label="Cerrar búsqueda"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <div id="document-name-search-results" className="max-h-[360px] overflow-y-auto p-1.5" role="listbox">
          {query.trim().length === 0 ? (
            <div className="px-3 py-8 text-center text-[11px] text-ink-secondary">Empieza a escribir un nombre.</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-8 text-center text-[11px] text-ink-secondary">No hay carpetas ni documentos con ese nombre.</div>
          ) : (
            <>
              {results.map((result, index) => (
                <button
                  key={result.id}
                  className={[
                    "flex min-h-[48px] w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition",
                    index === activeIndex ? "bg-brand-hover text-brand-orange" : "hover:bg-panel",
                  ].join(" ")}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectResult(result)}
                >
                  <span
                    className={[
                      "grid h-8 w-8 shrink-0 place-items-center rounded-md border",
                      result.type === "folder" ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-line bg-white text-ink-secondary",
                    ].join(" ")}
                  >
                    {result.type === "folder" ? <Folder size={15} /> : <FileText size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-ink-primary">
                      <HighlightedName name={result.name} ranges={result.matchRanges} />
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-ink-secondary">{formatSearchPath(result.path)}</span>
                  </span>
                </button>
              ))}
              {hasMore ? <div className="px-3 pb-2 pt-1 text-[10px] text-ink-secondary">Sigue escribiendo para afinar.</div> : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function HighlightedName({ name, ranges }: { name: string; ranges: Array<{ start: number; end: number }> }) {
  if (ranges.length === 0) return <>{name}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range) => {
    if (range.start > cursor) parts.push(<span key={`${cursor}-${range.start}`}>{name.slice(cursor, range.start)}</span>);
    parts.push(
      <mark key={`${range.start}-${range.end}`} className="bg-transparent text-brand-orange">
        {name.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < name.length) parts.push(<span key={`${cursor}-end`}>{name.slice(cursor)}</span>);
  return <>{parts}</>;
}

function formatSearchPath(path: string[]) {
  const parents = path.slice(0, -1);
  if (parents.length === 0) return "Raíz del proyecto";
  if (parents.length <= 3) return parents.join(" / ");
  return `... / ${parents.slice(-3).join(" / ")}`;
}

function escapeCssAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getParentId(nodes: DocumentTreeNode[], nodeId: string, parentId: string | null = null): string | null | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return parentId;
    if (node.children) {
      const childParent = getParentId(node.children, nodeId, node.id);
      if (childParent !== undefined) return childParent;
    }
  }
  return undefined;
}

function DocumentTreeToolbar({
  filter,
  disabled,
  onFilterChange,
  onCreateFolder,
  onCreateDocument,
  onImportFile,
  onSearch,
  onExpandTree,
  onCollapseTree,
  onConfigureProject,
}: {
  filter: TreeFilter;
  disabled: boolean;
  onFilterChange: (filter: TreeFilter) => void;
  onCreateFolder: () => void;
  onCreateDocument: () => void;
  onImportFile?: () => void;
  onSearch: () => void;
  onExpandTree: () => void;
  onCollapseTree: () => void;
  onConfigureProject: () => void;
}) {
  const [openPanel, setOpenPanel] = useState<"create" | "view" | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openPanel) return;

    function closeToolbarMenu(event: globalThis.MouseEvent) {
      if (toolbarRef.current?.contains(event.target as Node)) return;
      setOpenPanel(null);
    }

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpenPanel(null);
    }

    window.addEventListener("mousedown", closeToolbarMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", closeToolbarMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [openPanel]);

  function runAction(action: () => void) {
    setOpenPanel(null);
    action();
  }

  return (
    <div ref={toolbarRef} className="relative mb-2 flex h-8 items-center justify-between gap-2 px-1.5">
      <span className="text-[10px] font-semibold uppercase text-ink-secondary">Archivos</span>
      <div className="flex items-center gap-0.5">
        <ToolbarIconButton label="Buscar carpetas y documentos" disabled={disabled} icon={Search} onClick={() => runAction(onSearch)} />
        <ToolbarIconButton
          label="Añadir"
          icon={Plus}
          active={openPanel === "create"}
          disabled={disabled}
          onClick={() => setOpenPanel((currentPanel) => (currentPanel === "create" ? null : "create"))}
        />
        <ToolbarIconButton
          label="Vista del árbol"
          icon={Eye}
          active={openPanel === "view"}
          disabled={disabled}
          onClick={() => setOpenPanel((currentPanel) => (currentPanel === "view" ? null : "view"))}
        />
        <ToolbarIconButton label="Ajustes del proyecto" icon={Settings} disabled={disabled} onClick={onConfigureProject} />
      </div>
      {openPanel === "create" ? (
        <ToolbarMenu className="right-8 top-8 w-[214px]">
          <ToolbarMenuItem icon={FolderPlus} label="Nueva carpeta" description="Crea una carpeta en la raíz" onClick={() => runAction(onCreateFolder)} />
          <ToolbarMenuItem icon={FilePlus2} label="Nuevo Markdown" description="Crea un documento vacío" onClick={() => runAction(onCreateDocument)} />
          <ToolbarMenuItem
            icon={FileUp}
            label="Importar archivo"
            description="Markdown o imagen del disco"
            disabled={!onImportFile}
            onClick={() => onImportFile && runAction(onImportFile)}
          />
        </ToolbarMenu>
      ) : null}
      {openPanel === "view" ? (
        <ToolbarMenu className="right-0 top-8 w-[218px]">
          <ToolbarMenuItem icon={Check} label="Ver todo" active={filter === "all"} onClick={() => runAction(() => onFilterChange("all"))} />
          <ToolbarMenuItem icon={FileText} label="Solo Markdown" active={filter === "documents"} onClick={() => runAction(() => onFilterChange("documents"))} />
          <ToolbarMenuItem icon={Image} label="Solo imágenes" active={filter === "images"} onClick={() => runAction(() => onFilterChange("images"))} />
          <div className="my-1 border-t border-line" />
          <ToolbarMenuItem icon={ChevronDown} label="Expandir carpetas" onClick={() => runAction(onExpandTree)} />
          <ToolbarMenuItem icon={ChevronUp} label="Contraer carpetas" onClick={() => runAction(onCollapseTree)} />
        </ToolbarMenu>
      ) : null}
    </div>
  );
}

function ToolbarIconButton({
  label,
  icon: Icon,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={[
        "grid h-7 w-7 place-items-center rounded-md border border-transparent text-ink-secondary transition",
        active ? "border-orange-100 bg-brand-hover text-brand-orange" : "hover:border-orange-100 hover:bg-brand-hover hover:text-brand-orange",
        disabled ? "cursor-not-allowed opacity-40" : "",
      ].join(" ")}
      data-tooltip={label}
      data-tooltip-placement="top"
      aria-label={label}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) onClick?.();
      }}
    >
      <Icon size={15} />
    </button>
  );
}

function ToolbarMenu({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={["absolute z-40 rounded-md border border-line bg-white p-1 shadow-menu", className].join(" ")}>
      {children}
    </div>
  );
}

function ToolbarMenuItem({
  icon: Icon,
  label,
  description,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={[
        "flex min-h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] transition",
        active ? "bg-brand-hover text-brand-orange" : "hover:bg-brand-hover",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={14} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {description ? <span className="block truncate text-[10px] font-normal text-ink-secondary">{description}</span> : null}
      </span>
    </button>
  );
}

function filterTree(nodes: DocumentTreeNode[], filter: TreeFilter): DocumentTreeNode[] {
  if (filter === "all") return nodes;
  const acceptedType = filter === "documents" ? "document" : "image";
  return nodes.flatMap((node) => {
    if (node.type === acceptedType) return [node];
    if (node.type !== "folder") return [];
    const children = filterTree(node.children ?? [], filter);
    if (children.length === 0) return [];
    return [{ ...node, children }];
  });
}

function isValidFolderDrop(nodes: DocumentTreeNode[], draggedNode: DocumentTreeNode, targetNode: DocumentTreeNode) {
  if (targetNode.type !== "folder") return false;
  if (draggedNode.id === targetNode.id) return false;
  if (getParentId(nodes, draggedNode.id) === targetNode.id) return false;
  if (draggedNode.type === "folder" && containsNode(draggedNode, targetNode.id)) return false;
  return true;
}

function containsNode(node: DocumentTreeNode, nodeId: string): boolean {
  if (!node.children) return false;
  for (const child of node.children) {
    if (child.id === nodeId) return true;
    if (containsNode(child, nodeId)) return true;
  }
  return false;
}

function ContextMenu({
  type,
  x,
  y,
  onSelect,
  onMouseEnter,
  onMouseLeave,
}: {
  type: "folder" | "document" | "image";
  x: number;
  y: number;
  onSelect: (action: DocumentTreeAction) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const folderItems = [
    { label: "Nueva carpeta", icon: FolderPlus, action: "create-folder" },
    { label: "Nuevo documento", icon: FilePlus2, action: "create-document" },
    { label: "Importar imagen", icon: FileImage, action: "import-image" },
    { label: "Renombrar", icon: Pencil, action: "rename" },
    { label: "Mover", icon: MoveRight, action: "move" },
    { label: "Eliminar", icon: Trash2, action: "delete" },
  ];
  const documentItems = [
    { label: "Renombrar", icon: Pencil, action: "rename" },
    { label: "Duplicar", icon: Copy, action: "duplicate" },
    { label: "Mover", icon: MoveRight, action: "move" },
    { label: "Eliminar", icon: Trash2, action: "delete" },
  ];
  const imageItems = [
    { label: "Abrir", icon: Image, action: "open-image" },
    { label: "Insertar en documento", icon: FileImage, action: "insert-image" },
    { label: "Usar como contexto IA", icon: Copy, action: "add-image-context" },
    { label: "Copiar referencia", icon: Copy, action: "copy-image-reference" },
    { label: "Renombrar", icon: Pencil, action: "rename" },
    { label: "Mover", icon: MoveRight, action: "move" },
    { label: "Eliminar", icon: Trash2, action: "delete" },
  ];
  const items = type === "folder" ? folderItems : type === "image" ? imageItems : documentItems;

  return (
    <div
      className="fixed z-50 w-[168px] rounded-md border border-line bg-white p-1 shadow-menu"
      style={{ left: x, top: y }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {items.map((item) => (
        <button
          key={item.label}
          className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
          onClick={() => onSelect(item.action as DocumentTreeAction)}
        >
          <item.icon size={13} />
          {item.label}
        </button>
      ))}
    </div>
  );
}
