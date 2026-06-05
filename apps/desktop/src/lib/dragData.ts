import type { DocumentTreeNode } from "../types/domain";

export const DOCUMENT_TREE_NODE_DRAG_MIME = "application/x-knownext-tree-node";
export const DOCUMENT_TREE_FILE_DRAG_MIME = "application/x-knownext-tree-file";
const DOCUMENT_TREE_TEXT_PREFIX = "knownext-tree:";

export type DocumentTreeDragData = {
  id: string;
  type: DocumentTreeNode["type"];
  name: string;
  path?: string | null;
};

let activeDocumentTreeDragData: DocumentTreeDragData | null = null;

export function setDocumentTreeDragData(dataTransfer: DataTransfer, node: DocumentTreeNode) {
  const payload: DocumentTreeDragData = {
    id: node.id,
    type: node.type,
    name: node.name,
    path: node.path ?? null,
  };
  const serializedPayload = JSON.stringify(payload);

  activeDocumentTreeDragData = payload;
  safeSetData(dataTransfer, DOCUMENT_TREE_NODE_DRAG_MIME, serializedPayload);
  safeSetData(dataTransfer, "text/plain", `${DOCUMENT_TREE_TEXT_PREFIX}${serializedPayload}`);
  if (node.type !== "folder") {
    safeSetData(dataTransfer, DOCUMENT_TREE_FILE_DRAG_MIME, serializedPayload);
  }
}

export function clearDocumentTreeDragData() {
  activeDocumentTreeDragData = null;
}

export function getDocumentTreeDragData(dataTransfer?: DataTransfer | null): DocumentTreeDragData | null {
  return readDocumentTreeDragData(dataTransfer, false);
}

export function hasDocumentTreeFileDragData(dataTransfer: DataTransfer) {
  const types = Array.from(dataTransfer.types ?? []);
  if (types.includes(DOCUMENT_TREE_FILE_DRAG_MIME)) return true;
  if (types.includes("text/plain")) {
    const textPayload = parseTextPayload(safeGetData(dataTransfer, "text/plain"), true);
    if (textPayload) return true;
  }
  return Boolean(activeDocumentTreeDragData && activeDocumentTreeDragData.type !== "folder");
}

export function getDocumentTreeFileDragData(dataTransfer: DataTransfer): DocumentTreeDragData | null {
  return readDocumentTreeDragData(dataTransfer, true);
}

function readDocumentTreeDragData(dataTransfer: DataTransfer | null | undefined, fileOnly: boolean) {
  const customType = fileOnly ? DOCUMENT_TREE_FILE_DRAG_MIME : DOCUMENT_TREE_NODE_DRAG_MIME;
  const rawPayload = dataTransfer ? safeGetData(dataTransfer, customType) : "";
  const customPayload = parseJsonPayload(rawPayload, fileOnly);
  if (customPayload) return customPayload;

  const textPayload = dataTransfer ? parseTextPayload(safeGetData(dataTransfer, "text/plain"), fileOnly) : null;
  if (textPayload) return textPayload;

  if (!activeDocumentTreeDragData) return null;
  if (fileOnly && activeDocumentTreeDragData.type === "folder") return null;
  return activeDocumentTreeDragData;
}

function parseTextPayload(rawPayload: string, fileOnly: boolean) {
  if (!rawPayload.startsWith(DOCUMENT_TREE_TEXT_PREFIX)) return null;
  return parseJsonPayload(rawPayload.slice(DOCUMENT_TREE_TEXT_PREFIX.length), fileOnly);
}

function parseJsonPayload(rawPayload: string, fileOnly: boolean): DocumentTreeDragData | null {
  if (!rawPayload) return null;

  try {
    const parsedPayload = JSON.parse(rawPayload) as Partial<DocumentTreeDragData>;
    if (typeof parsedPayload.id !== "string" || parsedPayload.id.length === 0) return null;
    if (
      parsedPayload.type !== "folder"
      && parsedPayload.type !== "document"
      && parsedPayload.type !== "image"
      && parsedPayload.type !== "attachment"
    ) return null;
    if (fileOnly && parsedPayload.type === "folder") return null;
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

function safeSetData(dataTransfer: DataTransfer, type: string, value: string) {
  try {
    dataTransfer.setData(type, value);
  } catch {
    // Some WebView drag implementations reject custom MIME types.
  }
}

function safeGetData(dataTransfer: DataTransfer, type: string) {
  try {
    return dataTransfer.getData(type);
  } catch {
    return "";
  }
}
