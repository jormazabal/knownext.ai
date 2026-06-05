import { describe, expect, it, vi } from "vitest";
import {
  clearDocumentTreeDragData,
  DOCUMENT_TREE_FILE_DRAG_MIME,
  DOCUMENT_TREE_NODE_DRAG_MIME,
  getDocumentTreeDragData,
  getDocumentTreeFileDragData,
  hasDocumentTreeFileDragData,
  setDocumentTreeDragData,
} from "./dragData";
import type { DocumentTreeNode } from "../types/domain";

describe("document tree drag data", () => {
  it("keeps a text/plain fallback for WebView drag implementations that drop custom MIME data", () => {
    const node: DocumentTreeNode = {
      id: "doc-functional",
      type: "document",
      name: "requisitos-funcionales.md",
      path: "docs/requisitos-funcionales.md",
    };
    const dataTransfer = createDataTransfer();

    setDocumentTreeDragData(dataTransfer, node);

    expect(JSON.parse(dataTransfer.getData(DOCUMENT_TREE_NODE_DRAG_MIME))).toMatchObject({ id: node.id });
    expect(JSON.parse(dataTransfer.getData(DOCUMENT_TREE_FILE_DRAG_MIME))).toMatchObject({ id: node.id });
    expect(dataTransfer.getData("text/plain")).toContain("knownext-tree:");

    const textOnlyTransfer = createDataTransfer();
    textOnlyTransfer.setData("text/plain", dataTransfer.getData("text/plain"));

    expect(hasDocumentTreeFileDragData(textOnlyTransfer)).toBe(true);
    expect(getDocumentTreeDragData(textOnlyTransfer)).toMatchObject({ id: node.id, type: "document" });
    expect(getDocumentTreeFileDragData(textOnlyTransfer)).toMatchObject({ id: node.id, type: "document" });

    clearDocumentTreeDragData();
  });

  it("uses the in-memory drag fallback when the WebView blocks all DataTransfer reads", () => {
    const node: DocumentTreeNode = {
      id: "attachment-brief",
      type: "attachment",
      name: "brief.pdf",
      path: "brief.pdf",
    };
    const blockedTransfer = {
      types: [],
      getData: vi.fn(() => {
        throw new Error("blocked");
      }),
      setData: vi.fn(() => {
        throw new Error("blocked");
      }),
    } as unknown as DataTransfer;

    setDocumentTreeDragData(blockedTransfer, node);

    expect(hasDocumentTreeFileDragData(blockedTransfer)).toBe(true);
    expect(getDocumentTreeFileDragData(blockedTransfer)).toMatchObject({ id: node.id, type: "attachment" });

    clearDocumentTreeDragData();
  });
});

function createDataTransfer() {
  const data = new Map<string, string>();
  return {
    get types() {
      return Array.from(data.keys());
    },
    getData: vi.fn((type: string) => data.get(type) ?? ""),
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
    }),
  } as unknown as DataTransfer;
}
