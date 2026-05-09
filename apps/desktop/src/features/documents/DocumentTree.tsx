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
import { useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { DocumentTreeNode } from "../../types/domain";

type DocumentTreeProps = {
  nodes: DocumentTreeNode[];
  activeDocumentId: string;
  onOpenDocument: (documentId: string, name: string) => void;
  onRenameNode: (nodeId: string, name: string) => void;
  onToggleNode: (nodeId: string) => void;
  onContextAction: (action: DocumentTreeAction, node: DocumentTreeNode) => void;
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
}: DocumentTreeProps) {
  const closeTimer = useRef<number | null>(null);
  const [openMenu, setOpenMenu] = useState<{
    node: DocumentTreeNode;
    x: number;
    y: number;
  } | null>(null);

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

  return (
    <div className="cursor-default space-y-0.5 text-[13px]" onScroll={() => setOpenMenu(null)}>
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
              onMenuEnter={handleMenuEnter}
              onMenuLeave={scheduleCloseMenu}
            />
          ))
        ) : (
          <div className="px-3 py-2 text-[12px] leading-5 text-ink-secondary">
            No hay documentos Markdown en esta carpeta.
          </div>
        )}
      </div>
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
  onMenuEnter: (node: DocumentTreeNode, event: MouseEvent<HTMLButtonElement>) => void;
  onMenuLeave: () => void;
};

function TreeNode({
  node,
  depth,
  activeDocumentId,
  onOpenDocument,
  onRenameNode,
  onToggleNode,
  menuNodeId,
  onMenuEnter,
  onMenuLeave,
}: TreeNodeProps) {
  const isFolder = node.type === "folder";
  const isActive = node.id === activeDocumentId;
  const hasOpenMenu = node.id === menuNodeId;
  const shouldRenderChildren = isFolder && node.open && node.children?.length;

  return (
    <div>
      <div
        className={[
          "tree-row group relative flex h-7 cursor-default select-none items-center rounded-md pr-2",
          isActive || hasOpenMenu ? "bg-brand-hover" : "hover:bg-brand-hover",
        ].join(" ")}
        style={{ paddingLeft: 8 + depth * 20 }}
        onClick={() => {
          if (node.isEditing) return;
          if (isFolder) onToggleNode(node.id);
          if (!isFolder) onOpenDocument(node.id, node.name);
        }}
      >
        <span className="mr-1 grid h-5 w-4 place-items-center">
          {isFolder ? (node.open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </span>
        {isFolder ? (
          <Folder size={15} className="mr-2 text-brand-orange" />
        ) : (
          <FileText size={14} className="mr-2 text-ink-secondary" />
        )}
        {node.isEditing ? (
          <input
            className="min-w-0 flex-1 cursor-text rounded border border-brand-orange bg-white px-1 py-0.5 text-[13px] outline-none"
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
              className="grid h-6 w-6 place-items-center rounded-md opacity-0 hover:bg-white group-hover:opacity-100"
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
              onMenuEnter={onMenuEnter}
              onMenuLeave={onMenuLeave}
            />
          ))
        : null}
    </div>
  );
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
