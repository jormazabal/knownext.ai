export type MixedRetirement = {
  schemaVersion: 1;
  projectId: string;
  planId: string;
  revision: string;
  phase: "available" | "partial" | "retired";
  archiveSha256: string;
  archiveBytes: number;
  remainingCount: number;
  totalCount: number;
  remainingBytes: number;
  canRetire: boolean;
  receiptsPreserved: true;
  identitiesPreserved: true;
  projectFilesUnchanged: true;
  checkedAt: string;
};
