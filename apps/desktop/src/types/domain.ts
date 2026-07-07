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
export type VersioningMode = "none" | "local-git";
export type SyncMode = "none" | "manual-local" | "auto-local" | "manual-github" | "auto-github";
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
export type ExternalChangeKind = "folder" | "document" | "handwritten-note" | "image" | "attachment" | "private" | "ignored" | "unsupported";
export type ExternalChangeRisk = "safe" | "review" | "blocked";
export type ExternalChangeDecision = "include" | "omit" | "review";
export type ExternalChangeSetStatus = "none" | "safe" | "needs-review" | "blocked";
export type ProductProjectMode = "local-files" | "local-history" | "github-manual" | "github-auto";
export type ActivityTone = "success" | "warning" | "danger" | "info";
export type ActivityScope = "project" | "history" | "github" | "security" | "document";

export type ActivityEvent = {
  id: string;
  projectId: string;
  type: string;
  scope: ActivityScope;
  title: string;
  message: string;
  tone: ActivityTone;
  createdAt: string;
  documentPath?: string | null;
  repository?: string | null;
};

export type ActivityEventList = {
  projectId: string;
  events: ActivityEvent[];
};

export type ProjectSyncState =
  | "unconfigured"
  | "local-only"
  | "local-history"
  | "synced"
  | "saving"
  | "syncing"
  | "pending"
  | "local-pending"
  | "remote-available"
  | "review-required"
  | "conflict"
  | "offline"
  | "error"
  | "unsupported";

export type DocumentPostSaveSyncState =
  | "idle"
  | "syncing-local"
  | "syncing-remote"
  | "error";

export type RemoteAccessState =
  | "available"
  | "unauthenticated"
  | "unauthorized"
  | "offline"
  | "unknown"
  | "not-configured";

export type RemoteAccessAction =
  | "connect-github"
  | "request-permission"
  | "retry"
  | "review-conflicts";

export type SyncConflictType =
  | "remote_changed_open_document"
  | "local_and_remote_changed"
  | "remote_deleted_local_modified"
  | "local_deleted_remote_modified"
  | "diverged_history"
  | "push_rejected"
  | "dirty_working_tree";

export type SyncConflict = {
  id: string;
  projectId: string;
  path: string;
  type: SyncConflictType;
  status: "open" | "resolved" | "dismissed";
  localHash?: string | null;
  remoteHash?: string | null;
  message: string;
  createdAt: string;
  updatedAt: string;
};

export type OpenDocumentSyncState = {
  documentId: string;
  path: string;
  isActive: boolean;
  isDirty: boolean;
  hasDraft: boolean;
  baseFingerprint?: DocumentFingerprint | null;
};

export type ProjectSyncStatus = {
  projectId: string;
  mode: ProductProjectMode;
  state: ProjectSyncState;
  label: string;
  detail?: string | null;
  remoteAccess?: RemoteAccessState;
  remotePaused?: boolean;
  remoteReason?: string | null;
  remoteAction?: RemoteAccessAction | null;
  localState?: "clean" | "dirty" | "versioned" | "pending-push";
  pendingPush: boolean;
  pendingPull: boolean;
  hasConflicts: boolean;
  lastSyncAt?: string | null;
  lastLocalVersionHash?: string | null;
  lastRemoteHash?: string | null;
  localAheadCount?: number;
  remoteAheadCount?: number;
  localAheadPaths?: string[];
  remoteAheadPaths?: string[];
  diverged?: boolean;
  conflicts: SyncConflict[];
};

export type ProjectFileSyncPhaseState =
  | "ok"
  | "draft"
  | "pending"
  | "waiting"
  | "conflict"
  | "blocked"
  | "omitted"
  | "unavailable"
  | "error";

export type ProjectFileSyncPhaseStatus = {
  state: ProjectFileSyncPhaseState;
  label: string;
  detail?: string | null;
};

export type ProjectFileSyncItem = {
  id: string;
  projectId: string;
  path: string;
  name: string;
  kind: ExternalChangeKind;
  modifiedAt?: string | null;
  sizeBytes?: number | null;
  localStatus: ProjectFileSyncPhaseStatus;
  historyStatus: ProjectFileSyncPhaseStatus;
  githubStatus: ProjectFileSyncPhaseStatus;
  change?: {
    itemId: string;
    changeType: ExternalChangeType;
    risk: ExternalChangeRisk;
    decision: ExternalChangeDecision;
  } | null;
  conflictId?: string | null;
};

export type ProjectFileSyncOverview = {
  projectId: string;
  generatedAt: string;
  summary: {
    total: number;
    attention: number;
    historyPending: number;
    githubPending: number;
    conflicts: number;
    omitted: number;
  };
  files: ProjectFileSyncItem[];
};

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
  attachments: number;
  omitted: number;
  totalBytes: number;
};

