export type CloudSyncProvider = "none" | "onedrive" | "google-drive" | "proton-drive";

export type CloudSyncCapabilities = {
  providers: Array<{
    id: CloudSyncProvider;
    label: string;
    available: boolean;
    status: string;
    reason?: string | null;
    platforms: string[];
  }>;
};

export type CloudSyncStatus = {
  projectId: string;
  provider: CloudSyncProvider | "github";
  sourceProvider?: "github" | CloudSyncProvider;
  binding: {provider: CloudSyncProvider; accountId?: string | null; generation: number} | null;
  state: string;
  label: string;
  detail: string;
  canApply: boolean;
  activeMigration?: CloudSyncReview | null;
};

export type CloudSyncReview = {
  id: string;
  projectId: string;
  revision: string;
  provider: CloudSyncProvider;
  accountId: string | null;
  status: string;
  canApply: boolean;
  createdAt: string;
  summary: {documents: number; resources: number; bytes: number; history: "local-only" | "none"};
  warnings: string[];
  blockers: string[];
};

export type CloudSyncReceipt = {
  id: string;
  revision: string;
  projectId: string;
  status: "active-local" | "cancelled";
  provider: CloudSyncProvider | "github";
  generation: number;
  completedAt: string;
  remoteConfirmed: boolean;
  documentsPreserved: boolean;
};
