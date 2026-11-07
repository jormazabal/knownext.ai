import type { FileOperationResult } from "./domain";

export type FileBatchAction = "move" | "trash" | "duplicate" | "rename" | "context";
export type SelectionAction = FileBatchAction | "export";
export type FileBatchItem = { nodeId: string; path: string; destination: string | null; state: "pending" | "running" | "applied" | "attention"; error: string | null; result: FileOperationResult | null };
export type FileBatchPlan = { error?: string | null; referencesPending?: boolean; id: string; projectId: string; action: FileBatchAction; targetFolderId: string | null; createdAt: string; state: "prepared" | "running" | "completed" | "attention"; selectedCount: number; items: FileBatchItem[]; result: FileOperationResult | null };
