export type TrashEntry = {
  id: string;
  projectId: string;
  originalPath: string;
  deletedAt: string;
  directory: boolean;
  status: "stored" | "attention";
};
export type TrashSnapshot = { entries: TrashEntry[]; warnings: string[]; limited?: boolean; queriedAt?: string; restorations?: TrashRestoreSummary[]; batches?: import("./fileBatch").FileBatchPlan[] };
export type TrashReview = { entry: TrashEntry; revision: string; payloadFingerprint: string; locationRevision: string };
export type TrashRestoreSummary={id:string;entryId:string;originalPath:string;createdAt:string;phase:"applying"|"completed"};
export type TrashRestoreResult=import("./domain").FileOperationResult&{restoreAttemptId:string;restoredRevision:string};
export type TrashRestoreProof={attemptId:string;entryId:string;status:"absent"|"pending"|"changed"|"confirmed";reviewedRevision?:string;result?:import("./domain").FileOperationResult;canReplay?:false};
