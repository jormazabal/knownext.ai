import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
  Copy,
  Download,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  Folder,
  FolderPlus,
  Eye,
  Image,
  MoreVertical,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Trash2,
  MoveRight,
  Presentation,
  FilePlus2,
  FileUp,
  GitBranch,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DocumentNameSearchResult, DocumentTreeNode } from "../../types/domain";
import { clearDocumentTreeDragData, getDocumentTreeDragData, setDocumentTreeDragData } from "../../lib/dragData";
import { getInlineNameCompletion, searchDocumentTreeByName } from "./documentNameSearch";

type DocumentTreeProps = {
  nodes: DocumentTreeNode[];
  activeDocumentId: string;
  activeTreeNodeId?: string;
  hasActiveProject?: boolean;
  onOpenDocument: (documentId: string, name: string) => void;
  onOpenHandwrittenNote?: (noteId: string, name: string) => void;
  onOpenImage?: (assetId: string, name: string, path: string) => void;
  onOpenReferenceDocument?: (nodeId: string, name: string, path: string) => void;
  onActivateTreeNode: (nodeId: string) => void;
  onSelectTreeNode: (nodeId: string, type: DocumentTreeNode["type"], name: string) => void;
  onCreateFolder: (parentId: string | null) => void;
  onCreateDocument: (parentId: string | null) => void;
  onCreateHandwrittenNote?: (parentId: string | null) => void;
  onImportFile?: (parentId: string | null) => void;
  onExpandTree: () => void;
  onCollapseTree: () => void;
  onConfigureProject: () => void;
  onOpenProjectStatus?: () => void;
  onRenameNode: (nodeId: string, name: string) => void;
  onToggleNode: (nodeId: string) => void;
  onContextAction: (action: DocumentTreeAction, node: DocumentTreeNode) => void;
  onMoveNode: (node: DocumentTreeNode, targetFolderId: string | null) => void | Promise<void>;
  onAddNodeContext?: (nodeId: string) => void | Promise<void>;
  onPreviewImageDropIntoActiveDocument?: (assetId: string, clientX: number, clientY: number) => void;
  onDropImageIntoActiveDocument?: (assetId: string, clientX: number, clientY: number) => void | Promise<void>;
  changeBadges?: Record<string, string>;
  projectStatus?: ProjectTreeStatus | null;
};

export type ProjectTreeStatus = {
  label: string;
  detail: string;
  badge?: string | null;
  tone: "ok" | "info" | "warning" | "danger" | "muted";
  showFooter?: boolean;
  footerLabel?: string;
  footerDetail?: string;
};

type TreeFilter = "all" | "documents" | "handwritten" | "images";
type ExtendedTreeFilter = TreeFilter | "attachments";
type TreeDropTarget = { id: string | null; valid: boolean; label: string };
type TreeMouseDropTarget = TreeDropTarget & { targetFolderId?: string | null };

const CONTEXT_MENU_WIDTH = 176;
const CONTEXT_SUBMENU_WIDTH = 150;
const CONTEXT_MENU_ITEM_HEIGHT = 28;
const CONTEXT_MENU_PADDING = 8;
const CONTEXT_MENU_VIEWPORT_GAP = 8;

