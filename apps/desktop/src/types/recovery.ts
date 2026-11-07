export type RecoveryCopy = {
  operationId?:string|null;
  variantRole?:"local"|"disk"|"proposal"|"remote"|null;
  key: string;
  source?: "active" | "archive";
  fingerprint: string | null;
  bytes: number;
  documentId: string | null;
  name: string;
  projectName: string | null;
  path: string | null;
  kind: "document" | "handwritten-note" | null;
  state: "orphan" | "variant" | "identity-mismatch" | "invalid" | "unreadable" | "unavailable" | "source-unavailable" | "archived";
  reason: string;
  canInspectUnverified?:boolean;
  canCopy: boolean;
  canArchive: boolean;
  updatedAt: string | null;
};

export type RecoveryInventory = {
  items: RecoveryCopy[];
  activeCount: number;
  archivedCount: number;
  scannedFiles: number;
  limited: boolean;
  warnings: string[];
  queriedAt: string;
};

export type RecoveryCopyPayload = {
  fingerprint: string;
  source: "active" | "archive";
  projectId: string;
  name: string;
};

export type ArchiveRecoveryResult = {
  archiveId: string;
  retired: boolean;
  warning: string | null;
  retention: "manual-no-auto-expiry";
};

export type RecoveryPreview = {
  kind: "document" | "handwritten-note";
  text: string;
  truncated: boolean;
  pageCount: number;
  strokeCount: number;
  bytes: number;
};
