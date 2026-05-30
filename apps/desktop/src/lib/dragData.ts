import type { DocumentTreeNode } from "../types/domain";

export const DOCUMENT_TREE_NODE_DRAG_MIME = "application/x-knownext-tree-node";
export const DOCUMENT_TREE_FILE_DRAG_MIME = "application/x-knownext-tree-file";

export type DocumentTreeDragData = {
  id: string;
  type: DocumentTreeNode["type"];
  name: string;
  path?: string | null;
};

export function setDocumentTreeDragData(dataTransfer: DataTransfer, node: DocumentTreeNode) {
  const payload: DocumentTreeDragData = {
    id: node.id,
    type: node.type,
    name: node.name,
    path: node.path ?? null,
  };
  const serializedPayload = JSON.stringify(payload);

  dataTransfer.setData(DOCUMENT_TREE_NODE_DRAG_MIME, serializedPayload);
  if (node.type !== "folder") {
    dataTransfer.setData(DOCUMENT_TREE_FILE_DRAG_MIME, serializedPayload);
  }
}

export function hasDocumentTreeFileDragData(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types ?? []).includes(DOCUMENT_TREE_FILE_DRAG_MIME);
}

export function getDocumentTreeFileDragData(dataTransfer: DataTransfer): DocumentTreeDragData | null {
  const rawPayload = dataTransfer.getData(DOCUMENT_TREE_FILE_DRAG_MIME);
  if (!rawPayload) return null;

  try {
    const parsedPayload = JSON.parse(rawPayload) as Partial<DocumentTreeDragData>;
    if (typeof parsedPayload.id !== "string" || parsedPayload.id.length === 0) return null;
    if (parsedPayload.type !== "document" && parsedPayload.type !== "image" && parsedPayload.type !== "attachment") return null;
    return {
      id: parsedPayload.id,
      type: parsedPayload.type,
      name: typeof parsedPayload.name === "string" ? parsedPayload.name : parsedPayload.id,
      path: typeof parsedPayload.path === "string" ? parsedPayload.path : null,
    };
  } catch {
    return null;
  }
}
