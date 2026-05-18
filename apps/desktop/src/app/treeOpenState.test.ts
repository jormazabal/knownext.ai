import { describe, expect, it } from "vitest";
import type { DocumentTreeNode } from "../types/domain";
import { applyTreeOpenState, collectOpenFolderPaths, updateTreeOpenPathsForProject } from "./treeOpenState";

const refreshedTree: DocumentTreeNode[] = [
  {
    id: "folder-guides",
    name: "Guides",
    type: "folder",
    path: "Guides",
    open: true,
    children: [
      {
        id: "folder-api",
        name: "API",
        type: "folder",
        path: "Guides/API",
        open: true,
        children: [{ id: "doc-api", name: "api.md", type: "document", path: "Guides/API/api.md" }],
      },
    ],
  },
  {
    id: "folder-archive",
    name: "Archive",
    type: "folder",
    path: "Archive",
    open: true,
    children: [],
  },
];

describe("treeOpenState", () => {
  it("collapses every folder when no project state exists", () => {
    const restored = applyTreeOpenState(refreshedTree);

    expect(restored[0].open).toBe(false);
    expect(restored[0].children?.[0].open).toBe(false);
    expect(restored[1].open).toBe(false);
  });

  it("restores persisted open folder paths by project path", () => {
    const restored = applyTreeOpenState(refreshedTree, { openPaths: ["Guides/API"] });

    expect(restored[0].open).toBe(false);
    expect(restored[0].children?.[0].open).toBe(true);
    expect(restored[1].open).toBe(false);
  });

  it("keeps current user state when a refreshed tree arrives", () => {
    const currentTree = applyTreeOpenState(refreshedTree, { openPaths: ["Archive"] });
    const restored = applyTreeOpenState(refreshedTree, { currentTree, openPaths: ["Guides"] });

    expect(restored[0].open).toBe(false);
    expect(restored[1].open).toBe(true);
  });

  it("collects and stores only open folder paths", () => {
    const restored = applyTreeOpenState(refreshedTree, { openPaths: ["Guides", "Guides/API"] });

    expect(collectOpenFolderPaths(restored)).toEqual(["Guides", "Guides/API"]);
    expect(updateTreeOpenPathsForProject({}, "project-1", restored)).toEqual({
      "project-1": ["Guides", "Guides/API"],
    });
  });
});
