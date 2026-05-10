export type Project = {
  id: string;
  name: string;
  folderPath: string;
  icon: string;
  iconColor: string;
  storageMode: StorageMode;
  versioningMode: VersioningMode;
  syncMode: SyncMode;
  authRequired: boolean;
  githubRepository?: GithubRepository | null;
  isGitRepository: boolean;
  active?: boolean;
};

export type ProjectPayload = {
  name: string;
  folderPath: string;
  icon: string;
  iconColor: string;
  creationMode: ProjectCreationMode;
  storageMode: StorageMode;
  versioningMode: VersioningMode;
  syncMode: SyncMode;
  githubRepository?: GithubRepository | null;
};

export type StorageMode = "local-files" | "local-cache";
export type VersioningMode = "none" | "local-git" | "github-api";
export type SyncMode = "none" | "manual-github";
export type ProjectCreationMode = "new-local" | "open-local" | "github-repository";

export type GithubRepository = {
  owner: string;
  repo: string;
  defaultRef?: string | null;
  rootPath: string;
  permissions: string[];
};

export type ProjectCapabilities = {
  canCreateLocalProject: boolean;
  canOpenLocalFolder: boolean;
  canUseLocalGit: boolean;
  canConnectGithub: boolean;
  canUseGithubApi: boolean;
  requiresGithubLoginForVersioning: boolean;
};

export type ProjectVersioningStatus = {
  enabled: boolean;
  available: boolean;
  reason?: string | null;
  storageMode: StorageMode;
  versioningMode: VersioningMode;
  syncMode: SyncMode;
  statusLabel: string;
  hasLocalChanges: boolean;
  hasRemoteChanges: boolean;
  lastVersionHash?: string | null;
  lastVersionRelativeTime?: string | null;
};

export type AuthUser = {
  login: string;
  name?: string | null;
  avatarUrl?: string | null;
};

export type AuthStatus = {
  isAuthenticated: boolean;
  provider?: string | null;
  user?: AuthUser | null;
  scopes: string[];
  expiresAt?: string | null;
};

export type GithubDeviceStartResponse = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  mock: boolean;
};

export type GithubDevicePollResponse = {
  status: "pending" | "authenticated" | "error";
  auth: AuthStatus;
  interval?: number | null;
  error?: string | null;
};

export type GithubRepositorySummary = GithubRepository & {
  fullName: string;
  private: boolean;
};

export type LayoutConfig = {
  sidebarWidth: number;
  historyWidth: number;
};

export type AppearanceConfig = {
  language: "es" | "en";
  zoomPercent: number;
};

export type DiagnosticsConfig = {
  traceLoggingEnabled: boolean;
};

export type ProjectTabsConfig = {
  openTabs: OpenDocumentTab[];
  activeDocumentId: string;
};

export type AppUtilityTabId = "release-notes";

export type AppConfig = {
  schemaVersion: number;
  layout: LayoutConfig;
  appearance: AppearanceConfig;
  diagnostics: DiagnosticsConfig;
  tabsByProject: Record<string, ProjectTabsConfig>;
  lastRunAppVersion?: string | null;
  lastSeenReleaseNotesVersion?: string | null;
  openUtilityTabs: AppUtilityTabId[];
  activeUtilityTab?: AppUtilityTabId | null;
  updatedAt: string;
};

export type AppConfigUpdate = {
  layout?: LayoutConfig;
  appearance?: AppearanceConfig;
  diagnostics?: DiagnosticsConfig;
  tabsByProject?: Record<string, ProjectTabsConfig>;
  lastRunAppVersion?: string | null;
  lastSeenReleaseNotesVersion?: string | null;
  openUtilityTabs?: AppUtilityTabId[];
  activeUtilityTab?: AppUtilityTabId | null;
};

export type DocumentTreeNode = {
  id: string;
  name: string;
  type: "folder" | "document";
  path?: string;
  children?: DocumentTreeNode[];
  open?: boolean;
  isEditing?: boolean;
};

export type AffectedDocument = {
  oldId: string;
  newId?: string | null;
  name?: string | null;
};

export type FileOperationResult = {
  tree: DocumentTreeNode[];
  node?: DocumentTreeNode | null;
  affectedDocuments: AffectedDocument[];
};

export type DocumentRecord = {
  id: string;
  name: string;
  path: string;
  projectId: string;
  markdown: string;
  diskMarkdown?: string | null;
  wordCount: number;
  updatedAt: string;
  baseFingerprint?: DocumentFingerprint | null;
  hasDraft?: boolean;
  isDirty?: boolean;
  diskChanged?: boolean;
  orphaned?: boolean;
  conflictStatus?: DocumentConflictStatus;
  draftUpdatedAt?: string | null;
};

export type DocumentFingerprint = {
  mtimeNs?: number | null;
  size?: number | null;
  sha256?: string | null;
};

export type DocumentConflictStatus = "none" | "draft" | "disk-changed" | "orphaned" | "missing";

export type OpenDocumentTab = {
  id: string;
  name: string;
};

export type DocumentWorkspaceTab = OpenDocumentTab & {
  kind: "document";
};

export type ReleaseNotesWorkspaceTab = {
  kind: "release-notes";
  id: "app-release-notes";
  name: "Notas de release";
  utilityTabId: "release-notes";
  readonly: true;
};

export type WorkspaceTab = DocumentWorkspaceTab | ReleaseNotesWorkspaceTab;

export type VersionRecord = {
  id: string;
  hash: string;
  title: string;
  author: string;
  authorInitials: string;
  relativeTime: string;
  current?: boolean;
};

export type CreateVersionResponse = {
  version: VersionRecord;
};

export type AiPromptRequest = {
  prompt: string;
  documentId?: string;
  projectId?: string;
  markdown?: string;
};

export type AiPromptResponse = {
  answer: string;
  suggestedActions: string[];
};

export type SaveDocumentPayload = {
  markdown: string;
  baseFingerprint?: DocumentFingerprint | null;
  force?: boolean;
};

export type SaveDraftPayload = {
  markdown: string;
  baseFingerprint?: DocumentFingerprint | null;
};

export type DraftResponse = {
  documentId: string;
  draftUpdatedAt: string;
  isDirty: boolean;
};

export type SyncStatusDocument = {
  documentId: string;
  baseFingerprint?: DocumentFingerprint | null;
};

export type DocumentSyncStatus = {
  documentId: string;
  exists: boolean;
  currentFingerprint?: DocumentFingerprint | null;
  diskChanged: boolean;
  hasDraft: boolean;
  orphaned: boolean;
  conflictStatus: DocumentConflictStatus;
};

export type SyncStatusResponse = {
  documents: DocumentSyncStatus[];
};

export type OrphanDraft = {
  draftKey: string;
  documentId: string;
  projectId: string;
  path: string;
  name: string;
  wordCount: number;
  createdAt: string;
  draftUpdatedAt: string;
  recoverable: boolean;
  reason?: string | null;
};

export type RestoreDraftResponse = {
  document: DocumentRecord;
};
