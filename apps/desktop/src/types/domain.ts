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
  publishToGithub?: GithubPublishRequest | null;
};

export type StorageMode = "local-files" | "local-cache";
export type VersioningMode = "none" | "local-git" | "github-api";
export type SyncMode = "none" | "manual-github";
export type ProjectCreationMode = "new-local" | "open-local" | "github-repository";
export type GithubPublishVisibility = "private" | "public";

export type GithubPublishRequest = {
  visibility: GithubPublishVisibility;
  description?: string | null;
};

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

export type ExternalChangeType = "added" | "modified" | "deleted" | "renamed";
export type ExternalChangeKind = "folder" | "document" | "image" | "attachment" | "private" | "ignored" | "unsupported";
export type ExternalChangeRisk = "safe" | "review" | "blocked";
export type ExternalChangeDecision = "include" | "omit" | "review";
export type ExternalChangeSetStatus = "none" | "safe" | "needs-review" | "blocked";
export type ProjectSyncState = "synced" | "saving" | "syncing" | "pending" | "review-required" | "error" | "unsupported";

export type ExternalChangeItem = {
  id: string;
  path: string;
  name: string;
  changeType: ExternalChangeType;
  kind: ExternalChangeKind;
  risk: ExternalChangeRisk;
  decision: ExternalChangeDecision;
  sizeBytes?: number | null;
  reason?: string | null;
};

export type ExternalChangeSummary = {
  total: number;
  safe: number;
  review: number;
  blocked: number;
  added: number;
  modified: number;
  deleted: number;
  folders: number;
  documents: number;
  images: number;
  omitted: number;
  totalBytes: number;
};

export type ExternalChangeSet = {
  id: string;
  projectId: string;
  title: string;
  source: "filesystem" | "git" | "github-api-cache";
  status: ExternalChangeSetStatus;
  detectedAt: string;
  requiresReview: boolean;
  summary: ExternalChangeSummary;
  items: ExternalChangeItem[];
  message?: string | null;
};

export type ExternalChangeImportDecision = {
  itemId: string;
  decision: ExternalChangeDecision;
};

export type ExternalChangeImportRequest = {
  decisions: ExternalChangeImportDecision[];
  syncRemote: boolean;
};

