export type Project = {
  id: string;
  name: string;
  folderPath: string;
  icon: string;
  iconColor: string;
  isGitRepository: boolean;
  active?: boolean;
};

export type ProjectPayload = {
  name: string;
  folderPath: string;
  icon: string;
  iconColor: string;
};

export type LayoutConfig = {
  sidebarWidth: number;
  historyWidth: number;
};

export type ProjectTabsConfig = {
  openTabs: OpenDocumentTab[];
  activeDocumentId: string;
};

export type AppConfig = {
  schemaVersion: number;
  layout: LayoutConfig;
  tabsByProject: Record<string, ProjectTabsConfig>;
  updatedAt: string;
};

export type AppConfigUpdate = {
  layout?: LayoutConfig;
  tabsByProject?: Record<string, ProjectTabsConfig>;
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
  wordCount: number;
  updatedAt: string;
  baseFingerprint?: DocumentFingerprint | null;
  hasDraft?: boolean;
  isDirty?: boolean;
  diskChanged?: boolean;
  conflictStatus?: DocumentConflictStatus;
  draftUpdatedAt?: string | null;
};

export type DocumentFingerprint = {
  mtimeNs?: number | null;
  size?: number | null;
  sha256?: string | null;
};

export type DocumentConflictStatus = "none" | "draft" | "disk-changed";

export type OpenDocumentTab = {
  id: string;
  name: string;
};

export type VersionRecord = {
  id: string;
  hash: string;
  title: string;
  author: string;
  authorInitials: string;
  relativeTime: string;
  current?: boolean;
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