export type ExternalChangeSet = {
  id: string;
  projectId: string;
  title: string;
  source: "filesystem" | "git";
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
  status?: "error" | null;
  error?: string | null;
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

export type ExportFormat = "md" | "pdf" | "docx";
export type ExportTextFormat = "normal" | "bold" | "underline" | "bold_underline";
export type ExportDiagramResolution = "low" | "medium" | "high";

export type ExportTextStyle = {
  fontFamily: string;
  fontSizePt: number;
  color: string;
  textFormat: ExportTextFormat;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
};

export type ExportTemplateConfig = {
  schemaVersion: number;
  name: string;
  page: {
    size: "A4" | "Letter";
    margins: {
      topMm: number;
      rightMm: number;
      bottomMm: number;
      leftMm: number;
    };
  };
  normal: ExportTextStyle;
  headingFontFamily: string;
  headings: Record<"h1" | "h2" | "h3" | "h4" | "h5" | "h6", ExportTextStyle>;
  code: ExportTextStyle;
  paragraph: {
    lineSpacing: number;
    spaceBeforePt: number;
    spaceAfterPt: number;
  };
  document: {
    includeTitle: boolean;
    linkColor: string;
    horizontalRuleColor: string;
    diagramResolution: ExportDiagramResolution;
  };
  updatedAt: string;
};

export type ExportTemplateUpdate = Partial<
  Pick<ExportTemplateConfig, "page" | "normal" | "headingFontFamily" | "code" | "paragraph" | "document">
> & {
  headings?: Partial<ExportTemplateConfig["headings"]>;
};

export type ExportDocumentPayload = {
  format: ExportFormat;
  outputPath: string;
  markdown?: string | null;
  diagramAssets?: ExportDiagramAsset[];
};

export type ExportDiagramAsset = {
  id: string;
  codeHash: string;
  code: string;
  caption?: string | null;
  width?: "compact" | "auto" | "wide" | "full" | null;
  svg?: string | null;
  pngDataUrl?: string | null;
};

export type ExportDocumentResponse = {
  documentId: string;
  format: ExportFormat;
  outputPath: string;
  exportedAt: string;
};

export type AiPermissionsConfig = {
  editDocuments: boolean;
  editHandwrittenNotes: boolean;
  drawHandwrittenNotes: boolean;
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
  size: "auto" | "1024x1024" | "1536x1024" | "1024x1536" | "2048x2048" | "2048x1152" | "3840x2160" | "2160x3840";
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
export type AiResearchPresetId = "quick" | "deep" | "compare" | "currentDocument";
export type AiResearchReportLength = "brief" | "standard" | "wide" | "exhaustive";
export type AiResearchPresetConfig = {
  candidateSourceLimit: number;
  diagramsEnabled: boolean;
  imagesEnabled: boolean;
};
export type AiTranscriptionTarget = "prompt" | "document";
export type AiTranscriptionLanguage = "auto" | "es" | "en" | "fr" | "de" | "it" | "pt" | "ca" | "eu" | "gl";
export type AiTranscriptionModelId = "gpt-4o-mini-transcribe";

export type AiAgenticConfig = {
  depth: AiAgenticDepth;
  webResearchEnabled: boolean;
  confirmBeforeApplying: boolean;
  maxSteps: number;
  maxDocuments: number;
  maxEstimatedCostEur: number;
  maxSources: number;
  researchDiagramsEnabled: boolean;
  researchImagesEnabled: boolean;
  researchPresets: Record<AiResearchPresetId, AiResearchPresetConfig>;
};

export type AiTranscriptionConfig = {
  enabled: boolean;
  model: AiTranscriptionModelId;
  defaultTarget: AiTranscriptionTarget;
  defaultLanguage: AiTranscriptionLanguage;
  favoriteLanguages: AiTranscriptionLanguage[];
};

export type DiagramVisualProfile = "compatible" | "visual_local" | "advanced";
export type DiagramIconSet = "none" | "lucide";
export type DiagramImagePolicy = "disabled" | "project_assets" | "external_confirm";
export type DiagramBetaPolicy = "disabled" | "ask" | "enabled";
export type DiagramAiGenerationMode = "safe" | "visual";
export type DiagramDefaultWidth = "compact" | "auto" | "wide" | "full";

export type AiDiagramConfig = {
  enabled: boolean;
  visualProfile: DiagramVisualProfile;
  iconSet: DiagramIconSet;
  imagePolicy: DiagramImagePolicy;
  betaPolicy: DiagramBetaPolicy;
  defaultWidth: DiagramDefaultWidth;
  aiGenerationMode: DiagramAiGenerationMode;
};

export type AiDrawingRoute = "precise_scene" | "mermaid_vector" | "creative_sketch" | "debug_raw_strokes";

export type AiHandwrittenDrawingConfig = {
  enabled: boolean;
  creativeSketchEnabled: boolean;
  defaultStyle: "professional_whiteboard";
  maxElements: number;
  maxStrokes: number;
  maxPagesPerRequest: number;
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
  diagrams: AiDiagramConfig;
  handwrittenDrawing: AiHandwrittenDrawingConfig;
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
  openTabs: OpenProjectTab[];
  activeDocumentId: string;
  openHandwrittenTabs?: OpenProjectTab[];
  activeHandwrittenNoteId?: string;
  activeWorkspaceTabId?: string;
};

export type AppUtilityTabId = "release-notes" | "notes";

export type AppConfig = {
  schemaVersion: number;
  layout: LayoutConfig;
  appearance: AppearanceConfig;
  diagnostics: DiagnosticsConfig;
  handwritten: HandwrittenConfig;
  ai: AiConfig;
  tabsByProject: Record<string, ProjectTabsConfig>;
  treeOpenPathsByProject: Record<string, string[]>;
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
  handwritten?: Partial<HandwrittenConfig>;
  ai?: AiConfig;
  tabsByProject?: Record<string, ProjectTabsConfig>;
  treeOpenPathsByProject?: Record<string, string[]>;
  lastRunAppVersion?: string | null;
  lastSeenReleaseNotesVersion?: string | null;
  openUtilityTabs?: AppUtilityTabId[];
  activeUtilityTab?: AppUtilityTabId | null;
};

export type DocumentTreeNode = {
  id: string;
  name: string;
  type: "folder" | "document" | "handwritten-note" | "image" | "attachment";
  path?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  children?: DocumentTreeNode[];
  open?: boolean;
  isEditing?: boolean;
};

export type DocumentNameSearchResult = {
  id: string;
  name: string;
  type: "folder" | "document" | "handwritten-note" | "image" | "attachment";
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
  diskContentHash?: string | null;
  savedContentHash?: string | null;
  draftContentHash?: string | null;
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

export type HandwrittenToolId = "pen" | "fountain" | "pencil" | "marker" | "highlighter" | "eraser" | "lasso";
export type HandwrittenPencilType = Exclude<HandwrittenToolId, "eraser" | "lasso">;
export type HandwrittenPageBackground = "blank" | "ruled" | "grid" | "dots" | "cornell";
export type HandwrittenPageSizePreset = "A4" | "4:3" | "16:9" | "1:1" | "Letter" | "free";
export type HandwrittenPageOrientation = "portrait" | "landscape";
export type HandwrittenExportFormat = "knote" | "png" | "svg" | "pdf";

export type HandwrittenPoint = [number, number, number, number, number?, number?];
export type HandwrittenEraserMode = "stroke" | "partial";
export type HandwrittenEraserConfig = {
  width: number;
  mode: HandwrittenEraserMode;
};

export type HandwrittenStroke = {
  id: string;
  tool: HandwrittenToolId;
  color: string;
  width: number;
  opacity: number;
  pressure: boolean;
  pressureSensitivity?: number;
  textureSeed?: string;
  textureVersion?: 1;
  points: HandwrittenPoint[];
  path?: string | null;
  bounds?: { x: number; y: number; width: number; height: number } | null;
};

export type HandwrittenToolPreset = {
  id: string;
  type?: HandwrittenPencilType;
  label: string;
  color: string;
  width: number;
  opacity: number;
  pressure: boolean;
  pressureSensitivity: number;
  smoothing: number;
};

export type HandwrittenConfig = {
  toolPresets: HandwrittenToolPreset[];
  eraser: HandwrittenEraserConfig;
};

export type HandwrittenNotePage = {
  id: string;
  title?: string | null;
  size: { width: number; height: number; unit: "px"; preset: HandwrittenPageSizePreset };
  background: { type: HandwrittenPageBackground; spacing?: number | null };
  strokes: HandwrittenStroke[];
  generatedElements?: AiHandwrittenGeneratedElement[];
  thumbnailHash?: string | null;
  updatedAt: string;
};

export type HandwrittenNoteContent = {
  schemaVersion: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  defaultPage: {
    preset: HandwrittenPageSizePreset;
    orientation: HandwrittenPageOrientation;
    background: HandwrittenPageBackground;
  };
  toolPresets: HandwrittenToolPreset[];
  pages: HandwrittenNotePage[];
  ocr: {
    status: "not-indexed" | "processing" | "updated" | "error";
    updatedAt?: string | null;
    textByPage: Record<string, string>;
  };
};

export type HandwrittenNoteRecord = {
  id: string;
  name: string;
  path: string;
  projectId: string;
  content: HandwrittenNoteContent;
  diskContent?: HandwrittenNoteContent | null;
  diskContentHash?: string | null;
  savedContentHash?: string | null;
  draftContentHash?: string | null;
  pageCount: number;
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

export type OpenProjectTab = OpenDocumentTab & {
  kind?: "document" | "handwritten-note";
};

export type DocumentWorkspaceTab = OpenDocumentTab & {
  kind: "document";
};

export type HandwrittenNoteWorkspaceTab = OpenDocumentTab & {
  kind: "handwritten-note";
  path?: string | null;
};

export type ReleaseNotesWorkspaceTab = {
  kind: "release-notes";
  id: "app-release-notes";
  name: "Notas de release";
  utilityTabId: "release-notes";
  readonly: true;
};

export type NotesWorkspaceTab = {
  kind: "notes";
  id: "user-notes";
  name: "Notas";
  utilityTabId: "notes";
};

export type ImageWorkspaceTab = {
  kind: "image";
  id: string;
  name: string;
  path: string;
};

export type ReferenceDocumentWorkspaceTab = {
  kind: "reference-document";
  id: string;
  name: string;
  path: string;
  format: "pdf" | "docx" | "xlsx";
  readonly: true;
};

export type AiConversationWorkspaceTab = {
  kind: "ai-conversation";
  id: "project-ai-conversation";
  name: "IA";
  readonly: true;
};

export type WorkspaceTab = AiConversationWorkspaceTab | NotesWorkspaceTab | DocumentWorkspaceTab | HandwrittenNoteWorkspaceTab | ImageWorkspaceTab | ReferenceDocumentWorkspaceTab | ReleaseNotesWorkspaceTab;

export type UserNotes = {
  markdown: string;
  updatedAt: string;
};

export type PreviewFormat = "pdf" | "docx" | "xlsx";

export type PreviewStatus =
  | "queued"
  | "processing"
  | "ready"
  | "error"
  | "unsupported"
  | "protected"
  | "stale";

export type PreviewRendition =
  | "pdf"
  | "text"
  | "workbook"
  | "thumbnails";

export type SpreadsheetSheetSummary = {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  hidden: boolean;
};

export type DocumentPreview = {
  id: string;
  projectId: string;
  path: string;
  name: string;
  format: PreviewFormat;
  status: PreviewStatus;
  readonly: true;
  sourceFingerprint: DocumentFingerprint;
  availableRenditions: PreviewRendition[];
  pageCount?: number | null;
  sheets?: SpreadsheetSheetSummary[] | null;
  warnings: string[];
  generatedAt?: string | null;
  error?: string | null;
};

export type DocumentPreviewMode = "document" | "spreadsheet";

export type DocumentPreviewTextResponse = {
  previewId: string;
  text: string;
  searchable: boolean;
  warnings: string[];
};

export type SpreadsheetCell = {
  row: number;
  column: number;
  address: string;
  value?: string | number | boolean | null;
  displayValue?: string | null;
  formula?: string | null;
};

export type SpreadsheetSheetResponse = {
  previewId: string;
  sheetId: string;
  name: string;
  rowCount: number;
  columnCount: number;
  cells: SpreadsheetCell[];
  warnings: string[];
};

export type SpreadsheetSheetsResponse = {
  previewId: string;
  sheets: SpreadsheetSheetSummary[];
};

export type VersionRecord = {
  id: string;
  hash: string;
  title: string;
  author: string;
  authorInitials: string;
  createdAt?: string | null;
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
export type AiInteractionType = "chat" | "document_edit" | "project_operation" | "agentic_task" | "image_generation" | "handwritten_drawing" | "clarification" | "mixed";
export type AiConfidence = "high" | "medium" | "low";
export type AiExecutionMode = "quick" | "reasoning";
export type AiReasoningDepth = "light" | "medium" | "deep";
export type AiExecutionScope = "direct_action" | "needs_permission" | "needs_clarification" | "agentic_task" | "too_expensive_or_unclear";
export type AiSkillSource = "base" | "user" | "imported";
export type AiSkillStatus = "valid" | "error" | "draft";
export type AiSkillVisibility = "readonly" | "editable";
export type AiSkillDiagnosticStatus = "candidate" | "applied" | "warning" | "error" | "skipped" | "rejected";
export type AiSkillApplicationStatus = "applied" | "skipped" | "rejected" | "blocked";
export type AiSkillDiagnosticPhase = "prefilter" | "selection" | "policy" | "compose" | "validation";
export type AiSkillDiagnosticSeverity = "info" | "warning" | "error";
export type AiPendingIntentStatus = "awaiting_decision" | "awaiting_web_permission" | "ready" | "running" | "completed" | "cancelled";
export type AiPendingIntentAction = "replace_document" | "edit_document" | "create_document" | "project_operation" | "research_then_write";
export type AiIntentActionType = "allow_web_research" | "apply" | "cancel";
export type AiDocumentFocusType = "selection" | "cursor" | "block" | "document" | "project";
export type AiPromptIntentKind = "research" | "image" | "diagram";
export type AiResearchDepth = "quick" | "standard" | "deep";
export type AiResearchSourceScope = "web" | "project" | "web_project";
export type AiResearchResultTarget = "new_document" | "chat";
export type AiResearchStatus =
  | "draft"
  | "planning"
  | "query_planning"
  | "searching"
  | "ranking"
  | "reading"
  | "extracting"
  | "contrasting"
  | "gap_analysis"
  | "synthesizing"
  | "drafting"
  | "verifying"
  | "publishing"
  | "reviewing"
  | "ready"
  | "ready_pass"
  | "ready_warning"
  | "failed"
  | "failed_quality"
  | "failed_provider"
  | "failed_publish"
  | "failed_runtime"
  | "cancelled";
export type AiResearchTemplateId = "executive_report" | "technical_analysis" | "comparison" | "state_of_art" | "regulatory_research" | "recommendations";
export type AiResearchOutputTarget = AiResearchResultTarget;
export type AiPromptIntent = {
  kind: AiPromptIntentKind;
  label: string;
  research?: Partial<AiResearchBrief> | null;
};
export type AiResearchPlan = {
  title: string;
  objective: string;
  outline: string[];
  constraints: string;
  sourceScope: AiResearchSourceScope;
  primaryObjective?: string;
  secondaryObjectives?: string[];
  researchAspects?: string[];
  objectiveCoverage?: Array<{
    objectiveIndex: number;
    aspectIndexes: number[];
  }>;
  recommendedReportStyle?: string;
  proposedCandidateSourceLimit?: number;
  candidateSourceLimit?: number;
  proposedReportLength?: AiResearchReportLength;
  reportLength?: AiResearchReportLength;
  planningRationale?: string | null;
  diagramsEnabled?: boolean;
  imagesEnabled?: boolean;
  reportSkillId?: string;
  auxiliarySkillIds?: string[];
  outputSummary?: string | null;
  visualPlan?: string | null;
  estimatedDurationLabel: string;
  autoStartAfterSeconds: number;
  createdAt: string;
  updatedAt: string;
};
export type AiResearchReportProfile = {
  diagramsEnabled: boolean;
  imagesEnabled: boolean;
};
export type AiResearchStrategy = {
  mode: AiResearchPresetId;
  candidateSourceLimit: number;
  reportLength?: AiResearchReportLength;
  targetWordRange?: [number, number];
  targetSectionCount?: [number, number];
  maxHeadingDepth?: number;
  allowAppendices?: boolean;
  sourceReadBudget: number;
  citationTarget: number;
  searchRounds: number;
  maxQueriesPerRound: number;
  minIndependentSources: number;
  minSourcesPerObjective: number;
  contradictionCheck: "light" | "standard" | "strict";
  gapReview: boolean;
  reportDetail: "executive" | "complete" | "deep" | "comparative" | "document_review";
  estimatedTimeRange: string;
};
export type AiResearchBudget = {
  maxEstimatedCostEur?: number;
  estimatedCostEur?: number;
  maxSteps?: number;
  usedSteps?: number;
  maxSearchRounds?: number;
  usedSearchRounds?: number;
  maxSourceReads?: number;
  usedSourceReads?: number;
  exhausted?: boolean;
};
export type AiResearchQueryBatch = {
  id: string;
  round: number;
  objectiveIndex?: number | null;
  aspectIndex?: number | null;
  queries: string[];
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  completedAt?: string | null;
};
export type AiResearchSourceState = "candidate" | "deduplicated" | "ranked" | "selected_for_reading" | "read" | "used_as_evidence" | "cited" | "rejected" | "unavailable";
export type AiResearchSourceCandidate = AiResearchSource & {
  state?: AiResearchSourceState;
  status?: AiResearchSourceState;
  query?: string | null;
  objectiveIndex?: number | null;
  aspectIndex?: number | null;
  score?: number | null;
  rankReason?: string | null;
  rejectionReason?: string | null;
};
export type AiResearchSourceRead = {
  id?: string;
  sourceId: string;
  status: "read" | "unavailable" | "rejected";
  title: string;
  url?: string | null;
  path?: string | null;
  kind?: AiResearchSource["kind"] | null;
  content?: string | null;
  excerpt: string;
  readAt: string;
  error?: string | null;
};
export type AiResearchFinding = {
  id: string;
  title: string;
  summary: string;
  evidenceIds: string[];
  objectiveIndex?: number | null;
  aspectIndex?: number | null;
  confidence: "high" | "medium" | "low" | number;
};
export type AiResearchCoverage = {
  status: "pass" | "warning" | "fail";
  objectiveCoverage?: Array<{ objectiveIndex: number; evidenceCount: number; sourceCount: number; status: "pass" | "warning" | "fail" }>;
  aspectCoverage?: Array<{ aspectIndex: number; evidenceCount: number; sourceCount: number; status: "pass" | "warning" | "fail" }>;
  coveredObjectives?: number;
  requiredObjectives?: number;
  objectives?: Array<{ objectiveIndex: number; sourceCount: number; covered: boolean }>;
  aspects?: Array<{ aspectIndex: number; sourceCount: number; covered: boolean }>;
  gaps: string[];
  generatedAt?: string;
};
export type AiResearchActivityEvent = {
  id: string;
  phase: AiResearchStatus;
  level: "info" | "warning" | "error";
  message: string;
  detail?: string | null;
  metricKey?: string | null;
  countCurrent?: number | null;
  countTotal?: number | null;
  createdAt: string;
};
export type AiResearchArtifactCounts = {
  candidateSources: number;
  rankedSources: number;
  selectedSources: number;
  readSources: number;
  evidence: number;
  findings: number;
  citedSources: number;
  tables: number;
  diagrams: number;
  images: number;
};
export type AiResearchUsage = {
  providerCalls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  estimatedCostEur?: number | null;
  currency: "EUR";
  updatedAt?: string | null;
};
export type AiResearchBrief = {
  id: string;
  projectId: string;
  topic: string;
  objective: string;
  questions: string[];
  depth: AiResearchDepth;
  sourceScope: AiResearchSourceScope;
  maxSources: number;
  candidateSourceLimit?: number;
  reportLength?: AiResearchReportLength;
  maxEstimatedCostEur: number;
  resultTarget: AiResearchResultTarget;
  confirmBeforeCreating: boolean;
  destinationFolderId?: string | null;
  destinationFolderPath?: string | null;
  templateId?: AiResearchTemplateId | null;
  tone?: "professional" | "executive" | "technical" | "concise" | null;
  language?: "es" | "en" | "auto" | null;
  plan?: AiResearchPlan | null;
  reportProfile?: AiResearchReportProfile | null;
  createdAt: string;
  updatedAt: string;
};
export type AiResearchEvidence = {
  id: string;
  sourceId: string;
  claim: string;
  excerpt: string;
  confidence: "high" | "medium" | "low" | number;
  objectiveIndex?: number | null;
  aspectIndex?: number | null;
  consultedAt?: string | null;
  sourceKind?: AiResearchSource["kind"] | null;
};
export type AiResearchSource = {
  id: string;
  title: string;
  url?: string | null;
  path?: string | null;
  kind: "web" | "project_document" | "external_file" | "local_file";
  consultedAt: string;
  confidence: "high" | "medium" | "low" | number;
  usedFragments: string[];
  status?: "pending" | "read" | "used" | "rejected" | "unavailable" | AiResearchSourceState;
  snapshotExcerpt?: string | null;
  score?: number | null;
  rankReason?: string | null;
};
export type AiResearchQualityReport = {
  id?: string;
  jobId?: string;
  status: "pass" | "warning" | "fail";
  coverage: "high" | "medium" | "low" | AiResearchCoverage;
  supportedClaims?: number;
  supportedFindings?: number;
  unsupportedClaims: string[] | number;
  unsupportedFindings?: number;
  contradictions: string[];
  limitations: string[];
  sourceCount: number;
  citedSourceCount?: number;
  evidenceCount?: number;
  independentSourceCount?: number;
  generatedAt?: string;
};
export type AiResearchError = {
  code: string;
  message: string;
  retryable: boolean;
};
export type AiResearchReviewState = {
  status: "draft_ai" | "accepted" | "revision_requested";
  comments?: string | null;
  reviewedAt?: string | null;
};
export type AiResearchMetrics = {
  durationMs?: number | null;
  estimatedCostEur?: number | null;
  sourceCount: number;
  evidenceCount: number;
  supportedClaimRatio?: number | null;
};
export type AiResearchTemplate = {
  id: AiResearchTemplateId;
  label: string;
  description: string;
  depth: AiResearchDepth;
  sourceScope: AiResearchSourceScope;
};
export type AiResearchPolicy = {
  projectId: string;
  allowedSourceScopes: AiResearchSourceScope[];
  blockedDomains: string[];
  preferredLanguage: "es" | "en" | "auto";
  defaultDepth: AiResearchDepth;
  maxEstimatedCostEur: number;
  maxSources: number;
  confirmBeforeCreating: boolean;
  allowPrivateProjectDocuments: boolean;
  minimumSources: number;
  requireCitations: boolean;
  updatedAt: string;
};
export type AiResearchRevisionRequest = {
  action: "expand" | "reduce" | "technical_focus" | "add_recommendations" | "update_sources" | "new_version";
  instruction?: string;
  outputTarget?: AiResearchOutputTarget;
};
export type AiResearchExportRequest = {
  format: "markdown" | "pdf" | "docx" | "package";
};
export type AiResearchJob = {
  id: string;
  projectId: string;
  brief: AiResearchBrief;
  strategy?: AiResearchStrategy | null;
  budget?: AiResearchBudget | null;
  status: AiResearchStatus;
  phases: AiResearchStatus[];
  currentPhase: AiResearchStatus;
  phase?: AiResearchStatus;
  progress?: number;
  progressMessage?: string;
  message: string;
  heartbeatAt?: string | null;
  lastActivityAt?: string | null;
  sources: AiResearchSource[];
  sourceCandidates?: AiResearchSourceCandidate[];
  rankedSources?: AiResearchSourceCandidate[];
  sourceReads?: AiResearchSourceRead[];
  evidence: AiResearchEvidence[];
  queryBatches?: AiResearchQueryBatch[];
  coverage?: AiResearchCoverage | null;
  findings?: AiResearchFinding[];
  activity?: AiResearchActivityEvent[];
  artifactCounts?: AiResearchArtifactCounts | null;
  usage?: AiResearchUsage | null;
  qualityReport?: AiResearchQualityReport | null;
  reviewState?: AiResearchReviewState | null;
  metrics?: AiResearchMetrics | null;
  documentId?: string | null;
  createdDocumentId?: string | null;
  documentPath?: string | null;
  markdown?: string | null;
  draftMarkdown?: string | null;
  researchFindings?: string[];
  tree?: DocumentTreeNode[] | null;
  usedSkills?: string[];
  skillApplications?: AiSkillApplication[];
  skillDiagnostics?: AiSkillDiagnostic[];
  generatedImages?: AiGeneratedImage[] | Array<Record<string, unknown>>;
  error?: string | AiResearchError | null;
  retryOfJobId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type AiResearchJobListResponse = {
  jobs: AiResearchJob[];
};
export type AiResearchSourcesResponse = {
  sources: AiResearchSource[];
  sourceCandidates?: AiResearchSourceCandidate[];
  rankedSources?: AiResearchSourceCandidate[];
  sourceReads?: AiResearchSourceRead[];
  evidence: AiResearchEvidence[];
};
export type AiResearchActivityResponse = {
  jobId?: string;
  activity: AiResearchActivityEvent[];
};
export type AiResearchCoverageResponse = {
  jobId?: string;
  coverage: AiResearchCoverage | null;
};
export type AiResearchExportResponse = {
  format: AiResearchExportRequest["format"];
  filename: string;
  markdown?: string | null;
  path?: string | null;
  message: string;
};
export type AiResearchBriefRequest = {
  prompt: string;
  activeMarkdown?: string | null;
  documentId?: string | null;
  clientContext?: AiClientContext | null;
  clientMessageId?: string;
  contextSourceIds?: string[];
  intent?: AiPromptIntent | null;
};
export type AiResearchJobRequest = {
  brief: AiResearchBrief;
  activeMarkdown?: string | null;
  contextSourceIds?: string[];
};
export type AiEditProposalStatus = "proposed" | "applied" | "discarded" | "stale";
export type AiEditOperationAction =
  | "replace_selection"
  | "insert_at_cursor"
  | "edit_block"
  | "edit_document"
  | "edit_project"
  | "insert_image"
  | "insert_diagram"
  | "replace_document";
export type AiEditOperationPlacementType =
  | "at_cursor"
  | "before_selection"
  | "after_selection"
  | "replace_selection"
  | "after_heading"
  | "after_paragraph"
  | "document_end";
export type AiOperationType =
  | "document_modified"
  | "handwritten_modified"
  | "handwritten_drawing_blocked"
  | "handwritten_drawing_generated"
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
  | "handwritten_modified"
  | "handwritten_drawing_blocked"
  | "handwritten_drawing_generated"
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
  targetKind?: "markdown_document" | "notes" | "handwritten_note" | "project";
  handwrittenNoteId?: string | null;
  activeHandwrittenPageId?: string | null;
  activeHandwrittenSummary?: Record<string, unknown> | string | null;
  activeHandwrittenContentHash?: string | null;
  activeHandwrittenBaseFingerprint?: DocumentFingerprint | null;
  activeHandwrittenContent?: HandwrittenNoteContent | null;
  selectionFocus?: AiSelectionFocus | null;
  clientContext?: AiClientContext | null;
  intentAction?: AiIntentActionRequest | null;
  intent?: AiPromptIntent | null;
  executionMode?: AiExecutionMode;
  reasoningDepth?: AiReasoningDepth;
  mode: AiInteractionMode;
  clientMessageId: string;
  contextSourceIds?: string[];
};

export type AiClientContext = {
  lastDocumentId?: string | null;
  lastDocumentPath?: string | null;
  diagramConfig?: AiDiagramConfig | null;
};

export type AiIntentActionRequest = {
  type: AiIntentActionType;
  intentId: string;
};

export type AiSelectionFocus = {
  documentId?: string | null;
  path?: string | null;
  focusType?: AiDocumentFocusType;
  from?: number | null;
  to?: number | null;
  position?: number | null;
  text: string;
  nearTextBefore?: string | null;
  nearTextAfter?: string | null;
  headingPath?: string[] | null;
  blockType?: string | null;
  blockHash?: string | null;
};

export type AiContextSourceKind = "project_document" | "handwritten_note" | "external_file" | "image";
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

export type AiSkillDiagnostic = {
  skillId?: string;
  status?: AiSkillDiagnosticStatus;
  title?: string;
  notes?: string[];
  level?: AiSkillDiagnosticSeverity;
  message?: string;
  phase?: AiSkillDiagnosticPhase;
  severity?: AiSkillDiagnosticSeverity;
  modeId?: string;
  validatorId?: string;
};

export type AiSkillApplication = {
  skillId: string;
  modeId: string;
  action: string;
  status: AiSkillApplicationStatus;
  reason: string;
  confidence: AiConfidence;
};

export type AiSkillMode = {
  id: string;
  name: string;
  description: string;
  whenToUse: string[];
  whenNotToUse: string[];
  supportedActions: string[];
  requiresCapabilities: string[];
  validators: string[];
  riskLevel: "low" | "medium" | "high";
  contextBudget: number;
};

export type AiSkillSummary = {
  id: string;
  name: string;
  version: string;
  source: AiSkillSource;
  status: AiSkillStatus;
  visibility: AiSkillVisibility;
  runtimeEnabled: boolean;
  description: string;
  categories: string[];
  capabilities: string[];
  outputActions: string[];
  modes: AiSkillMode[];
};

export type AiSkillManifest = {
  schemaVersion: number;
  id: string;
  name: string;
  version: string;
  source: AiSkillSource;
  description: string;
  categories: string[];
  capabilities: string[];
  outputActions: string[];
  requires: string[];
  validators: string[];
  orchestratesSkills?: string[];
  auxiliarySkillCategories?: string[];
  requiredCapabilities?: string[];
  runtimeEnabled?: boolean;
  modes?: AiSkillMode[];
};

export type AiSkillExample = {
  name: string;
  markdown: string;
};

export type MermaidDiagramType = {
  id: string;
  label: string;
  family: string;
  maturity: "stable" | "advanced" | "beta";
  aliases: string[];
  requiredPolicy: string;
  validatorId: string;
};

export type AiSkillDetail = AiSkillSummary & {
  manifest: AiSkillManifest;
  manifestJson: string;
  instructionsMarkdown: string;
  examples: AiSkillExample[];
  diagnostics: AiSkillDiagnostic[];
  mermaidCatalog: MermaidDiagramType[];
};

export type AiSkillListResponse = {
  skills: AiSkillSummary[];
};

export type AiSkillValidationResponse = {
  skillId: string;
  status: AiSkillStatus;
  diagnostics: AiSkillDiagnostic[];
};

export type AiSkillSelectorChoice = {
  skillId: string;
  modeId: string;
  action: string;
  confidence: AiConfidence;
  reason: string;
};

export type AiSkillSelectionPreviewRequest = {
  prompt: string;
  expectedAction?: string;
  selectorProposal?: {
    selected: AiSkillSelectorChoice[];
  };
};

export type AiSkillSelectionPreview = {
  status: string;
  selectorStatus: string;
  candidateSkills: AiSkillSummary[];
  proposed: AiSkillSelectorChoice[];
  applications: AiSkillApplication[];
  diagnostics: AiSkillDiagnostic[];
  promptGuidance: string;
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

export type AiDocumentFocus = {
  type: AiDocumentFocusType;
  documentId?: string | null;
  path?: string | null;
  from?: number | null;
  to?: number | null;
  position?: number | null;
  text?: string | null;
  nearTextBefore?: string | null;
  nearTextAfter?: string | null;
  headingPath?: string[] | null;
  blockType?: string | null;
  blockHash?: string | null;
};

export type AiEditOperationPlacement = {
  type: AiEditOperationPlacementType;
  headingPath?: string[] | null;
  anchorExcerpt?: string | null;
};

export type AiEditOperation = {
  id: string;
  action: AiEditOperationAction;
  documentId: string;
  summary: string;
  confidence: AiConfidence;
  from?: number | null;
  to?: number | null;
  position?: number | null;
  markdown?: string | null;
  replacementMarkdown?: string | null;
  headingPath?: string[] | null;
  originalExcerpt?: string | null;
  anchorExcerpt?: string | null;
  imageAssetId?: string | null;
  imageAltText?: string | null;
  diagramSyntax?: "mermaid" | null;
  diagramType?: string | null;
  diagramCode?: string | null;
  diagramCaption?: string | null;
  placement?: AiEditOperationPlacement | null;
};

export type AiEditProposal = {
  id: string;
  projectId: string;
  interactionId: string;
  status: AiEditProposalStatus;
  documentId?: string | null;
  title: string;
  summary: string;
  scope: AiDocumentFocusType;
  focus?: AiDocumentFocus | null;
  operations: AiEditOperation[];
  createdAt: string;
  updatedAt: string;
};

export type AiUpdatedDocument = {
  documentId: string;
  markdown: string;
  summary: string;
};

export type AiHandwrittenDrawingIntent = {
  action: "draw_handwritten_note";
  route: AiDrawingRoute;
  targetKind: "handwritten_note";
  noteId?: string | null;
  pageId?: string | null;
  prompt?: string | null;
};

export type AiDrawingBrief = {
  goal: string;
  style?: string | null;
  audience?: string | null;
  constraints?: string[] | null;
};

export type AiDrawingSceneElementType =
  | "box"
  | "diagram_node"
  | "shape"
  | "arrow"
  | "connector"
  | "label"
  | "text_block"
  | "group"
  | "lane"
  | "timeline_event"
  | "mindmap_node"
  | "wireframe_component"
  | "icon_hint"
  | "freeform_shape"
  | "symbol"
  | "portrait"
  | "fill_region"
  | "shadow_region"
  | "annotation";

export type AiDrawingSceneElement = {
  id: string;
  type: AiDrawingSceneElementType;
  shape?: "square" | "triangle" | "circle" | "ellipse" | "diamond" | "star" | null;
  symbol?: "house" | "sun" | "dog" | "cat" | "person" | "face" | "tree" | "cloud" | "server" | "laptop" | "database" | "rocket" | "starship" | "spacecraft" | null;
  target?: string | null;
  fill?: "hatching" | "cross_hatching" | "scribble" | "marker_passes" | null;
  text?: string | null;
  role?: string | null;
  priority?: number | null;
  from?: string | null;
  to?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AiDrawingSceneSpec = {
  route?: AiDrawingRoute | null;
  family?: string | null;
  elements: AiDrawingSceneElement[];
  metadata?: Record<string, unknown> | null;
};

export type AiDrawingVectorPlan = {
  pageId?: string | null;
  route?: AiDrawingRoute | null;
  items?: Array<Record<string, unknown>>;
  elements?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown> | null;
};

export type AiDrawingQualityReport = {
  ok?: boolean;
  status?: "passed" | "blocked" | "warning" | string;
  message?: string | null;
  attempts?: number;
  issues?: string[];
  warnings?: string[];
  diagnostics?: Array<Record<string, unknown>>;
  metrics?: Record<string, number | string | boolean | null>;
};

export type AiHandwrittenDrawingProposal = {
  id?: string;
  noteId: string;
  targetPageId?: string | null;
  route: AiDrawingRoute;
  replacementPolicy:
    | "append_only"
    | "replace_selection"
    | "replace_page"
    | "clean_existing"
    | "cleanup_existing";
  summary: string;
  drawingBrief: AiDrawingBrief;
  sceneSpec: AiDrawingSceneSpec;
  qualityReport?: AiDrawingQualityReport | null;
};

export type AiUpdatedHandwrittenNote = {
  noteId: string;
  content: HandwrittenNoteContent;
  summary: string;
  pageId?: string | null;
  route?: AiDrawingRoute | null;
  sceneSpec?: AiDrawingSceneSpec | null;
  vectorPlan?: AiDrawingVectorPlan | null;
  qualityReport?: AiDrawingQualityReport | null;
};

export type AiHandwrittenGeneratedElement = {
  id: string;
  source?: "ai";
  route?: AiDrawingRoute | null;
  sceneElementId?: string | null;
  kind?: string | null;
  type?: AiDrawingSceneElementType | string | null;
  text?: string | null;
  strokeIds: string[];
  bounds?: { x: number; y: number; width: number; height: number } | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown> | null;
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
  usedSkills?: string[];
  skillApplications?: AiSkillApplication[];
  skillDiagnostics?: AiSkillDiagnostic[];
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
  editProposal?: AiEditProposal | null;
  editProposalStatus?: AiEditProposalStatus | null;
  answer?: string | null;
  conversationEvents: AiConversationEvent[];
  operations: AiOperation[];
  updatedDocument?: AiUpdatedDocument | null;
  drawingProposal?: AiHandwrittenDrawingProposal | null;
  updatedHandwrittenNote?: AiUpdatedHandwrittenNote | null;
  generatedImages?: AiGeneratedImage[];
  task?: AiAgenticTask | null;
  tree?: DocumentTreeNode[] | null;
  affectedDocuments: AffectedDocument[];
  requiresConfirmation?: AiPendingDelete | null;
  contextSources?: AiContextSource[];
  expiredContextSourceIds?: string[];
  usedSkills?: string[];
  skillApplications?: AiSkillApplication[];
  skillDiagnostics?: AiSkillDiagnostic[];
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
  baseContentHash?: string | null;
};

export type CreateHandwrittenNotePayload = {
  parentId: string | null;
  name: string;
  background?: HandwrittenPageBackground | string | null;
};

export type SaveHandwrittenNotePayload = {
  content: HandwrittenNoteContent;
  baseFingerprint?: DocumentFingerprint | null;
  force?: boolean;
};

export type SaveHandwrittenNoteDraftPayload = {
  content: HandwrittenNoteContent;
  baseFingerprint?: DocumentFingerprint | null;
  baseContentHash?: string | null;
};

export type HandwrittenNoteDraftResponse = {
  noteId: string;
  draftUpdatedAt?: string | null;
  isDirty: boolean;
  hasDraft?: boolean;
  diskContentHash?: string | null;
  savedContentHash?: string | null;
  draftContentHash?: string | null;
};

export type HandwrittenNoteExportPayload = {
  format: HandwrittenExportFormat;
  outputPath: string;
  pageId?: string | null;
  content?: HandwrittenNoteContent | null;
};

export type HandwrittenNoteRenderResponse = {
  noteId: string;
  pageId: string;
  format: "png" | "svg";
  contentType: string;
  dataUrl: string;
  renderedAt: string;
};

export type HandwrittenNoteInsertMarkdownPayload = {
  documentId: string;
  pageId: string;
  altText?: string | null;
  content?: HandwrittenNoteContent | null;
};

export type HandwrittenNoteInsertMarkdownResponse = {
  markdown: string;
  asset: AssetMetadata;
  noteId: string;
  pageId: string;
};

export type DraftResponse = {
  documentId: string;
  draftUpdatedAt?: string | null;
  isDirty: boolean;
  hasDraft?: boolean;
  diskContentHash?: string | null;
  savedContentHash?: string | null;
  draftContentHash?: string | null;
};

export type SyncStatusDocument = {
  documentId: string;
  baseFingerprint?: DocumentFingerprint | null;
};

export type DocumentVersionState =
  | "ok"
  | "unversioned"
  | "local-ahead"
  | "remote-ahead"
  | "diverged"
  | "unsupported";

export type DocumentSyncStatus = {
  documentId: string;
  exists: boolean;
  currentFingerprint?: DocumentFingerprint | null;
  diskContentHash?: string | null;
  savedContentHash?: string | null;
  draftContentHash?: string | null;
  diskChanged: boolean;
  hasDraft: boolean;
  orphaned: boolean;
  conflictStatus: DocumentConflictStatus;
  versionState: DocumentVersionState;
  localChanged: boolean;
  remoteChanged: boolean;
  localVersionHash?: string | null;
  remoteVersionHash?: string | null;
  message?: string | null;
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
