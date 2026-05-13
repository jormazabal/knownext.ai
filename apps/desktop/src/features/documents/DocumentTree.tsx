import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  FolderPlus,
  MoreVertical,
  Pencil,
  Trash2,
  MoveRight,
  FilePlus2,
} from "lucide-react";
import { useRef, useState, type DragEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { DocumentTreeNode } from "../../types/domain";

type DocumentTreeProps = {
  nodes: DocumentTreeNode[];
  activeDocumentId: string;
  onOpenDocument: (documentId: string, name: string) => void;
  onRenameNode: (nodeId: string, name: string) => void;
  onToggleNode: (nodeId: string) => void;
  onContextAction: (action: DocumentTreeAction, node: DocumentTreeNode) => void;
  onMoveNode: (node: DocumentTreeNode, targetFolderId: string | null) => void | Promise<void>;
};

export type DocumentTreeAction =
  | "create-folder"
  | "create-document"
  | "rename"
  | "delete"
  | "duplicate"
  | "move";

export function DocumentTree({
  nodes,
  activeDocumentId,
  onOpenDocument,
  onRenameNode,
  onToggleNode,
  onContextAction,
  onMoveNode,
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
        {nodes.length > 0 ? (
          nodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              activeDocumentId={activeDocumentId}
              onOpenDocument={onOpenDocument}
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
            />
          ))
        ) : (
          <div className="px-3 py-2 text-[11px] leading-5 text-ink-secondary">
            No hay documentos Markdown en esta carpeta.
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
    </div>
  );
}

type TreeNodeProps = {
  node: DocumentTreeNode;
  depth: number;
  activeDocumentId: string;
  onOpenDocument: (documentId: string, name: string) => void;
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
};

function TreeNode({
  node,
  depth,
  activeDocumentId,
  onOpenDocument,
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
}: TreeNodeProps) {
  const isFolder = node.type === "folder";
  const isActive = node.id === activeDocumentId;
  const hasOpenMenu = node.id === menuNodeId;
  const isDragging = node.id === draggedNodeId;
  const isDropTarget = node.id === dropTarget?.id;
  const shouldRenderChildren = isFolder && node.open && node.children?.length;

  return (
    <div>
      <div
        className={[
          "tree-row group relative flex h-6 select-none items-center rounded-md pr-1.5 transition",
          node.isEditing ? "cursor-default" : isDragging ? "cursor-grabbing" : "cursor-default",
          isDragging ? "opacity-45" : "",
          isDropTarget && dropTarget?.valid ? "bg-brand-hover ring-1 ring-inset ring-brand-orange" : "",
          isDropTarget && !dropTarget?.valid ? "bg-red-50 ring-1 ring-inset ring-red-200" : "",
          !isDropTarget && (isActive || hasOpenMenu) ? "bg-brand-hover" : "",
          !isDropTarget && !isActive && !hasOpenMenu ? "hover:bg-brand-hover" : "",
        ].join(" ")}
        style={{ paddingLeft: 6 + depth * 18 }}
        draggable={!node.isEditing}
        onDragStart={(event) => onDragStart(node, event)}
        onDragEnd={onDragEnd}
        onDragOver={isFolder ? (event) => onFolderDragOver(node, event) : undefined}
        onDrop={isFolder ? (event) => onFolderDrop(node, event) : undefined}
        onClick={() => {
          if (node.isEditing) return;
          if (isFolder) onToggleNode(node.id);
          if (!isFolder) onOpenDocument(node.id, node.name);
        }}
      >
        <span className="mr-0.5 grid h-5 w-4 place-items-center">
          {isFolder ? (node.open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </span>
        {isFolder ? (
          <Folder size={15} className="mr-1.5 text-brand-orange" />
        ) : (
          <FileText size={14} className="mr-1.5 text-ink-secondary" />
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
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
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
              activeDocumentId={activeDocumentId}
              onOpenDocument={onOpenDocument}
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
            />
          ))
        : null}
    </div>
  );
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
  type: "folder" | "document";
  x: number;
  y: number;
  onSelect: (action: DocumentTreeAction) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const folderItems = [
    { label: "Nueva carpeta", icon: FolderPlus, action: "create-folder" },
    { label: "Nuevo documento", icon: FilePlus2, action: "create-document" },
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
  const items = type === "folder" ? folderItems : documentItems;

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
