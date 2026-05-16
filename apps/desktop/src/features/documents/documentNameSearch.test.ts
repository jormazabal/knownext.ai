import { describe, expect, it } from "vitest";
import type { DocumentTreeNode } from "../../types/domain";
import { getInlineNameCompletion, searchDocumentTreeByName } from "./documentNameSearch";

const nodes: DocumentTreeNode[] = [
  {
    id: "folder-product",
    name: "Producto",
    type: "folder",
    open: true,
    children: [
      {
        id: "folder-architecture",
        name: "Arquitectura",
        type: "folder",
        open: false,
        children: [
          { id: "doc-backend", name: "Arquitectura backend.md", type: "document" },
          { id: "doc-api", name: "API publica.md", type: "document" },
        ],
      },
    ],
  },
  { id: "doc-final", name: "Plan final.md", type: "document" },
];

describe("searchDocumentTreeByName", () => {
  it("matches text in the middle and end of folder or document names", () => {
    expect(searchDocumentTreeByName(nodes, "tect").map((result) => result.id)).toEqual(["folder-architecture", "doc-backend"]);
    expect(searchDocumentTreeByName(nodes, "final").map((result) => result.id)).toEqual(["doc-final"]);
  });

  it("uses the path only as result context, not as a searchable field", () => {
    expect(searchDocumentTreeByName(nodes, "producto").map((result) => result.id)).toEqual(["folder-product"]);
  });

  it("accepts token queries against the node name", () => {
    expect(searchDocumentTreeByName(nodes, "api pub").map((result) => result.id)).toEqual(["doc-api"]);
  });
});

describe("getInlineNameCompletion", () => {
  it("completes only clear name or word prefixes", () => {
    const [architecture] = searchDocumentTreeByName(nodes, "arqui");
    expect(getInlineNameCompletion("arqui", architecture)).toBe("tectura");

    const [internalMatch] = searchDocumentTreeByName(nodes, "tect");
    expect(getInlineNameCompletion("tect", internalMatch)).toBe("");
  });
});