export type ExternalChangeImportResult = {
  status: ProjectSyncState;
  message: string;
  tree: DocumentTreeNode[];
  versionTitle?: string | null;
  syncedAt?: string | null;
  pendingRemoteSync: boolean;
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

export type AppearanceThemeMode = "system" | "light" | "dark";
export type AppearanceAccentColor =
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "olive"
  | "green"
  | "cyan"
  | "blue"
  | "indigo"
  | "wine"
  | "rose"
  | "red";

export type AppearanceConfig = {
  language: "es" | "en";
  zoomPercent: number;
  markdownExtendedUnderlineEnabled: boolean;
  themeMode: AppearanceThemeMode;
  primaryColor: AppearanceAccentColor;
};

export type DiagnosticsConfig = {
  traceLoggingEnabled: boolean;
};

export type AiPermissionsConfig = {
  editDocuments: boolean;
  createFolders: boolean;
  createDocuments: boolean;
  deleteDocumentsAndFolders: boolean;
  generateImages: boolean;
  createImageAssets: boolean;
  insertImagesIntoDocuments: boolean;
  useDocumentContextForImageGeneration: boolean;
};

export type AiRagConfig = {
  enabled: boolean;
  vectorStoreId?: string | null;
  lastIndexedAt?: string | null;
  status: "not-indexed" | "indexing" | "updated" | "error";
  error?: string | null;
};

export type AiVisionModelId = "gpt-5.4-mini" | "gpt-5.4" | "gpt-5.5";

export type AiVisionConfig = {
  enabled: boolean;
  model: AiVisionModelId;
  imageIndexingEnabled: boolean;
  maxImagesPerPrompt: number;
  maxImageSizeMb: number;
  detail: "auto" | "low" | "high";
  storeVisualDescriptions: boolean;
};

export type AiImageGenerationModelId = "gpt-image-2" | "gpt-image-1.5" | "gpt-image-1" | "gpt-image-1-mini";

export type AiImageGenerationConfig = {
  enabled: boolean;
  model: AiImageGenerationModelId;
  size: "auto" | "1024x1024" | "1536x1024" | "1024x1536";
  quality: "auto" | "low" | "medium" | "high";
  outputFormat: "png" | "webp" | "jpeg";
  defaultFolder: "document_folder" | "generated_assets" | "custom_folder";
  customFolderPath: string;
  maxImagesPerPrompt: number;
  confirmBeforeDocumentInsert: boolean;
  confirmBeforeUsingMultipleSources: boolean;
  storePromptMetadata: boolean;
};

export type AiModelId = "gpt-5.5" | "gpt-5.4" | "gpt-5.4-mini" | "gpt-5.4-nano";
export type AiAgenticDepth = "quick" | "guided" | "deep" | "bounded_autonomous";
export type AiTranscriptionTarget = "prompt" | "document";
export type AiTranscriptionLanguage = "auto" | "es" | "en" | "fr" | "de" | "it" | "pt" | "ca" | "eu" | "gl";
export type AiTranscriptionModelId = "gpt-realtime-whisper";

export type AiAgenticConfig = {
  depth: AiAgenticDepth;
  webResearchEnabled: boolean;
  confirmBeforeApplying: boolean;
  maxSteps: number;
  maxDocuments: number;
  maxEstimatedCostEur: number;
  maxSources: number;
};

export type AiTranscriptionConfig = {
  enabled: boolean;
  model: AiTranscriptionModelId;
  defaultTarget: AiTranscriptionTarget;
  defaultLanguage: AiTranscriptionLanguage;
  favoriteLanguages: AiTranscriptionLanguage[];
};

export type AiConfig = {
  provider: "openai";
  model: AiModelId;
  permissions: AiPermissionsConfig;
  rag: AiRagConfig;
  vision: AiVisionConfig;
  imageGeneration: AiImageGenerationConfig;
  agentic: AiAgenticConfig;
  transcription: AiTranscriptionConfig;
};

export type AiConfigStatus = AiConfig & {
  openaiKeyConfigured: boolean;
  openaiKeyPreview?: string | null;
};

export type OpenAiKeyStatus = {
  configured: boolean;
  preview?: string | null;
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
  ai: AiConfig;
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
  ai?: AiConfig;
  tabsByProject?: Record<string, ProjectTabsConfig>;
  lastRunAppVersion?: string | null;
  lastSeenReleaseNotesVersion?: string | null;
  openUtilityTabs?: AppUtilityTabId[];
  activeUtilityTab?: AppUtilityTabId | null;
};

export type DocumentTreeNode = {
  id: string;
  name: string;
  type: "folder" | "document" | "image";
  path?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  children?: DocumentTreeNode[];
  open?: boolean;
  isEditing?: boolean;
};

export type DocumentNameSearchResult = {
  id: string;
  name: string;
  type: "folder" | "document";
  path: string[];
  parentIds: string[];
  matchRanges: Array<{ start: number; end: number }>;
};

export type AffectedDocument = {
  oldId: string;
  newId?: string | null;
  name?: string | null;
  path?: string | null;
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

export type ImageWorkspaceTab = {
  kind: "image";
  id: string;
  name: string;
  path: string;
};

export type AiConversationWorkspaceTab = {
  kind: "ai-conversation";
  id: "project-ai-conversation";
  name: "IA";
  readonly: true;
};

export type WorkspaceTab = AiConversationWorkspaceTab | DocumentWorkspaceTab | ImageWorkspaceTab | ReleaseNotesWorkspaceTab;

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

export type AiInteractionMode = "document" | "project";
export type AiInteractionStatus = "completed" | "blocked" | "error";
export type AiInteractionDisplay = "bubble" | "conversation" | "none";
export type AiUiPlacement = "document_bubble" | "conversation_tab" | "none";
export type AiInteractionType = "chat" | "document_edit" | "project_operation" | "agentic_task" | "image_generation" | "clarification" | "mixed";
export type AiConfidence = "high" | "medium" | "low";
export type AiExecutionMode = "quick" | "reasoning";
export type AiReasoningDepth = "light" | "medium" | "deep";
export type AiExecutionScope = "direct_action" | "needs_permission" | "needs_clarification" | "agentic_task" | "too_expensive_or_unclear";
export type AiPendingIntentStatus = "awaiting_decision" | "awaiting_web_permission" | "ready" | "running" | "completed" | "cancelled";
export type AiPendingIntentAction = "replace_document" | "edit_document" | "create_document" | "project_operation" | "research_then_write";
export type AiIntentActionType = "allow_web_research" | "apply" | "cancel";
export type AiOperationType =
  | "document_modified"
  | "folder_created"
  | "document_created"
  | "document_duplicated"
  | "node_moved"
  | "delete_requested"
  | "node_deleted"
  | "permission_blocked"
  | "provider_unavailable"
  | "provider_error"
  | "task_planned"
  | "task_checkpoint"
  | "source_found"
  | "image_generated"
  | "image_inserted";

export type AiConversationEventType =
  | "user_message"
  | "assistant_message"
  | "document_modified"
  | "folder_created"
  | "document_created"
  | "document_duplicated"
  | "node_moved"
  | "delete_requested"
  | "node_deleted"
  | "permission_blocked"
  | "provider_unavailable"
  | "provider_error"
  | "task_planned"
  | "task_checkpoint"
  | "source_found"
  | "image_generated"
  | "image_inserted";

export type AiInteractionRequest = {
  projectId: string;
  documentId?: string | null;
  prompt: string;
  activeMarkdown: string;
  selectionFocus?: AiSelectionFocus | null;
  clientContext?: AiClientContext | null;
  intentAction?: AiIntentActionRequest | null;
  executionMode?: AiExecutionMode;
  reasoningDepth?: AiReasoningDepth;
  mode: AiInteractionMode;
  clientMessageId: string;
  contextSourceIds?: string[];
};

export type AiClientContext = {
  lastDocumentId?: string | null;
  lastDocumentPath?: string | null;
};

export type AiIntentActionRequest = {
  type: AiIntentActionType;
  intentId: string;
};

export type AiSelectionFocus = {
  documentId?: string | null;
  path?: string | null;
  from?: number | null;
  to?: number | null;
  text: string;
};

export type AiContextSourceKind = "project_document" | "external_file" | "image";
export type AiContextSourceStatus = "processing" | "ready" | "warning" | "error" | "expiring" | "expired";
export type AiContextWeight = "light" | "medium" | "high" | "too_large";

export type AiContextSource = {
  id: string;
  projectId: string;
  kind: AiContextSourceKind;
  name: string;
  path?: string | null;
  mimeType?: string | null;
  sizeBytes: number;
  status: AiContextSourceStatus;
  weight: AiContextWeight;
  warning?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
};

export type AiContextSourceRef = {
  id: string;
  kind: AiContextSourceKind;
  name: string;
  path?: string | null;
  status: "used" | "expired" | "failed";
};

export type AiContextSearchResult = {
  documentId: string;
  name: string;
  path: string;
  kind?: AiContextSourceKind;
  mimeType?: string | null;
};

export type AssetMetadata = {
  id: string;
  projectId: string;
  name: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  colorDepthBits?: number | null;
  updatedAt: string;
  usageCount: number;
  indexed: boolean;
  indexStatus: string;
  visualDescription?: string | null;
};

export type AssetReference = {
  id: string;
  projectId: string;
  documentId: string;
  documentName: string;
  documentPath: string;
  rawTarget: string;
  resolvedAssetPath?: string | null;
  kind: string;
  status: string;
  altText?: string | null;
  title?: string | null;
  line?: number | null;
  column?: number | null;
};

export type AssetUsageResponse = {
  asset: AssetMetadata;
  references: AssetReference[];
};

export type AssetImportResponse = {
  tree: DocumentTreeNode[];
  asset: AssetMetadata;
};

export type InsertImageReferenceResponse = {
  markdown: string;
  asset: AssetMetadata;
};

export type DocumentMoveImpact = {
  documentId: string;
  documentPath: string;
  references: AssetReference[];
  sharedAssetPaths: string[];
  message: string;
};

export type AiContextSourceListResponse = {
  sources: AiContextSource[];
  expiredSourceIds: string[];
};

export type AiContextSourcePreviewResponse = {
  source: AiContextSource;
  previewText?: string | null;
  metadata: Record<string, unknown>;
};

export type AiContextAddToProjectResponse = {
  documentId: string;
  path: string;
  tree?: DocumentTreeNode[] | null;
};

export type AiPendingIntent = {
  id: string;
  projectId: string;
  originDocumentId?: string | null;
  targetDocumentId?: string | null;
  targetPath?: string | null;
  goal: string;
  proposedAction: AiPendingIntentAction;
  requiresWebResearch: boolean;
  webResearchAllowed: boolean;
  status: AiPendingIntentStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type AiUpdatedDocument = {
  documentId: string;
  markdown: string;
  summary: string;
};

export type AiGeneratedImage = {
  asset: AssetMetadata;
  prompt: string;
  revisedPrompt?: string | null;
  altText: string;
  markdownReference?: string | null;
  insertedIntoDocumentId?: string | null;
  sourceDocumentId?: string | null;
  sourceSelection?: Record<string, unknown> | null;
  model: string;
  size: string;
  quality: string;
  format: string;
};

export type AiPendingDelete = {
  confirmationId: string;
  nodeIds: string[];
  paths: string[];
  documentCount: number;
};

export type AiAgenticTaskStep = {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "blocked";
  detail?: string | null;
};

export type AiAgenticTaskSource = {
  title: string;
  url?: string | null;
  path?: string | null;
  status: "planned" | "used" | "blocked";
};

export type AiAgenticTask = {
  title: string;
  status: "proposed" | "waiting_confirmation" | "running" | "completed" | "blocked";
  depth: AiAgenticDepth;
  requiresWebResearch: boolean;
  webResearchAllowed: boolean;
  needsUserConfirmation: boolean;
  maxSteps: number;
  maxDocuments: number;
  maxEstimatedCostEur: number;
  steps: AiAgenticTaskStep[];
  sources: AiAgenticTaskSource[];
};

export type AiOperation = {
  type: AiOperationType;
  status: "completed" | "blocked" | "pending" | "error";
  message: string;
  documentId?: string | null;
  nodeId?: string | null;
  path?: string | null;
  paths: string[];
  summary?: string | null;
  task?: AiAgenticTask | null;
  confirmationId?: string | null;
};

export type AiConversationEvent = {
  id: string;
  projectId: string;
  type: AiConversationEventType;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  documentId?: string | null;
  path?: string | null;
  paths: string[];
  summary?: string | null;
  task?: AiAgenticTask | null;
  sourcesUsed?: AiContextSourceRef[];
};

export type AiConversationResponse = {
  events: AiConversationEvent[];
};

export type AiInteractionResponse = {
  interactionId: string;
  status: AiInteractionStatus;
  display: AiInteractionDisplay;
  uiPlacement: AiUiPlacement;
  interactionType: AiInteractionType;
  confidence: AiConfidence;
  executionMode: AiExecutionMode;
  reasoningDepth: AiReasoningDepth;
  executionScope?: AiExecutionScope | null;
  routeToAiTab: boolean;
  needsUserClarification: boolean;
  pendingIntent?: AiPendingIntent | null;
  pendingIntentStatus?: AiPendingIntentStatus | null;
  answer?: string | null;
  conversationEvents: AiConversationEvent[];
  operations: AiOperation[];
  updatedDocument?: AiUpdatedDocument | null;
  generatedImages?: AiGeneratedImage[];
  task?: AiAgenticTask | null;
  tree?: DocumentTreeNode[] | null;
  affectedDocuments: AffectedDocument[];
  requiresConfirmation?: AiPendingDelete | null;
  contextSources?: AiContextSource[];
  expiredContextSourceIds?: string[];
};

export type AiIndexStatusResponse = {
  projectId: string;
  enabled: boolean;
  status: AiRagConfig["status"];
  vectorStoreId?: string | null;
  lastIndexedAt?: string | null;
  error?: string | null;
  documentCount: number;
  indexedDocumentCount: number;
  pendingDocumentCount: number;
  failedDocumentCount: number;
  deletedDocumentCount: number;
  localExactReady: boolean;
};

export type AiUsageModelSummary = {
  model: string;
  interactions: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  embeddingTokens: number;
  totalTokens: number;
  estimatedCost: number;
  currency: "EUR";
  usageSource: "provider" | "estimated" | "unknown" | "mixed";
};

export type AiUsageCapabilitySummary = {
  capability: "document_ai" | "image_generation" | "vision" | "audio" | "agentic_tasks";
  label: string;
  interactions: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  embeddingTokens: number;
  totalTokens: number;
  estimatedCost: number;
  currency: "EUR";
  usageSource: "provider" | "estimated" | "unknown" | "mixed";
};

export type AiUsageSummaryResponse = {
  month: string;
  currency: "EUR";
  estimated: boolean;
  totalEstimatedCost: number;
  generatedAt: string;
  capabilities: AiUsageCapabilitySummary[];
  models: AiUsageModelSummary[];
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
