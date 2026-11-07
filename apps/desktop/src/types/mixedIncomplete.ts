export type MixedIncompleteRow = {
  key: string; slot: number; side: "before" | "after"; representation: "plain" | "compact";
  status: "readable" | "unavailable"; bytes: number | null; sha256: string | null;
};
export type MixedIncomplete = {
  schemaVersion: 1; projectId: string; planId: string; revision: string;
  canReprepare?:boolean;canAbandon?:boolean;
  recordState: "missing" | "present" | "unavailable";
  rows: MixedIncompleteRow[]; ignoredCount: number; limited: boolean;
  provenanceVerified: false; canApply: false; canDelete: false; checkedAt: string;
};
