import type { DocumentTreeNode, FileOperationResult } from "../types/domain";
import type { FileBatchPlan } from "../types/fileBatch";

/** Apply each document effect once, then adopt the single current tree snapshot. */
export function fileBatchEffects(plan: FileBatchPlan, findNode: (id: string) => DocumentTreeNode | null | undefined) {
  const effects: Array<{ result: FileOperationResult; source?: DocumentTreeNode; openPaths?: string[] }> = [];
  const openPaths: string[] = [];
  for (const item of plan.items) {
    if (!item.result) continue;
    const source = plan.action === "duplicate" ? undefined : findNode(item.nodeId) ?? undefined;
    effects.push({ result: { ...item.result, treeAvailable: false }, source });
    if (source?.type === "folder" && source.open && item.result.node?.type === "folder" && item.result.node.path) openPaths.push(item.result.node.path);
  }
  if (plan.result) effects.push({ result: { ...plan.result, affectedDocuments: [] }, openPaths });
  return effects;
}
