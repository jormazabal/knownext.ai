export type RecoveryQuotaItem = {
  id: string;
  family: "scheduled-backups" | "conflict-attempts" | "mixed-reviews" | "mixed-applications" | "graph-joins" | "project-templates" | "project-transfers" | "export-batches" | "history-restores" | "ai-changes" | "project-template-catalogues" | "handwritten-ocr" | "meeting-minutes" | "document-replacements";
  scope: "profile" | "project";
  projectId: string | null;
  projectName: string | null;
  entries: number;
  bytes: number;
  maxEntries: number;
  maxBytes: number;
  complete: boolean;
  status: "full" | "partial" | "observed";
  contentsVerified: false;
  idsRetainedOnPayloadRetirement: boolean;
};
export type RecoveryQuotaInventory = {
  schemaVersion: 1;
  checkedAt: string;
  scope: "known-admission-scopes-metadata";
  complete: boolean;
  limited: boolean;
  projectMappingComplete: boolean;
  items: RecoveryQuotaItem[];
  cleanupAvailable: false;
  limits: {entries: number; scopes: number; milliseconds: number};
};
