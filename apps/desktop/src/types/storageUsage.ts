export type StorageCategory = "projects" | "recovery" | "recordings" | "ai-work" | "templates" | "preparations" | "indexes" | "preferences" | "other";
export type StorageUsage = {
  schemaVersion: 1;
  id: "local-storage-usage";
  checkedAt: string;
  scope: "app-data-regular-files";
  appDataPath: string;
  measurement: {
    groups: Array<{id: StorageCategory; files: number; logicalBytes: number}>;
    logicalBytes: number;
    files: number;
    visitedEntries: number;
    skippedLinks: number;
    unreadableEntries: number;
    limited: boolean;
    complete: boolean;
    durationMs: number;
  };
  locations: Array<{id: string; name: string; folderPath: string; state: "registered" | "retired"}>;
  locationsComplete: boolean;
  externalRootsMeasured: false;
  cleanupAvailable: false;
  warnings: Array<"project-registry-unavailable" | "retired-catalog-unavailable" | "location-limit">;
  limits: {entries: number; milliseconds: number; locations: number};
};
