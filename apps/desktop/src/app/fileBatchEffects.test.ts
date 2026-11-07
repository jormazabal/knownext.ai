import { expect, it } from "vitest";
import { fileBatchEffects } from "./fileBatchEffects";
import type { FileBatchPlan } from "../types/fileBatch";

it("keeps document changes and folder mappings while adopting one current tree", () => {
  const affected = { oldId: "p::old.md", newId: "p::new.md", previousMarkdown: "unsaved base", referenceUpdated: true };
  const plan: FileBatchPlan = { id: "batch-owned", projectId: "p", action: "move", targetFolderId: null, createdAt: "2026-11-02T00:00:00Z", state: "completed", selectedCount: 1, items: [{ nodeId: "folder", path: "Before", destination: "After", state: "applied", error: null, result: { tree: [], treeAvailable: false, node: { id: "next", name: "After", path: "After", type: "folder" }, affectedDocuments: [affected] } }], result: { tree: [{ id: "next", name: "After", path: "After", type: "folder" }], treeAvailable: true, affectedDocuments: [affected] } };
  const source = { id: "folder", name: "Before", path: "Before", type: "folder" as const, open: true };
  const effects = fileBatchEffects(plan, () => source);
  expect(effects).toHaveLength(2);
  expect(effects[0].source).toBe(source);
  expect(effects[0].result.affectedDocuments).toEqual([affected]);
  expect(effects[0].result.treeAvailable).toBe(false);
  expect(effects[1].result.tree).toBe(plan.result!.tree);
  expect(effects[1].result.affectedDocuments).toEqual([]);
  expect(effects[1].openPaths).toEqual(["After"]);
  expect(fileBatchEffects({ ...plan, action: "duplicate" }, () => source)[0].source).toBeUndefined();
  expect(fileBatchEffects({ ...plan, result: { ...plan.result!, tree: [], treeAvailable: false } }, () => source)[1].result.treeAvailable).toBe(false);
});
