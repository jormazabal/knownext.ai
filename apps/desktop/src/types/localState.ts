export type LocalStateEntry = {
  id: "config" | "export" | "projects";
  name: string;
  filename: string;
  status: "healthy" | "missing" | "invalid" | "unavailable";
  message: string | null;
  fingerprint: string | null;
  canReset: boolean;
};
export type LocalStateInventory = { entries: LocalStateEntry[]; checkedAt: string; maxFileBytes: number };
export type LocalStateReset = { id: LocalStateEntry["id"]; archiveId: string; archivePath: string; preservedFingerprint: string; restoredAt: string };
