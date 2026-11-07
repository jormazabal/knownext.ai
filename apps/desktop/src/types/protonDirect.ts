export type ProtonAccount = {id: string; label: string; state: "connected" | "needs-reconnect"};
export type ProtonAccountStatus = {
  available: boolean;
  reason?: string | null;
  account: ProtonAccount | null;
  accounts?: ProtonAccount[];
  attempt: {connectionId: string; state: "pending" | "connected" | "expired" | "cancelled"; expiresAt?: string | null} | null;
};
export type ProtonDirectBinding = {accountId: string; remoteRootId: string; logicalProjectId: string; generation: number};
export type ProtonDirectStatus = {
  projectId: string; binding: ProtonDirectBinding | null; state: string; detail: string;
  paused: boolean; remoteConfirmed: boolean; lastSyncedAt?: string | null;
  pendingOperations?: number; recoveryRequired?: boolean; canDisconnect?: boolean;
  pendingUnknown?: boolean; statusIssue?: string | null;
  publicationBlocked?: boolean;
  notice?: {kind: string; attemptId: string; destinationProvider: "local" | "proton" | "github"; createdAt: string; detail: string} | null;
};
export type ProtonDirectReview = {
  id: string; revision: string; canConnect: boolean;
  summary: {files: number; bytes: number}; warnings: string[]; blockers: string[];
  remoteProjects?: Array<{id: string; name: string}>;
};
export type ProtonDirectConflict = {id: string; path: string; reason: string; revision: string; local?: string | null; remote?: string | null};
export type ProtonDirectConflicts = {items: ProtonDirectConflict[]};
export type ProtonDirectStorage = {
  bytes: number; limitBytes?: number | null; protectedBytes?: number; reclaimableBytes?: number; inventoryRevision?: string;
  quotaStatus?: "ok" | "warning" | "full";
  categories?: Array<{id: string; label: string; bytes: number; protected: boolean; reason: string}>;
};
export type ProtonConflictResolution = "local" | "remote" | "both";
export type ProtonRetentionReview = {
  id: string; revision: string; canApply: boolean; bytesBefore: number; protectedBytes: number; reclaimableBytes: number;
  candidates: Array<{id: string; bytes: number; reason: string}>; warnings: string[]; blockers: string[];
  resume?: boolean; progress?: {completed: number; reclaimedBytes: number};
};
export type ProtonRetentionReceipt = {state: "complete" | "pending" | "needs-review" | "cancelled"; receiptId?: string; reclaimedBytes: number; storage: ProtonDirectStorage};
export type ProtonMigrationTarget = "local" | "proton" | "github";
export type ProtonMigrationDestination = {target: ProtonMigrationTarget; accountId?: string; remoteRootId?: string; allowLocalRecovery?: boolean};
export type ProtonMigrationReview = {
  id: string; revision: string; target: ProtonMigrationTarget; canStart: boolean;
  summary: {files: number; bytes: number}; source: string; destination: string;
  warnings: string[]; blockers: string[]; remoteProjects?: Array<{id: string; name: string}>;
  destinationAccountId?: string | null; destinationName?: string;
};
export type ProtonMigrationAttempt = {
  id: string; revision: string; target: ProtonMigrationTarget;
  phase: "reviewed" | "staging" | "verifying" | "ready" | "switching" | "complete" | "needs-review" | "cancelled";
  canCancel: boolean; canAcknowledge: boolean; canResume: boolean; detail: string; sourcePreserved: boolean;
  receiptId?: string; warnings?: string[]; blockers?: string[];
  fullyMigrated?: boolean;
  localRecovery?: boolean; pendingLocalChanges?: boolean;
  source?: string; destination?: string; destinationAccountId?: string | null; destinationName?: string;
  summary?: {files: number; bytes: number}; canStart?: boolean;
};
export type ProtonMigrationStatus = {attempt: ProtonMigrationAttempt | null; review?: ProtonMigrationReview | null; receipt?: unknown};