export type DocumentTreeAction =
  | "create-folder"
  | "create-document"
  | "create-handwritten-note"
  | "import-image"
  | "import-file"
  | "open-handwritten-note"
  | "open-image"
  | "open-reference-document"
  | "insert-image"
  | "add-image-context"
  | "add-attachment-context"
  | "copy-image-reference"
  | "copy-path"
  | "export-md"
  | "export-pdf"
  | "export-docx"
  | "export-knote"
  | "export-note-png"
  | "export-note-svg"
  | "export-note-pdf"
  | "add-handwritten-context"
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
  onOpenHandwrittenNote,
  onOpenImage,
  onOpenReferenceDocument,
  onActivateTreeNode,
  onSelectTreeNode,
  onCreateFolder,
  onCreateDocument,
  onCreateHandwrittenNote,
  onImportFile,
  onExpandTree,
  onCollapseTree,
  onConfigureProject,
  onOpenProjectStatus,
  onRenameNode,
  onToggleNode,
  onContextAction,
  onMoveNode,
  onAddNodeContext,
  onPreviewImageDropIntoActiveDocument,
  onDropImageIntoActiveDocument,
  changeBadges = {},
  projectStatus = null,
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
  const [dragPreview, setDragPreview] = useState<{ label: string; x: number; y: number } | null>(null);
  const draggedNodeRef = useRef<DocumentTreeNode | null>(null);
  const [dropTarget, setDropTarget] = useState<TreeDropTarget | null>(null);
  const rootDropRef = useRef<HTMLDivElement | null>(null);
  const mouseDragRef = useRef<{ node: DocumentTreeNode; startX: number; startY: number; dragging: boolean } | null>(null);
  const mouseDropTargetRef = useRef<TreeMouseDropTarget | null>(null);
  const mouseContextDropRef = useRef(false);
  const mouseDocumentDropRef = useRef(false);
  const suppressNextNodeClickRef = useRef(false);
  const [filter, setFilter] = useState<ExtendedTreeFilter>("all");
  const [showFileExtensions, setShowFileExtensions] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const visibleNodes = useMemo(() => filterTree(nodes, filter), [nodes, filter]);
  const selectedNodeId = activeTreeNodeId || activeDocumentId;
  const currentParentId = resolveCurrentCreationParentId(nodes, activeTreeNodeId, activeDocumentId);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (!containsNodeId(visibleNodes, selectedNodeId)) return;

    const frame = window.requestAnimationFrame(() => {
      const selectedRow = document.querySelector(`[data-tree-node-id="${escapeCssAttributeValue(selectedNodeId)}"]`);
      if (selectedRow instanceof HTMLElement && typeof selectedRow.scrollIntoView === "function") {
        selectedRow.scrollIntoView({ block: "nearest" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [filter, nodes, selectedNodeId, visibleNodes]);

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
    const itemCount = getContextMenuItemCount(node.type);
    const position = getSafeContextMenuPosition({
      anchorX: rect.right + 8,
      anchorY: rect.top - 2,
      anchorLeft: rect.left,
      width: CONTEXT_MENU_WIDTH,
      height: getContextMenuHeight(itemCount),
    });
    setOpenMenu({
      node,
      x: position.x,
      y: position.y,
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
    draggedNodeRef.current = node;
    setDraggedNode(node);
    updateDragPreview(node, event.clientX, event.clientY, event.currentTarget);
    event.dataTransfer.effectAllowed = node.type === "folder" ? "move" : "copyMove";
    setDocumentTreeDragData(event.dataTransfer, node);
    const ghost = document.createElement("div");
    ghost.textContent = node.name;
    ghost.style.position = "fixed";
    ghost.style.top = "-1000px";
    ghost.style.left = "-1000px";
    ghost.style.maxWidth = "260px";
    ghost.style.padding = "6px 10px";
    ghost.style.border = "1px solid #FED7AA";
    ghost.style.borderRadius = "6px";
    ghost.style.background = "rgba(255,255,255,0.82)";
    ghost.style.color = "#111827";
    ghost.style.font = "600 11px system-ui, sans-serif";
    ghost.style.boxShadow = "0 12px 30px rgba(17,24,39,0.16)";
    if (typeof event.dataTransfer.setDragImage === "function") {
      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, 12, 12);
      window.setTimeout(() => ghost.remove(), 0);
    }
  }

  function handleNativeDrag(node: DocumentTreeNode, event: DragEvent<HTMLDivElement>) {
    updateDragPreview(node, event.clientX, event.clientY);
  }

  function finishDrag() {
    clearExpandTimer();
    autoExpandedNodeIds.current.clear();
    draggedNodeRef.current = null;
    mouseDragRef.current = null;
    mouseDropTargetRef.current = null;
    mouseContextDropRef.current = false;
    mouseDocumentDropRef.current = false;
    clearDocumentTreeDragData();
    dispatchPromptContextDrag(false);
    setDraggedNode(null);
    setDragPreview(null);
    setDropTarget(null);
  }

  function getActiveDraggedNode(dataTransfer?: DataTransfer | null) {
    if (draggedNodeRef.current) return draggedNodeRef.current;
    const dragData = getDocumentTreeDragData(dataTransfer);
    return dragData ? findNodeById(nodes, dragData.id) : null;
  }

  function handleRootDragOver(event: DragEvent<HTMLDivElement>) {
    const activeDraggedNode = getActiveDraggedNode(event.dataTransfer);
    if (!activeDraggedNode) return;
    if (isDragOverTreeRow(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    updateDragPreview(activeDraggedNode, event.clientX, event.clientY);
    const valid = canMoveToParent(nodes, activeDraggedNode, null);
    setDropTarget({
      id: null,
      valid,
      label: "Raíz del proyecto",
    });
  }

  function handleRootDrop(event: DragEvent<HTMLDivElement>) {
    const activeDraggedNode = getActiveDraggedNode(event.dataTransfer);
    if (!activeDraggedNode) return;
    if (isDragOverTreeRow(event)) return;
    event.preventDefault();
    const valid = canMoveToParent(nodes, activeDraggedNode, null);
    if (valid) void onMoveNode(activeDraggedNode, null);
    finishDrag();
  }

  function handleNodeDragOver(targetNode: DocumentTreeNode, event: DragEvent<HTMLDivElement>) {
    const activeDraggedNode = getActiveDraggedNode(event.dataTransfer);
    if (!activeDraggedNode) return;
    event.preventDefault();
    event.stopPropagation();
    updateDragPreview(activeDraggedNode, event.clientX, event.clientY);
    const targetFolderId = getNodeDropTargetFolderId(nodes, activeDraggedNode, targetNode);
    const valid = targetFolderId !== undefined;
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

  function handleNodeDrop(targetNode: DocumentTreeNode, event: DragEvent<HTMLDivElement>) {
    const activeDraggedNode = getActiveDraggedNode(event.dataTransfer);
    if (!activeDraggedNode) return;
    event.preventDefault();
    event.stopPropagation();
    const targetFolderId = getNodeDropTargetFolderId(nodes, activeDraggedNode, targetNode);
    if (targetFolderId !== undefined) {
      void onMoveNode(activeDraggedNode, targetFolderId);
    }
    finishDrag();
  }

  function startMouseDrag(node: DocumentTreeNode, event: MouseEvent<HTMLDivElement>) {
    if (node.isEditing || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button,input,textarea")) return;
    event.preventDefault();
    draggedNodeRef.current = node;
    mouseDragRef.current = { node, startX: event.clientX, startY: event.clientY, dragging: false };
    mouseDropTargetRef.current = null;
    window.addEventListener("mousemove", handleMouseDragMove);
    window.addEventListener("mouseup", handleMouseDragUp, { once: true });
  }

  function handleMouseDragMove(event: globalThis.MouseEvent) {
    const drag = mouseDragRef.current;
    if (!drag) return;
    if (!drag.dragging) {
      const distance = Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY);
      if (distance < 8) return;
      drag.dragging = true;
      clearCloseTimer();
      setOpenMenu(null);
      setDraggedNode(drag.node);
    }
    setDragPreview({ label: drag.node.name, x: event.clientX, y: event.clientY });

    const overPrompt = canDropNodeIntoPrompt(drag.node) && isOverPromptInput(event.clientX, event.clientY);
    const overDocumentEditor = !overPrompt && canDropImageIntoDocument(drag.node) && isOverMarkdownEditor(event.clientX, event.clientY);
    mouseContextDropRef.current = overPrompt;
    mouseDocumentDropRef.current = overDocumentEditor;
    dispatchPromptContextDrag(true, overPrompt);
    if (overPrompt) {
      mouseDropTargetRef.current = null;
      setDropTarget(null);
    } else if (overDocumentEditor) {
      onPreviewImageDropIntoActiveDocument?.(drag.node.id, event.clientX, event.clientY);
      mouseDropTargetRef.current = null;
      setDropTarget(null);
    } else {
      const target = findMouseDropTarget(event.clientX, event.clientY, drag.node);
      mouseDropTargetRef.current = target;
      setDropTarget(target ? { id: target.id, valid: target.valid, label: target.label } : null);
      maybeAutoExpandDropTarget(target);
    }
    event.preventDefault();
  }

  function handleMouseDragUp(event: globalThis.MouseEvent) {
    window.removeEventListener("mousemove", handleMouseDragMove);
    const drag = mouseDragRef.current;
    if (!drag) return;
    const overPrompt = drag.dragging && canDropNodeIntoPrompt(drag.node) && (isOverPromptInput(event.clientX, event.clientY) || mouseContextDropRef.current);
    const overDocumentEditor = drag.dragging && canDropImageIntoDocument(drag.node) && (isOverMarkdownEditor(event.clientX, event.clientY) || mouseDocumentDropRef.current);
    if (overPrompt) {
      suppressNextNodeClickRef.current = true;
      void onAddNodeContext?.(drag.node.id);
      finishDrag();
      return;
    }
    if (overDocumentEditor) {
      suppressNextNodeClickRef.current = true;
      void onDropImageIntoActiveDocument?.(drag.node.id, event.clientX, event.clientY);
      finishDrag();
      return;
    }
    const target = drag.dragging ? findMouseDropTarget(event.clientX, event.clientY, drag.node) ?? mouseDropTargetRef.current : null;
    if (drag.dragging) suppressNextNodeClickRef.current = true;
    if (target?.valid && target.targetFolderId !== undefined) {
      void onMoveNode(drag.node, target.targetFolderId);
    }
    finishDrag();
  }

  function canDropNodeIntoPrompt(node: DocumentTreeNode) {
    return node.type !== "folder" && Boolean(onAddNodeContext);
  }

  function updateDragPreview(node: DocumentTreeNode, clientX: number, clientY: number, fallbackElement?: HTMLElement | null) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || (clientX === 0 && clientY === 0)) {
      if (!fallbackElement) return;
      const rect = fallbackElement.getBoundingClientRect();
      clientX = rect.left + 12;
      clientY = rect.top + Math.max(12, Math.min(18, rect.height / 2 || 12));
    }
    setDragPreview({ label: node.name, x: clientX, y: clientY });
  }

  function canDropImageIntoDocument(node: DocumentTreeNode) {
    return (node.type === "image" || node.type === "handwritten-note") && Boolean(onDropImageIntoActiveDocument);
  }

  function isOverPromptInput(clientX: number, clientY: number) {
    return getElementAtPoint(clientX, clientY).some((element) => Boolean(element.closest(".knownext-ai-prompt")));
  }

  function isOverMarkdownEditor(clientX: number, clientY: number) {
    return getElementAtPoint(clientX, clientY).some((element) => Boolean(element.closest(".knownext-editor")));
  }

  function findMouseDropTarget(clientX: number, clientY: number, activeDraggedNode: DocumentTreeNode): TreeMouseDropTarget | null {
    const row = getElementAtPoint(clientX, clientY)
      .map((element) => element.closest("[data-tree-node-id]"))
      .find((element): element is HTMLElement => element instanceof HTMLElement);
    if (row) {
      const targetNodeId = row.getAttribute("data-tree-node-id");
      const targetNode = targetNodeId ? findNodeById(nodes, targetNodeId) : null;
      if (!targetNode) return null;
      const targetFolderId = getNodeDropTargetFolderId(nodes, activeDraggedNode, targetNode);
      return {
        id: targetNode.id,
        valid: targetFolderId !== undefined,
        label: targetNode.name,
        targetFolderId,
      };
    }

    const rootRect = rootDropRef.current?.getBoundingClientRect();
    if (!rootRect || clientX < rootRect.left || clientX > rootRect.right || clientY < rootRect.top || clientY > rootRect.bottom) {
      return null;
    }
    const valid = canMoveToParent(nodes, activeDraggedNode, null);
    return { id: null, valid, label: "Raíz del proyecto", targetFolderId: valid ? null : undefined };
  }

  function maybeAutoExpandDropTarget(target: TreeMouseDropTarget | null) {
    if (!target?.valid || !target.id || target.targetFolderId !== target.id || autoExpandedNodeIds.current.has(target.id)) return;
    const targetNode = findNodeById(nodes, target.id);
    if (!targetNode || targetNode.type !== "folder" || targetNode.open) return;
    clearExpandTimer();
    expandTimer.current = window.setTimeout(() => {
      autoExpandedNodeIds.current.add(targetNode.id);
      onToggleNode(targetNode.id);
    }, 600);
  }

  function handleNodeClick(node: DocumentTreeNode) {
    if (suppressNextNodeClickRef.current) {
      suppressNextNodeClickRef.current = false;
      return;
    }
    if (node.isEditing) return;
    onActivateTreeNode(node.id);
  }

  function handleNodeDoubleClick(node: DocumentTreeNode) {
    if (node.isEditing) return;
    if (node.type === "folder") {
      onActivateTreeNode(node.id);
      onToggleNode(node.id);
      return;
    }
    if (node.type === "document") {
      onOpenDocument(node.id, node.name);
      return;
    }
    if (node.type === "handwritten-note") {
      onOpenHandwrittenNote?.(node.id, node.name);
      return;
    }
    if (node.type === "image" && node.path) {
      onOpenImage?.(node.id, node.name, node.path);
      return;
    }
    if (node.type === "attachment") {
      if (node.path && isReferenceDocumentName(node.name)) onOpenReferenceDocument?.(node.id, node.name, node.path);
      else onActivateTreeNode(node.id);
    }
  }

  return (
    <div
      className="knownext-document-tree flex h-full min-h-0 cursor-default flex-col text-[11px]"
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
      }}
    >
      <DocumentTreeToolbar
        filter={filter}
        showFileExtensions={showFileExtensions}
        disabled={!hasActiveProject}
        onFilterChange={setFilter}
        onShowFileExtensionsChange={setShowFileExtensions}
        onCreateFolder={() => onCreateFolder(currentParentId)}
        onCreateDocument={() => onCreateDocument(currentParentId)}
        onCreateHandwrittenNote={onCreateHandwrittenNote ? () => onCreateHandwrittenNote(currentParentId) : undefined}
        onImportFile={onImportFile ? () => onImportFile(currentParentId) : undefined}
        onSearch={() => setSearchOpen(true)}
        onExpandTree={onExpandTree}
        onCollapseTree={onCollapseTree}
        onConfigureProject={onConfigureProject}
        onOpenProjectStatus={onOpenProjectStatus}
        projectStatus={projectStatus}
      />
      <div
        ref={rootDropRef}
        className={[
          "min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2",
          draggedNode && dropTarget?.id === null && dropTarget.valid ? "rounded-md bg-brand-hover/45" : "",
        ].join(" ")}
        data-testid="document-tree-root-drop"
        onScroll={() => setOpenMenu(null)}
        onDragOver={handleRootDragOver}
        onDrop={handleRootDrop}
      >
        {visibleNodes.length > 0 ? (
          visibleNodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              activeNodeId={selectedNodeId}
              onOpenDocument={onOpenDocument}
              onOpenHandwrittenNote={onOpenHandwrittenNote}
              onOpenImage={onOpenImage}
              onOpenReferenceDocument={onOpenReferenceDocument}
              onActivateTreeNode={onActivateTreeNode}
              onRenameNode={onRenameNode}
              onToggleNode={onToggleNode}
              menuNodeId={openMenu?.node.id}
              draggedNodeId={draggedNode?.id}
              dropTarget={dropTarget}
              onMenuEnter={handleMenuEnter}
              onMenuLeave={scheduleCloseMenu}
              onDragStart={startDrag}
              onNodeDrag={handleNativeDrag}
              onDragEnd={finishDrag}
              onNodeDragOver={handleNodeDragOver}
              onNodeDrop={handleNodeDrop}
              onMouseDragStart={startMouseDrag}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              changeBadges={changeBadges}
              showFileExtensions={showFileExtensions}
            />
          ))
        ) : (
          <div className="px-3 py-2 text-[11px] leading-5 text-ink-secondary">
            {filter === "attachments" ? "No hay archivos de apoyo en este proyecto." : filter === "images" ? "No hay imágenes en este proyecto." : filter === "handwritten" ? "No hay notas a mano en este filtro." : filter === "documents" ? "No hay documentos Markdown en este filtro." : "No hay archivos compatibles en esta carpeta."}
          </div>
        )}
      </div>
      {projectStatus?.showFooter && onOpenProjectStatus ? (
        <button
          className={["mx-1 mt-1 flex min-h-11 items-center gap-2 rounded-md border px-2.5 py-2 text-left transition", getProjectStatusFooterClass(projectStatus.tone)].join(" ")}
          onClick={onOpenProjectStatus}
        >
          <span className={["h-2 w-2 shrink-0 rounded-full", getProjectStatusDotClass(projectStatus.tone)].join(" ")} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-semibold">{projectStatus.footerLabel ?? projectStatus.label}</span>
            <span className="block truncate text-[10px] opacity-80">{projectStatus.footerDetail ?? projectStatus.detail}</span>
          </span>
        </button>
      ) : null}
      {draggedNode ? (
        <div
          className={[
            "mx-1 mt-2 rounded-lg border border-dashed px-3 py-2 text-[11px] transition",
            dropTarget?.id === null && dropTarget.valid
              ? "border-brand-orange bg-brand-hover text-brand-orange"
              : "border-line bg-white text-ink-secondary hover:border-orange-200 hover:bg-brand-hover",
          ].join(" ")}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const activeDraggedNode = getActiveDraggedNode(event.dataTransfer);
            if (!activeDraggedNode) return;
            updateDragPreview(activeDraggedNode, event.clientX, event.clientY);
            const valid = canMoveToParent(nodes, activeDraggedNode, null);
            event.dataTransfer.dropEffect = valid ? "move" : "none";
            setDropTarget({ id: null, valid, label: "Raíz del proyecto" });
          }}
          onDrop={handleRootDrop}
        >
          Soltar en la raíz del proyecto
        </div>
      ) : null}
      {dragPreview ? createPortal(
        <div
          className="pointer-events-none fixed z-[130] max-w-[260px] -translate-y-1/2 rounded-md border border-orange-200 bg-white/85 px-3 py-1.5 text-[11px] font-semibold text-ink-primary shadow-menu backdrop-blur"
          style={{ left: dragPreview.x + 12, top: dragPreview.y }}
          data-testid="document-tree-drag-preview"
          aria-hidden="true"
        >
          <span className="block truncate">{dragPreview.label}</span>
        </div>,
        document.body,
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
  onOpenHandwrittenNote?: (noteId: string, name: string) => void;
  onOpenImage?: (assetId: string, name: string, path: string) => void;
  onOpenReferenceDocument?: (nodeId: string, name: string, path: string) => void;
  onActivateTreeNode: (nodeId: string) => void;
  onRenameNode: (nodeId: string, name: string) => void;
  onToggleNode: (nodeId: string) => void;
  menuNodeId?: string;
  draggedNodeId?: string;
  dropTarget: { id: string | null; valid: boolean; label: string } | null;
  onMenuEnter: (node: DocumentTreeNode, event: MouseEvent<HTMLButtonElement>) => void;
  onMenuLeave: () => void;
  onDragStart: (node: DocumentTreeNode, event: DragEvent<HTMLDivElement>) => void;
  onNodeDrag: (node: DocumentTreeNode, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onNodeDragOver: (node: DocumentTreeNode, event: DragEvent<HTMLDivElement>) => void;
  onNodeDrop: (node: DocumentTreeNode, event: DragEvent<HTMLDivElement>) => void;
  onMouseDragStart: (node: DocumentTreeNode, event: MouseEvent<HTMLDivElement>) => void;
  onNodeClick: (node: DocumentTreeNode) => void;
  onNodeDoubleClick: (node: DocumentTreeNode) => void;
  changeBadges: Record<string, string>;
  showFileExtensions: boolean;
};

function TreeNode({
  node,
  depth,
  activeNodeId,
  onOpenDocument,
  onOpenHandwrittenNote,
  onOpenImage,
  onOpenReferenceDocument,
  onActivateTreeNode,
  onRenameNode,
  onToggleNode,
  menuNodeId,
  draggedNodeId,
  dropTarget,
  onMenuEnter,
  onMenuLeave,
  onDragStart,
  onNodeDrag,
  onDragEnd,
  onNodeDragOver,
  onNodeDrop,
  onMouseDragStart,
  onNodeClick,
  onNodeDoubleClick,
  changeBadges,
  showFileExtensions,
}: TreeNodeProps) {
  const isFolder = node.type === "folder";
  const isActive = node.id === activeNodeId;
  const hasOpenMenu = node.id === menuNodeId;
  const isDragging = node.id === draggedNodeId;
  const isDropTarget = node.id === dropTarget?.id;
  const shouldRenderChildren = isFolder && node.open && node.children?.length;
  const changeBadge = node.path ? changeBadges[node.path] : undefined;
  const displayName = getTreeNodeDisplayName(node, showFileExtensions);

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
        draggable={false}
        data-reorderable={!node.isEditing ? "true" : undefined}
        onDragStart={(event) => onDragStart(node, event)}
        onDrag={(event) => onNodeDrag(node, event)}
        onDragEnd={onDragEnd}
        onDragOver={(event) => onNodeDragOver(node, event)}
        onDrop={(event) => onNodeDrop(node, event)}
        onMouseDown={(event) => onMouseDragStart(node, event)}
        data-tree-node-id={node.id}
        onClick={() => onNodeClick(node)}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onNodeDoubleClick(node);
        }}
      >
        <span className="mr-0.5 grid h-5 w-4 place-items-center">
          {isFolder ? (
            <button
              type="button"
              className="grid h-5 w-4 place-items-center rounded text-ink-secondary transition hover:bg-brand-hover hover:text-brand-orange"
              aria-label={`${node.open ? "Contraer" : "Expandir"} ${displayName}`}
              onClick={(event) => {
                event.stopPropagation();
                onActivateTreeNode(node.id);
                onToggleNode(node.id);
              }}
            >
              {node.open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : null}
        </span>
        {isFolder ? (
          <Folder size={15} className="mr-1.5 text-brand-orange" />
        ) : node.type === "image" ? (
          <Image size={14} className={["mr-1.5", isActive ? "text-brand-orange" : "text-ink-secondary"].join(" ")} />
        ) : node.type === "handwritten-note" ? (
          <NotebookPen size={14} className={["mr-1.5", isActive ? "text-brand-orange" : "text-ink-secondary"].join(" ")} />
        ) : node.type === "attachment" ? (
          <AttachmentIcon name={node.name} active={isActive} />
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
            <span className={["min-w-0 flex-1 truncate", isActive ? "font-semibold" : ""].join(" ")} title={displayName === node.name ? undefined : node.name}>
              {displayName}
            </span>
            {changeBadge ? (
              <span className="ml-1 max-w-[72px] shrink-0 truncate rounded bg-brand-hover px-1.5 py-0.5 text-[9px] font-semibold text-brand-orange">
                {changeBadge}
              </span>
            ) : null}
            <button
              className="grid h-5 w-5 place-items-center rounded-md opacity-0 hover:bg-white group-hover:opacity-100"
              aria-label={`Abrir menú de ${displayName}`}
              onClick={(event) => {
                event.stopPropagation();
                onMenuEnter(node, event);
              }}
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
              onOpenHandwrittenNote={onOpenHandwrittenNote}
              onOpenImage={onOpenImage}
              onOpenReferenceDocument={onOpenReferenceDocument}
              onActivateTreeNode={onActivateTreeNode}
              onRenameNode={onRenameNode}
              onToggleNode={onToggleNode}
              menuNodeId={menuNodeId}
              draggedNodeId={draggedNodeId}
              dropTarget={dropTarget}
              onMenuEnter={onMenuEnter}
              onMenuLeave={onMenuLeave}
              onDragStart={onDragStart}
              onNodeDrag={onNodeDrag}
              onDragEnd={onDragEnd}
              onNodeDragOver={onNodeDragOver}
              onNodeDrop={onNodeDrop}
              onMouseDragStart={onMouseDragStart}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              changeBadges={changeBadges}
              showFileExtensions={showFileExtensions}
            />
          ))
        : null}
    </div>
  );
}

