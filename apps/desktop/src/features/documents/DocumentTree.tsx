import {
  Mic,
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
import type { SelectionAction } from "../../types/fileBatch";
import { clearDocumentTreeDragData, getDocumentTreeDragData, setDocumentTreeDragData } from "../../lib/dragData";
import { ModalFrame } from "../../components/ui/ModalFrame";
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
  onRecordAudio?: (parentId: string | null) => void;
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
  onBatchAction?: (action: SelectionAction, nodeIds: string[], targetFolderId?:string|null) => void;
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

const CONTEXT_MENU_WIDTH = 244;
const CONTEXT_SUBMENU_WIDTH = 150;
const CONTEXT_MENU_ITEM_HEIGHT = 28;
const CONTEXT_MENU_PADDING = 8;
const CONTEXT_MENU_VIEWPORT_GAP = 8;

export type DocumentTreeAction =
  | "record-audio"
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
  onRecordAudio,
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
  onBatchAction,
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const selectionAnchor = useRef<string | null>(null);
  function flatten(items: DocumentTreeNode[], visibleOnly = false): DocumentTreeNode[] {
    return items.flatMap(item => [item, ...((!visibleOnly || item.open) && item.children ? flatten(item.children, visibleOnly) : [])]);
  }
  const allIds = new Set(flatten(nodes).map(node => node.id));
  const selectedIds = [...selection].filter(id => allIds.has(id));
  const draggedSelection=useRef<string[]>([]);
  function moveDragged(node:DocumentTreeNode,target:string|null){
    if(draggedSelection.current.length>1&&onBatchAction){onBatchAction("move",draggedSelection.current,target);return;}
    void onMoveNode(node,target);
  }
  function dragCanMove(node:DocumentTreeNode,target:string|null){const ids=draggedSelection.current.length>1?draggedSelection.current:[node.id];return ids.every(id=>{const source=findNodeById(nodes,id);return source&&canMoveToParent(nodes,source,target);});}
  const visibleIds = new Set(flatten(visibleNodes, true).map(node => node.id));
  const hiddenCount = selectedIds.filter(id => !visibleIds.has(id)).length;
  function toggleSelection(id: string, range = false) {
    const rows = flatten(visibleNodes, true).map(node => node.id);
    const start = selectionAnchor.current ? rows.indexOf(selectionAnchor.current) : -1;
    const end = rows.indexOf(id);
    setSelection(current => {
      const next = new Set([...current].filter(id => allIds.has(id)));
      if (range && start >= 0 && end >= 0) rows.slice(Math.min(start,end), Math.max(start,end) + 1).forEach(id => next.add(id));
      else if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    selectionAnchor.current = id;
  }
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

  useEffect(() => {
    if (!openMenu) return;
    const closeOutside = (event: globalThis.PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-document-tree-menu]")) setOpenMenu(null);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpenMenu(null); }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu?.node.id]);

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

  function handleMenuEnter(node: DocumentTreeNode, event: MouseEvent<HTMLElement>) {
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
    draggedSelection.current=selectionMode&&selectedIds.includes(node.id)?selectedIds:[node.id];
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
    setDocumentTreeDragData(event.dataTransfer, node,draggedSelection.current);
    const ghost = document.createElement("div");
    ghost.textContent = draggedSelection.current.length>1?`${draggedSelection.current.length} elementos`:node.name;
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
    draggedSelection.current=[];
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
    const valid = dragCanMove(activeDraggedNode, null);
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
    const valid = dragCanMove(activeDraggedNode, null);
    if (valid) moveDragged(activeDraggedNode, null);
    finishDrag();
  }

  function handleNodeDragOver(targetNode: DocumentTreeNode, event: DragEvent<HTMLDivElement>) {
    const activeDraggedNode = getActiveDraggedNode(event.dataTransfer);
    if (!activeDraggedNode) return;
    event.preventDefault();
    event.stopPropagation();
    updateDragPreview(activeDraggedNode, event.clientX, event.clientY);
    const targetFolderId = getNodeDropTargetFolderId(nodes, activeDraggedNode, targetNode);
    const valid = targetFolderId !== undefined&&dragCanMove(activeDraggedNode,targetFolderId);
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
    if (targetFolderId !== undefined&&dragCanMove(activeDraggedNode,targetFolderId)) {
      moveDragged(activeDraggedNode, targetFolderId);
    }
    finishDrag();
  }

  function startMouseDrag(node: DocumentTreeNode, event: MouseEvent<HTMLDivElement>) {
    draggedSelection.current=selectionMode&&selectedIds.includes(node.id)?selectedIds:[node.id];
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
      if(draggedSelection.current.length>1&&onBatchAction)onBatchAction("context",draggedSelection.current);else void onAddNodeContext?.(drag.node.id);
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
      if(dragCanMove(drag.node,target.targetFolderId))moveDragged(drag.node, target.targetFolderId);
    }
    finishDrag();
  }

  function canDropNodeIntoPrompt(node: DocumentTreeNode) {
    if(draggedSelection.current.length>1&&onBatchAction)return true;
    return node.type !== "folder" && Boolean(onAddNodeContext);
  }

  function updateDragPreview(node: DocumentTreeNode, clientX: number, clientY: number, fallbackElement?: HTMLElement | null) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || (clientX === 0 && clientY === 0)) {
      if (!fallbackElement) return;
      const rect = fallbackElement.getBoundingClientRect();
      clientX = rect.left + 12;
      clientY = rect.top + Math.max(12, Math.min(18, rect.height / 2 || 12));
    }
    setDragPreview({ label: draggedSelection.current.length>1?`${draggedSelection.current.length} elementos`:node.name, x: clientX, y: clientY });
  }

  function canDropImageIntoDocument(node: DocumentTreeNode) {
    if(draggedSelection.current.length>1)return false;
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
        valid: targetFolderId !== undefined&&dragCanMove(activeDraggedNode,targetFolderId),
        label: targetNode.name,
        targetFolderId,
      };
    }

    const rootRect = rootDropRef.current?.getBoundingClientRect();
    if (!rootRect || clientX < rootRect.left || clientX > rootRect.right || clientY < rootRect.top || clientY > rootRect.bottom) {
      return null;
    }
    const valid = dragCanMove(activeDraggedNode, null);
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

  function handleNodeClick(node: DocumentTreeNode, touch = false) {
    if (suppressNextNodeClickRef.current) {
      suppressNextNodeClickRef.current = false;
      return;
    }
    if (node.isEditing) return;
    if (touch) { handleNodeDoubleClick(node); return; }
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
        onRecordAudio={onRecordAudio ? () => onRecordAudio(currentParentId) : undefined}
        onCreateHandwrittenNote={onCreateHandwrittenNote ? () => onCreateHandwrittenNote(currentParentId) : undefined}
        onImportFile={onImportFile ? () => onImportFile(currentParentId) : undefined}
        onSearch={() => setSearchOpen(true)}
        onExpandTree={onExpandTree}
        onCollapseTree={onCollapseTree}
        onConfigureProject={onConfigureProject}
        onOpenProjectStatus={onOpenProjectStatus}
        projectStatus={projectStatus}
      />
      {onBatchAction && <div className="px-2 pb-2 text-xs">
        <div className="flex items-center justify-between gap-1"><button className="min-h-8 rounded px-2 hover:bg-brand-hover" aria-pressed={selectionMode} onClick={() => { setSelectionMode(!selectionMode); setSelection(new Set()); }}>{selectionMode ? "Cancelar selección" : "Seleccionar"}</button>
          {selectionMode && <span role="status" className="text-right text-ink-secondary">{selectedIds.length} seleccionados{hiddenCount > 0 ? ` · ${hiddenCount} ocultos` : ""}</span>}
        </div>
        {selectionMode && <div className="flex flex-wrap gap-1">
          <button disabled={!selectedIds.length} className="flex min-h-11 items-center gap-2 rounded px-2 hover:bg-brand-hover disabled:opacity-40" onClick={() => onBatchAction("move",selectedIds)}><MoveRight size={14}/>Mover a…</button>
          <button disabled={!selectedIds.length} className="flex min-h-11 items-center gap-2 rounded px-2 hover:bg-brand-hover disabled:opacity-40" onClick={() => onBatchAction("trash",selectedIds)}><Trash2 size={14}/>Papelera</button>
          <select aria-label="Más acciones de selección" disabled={!selectedIds.length} value="" className="min-h-11 min-w-0 max-w-full rounded border border-line bg-white px-2" onChange={event=>{const action=event.target.value as SelectionAction;if(action)onBatchAction(action,selectedIds);}}><option value="">Más acciones…</option><option value="duplicate">Duplicar lo guardado</option><option value="rename">Renombrar…</option><option value="export">Exportar selección…</option><option value="context">Añadir al contexto IA…</option></select>
        </div>}
      </div>}
      <div
        ref={rootDropRef}
        role="tree"
        aria-multiselectable={selectionMode || undefined}
        onKeyDown={event => { if (event.key === "Escape" && selectionMode) { event.preventDefault(); setSelectionMode(false); setSelection(new Set()); } }}
        aria-label="Archivos del proyecto"
        tabIndex={0}
        onFocus={event => {
          if (event.target !== event.currentTarget) return;
          const item = event.currentTarget.querySelector<HTMLElement>('[role="treeitem"][aria-selected="true"]') ?? event.currentTarget.querySelector<HTMLElement>('[role="treeitem"]');
          item?.focus();
        }}
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
              selection={selectionMode ? selection : undefined}
              onToggleSelection={toggleSelection}
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
            const valid = dragCanMove(activeDraggedNode, null);
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
  selection?: Set<string>;
  onToggleSelection?: (id: string, range?: boolean) => void;
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
  onMenuEnter: (node: DocumentTreeNode, event: MouseEvent<HTMLElement>) => void;
  onMenuLeave: () => void;
  onDragStart: (node: DocumentTreeNode, event: DragEvent<HTMLDivElement>) => void;
  onNodeDrag: (node: DocumentTreeNode, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onNodeDragOver: (node: DocumentTreeNode, event: DragEvent<HTMLDivElement>) => void;
  onNodeDrop: (node: DocumentTreeNode, event: DragEvent<HTMLDivElement>) => void;
  onMouseDragStart: (node: DocumentTreeNode, event: MouseEvent<HTMLDivElement>) => void;
  onNodeClick: (node: DocumentTreeNode, touch?: boolean) => void;
  onNodeDoubleClick: (node: DocumentTreeNode) => void;
  changeBadges: Record<string, string>;
  showFileExtensions: boolean;
};

function TreeNode({
  selection,
  onToggleSelection,
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
    <div role="treeitem" aria-label={displayName} aria-level={depth + 1}
      aria-expanded={isFolder ? Boolean(node.open) : undefined} aria-selected={selection ? selection.has(node.id) : isActive}
      tabIndex={isActive ? 0 : -1} data-focus-node-id={node.id}
      onFocus={event => { if (event.target === event.currentTarget) onActivateTreeNode(node.id); }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || node.isEditing) return;
        const tree = event.currentTarget.closest('[role="tree"]');
        const items = Array.from(tree?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []);
        const index = items.indexOf(event.currentTarget);
        const focus = (target: HTMLElement | undefined | null) => target?.focus();
        if (event.key === "ArrowDown") { event.preventDefault(); focus(items[Math.min(items.length - 1, index + 1)]); }
        else if (event.key === "ArrowUp") { event.preventDefault(); focus(items[Math.max(0, index - 1)]); }
        else if (event.key === "Home") { event.preventDefault(); focus(items[0]); }
        else if (event.key === "End") { event.preventDefault(); focus(items[items.length - 1]); }
        else if (event.key === "ArrowRight" && isFolder) { event.preventDefault(); if (!node.open) onToggleNode(node.id); else if (node.children?.length) focus(items[index + 1]); }
        else if (event.key === "ArrowLeft") { event.preventDefault(); if (isFolder && node.open) onToggleNode(node.id); else focus(event.currentTarget.parentElement?.closest<HTMLElement>('[role="treeitem"]')); }
        else if (event.key === " " && selection) { event.preventDefault(); onToggleSelection?.(node.id, event.shiftKey); }
        else if (event.key === "Enter") { event.preventDefault(); onNodeDoubleClick(node); }
        else if (event.key === " " && isFolder) { event.preventDefault(); onToggleNode(node.id); }
        else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>('button[aria-label^="Abrir men"]')?.click(); }
      }}>

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
        onMouseDown={(event) => { if (!selection) onMouseDragStart(node, event); }}
        data-tree-node-id={node.id}
        onContextMenu={(event) => {
          if (node.isEditing) return;
          event.preventDefault();
          event.stopPropagation();
          onActivateTreeNode(node.id);
          onMenuEnter(node, event);
        }}
        onClick={event => { if (selection) onToggleSelection?.(node.id,event.shiftKey); else onNodeClick(node, (event.nativeEvent as globalThis.PointerEvent).pointerType === "touch"); }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (!selection) onNodeDoubleClick(node);
        }}
      >
        {selection && <input type="checkbox" tabIndex={-1} aria-label={`Seleccionar ${displayName}`} checked={selection.has(node.id)} onClick={event => { event.stopPropagation(); onToggleSelection?.(node.id,event.shiftKey); }} onChange={() => {}} className="mr-1 h-4 w-4 shrink-0 accent-brand-orange"/>}
        <span className="mr-0.5 grid h-5 w-4 place-items-center">
          {isFolder ? (
            <button tabIndex={-1}
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
            <button tabIndex={-1}
              className="grid h-5 w-5 place-items-center rounded-md opacity-0 hover:bg-white group-hover:opacity-100 focus:opacity-100 [@media(pointer:coarse)]:opacity-100 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
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
        ? <div role="group">{node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selection={selection}
              onToggleSelection={onToggleSelection}
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
          ))}</div>
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
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => searchDocumentTreeByName(nodes, query), [nodes, query]);
  const activeResult = results[activeIndex] ?? results[0];
  const completion = getInlineNameCompletion(query, results[0]);
  const hasMore = query.trim().length > 0 && searchDocumentTreeByName(nodes, query, 11).length > results.length;

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function selectResult(result = activeResult) {
    if (result) onSelect(result);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
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
    if (event.key === "Enter" || event.key === "Tab" && !event.shiftKey) {
      if (!activeResult) return;
      event.preventDefault();
      selectResult(activeResult);
    }
  }

  return (
    <ModalFrame label="Buscar archivos y carpetas" onClose={onClose} className="!z-[180]">
      <div className="absolute inset-0" aria-hidden="true" onMouseDown={onClose} />
      <section
        className="relative flex max-h-[min(520px,calc(100dvh-24px))] w-[min(560px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
          <Search size={16} className="shrink-0 text-ink-secondary" />
          <label id="document-name-search-title" className="sr-only">
            Buscar archivos y carpetas
          </label>
          <div className="relative min-w-0 flex-1">
            {completion ? (
              <div className="pointer-events-none absolute inset-0 z-0 flex h-11 items-center overflow-hidden whitespace-pre px-1 text-[13px] text-ink-secondary/35" aria-hidden="true">
                {query}
                {completion}
              </div>
            ) : null}
            <input
              data-autofocus
              aria-label="Buscar archivos y carpetas"
              className="relative z-10 h-11 w-full bg-transparent px-1 text-[13px] text-ink-primary caret-brand-orange outline-none placeholder:text-ink-secondary/70"
              value={query}
              placeholder="Buscar archivos y carpetas"
              aria-autocomplete="list"
              aria-controls="document-name-search-results"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <button
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
            type="button"
            data-tooltip="Cerrar"
            aria-label="Cerrar búsqueda"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <div id="document-name-search-results" className="min-h-0 max-h-[360px] overflow-y-auto p-1.5" role="listbox">
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
    </ModalFrame>
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
  onRecordAudio,
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
  onRecordAudio?: () => void;
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
          {onRecordAudio && <ToolbarMenuItem icon={Mic} label="Grabar audio y crear documento…" description="Graba una reunión en esta carpeta" onClick={() => runAction(onRecordAudio)} />}
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
        "flex min-h-8 [@media(pointer:coarse)]:min-h-11 w-full items-center gap-2 rounded px-2 text-left text-[11px] transition",
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
  return 8;
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
    { label: "Grabar audio y crear documento…", icon: Mic, action: "record-audio" },
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
      data-document-tree-menu="true"
      className="fixed z-50 w-[244px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-md border border-line bg-white p-1 shadow-menu"
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
              className="flex h-7 [@media(pointer:coarse)]:h-11 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover focus:bg-brand-hover focus:outline-none"
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
                    className="flex h-7 [@media(pointer:coarse)]:h-11 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover focus:bg-brand-hover focus:outline-none"
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