function AttachmentIcon({ name, active, size = "sm" }: { name: string; active: boolean; size?: "sm" | "md" }) {
  const fileType = getAttachmentFileType(name);
  const Icon = fileType.icon;
  const iconSize = size === "md" ? 15 : 14;
  return (
    <span
      className={[
        "relative grid shrink-0 place-items-center",
        size === "md" ? "h-8 w-8 rounded-md border bg-white" : "h-5 w-4",
        size === "sm" ? "mr-1.5" : "",
        size === "md" ? fileType.containerClass : "",
        active ? "text-brand-orange" : fileType.iconClass,
      ].join(" ")}
      aria-hidden="true"
    >
      <Icon size={iconSize} strokeWidth={1.9} />
      {fileType.badge ? (
        <span
          className={[
            "pointer-events-none absolute rounded-[3px] border px-[2px] font-bold leading-none tracking-normal",
            size === "md" ? "-bottom-0.5 left-1 text-[6px]" : "-bottom-0.5 left-1.5 text-[5px]",
            active ? "border-orange-200 bg-brand-hover text-brand-orange" : fileType.badgeClass,
          ].join(" ")}
        >
          {fileType.badge}
        </span>
      ) : null}
    </span>
  );
}

function getAttachmentFileType(name: string): {
  icon: LucideIcon;
  badge: string | null;
  iconClass: string;
  badgeClass: string;
  containerClass: string;
} {
  const suffix = name.split(".").pop()?.toLowerCase() ?? "";
  switch (suffix) {
    case "pdf":
      return { icon: FileText, badge: "PDF", iconClass: "text-red-600", badgeClass: "border-red-100 bg-red-50 text-red-700", containerClass: "border-red-100" };
    case "docx":
      return { icon: FileText, badge: "DOC", iconClass: "text-sky-700", badgeClass: "border-sky-100 bg-sky-50 text-sky-700", containerClass: "border-sky-100" };
    case "pptx":
      return { icon: Presentation, badge: "PPT", iconClass: "text-orange-700", badgeClass: "border-orange-100 bg-orange-50 text-orange-700", containerClass: "border-orange-100" };
    case "xlsx":
      return { icon: FileSpreadsheet, badge: "XLS", iconClass: "text-emerald-700", badgeClass: "border-emerald-100 bg-emerald-50 text-emerald-700", containerClass: "border-emerald-100" };
    case "txt":
      return { icon: FileText, badge: "TXT", iconClass: "text-slate-600", badgeClass: "border-slate-100 bg-slate-50 text-slate-700", containerClass: "border-slate-100" };
    case "csv":
      return { icon: FileSpreadsheet, badge: "CSV", iconClass: "text-teal-700", badgeClass: "border-teal-100 bg-teal-50 text-teal-700", containerClass: "border-teal-100" };
    case "tsv":
      return { icon: FileSpreadsheet, badge: "TSV", iconClass: "text-teal-700", badgeClass: "border-teal-100 bg-teal-50 text-teal-700", containerClass: "border-teal-100" };
    case "zip":
    case "7z":
    case "rar":
      return { icon: FileArchive, badge: null, iconClass: "text-ink-secondary", badgeClass: "", containerClass: "border-line" };
    case "json":
    case "xml":
    case "yaml":
    case "yml":
      return { icon: FileType, badge: null, iconClass: "text-ink-secondary", badgeClass: "", containerClass: "border-line" };
    default:
      return { icon: File, badge: null, iconClass: "text-ink-secondary", badgeClass: "", containerClass: "border-line" };
  }
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
            Buscar archivos y carpetas
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
              placeholder="Buscar archivos y carpetas"
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
            <div className="px-3 py-8 text-center text-[11px] text-ink-secondary">No hay archivos ni carpetas con ese nombre.</div>
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
                    {result.type === "folder" ? <Folder size={15} /> : result.type === "image" ? <Image size={15} /> : result.type === "handwritten-note" ? <NotebookPen size={15} /> : result.type === "attachment" ? <AttachmentIcon name={result.name} active={index === activeIndex} size="md" /> : <FileText size={15} />}
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

function resolveCurrentCreationParentId(nodes: DocumentTreeNode[], activeTreeNodeId?: string, activeDocumentId?: string): string | null {
  const selectedParentId = resolveNodeCreationParentId(nodes, activeTreeNodeId);
  if (selectedParentId !== undefined) return selectedParentId;
  return resolveNodeCreationParentId(nodes, activeDocumentId) ?? null;
}

function resolveNodeCreationParentId(nodes: DocumentTreeNode[], nodeId?: string | null): string | null | undefined {
  if (!nodeId) return undefined;
  const node = findNodeById(nodes, nodeId);
  if (!node) return undefined;
  if (node.type === "folder") return node.id;
  return getParentId(nodes, node.id) ?? null;
}

function DocumentTreeToolbar({
  filter,
  showFileExtensions,
  disabled,
  onFilterChange,
  onShowFileExtensionsChange,
  onCreateFolder,
  onCreateDocument,
  onCreateHandwrittenNote,
  onImportFile,
  onSearch,
  onExpandTree,
  onCollapseTree,
  onConfigureProject,
  onOpenProjectStatus,
  projectStatus,
}: {
  filter: ExtendedTreeFilter;
  showFileExtensions: boolean;
  disabled: boolean;
  onFilterChange: (filter: ExtendedTreeFilter) => void;
  onShowFileExtensionsChange: (showFileExtensions: boolean) => void;
  onCreateFolder: () => void;
  onCreateDocument: () => void;
  onCreateHandwrittenNote?: () => void;
  onImportFile?: () => void;
  onSearch: () => void;
  onExpandTree: () => void;
  onCollapseTree: () => void;
  onConfigureProject: () => void;
  onOpenProjectStatus?: () => void;
  projectStatus?: ProjectTreeStatus | null;
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
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase text-ink-secondary">Archivos</span>
        {filter !== "all" ? (
          <span className="max-w-[92px] truncate rounded-full border border-orange-200 bg-brand-hover px-1.5 py-0.5 text-[9px] font-semibold text-brand-orange">
            {getTreeFilterLabel(filter)}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-0.5">
        <ToolbarIconButton label="Buscar archivos y carpetas" disabled={disabled} icon={Search} onClick={() => runAction(onSearch)} />
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
        {onOpenProjectStatus ? (
          <ToolbarIconButton
            label={projectStatus ? `Guardado y sincronización: ${projectStatus.label}` : "Guardado y sincronización"}
            icon={GitBranch}
            disabled={disabled}
            badge={projectStatus?.badge}
            tone={projectStatus?.tone}
            onClick={onOpenProjectStatus}
          />
        ) : null}
        <ToolbarIconButton label="Ajustes del proyecto" icon={Settings} disabled={disabled} onClick={onConfigureProject} />
      </div>
      {openPanel === "create" ? (
        <ToolbarMenu className="right-8 top-8 w-[214px]">
          <ToolbarMenuItem icon={FolderPlus} label="Nueva carpeta" description="Crea una carpeta en la ubicación actual" onClick={() => runAction(onCreateFolder)} />
          <ToolbarMenuItem icon={FilePlus2} label="Nuevo Markdown" description="Crea un documento en la ubicación actual" onClick={() => runAction(onCreateDocument)} />
          <ToolbarMenuItem icon={NotebookPen} label="Nota a mano" description="Crea una libreta manuscrita en la ubicación actual" onClick={() => runAction(onCreateHandwrittenNote ?? onCreateDocument)} />
          <ToolbarMenuItem
            icon={FileUp}
            label="Importar archivo"
            description="Importa Markdown, imagen o archivo aquí"
            disabled={!onImportFile}
            onClick={() => onImportFile && runAction(onImportFile)}
          />
        </ToolbarMenu>
      ) : null}
      {openPanel === "view" ? (
        <ToolbarMenu className="right-0 top-8 w-[218px]">
          <ToolbarMenuItem icon={Check} label="Ver todo" active={filter === "all"} onClick={() => runAction(() => onFilterChange("all"))} />
          <ToolbarMenuItem icon={FileText} label="Solo Markdown" active={filter === "documents"} onClick={() => runAction(() => onFilterChange("documents"))} />
          <ToolbarMenuItem icon={NotebookPen} label="Notas a mano" active={filter === "handwritten"} onClick={() => runAction(() => onFilterChange("handwritten"))} />
          <ToolbarMenuItem icon={Image} label="Solo imágenes" active={filter === "images"} onClick={() => runAction(() => onFilterChange("images"))} />
          <ToolbarMenuItem icon={File} label="Solo archivos" active={filter === "attachments"} onClick={() => runAction(() => onFilterChange("attachments"))} />
          <div className="my-1 border-t border-line" />
          <ToolbarMenuItem
            icon={FileType}
            label={showFileExtensions ? "Ocultar extensiones" : "Mostrar extensiones"}
            active={showFileExtensions}
            onClick={() => runAction(() => onShowFileExtensionsChange(!showFileExtensions))}
          />
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
  badge = null,
  tone = "muted",
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  badge?: string | null;
  tone?: ProjectTreeStatus["tone"];
  onClick?: () => void;
}) {
  return (
    <button
      className={[
        "relative grid h-7 w-7 place-items-center rounded-md border border-transparent transition",
        active ? "border-orange-100 bg-brand-hover text-brand-orange" : getToolbarToneClass(tone),
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
      {badge ? (
        <span className={["absolute -right-0.5 -top-0.5 min-w-3 rounded-full px-0.5 text-center text-[8px] font-bold leading-3", getBadgeToneClass(tone)].join(" ")}>
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function getToolbarToneClass(tone: ProjectTreeStatus["tone"]) {
  if (tone === "ok") return "text-green-700 hover:border-green-100 hover:bg-green-50";
  if (tone === "warning") return "text-brand-orange hover:border-orange-100 hover:bg-brand-hover";
  if (tone === "danger") return "text-red-700 hover:border-red-100 hover:bg-red-50";
  return "text-ink-secondary hover:border-orange-100 hover:bg-brand-hover hover:text-brand-orange";
}

function getTreeFilterLabel(filter: ExtendedTreeFilter) {
  if (filter === "documents") return "Markdown";
  if (filter === "handwritten") return "Notas";
  if (filter === "images") return "Imágenes";
  if (filter === "attachments") return "Archivos";
  return "Todo";
}

function getBadgeToneClass(tone: ProjectTreeStatus["tone"]) {
  if (tone === "danger") return "bg-red-600 text-white";
  if (tone === "ok") return "bg-green-600 text-white";
  return "bg-brand-orange text-white";
}

function getProjectStatusFooterClass(tone: ProjectTreeStatus["tone"]) {
  if (tone === "danger") return "border-red-100 bg-red-50 text-red-800 hover:bg-red-100";
  if (tone === "warning") return "border-orange-200 bg-brand-hover text-brand-orange hover:bg-orange-100";
  if (tone === "ok") return "border-green-100 bg-green-50 text-green-800 hover:bg-green-100";
  return "border-line bg-white text-ink-secondary hover:bg-panel";
}

function getProjectStatusDotClass(tone: ProjectTreeStatus["tone"]) {
  if (tone === "danger") return "bg-red-600";
  if (tone === "warning") return "bg-brand-orange";
  if (tone === "ok") return "bg-green-600";
  return "bg-slate-400";
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

function filterTree(nodes: DocumentTreeNode[], filter: ExtendedTreeFilter): DocumentTreeNode[] {
  if (filter === "all") return nodes;
  const acceptedType = filter === "documents" ? "document" : filter === "handwritten" ? "handwritten-note" : filter === "images" ? "image" : "attachment";
  return nodes.flatMap((node) => {
    if (node.type === acceptedType) return [node];
    if (node.type !== "folder") return [];
    const children = filterTree(node.children ?? [], filter);
    if (children.length === 0) return [];
    return [{ ...node, children }];
  });
}

function getTreeNodeDisplayName(node: DocumentTreeNode, showFileExtensions: boolean) {
  if (showFileExtensions || node.type === "folder") return node.name;
  const extensionIndex = node.name.lastIndexOf(".");
  if (extensionIndex <= 0) return node.name;
  return node.name.slice(0, extensionIndex);
}

function containsNodeId(nodes: DocumentTreeNode[], nodeId: string): boolean {
  for (const node of nodes) {
    if (node.id === nodeId) return true;
    if (node.children && containsNodeId(node.children, nodeId)) return true;
  }
  return false;
}

function isDragOverTreeRow(event: DragEvent<HTMLDivElement>) {
  return event.target instanceof Element && event.target.closest(".tree-row") !== null;
}

function getElementAtPoint(clientX: number, clientY: number): Element[] {
  if (typeof document.elementsFromPoint === "function") return document.elementsFromPoint(clientX, clientY);
  const element = document.elementFromPoint?.(clientX, clientY);
  return element ? [element] : [];
}

function dispatchPromptContextDrag(active: boolean, over = false) {
  window.dispatchEvent(new CustomEvent("knownext:tree-context-drag", {
    detail: { active, over },
  }));
}

function getNodeDropTargetFolderId(
  nodes: DocumentTreeNode[],
  draggedNode: DocumentTreeNode,
  targetNode: DocumentTreeNode,
): string | null | undefined {
  if (draggedNode.id === targetNode.id) return undefined;

  if (targetNode.type === "folder") {
    return canMoveToParent(nodes, draggedNode, targetNode.id) ? targetNode.id : undefined;
  }

  const targetParentId = getParentId(nodes, targetNode.id);
  if (targetParentId === undefined) return undefined;
  return canMoveToParent(nodes, draggedNode, targetParentId) ? targetParentId : undefined;
}

function canMoveToParent(nodes: DocumentTreeNode[], draggedNode: DocumentTreeNode, targetFolderId: string | null) {
  const currentParentId = getParentId(nodes, draggedNode.id);
  if (currentParentId === undefined) return false;
  if (currentParentId === targetFolderId) return false;
  if (targetFolderId === null) return true;
  if (draggedNode.id === targetFolderId) return false;
  if (draggedNode.type === "folder" && containsNode(draggedNode, targetFolderId)) return false;

  const targetFolder = findNodeById(nodes, targetFolderId);
  return targetFolder?.type === "folder";
}

function findNodeById(nodes: DocumentTreeNode[], nodeId: string): DocumentTreeNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.children) {
      const childNode = findNodeById(node.children, nodeId);
      if (childNode) return childNode;
    }
  }
  return null;
}

function containsNode(node: DocumentTreeNode, nodeId: string): boolean {
  if (!node.children) return false;
  for (const child of node.children) {
    if (child.id === nodeId) return true;
    if (containsNode(child, nodeId)) return true;
  }
  return false;
}

function isReferenceDocumentName(name: string) {
  return /\.(pdf|docx|xlsx)$/i.test(name);
}

function getContextMenuItemCount(type: DocumentTreeNode["type"]) {
  if (type === "document") return 5;
  if (type === "handwritten-note") return 8;
  if (type === "image") return 7;
  if (type === "attachment") return 6;
  return 7;
}

function getContextMenuHeight(itemCount: number) {
  return itemCount * CONTEXT_MENU_ITEM_HEIGHT + CONTEXT_MENU_PADDING;
}

function getSafeContextMenuPosition({
  anchorX,
  anchorY,
  anchorLeft,
  width,
  height,
}: {
  anchorX: number;
  anchorY: number;
  anchorLeft: number;
  width: number;
  height: number;
}) {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;
  const x = anchorX + width + CONTEXT_MENU_VIEWPORT_GAP > viewportWidth
    ? Math.max(CONTEXT_MENU_VIEWPORT_GAP, anchorLeft - width - CONTEXT_MENU_VIEWPORT_GAP)
    : Math.max(CONTEXT_MENU_VIEWPORT_GAP, anchorX);
  const y = Math.min(
    Math.max(CONTEXT_MENU_VIEWPORT_GAP, anchorY),
    Math.max(CONTEXT_MENU_VIEWPORT_GAP, viewportHeight - height - CONTEXT_MENU_VIEWPORT_GAP),
  );
  return { x, y };
}

function ContextMenu({
  type,
  x,
  y,
  onSelect,
  onMouseEnter,
  onMouseLeave,
}: {
  type: DocumentTreeNode["type"];
  x: number;
  y: number;
  onSelect: (action: DocumentTreeAction) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  type ContextMenuItem = {
    label: string;
    icon: LucideIcon;
    action?: DocumentTreeAction;
    submenu?: Array<{
      label: string;
      icon: LucideIcon;
      action: DocumentTreeAction;
    }>;
  };
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const folderItems: ContextMenuItem[] = [
    { label: "Nueva carpeta", icon: FolderPlus, action: "create-folder" },
    { label: "Nuevo documento", icon: FilePlus2, action: "create-document" },
    { label: "Nueva nota a mano", icon: NotebookPen, action: "create-handwritten-note" },
    { label: "Importar archivo", icon: FileUp, action: "import-file" },
    { label: "Renombrar", icon: Pencil, action: "rename" },
    { label: "Mover", icon: MoveRight, action: "move" },
    { label: "Eliminar", icon: Trash2, action: "delete" },
  ];
  const documentItems: ContextMenuItem[] = [
    {
      label: "Exportar",
      icon: Download,
      submenu: [
        { label: "Markdown (.md)", icon: Download, action: "export-md" },
        { label: "PDF", icon: Download, action: "export-pdf" },
        { label: "DOCX", icon: Download, action: "export-docx" },
      ],
    },
    { label: "Renombrar", icon: Pencil, action: "rename" },
    { label: "Duplicar", icon: Copy, action: "duplicate" },
    { label: "Mover", icon: MoveRight, action: "move" },
    { label: "Eliminar", icon: Trash2, action: "delete" },
  ];
  const handwrittenItems: ContextMenuItem[] = [
    { label: "Abrir", icon: NotebookPen, action: "open-handwritten-note" },
    {
      label: "Exportar",
      icon: Download,
      submenu: [
        { label: "KNOTE", icon: Download, action: "export-knote" },
        { label: "PDF", icon: Download, action: "export-note-pdf" },
        { label: "PNG", icon: Download, action: "export-note-png" },
        { label: "SVG", icon: Download, action: "export-note-svg" },
      ],
    },
    { label: "Insertar en documento", icon: FileImage, action: "insert-image" },
    { label: "Usar como contexto IA", icon: Copy, action: "add-handwritten-context" },
    { label: "Renombrar", icon: Pencil, action: "rename" },
    { label: "Duplicar", icon: Copy, action: "duplicate" },
    { label: "Mover", icon: MoveRight, action: "move" },
    { label: "Eliminar", icon: Trash2, action: "delete" },
  ];
  const attachmentItems: ContextMenuItem[] = [
    { label: "Abrir vista", icon: Eye, action: "open-reference-document" },
    { label: "Usar como contexto IA", icon: Copy, action: "add-attachment-context" },
    { label: "Copiar ruta", icon: Copy, action: "copy-path" },
    { label: "Renombrar", icon: Pencil, action: "rename" },
    { label: "Mover", icon: MoveRight, action: "move" },
    { label: "Eliminar", icon: Trash2, action: "delete" },
  ];
  const imageItems: ContextMenuItem[] = [
    { label: "Abrir", icon: Image, action: "open-image" },
    { label: "Insertar en documento", icon: FileImage, action: "insert-image" },
    { label: "Usar como contexto IA", icon: Copy, action: "add-image-context" },
    { label: "Copiar referencia", icon: Copy, action: "copy-image-reference" },
    { label: "Renombrar", icon: Pencil, action: "rename" },
    { label: "Mover", icon: MoveRight, action: "move" },
    { label: "Eliminar", icon: Trash2, action: "delete" },
  ];
  const items: ContextMenuItem[] = type === "folder" ? folderItems : type === "image" ? imageItems : type === "attachment" ? attachmentItems : type === "handwritten-note" ? handwrittenItems : documentItems;
  const submenuOpensLeft = x + CONTEXT_MENU_WIDTH + CONTEXT_SUBMENU_WIDTH + CONTEXT_MENU_VIEWPORT_GAP > (window.innerWidth || document.documentElement.clientWidth || 1024);

  return (
    <div
      className="fixed z-50 w-[176px] overflow-y-auto rounded-md border border-line bg-white p-1 shadow-menu"
      style={{ left: x, top: y, maxHeight: `calc(100vh - ${CONTEXT_MENU_VIEWPORT_GAP * 2}px)` }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {items.map((item, index) => {
        const submenu = item.submenu ?? [];
        const hasSubmenu = submenu.length > 0;
        const isOpen = hasSubmenu && openSubmenu === item.label;
        const submenuHeight = getContextMenuHeight(submenu.length);
        const submenuTop = Math.min(
          index * CONTEXT_MENU_ITEM_HEIGHT,
          Math.max(0, (window.innerHeight || document.documentElement.clientHeight || 768) - y - submenuHeight - CONTEXT_MENU_VIEWPORT_GAP),
        );

        return (
          <div key={item.label} className="group relative">
            <button
              className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover focus:bg-brand-hover focus:outline-none"
              aria-haspopup={hasSubmenu ? "menu" : undefined}
              aria-expanded={hasSubmenu ? isOpen : undefined}
              onMouseEnter={() => setOpenSubmenu(hasSubmenu ? item.label : null)}
              onFocus={() => setOpenSubmenu(hasSubmenu ? item.label : null)}
              onClick={() => {
                if (hasSubmenu) {
                  setOpenSubmenu(isOpen ? null : item.label);
                  return;
                }
                if (item.action) onSelect(item.action as DocumentTreeAction);
              }}
            >
              <item.icon size={13} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {hasSubmenu ? <ChevronRight size={13} className="text-muted" /> : null}
            </button>
            {hasSubmenu ? (
              <div
                className={`absolute z-50 w-[150px] overflow-y-auto rounded-md border border-line bg-white p-1 shadow-menu ${
                  isOpen ? "block" : "hidden group-hover:block group-focus-within:block"
                }`}
                style={{
                  top: submenuTop,
                  left: submenuOpensLeft ? undefined : "100%",
                  right: submenuOpensLeft ? "100%" : undefined,
                  marginLeft: submenuOpensLeft ? undefined : 6,
                  marginRight: submenuOpensLeft ? 6 : undefined,
                  maxHeight: `calc(100vh - ${CONTEXT_MENU_VIEWPORT_GAP * 2}px)`,
                }}
                role="menu"
              >
                {submenu.map((submenuItem) => (
                  <button
                    key={submenuItem.action}
                    className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover focus:bg-brand-hover focus:outline-none"
                    role="menuitem"
                    onClick={() => onSelect(submenuItem.action)}
                  >
                    <submenuItem.icon size={13} />
                    <span className="min-w-0 truncate">{submenuItem.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
