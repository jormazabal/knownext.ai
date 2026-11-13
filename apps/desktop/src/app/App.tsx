import {createDeferredView} from "../components/ui/createDeferredView";
import {sameTrackedVisit,trackedAuthorityIsCurrent,usesLiveEditor} from "./trackedAiWorkspace";
import {AiChangeJournal} from "../lib/api/aiChangeJournal";
import {AiChangeHistoryDialog} from "../features/ai/AiChangeHistoryDialog";
import {ProjectReplaceDialog} from "../features/search/ProjectReplaceDialog";
import {useWorkspaceExit} from "./useWorkspaceExit";
import {protectUpdateInstallation,releaseUpdateInstallation} from "../lib/runtime/updateProtection";
import {imageInsertionTargetIsCurrent,type ImageInsertionTarget} from "./imageInsertionTarget";
import {useProjectWork} from "./useProjectWork";
import {acknowledgeDraftWrite,isDraftWriteConflict} from "./draftWriteRevision";
import {LocalEditProtection} from "./localEditProtection";
import {refreshContextSource} from "../lib/api/contextOrigin";
import type {RecoveryCopy} from "../types/recovery";
import {flushSync} from "react-dom";
import {fileBatchEffects} from "./fileBatchEffects";
import {ModalFrame} from "../components/ui/ModalFrame";
import {protectForCriticalTransition} from "./criticalStateTransition";
import type {StateTransitionOutcome} from "../types/stateMigrations";
import {useAiBudgetNotice} from "./useAiBudgetNotice";
import type {HandwrittenPageFocus,WorkspaceNodeFocus} from "../types/localSearch";
import {DocumentConflictDialog} from "../features/documents/DocumentConflictDialog";
import {HandwrittenConflictDialog} from "../features/handwritten/HandwrittenConflictDialog";
import {applyHandwrittenConflict,reviewHandwrittenConflict,reviewHandwrittenConflictAttempt} from "../lib/api/handwrittenConflicts";
import {createConflictAttemptId} from "../lib/api/conflictAttempts";
import {acknowledgeMergedNote,confirmHandwrittenMerge,noteConflictRevision,verifyHandwrittenMergeAttempt} from "./handwrittenMerge";
import type {HandwrittenConflictReview,HandwrittenConflictApply} from "../types/handwrittenConflicts";
import {applyDocumentConflict,reviewDocumentConflict,reviewHistoricalDraft,reviewRemoteDraft,reviewDocumentConflictAttempt} from "../lib/api/documentConflicts";
import type {DocumentConflictReview,DocumentConflictApply} from "../types/documentConflicts";
import {acknowledgeMergedDraft,acknowledgeMergedSyncStatus,confirmDocumentMerge,remoteSourceProof,verifyDocumentMergeAttempt} from "./documentMerge";
import { StartupRecovery } from "../features/settings/StartupRecovery";
import { useAiIndexMaintenance } from "./useAiIndexMaintenance";
import { aiResponseContinuityIssue, bindAiProposalReview, buildAiReviewRecord, captureAiRequest, resolveAiProposalRecovery, type AiRequestSnapshot } from "./aiResponseContinuity";
import { useAiResultReview } from "../features/assistant/useAiResultReview";
import { AiResultReviewDialog } from "../features/assistant/AiResultReviewDialog";
import { useAiProposalAutoApply } from "../features/assistant/useAiProposalAutoApply";
import { AiProposalExecution, nextAiEditorOperationId } from "./aiProposalExecution";
import { settingsSaveSummary, useSettingsPersistence, type SettingsDomain } from "./useSettingsPersistence";
import { acceptsAiRefresh, aiSettingsPayload, mergeExportSettings, reconcileAiSettingsRefresh } from "./settingsValues";
import { SettingsNavigation } from "../features/settings/SettingsNavigation";
import { SettingsContext } from "../features/settings/SettingsContext";
import { applyDocumentFileChanges, applyHandwrittenFileChanges } from "./fileSessionChanges";
import { SessionWriteQueue } from "./sessionWriteQueue";
import type { LocalReferenceTarget } from "../types/documentReferences";
import { ProjectTrashDialog } from "../features/documents/ProjectTrashDialog";
import {normalizeProjectTabs,resolveProjectTabs} from "./projectTabs";
import { FileBatchDialog } from "../features/documents/FileBatchDialog";
import type { FileBatchAction } from "../types/fileBatch";
import {listen as listenRecordingEvent} from "@tauri-apps/api/event";
import type {ResearchEvidenceReviewDialog as ResearchEvidenceReviewDialogView} from "../features/research/ResearchEvidenceReviewDialog";
import type {AssetCatalogDialog as AssetCatalogDialogView} from "../features/assets/AssetCatalogDialog";
import {getAssetCatalog,getAssetLinks} from "../lib/api/assetCatalog";
import {useAssetMoveReview} from "./useAssetMoveReview";
import {AssetMoveImpactDialog} from "../features/documents/AssetMoveImpactDialog";
import type {MeetingMinutesDialog as MeetingMinutesDialogView} from "../features/meetings/MeetingMinutesDialog";
import {applyHandwrittenOcr} from "../lib/api/handwrittenOcr";
import type {HandwrittenOcrApplyRequest,HandwrittenOcrApply,HandwrittenOcrResult} from "../types/handwrittenOcr";
import {mergeOcrText} from "./handwrittenOcrApplication";
import { RecordingPanel } from "../features/recordings/RecordingPanel";
import type {RecordingDestination} from "../types/recording";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ComponentProps } from "react";
import { captureProjectEditorSnapshots, captureWorkspaceEditorSnapshots, registerEditorSnapshot } from "./editorSnapshots";
import {checkpointPendingEditorInput} from "../features/editor/pendingInputCheckpoints";
import {useWorkspaceContinuity} from "./useWorkspaceContinuity";
import type {ProtectionOutcome} from "./workspaceContinuity";
import {protectNotesSnapshot} from "./notesProtection";
import {WorkspaceContinuityNotice} from "../features/documents/WorkspaceContinuityNotice";
import { RetiredProjectsDialog } from "../features/projects/RetiredProjectsDialog";
import { retireProjectWithWorkspace } from "../features/projects/projectRetirement";
import type { DocumentTreeAction } from "../features/documents/DocumentTree";
import type { MarkdownEditorController, MarkdownEditorChangeSource, MarkdownEditorExternalOperation, MarkdownEditorSelection } from "../features/editor/editorTypes";
import { prepareMermaidDiagramAssets } from "../features/editor/mermaidDiagrams";
import type { AiPromptExecutionOptions } from "../features/assistant/AiPromptInput";
import { AiDeleteConfirmationDialog } from "../features/assistant/AiDeleteConfirmationDialog";
import { CreateDocumentDialog, type CreateDocumentRequest } from "../features/documents/CreateDocumentDialog";
import { SaveDocumentTemplateDialog } from "../features/documents/SaveDocumentTemplateDialog";
import { createDocumentFromTemplate } from "../lib/api/documentTemplates";
import { MoveDocumentDialog } from "../features/documents/MoveDocumentDialog";
import { RecoveryReviewSection } from "../features/documents/RecoveryReviewSection";
import type { RestoreDraftResponse } from "../types/domain";
import {
  CloseDirtyDocumentDialog,
  DocumentFooterActionDialog,
  RecoverableDraftsDialog,
  type DocumentFooterDialogAction,
} from "../features/documents/DocumentProtectionDialogs";
import { CreateProjectDialog } from "../features/projects/CreateProjectDialog";
import type {ProjectTransferDialog as ProjectTransferDialogView} from "../features/projects/ProjectTransferDialog";
import type {ProjectTemplateCatalogDialog as ProjectTemplateCatalogDialogView} from "../features/projects/ProjectTemplateCatalogDialog";
import type { ProjectTransferMode } from "../types/projectTransfer";
import { GithubLoginDialog, type GithubLoginState } from "../features/projects/GithubLoginDialog";
import { UpdateAvailableDialog, type UpdateDialogState } from "../features/projects/UpdateAvailableDialog";
import type {AppSettingsDialog as AppSettingsDialogView,AppSettingsSection} from "../features/settings/AppSettingsDialog";
import { BrandMark } from "../components/brand/BrandMark";
import { CountdownCloseButton } from "../components/ui/CountdownCloseButton";
import { GlobalTooltip } from "../components/ui/GlobalTooltip";
import { DesktopLayout } from "../layouts/DesktopLayout";
import { acknowledgeDocumentSave,
  acceptsDocumentSyncObservation,
  sameDocumentRevision,
  acknowledgeDocumentRestore,
  beginDocumentLoad,
  settleDocumentLoad,
  applyExternalMarkdownUpdate,
  applyLocalMarkdownEdit,
  createLoadedDocumentSession,
  markdownMatchesSaved,
  shouldDiscardPersistedDraft,
  shouldPersistDraft,
  updateSession,
  type DocumentSession,
} from "./documentSessions";
import { acknowledgeHandwrittenSave,
  sameHandwrittenRevision,
  beginHandwrittenLoad,
  settleHandwrittenLoad,
  applyLocalHandwrittenNoteEdit,
  createLoadedHandwrittenNoteSession,
  handwrittenContentMatchesSaved,
  shouldDiscardPersistedHandwrittenDraft,
  shouldPersistHandwrittenDraft,
  stringifyHandwrittenContent,
  updateHandwrittenNoteSession,
  type HandwrittenNoteSession,
} from "./handwrittenSessions";
import {
  defaultAppearanceConfig,
  defaultAiConfig,
  defaultDiagnosticsConfig,
  defaultExportTemplateConfig,
  defaultHandwrittenConfig,
  defaultLayoutConfig,
  defaultProjectTabsConfig,
  getAppConfig,
  getAiConfig,
  getExportTemplate,
  getExportTemplatePath,
  readLocalAppPreferences,
  resetExportTemplate,
  updateAppConfig,
  updateAiConfig,
  updateExportTemplate,
  cacheLocalAppPreferences,
} from "../lib/api/config";
import {
  clearAiConversation,
  confirmAiDelete,
  deleteOpenAiKey,
  addAiContextSourceToProject,
  addProjectAttachmentAiContextSource,
  addProjectImageAiContextSource,
  addProjectDocumentAiContextSource,
  addProjectHandwrittenNoteAiContextSource,
  extendAiContextSource,
  getAiContextSources,
  getAiConversation,
  getAiIndexStatus,
  getAiPendingIntent,
  getAiResearchJob,
  getAiUsageSummary,
  cancelAiResearchJob,
  listAiResearchJobs,
  prepareAiResearchBrief,
  previewAiContextSource,
  removeAiContextSource,
  retryAiResearchJob,
  saveOpenAiKey,
  searchAiContextDocuments,
  sendAiInteraction,
  startAiResearchJob,
  uploadLocalAiContextFiles,
  uploadAiContextFiles,
} from "../lib/api/ai";
import {
  ApiError,
  getApiErrorMessage,
  isApiConnectionError,
  isRuntimeApiEnabled,
  waitForApiReady,
} from "../lib/api/client";
import { getProjectActivity, recordProjectActivity } from "../lib/api/activity";
import {
  discardDocumentDraft,
  discardOrphanDraft,
  exportDocument,
  exportDocumentContent,
  getDocument,
  loadDocumentDiskVersion,
  getDocumentsSyncStatus,
  getOrphanDraftInventory,
  restoreOrphanDraft,
  saveDocument,
  saveDocumentDraft,
} from "../lib/api/documents";
import {
  createHandwrittenNote,
  discardHandwrittenNoteDraft,
  exportHandwrittenNote,
  exportHandwrittenNoteContent,
  getHandwrittenNote,
  loadHandwrittenDiskVersion,
  insertHandwrittenPageIntoMarkdown,
  saveHandwrittenNote,
  saveHandwrittenNoteDraft,
} from "../lib/api/handwrittenNotes";
import { getUserNotes, saveUserNotes } from "../lib/api/notes";
import { getExternalChanges, importExternalChanges, scanExternalChanges } from "../lib/api/externalChanges";
import { PROTON_WORKSPACE_CHANGED_EVENT } from "../lib/api/protonDirect";
import { autoRunProjectSync, changeProjectSyncMode, connectProjectGithub, enableProjectHistory, getProjectFileSyncOverview, getProjectSyncStatus, publishProjectGithub, scanProjectSync, verifyProjectGithubConnection } from "../lib/api/sync";
import { APP_VERSION } from "../lib/appVersion";
import { RELEASE_NOTES_MARKDOWN } from "../lib/releaseNotes";
import { getAuthStatus, logout as logoutGithub, pollGithubDeviceFlow, startGithubDeviceFlow } from "../lib/api/auth";
import { listGithubRepositories } from "../lib/api/github";
import { createProjectVersion, restoreVersion } from "../lib/api/versions";
import {
  checkForUpdate,
  getUpdaterStatus,
  installUpdate,
  type AvailableUpdate,
  type UpdateDownloadProgress,
} from "../lib/runtime/updater";
import { getTraceLogStatus, openTraceLogFolder, recordTraceLog, type TraceLogStatus } from "../lib/runtime/logging";
import { openExternalUrl } from "../lib/runtime/links";
import {
  isTauriRuntime,
  selectBrowserExportTarget,
  selectBrowserHandwrittenExportTarget,
  selectExportFilePath,
  selectHandwrittenExportFilePath,
  withExportExtension,
  withHandwrittenExportExtension,
} from "../lib/runtime/exportDialogs";
import { selectAiContextFilePaths } from "../lib/runtime/fileDialogs";
import { isTauriMobileRuntime } from "../lib/runtime/platform";
import { exportMarkdownToMobile, exportHandwrittenToMobile, openMobileExport } from "../lib/api/mobileExports";
import { ExportStatus } from "../features/documents/ExportStatus";
import {useProjectLocationReview} from "../features/projects/useProjectLocationReview";
import {ProjectLocationReviewDialog} from "../features/projects/ProjectLocationReviewDialog";
import {discardSessionForClose} from "./sessionClosure";
import {replaceSessionFromDisk} from "./sessionDiskReplacement";
import { getRuntimeServiceStatus, type RuntimeServicesStatus } from "../lib/runtime/services";
import { applyAppearanceAttributes, useResolvedAppearanceTheme } from "../lib/theme/appearance";
import { AlertCircle, Info, RefreshCw } from "lucide-react";
import {
  createFolder,
  createProjectDocument,
  createProject,
  buildImageReference,
  deleteTreeNode,
  duplicateProjectDocument,
  getProjectTree,
  getProjectCapabilities,
  getProjectVersioningStatus,
  importProjectAttachment,
  listProjects,
  importProjectImage,
  moveTreeNode,
  pullProject,
  pushProject,
  reindexProjectImages,
  renameTreeNode,
  setActiveProject as persistActiveProject,
  updateProject,
} from "../lib/api/projects";
import type {
  AuthStatus,
  AiContextSearchResult,
  AiContextSource,
  AiContextSourcePreviewResponse,
  AiConfigStatus,
  AiConversationEvent,
  AiEditOperation,
  AiEditProposal,
  AiIndexStatusResponse,
  AiInteractionResponse,
  AiIntentActionType,
  AiPendingDelete,
  AiPendingIntent,
  AiResearchBrief,
  AiResearchJob,
  AiSelectionFocus,
  AiSkillApplication,
  AiSkillDiagnostic,
  AiUsageSummaryResponse,
  AppearanceConfig,
  AppUtilityTabId,
  ActivityEvent,
  DiagnosticsConfig,
  AssetImportResponse,
  DocumentSyncStatus,
  DocumentPostSaveSyncState,
  DocumentRecord,
  DocumentTreeNode,
  ExportFormat,
  ExportTemplateConfig,
  ExportTemplateUpdate,
  FileOperationResult,
  HandwrittenExportFormat,
  HandwrittenConfig,
  HandwrittenEraserConfig,
  HandwrittenNoteContent,
  HandwrittenNoteInsertMarkdownResponse,
  HandwrittenNoteRecord,
  HandwrittenToolPreset,
  InsertImageReferenceResponse,
  LayoutConfig,
  OpenDocumentTab,
  OrphanDraft,
  Project,
  ProjectCapabilities,
  ProjectFileSyncOverview,
  ProjectPayload,
  ProjectTabsConfig,
  ProjectVersioningStatus,
  GithubDeviceStartResponse,
  GithubRepositorySummary,
  RestoreVersionResponse,
  ExternalChangeDecision,
  ExternalChangeSet,
  ExternalChangeImportRequest,
  ProjectSyncState,
  ProjectSyncStatus,
  OpenDocumentSyncState,
  SyncMode,
  WorkspaceTab,
} from "../types/domain";
import {
  ensureReleaseNotesTab,
  RELEASE_NOTES_UTILITY_TAB_ID,
  RELEASE_NOTES_WORKSPACE_TAB_ID,
  removeReleaseNotesTab,
  shouldOpenReleaseNotesAfterStartup,
} from "./releaseNotesState";
import { NOTES_TITLE, NOTES_UTILITY_TAB_ID, NOTES_WORKSPACE_TAB_ID } from "./notesState";
import { getPromptContextSourceIds, getVisibleAiContextSources } from "./aiContextState";
import {
  applyTreeOpenState,
  updateTreeOpenPathsForProject,
  type TreeOpenPathsByProject,
} from "./treeOpenState";
import { applyAiEditOperationToMarkdown, type AiMarkdownOperationReviewReason } from "./aiEditProposalApplication";

type AppNotice = {
  treeProjectId?:string;
  title: string;
  message: string;
  tone: "error" | "info";
};

type DocumentFooterDialog = {action:DocumentFooterDialogAction;documentId:string;projectId:string;revision:DocumentSession};
type DocumentPostSaveSyncEntry = {
  state: DocumentPostSaveSyncState;
  sequence: number;
};

type UpdateState = UpdateDialogState;
type NotesSaveState = "idle" | "saving" | "error";
const AI_CONVERSATION_TAB_ID = "project-ai-conversation" as const;
const ACKNOWLEDGED_EXTERNAL_CHANGES_STORAGE_KEY = "knownext.acknowledgedExternalChanges";

function isPermanentWorkspaceTabId(tabId: string) {
  return tabId === AI_CONVERSATION_TAB_ID || tabId === NOTES_WORKSPACE_TAB_ID;
}


// Optional workspace views are acquired when first requested; working data stays in App.
const ResearchEvidenceReviewDialog=createDeferredView<ComponentProps<typeof ResearchEvidenceReviewDialogView>>(()=>import("../features/research/ResearchEvidenceReviewDialog").then(m=>({default:m.ResearchEvidenceReviewDialog})),"Preparando revisión de fuentes…","No se pudo cargar esta vista. El trabajo se conserva; puedes volver a intentarlo.");
const AssetCatalogDialog=createDeferredView<ComponentProps<typeof AssetCatalogDialogView>>(()=>import("../features/assets/AssetCatalogDialog").then(m=>({default:m.AssetCatalogDialog})),"Preparando biblioteca de recursos…","No se pudo cargar esta vista. El trabajo se conserva; puedes volver a intentarlo.");
const MeetingMinutesDialog=createDeferredView<ComponentProps<typeof MeetingMinutesDialogView>>(()=>import("../features/meetings/MeetingMinutesDialog").then(m=>({default:m.MeetingMinutesDialog})),"Preparando acta…","No se pudo cargar esta vista. El trabajo se conserva; puedes volver a intentarlo.");
const ProjectTransferDialog=createDeferredView<ComponentProps<typeof ProjectTransferDialogView>>(()=>import("../features/projects/ProjectTransferDialog").then(m=>({default:m.ProjectTransferDialog})),"Preparando transferencia…","No se pudo cargar esta vista. El trabajo se conserva; puedes volver a intentarlo.");
const ProjectTemplateCatalogDialog=createDeferredView<ComponentProps<typeof ProjectTemplateCatalogDialogView>>(()=>import("../features/projects/ProjectTemplateCatalogDialog").then(m=>({default:m.ProjectTemplateCatalogDialog})),"Preparando plantillas…","No se pudo cargar esta vista. El trabajo se conserva; puedes volver a intentarlo.");
const AppSettingsDialog=createDeferredView<ComponentProps<typeof AppSettingsDialogView>>(()=>import("../features/settings/AppSettingsDialog").then(m=>({default:m.AppSettingsDialog})),"Preparando configuración…","No se pudo cargar la configuración. Los valores guardados se conservan.",props=>props.open);

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const projectLocationReview=useProjectLocationReview(activeProject?.id??null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ isAuthenticated: false, provider: null, user: null, scopes: [] });
  const [projectCapabilities, setProjectCapabilities] = useState<ProjectCapabilities | null>(null);
  const [versioningStatus, setVersioningStatus] = useState<ProjectVersioningStatus | null>(null);
  const [recordingPanel, setRecordingPanel] = useState(false);
  const [researchEvidenceReview,setResearchEvidenceReview]=useState<{projectId:string;projectName:string;jobId:string}|null>(null);
  useEffect(()=>setResearchEvidenceReview(null),[activeProject?.id]);
  const [assetCatalogOpen,setAssetCatalogOpen]=useState(false);
  const assetMoveReview=useAssetMoveReview(activeProject?.id??null);
  const [meetingMinutes,setMeetingMinutes]=useState<{projectId:string;sessionId:string}|null>(null);
  const ocrDraftWrites=useRef(new Set<string>());
  const ocrPendingAcks=useRef(new Map<string,{attemptId:string;submitted:HandwrittenNoteSession;epoch:number}>());
  useEffect(()=>{
    const open=()=>setRecordingPanel(true);
    window.addEventListener("knownext-open-recordings",open);
    const bridge=(window as Window & {KnownextRecordingIntent?: {consumeRecordingIntent:()=>boolean}}).KnownextRecordingIntent;
    if(bridge?.consumeRecordingIntent()) open();
    return ()=>window.removeEventListener("knownext-open-recordings",open);
  },[]);

  const [pendingRecordingDocument,setPendingRecordingDocument]=useState<{id:string;projectId:string}|null>(null);
  const [recordingNotice,setRecordingNotice]=useState<{id:string}|null>(null);
  const exportInFlight=useRef(false);
  const [exportProgress,setExportProgress]=useState<string|null>(null);
  const [exportedFileNotice,setExportedFileNotice]=useState<{exportId:string;fileName:string}|null>(null);
  const [exportOpening,setExportOpening]=useState(false);
  const [templateCapture, setTemplateCapture] = useState<{ name: string; markdown: string;documentId:string } | null>(null);
  const [recordingDestination, setRecordingDestination] = useState<RecordingDestination | null>(null);
  const [tree, setTree] = useState<DocumentTreeNode[]>([]);
  const [treeReadIssue,setTreeReadIssue]=useState<{projectId:string;message:string}|null>(null);
  const [treeReadBusy,setTreeReadBusy]=useState(false);
  const treeReadSequence=useRef(0);
  const treeReadPending=useRef<{projectId:string;epoch:number;sequence:number}|null>(null);
  const [tabs, setTabs] = useState<OpenDocumentTab[]>(defaultProjectTabsConfig.openTabs);
  const [activeDocumentId, setActiveDocumentId] = useState(defaultProjectTabsConfig.activeDocumentId);
  const [handwrittenTabs, setHandwrittenTabs] = useState<OpenDocumentTab[]>(defaultProjectTabsConfig.openHandwrittenTabs ?? []);
  const [handwrittenPageFocus,setHandwrittenPageFocus]=useState<HandwrittenPageFocus|null>(null);
  const handwrittenPageFocusSequence=useRef(0);
  const [activeHandwrittenNoteId, setActiveHandwrittenNoteId] = useState(defaultProjectTabsConfig.activeHandwrittenNoteId ?? "");
  const [activeTreeNodeId, setActiveTreeNodeId] = useState(defaultProjectTabsConfig.activeDocumentId);
  const [imageTabs, setImageTabs] = useState<Array<{ id: string; name: string; path: string }>>([]);
  const [activeImageId, setActiveImageId] = useState("");
  const [referenceDocumentTabs, setReferenceDocumentTabs] = useState<Array<{ id: string; name: string; path: string; format: "pdf" | "docx" | "xlsx";pageFocus?:{pageNumber:number;requestId:number} }>>([]);
  const referencePageFocusSequence=useRef(0);
  const [activeReferenceDocumentId, setActiveReferenceDocumentId] = useState("");
  const [workspaceTabOrder, setWorkspaceTabOrder] = useState<string[]>([]);
  const [documentSessions, setDocumentSessions] = useState<Record<string, DocumentSession>>({});
  const [handwrittenSessions, setHandwrittenSessions] = useState<Record<string, HandwrittenNoteSession>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [createDocumentOpen, setCreateDocumentOpen] = useState(false);
  const [createDocumentParentId, setCreateDocumentParentId] = useState<string | null>(null);
  const [createDocumentInitialKind, setCreateDocumentInitialKind] = useState<CreateDocumentRequest["kind"]>("document");
  const [moveNode, setMoveNode] = useState<DocumentTreeNode | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [projectTransferMode, setProjectTransferMode] = useState<ProjectTransferMode | null>(null);
  const [expectedBackupTransferId,setExpectedBackupTransferId]=useState<string|undefined>();
  const [projectTemplateCatalog,setProjectTemplateCatalog]=useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [retiredProjectsOpen,setRetiredProjectsOpen]=useState(false);
  const retiredProjectsFocus=useRef<(()=>HTMLElement|null)|null>(null);
  const aiChangeJournal=useRef(new AiChangeJournal());
  const aiEditorJournalAcks=useRef(new Set<string>());
  const aiTrackedOperationEpochs=useRef(new Map<string,{projectId:string;epoch:number}>());
  const [aiChangeHistoryOpen,setAiChangeHistoryOpen]=useState(false);
  const [projectReplaceOpen,setProjectReplaceOpen]=useState(false);
  const liveEditorSnapshots=useRef(new Map<string,MarkdownEditorController>());
  const registerLiveEditor=useCallback((id:string,controller:MarkdownEditorController|null,released?:MarkdownEditorController|null)=>{
    registerEditorSnapshot(liveEditorSnapshots.current,id,controller,released);
  },[]);
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>(defaultLayoutConfig);
  const [appearanceConfig, setAppearanceConfig] = useState<AppearanceConfig>(defaultAppearanceConfig);
  const [diagnosticsConfig, setDiagnosticsConfig] = useState<DiagnosticsConfig>(defaultDiagnosticsConfig);
  const [handwrittenConfig, setHandwrittenConfig] = useState<HandwrittenConfig>(defaultHandwrittenConfig);
  const [exportTemplateConfig, setExportTemplateConfig] = useState<ExportTemplateConfig>(defaultExportTemplateConfig);
  const [exportTemplatePath, setExportTemplatePath] = useState("");
  const exportTemplateConfigRef = useRef(exportTemplateConfig);
  useEffect(() => { exportTemplateConfigRef.current = exportTemplateConfig; }, [exportTemplateConfig]);
  const [exportResetting, setExportResetting] = useState(false);
  const exportResetPending = useRef(false);
  const [aiConfig, setAiConfig] = useState<AiConfigStatus>({ ...defaultAiConfig, openaiKeyConfigured: false, openaiKeyPreview: null });
  const aiConfigRef = useRef(aiConfig);
  const aiRefreshSequence = useRef(0);
  const credentialRevision = useRef(0);
  const activeAiProjectRef = useRef(activeProject?.id);
  activeAiProjectRef.current = activeProject?.id;
  const aiWorkspaceEpoch = useRef({ projectId: activeProject?.id, value: 0 });
  if (aiWorkspaceEpoch.current.projectId !== activeProject?.id) aiWorkspaceEpoch.current = { projectId: activeProject?.id, value: aiWorkspaceEpoch.current.value + 1 };
  const historicalCopyRenderEpoch=aiWorkspaceEpoch.current.value;
  useEffect(() => { aiConfigRef.current = aiConfig; }, [aiConfig]);
  const [aiConversationEvents, setAiConversationEvents] = useState<AiConversationEvent[]>([]);
  const [aiContextSources, setAiContextSources] = useState<AiContextSource[]>([]);
  const [removingAiContextSourceIds, setRemovingAiContextSourceIds] = useState<Set<string>>(() => new Set());
  const [aiIndexStatus, setAiIndexStatus] = useState<AiIndexStatusResponse | null>(null);
  const aiIndexMaintenance = useAiIndexMaintenance({
    projectId: activeProject?.id,
    projectEpoch: aiWorkspaceEpoch.current.value,
    index: aiIndexStatus,
    onResult: setAiIndexStatus,
    refresh: refreshAiState,
    onError: (cause, fallback) => showError(cause, fallback, {source: "app.aiIndex"}),
  });
  const [aiUsageSummary, setAiUsageSummary] = useState<AiUsageSummaryResponse | null>(null);
  const [aiPendingDelete, setAiPendingDelete] = useState<AiPendingDelete | null>(null);
  const [aiPendingIntent, setAiPendingIntent] = useState<AiPendingIntent | null>(null);
  const [aiEditProposal, setAiEditProposal] = useState<AiEditProposal | null>(null);
  const [autoApplyingAiEditProposalId, setAutoApplyingAiEditProposalId] = useState<string | null>(null);
  const [applyingAiEditProposalId, setApplyingAiEditProposalId] = useState<string | null>(null);
  const aiProposalExecution = useRef(new AiProposalExecution());
  const aiEditorOperationTimers = useRef(new Map<string, number>());
  useEffect(() => () => { for (const timer of aiEditorOperationTimers.current.values()) window.clearTimeout(timer); }, []);
  const [blockedAiEditOperationReasons, setBlockedAiEditOperationReasons] = useState<Record<string, AiMarkdownOperationReviewReason>>({});
  const [appliedAiEditOperationIds, setAppliedAiEditOperationIds] = useState<string[]>([]);
  const [aiBubble, setAiBubble] = useState<{ id: string; answer: string; usedSkills?: string[]; skillApplications?: AiSkillApplication[]; skillDiagnostics?: AiSkillDiagnostic[] } | null>(null);
  const [aiAppliedChange, setAiAppliedChange] = useState<{ documentId: string; summary: string } | null>(null);
  const [aiSelectionFocus, setAiSelectionFocus] = useState<AiSelectionFocus | null>(null);
  const [aiResearchBrief, setAiResearchBrief] = useState<AiResearchBrief | null>(null);
  const [aiResearchJob, setAiResearchJob] = useState<AiResearchJob | null>(null);
  const [aiResearchJobs, setAiResearchJobs] = useState<AiResearchJob[]>([]);
  const [aiResearchContextSourceIds, setAiResearchContextSourceIds] = useState<string[]>([]);
  const [aiResearchActiveMarkdown, setAiResearchActiveMarkdown] = useState("");
  const openedResearchDocumentIdsRef = useRef<Set<string>>(new Set());
  const [pendingEditorOperations, setPendingEditorOperations] = useState<MarkdownEditorExternalOperation[]>([]);
  const [tabsByProject, setTabsByProject] = useState<Record<string, ProjectTabsConfig>>({});
  const [treeOpenPathsByProject, setTreeOpenPathsByProject] = useState<TreeOpenPathsByProject>({});
  const [openUtilityTabs, setOpenUtilityTabs] = useState<AppUtilityTabId[]>([]);
  const [activeUtilityTab, setActiveUtilityTab] = useState<AppUtilityTabId | null>(null);
  const [notesMarkdown, setNotesMarkdown] = useState("");
  const [notesSavedMarkdown, setNotesSavedMarkdown] = useState("");
  const [notesUpdatedAt, setNotesUpdatedAt] = useState<string | null>(null);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesSaveState, setNotesSaveState] = useState<NotesSaveState>("idle");
  const [notesLoadVersion, setNotesLoadVersion] = useState(0);
  const [lastRunAppVersion, setLastRunAppVersion] = useState<string | null>(null);
  const [lastSeenReleaseNotesVersion, setLastSeenReleaseNotesVersion] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [criticalTransitionBusy,setCriticalTransitionBusy]=useState(false);
  const [updateProtection,setUpdateProtection]=useState<"protecting"|"installer-open"|null>(null);
  const updateRestartToken=useRef<string|null>(null);
  const updateInstallBusy=useRef(false);
  const [exitProtection,setExitProtection]=useState(false);
  useEffect(()=>{if(configLoaded)setCriticalTransitionBusy(false);},[configLoaded]);
  const [configPersistenceAvailable, setConfigPersistenceAvailable] = useState(true);
  const settingsPersistence = useSettingsPersistence();
  const {save: saveSettings, stage: stageSettings} = settingsPersistence;
  const {state: appSettingsSaveState, message: appSettingsSaveMessage} = settingsSaveSummary(settingsPersistence.states, appearanceConfig.language);
  const [notice, setNotice] = useState<AppNotice | null>(null);
  useAiBudgetNotice(message=>setNotice({title:"Presupuesto de IA",message,tone:"info"}));
  const [startupRetrySequence, setStartupRetrySequence] = useState(0);
  const [localRuntimeRecoveryOpen, setLocalRuntimeRecoveryOpen] = useState(false);
  const [localRuntimeRecoveryError, setLocalRuntimeRecoveryError] = useState<string | null>(null);
  const [closeDocumentId, setCloseDocumentId] = useState<string | null>(null);
  const [pendingCloseDocumentIds, setPendingCloseDocumentIds] = useState<string[]>([]);
  const [orphanDrafts, setOrphanDrafts] = useState<OrphanDraft[]>([]);
  const [orphanCoverage,setOrphanCoverage]=useState({limited:false,warnings:[] as string[]});
  const orphanReviewSequence=useRef(0);
  const [recoverableDraftsOpen, setRecoverableDraftsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [fileBatch, setFileBatch] = useState<{ projectId: string; action: FileBatchAction; nodeIds: string[];initialTargetFolderId?:string|null;workspaceEpoch:number } | null>(null);
  const fileBatchRef=useRef(fileBatch);fileBatchRef.current=fileBatch;
  const [settingsInitialSection, setSettingsInitialSection] = useState<AppSettingsSection>("summary");
  const [traceLogStatus, setTraceLogStatus] = useState<TraceLogStatus | null>(null);
  const [runtimeServicesStatus, setRuntimeServicesStatus] = useState<RuntimeServicesStatus | null>(null);
  const [runtimeServicesRefreshing, setRuntimeServicesRefreshing] = useState(false);
  const runtimeServiceSilentFailuresRef = useRef(0);
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateProgress, setUpdateProgress] = useState<UpdateDownloadProgress | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [githubLoginOpen, setGithubLoginOpen] = useState(false);
  const [githubLoginState, setGithubLoginState] = useState<GithubLoginState>("idle");
  const [githubDevice, setGithubDevice] = useState<GithubDeviceStartResponse | null>(null);
  const [githubLoginError, setGithubLoginError] = useState<string | null>(null);
  const [githubLoginPolling, setGithubLoginPolling] = useState(false);
  const [githubRepositories, setGithubRepositories] = useState<GithubRepositorySummary[]>([]);
  const [githubRepositoriesLoading, setGithubRepositoriesLoading] = useState(false);
  const [syncState, setSyncState] = useState<"idle" | "pulling" | "pushing">("idle");
  const [externalChangeSet, setExternalChangeSet] = useState<ExternalChangeSet | null>(null);
  const [externalChangeDecisions, setExternalChangeDecisions] = useState<Record<string, ExternalChangeDecision>>({});
  const [externalChangesOpen, setExternalChangesOpen] = useState(false);
  const projectWork = useProjectWork(activeProject?.id);
  const externalChangesBusy = projectWork.isBusy(activeProject?.id);
  const [projectSyncState, setProjectSyncState] = useState<ProjectSyncState>("synced");
  const [projectSyncStatus, setProjectSyncStatus] = useState<ProjectSyncStatus | null>(null);
  const [projectActivity, setProjectActivity] = useState<ActivityEvent[]>([]);
  const [externalChangesMessage, setExternalChangesMessage] = useState<string | null>(null);
  const [fileSyncOverview, setFileSyncOverview] = useState<ProjectFileSyncOverview | null>(null);
  const [fileSyncOverviewError, setFileSyncOverviewError] = useState<string | null>(null);
  const [acknowledgedExternalChangeSets, setAcknowledgedExternalChangeSets] = useState<Record<string, string[]>>(readAcknowledgedExternalChangeSets);
  const [protectionProjectId,setProtectionProjectId]=useState(activeProject?.id);
  if(protectionProjectId!==activeProject?.id){
    // Clear a previous project's view before React commits children for the new project.
    setProtectionProjectId(activeProject?.id);setSyncState("idle");setVersioningStatus(null);
    setExternalChangeSet(null);setExternalChangeDecisions({});setExternalChangesOpen(false);
    setProjectSyncState("synced");setProjectSyncStatus(null);setProjectActivity([]);
    setExternalChangesMessage(null);setFileSyncOverview(null);setFileSyncOverviewError(null);
  }
  const [documentSyncStatuses, setDocumentSyncStatuses] = useState<Record<string, DocumentSyncStatus>>({});
  const [documentPostSaveSyncStates, setDocumentPostSaveSyncStates] = useState<Record<string, DocumentPostSaveSyncEntry>>({});
  const [documentFooterDialog, setDocumentFooterDialog] = useState<DocumentFooterDialog | null>(null);
  const [documentMerge,setDocumentMerge]=useState<{id:string;projectId:string;expected:DocumentSession;historyVersionId?:string;remote?:boolean;review:DocumentConflictReview|null;loading:boolean;busy:boolean;error:string;attemptPayload?:DocumentConflictApply&{attemptId:string};checkingAttempt?:boolean}|null>(null);
  const documentMergeWork=useRef(false),documentMergeEpoch=useRef(0);
  const [handwrittenMerge,setHandwrittenMerge]=useState<{id:string;projectId:string;expected:HandwrittenNoteSession;review:HandwrittenConflictReview|null;loading:boolean;busy:boolean;error:string;attemptPayload?:HandwrittenConflictApply&{attemptId:string};checkingAttempt?:boolean}|null>(null);
  const handwrittenMergeWork=useRef(false),handwrittenMergeEpoch=useRef(0);
  const lastTraceLogRef = useRef<{ fingerprint: string; timestamp: number } | null>(null);
  const githubAuthEpochRef=useRef(0);
  const githubLoginPollingRef = useRef(false);
  const lastDocumentContextRef = useRef<{ id: string | null; path: string | null }>({ id: null, path: null });
  const documentSessionsRef = useRef(documentSessions);
  const imageInsertionWork=useRef(new Set<string>());
  const handwrittenSessionsRef = useRef(handwrittenSessions);
  const notesMarkdownRef = useRef(notesMarkdown); notesMarkdownRef.current = notesMarkdown;
  const notesSavedMarkdownRef=useRef(notesSavedMarkdown);notesSavedMarkdownRef.current=notesSavedMarkdown;
  const notesLoadedRef=useRef(notesLoaded);notesLoadedRef.current=notesLoaded;
  const workspaceEditRevision=useRef(0);
  useEffect(()=>{
    if(!pendingRecordingDocument||!configLoaded||criticalTransitionBusy)return;
    if(activeProject?.id===pendingRecordingDocument.projectId){void handleOpenDocument(pendingRecordingDocument.id,pendingRecordingDocument.id.split("/").pop()??"Documento de reunión");setPendingRecordingDocument(null);setRecordingPanel(false);return;}
    const target=projects.find(p=>p.id===pendingRecordingDocument.projectId);
    if(target)void handleSelectProject(target);else{setPendingRecordingDocument(null);showError(new Error("El proyecto del documento ya no está disponible"),"No se pudo abrir el acta");}
  },[pendingRecordingDocument,activeProject?.id,projects,configLoaded,criticalTransitionBusy]);

  const aiResultReview = useAiResultReview(configLoaded);
  const [aiResultReviewOpen, setAiResultReviewOpen] = useState(false);
  const deferredAiResultIds = useRef(new Set<string>());
  const aiProposalRequests = useRef(new Map<string, { request: AiRequestSnapshot; response: AiInteractionResponse }>());
  const sessionLoadSequence = useRef(0);
  const documentLoads = useRef(new Map<string, number>());
  const handwrittenLoads = useRef(new Map<string, number>());
  const draftDiscardInFlightRef = useRef<Set<string>>(new Set());
  const handwrittenDraftDiscardInFlightRef = useRef<Set<string>>(new Set());
  const externalChangesLastCheckRef = useRef(0);
  const projectSyncLastCheckRef = useRef(0);
  const documentPostSaveSyncSequenceRef = useRef(0);
  const pendingSaveIds = useRef(new Set<string>());
  const sessionWrites = useRef(new SessionWriteQueue());
  const localEditProtection = useRef(new LocalEditProtection());
  const [draftReviewBusy,setDraftReviewBusy]=useState<string|null>(null);
  const [lastProtectedCopy,setLastProtectedCopy]=useState<RecoveryCopy|null>(null);
  const resolvedTheme = useResolvedAppearanceTheme(appearanceConfig.themeMode);

  useEffect(() => {
    documentSessionsRef.current = documentSessions;
  }, [documentSessions]);

  useEffect(() => {
    handwrittenSessionsRef.current = handwrittenSessions;
  }, [handwrittenSessions]);

  useEffect(() => {
    void (async () => {
      const localPreferences = readLocalAppPreferences();
      try {
        await waitForApiReady();
        const [projectList, appConfig, auth, capabilities, loadedAiConfig, loadedExportTemplate, loadedExportTemplatePath, loadedAiUsageSummary, loadedNotes] = await Promise.all([
          listProjects(),
          getAppConfig(),
          getAuthStatus(),
          getProjectCapabilities(),
          getAiConfig(),
          getExportTemplate(),
          getExportTemplatePath(),
          loadAiUsageSummary("app.startup.aiUsageSummary"),
          getUserNotes(),
        ]);
        const active = projectList.find((project) => project.active) ?? projectList[0];
        let projectTree: DocumentTreeNode[] = [];
        let startupTreeIssue:string|null=null;
        let activeVersioningStatus: ProjectVersioningStatus | null = null;
        let activeSyncStatus: ProjectSyncStatus | null = null;
        if (active) {
          try {
            projectTree = await getProjectTree(active.id);
          } catch (error) {
            startupTreeIssue=getApiErrorMessage(error,"No se pudo leer la estructura del proyecto.");
            void recordTraceLog({
              source: "app.startup.tree",
              message: "No se pudo cargar el árbol del proyecto activo durante el arranque.",
              detail: describeError(error),
            });
          }
          try {
            activeVersioningStatus = await getProjectVersioningStatus(active.id);
          } catch (error) {
            void recordTraceLog({
              source: "app.startup.versioningStatus",
              message: "No se pudo cargar el estado de versionado durante el arranque.",
              detail: describeError(error),
            });
          }
          try {
            activeSyncStatus = await getProjectSyncStatus(active.id);
          } catch (error) {
            void recordTraceLog({
              source: "app.startup.syncStatus",
              message: "No se pudo cargar el estado de sincronización durante el arranque.",
              detail: describeError(error),
            });
          }
        }
        if (active) {
          projectTree = applyTreeOpenState(projectTree, {
            openPaths: appConfig.treeOpenPathsByProject[active.id] ?? [],
          });
        }
        const activeProjectTabs = active
          ? resolveProjectTabs(appConfig.tabsByProject, active.id, projectTree,!startupTreeIssue)
          : { ...defaultProjectTabsConfig };
        const shouldOpenReleaseNotes = shouldOpenReleaseNotesAfterStartup(appConfig, APP_VERSION);
        const nextOpenUtilityTabs = shouldOpenReleaseNotes
          ? ensureReleaseNotesTab(appConfig.openUtilityTabs)
          : appConfig.openUtilityTabs;
        setProjects(projectList);
        setActiveProject(active ?? null);
        setAuthStatus(auth);
        setProjectCapabilities(capabilities);
        setVersioningStatus(activeVersioningStatus);
        setProjectSyncStatus(activeSyncStatus);
        if (activeSyncStatus) setProjectSyncState(activeSyncStatus.state);
        setTree(projectTree);
        setTreeReadIssue(active&&startupTreeIssue?{projectId:active.id,message:startupTreeIssue}:null);
        setLayoutConfig(appConfig.layout);
        setAppearanceConfig(appConfig.appearance ?? defaultAppearanceConfig);
        setDiagnosticsConfig(appConfig.diagnostics ?? defaultDiagnosticsConfig);
        setHandwrittenConfig(appConfig.handwritten ?? defaultHandwrittenConfig);
        setExportTemplateConfig(loadedExportTemplate);
        setExportTemplatePath(loadedExportTemplatePath);
        setAiConfig(loadedAiConfig);
        setAiUsageSummary(loadedAiUsageSummary);
        setNotesMarkdown(loadedNotes.markdown);
        setNotesSavedMarkdown(loadedNotes.markdown);
        setNotesUpdatedAt(loadedNotes.updatedAt);
        setNotesLoaded(true);
        setNotesSaveState("idle");
        setConfigPersistenceAvailable(true);
        setTabsByProject(appConfig.tabsByProject);
        setTreeOpenPathsByProject(appConfig.treeOpenPathsByProject);
        setOpenUtilityTabs(nextOpenUtilityTabs);
        setActiveUtilityTab(shouldOpenReleaseNotes ? RELEASE_NOTES_UTILITY_TAB_ID : appConfig.activeUtilityTab ?? null);
        setLastRunAppVersion(APP_VERSION);
        setLastSeenReleaseNotesVersion(appConfig.lastSeenReleaseNotesVersion ?? null);
        setTabs(activeProjectTabs.openTabs);
        setActiveDocumentId(activeProjectTabs.activeDocumentId);
        setHandwrittenTabs(activeProjectTabs.openHandwrittenTabs ?? []);
        setActiveHandwrittenNoteId(activeProjectTabs.activeHandwrittenNoteId ?? "");
        setActiveTreeNodeId(activeProjectTabs.activeWorkspaceTabId || activeProjectTabs.activeHandwrittenNoteId || activeProjectTabs.activeDocumentId);
        setLocalRuntimeRecoveryOpen(false);
        setLocalRuntimeRecoveryError(null);
      } catch (error) {
        const startupMessage = getApiErrorMessage(error, "La aplicación no pudo cargar la configuración inicial.");
        void recordTraceLog({
          source: "app.startup",
          message: startupMessage,
          detail: describeError(error),
        });
        setLocalRuntimeRecoveryOpen(true);
        setLocalRuntimeRecoveryError(startupMessage);
        // Recovery owns this error; a floating duplicate obscures its heading.
        setNotice(null);
        setProjects([]);
        setActiveProject(null);
        setVersioningStatus(null);
        setProjectSyncStatus(null);
        setTree([]);
        setTabs([]);
        setActiveDocumentId("");
        setHandwrittenTabs([]);
        setActiveHandwrittenNoteId("");
        setActiveTreeNodeId("");
        setAppearanceConfig(localPreferences.appearance ?? defaultAppearanceConfig);
        setDiagnosticsConfig(localPreferences.diagnostics ?? defaultDiagnosticsConfig);
        setHandwrittenConfig(localPreferences.handwritten ?? defaultHandwrittenConfig);
        setExportTemplateConfig(defaultExportTemplateConfig);
        setExportTemplatePath("");
        setAiConfig({ ...(localPreferences.ai ?? defaultAiConfig), openaiKeyConfigured: false, openaiKeyPreview: null });
        setAiUsageSummary(null);
        setConfigPersistenceAvailable(false);
        setTreeOpenPathsByProject({});
        setOpenUtilityTabs([]);
        setActiveUtilityTab(null);
        setNotesMarkdown("");
        setNotesSavedMarkdown("");
        setNotesUpdatedAt(null);
        setNotesLoaded(true);
        setNotesSaveState("error");
      } finally {
        setConfigLoaded(true);
      }
    })();
  }, [startupRetrySequence]);

  useEffect(() => {
    if (!configLoaded) return;
    stageSettings("app");
    const timeout = window.setTimeout(() => {
      const preferences = {appearance: appearanceConfig, diagnostics: diagnosticsConfig, handwritten: handwrittenConfig};
      if (!configPersistenceAvailable) {
        void saveSettings("app", "configuration", async () => {
          if (!cacheLocalAppPreferences(preferences)) throw new Error("No se pudieron guardar las preferencias locales. Se mantienen los cambios en esta sesión.");
        }, () => {});
        return;
      }
      cacheLocalAppPreferences(preferences);
      void saveSettings("app", "configuration", () => updateAppConfig({
        layout: layoutConfig, appearance: appearanceConfig, diagnostics: diagnosticsConfig,
        handwritten: handwrittenConfig, tabsByProject, treeOpenPathsByProject,
        lastRunAppVersion, lastSeenReleaseNotesVersion, openUtilityTabs, activeUtilityTab,
      }), () => {});
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [activeUtilityTab, appearanceConfig, configLoaded, configPersistenceAvailable, diagnosticsConfig,
    handwrittenConfig, lastRunAppVersion, lastSeenReleaseNotesVersion, layoutConfig, openUtilityTabs,
    tabsByProject, treeOpenPathsByProject, saveSettings, stageSettings]);

  useEffect(() => {
    if (!configLoaded) return;
    cacheLocalAppPreferences({ ai: aiConfig });
  }, [aiConfig, configLoaded]);

  useEffect(() => {
    document.documentElement.lang = appearanceConfig.language;
    document.documentElement.style.setProperty("zoom", `${appearanceConfig.zoomPercent}%`);
    applyAppearanceAttributes(appearanceConfig, resolvedTheme);
  }, [appearanceConfig, resolvedTheme]);

  useEffect(() => {
    if (!configLoaded || !diagnosticsConfig.traceLoggingEnabled) {
      setTraceLogStatus(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      void refreshTraceLogStatus();
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [configLoaded, diagnosticsConfig.traceLoggingEnabled]);

  useEffect(() => {
    if (!configLoaded || !appSettingsOpen) return;

    void refreshRuntimeServiceStatus();
    const interval = window.setInterval(() => {
      void refreshRuntimeServiceStatus({ silent: true });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [configLoaded, appSettingsOpen]);

  useEffect(() => {
    if (!configLoaded || !diagnosticsConfig.traceLoggingEnabled) return;

    function handleUnhandledError(event: ErrorEvent) {
      void recordTraceLog({
        source: "window.onerror",
        message: event.message || "Error no controlado en la interfaz.",
        detail: event.error instanceof Error ? event.error.stack ?? event.error.message : String(event.error ?? ""),
      });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      void recordTraceLog({
        source: "window.unhandledrejection",
        message: "Promesa rechazada sin gestionar en la interfaz.",
        detail: event.reason instanceof Error ? event.reason.stack ?? event.reason.message : String(event.reason ?? ""),
      });
    }

    window.addEventListener("error", handleUnhandledError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleUnhandledError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [configLoaded, diagnosticsConfig.traceLoggingEnabled]);

  useEffect(() => {
    if (!configLoaded || !activeProject) return;
    void refreshProjectCapabilityState(activeProject.id);
  }, [authStatus.isAuthenticated, activeProject?.id, configLoaded]);

  useEffect(() => {
    if (!configLoaded || !activeProject) {
      setExternalChangeSet(null);
      setExternalChangeDecisions({});
      setProjectSyncState("synced");
      setProjectSyncStatus(null);
      setProjectActivity([]);
      setFileSyncOverview(null);
      setFileSyncOverviewError(null);
      return;
    }
    if (externalChangesBusy) return;
    externalChangesLastCheckRef.current = 0;
    const check = () => {
      const now = Date.now();
      if (now - externalChangesLastCheckRef.current < 55_000) return;
      externalChangesLastCheckRef.current = now;
      if (!activeProject.isGitRepository) {
        void handleReloadProjectTree(activeProject.id);
        return;
      }
      void refreshExternalChangeSet(activeProject.id, { refreshTreeOnChanges: true, silent: true });
    };
    const startupTimeout = window.setTimeout(check, 1200);
    const interval = window.setInterval(() => {
      check();
    }, 60_000);
    return () => {
      window.clearTimeout(startupTimeout);
      window.clearInterval(interval);
    };
  }, [activeProject?.id, activeProject?.isGitRepository, acknowledgedExternalChangeSets, configLoaded, externalChangesBusy]);

  useEffect(() => {
    if (!configLoaded || !activeProject) return;
    const projectId=activeProject.id;
    const changed=(event:Event)=>{
      const detail=(event as CustomEvent<{projectId?:unknown}>).detail;
      if(detail?.projectId!==projectId||activeAiProjectRef.current!==projectId)return;
      void handleReloadProjectTree(projectId);
      void checkOpenDocumentSync({silent:true});
    };
    window.addEventListener(PROTON_WORKSPACE_CHANGED_EVENT,changed);
    return()=>window.removeEventListener(PROTON_WORKSPACE_CHANGED_EVENT,changed);
  }, [activeProject?.id, configLoaded]);

  useEffect(() => {
    if (!configLoaded || !activeProject) {
      setProjectActivity([]);
      return;
    }
    void refreshProjectActivity(activeProject.id);
  }, [activeProject?.id, configLoaded]);

  useEffect(() => {
    if (!configLoaded || !activeProject) return;
    projectSyncLastCheckRef.current = 0;
    const check = () => {
      const now = Date.now();
      const remotePaused = Boolean(projectSyncStatus?.remotePaused);
      const minInterval = remotePaused ? 5 * 60_000 : 45_000;
      if (now - projectSyncLastCheckRef.current < minInterval) return;
      projectSyncLastCheckRef.current = now;
      void refreshProjectSyncStatus(activeProject.id, { autoRun: isAutomaticSyncMode(activeProject.syncMode), silent: true });
    };
    const startupTimeout = window.setTimeout(check, 1800);
    const interval = window.setInterval(() => {
      check();
    }, 45000);
    return () => {
      window.clearTimeout(startupTimeout);
      window.clearInterval(interval);
    };
  }, [activeProject?.id, activeProject?.syncMode, authStatus.isAuthenticated, configLoaded, projectSyncStatus?.remotePaused]);

  useEffect(() => {
    if (!configLoaded || !activeProject) {
      setAiConversationEvents([]);
      setAiContextSources([]);
      setAiResearchJobs([]);
      setAiResearchJob(null);
      setRemovingAiContextSourceIds(new Set());
      setAiIndexStatus(null);
      return;
    }
    setRemovingAiContextSourceIds(new Set());
    void refreshAiState(activeProject.id);
    void refreshAiResearchJobs(activeProject.id);
  }, [activeProject?.id, configLoaded]);

  useEffect(() => {
    if (!activeProject || !aiResearchJob || isAiResearchTerminalStatus(aiResearchJob.status)) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const job = await getAiResearchJob(activeProject.id, aiResearchJob.id);
        if (cancelled) return;
        setAiResearchJob(job);
        setAiResearchJobs((current) => upsertAiResearchJob(current, job));
        if (isAiResearchTerminalStatus(job.status)) {
          handleResearchJobSettled(job);
        }
      } catch {
        // Keep the last visible state; the next poll or manual action can recover.
      }
    };
    const interval = window.setInterval(() => void poll(), 1_500);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeProject?.id, aiResearchJob?.id, aiResearchJob?.status]);

  useEffect(() => {
    if (!activeProject) return;
    const interval = window.setInterval(() => {
      void refreshAiContextSources(activeProject.id, { silent: true });
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [activeProject?.id]);

  const activeWorkspaceTabIdForConfig = activeUtilityTab === RELEASE_NOTES_UTILITY_TAB_ID
    ? RELEASE_NOTES_WORKSPACE_TAB_ID
    : activeUtilityTab === NOTES_UTILITY_TAB_ID
    ? NOTES_WORKSPACE_TAB_ID
    : activeReferenceDocumentId || activeImageId || activeHandwrittenNoteId || activeDocumentId || (activeProject ? AI_CONVERSATION_TAB_ID : NOTES_WORKSPACE_TAB_ID);
  const activeWorkspaceTabIdRef = useRef(activeWorkspaceTabIdForConfig); activeWorkspaceTabIdRef.current = activeWorkspaceTabIdForConfig;

  useEffect(() => {
    if (!authStatus.isAuthenticated) {
      setGithubRepositories([]);
      return;
    }
    void refreshGithubRepositories();
  }, [authStatus.isAuthenticated]);

  useEffect(() => {
    if (!githubLoginOpen || githubLoginState !== "waiting" || !githubDevice) return;
    if (githubDevice.mock && !import.meta.env.DEV) return;

    const interval = window.setInterval(() => {
      void handlePollGithubLogin();
    }, Math.max(githubDevice.interval, 1) * 1000);

    return () => window.clearInterval(interval);
  }, [githubDevice, githubLoginOpen, githubLoginState]);

  useWorkspaceExit({freeze:()=>{checkpointPendingEditorInput();flushSync(()=>setExitProtection(true));},unfreeze:()=>setExitProtection(false),hasPendingSettings:()=> (["app","ai","export"] as const).some(domain=>settingsPersistence.hasPending(domain)),protect:()=>checkpointOpenWork(),failed:error=>showError(error,"No se pudo proteger el trabajo antes de salir. La aplicación sigue abierta.")});
  const workspaceContinuity=useWorkspaceContinuity(configLoaded&&!updateProtection&&!exitProtection,checkpointOpenWork,reconcileOpenWork,()=>workspaceEditRevision.current);

  useEffect(() => {
    if (!configLoaded || !activeProject) return;

    const activeProjectTabs = normalizeProjectTabs({
      openTabs: tabs,
      activeDocumentId,
      openHandwrittenTabs: handwrittenTabs,
      activeHandwrittenNoteId,
      activeWorkspaceTabId: activeWorkspaceTabIdForConfig,
    });

    setTabsByProject((currentTabsByProject) => {
      const currentProjectTabs = currentTabsByProject[activeProject.id];
      if (areProjectTabsEqual(currentProjectTabs, activeProjectTabs)) return currentTabsByProject;
      return {
        ...currentTabsByProject,
        [activeProject.id]: activeProjectTabs,
      };
    });
  }, [activeDocumentId, activeHandwrittenNoteId, activeProject, activeWorkspaceTabIdForConfig, configLoaded, handwrittenTabs, tabs]);

  useEffect(() => {
    if (!activeDocumentId || documentSessions[activeDocumentId]) return;
    void loadDocumentSession(activeDocumentId);
  }, [activeDocumentId, documentSessions]);

  useEffect(() => {
    if (!activeHandwrittenNoteId || handwrittenSessions[activeHandwrittenNoteId]) return;
    void loadHandwrittenNoteSession(activeHandwrittenNoteId);
  }, [activeHandwrittenNoteId, handwrittenSessions]);

  useEffect(() => {
    const activeSelectionDocumentId = activeUtilityTab === NOTES_UTILITY_TAB_ID ? NOTES_WORKSPACE_TAB_ID : activeDocumentId;
    setAiSelectionFocus((currentSelection) => (
      currentSelection && currentSelection.documentId !== activeSelectionDocumentId ? null : currentSelection
    ));
  }, [activeDocumentId, activeUtilityTab]);

  useEffect(() => {
    if (!configLoaded) return;
    void refreshOrphanDrafts();
  }, [configLoaded]);

  useEffect(() => {
    if (!configLoaded) return;

    const interval = window.setInterval(() => {
      void refreshOrphanDrafts();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [configLoaded]);

  useEffect(() => {
    const pendingDrafts = Object.entries(documentSessions).filter(([, session]) => shouldPersistDraft(session));
    if (pendingDrafts.length === 0) return;

    const timeout = window.setTimeout(() => {
      for (const [documentId, session] of pendingDrafts) {
        void persistDraft(documentId, session);
      }
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [documentSessions]);

  useEffect(() => {
    const pendingDrafts = Object.entries(handwrittenSessions).filter(([, session]) => shouldPersistHandwrittenDraft(session));
    if (pendingDrafts.length === 0) return;

    const timeout = window.setTimeout(() => {
      for (const [noteId, session] of pendingDrafts) {
        void persistHandwrittenDraft(noteId, session);
      }
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [handwrittenSessions]);

  useEffect(() => {
    const draftsToDiscard = Object.entries(documentSessions).filter(([, session]) => shouldDiscardPersistedDraft(session));
    if (draftsToDiscard.length === 0) return;

    const timeout = window.setTimeout(() => {
      for (const [documentId] of draftsToDiscard) {
        void discardPersistedDocumentDraft(documentId);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [documentSessions]);

  useEffect(() => {
    const draftsToDiscard = Object.entries(handwrittenSessions).filter(([, session]) => shouldDiscardPersistedHandwrittenDraft(session));
    if (draftsToDiscard.length === 0) return;

    const timeout = window.setTimeout(() => {
      for (const [noteId] of draftsToDiscard) {
        void discardPersistedHandwrittenDraft(noteId);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [handwrittenSessions]);

  useEffect(() => {
    if (!notesLoaded || notesMarkdown === notesSavedMarkdown) return;

    const timeout = window.setTimeout(() => {
      void persistNotes(notesMarkdown);
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [notesLoaded, notesMarkdown, notesSavedMarkdown]);

  useEffect(() => {
    if (!configLoaded) return;

    const check = () => {
      void checkOpenDocumentSync();
    };
    const interval = window.setInterval(check, 12000);

    return () => {
      window.clearInterval(interval);
    };
  }, [configLoaded, documentSessions]);

  useEffect(() => {
    if (!configLoaded) return;

    const timeout = window.setTimeout(() => {
      void handleCheckForUpdates("automatic");
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [configLoaded]);

  const fixedWorkspaceTabs = useMemo<WorkspaceTab[]>(() => [
    ...(activeProject ? [{
      kind: "ai-conversation" as const,
      id: AI_CONVERSATION_TAB_ID,
      name: "IA" as const,
      readonly: true as const,
    }] : []),
    {
      kind: "notes" as const,
      id: NOTES_WORKSPACE_TAB_ID,
      name: NOTES_TITLE,
      utilityTabId: NOTES_UTILITY_TAB_ID,
    },
  ], [activeProject]);

  const scrollableWorkspaceTabs = useMemo<WorkspaceTab[]>(() => [
    ...tabs.map((tab) => ({ ...tab, kind: "document" as const })),
    ...handwrittenTabs.map((tab) => ({ ...tab, kind: "handwritten-note" as const })),
    ...imageTabs.map((tab) => ({ ...tab, kind: "image" as const })),
    ...referenceDocumentTabs.map((tab) => ({ ...tab, kind: "reference-document" as const, readonly: true as const })),
    ...(openUtilityTabs.includes(RELEASE_NOTES_UTILITY_TAB_ID)
      ? [{
        kind: "release-notes" as const,
        id: RELEASE_NOTES_WORKSPACE_TAB_ID,
        name: "Notas de release" as const,
        utilityTabId: RELEASE_NOTES_UTILITY_TAB_ID,
        readonly: true as const,
      }]
      : []),
  ], [activeProject, handwrittenTabs, imageTabs, openUtilityTabs, referenceDocumentTabs, tabs]);

  useEffect(() => {
    const visibleTabIds = scrollableWorkspaceTabs.map((tab) => tab.id);
    setWorkspaceTabOrder((currentOrder) => normalizeWorkspaceTabOrder(currentOrder, visibleTabIds));
  }, [scrollableWorkspaceTabs]);

  const orderedScrollableWorkspaceTabs = useMemo(
    () => orderWorkspaceTabs(scrollableWorkspaceTabs, workspaceTabOrder),
    [scrollableWorkspaceTabs, workspaceTabOrder],
  );

  const workspaceTabs = useMemo<WorkspaceTab[]>(
    () => [...fixedWorkspaceTabs, ...orderedScrollableWorkspaceTabs],
    [fixedWorkspaceTabs, orderedScrollableWorkspaceTabs],
  );
  const activeTabId = activeWorkspaceTabIdForConfig;
  const activeSession = activeDocumentId ? documentSessions[activeDocumentId] : undefined;
  const activeHandwrittenSession = activeHandwrittenNoteId ? handwrittenSessions[activeHandwrittenNoteId] : undefined;
  const activeDocumentSyncStatus = activeDocumentId ? documentSyncStatuses[activeDocumentId] ?? null : null;
  const activeDocumentPendingSaveHint = activeSession?.isDirty && activeSession.pendingSaveReason === "opened"
    ? "El documento se abrió con cambios recuperados o ajustes de formato. Guarda para aplicarlos o deshaz para mantener la versión anterior."
    : null;
  const visibleAiContextSources = useMemo(
    () => getVisibleAiContextSources(aiContextSources, removingAiContextSourceIds),
    [aiContextSources, removingAiContextSourceIds],
  );
  const promptContextSourceIds = useMemo(
    () => getPromptContextSourceIds(aiContextSources, removingAiContextSourceIds),
    [aiContextSources, removingAiContextSourceIds],
  );
  const staleAiEditOperationIds = useMemo(
    () => getStaleAiEditOperationIds(aiEditProposal, documentSessions, notesMarkdown).filter(id => !appliedAiEditOperationIds.includes(id)),
    [aiEditProposal, documentSessions, notesMarkdown, appliedAiEditOperationIds],
  );
  const visibleAiEditProposal = useMemo(
    () => (
      aiEditProposal?.id === autoApplyingAiEditProposalId
      && staleAiEditOperationIds.length === 0
      && Object.keys(blockedAiEditOperationReasons).length === 0
        ? null
        : resolveAiProposalRecovery(aiEditProposal, aiResultReview.entries, Boolean(aiEditProposal?.recovery?.resultId && aiResultReview.wasRemoved(aiEditProposal.recovery.resultId)))
    ),
    [aiEditProposal, autoApplyingAiEditProposalId, blockedAiEditOperationReasons, staleAiEditOperationIds, aiResultReview.entries, aiResultReview.wasRemoved],
  );
  useAiProposalAutoApply(aiEditProposal, !aiConfig.agentic.confirmBeforeApplying, id => handleApplyAiEditProposal(id, undefined, true));
  useEffect(() => {
    if (!aiEditProposal || aiEditProposal.status !== "proposed" || Object.keys(blockedAiEditOperationReasons).length) return;
    if (aiEditProposal.operations.every(operation => appliedAiEditOperationIds.includes(operation.id))
      && !pendingEditorOperations.some(operation => operation.aiProposalId === aiEditProposal.id)) clearAiEditProposalState();
  }, [aiEditProposal, appliedAiEditOperationIds, pendingEditorOperations, blockedAiEditOperationReasons]);
  useEffect(() => {
    const staleProposalIds = new Set<string>();
    for (const [id, context] of aiProposalRequests.current) {
      if (context.request.projectEpoch === aiWorkspaceEpoch.current.value) continue;
      retainAiResponse(context.response, context.request, "Cambiaste de proyecto con un resultado pendiente de aplicar. Se conserva para revisión.");
      staleProposalIds.add(id); aiProposalRequests.current.delete(id);
      cancelAiProposalApplication(id);
    }
    if (staleProposalIds.size) {
      setPendingEditorOperations(current => current.filter(operation => !operation.aiProposalId || !staleProposalIds.has(operation.aiProposalId)));
      if (aiEditProposal && staleProposalIds.has(aiEditProposal.id)) clearAiEditProposalState();
    }
  }, [activeProject?.id]);
  useEffect(() => {
    if (!activeDocumentId || !activeSession?.document) return;
    lastDocumentContextRef.current = { id: activeDocumentId, path: activeSession.document.path };
  }, [activeDocumentId, activeSession?.document?.path]);
  const dirtyDocumentIds = useMemo(
    () => [
      ...Object.entries(documentSessions).filter(([, session]) => session.isDirty).map(([documentId]) => documentId),
      ...Object.entries(handwrittenSessions).filter(([, session]) => session.isDirty).map(([noteId]) => noteId),
    ],
    [documentSessions, handwrittenSessions],
  );
  const openDocumentDraftStates = useMemo(
    () => Object.entries(documentSessions)
      .map(([documentId, session]) => ({
        documentId,
        path: session.document?.path ?? "",
        name: session.document?.name ?? "Documento",
        isDirty: session.isDirty,
        hasRecoveredDraft: session.hasRecoveredDraft,
        draftUpdatedAt: session.draftUpdatedAt ?? null,
      }))
      .filter((state) => state.path && (state.isDirty || state.hasRecoveredDraft)),
    [documentSessions],
  );
  const editorSessions = useMemo(
    () => tabs.map((tab) => ({
      documentId: tab.id,
      document: documentSessions[tab.id]?.document ?? null,
      markdown: documentSessions[tab.id]?.markdown ?? "",
      editorKey: `${tab.id}-${documentSessions[tab.id]?.loadVersion ?? 0}`,
      isLoading: documentSessions[tab.id]?.isLoading ?? !documentSessions[tab.id],
      loadError: documentSessions[tab.id]?.loadError,
    })),
    [documentSessions, tabs],
  );
  const activeHandwrittenContent = activeHandwrittenSession?.content ?? null;
  const activeHandwrittenNote = activeHandwrittenSession?.note ?? null;
  const currentCreationParentId = useMemo(
    () => resolveCurrentCreationParentId(tree, activeTreeNodeId, [activeDocumentId, activeHandwrittenNoteId, activeImageId, activeReferenceDocumentId]),
    [activeDocumentId, activeHandwrittenNoteId, activeImageId, activeReferenceDocumentId, activeTreeNodeId, tree],
  );

  function persistTreeOpenState(projectId: string, nodes: DocumentTreeNode[]) {
    setTreeOpenPathsByProject((currentState) => updateTreeOpenPathsForProject(currentState, projectId, nodes));
  }

  function setProjectTree(
    projectId: string,
    nextTree: DocumentTreeNode[],
    options: { currentTree?: DocumentTreeNode[]; additionalOpenPaths?: string[]; persist?: boolean } = {},
  ) {
    ++treeReadSequence.current;
    setNotice(current=>current?.treeProjectId===projectId?null:current);
    setTreeReadIssue(current=>current?.projectId===projectId?null:current);
    setTree((currentTree) => {
      const restoredTree = applyTreeOpenState(nextTree, {
        currentTree: options.currentTree ?? currentTree,
        openPaths: treeOpenPathsByProject[projectId] ?? [],
        additionalOpenPaths: options.additionalOpenPaths,
      });
      if (options.persist !== false) persistTreeOpenState(projectId, restoredTree);
      return restoredTree;
    });
  }
  function markProjectTreeIssue(projectId:string,message:string){++treeReadSequence.current;setTreeReadIssue({projectId,message});}
  async function handleReloadProjectTree(projectId=activeProject?.id){
    if(!projectId||activeAiProjectRef.current!==projectId)return;const epoch=aiWorkspaceEpoch.current.value;
    const existing=treeReadPending.current;if(existing?.projectId===projectId&&existing.epoch===epoch&&existing.sequence===treeReadSequence.current)return;
    const sequence=++treeReadSequence.current,request={projectId,epoch,sequence};treeReadPending.current=request;
    const owned=()=>activeAiProjectRef.current===projectId&&aiWorkspaceEpoch.current.value===epoch&&treeReadSequence.current===sequence;
    setTreeReadBusy(true);
    try{const next=await getProjectTree(projectId);if(owned())setProjectTree(projectId,next);}
    catch(error){if(owned())setTreeReadIssue({projectId,message:getApiErrorMessage(error,"No se pudo actualizar la estructura del proyecto.")});}
    finally{if(treeReadPending.current===request){treeReadPending.current=null;setTreeReadBusy(false);}}
  }

  function updateCurrentProjectTree(updater: (currentTree: DocumentTreeNode[]) => DocumentTreeNode[]) {
    setTree((currentTree) => {
      const nextTree = updater(currentTree);
      if (activeProject) persistTreeOpenState(activeProject.id, nextTree);
      return nextTree;
    });
  }

  function clearAiEditProposalState() {
    if (aiEditProposal) { aiProposalRequests.current.delete(aiEditProposal.id); cancelAiProposalApplication(aiEditProposal.id); }
    setAiEditProposal(null);
    setAutoApplyingAiEditProposalId(null);
    setBlockedAiEditOperationReasons({});
    setAppliedAiEditOperationIds([]);
  }

  function releaseAiProposalApplication(id: string) {
    if (!aiProposalExecution.current.isActive(id)) setApplyingAiEditProposalId(current => current === id ? null : current);
  }
  function cancelAiProposalApplication(id: string) {
    for (const operation of aiProposalExecution.current.cancel(id)) {
      aiChangeJournal.current.release(operation.id);aiTrackedOperationEpochs.current.delete(operation.id);
      window.clearTimeout(aiEditorOperationTimers.current.get(operation.id)); aiEditorOperationTimers.current.delete(operation.id);
    }
    setPendingEditorOperations(current => current.filter(operation => operation.aiProposalId !== id));
    releaseAiProposalApplication(id);
  }

  function revealTreeNode(nodeId: string) {
    updateCurrentProjectTree((currentTree) => openTreeNodePath(currentTree, nodeId));
    setActiveTreeNodeId(nodeId);
  }

  async function openRecordingDocument(documentId:string) {
    const projectId=documentId.split("::")[0];
    const project=projects.find(p=>p.id===projectId);
    if(!project) { showError(new Error("El proyecto de la transcripción ya no está disponible."),"No se pudo abrir la transcripción."); return; }
    if(project.id!==activeProject?.id) {
      setPendingRecordingDocument({id:documentId,projectId:project.id});
      await handleSelectProject(project);
      return;
    }
    handleOpenDocument(documentId,documentId.split("/").pop()??"Transcripción");
    setRecordingPanel(false);
  }
  function handleOpenLocalReference(target: LocalReferenceTarget) {
    if (!activeProject || target.projectId!==activeProject.id || target.status!=="available") return;
    if (target.kind==="document") handleOpenDocument(target.id,target.name);
    else if (target.kind==="handwritten-note") handleOpenHandwrittenNote(target.id,target.name);
    else if (target.kind==="image") handleOpenImage(target.id,target.name,target.path);
    else if (target.kind==="reference-document") handleOpenReferenceDocument(target.id,target.name,target.path);
    else if (target.kind==="folder") {
      revealTreeNode(target.id);
    }
  }

  function handleOpenDocument(documentId: string, name: string) {
    if(aiChangeJournal.current.hasDocument(documentId)){setNotice({title:"Cambio IA pendiente",message:"El documento se está protegiendo. Espera su confirmación antes de abrirlo.",tone:"info"});return;}
    if (activeHandwrittenNoteId && handwrittenSessions[activeHandwrittenNoteId]) {
      void persistHandwrittenDraft(activeHandwrittenNoteId, handwrittenSessions[activeHandwrittenNoteId]);
    }
    setTabs((currentTabs) => (
      currentTabs.some((tab) => tab.id === documentId)
        ? currentTabs
        : [...currentTabs, { id: documentId, name }]
    ));
    setActiveDocumentId(documentId);
    revealTreeNode(documentId);
    setActiveImageId("");
    setActiveHandwrittenNoteId("");
    setActiveReferenceDocumentId("");
    setActiveUtilityTab(null);
  }

  function handleOpenHandwrittenNote(noteId: string, name: string) {
    if (activeDocumentId && documentSessions[activeDocumentId]) {
      void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
    }
    setHandwrittenTabs((currentTabs) => (
      currentTabs.some((tab) => tab.id === noteId)
        ? currentTabs.map((tab) => (tab.id === noteId ? { id: noteId, name } : tab))
        : [...currentTabs, { id: noteId, name }]
    ));
    setActiveHandwrittenNoteId(noteId);
    revealTreeNode(noteId);
    setActiveDocumentId("");
    setActiveImageId("");
    setActiveReferenceDocumentId("");
    setActiveUtilityTab(null);
  }

  function handleSelectTreeNode(nodeId: string, type: DocumentTreeNode["type"], name: string, focus?:WorkspaceNodeFocus) {
    revealTreeNode(nodeId);
    const knownPath=activeProject&&nodeId.startsWith(`${activeProject.id}::`)?nodeId.slice(activeProject.id.length+2):undefined;
    if (type === "document") handleOpenDocument(nodeId, name);
    if (type === "handwritten-note") {
      setHandwrittenPageFocus(focus?.kind==="handwritten-page"?{noteId:nodeId,pageId:focus.pageId,requestId:++handwrittenPageFocusSequence.current}:null);
      handleOpenHandwrittenNote(nodeId, name);
    }
    if (type === "image") {
      const imageNode = findNodeById(tree, nodeId);
      const path=imageNode?.path??knownPath;if(path)handleOpenImage(nodeId,name,path);
    }
    if (type === "attachment") {
      const referenceNode = findNodeById(tree, nodeId);
      const path=referenceNode?.path??knownPath;if(path&&isReferenceDocumentPath(path))handleOpenReferenceDocument(nodeId,name,path,focus?.kind==="pdf-page"?focus.pageNumber:undefined);
    }
  }

  function handleActivateTreeNode(nodeId: string) {
    setActiveTreeNodeId(nodeId);
  }

  function handleOpenImage(assetId: string, name: string, path: string, options?: { activate?: boolean }) {
    setImageTabs((currentTabs) => (
      currentTabs.some((tab) => tab.id === assetId)
        ? currentTabs.map((tab) => (tab.id === assetId ? { id: assetId, name, path } : tab))
        : [...currentTabs, { id: assetId, name, path }]
    ));
    if (options?.activate !== false) {
      if (activeHandwrittenNoteId && handwrittenSessions[activeHandwrittenNoteId]) {
        void persistHandwrittenDraft(activeHandwrittenNoteId, handwrittenSessions[activeHandwrittenNoteId]);
      }
      setActiveImageId(assetId);
      setActiveReferenceDocumentId("");
      setActiveHandwrittenNoteId("");
      setActiveDocumentId("");
      setActiveTreeNodeId(assetId);
      setActiveUtilityTab(null);
    }
  }

  function handleOpenReferenceDocument(nodeId: string, name: string, path: string,requestedPage?:number) {
    const format = referenceDocumentFormat(path);
    if (!format) {
      setActiveTreeNodeId(nodeId);
      setNotice({ title: "Vista no disponible", message: "Este archivo de apoyo no tiene visor integrado.", tone: "info" });
      return;
    }
    const pageFocus=format==="pdf"&&typeof requestedPage==="number"&&Number.isSafeInteger(requestedPage)&&requestedPage>=1?{pageNumber:requestedPage,requestId:++referencePageFocusSequence.current}:undefined;
    setReferenceDocumentTabs((currentTabs) => (
      currentTabs.some((tab) => tab.id === nodeId)
        ? currentTabs.map((tab) => (tab.id === nodeId ? { id: nodeId, name, path, format,pageFocus } : tab))
        : [...currentTabs, { id: nodeId, name, path, format,pageFocus }]
    ));
    if (activeDocumentId && documentSessions[activeDocumentId]) {
      void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
    }
    if (activeHandwrittenNoteId && handwrittenSessions[activeHandwrittenNoteId]) {
      void persistHandwrittenDraft(activeHandwrittenNoteId, handwrittenSessions[activeHandwrittenNoteId]);
    }
    setActiveReferenceDocumentId(nodeId);
    setActiveImageId("");
    setActiveHandwrittenNoteId("");
    setActiveDocumentId("");
    setActiveTreeNodeId(nodeId);
    setActiveUtilityTab(null);
  }

  async function refreshProjectCapabilityState(projectId = activeProject?.id) {
    const owns=projectWork.read("capabilities",projectId);if(!owns)return;
    try {
      const [capabilities, status] = await Promise.all([
        getProjectCapabilities(),
        projectId ? getProjectVersioningStatus(projectId) : Promise.resolve(null),
      ]);
      if(!owns())return;
      setProjectCapabilities(capabilities);
      setVersioningStatus(status);
      if (!status?.enabled) setHistoryOpen(false);
    } catch (error) {
      if(owns())showError(error, "No se pudo actualizar el estado de versionado del proyecto.");
    }
  }

  async function refreshExternalChangeSet(projectId = activeProject?.id, options: { refreshTreeOnChanges?: boolean; silent?: boolean;reportErrors?:boolean;currentOnly?:boolean } = {}) {
    if (!projectId) return true;
    const owned=projectWork.read("external-changes",projectId);if(!owned)return false;
    try {
      const changeSet = options.silent ? await getExternalChanges(projectId) : await scanExternalChanges(projectId);
      if(!owned())return true;
      const acknowledged = isAcknowledgedExternalChangeSet(projectId, changeSet, acknowledgedExternalChangeSets);
      if (acknowledged) {
        setExternalChangeSet(changeSet);
        setExternalChangeDecisions(buildDefaultExternalChangeDecisions(changeSet));
        setExternalChangesMessage("Cambios omitidos aceptados.");
        if (projectSyncState !== "pending") setProjectSyncState("synced");
        return true;
      }
      setExternalChangeSet(changeSet);
      setExternalChangeDecisions(buildDefaultExternalChangeDecisions(changeSet));
      if (changeSet.summary.total > 0) {
        setProjectSyncState(changeSet.requiresReview ? "review-required" : "pending");
        if (options.refreshTreeOnChanges) {
          await handleReloadProjectTree(projectId);if(!owned())return true;
        }
      } else if (projectSyncState !== "pending") {
        setProjectSyncState(changeSet.status === "none" && changeSet.message ? "unsupported" : "synced");
      }
      setExternalChangesMessage(changeSet.message ?? null);
      return true;
    } catch (error) {
      if (owned()&&!options.silent&&options.reportErrors!==false) showError(error, "No se pudieron revisar los cambios externos.");
      return !owned();
    }
  }

  function getOpenDocumentSyncState(): OpenDocumentSyncState[] {
    return Object.entries(documentSessionsRef.current)
      .filter(([, session]) => session.document)
      .map(([documentId, session]) => ({
        documentId,
        path: session.document?.path ?? "",
        isActive: documentId === activeDocumentId,
        isDirty: session.isDirty,
        hasDraft: Boolean(session.hasRecoveredDraft || session.draftUpdatedAt),
        baseFingerprint: session.baseFingerprint,
      }));
  }

  function setDocumentPostSaveSyncState(documentId: string, sequence: number, state: DocumentPostSaveSyncState) {
    setDocumentPostSaveSyncStates((currentStates) => {
      const currentState = currentStates[documentId];
      if (currentState && currentState.sequence > sequence) return currentStates;
      if (state === "idle") {
        if (!currentState) return currentStates;
        const remainingStates = { ...currentStates };
        delete remainingStates[documentId];
        return remainingStates;
      }
      return {
        ...currentStates,
        [documentId]: { state, sequence },
      };
    });
  }

  async function refreshProjectSyncStatus(projectId = activeProject?.id, options: { autoRun?: boolean; silent?: boolean } = {}) {
    if (!projectId) return null;
    const owns=projectWork.read("sync-status",projectId);if(!owns)return null;
    try {
      const project = projects.find((candidate) => candidate.id === projectId) ?? (activeProject?.id === projectId ? activeProject : null);
      const payload = {
        openDocuments: getOpenDocumentSyncState(),
        allowAutoApply: Boolean(options.autoRun),
      };
      const canAutoRun = Boolean(options.autoRun && shouldRunAutomaticSync(project, authStatus));
      const status = canAutoRun ? await autoRunProjectSync(projectId, payload) : await scanProjectSync(projectId, payload);
      const normalizedStatus = withDerivedRemoteSyncStatus(status, project, authStatus);
      if(!owns())return null;
      setProjectSyncStatus(normalizedStatus);
      setProjectSyncState(normalizedStatus.state);
      setExternalChangesMessage(normalizedStatus.detail ?? normalizedStatus.label);
      return normalizedStatus;
    } catch (error) {
      if (owns()&&!options.silent) showError(error, "No se pudo comprobar la sincronización del proyecto.");
      return null;
    }
  }

  async function handleVerifyGithubConnection(projectId = activeProject?.id) {
    if (!projectId) return null;
    const project = projects.find((candidate) => candidate.id === projectId) ?? (activeProject?.id === projectId ? activeProject : null);
    const status = withDerivedRemoteSyncStatus(await verifyProjectGithubConnection(projectId), project, authStatus);
    setProjectSyncStatus(status);
    setProjectSyncState(status.state);
    setExternalChangesMessage(status.detail ?? status.label);
    await refreshProjectActivity(projectId);
    return status;
  }

  function handleExternalChangeDecision(itemId: string, decision: ExternalChangeDecision) {
    setExternalChangeDecisions((currentDecisions) => ({ ...currentDecisions, [itemId]: decision }));
  }

  function handleOmitExternalChanges() {
    if (!activeProject || !externalChangeSet) return;
    setAcknowledgedExternalChangeSets((current) => {
      const next = addAcknowledgedExternalChangeSet(current, activeProject.id, externalChangeSet.id);
      writeAcknowledgedExternalChangeSets(next);
      return next;
    });
    setExternalChangesOpen(false);
    setExternalChangesMessage("Cambios omitidos aceptados.");
    void recordProjectActivity(activeProject.id, {
      type: "omitted_changes_accepted",
      scope: "security",
      title: "Archivos omitidos aceptados",
      message: "Se confirmó que los archivos omitidos deben mantenerse fuera del historial.",
      tone: "success",
    }).then(() => refreshProjectActivity(activeProject.id));
    if (projectSyncState !== "pending") setProjectSyncState("synced");
  }

  async function handleImportExternalChanges(options: { safeOnly?: boolean } = {}) {
    if (!activeProject || !externalChangeSet || externalChangeSet.projectId!==activeProject.id) return;
    if (externalChangesBusy) return;
    const decisions = buildExternalImportDecisions(externalChangeSet, externalChangeDecisions, options.safeOnly);
    const operation=projectWork.begin(activeProject.id);if(!operation)return;
    try {
      if(!externalChangeSet.revision)throw new Error("Comprueba de nuevo para revisar los archivos antes de registrarlos.");
      checkpointPendingEditorInput();
      if(!await flushPendingDrafts(activeProject.id)||!operation.owns())return;
      setProjectSyncState("saving");
      setExternalChangesMessage("Registrando los archivos revisados en el historial local.");
      const pendingIds=new Set(externalChangeSet.items.filter(item=>{
        const id=`${activeProject.id}::${item.path}`,doc=documentSessionsRef.current[id],ink=handwrittenSessionsRef.current[id];
        return doc&&(doc.isDirty||doc.hasRecoveredDraft||doc.draftUpdatedAt||doc.draftWriteConflict)||ink&&(ink.isDirty||ink.hasRecoveredDraft||ink.draftUpdatedAt||ink.draftWriteConflict);
      }).map(item=>item.id));
      const reviewedDecisions=decisions.map(item=>pendingIds.has(item.itemId)?{...item,decision:"omit" as const}:item);
      if(!reviewedDecisions.some(item=>item.decision==="include"))throw new Error("Guarda o revisa los borradores antes de registrar sus archivos. El contenido abierto se conserva.");
      const payload: ExternalChangeImportRequest = { revision:externalChangeSet.revision, decisions:reviewedDecisions, syncRemote: false };
      const result = await importExternalChanges(activeProject.id, payload);
      if(!operation.owns())return;
      if(result.treeAvailable!==false)setProjectTree(activeProject.id,result.tree);else markProjectTreeIssue(activeProject.id,result.treeWarning||"El historial se actualizó; no se pudo cargar su estructura. No repitas la operación.");
      setProjectSyncState(result.status);
      setExternalChangesMessage(result.message);
      await refreshProjectCapabilityState(activeProject.id);
      if(!operation.owns())return;
      await refreshExternalChangeSet(activeProject.id, { silent: true });
      if(!operation.owns())return;
      await refreshProjectActivity(activeProject.id);
      if(!operation.owns())return;
      await refreshProjectFileSyncOverview(activeProject.id);
      if(!operation.owns())return;
      setProjectSyncState(result.status);
      setExternalChangesMessage(result.message);
      if (!result.pendingRemoteSync) setExternalChangesOpen(false);
    } catch (error) {
      if(!operation.owns())return;
      // An uncertain acknowledgement never authorizes replay: refresh reads only.
      await refreshExternalChangeSet(activeProject.id,{silent:true});
      if(!operation.owns())return;
      await refreshProjectFileSyncOverview(activeProject.id);
      if(!operation.owns())return;
      setProjectSyncState("review-required");
      setExternalChangesMessage("No se confirmó la operación. Revisa el estado comprobado y vuelve a confirmar solo lo que siga pendiente.");
      showError(error, "No se pudieron guardar los cambios detectados.");
    } finally {
      operation.release();
    }
  }

  async function refreshGithubRepositories() {
    if (!authStatus.isAuthenticated) return;
    setGithubRepositoriesLoading(true);
    try {
      setGithubRepositories(await listGithubRepositories());
    } catch (error) {
      showError(error, "No se pudieron cargar los repositorios de GitHub.");
    } finally {
      setGithubRepositoriesLoading(false);
    }
  }

  function handleCloseTab(tabId: string) {
    if (isPermanentWorkspaceTabId(tabId)) return;

    if (tabId === RELEASE_NOTES_WORKSPACE_TAB_ID) {
      const nextOpenUtilityTabs = removeReleaseNotesTab(openUtilityTabs);
      setOpenUtilityTabs(nextOpenUtilityTabs);
      setActiveUtilityTab(null);
      setLastSeenReleaseNotesVersion(APP_VERSION);
      void updateAppConfig({
        openUtilityTabs: nextOpenUtilityTabs,
        activeUtilityTab: null,
        lastSeenReleaseNotesVersion: APP_VERSION,
      }).catch((error) => {
        showError(error, "No se pudo guardar la configuración de las notas de release.");
      });
      return;
    }

    if (imageTabs.some((tab) => tab.id === tabId)) {
      const nextImageTabs = imageTabs.filter((tab) => tab.id !== tabId);
      setImageTabs(nextImageTabs);
      if (activeImageId === tabId) setActiveImageId(nextImageTabs[0]?.id ?? "");
      return;
    }

    if (referenceDocumentTabs.some((tab) => tab.id === tabId)) {
      const nextReferenceTabs = referenceDocumentTabs.filter((tab) => tab.id !== tabId);
      setReferenceDocumentTabs(nextReferenceTabs);
      if (activeReferenceDocumentId === tabId) setActiveReferenceDocumentId(nextReferenceTabs[0]?.id ?? "");
      return;
    }

    if (handwrittenTabs.some((tab) => tab.id === tabId)) {
      if (handwrittenSessions[tabId]?.isDirty) {
        setCloseDocumentId(tabId);
        return;
      }
      closeHandwrittenTabNow(tabId);
      return;
    }

    const documentId = tabId;
    if (documentSessions[documentId]?.isDirty) {
      setCloseDocumentId(documentId);
      return;
    }
    closeTabNow(documentId);
  }

  function handleCloseTabs(tabIds: string[]) {
    const uniqueTabIds = Array.from(new Set(tabIds)).filter((tabId) => !isPermanentWorkspaceTabId(tabId));
    const dirtyDocumentIdsToConfirm: string[] = [];
    uniqueTabIds.forEach((tabId) => {
      if (tabId === RELEASE_NOTES_WORKSPACE_TAB_ID || imageTabs.some((tab) => tab.id === tabId) || referenceDocumentTabs.some((tab) => tab.id === tabId)) {
        handleCloseTab(tabId);
        return;
      }

      if (documentSessions[tabId]?.isDirty || handwrittenSessions[tabId]?.isDirty) {
        dirtyDocumentIdsToConfirm.push(tabId);
        return;
      }
      if (handwrittenTabs.some((tab) => tab.id === tabId)) closeHandwrittenTabNow(tabId);
      else closeTabNow(tabId);
    });
    if (dirtyDocumentIdsToConfirm.length > 0) {
      const [firstDocumentId, ...remainingDocumentIds] = dirtyDocumentIdsToConfirm;
      setPendingCloseDocumentIds(remainingDocumentIds);
      setCloseDocumentId(firstDocumentId);
    }
  }

  function showNextPendingCloseDialog() {
    setPendingCloseDocumentIds((currentIds) => {
      const [nextDocumentId, ...remainingDocumentIds] = currentIds;
      setCloseDocumentId(nextDocumentId ?? null);
      return remainingDocumentIds;
    });
  }

  function handleReorderDocumentTabs(draggedTabId: string, targetTabId: string, placement: "before" | "after") {
    setWorkspaceTabOrder((currentOrder) => {
      const visibleTabIds = orderedScrollableWorkspaceTabs.map((tab) => tab.id);
      return reorderWorkspaceTabIds(normalizeWorkspaceTabOrder(currentOrder, visibleTabIds), draggedTabId, targetTabId, placement);
    });
    setTabs((currentTabs) => reorderOpenDocumentTabs(currentTabs, draggedTabId, targetTabId, placement));
    setHandwrittenTabs((currentTabs) => reorderOpenDocumentTabs(currentTabs, draggedTabId, targetTabId, placement));
  }

  function closeTabNow(documentId: string) {
    setTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => tab.id !== documentId);
      if (documentId === activeDocumentId && activeUtilityTab === null) {
        const nextActiveDocumentId = nextTabs[0]?.id ?? "";
        setActiveDocumentId(nextActiveDocumentId);
        if (nextActiveDocumentId) {
          revealTreeNode(nextActiveDocumentId);
        } else {
          setActiveTreeNodeId("");
        }
      }
      return nextTabs;
    });
    setPendingEditorOperations((currentOperations) => currentOperations.filter((operation) => operation.documentId !== documentId));
    setDocumentSessions((currentSessions) => {
      const { [documentId]: _closedSession, ...nextSessions } = currentSessions;
      return nextSessions;
    });
  }

  function closeHandwrittenTabNow(noteId: string) {
    setHandwrittenTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => tab.id !== noteId);
      if (noteId === activeHandwrittenNoteId && activeUtilityTab === null) {
        const nextActiveNoteId = nextTabs[0]?.id ?? "";
        setActiveHandwrittenNoteId(nextActiveNoteId);
        if (nextActiveNoteId) {
          revealTreeNode(nextActiveNoteId);
        } else {
          setActiveTreeNodeId(activeDocumentId);
        }
      }
      return nextTabs;
    });
    setHandwrittenSessions((currentSessions) => {
      const { [noteId]: _closedSession, ...nextSessions } = currentSessions;
      return nextSessions;
    });
  }

  function handleSelectTab(tabId: string) {
    if (tabId === AI_CONVERSATION_TAB_ID) {
      if (activeDocumentId && documentSessions[activeDocumentId]) {
        void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
      }
      if (activeHandwrittenNoteId && handwrittenSessions[activeHandwrittenNoteId]) {
        void persistHandwrittenDraft(activeHandwrittenNoteId, handwrittenSessions[activeHandwrittenNoteId]);
      }
      setActiveUtilityTab(null);
      setActiveImageId("");
      setActiveReferenceDocumentId("");
      setActiveHandwrittenNoteId("");
      setActiveDocumentId("");
      setActiveTreeNodeId("");
      return;
    }

    if (tabId === RELEASE_NOTES_WORKSPACE_TAB_ID) {
      setOpenUtilityTabs((currentTabs) => ensureReleaseNotesTab(currentTabs));
      setActiveUtilityTab(RELEASE_NOTES_UTILITY_TAB_ID);
      setActiveImageId("");
      setActiveHandwrittenNoteId("");
      setActiveReferenceDocumentId("");
      setActiveTreeNodeId("");
      return;
    }

    if (tabId === NOTES_WORKSPACE_TAB_ID) {
      if (activeDocumentId && documentSessions[activeDocumentId]) {
        void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
      }
      if (activeHandwrittenNoteId && handwrittenSessions[activeHandwrittenNoteId]) {
        void persistHandwrittenDraft(activeHandwrittenNoteId, handwrittenSessions[activeHandwrittenNoteId]);
      }
      setActiveUtilityTab(NOTES_UTILITY_TAB_ID);
      setActiveImageId("");
      setActiveReferenceDocumentId("");
      setActiveHandwrittenNoteId("");
      setActiveDocumentId("");
      setActiveTreeNodeId("");
      return;
    }

    if (imageTabs.some((tab) => tab.id === tabId)) {
      if (activeDocumentId && documentSessions[activeDocumentId]) {
        void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
      }
      if (activeHandwrittenNoteId && handwrittenSessions[activeHandwrittenNoteId]) {
        void persistHandwrittenDraft(activeHandwrittenNoteId, handwrittenSessions[activeHandwrittenNoteId]);
      }
      setActiveUtilityTab(null);
      setActiveImageId(tabId);
      setActiveReferenceDocumentId("");
      setActiveHandwrittenNoteId("");
      setActiveDocumentId("");
      setActiveTreeNodeId(tabId);
      return;
    }

    if (referenceDocumentTabs.some((tab) => tab.id === tabId)) {
      if (activeDocumentId && documentSessions[activeDocumentId]) {
        void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
      }
      if (activeHandwrittenNoteId && handwrittenSessions[activeHandwrittenNoteId]) {
        void persistHandwrittenDraft(activeHandwrittenNoteId, handwrittenSessions[activeHandwrittenNoteId]);
      }
      setActiveUtilityTab(null);
      setActiveImageId("");
      setActiveReferenceDocumentId(tabId);
      setActiveHandwrittenNoteId("");
      setActiveDocumentId("");
      setActiveTreeNodeId(tabId);
      return;
    }

    if (handwrittenTabs.some((tab) => tab.id === tabId)) {
      if (activeDocumentId && documentSessions[activeDocumentId]) {
        void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
      }
      if (activeHandwrittenNoteId && activeHandwrittenNoteId !== tabId && handwrittenSessions[activeHandwrittenNoteId]) {
        void persistHandwrittenDraft(activeHandwrittenNoteId, handwrittenSessions[activeHandwrittenNoteId]);
      }
      setActiveUtilityTab(null);
      setActiveImageId("");
      setActiveReferenceDocumentId("");
      setActiveDocumentId("");
      setActiveHandwrittenNoteId(tabId);
      revealTreeNode(tabId);
      return;
    }

    const documentId = tabId;
    if (activeDocumentId && documentSessions[activeDocumentId]) {
      void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
    }
    if (activeHandwrittenNoteId && handwrittenSessions[activeHandwrittenNoteId]) {
      void persistHandwrittenDraft(activeHandwrittenNoteId, handwrittenSessions[activeHandwrittenNoteId]);
    }
    setActiveUtilityTab(null);
    setActiveImageId("");
    setActiveReferenceDocumentId("");
    setActiveHandwrittenNoteId("");
    setActiveDocumentId(documentId);
    revealTreeNode(documentId);
  }

  function handleOpenReleaseNotes() {
    setOpenUtilityTabs((currentTabs) => ensureReleaseNotesTab(currentTabs));
    setActiveUtilityTab(RELEASE_NOTES_UTILITY_TAB_ID);
    setActiveReferenceDocumentId("");
    setActiveImageId("");
    setActiveHandwrittenNoteId("");
    setActiveTreeNodeId("");
  }

  function handleMarkdownChange(documentId: string, nextMarkdown: string, source: MarkdownEditorChangeSource = "user") {
    const session = documentSessionsRef.current[documentId];
    if (!session) return;
    if(session.markdown!==nextMarkdown)workspaceEditRevision.current++;
    documentSessionsRef.current = { ...documentSessionsRef.current, [documentId]: applyLocalMarkdownEdit(session, nextMarkdown, source) };
    setDocumentSessions(documentSessionsRef.current);
  }

  function handleHandwrittenChange(noteId: string, content: HandwrittenNoteContent) {
    const session = handwrittenSessionsRef.current[noteId];
    if (!session) return;
    workspaceEditRevision.current++;
    handwrittenSessionsRef.current = { ...handwrittenSessionsRef.current, [noteId]: applyLocalHandwrittenNoteEdit(session, content) };
    setHandwrittenSessions(handwrittenSessionsRef.current);
  }

  function handleHandwrittenToolPresetsChange(toolPresets: HandwrittenToolPreset[]) {
    setHandwrittenConfig((currentConfig) => {
      const updatedConfig = { ...currentConfig, toolPresets };
      cacheLocalAppPreferences({ handwritten: updatedConfig });
      return updatedConfig;
    });
  }

  function handleHandwrittenEraserConfigChange(eraser: HandwrittenEraserConfig) {
    setHandwrittenConfig((currentConfig) => {
      const updatedConfig = { ...currentConfig, eraser };
      cacheLocalAppPreferences({ handwritten: updatedConfig });
      return updatedConfig;
    });
  }

  function handleNotesMarkdownChange(nextMarkdown: string) {
    if(notesMarkdownRef.current!==nextMarkdown)workspaceEditRevision.current++;
    notesMarkdownRef.current = nextMarkdown;
    setNotesMarkdown(nextMarkdown);
    setNotesSaveState("idle");
  }

  async function prepareTrackedEditorChange(operation:MarkdownEditorExternalOperation,interactionId:string,summary:string,originalEpoch:number){
    const id=operation.documentId;const expected={projectId:id===NOTES_WORKSPACE_TAB_ID?(activeAiProjectRef.current??""):id.split("::")[0],epoch:originalEpoch};aiTrackedOperationEpochs.current.set(operation.id,expected);if(id===NOTES_WORKSPACE_TAB_ID)return;
    await sessionWrites.current.run(id,async()=>{const session=documentSessionsRef.current[id];if(!session||session.markdown!==operation.expectedMarkdown)throw Error("El documento cambió antes de registrar la operación IA");const allowed=()=>sameTrackedVisit(documentSessionsRef.current[id],session)&&documentSessionsRef.current[id]?.markdown===session.markdown&&trackedAuthorityIsCurrent(expected,{projectId:activeAiProjectRef.current,epoch:aiWorkspaceEpoch.current.value,canEdit:aiConfigRef.current.permissions.editDocuments,proposalExists:!!operation.aiProposalId&&aiProposalRequests.current.has(operation.aiProposalId)});if(!allowed())throw Error("La propuesta ya no tiene el mismo ámbito");await aiChangeJournal.current.prepare(operation.id,id,{interactionId,operationId:operation.id,summary,beforeMarkdown:session.markdown,expectedDraftWriteRevision:session.draftWriteRevision??null,baseFingerprint:session.baseFingerprint},allowed);});
  }
  async function persistTrackedEditorChange(operation:MarkdownEditorExternalOperation,markdown:string){
    return sessionWrites.current.run(operation.documentId,async()=>{const before=documentSessionsRef.current[operation.documentId];if(!before)throw Error("La operación perdió su documento; consulta el cambio conservado");const expected=aiTrackedOperationEpochs.current.get(operation.id);const allowed=()=>!!expected&&trackedAuthorityIsCurrent(expected,{projectId:activeAiProjectRef.current,epoch:aiWorkspaceEpoch.current.value,canEdit:aiConfigRef.current.permissions.editDocuments,proposalExists:!!operation.aiProposalId&&aiProposalRequests.current.has(operation.aiProposalId)});const draft=await aiChangeJournal.current.apply(operation.id,markdown,allowed);const current=acknowledgeDraftWrite(documentSessionsRef.current[operation.documentId],before,draft.draftWriteRevision);if(!sameTrackedVisit(current,before))throw Error("La aplicación quedó pendiente de revisión en su documento original");if(!current)throw Error("El documento ya no está abierto");const matches=current.markdown===markdown;const next={...current,...(matches?{lastDraftMarkdown:draft.isDirty?markdown:"",draftUpdatedAt:draft.draftUpdatedAt,hasRecoveredDraft:!!draft.hasDraft,draftContentHash:draft.draftContentHash??null}:{}),draftWriteRevision:draft.draftWriteRevision??null};documentSessionsRef.current={...documentSessionsRef.current,[operation.documentId]:next};setDocumentSessions(documentSessionsRef.current);});
  }
  async function handleEditorOperationApplied(operationId: string) {
    if(aiEditorJournalAcks.current.has(operationId))return;aiEditorJournalAcks.current.add(operationId);
    try{
    const operation = aiProposalExecution.current.peek(operationId);
    setPendingEditorOperations(current=>current.filter(candidate=>candidate.id!==operationId));
    window.clearTimeout(aiEditorOperationTimers.current.get(operationId)); aiEditorOperationTimers.current.delete(operationId);
    const context = operation?.aiProposalId ? aiProposalRequests.current.get(operation.aiProposalId) : null;
    if(operation&&aiChangeJournal.current.hasOperation(operationId)){
      try{const reader=liveEditorSnapshots.current.get(operation.documentId);if(!reader)throw Error("No se pudo capturar el resultado vivo del editor");const markdown=reader.getMarkdownSnapshot();handleMarkdownChange(operation.documentId,markdown,"user");await persistTrackedEditorChange(operation,markdown);}
      catch(error){markDraftWriteBlocked(operation.documentId,false);aiChangeJournal.current.release(operationId);handleEditorOperationFailed({...operation,failureReason:"editor_apply_failed"});showError(error,"El cambio IA requiere consulta. Tu edición permanece protegida.");return;}
      finally{aiChangeJournal.current.release(operationId);}
    }
    aiProposalExecution.current.settle(operationId);aiTrackedOperationEpochs.current.delete(operationId);
    if (operation && context) {
      setAiAppliedChange({ documentId: operation.documentId, summary: context.response.editProposal?.summary ?? "Cambio aplicado como borrador" });
      setAppliedAiEditOperationIds(current => Array.from(new Set([...current, ...(operation.aiEditOperationIds ?? (operation.aiEditOperationId ? [operation.aiEditOperationId] : []))])));
    }
    if (operation?.aiProposalId) releaseAiProposalApplication(operation.aiProposalId);
    setPendingEditorOperations(current => current.filter(operation => operation.id !== operationId));

    }finally{aiEditorJournalAcks.current.delete(operationId);}
  }

  function handleEditorOperationFailed(operation: MarkdownEditorExternalOperation) {
    aiChangeJournal.current.release(operation.id);aiTrackedOperationEpochs.current.delete(operation.id);
    setPendingEditorOperations(current => current.filter(candidate => candidate.id !== operation.id));
    const queued = aiProposalExecution.current.settle(operation.id);
    window.clearTimeout(aiEditorOperationTimers.current.get(operation.id)); aiEditorOperationTimers.current.delete(operation.id);
    if (operation.aiProposalId) releaseAiProposalApplication(operation.aiProposalId);
    if (operation.aiProposalId && !queued) return;
    setAutoApplyingAiEditProposalId(null);
    const ids = new Set(operation.aiEditOperationIds ?? (operation.aiEditOperationId ? [operation.aiEditOperationId] : []));
    setAppliedAiEditOperationIds(current => current.filter(id => !ids.has(id)));
    setBlockedAiEditOperationReasons(current => ({ ...current, ...Object.fromEntries(Array.from(ids, id => [id, operation.failureReason ?? "editor_apply_failed"])) }));
    const context = operation.aiProposalId ? aiProposalRequests.current.get(operation.aiProposalId) : null;
    if (context) retainAiResponse(context.response, context.request, "El editor contiene cambios nuevos o no pudo aplicar la operación. Tu contenido se conserva; revisa el resultado como copia.");
    setAiBubble({ id: `local-${Date.now()}`, answer: "El cambio requiere revisión. Se conserva tu contenido actual." });
  }

  async function handleSendAiPrompt(prompt: string, selectionFocus?: AiSelectionFocus | null, options?: AiPromptExecutionOptions) {
    if (!activeProject) return;
    const hasNotesContext = activeUtilityTab === NOTES_UTILITY_TAB_ID;
    const hasDocumentContext = Boolean(activeDocumentId && activeSession?.document);
    const hasHandwrittenContext = Boolean(
      activeHandwrittenNoteId
      && activeHandwrittenSession?.note
      && activeHandwrittenSession.content
      && activeWorkspaceTabIdForConfig === activeHandwrittenNoteId,
    );
    if (hasDocumentContext && (activeSession?.conflictStatus === "disk-changed" || activeSession?.orphaned || activeSession?.conflictStatus === "missing")) {
      setAiBubble({ id: `local-${Date.now()}`, answer: "Resuelve el conflicto del documento antes de aplicar cambios con IA." });
      return;
    }
    if (hasHandwrittenContext && (activeHandwrittenSession?.conflictStatus === "disk-changed" || activeHandwrittenSession?.orphaned || activeHandwrittenSession?.conflictStatus === "missing")) {
      setAiBubble({ id: `local-${Date.now()}`, answer: "Resuelve el conflicto de la nota a mano antes de aplicar dibujos con IA." });
      return;
    }
    const interactionDocumentId = hasNotesContext ? NOTES_WORKSPACE_TAB_ID : hasDocumentContext ? activeDocumentId : null;
    const interactionMarkdown = hasNotesContext ? notesMarkdown : hasDocumentContext ? activeSession?.markdown ?? "" : "";
    const interactionSelection = hasNotesContext
      ? selectionFocus?.documentId === NOTES_WORKSPACE_TAB_ID ? selectionFocus : null
      : hasDocumentContext && selectionFocus?.documentId === activeDocumentId ? selectionFocus : null;
    const handwrittenContent = hasHandwrittenContext ? activeHandwrittenSession?.content ?? null : null;
    const activeHandwrittenPage = handwrittenContent?.pages[0] ?? null;
    const handwrittenContentJson = handwrittenContent ? stringifyHandwrittenContent(handwrittenContent) : "";
    const targetKind = hasNotesContext
      ? "notes"
      : hasHandwrittenContext
      ? "handwritten_note"
      : hasDocumentContext
      ? "markdown_document"
      : "project";

    setAiBubble(null);
    try {
      if (options?.intent?.kind === "research") {
        const contextSourceIds = promptContextSourceIds;
        const researchDocumentId = hasNotesContext ? null : hasDocumentContext ? activeDocumentId : null;
        const researchDocumentPath = hasNotesContext ? null : hasDocumentContext ? activeSession?.document?.path ?? null : null;
        const brief = await prepareAiResearchBrief(activeProject.id, {
          prompt,
          activeMarkdown: interactionMarkdown,
          documentId: researchDocumentId,
          clientContext: {
            lastDocumentId: researchDocumentId,
            lastDocumentPath: researchDocumentPath,
            targetParentId: currentCreationParentId,
            diagramConfig: aiConfig.diagrams,
          },
          clientMessageId: `client-${Date.now()}`,
          contextSourceIds,
          intent: options.intent,
        });
        setAiResearchBrief(brief);
        setAiResearchJob(null);
        setAiResearchContextSourceIds(contextSourceIds);
        setAiResearchActiveMarkdown(interactionMarkdown);
        handleSelectTab(AI_CONVERSATION_TAB_ID);
        void getAiConversation(activeProject.id).then((conversation) => setAiConversationEvents(conversation.events)).catch(() => undefined);
        return;
      }
      const requestSnapshot = captureAiRequest(activeProject, aiWorkspaceEpoch.current.value, interactionDocumentId ?? (hasHandwrittenContext ? activeHandwrittenNoteId : null), documentSessionsRef.current, handwrittenSessionsRef.current, notesMarkdownRef.current);
      if (interactionDocumentId) requestSnapshot.markdown[interactionDocumentId] = interactionMarkdown;
      if (hasHandwrittenContext && activeHandwrittenNoteId && handwrittenContent) requestSnapshot.handwritten[activeHandwrittenNoteId] = handwrittenContentJson;
      const response = await sendAiInteraction({
        projectId: activeProject.id,
        documentId: interactionDocumentId,
        activeDocumentBaseFingerprint: hasDocumentContext ? activeSession?.baseFingerprint ?? null : null,
        activeDocumentDraftContentHash: hasDocumentContext ? activeSession?.draftContentHash ?? null : null,
        activeHandwrittenDraftContentHash: hasHandwrittenContext ? activeHandwrittenSession?.draftContentHash ?? null : null,
        prompt,
        activeMarkdown: interactionMarkdown,
        targetKind,
        handwrittenNoteId: hasHandwrittenContext ? activeHandwrittenNoteId : null,
        activeHandwrittenPageId: activeHandwrittenPage?.id ?? null,
        activeHandwrittenSummary: handwrittenContent && activeHandwrittenPage
          ? buildActiveHandwrittenSummary(handwrittenContent, activeHandwrittenPage.id)
          : null,
        activeHandwrittenContentHash: handwrittenContent ? simpleStringHash(handwrittenContentJson) : null,
        activeHandwrittenBaseFingerprint: hasHandwrittenContext ? activeHandwrittenSession?.baseFingerprint ?? null : null,
        activeHandwrittenContent: handwrittenContent,
        selectionFocus: interactionSelection,
        clientContext: {
          lastDocumentId: lastDocumentContextRef.current.id,
          lastDocumentPath: lastDocumentContextRef.current.path,
          targetParentId: currentCreationParentId,
          diagramConfig: aiConfig.diagrams,
        },
        intent: options?.intent ?? null,
        executionMode: options?.executionMode ?? "quick",
        reasoningDepth: options?.reasoningDepth ?? "light",
        mode: interactionDocumentId || hasHandwrittenContext ? "document" : "project",
        clientMessageId: `client-${Date.now()}`,
        contextSourceIds: promptContextSourceIds,
      });
      applyAiInteractionResponse(response, requestSnapshot);
      void refreshAiUsageSummary();
    } catch (error) {
      showError(error, "No se pudo completar la interacción IA.", { source: "app.aiInteraction" });
    }
  }

  async function handleSearchAiContextDocuments(query: string): Promise<AiContextSearchResult[]> {
    if (!activeProject) return [];
    return searchAiContextDocuments(activeProject.id, query);
  }

  async function refreshAiResearchJobs(projectId = activeProject?.id) {
    if (!projectId) return;
    try {
      const response = await listAiResearchJobs(projectId);
      setAiResearchJobs(response.jobs);
      const activeJob = response.jobs.find((job) => !isAiResearchTerminalStatus(job.status));
      if (activeJob) setAiResearchJob(activeJob);
    } catch {
      // Research history is auxiliary; keep the rest of the AI surface usable.
    }
  }

  function handleResearchJobSettled(job: AiResearchJob) {
    if (!activeProject) return;
    if(job.tree&&job.treeAvailable!==false)setProjectTree(activeProject.id,job.tree);else if(job.treeDeferred)void handleReloadProjectTree();
    const documentId = job.documentId ?? job.createdDocumentId ?? null;
    if (isAiResearchReadyStatus(job.status) && documentId && !openedResearchDocumentIdsRef.current.has(documentId)) {
      openedResearchDocumentIdsRef.current.add(documentId);
      const name = job.documentPath?.split("/").pop() || "Investigación.md";
      handleOpenDocument(documentId, name);
      void getAiConversation(activeProject.id).then((conversation) => setAiConversationEvents(conversation.events)).catch(() => undefined);
      void refreshAiUsageSummary();
    }
  }

  async function handleStartAiResearch(brief: AiResearchBrief) {
    if (!activeProject) return;
    setAiResearchBrief(null);
    try {
      const job = await startAiResearchJob(activeProject.id, {
        brief,
        activeMarkdown: aiResearchActiveMarkdown,
        contextSourceIds: aiResearchContextSourceIds,
      });
      setAiResearchJob(job);
      setAiResearchJobs((current) => upsertAiResearchJob(current, job));
    } catch (error) {
      showError(error, "No se pudo ejecutar la investigación.", { source: "app.aiResearch.start" });
      setAiResearchJob((current) => current ? {
        ...current,
        status: "failed",
        currentPhase: "failed",
        message: getApiErrorMessage(error, "No se pudo ejecutar la investigación."),
        error: getApiErrorMessage(error, "No se pudo ejecutar la investigación."),
        updatedAt: new Date().toISOString(),
      } : current);
    }
  }

  async function handleCancelAiResearchJob(jobId: string) {
    if (!activeProject) return;
    try {
      const job = await cancelAiResearchJob(activeProject.id, jobId);
      setAiResearchJob(job);
      setAiResearchJobs((current) => upsertAiResearchJob(current, job));
    } catch (error) {
      showError(error, "No se pudo cancelar la investigación.", { source: "app.aiResearch.cancel" });
    }
  }

  async function handleRetryAiResearchJob(jobId: string) {
    if (!activeProject) return;
    try {
      const job = await retryAiResearchJob(activeProject.id, jobId);
      setAiResearchBrief(null);
      setAiResearchJob(job);
      setAiResearchJobs((current) => upsertAiResearchJob(current, job));
    } catch (error) {
      showError(error, "No se pudo reintentar la investigación.", { source: "app.aiResearch.retry" });
    }
  }

  async function handleAddProjectDocumentContext(documentId: string) {
    if (!activeProject) return;
    try {
      const node = findNodeById(tree, documentId);
      if (node?.type === "image") {
        await addProjectImageAiContextSource(activeProject.id, documentId);
      } else if (node?.type === "attachment") {
        await addProjectAttachmentAiContextSource(activeProject.id, documentId);
      } else if (node?.type === "handwritten-note") {
        await addProjectHandwrittenNoteAiContextSource(activeProject.id, documentId);
      } else {
        await addProjectDocumentAiContextSource(activeProject.id, documentId);
      }
      await refreshAiContextSources(activeProject.id);
    } catch (error) {
      showError(error, "No se pudo añadir el archivo al contexto IA.", { source: "app.aiContext.addDocument" });
    }
  }

  async function handleAddProjectAttachmentContext(attachmentId: string) {
    if (!activeProject) return;
    try {
      await addProjectAttachmentAiContextSource(activeProject.id, attachmentId);
      await refreshAiContextSources(activeProject.id);
    } catch (error) {
      showError(error, "No se pudo añadir el archivo al contexto IA.", { source: "app.aiContext.addAttachment" });
    }
  }

  async function handleAddProjectImageContext(assetId: string) {
    if (!activeProject) return;
    try {
      await addProjectImageAiContextSource(activeProject.id, assetId);
      await refreshAiContextSources(activeProject.id);
    } catch (error) {
      showError(error, "No se pudo añadir la imagen al contexto IA.", { source: "app.aiContext.addImage" });
    }
  }

  async function handleUploadAiContextFiles(files: File[]) {
    if (!activeProject || files.length === 0) return;
    try {
      const response = await uploadAiContextFiles(activeProject.id, files);
      setAiContextSources(response.sources);
    } catch (error) {
      showError(error, "No se pudieron adjuntar los archivos al contexto IA.", { source: "app.aiContext.upload" });
    }
  }

  async function handlePickLocalAiContextFiles() {
    if (!activeProject) return;
    try {
      const paths = await selectAiContextFilePaths();
      if (paths.length === 0) return;
      const response = await uploadLocalAiContextFiles(activeProject.id, paths);
      setAiContextSources(response.sources);
    } catch (error) {
      showError(error, "No se pudieron adjuntar los archivos al contexto IA.", { source: "app.aiContext.localUpload" });
    }
  }

  async function handleRemoveAiContextSource(sourceId: string) {
    if (!activeProject) return;
    setRemovingAiContextSourceIds((currentIds) => new Set(currentIds).add(sourceId));
    try {
      const response = await removeAiContextSource(activeProject.id, sourceId);
      setAiContextSources(response.sources);
      setRemovingAiContextSourceIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(sourceId);
        return nextIds;
      });
    } catch (error) {
      showError(error, "No se pudo quitar la fuente del contexto IA.", { source: "app.aiContext.remove" });
      await refreshAiContextSources(activeProject.id, { silent: true });
      setRemovingAiContextSourceIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(sourceId);
        return nextIds;
      });
    }
  }

  async function handleExtendAiContextSource(sourceId: string) {
    if (!activeProject) return;
    try {
      const source = await extendAiContextSource(activeProject.id, sourceId);
      setAiContextSources((currentSources) => currentSources.map((current) => (current.id === source.id ? source : current)));
    } catch (error) {
      showError(error, "No se pudo mantener la fuente en el contexto IA.", { source: "app.aiContext.extend" });
    }
  }

  async function handlePreviewAiContextSource(sourceId: string): Promise<AiContextSourcePreviewResponse> {
    if (!activeProject) throw new Error("No hay proyecto activo.");
    const projectId=activeProject.id,epoch=aiWorkspaceEpoch.current.value;
    const result=await previewAiContextSource(projectId,sourceId);
    if(result.source.id!==sourceId||result.source.projectId!==projectId)throw new Error("La copia recibida no corresponde al proyecto y fuente revisados.");
    if(activeAiProjectRef.current===projectId&&aiWorkspaceEpoch.current.value===epoch)setAiContextSources(current=>current.map(source=>source.id===sourceId?result.source:source));
    return result;
  }
  async function handleRefreshAiContextSource(sourceId:string,review:import("../types/domain").AiContextOriginReview):Promise<AiContextSourcePreviewResponse>{
    if(!activeProject)throw new Error("No hay proyecto activo.");
    const projectId=activeProject.id,epoch=aiWorkspaceEpoch.current.value;
    const result=await refreshContextSource(projectId,sourceId,review);
    if(activeAiProjectRef.current===projectId&&aiWorkspaceEpoch.current.value===epoch)setAiContextSources(current=>current.map(source=>source.id===sourceId?result.source:source));
    return result;
  }

  async function handleAddAiContextSourceToProject(sourceId: string) {
    if (!activeProject) return;
    try {
      const source = aiContextSources.find((item) => item.id === sourceId);
      const result = await addAiContextSourceToProject(activeProject.id, sourceId, {
        name: source?.name ? `${source.name.replace(/\.[^.]+$/, "")}.md` : undefined,
        parentId: currentCreationParentId,
      });
      if(result.tree&&result.treeAvailable!==false)setProjectTree(activeProject.id,result.tree);else if(result.treeAvailable===false)markProjectTreeIssue(activeProject.id,result.treeWarning||"Documento creado; no se pudo actualizar su vista. No repitas la creación.");
      if (result.documentId) handleOpenDocument(result.documentId, result.path.split("/").pop() || result.path);
      await refreshAiContextSources(activeProject.id);
    } catch (error) {
      showError(error, "No se pudo añadir la fuente al proyecto.", { source: "app.aiContext.addToProject" });
    }
  }

  async function handleAiIntentAction(action: AiIntentActionType, intentId: string) {
    if (!activeProject || !aiPendingIntent) return;
    const targetDocumentId = aiPendingIntent.targetDocumentId ?? lastDocumentContextRef.current.id;
    const targetSession = targetDocumentId ? documentSessions[targetDocumentId] : undefined;
    const targetMarkdown = targetDocumentId === NOTES_WORKSPACE_TAB_ID ? notesMarkdownRef.current : targetSession?.markdown ?? "";
    const requestSnapshot = captureAiRequest(activeProject, aiWorkspaceEpoch.current.value, targetDocumentId ?? null, documentSessionsRef.current, handwrittenSessionsRef.current, notesMarkdownRef.current);
    if (targetDocumentId) requestSnapshot.markdown[targetDocumentId] = targetMarkdown;
    try {
      const response = await sendAiInteraction({
        projectId: activeProject.id,
        documentId: targetDocumentId ?? null,
        activeDocumentBaseFingerprint: targetSession?.baseFingerprint ?? (targetDocumentId ? handwrittenSessions[targetDocumentId]?.baseFingerprint : null) ?? null,
        activeDocumentDraftContentHash: targetSession?.draftContentHash ?? null,
        activeHandwrittenDraftContentHash: targetDocumentId ? handwrittenSessions[targetDocumentId]?.draftContentHash ?? null : null,
        prompt: "",
        activeMarkdown: targetMarkdown,
        selectionFocus: null,
        clientContext: {
          lastDocumentId: lastDocumentContextRef.current.id,
          lastDocumentPath: lastDocumentContextRef.current.path,
          targetParentId: currentCreationParentId,
          diagramConfig: aiConfig.diagrams,
        },
        intentAction: { type: action, intentId },
        mode: targetDocumentId ? "document" : "project",
        clientMessageId: `client-intent-${Date.now()}`,
      });
      applyAiInteractionResponse(response, requestSnapshot);
      void refreshAiUsageSummary();
    } catch (error) {
      showError(error, "No se pudo aplicar la intención IA.", { source: "app.aiIntentAction" });
    }
  }

  function retainAiResponse(response: AiInteractionResponse, request: AiRequestSnapshot, reason: string) {
    if (response.retainedResult) {
      const { result, stored, error } = response.retainedResult;
      aiResultReview.adopt(result, stored, error);
      return;
    }
    const key = `${request.projectId}:${response.interactionId}`;
    if (deferredAiResultIds.current.has(key)) return;
    deferredAiResultIds.current.add(key);
    void aiResultReview.retain(buildAiReviewRecord({ id: response.interactionId, receivedAt: new Date().toISOString(), reason, request, response }));
  }

  async function applyTrackedHandwrittenResponse(response:AiInteractionResponse,request:AiRequestSnapshot,updated:NonNullable<AiInteractionResponse["updatedHandwrittenNote"]>){
    const id=updated.noteId,operationId=nextAiEditorOperationId("handwritten-"+response.interactionId);
    try{await sessionWrites.current.run(id,async()=>{const submitted=handwrittenSessionsRef.current[id];if(!submitted?.content)throw Error("La nota ya no está disponible en el espacio actual");const before=stringifyHandwrittenContent(submitted.content);const allowed=()=>trackedAuthorityIsCurrent({projectId:request.projectId,epoch:request.projectEpoch},{projectId:activeAiProjectRef.current,epoch:aiWorkspaceEpoch.current.value,canEdit:aiConfigRef.current.permissions.editHandwrittenNotes,proposalExists:true})&&sameHandwrittenRevision(handwrittenSessionsRef.current[id],submitted);
      if(!allowed())throw Error("La nota o su permiso cambiaron antes de registrar el cambio IA");
      await aiChangeJournal.current.prepare(operationId,id,{interactionId:response.interactionId,operationId,summary:updated.summary,beforeMarkdown:before,expectedDraftWriteRevision:submitted.draftWriteRevision??null,baseFingerprint:submitted.baseFingerprint},allowed);
      const result=await aiChangeJournal.current.apply(operationId,stringifyHandwrittenContent(updated.content),allowed);const live=handwrittenSessionsRef.current[id];
      if(!live?.content||live.loadVersion!==submitted.loadVersion||live.savedContent!==submitted.savedContent||live.baseFingerprint?.sha256!==submitted.baseFingerprint?.sha256||request.projectEpoch!==aiWorkspaceEpoch.current.value||request.projectId!==activeAiProjectRef.current)throw Error("El acuse se conserva en el proyecto original; la vista actual cambió");
      const acknowledged=acknowledgeDraftWrite(live,submitted,result.draftWriteRevision)!;const next=stringifyHandwrittenContent(live.content!)===before?markAiHandwrittenDraftApplied(applyLocalHandwrittenNoteEdit(acknowledged,updated.content),updated.content,new Date().toISOString(),result.draftWriteRevision):acknowledged;handwrittenSessionsRef.current={...handwrittenSessionsRef.current,[id]:next};setHandwrittenSessions(handwrittenSessionsRef.current);setAiAppliedChange({documentId:id,summary:updated.summary});});}
    catch(error){if(handwrittenSessionsRef.current[id])markDraftWriteBlocked(id,true);retainAiResponse(response,request,"El cambio manuscrito requiere revisión; los trazos y el resultado se conservan.");showError(error,"No se confirmó el cambio manuscrito. Consulta su historial sin repetir.");}
    finally{aiChangeJournal.current.release(operationId);}
  }

  function applyAiInteractionResponse(incoming: AiInteractionResponse, request: AiRequestSnapshot) {
    if((incoming.conversationWarning||incoming.usageWarning)&&request.projectId===activeAiProjectRef.current&&request.projectEpoch===aiWorkspaceEpoch.current.value){
      setNotice({title:"Resultado recibido; registro local sin confirmar",message:[incoming.conversationWarning,incoming.usageWarning].filter(Boolean).join(" "),tone:"info"});
    }
    if (incoming.retainedResult) {
      const { result, stored, error } = incoming.retainedResult;
      aiResultReview.adopt(result, stored, error);
    }
    const issue = aiResponseContinuityIssue(request, incoming, { projectId: activeAiProjectRef.current, projectEpoch: aiWorkspaceEpoch.current.value, documents: documentSessionsRef.current, handwritten: handwrittenSessionsRef.current, notes: notesMarkdownRef.current });
    if (issue) {
      retainAiResponse(incoming, request, issue);
      if (request.projectId === activeAiProjectRef.current && request.projectEpoch === aiWorkspaceEpoch.current.value) {
        setAiConversationEvents(current => mergeAiEvents(current, incoming.conversationEvents));
        setAiBubble({ id: incoming.interactionId, answer: "Resultado conservado para revisión. Tu contenido actual no se ha sustituido." });
      }
      return;
    }
    const canActivate = request.targetId === activeWorkspaceTabIdRef.current;
    let response = incoming;
    if (incoming.updatedDocument) {
      const updated = incoming.updatedDocument;
      const now = new Date().toISOString();
      response = { ...incoming, updatedDocument: null, editProposal: {
        id: `client-${incoming.interactionId}`, projectId: request.projectId, interactionId: incoming.interactionId, status: "proposed", documentId: updated.documentId,
        title: "Edición del documento", summary: updated.summary, scope: "document", createdAt: now, updatedAt: now,
        operations: [...(incoming.editProposal?.operations ?? []), { id: `client-${incoming.interactionId}-document`, action: "replace_document", documentId: updated.documentId, summary: updated.summary, confidence: "high", markdown: updated.markdown }],
      } };
    }
    response = bindAiProposalReview(response, request, aiConfigRef.current.agentic.confirmBeforeApplying);
    if (response.contextSources) {
      setAiContextSources(response.contextSources);
    } else if (response.expiredContextSourceIds?.length) {
      setAiContextSources((currentSources) => currentSources.filter((source) => !response.expiredContextSourceIds?.includes(source.id)));
    }
    if (response.conversationEvents.length > 0) {
      setAiConversationEvents((currentEvents) => mergeAiEvents(currentEvents, response.conversationEvents));
    }
    if (response.pendingIntent && response.pendingIntent.status !== "completed" && response.pendingIntent.status !== "cancelled") {
      setAiPendingIntent(response.pendingIntent);
    } else if (response.pendingIntentStatus === "completed" || response.pendingIntentStatus === "cancelled") {
      setAiPendingIntent(null);
    } else if (response.executionMode === "quick") {
      setAiPendingIntent(null);
    }
    if (response.editProposal && response.editProposal.status === "proposed") {
      for (const [id, context] of aiProposalRequests.current) {
        if (id === response.editProposal.id) continue;
        retainAiResponse(context.response, context.request, "Llegó otro resultado antes de terminar la revisión del anterior. Ambos se conservan por separado.");
        aiProposalRequests.current.delete(id);
        cancelAiProposalApplication(id);
        setPendingEditorOperations(current => current.filter(operation => operation.aiProposalId !== id));
      }
      aiProposalRequests.current.set(response.editProposal.id, { request, response });
      setAutoApplyingAiEditProposalId(response.editProposal.requiresConfirmation ? null : response.editProposal.id);
      setAiEditProposal(response.editProposal);
      setBlockedAiEditOperationReasons({});
      setAppliedAiEditOperationIds([]);
    } else if (response.editProposalStatus === "applied" || response.editProposalStatus === "discarded") {
      clearAiEditProposalState();
    }
    const affectedDocuments = response.affectedDocuments ?? [];
    if(affectedDocuments.length>0)applyFileOperationResult({tree:response.tree??[],treeAvailable:response.treeAvailable??!!response.tree,treeWarning:response.treeWarning,node:null,affectedDocuments});
    else if(response.tree&&response.treeAvailable!==false&&activeProject)setProjectTree(activeProject.id,response.tree);
    else if(response.treeAvailable===false&&activeProject)markProjectTreeIssue(activeProject.id,response.treeWarning||"Resultado IA conservado; no se pudo actualizar su vista.");
    const generatedImage = response.generatedImages?.[0];
    const generatedImageToOpen = generatedImage?.asset;
    if (generatedImageToOpen && canActivate) {
      handleOpenImage(generatedImageToOpen.id, generatedImageToOpen.name, generatedImageToOpen.path, {
        activate: !generatedImage.insertedIntoDocumentId,
      });
    }
    if (response.requiresConfirmation) setAiPendingDelete(response.requiresConfirmation);
    const deletedPaths = getDeletedOperationPaths(response);
    if (deletedPaths.length > 0) {
      setTabs((currentTabs) => {
        const nextTabs = currentTabs.filter((tab) => {
          const documentPath = documentSessions[tab.id]?.document?.path;
          return !documentPath || !isPathInDeletedScope(documentPath, deletedPaths);
        });
        setActiveDocumentId((currentDocumentId) => (
          nextTabs.some((tab) => tab.id === currentDocumentId) ? currentDocumentId : nextTabs[0]?.id ?? ""
        ));
        setActiveTreeNodeId((currentNodeId) => (
          nextTabs.some((tab) => tab.id === currentNodeId) ? currentNodeId : nextTabs[0]?.id ?? ""
        ));
        return nextTabs;
      });
      setDocumentSessions((currentSessions) => {
        const nextSessions = Object.fromEntries(
          Object.entries(currentSessions).filter(([, session]) => {
            const documentPath = session.document?.path;
            return !documentPath || !isPathInDeletedScope(documentPath, deletedPaths);
          }),
        );
        return nextSessions;
      });
      const aiChangedDocumentPath = aiAppliedChange ? documentSessions[aiAppliedChange.documentId]?.document?.path : null;
      if (aiChangedDocumentPath && isPathInDeletedScope(aiChangedDocumentPath, deletedPaths)) {
        setAiAppliedChange(null);
      }
      setPendingEditorOperations((currentOperations) =>
        currentOperations.filter((operation) => {
          const documentPath = documentSessions[operation.documentId]?.document?.path;
          return !documentPath || !isPathInDeletedScope(documentPath, deletedPaths);
        }),
      );
    }

    if (response.updatedHandwrittenNote) {
      const updated = response.updatedHandwrittenNote;
      const session = handwrittenSessionsRef.current[updated.noteId];
      if(session&&updated.draftWriteRevision===undefined){void applyTrackedHandwrittenResponse(response,request,updated);}
      else if (session) {
        handwrittenSessionsRef.current = { ...handwrittenSessionsRef.current, [updated.noteId]: markAiHandwrittenDraftApplied(applyLocalHandwrittenNoteEdit(session, updated.content), updated.content, new Date().toISOString(),updated.draftWriteRevision) };
        setHandwrittenSessions(handwrittenSessionsRef.current);
        setAiAppliedChange({ documentId: updated.noteId, summary: updated.summary });
      }
    }

    if (canActivate && (response.uiPlacement === "conversation_tab" || response.routeToAiTab)) {
      handleSelectTab(AI_CONVERSATION_TAB_ID);
    }

    const createdDocument = response.operations.find((operation) => (
      (operation.type === "document_created" || operation.type === "document_duplicated") && operation.documentId
    ));
    if (createdDocument?.documentId && canActivate) {
      handleOpenDocument(createdDocument.documentId, createdDocument.path?.split("/").pop() ?? "Documento IA");
    }

    if (response.answer && response.display !== "none") {
      setAiBubble({
        id: response.interactionId,
        answer: response.answer,
        usedSkills: response.usedSkills,
        skillApplications: response.skillApplications,
        skillDiagnostics: response.skillDiagnostics,
      });
    }
  }

  async function handleApplyAiEditProposal(proposalId: string, operationIds?: string[], automatic = false) {
    if (!aiProposalExecution.current.begin(proposalId)) return;
    setApplyingAiEditProposalId(proposalId);
    try { await executeAiEditProposal(proposalId, operationIds, automatic); }
    finally { aiProposalExecution.current.finishPreparation(proposalId); releaseAiProposalApplication(proposalId); }
  }

  async function executeAiEditProposal(proposalId: string, operationIds?: string[], automatic = false) {
    if (!aiEditProposal || aiEditProposal.id !== proposalId) return;
    if (automatic && (aiEditProposal.requiresConfirmation !== false || aiConfigRef.current.agentic.confirmBeforeApplying)) { setAutoApplyingAiEditProposalId(null); return; }
    const proposalContext = aiProposalRequests.current.get(proposalId);
    if (!aiConfigRef.current.permissions.editDocuments) {
      if (proposalContext) retainAiResponse(proposalContext.response, proposalContext.request, "El permiso de edición IA está desactivado. El contenido se conserva para revisión.");
      setAutoApplyingAiEditProposalId(null);
      setBlockedAiEditOperationReasons(current => ({ ...current, ...Object.fromEntries(aiEditProposal.operations.map(operation => [operation.id, "permission_revoked"])) }));
      return;
    }
    if (proposalContext) {
      const issue = aiResponseContinuityIssue(proposalContext.request, proposalContext.response, { projectId: activeAiProjectRef.current, projectEpoch: aiWorkspaceEpoch.current.value, documents: documentSessionsRef.current, handwritten: handwrittenSessionsRef.current, notes: notesMarkdownRef.current });
      if (issue) { retainAiResponse(proposalContext.response, proposalContext.request, issue); setAutoApplyingAiEditProposalId(null); return; }
    }
    const selectedOperationIds = new Set(operationIds ?? aiEditProposal.operations.map((operation) => operation.id));
    const staleOperationIds = new Set(getStaleAiEditOperationIds(aiEditProposal, documentSessions, notesMarkdown));
    const blockedOperationIds = new Set(Object.keys(blockedAiEditOperationReasons));
    const appliedOperationIds = new Set(appliedAiEditOperationIds);
    const applicableAiOperations = aiEditProposal.operations.filter((operation) => (
      selectedOperationIds.has(operation.id)
      && !staleOperationIds.has(operation.id)
      && !blockedOperationIds.has(operation.id)
      && !appliedOperationIds.has(operation.id)
    ));
    if (applicableAiOperations.length === 0) {
      setAutoApplyingAiEditProposalId(null);
      setAiBubble({ id: `local-${Date.now()}`, answer: "La propuesta IA ya no coincide con el documento actual. Revisa los cambios o vuelve a pedir la edición." });
      return;
    }
    const activeEditorTargetId = activeWorkspaceTabIdRef.current;
    const preparationProjectEpoch = aiWorkspaceEpoch.current.value;
    const workingMarkdownByDocumentId = new Map<string, string>();
    const initialMarkdownByDocumentId = new Map<string, string>();
    const loadedDocuments = new Map<string, DocumentRecord>();
    const directlyUpdatedDocumentIds = new Set<string>();
    const editorOperations: MarkdownEditorExternalOperation[] = [];
    const skippedOperationIds: string[] = [];
    const skippedOperationReasons: Record<string, AiMarkdownOperationReviewReason> = {};
    const appliedOperationIdsThisRun: string[] = [];

    async function getCurrentMarkdownForAiOperation(documentId: string) {
      if (workingMarkdownByDocumentId.has(documentId)) return workingMarkdownByDocumentId.get(documentId) ?? "";
      if (documentId === NOTES_WORKSPACE_TAB_ID) {
        workingMarkdownByDocumentId.set(documentId, notesMarkdownRef.current);
        initialMarkdownByDocumentId.set(documentId, notesMarkdownRef.current);
        return notesMarkdownRef.current;
      }

      const existingSession = documentSessionsRef.current[documentId];
      if (existingSession) {
        workingMarkdownByDocumentId.set(documentId, existingSession.markdown);
        initialMarkdownByDocumentId.set(documentId, existingSession.markdown);
        return existingSession.markdown;
      }

      const record = await getDocument(documentId);
      loadedDocuments.set(documentId, record);
      workingMarkdownByDocumentId.set(documentId, record.markdown);
      initialMarkdownByDocumentId.set(documentId, record.markdown);
      return record.markdown;
    }

    try {
      for (const operation of applicableAiOperations) {
        const currentMarkdown = await getCurrentMarkdownForAiOperation(operation.documentId);
        if (typeof operation.expectedMarkdown === "string" && operation.expectedMarkdown !== initialMarkdownByDocumentId.get(operation.documentId)) {
          skippedOperationIds.push(operation.id); skippedOperationReasons[operation.id] = "source_changed"; continue;
        }
        const imageMarkdown = operation.action === "insert_image" && operation.imageAssetId && activeProject
          ? (await buildImageReference(activeProject.id, operation.documentId, operation.imageAssetId, operation.imageAltText ?? null)).markdown
          : null;
        const application = applyAiEditOperationToMarkdown({ ...operation, expectedMarkdown: currentMarkdown }, currentMarkdown, { imageMarkdown });
        if (application.applied) {
          workingMarkdownByDocumentId.set(operation.documentId, application.markdown);
          directlyUpdatedDocumentIds.add(operation.documentId);
          appliedOperationIdsThisRun.push(operation.id);
          continue;
        }

        const fallbackEditorOperation = buildActiveEditorAiOperation(aiEditProposal.interactionId, operation, activeEditorTargetId, imageMarkdown);
        if (fallbackEditorOperation) {
          editorOperations.push({ ...fallbackEditorOperation, aiProposalId: proposalId, expectedMarkdown: initialMarkdownByDocumentId.get(operation.documentId) });
          appliedOperationIdsThisRun.push(operation.id);
          continue;
        }

        skippedOperationIds.push(operation.id);
        skippedOperationReasons[operation.id] = application.reason;
      }
    } catch (error) {
      setAutoApplyingAiEditProposalId(null);
      showError(error, "No se pudo preparar la propuesta de edición de IA.", { source: "app.aiEditProposal.apply" });
      return;
    }

    if (automatic && aiConfigRef.current.agentic.confirmBeforeApplying) {
      setAutoApplyingAiEditProposalId(null);
      setAiEditProposal(current => current?.id === proposalId ? { ...current, requiresConfirmation: true } : current);
      return;
    }
    const changedDuringPreparation = preparationProjectEpoch !== aiWorkspaceEpoch.current.value || (proposalContext && !aiProposalRequests.current.has(proposalId)) || !aiConfigRef.current.permissions.editDocuments || Array.from(initialMarkdownByDocumentId).some(([id, initial]) => {
      const current = id === NOTES_WORKSPACE_TAB_ID ? notesMarkdownRef.current : documentSessionsRef.current[id]?.markdown ?? loadedDocuments.get(id)?.markdown;
      return current !== initial;
    });
    if (changedDuringPreparation) {
      if (proposalContext) retainAiResponse(proposalContext.response, proposalContext.request, "El contenido, los permisos o el proyecto cambiaron al preparar la aplicación. Se conserva el resultado sin sustituir tus cambios nuevos.");
      setAutoApplyingAiEditProposalId(null);
      setBlockedAiEditOperationReasons(current => ({ ...current, ...Object.fromEntries(applicableAiOperations.map(operation => [operation.id, "source_changed"])) }));
      return;
    }

    const activeDirectEditorOperations = Array.from(directlyUpdatedDocumentIds)
      .filter((documentId) => usesLiveEditor(documentId,liveEditorSnapshots.current)||!!documentSessionsRef.current[documentId]?.document)
      .flatMap((documentId) => {
        const markdown = workingMarkdownByDocumentId.get(documentId);
        return typeof markdown === "string"
          ? [{
              id: nextAiEditorOperationId(`ai-${aiEditProposal.interactionId}-${documentId}`),
              documentId,
              kind: "replace_document" as const,
              aiProposalId: proposalId,
              expectedMarkdown: initialMarkdownByDocumentId.get(documentId),
              aiEditOperationIds: applicableAiOperations.filter(operation => operation.documentId === documentId && appliedOperationIdsThisRun.includes(operation.id)).map(operation => operation.id),
              markdown,
              source: "ai" as const,
              addToHistory: true,
            }]
          : [];
      });
    const sessionUpdatedDocumentIds = Array.from(directlyUpdatedDocumentIds).filter((documentId) => !usesLiveEditor(documentId,liveEditorSnapshots.current)&&!documentSessionsRef.current[documentId]?.document);
    const confirmedSessionDocumentIds:string[]=[];
    if (sessionUpdatedDocumentIds.length > 0) {
      if (sessionUpdatedDocumentIds.includes(NOTES_WORKSPACE_TAB_ID)) {
        const nextNotesMarkdown = workingMarkdownByDocumentId.get(NOTES_WORKSPACE_TAB_ID);
        if (typeof nextNotesMarkdown === "string") {
          notesMarkdownRef.current = nextNotesMarkdown;
          setNotesMarkdown(nextNotesMarkdown);
          void persistNotes(nextNotesMarkdown);
          confirmedSessionDocumentIds.push(NOTES_WORKSPACE_TAB_ID);
        }
      }
      const projectDocumentIds = sessionUpdatedDocumentIds.filter(id=>id!==NOTES_WORKSPACE_TAB_ID);
      for(const documentId of projectDocumentIds){
        const nextMarkdown=workingMarkdownByDocumentId.get(documentId);const expectedMarkdown=initialMarkdownByDocumentId.get(documentId);
        if(typeof nextMarkdown!=="string"||typeof expectedMarkdown!=="string")continue;
        const journalId=nextAiEditorOperationId("tracked-"+aiEditProposal.interactionId);const expected={projectId:documentId.split("::")[0],epoch:preparationProjectEpoch};
        try{await sessionWrites.current.run(documentId,async()=>{
          const wasAbsent=!documentSessionsRef.current[documentId];const sequence=sessionLoadSequence.current;
          const submitted=documentSessionsRef.current[documentId]??(loadedDocuments.has(documentId)?createLoadedDocumentSession(loadedDocuments.get(documentId) as DocumentRecord):null);
          if(!submitted||submitted.markdown!==expectedMarkdown)throw Error("El documento cambió antes de aplicar IA");
          const allowed=()=>trackedAuthorityIsCurrent(expected,{projectId:activeAiProjectRef.current,epoch:aiWorkspaceEpoch.current.value,canEdit:aiConfigRef.current.permissions.editDocuments,proposalExists:aiProposalRequests.current.has(proposalId)})&&!usesLiveEditor(documentId,liveEditorSnapshots.current)&&(wasAbsent?!documentSessionsRef.current[documentId]&&sequence===sessionLoadSequence.current:sameTrackedVisit(documentSessionsRef.current[documentId],submitted)&&documentSessionsRef.current[documentId]?.markdown===expectedMarkdown);
          if(!allowed())throw Error("La propuesta cambió de ámbito");
          await aiChangeJournal.current.prepare(journalId,documentId,{interactionId:aiEditProposal.interactionId,operationId:journalId,summary:aiEditProposal.summary,beforeMarkdown:submitted.markdown,expectedDraftWriteRevision:submitted.draftWriteRevision??null,baseFingerprint:submitted.baseFingerprint},allowed);
          const result=await aiChangeJournal.current.apply(journalId,nextMarkdown,allowed);
          if(expected.epoch!==aiWorkspaceEpoch.current.value||expected.projectId!==activeAiProjectRef.current)throw Error("El acuse pertenece al espacio anterior; consulta sus cambios");
          const live=wasAbsent&&!documentSessionsRef.current[documentId]&&sequence===sessionLoadSequence.current?submitted:documentSessionsRef.current[documentId];
          if(!sameTrackedVisit(live,submitted)||!live)throw Error("La sesión cambió durante la aplicación; se conserva");
          const acknowledged=acknowledgeDraftWrite(live,submitted,result.draftWriteRevision)!;const edited=live.markdown===submitted.markdown?applyLocalMarkdownEdit(acknowledged,nextMarkdown):acknowledged;
          const next={...edited,...(edited.markdown===nextMarkdown?{lastDraftMarkdown:result.isDirty?nextMarkdown:"",draftUpdatedAt:result.draftUpdatedAt,hasRecoveredDraft:!!result.hasDraft,draftContentHash:result.draftContentHash??null}:{})};documentSessionsRef.current={...documentSessionsRef.current,[documentId]:next};setDocumentSessions(documentSessionsRef.current);
        });confirmedSessionDocumentIds.push(documentId);}
        catch(error){if(documentSessionsRef.current[documentId])markDraftWriteBlocked(documentId,false);skippedOperationIds.push(...applicableAiOperations.filter(x=>x.documentId===documentId).map(x=>x.id));showError(error,"No se confirmó la aplicación IA. Consulta sus cambios; tu trabajo permanece.");}
        finally{aiChangeJournal.current.release(journalId);}
      }
    }

    const operations: MarkdownEditorExternalOperation[] = [...editorOperations, ...activeDirectEditorOperations];
    const queuedOperations:MarkdownEditorExternalOperation[]=[];
    if (operations.length > 0) {
      for (const operation of operations) {
        try{await prepareTrackedEditorChange(operation,aiEditProposal.interactionId,aiEditProposal.summary,preparationProjectEpoch);}catch(error){aiTrackedOperationEpochs.current.delete(operation.id);skippedOperationIds.push(...(operation.aiEditOperationIds??(operation.aiEditOperationId?[operation.aiEditOperationId]:[])));showError(error,"No se pudo registrar el cambio antes de aplicarlo. Se conserva el documento.");continue;}
        if (!aiProposalExecution.current.queue(operation)){aiChangeJournal.current.release(operation.id);aiTrackedOperationEpochs.current.delete(operation.id);continue;}
        queuedOperations.push(operation);
        aiEditorOperationTimers.current.set(operation.id, window.setTimeout(() => {
          if (aiProposalExecution.current.mayApply(operation.id)) handleEditorOperationFailed({ ...operation, failureReason: "editor_apply_failed" });
        }, 15_000));
      }
      setPendingEditorOperations((currentOperations) => [...currentOperations, ...queuedOperations]);
    }

    const changedDocumentIds = Array.from(new Set([...confirmedSessionDocumentIds, ...queuedOperations.map((operation) => operation.documentId)]));
    const changedProjectDocumentIds = changedDocumentIds.filter((documentId) => documentId !== NOTES_WORKSPACE_TAB_ID);
    if (changedProjectDocumentIds.length > 0) {
      setTabs((currentTabs) => {
        const openIds = new Set(currentTabs.map((tab) => tab.id));
        const nextTabs = [...currentTabs];
        for (const documentId of changedProjectDocumentIds) {
          if (openIds.has(documentId)) continue;
          const targetNode = findNodeById(tree, documentId);
          nextTabs.push({ id: documentId, name: targetNode?.name ?? documentId });
          openIds.add(documentId);
        }
        return nextTabs;
      });
    }

    if (changedDocumentIds.length === 0) {
      setAutoApplyingAiEditProposalId(null);
      if (skippedOperationIds.length > 0) {
        setBlockedAiEditOperationReasons((currentReasons) => ({ ...currentReasons, ...skippedOperationReasons }));
      }
      setAiBubble({ id: `local-${Date.now()}`, answer: "La propuesta IA no contiene operaciones aplicables en esta versión." });
      return;
    }
    if (appliedOperationIdsThisRun.length > 0) {
      const awaitingAck = new Set(queuedOperations.flatMap(operation => operation.aiEditOperationIds ?? (operation.aiEditOperationId ? [operation.aiEditOperationId] : [])));
      setAppliedAiEditOperationIds((currentIds) => Array.from(new Set([...currentIds, ...appliedOperationIdsThisRun.filter(id => !awaitingAck.has(id)&&!skippedOperationIds.includes(id))])));
    }
    if (skippedOperationIds.length > 0) {
      setAutoApplyingAiEditProposalId(null);
      setBlockedAiEditOperationReasons((currentReasons) => ({ ...currentReasons, ...skippedOperationReasons }));
    }
    if (confirmedSessionDocumentIds.length > 0) setAiAppliedChange({
      documentId: confirmedSessionDocumentIds[0],
      summary: skippedOperationIds.length === 0 && applicableAiOperations.length === aiEditProposal.operations.length
        ? aiEditProposal.summary
        : `${confirmedSessionDocumentIds.length} documento(s) actualizados como borrador. ${skippedOperationIds.length > 0 ? `${skippedOperationIds.length} cambio(s) requieren revisión.` : ""}`.trim(),
    });
    if (skippedOperationIds.length > 0) {
      setAiBubble({ id: `local-${Date.now()}`, answer: `${confirmedSessionDocumentIds.length?"He aplicado los cambios confirmados":"Se han preparado los cambios pendientes"} y he omitido ${skippedOperationIds.length} operación(es) porque el ancla no era única o ya no coincidía.` });
    }
    const remainingReviewOperationIds = new Set([...Object.keys(blockedAiEditOperationReasons), ...skippedOperationIds, ...Array.from(staleOperationIds)]);
    const nextAppliedOperationIds = new Set([...appliedAiEditOperationIds, ...appliedOperationIdsThisRun]);
    const hasPendingOperations = aiEditProposal.operations.some((operation) => !nextAppliedOperationIds.has(operation.id) || remainingReviewOperationIds.has(operation.id));
    if (skippedOperationIds.length === 0 && !hasPendingOperations && operations.length === 0) {
      clearAiEditProposalState();
    }
  }

  function handleDiscardAiEditProposal(proposalId: string) {
    if (!aiEditProposal || aiEditProposal.id !== proposalId) return;
    if (aiProposalExecution.current.isActive(proposalId)) return;
    clearAiEditProposalState();
    setAiBubble(null);
  }

  function handleDismissAiAppliedChange() {
    setAiAppliedChange(null);
  }

  function handleDocumentSelectionChange(documentId: string, selection: MarkdownEditorSelection | null) {
    const activeSelectionDocumentId = activeUtilityTab === NOTES_UTILITY_TAB_ID ? NOTES_WORKSPACE_TAB_ID : activeDocumentId;
    if (documentId !== activeSelectionDocumentId) return;
    if (!selection) {
      setAiSelectionFocus((currentSelection) => (currentSelection?.documentId === documentId ? null : currentSelection));
      return;
    }

    setAiSelectionFocus({
      documentId,
      path: documentId === NOTES_WORKSPACE_TAB_ID ? NOTES_TITLE : documentSessions[documentId]?.document?.path ?? null,
      focusType: selection.focusType ?? "selection",
      from: selection.from,
      to: selection.to,
      position: selection.position ?? null,
      text: selection.text,
      nearTextBefore: selection.nearTextBefore ?? null,
      nearTextAfter: selection.nearTextAfter ?? null,
      blockType: selection.blockType ?? null,
      blockHash: selection.blockHash ?? null,
    });
  }

  async function handleConfirmAiDelete() {
    if (!activeProject || !aiPendingDelete) return;
    const requestSnapshot = captureAiRequest(activeProject, aiWorkspaceEpoch.current.value, activeDocumentId || null, documentSessionsRef.current, handwrittenSessionsRef.current, notesMarkdownRef.current);
    try {
      const response = await confirmAiDelete(activeProject.id, { confirmationId: aiPendingDelete.confirmationId });
      if (requestSnapshot.projectId === activeAiProjectRef.current && requestSnapshot.projectEpoch === aiWorkspaceEpoch.current.value) setAiPendingDelete(null);
      applyAiInteractionResponse(response, requestSnapshot);
    } catch (error) {
      showError(error, "No se pudo confirmar el borrado solicitado por IA.", { source: "app.aiConfirmDelete" });
    }
  }

  async function handleSave(documentId = activeDocumentId, force = false) {
    if(aiChangeJournal.current.hasDocument(documentId)){setNotice({title:"Cambio IA pendiente",message:"Espera la confirmación antes de guardar. Tu edición permanece abierta.",tone:"info"});return false;}
    const session = documentSessionsRef.current[documentId];
    if (!documentId || !session?.document || pendingSaveIds.current.has(documentId)) return false;
    if(session.draftWriteConflict){await protectBlockedEdit(documentId,false);return false;}
    pendingSaveIds.current.add(documentId);
    const postSaveSyncSequence = ++documentPostSaveSyncSequenceRef.current;
    setDocumentPostSaveSyncState(documentId, postSaveSyncSequence, "idle");
    setDocumentSessions((currentSessions) => updateSession(currentSessions, documentId, { saveState: "saving" }));
    try {
      const saved = await sessionWrites.current.run(documentId, async () => {
        if(aiChangeJournal.current.hasDocument(documentId))throw Error("Espera la confirmación del cambio IA antes de guardar");
        const saved=await saveDocument(documentId, {
        markdown: session.markdown,
        baseFingerprint: session.baseFingerprint,
        expectedDraftWriteRevision: documentSessionsRef.current[documentId]?.draftWriteRevision ?? null,
        force,
      });
      const latest = documentSessionsRef.current[documentId];
      if (latest?.loadVersion === session.loadVersion) documentSessionsRef.current = {
        ...documentSessionsRef.current, [documentId]: acknowledgeDocumentSave(latest, saved, session.markdown),
      };
      setDocumentSessions(currentSessions => {
        const current = currentSessions[documentId];
        if (!current || current.loadVersion !== session.loadVersion) return currentSessions;
        return { ...currentSessions, [documentId]: acknowledgeDocumentSave(current, saved, session.markdown) };
      });
      return saved;
      });
      if (force && session.orphaned && activeProject?.id === saved.projectId) {
        await handleReloadProjectTree(saved.projectId);
      }
      window.setTimeout(() => {
        setDocumentSessions((currentSessions) => {
          const currentSession = currentSessions[documentId];
          if (!currentSession || currentSession.saveState !== "saved") return currentSessions;
          return updateSession(currentSessions, documentId, { saveState: "idle" });
        });
      }, 1400);
      let postSaveSyncFailed = false;
      if (versioningStatus?.enabled) {
        setDocumentPostSaveSyncState(documentId, postSaveSyncSequence, "syncing-local");
        try {
          await createProjectVersion(saved.projectId, documentId, `Actualiza ${saved.name}`);
        } catch (error) {
          if (!isNoVersionChangesError(error)) {
            postSaveSyncFailed = true;
            setDocumentPostSaveSyncState(documentId, postSaveSyncSequence, "error");
            void recordTraceLog({
              source: "app.versioning.afterSave",
              message: "No se pudo crear la versión local tras guardar el documento.",
              detail: describeError(error),
            });
          }
        }
      }
      await refreshProjectCapabilityState(saved.projectId);
      const project = projects.find((candidate) => candidate.id === saved.projectId) ?? (activeProject?.id === saved.projectId ? activeProject : null);
      const shouldAutoSyncRemote = project?.syncMode === "auto-github" && shouldRunAutomaticSync(project, authStatus);
      if (!postSaveSyncFailed && shouldAutoSyncRemote) {
        setDocumentPostSaveSyncState(documentId, postSaveSyncSequence, "syncing-remote");
      }
      const syncStatus = await refreshProjectSyncStatus(saved.projectId, { autoRun: isAutomaticSyncMode(project?.syncMode), silent: true });
      if (!postSaveSyncFailed && shouldAutoSyncRemote && (!syncStatus || syncStatus.state === "error")) {
        postSaveSyncFailed = true;
        setDocumentPostSaveSyncState(documentId, postSaveSyncSequence, "error");
      }
      if (externalChangesOpen) await refreshProjectFileSyncOverview(saved.projectId);
      try {
        const response = await getDocumentsSyncStatus([{ documentId, baseFingerprint: saved.baseFingerprint }]);
        setDocumentSyncStatuses((currentStatuses) => ({
          ...currentStatuses,
          ...Object.fromEntries(response.documents.map((status) => [status.documentId, status])),
        }));
      } catch (error) {
        showError(error, "No se pudo actualizar el estado del documento guardado.", {
          source: "app.documentSync.afterSave",
          suppressApiConnectionNotice: true,
        });
      }
      if (!postSaveSyncFailed) {
        setDocumentPostSaveSyncState(documentId, postSaveSyncSequence, "idle");
      }
      if (saved.recoveryWarning) setNotice({ title: "Documento guardado; copia conservada", message: saved.recoveryWarning, tone: "info" });
      return true;
    } catch (error) {
      setDocumentPostSaveSyncState(documentId, postSaveSyncSequence, "idle");
      setDocumentSessions((currentSessions) => updateSession(currentSessions, documentId, { saveState: "idle" }));
      if(isDraftWriteConflict(error)){markDraftWriteBlocked(documentId,false);void protectBlockedEdit(documentId,false);return false;}
      if (error instanceof ApiError && error.status === 409) {
        setDocumentSessions((currentSessions) => updateSession(currentSessions, documentId, {
          diskChanged: true,
          conflictStatus: "disk-changed",
        }));
        setNotice({
          title: "El archivo cambió en disco",
          message: "El documento se modificó fuera de KnowNext.ai. Revisa el aviso del editor para elegir qué versión mantener.",
          tone: "info",
        });
        return false;
      }
      showError(error, "No se pudo guardar el documento.");
      return false;
    } finally {
      pendingSaveIds.current.delete(documentId);
      const latest = documentSessionsRef.current[documentId];
      if (latest) void persistDraft(documentId, latest);
    }
  }

  async function beforeHandwrittenOcr(noteId:string){
    const session=handwrittenSessionsRef.current[noteId],epoch=aiWorkspaceEpoch.current.value;
    if(!session?.content||session.isLoading||ocrDraftWrites.current.has(noteId)||aiChangeJournal.current.hasDocument(noteId))throw Error("Espera la protección de la nota antes de reconocer su página");
    if(!await checkpointOpenWork())throw Error("Protege los cambios pendientes antes de reconocer o aplicar texto");
    const current=handwrittenSessionsRef.current[noteId];
    if(epoch!==aiWorkspaceEpoch.current.value||!current?.content||current.loadVersion!==session.loadVersion||current.savedContent!==session.savedContent)throw Error("La vista de la nota cambió; vuelve a revisar su página");
  }
  async function applyReviewedHandwrittenOcr(request:HandwrittenOcrApplyRequest):Promise<HandwrittenOcrApply>{
    await beforeHandwrittenOcr(request.noteId);const epoch=aiWorkspaceEpoch.current.value;
    if(ocrDraftWrites.current.has(request.noteId))throw Error("Ya hay una aplicación OCR pendiente");
    ocrDraftWrites.current.add(request.noteId);
    try{return await sessionWrites.current.run(request.noteId,async()=>{
      const submitted=handwrittenSessionsRef.current[request.noteId];if(!submitted?.content||epoch!==aiWorkspaceEpoch.current.value)throw Error("La nota cambió antes de aplicar el texto revisado");
      ocrPendingAcks.current.set(request.noteId,{attemptId:request.attemptId,submitted,epoch});
      const result=await applyHandwrittenOcr(request),live=handwrittenSessionsRef.current[request.noteId];
      if(epoch!==aiWorkspaceEpoch.current.value||!live?.content||live.loadVersion!==submitted.loadVersion||live.savedContent!==submitted.savedContent||live.baseFingerprint?.sha256!==submitted.baseFingerprint?.sha256||result.previousDraftWriteRevision!==(submitted.draftWriteRevision??null))throw Error("El acuse OCR se conserva en la nota original; revisa el intento antes de guardar");
      const content=mergeOcrText(submitted.content,live.content,result.content,result.pageId);
      const acknowledged=acknowledgeDraftWrite(live,submitted,result.draftWriteRevision);if(!acknowledged)throw Error("El borrador cambió durante la confirmación OCR");
      const edited=applyLocalHandwrittenNoteEdit(acknowledged,content);const next={...edited,lastDraftContentJson:stringifyHandwrittenContent(result.content),draftWriteRevision:result.draftWriteRevision,draftUpdatedAt:result.draftUpdatedAt,hasRecoveredDraft:!!result.hasDraft};
      handwrittenSessionsRef.current={...handwrittenSessionsRef.current,[request.noteId]:next};setHandwrittenSessions(handwrittenSessionsRef.current);ocrPendingAcks.current.delete(request.noteId);return result;
    });}catch(error){if(handwrittenSessionsRef.current[request.noteId])markDraftWriteBlocked(request.noteId,true);throw error;}finally{ocrDraftWrites.current.delete(request.noteId);}
  }

  async function observeHandwrittenOcr(receipt:HandwrittenOcrResult){
    const pending=ocrPendingAcks.current.get(receipt.noteId);if(!pending||pending.attemptId!==receipt.attemptId||receipt.phase!=="applied")return;
    if(pending.epoch!==aiWorkspaceEpoch.current.value)throw Error("La vista cambió desde el intento; la copia aplicada permanece en su nota original");
    await sessionWrites.current.run(receipt.noteId,async()=>{
      const record=await getHandwrittenNote(receipt.noteId),live=handwrittenSessionsRef.current[receipt.noteId];
      if(!record.content||record.draftWriteRevision!==receipt.appliedDraftWriteRevision||!live?.content||live.loadVersion!==pending.submitted.loadVersion||live.savedContent!==pending.submitted.savedContent||live.baseFingerprint?.sha256!==pending.submitted.baseFingerprint?.sha256||record.baseFingerprint?.sha256!==pending.submitted.baseFingerprint?.sha256||pending.epoch!==aiWorkspaceEpoch.current.value)throw Error("El borrador o la vista cambiaron después del intento OCR; revisa las copias sin sobrescribir");
      const content=mergeOcrText(pending.submitted.content!,live.content,record.content,receipt.pageId),acknowledged=acknowledgeDraftWrite(live,pending.submitted,record.draftWriteRevision);if(!acknowledged||acknowledged.draftWriteConflict)throw Error("El acuse no confirma la base viva del borrador OCR");
      const next={...applyLocalHandwrittenNoteEdit(acknowledged,content),lastDraftContentJson:stringifyHandwrittenContent(record.content),draftUpdatedAt:record.draftUpdatedAt,hasRecoveredDraft:!!record.hasDraft};
      handwrittenSessionsRef.current={...handwrittenSessionsRef.current,[receipt.noteId]:next};setHandwrittenSessions(handwrittenSessionsRef.current);ocrPendingAcks.current.delete(receipt.noteId);
    });
  }

  async function handleSaveHandwrittenNote(noteId = activeHandwrittenNoteId, force = false) {
    if(aiChangeJournal.current.hasDocument(noteId)||ocrDraftWrites.current.has(noteId)){setNotice({title:"Cambio IA pendiente",message:"Espera la confirmación del cambio IA antes de guardar la nota. Tus trazos permanecen abiertos.",tone:"info"});return false;}
    const session = handwrittenSessionsRef.current[noteId];
    if (!noteId || !session?.note || !session.content || pendingSaveIds.current.has(noteId)) return false;
    if(session.draftWriteConflict){await protectBlockedEdit(noteId,true);return false;}
    pendingSaveIds.current.add(noteId);
    setHandwrittenSessions((currentSessions) => updateHandwrittenNoteSession(currentSessions, noteId, { saveState: "saving" }));
    try {
      const saved = await sessionWrites.current.run(noteId, async () => {
        if(aiChangeJournal.current.hasDocument(noteId)||ocrDraftWrites.current.has(noteId))throw Error("Espera la confirmación del cambio IA antes de guardar la nota");
        const saved=await saveHandwrittenNote(noteId, {
        content: session.content!,
        baseFingerprint: session.baseFingerprint,
        expectedDraftWriteRevision: handwrittenSessionsRef.current[noteId]?.draftWriteRevision ?? null,
        force,
      });
      const latest = handwrittenSessionsRef.current[noteId];
      if (latest?.loadVersion === session.loadVersion) handwrittenSessionsRef.current = {
        ...handwrittenSessionsRef.current, [noteId]: acknowledgeHandwrittenSave(latest, saved, session.content!),
      };
      setHandwrittenSessions(currentSessions => {
        const current = currentSessions[noteId];
        if (!current || current.loadVersion !== session.loadVersion) return currentSessions;
        return { ...currentSessions, [noteId]: acknowledgeHandwrittenSave(current, saved, session.content!) };
      });
      return saved;
      });
      window.setTimeout(() => {
        setHandwrittenSessions((currentSessions) => {
          const currentSession = currentSessions[noteId];
          if (!currentSession || currentSession.saveState !== "saved") return currentSessions;
          return updateHandwrittenNoteSession(currentSessions, noteId, { saveState: "idle" });
        });
      }, 1400);
      if (versioningStatus?.enabled) {
        try {
          await createProjectVersion(saved.projectId, noteId, `Actualiza ${saved.name}`);
        } catch (error) {
          if (!isNoVersionChangesError(error)) {
            void recordTraceLog({
              source: "app.versioning.afterHandwrittenSave",
              message: "No se pudo crear la versión local tras guardar la nota.",
              detail: describeError(error),
            });
          }
        }
      }
      await refreshProjectCapabilityState(saved.projectId);
      const project = projects.find((candidate) => candidate.id === saved.projectId) ?? (activeProject?.id === saved.projectId ? activeProject : null);
      await refreshProjectSyncStatus(saved.projectId, { autoRun: isAutomaticSyncMode(project?.syncMode), silent: true });
      if (externalChangesOpen) await refreshProjectFileSyncOverview(saved.projectId);
      if (saved.recoveryWarning) setNotice({ title: "Nota guardada; copia conservada", message: saved.recoveryWarning, tone: "info" });
      return true;
    } catch (error) {
      setHandwrittenSessions((currentSessions) => updateHandwrittenNoteSession(currentSessions, noteId, { saveState: "error" }));
      if(isDraftWriteConflict(error)){markDraftWriteBlocked(noteId,true);void protectBlockedEdit(noteId,true);return false;}
      if (error instanceof ApiError && error.status === 409) {
        setHandwrittenSessions(current => updateHandwrittenNoteSession(current, noteId, { diskChanged: true, conflictStatus: "disk-changed" }));
        setNotice({ title: "Revisa las versiones de la nota", message: "Se conservan tus trazos. Elige entre cargar el archivo del disco o mantener tu versión.", tone: "info" });
        return false;
      }
      showError(error, "No se pudo guardar la nota a mano.");
      return false;
    } finally {
      pendingSaveIds.current.delete(noteId);
      const latest = handwrittenSessionsRef.current[noteId];
      if (latest) void persistHandwrittenDraft(noteId, latest);
    }
  }

  async function handleSelectProject(project: Project) {
    if (project.id === activeProject?.id) return;
    if (!await flushPendingDrafts()) return;
    if (activeProject) {
      setTabsByProject((currentTabsByProject) => ({
        ...currentTabsByProject,
        [activeProject.id]: normalizeProjectTabs({
          openTabs: tabs,
          activeDocumentId,
          openHandwrittenTabs: handwrittenTabs,
          activeHandwrittenNoteId,
          activeWorkspaceTabId: activeWorkspaceTabIdForConfig,
        }),
      }));
    }

    try {
      const active = await persistActiveProject(project.id);
      let nextTree:DocumentTreeNode[]=[],nextTreeIssue:string|null=null;
      try{nextTree=await getProjectTree(active.id);}catch(error){nextTreeIssue=getApiErrorMessage(error,"No se pudo leer la estructura del proyecto.");}
      const restoredTree = applyTreeOpenState(nextTree, {
        openPaths: treeOpenPathsByProject[active.id] ?? [],
      });
      const nextVersioningStatus = await getProjectVersioningStatus(active.id);
      const nextProjectTabs = resolveProjectTabs(tabsByProject,active.id,restoredTree,!nextTreeIssue);
      setProjects((currentProjects) => currentProjects.map((currentProject) => ({
        ...currentProject,
        active: currentProject.id === active.id,
      })));
      setActiveProject(active);
      setVersioningStatus(nextVersioningStatus);
      ++treeReadSequence.current;setTree(restoredTree);setTreeReadIssue(nextTreeIssue?{projectId:active.id,message:nextTreeIssue}:null);setTreeReadBusy(false);
      if(!nextTreeIssue)persistTreeOpenState(active.id,restoredTree);
      setTabs(nextProjectTabs.openTabs);
      setActiveDocumentId(nextProjectTabs.activeDocumentId);
      setHandwrittenTabs(nextProjectTabs.openHandwrittenTabs ?? []);
      setActiveHandwrittenNoteId(nextProjectTabs.activeHandwrittenNoteId ?? "");
      setActiveTreeNodeId(nextProjectTabs.activeWorkspaceTabId || nextProjectTabs.activeHandwrittenNoteId || nextProjectTabs.activeDocumentId);
      setImageTabs([]);
      setActiveImageId("");
      setReferenceDocumentTabs([]);
      setActiveReferenceDocumentId("");
      setDocumentSessions({});
      setHandwrittenSessions({});
      setExternalChangeSet(null);
      setExternalChangeDecisions({});
      setExternalChangesMessage(null);
      setProjectSyncState("synced");
      if (aiEditProposal) {
        const context = aiProposalRequests.current.get(aiEditProposal.id);
        if (context) retainAiResponse(context.response, context.request, "Cambiaste de proyecto con un resultado pendiente de aplicar. Se conserva para revisión.");
        setPendingEditorOperations(current => current.filter(operation => operation.aiProposalId !== aiEditProposal.id));
      }
      clearAiEditProposalState();
      void refreshExternalChangeSet(active.id, { refreshTreeOnChanges: true, silent: true });
      if (!nextVersioningStatus.enabled) setHistoryOpen(false);
    } catch (error) {
      showError(error, "No se pudo cambiar de proyecto.");
    }
  }

  async function handleCreateFolder(parentId: string | null = null) {
    if (!activeProject) return;
    try {
      const result = await createFolder(activeProject.id, parentId, getUniqueFolderName(tree));
      if(result.treeAvailable!==false)setProjectTree(activeProject.id,markNodeEditing(result.tree,result.node?.id??null));else applyFileOperationResult(result);
    } catch (error) {
      showError(error, "No se pudo crear la carpeta.");
    }
  }

  async function handleRenameNode(nodeId: string, name: string) {
    if (!activeProject) return;
    const previousNode = findNodeById(tree, nodeId);
    const nextName = name.trim() || (previousNode?.type === "folder" ? "Nueva carpeta" : previousNode?.name ?? "archivo");
    if (previousNode?.name === nextName) {
      updateCurrentProjectTree((currentTree) => renameNode(currentTree, nodeId, nextName));
      return;
    }

    const projectId=activeProject.id,epoch=aiWorkspaceEpoch.current.value;
    const stillHere=()=>activeAiProjectRef.current===projectId&&aiWorkspaceEpoch.current.value===epoch;
    if(!previousNode)return;
    try {
      if(!await flushPendingDrafts()||!stillHere())return;
      const links=await getAssetLinks(projectId,nodeId);
      if(!stillHere())return;
      if(links.incoming.length||links.outgoing.length||!links.complete){
        const accepted=await assetMoveReview.request({operation:"rename",nextName,name:previousNode.name,path:previousNode.path??previousNode.name,incoming:links.incoming.length,outgoing:links.outgoing.length,complete:links.complete,warnings:links.warnings});
        if(!accepted){if(stillHere())updateCurrentProjectTree(current=>markNodeEditing(current,null));return;}
      }
      if(!stillHere())return;
      const result=await renameTreeNode(projectId,nodeId,nextName);
      if(!stillHere())return;
      applyFileOperationResult(result,previousNode);
    } catch (error) {
      if(!stillHere())return;
      showError(error, "No se pudo renombrar el elemento.");
      updateCurrentProjectTree((currentTree) => markNodeEditing(currentTree, null));
    }
  }

  function handleToggleNode(nodeId: string) {
    updateCurrentProjectTree((currentTree) => toggleNodeOpen(currentTree, nodeId));
  }

  function handleExpandTree() {
    updateCurrentProjectTree((currentTree) => setAllFoldersOpen(currentTree, true));
  }

  function handleCollapseTree() {
    updateCurrentProjectTree((currentTree) => setAllFoldersOpen(currentTree, false));
  }

  async function handleCreateDocument(request: CreateDocumentRequest) {
    if (!activeProject) return false;
    const projectId = activeProject.id;
    const projectName = activeProject.name;
    const epoch = aiWorkspaceEpoch.current.value;
    const documentName = request.name.trim();
    try {
      let result: FileOperationResult;
      if (request.kind === "handwritten-note") {
        result = await createHandwrittenNote(projectId, createDocumentParentId, documentName, request.background);
      } else {
        const markdownName = documentName.toLowerCase().endsWith(".md") ? documentName : `${documentName}.md`;
        if (!request.templateRevision) throw new Error("Vuelve a cargar la plantilla antes de crear el documento.");
        result = await createDocumentFromTemplate(request.template, { projectId, parentId: createDocumentParentId, name: markdownName, revision: request.templateRevision, values: request.templateValues ?? {}, projectRootHash: request.templateProjectRootHash });
      }
      if (activeAiProjectRef.current !== projectId || aiWorkspaceEpoch.current.value !== epoch) {
        setNotice({ title: "Documento creado", message: `«${result.node?.name ?? documentName}» se creó en «${projectName}». La vista actual se mantiene.`, tone: "info" });
        return true;
      }
      applyFileOperationResult(result);
      if (result.node?.type === "document") {
        openOrReplaceTab(result.node.id, result.node.name);
      } else if (result.node?.type === "handwritten-note") {
        handleOpenHandwrittenNote(result.node.id, result.node.name);
      }
      setCreateDocumentOpen(false);
      setCreateDocumentParentId(null);
      return true;
    } catch (error) {
      showError(error, "No se pudo crear el documento.");
      return false;
    }
  }

  async function handleCreateProject(project: ProjectPayload) {
    let registeredProject: Project | null = null;
    try {
      if (!await flushPendingDrafts()) return false;
      const nextProject = await createProject(project);
      registeredProject = nextProject;

      setProjects((currentProjects) => [
        ...currentProjects.map((currentProject) => ({ ...currentProject, active: false })),
        nextProject,
      ]);
      let nextTree:DocumentTreeNode[]=[],nextTreeIssue:string|null=null;
      try{nextTree=await getProjectTree(nextProject.id);}catch(error){nextTreeIssue=getApiErrorMessage(error,"Proyecto creado; no se pudo consultar su estructura.");}
      const restoredTree = applyTreeOpenState(nextTree);
      const nextProjectTabs = resolveProjectTabs({}, nextProject.id, restoredTree,!nextTreeIssue);
      setActiveProject(nextProject);
      ++treeReadSequence.current;setTree(restoredTree);setTreeReadIssue(nextTreeIssue?{projectId:nextProject.id,message:nextTreeIssue}:null);setTreeReadBusy(false);
      if(!nextTreeIssue)persistTreeOpenState(nextProject.id, restoredTree);
      setTabs(nextProjectTabs.openTabs);
      setActiveDocumentId(nextProjectTabs.activeDocumentId);
      setHandwrittenTabs(nextProjectTabs.openHandwrittenTabs ?? []);
      setActiveHandwrittenNoteId(nextProjectTabs.activeHandwrittenNoteId ?? "");
      setActiveTreeNodeId(nextProjectTabs.activeWorkspaceTabId || nextProjectTabs.activeHandwrittenNoteId || nextProjectTabs.activeDocumentId);
      setImageTabs([]);
      setActiveImageId("");
      setReferenceDocumentTabs([]);
      setActiveReferenceDocumentId("");
      setDocumentSessions({});
      setHandwrittenSessions({});
      setTabsByProject((currentTabsByProject) => ({
        ...currentTabsByProject,
        [nextProject.id]: nextProjectTabs,
      }));
      setHistoryOpen(false);
      setCreateProjectOpen(false);
      await refreshProjectCapabilityState(nextProject.id);
      return true;
    } catch (error) {
      if (registeredProject) {
        setCreateProjectOpen(false);
        showError(error, "El proyecto se ha creado, pero no se pudo completar su apertura. Selecciónalo de nuevo en la lista de proyectos.");
        return true;
      }
      showError(error, "No se pudo crear el proyecto.");
      return false;
    }
  }

  async function handleUpdateProject(projectId: string, project: ProjectPayload) {
    let locationChanged=false;
    let locationSubmitted=false;
    try {
      if (!await flushPendingDrafts()) return false;
      const currentProject = projects.find((candidate) => candidate.id === projectId);
      locationChanged=Boolean(currentProject&&currentProject.folderPath!==project.folderPath);
      if(locationChanged&&currentProject){
        const review=await projectLocationReview.request(projectId,project.folderPath);
        if(!review||!projectLocationReview.owns(projectId)||!await flushPendingDrafts()||!projectLocationReview.owns(projectId))return false;
        project={...project,locationReview:{registryRevision:review.registryRevision,folderStamp:review.folderStamp,candidatePath:review.candidatePath},syncMode:"none",versioningMode:"none",storageMode:currentProject.storageMode,githubRepository:currentProject.githubRepository,publishToGithub:null};
      }
      const githubRepository = project.githubRepository;
      const githubSyncMode = project.syncMode === "auto-github" ? "auto-github" : "manual-github";
      const isNewGithubConnection = Boolean(!locationChanged&&!currentProject?.githubRepository && githubRepository && project.syncMode !== "none");
      const isGithubPublish = Boolean(isNewGithubConnection && project.publishToGithub && githubRepository);
      const isGithubConnect = Boolean(isNewGithubConnection && !project.publishToGithub && githubRepository);
      const identityPayload = isNewGithubConnection && currentProject
        ? {
          ...project,
          versioningMode: currentProject.versioningMode,
          syncMode: currentProject.syncMode,
          githubRepository: currentProject.githubRepository ?? null,
          publishToGithub: null,
        }
        : project;

      locationSubmitted=locationChanged;
      await updateProject(projectId, identityPayload);
      if (!locationChanged&&currentProject?.versioningMode === "none" && project.versioningMode === "local-git" && !isNewGithubConnection) {
        await enableProjectHistory(projectId);
      }
      if (isGithubPublish && githubRepository && project.publishToGithub) {
        await publishProjectGithub(projectId, {
          owner: githubRepository.owner,
          repo: githubRepository.repo,
          visibility: project.publishToGithub.visibility,
          description: project.publishToGithub.description,
          syncMode: githubSyncMode,
        });
      } else if (isGithubConnect && githubRepository) {
        await connectProjectGithub(projectId, {
          owner: githubRepository.owner,
          repo: githubRepository.repo,
          defaultRef: githubRepository.defaultRef ?? null,
          rootPath: githubRepository.rootPath,
          syncMode: githubSyncMode,
        });
      } else if (!locationChanged&&currentProject?.githubRepository && currentProject.syncMode !== project.syncMode) {
        await changeProjectSyncMode(projectId, project.syncMode);
      }

      const refreshedProjects = await listProjects();
      const updatedProject = refreshedProjects.find((candidate) => candidate.id === projectId) ?? currentProject ?? null;
      setProjects(refreshedProjects);
      if(locationChanged&&!projectLocationReview.owns(projectId))return true;
      if (updatedProject) {
        setActiveProject((currentProject) => (
          currentProject?.id === projectId ? updatedProject : currentProject
        ));
      }
      if (activeProject?.id === projectId) {
        let nextTree:DocumentTreeNode[]=[],nextTreeIssue:string|null=null;
        try{nextTree=await getProjectTree(projectId);}catch(error){nextTreeIssue=getApiErrorMessage(error,"Proyecto actualizado; no se pudo consultar su estructura.");}
        const restoredTree = applyTreeOpenState(nextTree, {
          currentTree: tree,
          openPaths: treeOpenPathsByProject[projectId] ?? [],
        });
        const nextVersioningStatus = await getProjectVersioningStatus(projectId);
        if(locationChanged&&!projectLocationReview.owns(projectId))return true;
        ++treeReadSequence.current;setTree(restoredTree);setTreeReadIssue(nextTreeIssue?{projectId,message:nextTreeIssue}:null);setTreeReadBusy(false);
        if(!nextTreeIssue)persistTreeOpenState(projectId, restoredTree);
        setVersioningStatus(nextVersioningStatus);
        const nextProjectTabs = resolveProjectTabs(tabsByProject, projectId, restoredTree,!nextTreeIssue);
        setTabs(nextProjectTabs.openTabs);
        setActiveDocumentId(nextProjectTabs.activeDocumentId);
        setHandwrittenTabs(nextProjectTabs.openHandwrittenTabs ?? []);
        setActiveHandwrittenNoteId(nextProjectTabs.activeHandwrittenNoteId ?? "");
        setActiveTreeNodeId(nextProjectTabs.activeWorkspaceTabId || nextProjectTabs.activeHandwrittenNoteId || nextProjectTabs.activeDocumentId);
        setImageTabs([]);
        setActiveImageId("");
        setReferenceDocumentTabs([]);
        setActiveReferenceDocumentId("");
        setDocumentSessions({});
        setHandwrittenSessions({});
        if (!nextVersioningStatus.enabled) setHistoryOpen(false);
        await refreshProjectSyncStatus(projectId, { autoRun: isAutomaticSyncMode(updatedProject?.syncMode), silent: true });
        await refreshProjectActivity(projectId);
      }
      setEditProjectOpen(false);
      return true;
    } catch (error) {
      if(locationSubmitted){
        try{const latest=await listProjects();setProjects(latest);setActiveProject(current=>{const confirmed=latest.find(p=>p.id===projectId);return current?.id===projectId&&confirmed&&confirmed.folderPath!==current.folderPath?confirmed:current;});}catch{/* Reconcile by reading; never replay an association change. */}
      }
      showError(error, locationSubmitted?"No se pudo confirmar todo el cambio de ubicación. Revisa la asociación actual; los borradores se conservan.":"No se pudo guardar el proyecto.");
      return false;
    }
  }

  async function handleDeleteProject(projectId: string) {
    try {
      if (!await flushPendingDrafts(projectId)) return false;
      if(!configPersistenceAvailable)throw new Error("No se puede conservar el estado de trabajo. Revisa el almacenamiento local antes de retirar el proyecto.");
      const preservedTabs={...tabsByProject,...(activeProject?.id===projectId?{[projectId]:normalizeProjectTabs({openTabs:tabs,activeDocumentId,openHandwrittenTabs:handwrittenTabs,activeHandwrittenNoteId,activeWorkspaceTabId:activeWorkspaceTabIdForConfig})}:{})};
      const nextProjects=await retireProjectWithWorkspace(projectId,{layout:layoutConfig,appearance:appearanceConfig,diagnostics:diagnosticsConfig,handwritten:handwrittenConfig,tabsByProject:preservedTabs,treeOpenPathsByProject,lastRunAppVersion,lastSeenReleaseNotesVersion,openUtilityTabs,activeUtilityTab},write=>saveSettings("app","configuration",write,()=>{}));
      setTabsByProject(preservedTabs);
      const nextActiveProject = nextProjects.find((project) => project.active) ?? nextProjects[0];

      setProjects(nextProjects);
      setEditProjectOpen(false);

      if (!nextActiveProject) {
        setActiveProject(null);
        setVersioningStatus(null);
        setTree([]);
        setTabs([]);
        setActiveDocumentId("");
        setHandwrittenTabs([]);
        setActiveHandwrittenNoteId("");
        setActiveTreeNodeId("");
        setImageTabs([]);
        setActiveImageId("");
        setReferenceDocumentTabs([]);
        setActiveReferenceDocumentId("");
        setDocumentSessions({});
        setHandwrittenSessions({});
        setHistoryOpen(false);
        setExternalChangeSet(null);
        setExternalChangeDecisions({});
        setExternalChangesMessage(null);
        setProjectSyncState("synced");
        return true;
      }

      let nextTree:DocumentTreeNode[]=[],nextTreeIssue:string|null=null;
      try{nextTree=await getProjectTree(nextActiveProject.id);}catch(error){nextTreeIssue=getApiErrorMessage(error,"No se pudo consultar la estructura del siguiente proyecto.");}
      const restoredTree = applyTreeOpenState(nextTree, {
        openPaths: treeOpenPathsByProject[nextActiveProject.id] ?? [],
      });
      const nextVersioningStatus = await getProjectVersioningStatus(nextActiveProject.id);
      const nextProjectTabs = resolveProjectTabs(tabsByProject, nextActiveProject.id, restoredTree,!nextTreeIssue);
      setActiveProject(nextActiveProject);
      setVersioningStatus(nextVersioningStatus);
      ++treeReadSequence.current;setTree(restoredTree);setTreeReadIssue(nextTreeIssue?{projectId:nextActiveProject.id,message:nextTreeIssue}:null);setTreeReadBusy(false);
      if(!nextTreeIssue)persistTreeOpenState(nextActiveProject.id, restoredTree);
      setTabs(nextProjectTabs.openTabs);
      setActiveDocumentId(nextProjectTabs.activeDocumentId);
      setHandwrittenTabs(nextProjectTabs.openHandwrittenTabs ?? []);
      setActiveHandwrittenNoteId(nextProjectTabs.activeHandwrittenNoteId ?? "");
      setActiveTreeNodeId(nextProjectTabs.activeWorkspaceTabId || nextProjectTabs.activeHandwrittenNoteId || nextProjectTabs.activeDocumentId);
      setImageTabs([]);
      setActiveImageId("");
      setReferenceDocumentTabs([]);
      setActiveReferenceDocumentId("");
      setDocumentSessions({});
      setHandwrittenSessions({});
      if (!nextVersioningStatus.enabled) setHistoryOpen(false);
      return true;
    } catch (error) {
      showError(error, "No se pudo confirmar la retirada. Los archivos se conservan; actualiza antes de reintentar.");
      return false;
    }
  }

  async function handleOpenGithubLogin() {
    setGithubLoginOpen(true);
    if ((githubDevice?.mock || !githubDevice || githubLoginState === "error") && githubLoginState !== "starting") {
      await handleStartGithubLogin();
    }
  }

  async function handleStartGithubLogin() {
    const epoch=++githubAuthEpochRef.current;
    setGithubLoginState("starting");
    setGithubLoginError(null);
    setGithubDevice(null);
    try {
      const device = await startGithubDeviceFlow();
      if(epoch!==githubAuthEpochRef.current)return;
      if (device.status === "error" && !device.mock) {
        setGithubDevice(null);
        setGithubLoginState("error");
        setGithubLoginError(getGithubDeviceFlowErrorMessage(device.error));
        return;
      }
      setGithubDevice(device);
      setGithubLoginState("waiting");
    } catch (error) {
      if(epoch!==githubAuthEpochRef.current)return;
      setGithubLoginState("error");
      setGithubLoginError(getApiErrorMessage(error, "No se pudo iniciar el login con GitHub."));
    }
  }

  async function handlePollGithubLogin() {
    if (!githubDevice || githubLoginPollingRef.current) return;
    if (githubDevice.mock && !import.meta.env.DEV) return;
    const epoch=githubAuthEpochRef.current;
    githubLoginPollingRef.current = true;
    setGithubLoginPolling(true);
    setGithubLoginError(null);
    try {
      const response = await pollGithubDeviceFlow(githubDevice.deviceCode);
      if(epoch!==githubAuthEpochRef.current)return;
      if (response.status === "authenticated") {
        setAuthStatus(response.auth);
        setGithubLoginState("authenticated");
        setGithubLoginOpen(false);
        setGithubDevice(null);
        await refreshProjectCapabilityState();
        await refreshProjectSyncStatus(activeProject?.id, { silent: true });
        return;
      }
      setGithubLoginState(response.status === "pending" ? "waiting" : response.status);
      const nextInterval = response.interval ?? (response.error === "slow_down" ? githubDevice.interval + 5 : null);
      if (nextInterval) {
        setGithubDevice({ ...githubDevice, interval: nextInterval });
      }
      setGithubLoginError(response.status === "error" ? getGithubDeviceFlowErrorMessage(response.error) : null);
    } catch (error) {
      if(epoch!==githubAuthEpochRef.current)return;
      setGithubLoginState("error");
      setGithubLoginError(getApiErrorMessage(error, "No se pudo completar el login con GitHub."));
    } finally {
      githubLoginPollingRef.current = false;
      setGithubLoginPolling(false);
    }
  }

  async function handleOpenGithubDevicePage() {
    if (!githubDevice) return;
    try {
      await openExternalUrl(githubDevice.verificationUri);
    } catch (error) {
      setGithubLoginError(getApiErrorMessage(error, "No se pudo abrir GitHub en el navegador."));
    }
  }

  function handleCloseGithubLogin() {
    setGithubLoginOpen(false);
    if (githubDevice?.mock || githubLoginState === "error") {
      setGithubDevice(null);
      setGithubLoginState("idle");
      setGithubLoginError(null);
    }
  }

  async function handleLogoutGithub() {
    ++githubAuthEpochRef.current;
    try {
      const auth = await logoutGithub();
      setAuthStatus(auth);
      setGithubDevice(null);
      setGithubLoginState("idle");
      setHistoryOpen(false);
      await refreshProjectCapabilityState();
      await refreshProjectSyncStatus(activeProject?.id, { silent: true });
    } catch (error) {
      showError(error, "No se pudo cerrar sesión de GitHub.");
    }
  }

  async function handlePullProject() {
    if (!activeProject || syncState !== "idle") return false;
    if (!canUseGithubRemote(activeProject, authStatus, projectSyncStatus)) {
      const status = withDerivedRemoteSyncStatus(projectSyncStatus ?? {
        projectId: activeProject.id,
        mode: activeProject.syncMode === "auto-github" ? "github-auto" : "github-manual",
        state: "local-history",
        label: "GitHub pausado",
        detail: "Sin cuenta GitHub. Puedes seguir trabajando con historial local.",
        pendingPush: false,
        pendingPull: false,
        hasConflicts: false,
        conflicts: [],
      }, activeProject, authStatus);
      setProjectSyncStatus(status);
      setProjectSyncState(status.state);
      setExternalChangesMessage(status.detail ?? status.label);
      setNotice({ title: "GitHub pausado", message: "Conecta GitHub para traer cambios remotos. El proyecto local sigue editable.", tone: "info" });
      void refreshProjectFileSyncOverview(activeProject.id);
      return false;
    }
    const operation=projectWork.begin(activeProject.id);if(!operation)return false;
    setSyncState("pulling");
    setExternalChangesMessage("Actualizando el proyecto desde GitHub.");
    try {
      const response = await pullProject(activeProject.id);
      if(!operation.owns())return false;
      if(response.status!=="synced")throw new Error(response.message);
      await handleReloadProjectTree(activeProject.id);
      if(!operation.owns())return false;
      await refreshProjectCapabilityState(activeProject.id);
      if(!operation.owns())return false;
      await refreshExternalChangeSet(activeProject.id, { silent: true });
      if(!operation.owns())return false;
      await refreshProjectSyncStatus(activeProject.id, { silent: true });
      if(!operation.owns())return false;
      await refreshProjectActivity(activeProject.id);
      if(!operation.owns())return false;
      await refreshProjectFileSyncOverview(activeProject.id);
      if(!operation.owns())return false;
      setExternalChangesMessage(response.message);
      return true;
    } catch (error) {
      if(!operation.owns())return false;
      showError(error, "No se pudo traer cambios del proveedor remoto.");
      return false;
    } finally {
      if(operation.owns())setSyncState("idle");
      operation.release();
    }
  }

  async function refreshProjectActivity(projectId = activeProject?.id) {
    if (!projectId) return;
    const owns=projectWork.read("activity",projectId);if(!owns)return;
    try {
      const activity = await getProjectActivity(projectId);
      if(owns())setProjectActivity(activity.events);
    } catch {
      if(owns())setProjectActivity([]);
    }
  }

  async function refreshProjectFileSyncOverview(projectId = activeProject?.id) {
    if (!projectId) return;
    const owns=projectWork.read("file-overview",projectId);if(!owns)return;
    try {
      setFileSyncOverviewError(null);
      const overview=await getProjectFileSyncOverview(projectId);
      if(owns())setFileSyncOverview(overview);
    } catch (error) {
      if(!owns())return;
      setFileSyncOverview(null);
      setFileSyncOverviewError(getApiErrorMessage(error, "No se pudo cargar el estado de archivos."));
    }
  }

  async function handleRefreshProtectionState(projectId = activeProject?.id) {
    if (!projectId) return;
    const operation=projectWork.begin(projectId);if(!operation)return;
    try {
      await Promise.all([
        refreshExternalChangeSet(projectId, { refreshTreeOnChanges: true }),
        refreshProjectSyncStatus(projectId, { autoRun: isAutomaticSyncMode(activeProject?.syncMode), silent: true }),
        refreshProjectActivity(projectId),
        refreshProjectFileSyncOverview(projectId),
      ]);
    } finally {
      operation.release();
    }
  }

  async function handlePushProject() {
    if (!activeProject || syncState !== "idle") return;
    if (!canUseGithubRemote(activeProject, authStatus, projectSyncStatus)) {
      const status = withDerivedRemoteSyncStatus(projectSyncStatus ?? {
        projectId: activeProject.id,
        mode: activeProject.syncMode === "auto-github" ? "github-auto" : "github-manual",
        state: "local-pending",
        label: "GitHub pausado",
        detail: "Sin cuenta GitHub. Los cambios quedan guardados localmente hasta recuperar acceso.",
        pendingPush: true,
        pendingPull: false,
        hasConflicts: false,
        conflicts: [],
      }, activeProject, authStatus);
      setProjectSyncStatus({ ...status, state: "local-pending", pendingPush: true, localState: "pending-push" });
      setProjectSyncState("local-pending");
      setExternalChangesMessage("Cambios guardados localmente. GitHub queda pendiente hasta recuperar acceso.");
      setNotice({ title: "GitHub pausado", message: "Los cambios quedan en historial local. Conecta GitHub para subirlos.", tone: "info" });
      void refreshProjectFileSyncOverview(activeProject.id);
      return;
    }
    const operation=projectWork.begin(activeProject.id);if(!operation)return;
    setSyncState("pushing");
    setExternalChangesMessage("Subiendo el historial local a GitHub.");
    try {
      const response = await pushProject(activeProject.id);
      if(!operation.owns())return;
      await refreshProjectCapabilityState(activeProject.id);
      if(!operation.owns())return;
      await refreshProjectSyncStatus(activeProject.id, { silent: true });
      if(!operation.owns())return;
      await refreshExternalChangeSet(activeProject.id, { silent: true });
      if(!operation.owns())return;
      await refreshProjectActivity(activeProject.id);
      if(!operation.owns())return;
      await refreshProjectFileSyncOverview(activeProject.id);
      if(!operation.owns())return;
      setExternalChangesMessage(response.message);
      if (response.status === "synced") setExternalChangesOpen(false);
    } catch (error) {
      if(!operation.owns())return;
      showError(error, "No se pudieron enviar cambios al proveedor remoto.");
    } finally {
      if(operation.owns())setSyncState("idle");
      operation.release();
    }
  }

  async function handleOpenProjectGithub() {
    const repository = activeProject?.githubRepository;
    if (!repository) return;
    await openExternalUrl(`https://github.com/${repository.owner}/${repository.repo}`);
  }

  async function handleSynchronizeActiveDocument(options: { preserveDraft?: boolean } = {}) {
    if (!activeProject || !activeDocumentId || !versioningStatus?.enabled) return false;
    const session = documentSessions[activeDocumentId];
    const documentName = session?.document?.name ?? "documento";

    if (session?.isDirty && !options.preserveDraft) {
      const saved = await handleSave(activeDocumentId);
      if (!saved) return false;
    }

    const manualSyncSequence = ++documentPostSaveSyncSequenceRef.current;
    setDocumentPostSaveSyncState(activeDocumentId, manualSyncSequence, "idle");
    setProjectSyncState("syncing");
    try {
      const documentHasLocalChanges = Boolean(
        activeDocumentSyncStatus?.localChanged
        || activeDocumentSyncStatus?.versionState === "local-ahead"
        || (session?.isDirty && !options.preserveDraft),
      );
      if (activeProject.versioningMode === "local-git" && documentHasLocalChanges) {
        try {
          await createProjectVersion(activeProject.id, activeDocumentId, `Actualiza ${documentName}`);
        } catch (error) {
          if (!isNoVersionChangesError(error)) throw error;
        }
        await refreshProjectCapabilityState(activeProject.id);
      }

      if (isGithubSyncMode(activeProject.syncMode)) {
        if (!canUseGithubRemote(activeProject, authStatus, projectSyncStatus)) {
          await refreshProjectSyncStatus(activeProject.id, { silent: true });
          await checkOpenDocumentSync();
          setExternalChangesMessage("Documento guardado localmente. GitHub queda pendiente hasta recuperar acceso.");
          return false;
        }
        const response = await pushProject(activeProject.id);
        if(response.status!=="synced")throw new Error(response.message);
        await refreshProjectCapabilityState(activeProject.id);
        await refreshProjectSyncStatus(activeProject.id, { silent: true });
        await checkOpenDocumentSync();
        setExternalChangesMessage(response.message);
        return true;
      }

      await refreshProjectSyncStatus(activeProject.id, { silent: true });
      await checkOpenDocumentSync();
      return true;
    } catch (error) {
      setProjectSyncState("error");
      showError(error, "No se pudo sincronizar el documento.");
      return false;
    }
  }

  async function handleDiscardActiveDocumentDraft(documentId = activeDocumentId) {
    if (!documentId) return false;
    try {
      if (!await handleLoadDiskVersion(documentId)) return false;
      await checkOpenDocumentSync();
      if (activeProject && externalChangesOpen) await refreshProjectFileSyncOverview(activeProject.id);
      setNotice({ title: "Cambios descartados", message: "Se ha restaurado la última versión guardada del documento.", tone: "info" });
      return true;
    } catch (error) {
      showError(error, "No se pudieron descartar los cambios pendientes.");
      return false;
    }
  }

  async function handleApplyIncomingDocumentVersion() {
    if (!activeProject || !activeDocumentId) return false;
    const documentId=activeDocumentId,projectId=activeProject.id,expected=documentSessionsRef.current[documentId];
    const stillCurrent=()=>activeWorkspaceTabIdRef.current===documentId&&activeAiProjectRef.current===projectId&&!!expected&&sameDocumentRevision(documentSessionsRef.current[documentId],expected);
    try {
      const incomingForActiveDocument = activeDocumentSyncStatus?.versionState === "remote-ahead" || activeDocumentSyncStatus?.versionState === "diverged";
      if (incomingForActiveDocument && isGithubSyncMode(activeProject.syncMode)) {
        if(!await handlePullProject())return false;
        if(!stillCurrent())throw new Error("El contenido ha cambiado mientras llegaba la versión remota. El borrador se conserva; revisa de nuevo la actualización.");
        if(!await handleLoadDiskVersion(documentId))return false;
        await refreshProjectSyncStatus(projectId, { silent: true });
        await checkOpenDocumentSync();
        return true;
      }
      if (activeDocumentSyncStatus?.diskChanged || activeDocumentSyncStatus?.conflictStatus === "disk-changed") {
        if(!stillCurrent()||!await handleLoadDiskVersion(documentId))return false;
        await checkOpenDocumentSync();
        return true;
      }
      await refreshProjectSyncStatus(projectId, { autoRun: false, silent: true });
      await checkOpenDocumentSync();
      throw new Error("La versión disponible ha cambiado. Se conserva el contenido abierto; cancela y revisa el estado actualizado.");
    } catch (error) {
      showError(error, "No se pudo actualizar el documento con la última versión disponible.");
      return false;
    }
  }

  function requestDiscardActiveDocumentDraft() {
    requestDocumentFooterAction("discard-draft");
  }

  async function requestDocumentMerge(historyVersionId?:string,remote=false){
    if(documentMergeWork.current||!activeProject||!activeDocumentId)return;
    const id=activeDocumentId,projectId=activeProject.id;documentMergeWork.current=true;
    try{
      if(!await flushPendingDrafts(projectId))return;
      const expected=documentSessionsRef.current[id];if(!expected?.document||activeWorkspaceTabIdRef.current!==id||activeAiProjectRef.current!==projectId)return;
      const epoch=++documentMergeEpoch.current;
      setDocumentMerge({id,projectId,expected,historyVersionId,remote,review:null,loading:true,busy:false,error:""});
      try{const review=remote?await reviewRemoteDraft(id):historyVersionId?await reviewHistoricalDraft(id,historyVersionId):await reviewDocumentConflict(id);if(documentMergeEpoch.current===epoch)setDocumentMerge(current=>current?.id===id?{...current,review,loading:false}:current);}
      catch(cause){if(documentMergeEpoch.current===epoch)setDocumentMerge(current=>current?.id===id?{...current,loading:false,error:getApiErrorMessage(cause,"No se pudo revisar la fuente. Se conserva el documento abierto.")}:current);}
    }finally{documentMergeWork.current=false;}
  }

  async function applyMergedDocument(markdown:string,checkOnly=false){
    const chosen=documentMerge;
    if(!chosen?.review||chosen.loading||chosen.busy||documentMergeWork.current||pendingSaveIds.current.has(chosen.id))return;
    if(checkOnly&&!chosen.attemptPayload)return;
    const id=chosen.id,review=chosen.review;documentMergeWork.current=true;pendingSaveIds.current.add(id);setDocumentMerge(current=>current===chosen?{...current,busy:true,error:"",checkingAttempt:checkOnly}:current);
    let protectLatest=false;
    try{
      const result=await sessionWrites.current.run(id,async()=>{
        if(!sameDocumentRevision(documentSessionsRef.current[id],chosen.expected))throw new Error("La edición ha cambiado. Vuelve a revisar antes de combinar.");
        const payload=checkOnly?chosen.attemptPayload!:{attemptId:createConflictAttemptId(),locationRevision:review.locationRevision,diskFingerprint:review.diskFingerprint,draftRevision:review.draftRevision,localMarkdown:chosen.expected.markdown,mergedMarkdown:markdown,remoteSource:review.remoteSource?remoteSourceProof(review.remoteSource):undefined,historySource:review.historySource?{versionId:review.historySource.versionId,markdownSha256:review.historySource.markdownSha256}:undefined};
        if(!checkOnly)setDocumentMerge(current=>current?.id===id?{...current,attemptPayload:payload}:current);
        const attempt={id:payload.attemptId,verify:async()=>{const observed=await reviewDocumentConflictAttempt(id,payload.attemptId,payload);return observed.status==="confirmed"?observed.result:null;}};
        return checkOnly?verifyDocumentMergeAttempt({review,markdown:payload.mergedMarkdown,attempt}):confirmDocumentMerge({review,markdown,submit:()=>applyDocumentConflict(id,payload),attempt});
      });
      const latest=documentSessionsRef.current[id];if(!latest?.document)throw new Error("La vista se ha cerrado. El resultado y sus copias permanecen en recuperación.");
      if(latest.savedMarkdown!==chosen.expected.savedMarkdown||latest.baseFingerprint?.sha256!==chosen.expected.baseFingerprint?.sha256)throw new Error("La base de la sesión ha cambiado. Se conserva el resultado; revisa las versiones actuales.");
      const merged=acknowledgeMergedDraft(latest,result.document,chosen.expected);
      documentSessionsRef.current={...documentSessionsRef.current,[id]:merged};setDocumentSessions(current=>({...current,[id]:merged}));protectLatest=merged.markdown!==result.document.markdown;
      setDocumentSyncStatuses(current=>{const status=acknowledgeMergedSyncStatus(current[id],merged);return status?{...current,[id]:status}:current;});
      ++documentMergeEpoch.current;setDocumentMerge(null);
      if(activeAiProjectRef.current===chosen.projectId)setNotice({title:protectLatest?"Edición posterior conservada":chosen.remote?"Borrador remoto combinado":chosen.historyVersionId?"Restauración parcial preparada":"Combinación preparada",message:protectLatest?"Se conserva tu edición más reciente. Las versiones revisadas y la propuesta combinada están disponibles en Apartadas.":chosen.remote?"Revisa el borrador antes de guardar. El archivo local se conserva; la sincronización del proyecto sigue pendiente. Las copias están en Apartadas.":result.reconciled?"La lectura confirma el borrador combinado. Revisa su contenido antes de guardar.":"Las versiones y la propuesta se conservan en Apartadas. Revisa el borrador combinado y guarda cuando esté listo; el archivo en disco no se ha sustituido.",tone:"info"});
      void refreshOrphanDrafts();void checkOpenDocumentSync();
    }catch(cause){setDocumentMerge(current=>current?.id===id?{...current,busy:false,checkingAttempt:false,attemptPayload:cause instanceof ApiError&&cause.operationOutcome==="not-started"?undefined:current.attemptPayload,error:getApiErrorMessage(cause,"No se confirmó la combinación. Revisa el estado antes de otra acción.")}:current);}
    finally{
      pendingSaveIds.current.delete(id);documentMergeWork.current=false;
      if(protectLatest){const latest=documentSessionsRef.current[id];if(latest)void persistDraft(id,latest,true);}
    }
  }

  function requestIncomingDocumentVersion() {
    requestDocumentFooterAction((activeSession?.isDirty ?? false) ? "update-remote-discard-draft" : "update-remote");
  }

  async function requestHandwrittenMerge(){
    if(!activeHandwrittenNoteId||!activeProject||handwrittenMergeWork.current||handwrittenMerge?.busy)return;
    const id=activeHandwrittenNoteId,projectId=activeProject.id;handwrittenMergeWork.current=true;
    try{if(!await flushPendingDrafts(projectId))return;const expected=handwrittenSessionsRef.current[id];if(!expected?.note||!expected.content||activeWorkspaceTabIdRef.current!==id||activeAiProjectRef.current!==projectId)return;
      const epoch=++handwrittenMergeEpoch.current;setHandwrittenMerge({id,projectId,expected,review:null,loading:true,busy:false,error:""});
      try{const review=await reviewHandwrittenConflict(id);if(handwrittenMergeEpoch.current===epoch)setHandwrittenMerge(current=>current?.id===id?{...current,review,loading:false}:current);}catch(cause){if(handwrittenMergeEpoch.current===epoch)setHandwrittenMerge(current=>current?.id===id?{...current,loading:false,error:getApiErrorMessage(cause,"No se pudo revisar la nota. Los trazos abiertos se conservan.")}:current);}
    }finally{handwrittenMergeWork.current=false;}
  }
  async function applyMergedHandwritten(content:HandwrittenNoteContent,checkOnly=false){
    const chosen=handwrittenMerge;if(!chosen?.review||!chosen.expected.content||chosen.loading||chosen.busy||handwrittenMergeWork.current||pendingSaveIds.current.has(chosen.id))return;
    if(checkOnly&&!chosen.attemptPayload)return;
    const id=chosen.id,review=chosen.review;handwrittenMergeWork.current=true;pendingSaveIds.current.add(id);setHandwrittenMerge(current=>current===chosen?{...current,busy:true,error:"",checkingAttempt:checkOnly}:current);let protectLatest=false;
    try{const result=await sessionWrites.current.run(id,async()=>{
      if(!sameHandwrittenRevision(handwrittenSessionsRef.current[id],chosen.expected))throw new Error("Los trazos han cambiado. Revisa de nuevo antes de combinar.");
      const payload=checkOnly?chosen.attemptPayload!:{attemptId:createConflictAttemptId(),locationRevision:review.locationRevision,diskFingerprint:review.diskFingerprint,draftRevision:review.draftRevision,localContent:chosen.expected.content!,mergedContent:content};
      if(!checkOnly)setHandwrittenMerge(current=>current?.id===id?{...current,attemptPayload:payload}:current);
      const attempt={id:payload.attemptId,verify:async()=>{const observed=await reviewHandwrittenConflictAttempt(id,payload.attemptId,payload);return observed.status==="confirmed"?observed.result:null;}};
      return checkOnly?verifyHandwrittenMergeAttempt({review,content:payload.mergedContent,attempt}):confirmHandwrittenMerge({review,content,submit:()=>applyHandwrittenConflict(id,payload),attempt});
    });
      const latest=handwrittenSessionsRef.current[id];if(!latest?.note||!latest.content)throw new Error("La nota se ha cerrado. El resultado permanece en recuperación.");
      if(latest.savedContent!==chosen.expected.savedContent||latest.baseFingerprint?.sha256!==chosen.expected.baseFingerprint?.sha256)throw new Error("La base de la nota ha cambiado. Se conservan las copias; revisa las versiones actuales.");
      const merged=acknowledgeMergedNote(latest,result.note,chosen.expected);protectLatest=!!merged.content&&noteConflictRevision(merged.content)!==noteConflictRevision(result.note.content);handwrittenSessionsRef.current={...handwrittenSessionsRef.current,[id]:merged};setHandwrittenSessions(current=>({...current,[id]:merged}));++handwrittenMergeEpoch.current;setHandwrittenMerge(null);void refreshOrphanDrafts();
      if(activeAiProjectRef.current===chosen.projectId)setNotice({title:protectLatest?"Trazos posteriores conservados":"Combinación de páginas preparada",message:protectLatest?"Se mantienen tus trazos más recientes. Las versiones y la propuesta están en Apartadas.":"Revisa el borrador combinado. Las tres versiones se conservan en Apartadas y el archivo del disco no cambia hasta Guardar.",tone:"info"});
    }catch(cause){setHandwrittenMerge(current=>current?.id===id?{...current,busy:false,checkingAttempt:false,attemptPayload:cause instanceof ApiError&&cause.operationOutcome==="not-started"?undefined:current.attemptPayload,error:getApiErrorMessage(cause,"No se confirmó el borrador combinado. Revisa antes de otra acción.")}:current);}
    finally{pendingSaveIds.current.delete(id);handwrittenMergeWork.current=false;if(protectLatest){const latest=handwrittenSessionsRef.current[id];if(latest)void persistHandwrittenDraft(id,latest,true);}}
  }

  function requestSynchronizeActiveDocument() {
    if (activeSession?.isDirty) {
      requestDocumentFooterAction("sync-saved-while-draft");
      return;
    }
    void handleSynchronizeActiveDocument();
  }

  async function confirmDocumentFooterDialog() {
    const dialog = documentFooterDialog;
    if(!dialog||activeWorkspaceTabIdRef.current!==dialog.documentId||activeAiProjectRef.current!==dialog.projectId||!sameDocumentRevision(documentSessionsRef.current[dialog.documentId],dialog.revision))throw new Error("El documento o su contenido han cambiado. Cancela y revisa de nuevo la acción.");
    const confirmed=dialog.action==="discard-draft"
      ?await handleDiscardActiveDocumentDraft(dialog.documentId)
      :dialog.action==="sync-saved-while-draft"
        ?await handleSynchronizeActiveDocument({preserveDraft:true})
        :await handleApplyIncomingDocumentVersion();
    if(confirmed)setDocumentFooterDialog(current=>current===dialog?null:current);
    return confirmed;
  }

  function requestDocumentFooterAction(action:DocumentFooterDialogAction){
    const revision=documentSessionsRef.current[activeDocumentId];
    if(!activeProject||!revision?.document)return;
    setDocumentFooterDialog({action,documentId:activeDocumentId,projectId:activeProject.id,revision});
  }

  async function handleRestoreActiveVersion(versionId: string): Promise<RestoreVersionResponse | null> {
    if (!activeProject || !activeDocumentId) return null;
    const id = activeDocumentId;
    const expected = documentSessionsRef.current[id];
    if (!expected?.document || pendingSaveIds.current.has(id)) return null;
    pendingSaveIds.current.add(id);
    let restored: RestoreVersionResponse | null = null;
    try {
      const response = await sessionWrites.current.run(id, async () => {
        if (!sameDocumentRevision(documentSessionsRef.current[id], expected)) throw new Error("Hay cambios nuevos. Revisa de nuevo la versión antes de restaurarla.");
        const response=await restoreVersion(id, versionId, expected.baseFingerprint ?? null,documentSessionsRef.current[id]?.draftWriteRevision??null);
        const latest=documentSessionsRef.current[id];
        if(latest){const next=acknowledgeDocumentRestore(latest,response.savedDocument,expected);documentSessionsRef.current={...documentSessionsRef.current,[id]:next};setDocumentSessions(all=>({...all,[id]:next}));}
        return response;
      });
      restored = response;
      if (response.historyWarning || response.recoveryWarning) setNotice({ title: "Contenido restaurado; revisión pendiente", message: response.historyWarning ?? response.recoveryWarning!, tone: "info" });
      await refreshProjectCapabilityState(activeProject.id);
      await refreshProjectSyncStatus(activeProject.id, { autoRun: isAutomaticSyncMode(activeProject.syncMode), silent: true });
      return response;
    } catch (error) {
      if(isDraftWriteConflict(error)){markDraftWriteBlocked(id,false);void protectBlockedEdit(id,false);}
      showError(error, restored ? "El contenido se ha restaurado, pero no se pudo actualizar todo su estado." : "No se pudo restaurar la versión seleccionada. Se conserva el contenido abierto.");
      return restored;
    } finally {
      pendingSaveIds.current.delete(id);
      const latest = documentSessionsRef.current[id];
      if (latest) void persistDraft(id, latest);
    }
  }

  async function handleCheckForUpdates(source: "automatic" | "manual") {
    if (updateState === "checking" || updateState === "downloading" || updateState === "installing") return;

    const status = getUpdaterStatus();
    if (!status.supported) {
      setUpdateState("unsupported");
      if (source === "manual") {
        setNotice({
          title: "Actualizador no disponible",
          message: status.reason ?? "El actualizador solo funciona dentro de la aplicación Tauri instalada.",
          tone: "info",
        });
      }
      return;
    }

    setUpdateState("checking");
    setAvailableUpdate(null);
    setUpdateProgress(null);
    setUpdateError(null);
    try {
      const result = await checkForUpdate();
      if (!result.supported) {
        setUpdateState("unsupported");
        return;
      }

      if (!result.update) {
        setUpdateState("not-available");
        if (source === "manual") {
          setNotice({
            title: "KnowNext.ai está actualizado",
            message: `La versión instalada es v${APP_VERSION}.`,
            tone: "info",
          });
        }
        return;
      }

      setAvailableUpdate(result.update);
      setUpdateState("available");
    } catch (error) {
      setUpdateState("error");
      const message = error instanceof Error ? error.message : "No se pudo comprobar si hay actualizaciones.";
      setUpdateError(message);
      if (source === "manual") {
        setNotice({
          title: "No se pudo buscar actualizaciones",
          message,
          tone: "error",
        });
      }
    }
  }

  async function handleInstallUpdate() {
    if (updateInstallBusy.current || !availableUpdate || updateState === "downloading" || updateState === "installing") return;
    updateInstallBusy.current=true;
    try {

    if (!await checkpointOpenWork()) {
      setNotice({
        title: "No se pudo preparar la actualización",
        message: "Hay borradores pendientes que no se pudieron guardar. Revisa el aviso activo antes de actualizar.",
        tone: "error",
      });
      return;
    }

    setUpdateState("downloading");
    setUpdateProgress(null);
    setUpdateError(null);
    try {
      await installUpdate((progress) => {
        setUpdateProgress(progress);
        if (progress.percent === 100) setUpdateState("installing");
      },async()=>{
        checkpointPendingEditorInput();
        updateRestartToken.current=await protectUpdateInstallation({
          freeze:()=>flushSync(()=>setUpdateProtection("protecting")),unfreeze:()=>setUpdateProtection(null),
          hasPendingSettings:()=> (["app","ai","export"] as const).some(domain=>settingsPersistence.hasPending(domain)),
          protect:()=>checkpointOpenWork(),
        });
      });
      setUpdateProtection("installer-open");
    } catch (error) {
      if(updateRestartToken.current){try{await releaseUpdateInstallation(updateRestartToken.current);updateRestartToken.current=null;setUpdateProtection(null);}catch{setUpdateProtection("installer-open");}}

      const message = error instanceof Error ? error.message : "No se pudo instalar la actualización.";
      setUpdateState("error");
      setUpdateError(message);
      setNotice({
        title: "No se pudo instalar la actualización",
        message,
        tone: "error",
      });
    }
    } finally {updateInstallBusy.current=false;}
  }

  async function returnFromUpdatePreparation(){
    const token=updateRestartToken.current;if(!token)return;
    try{await releaseUpdateInstallation(token);updateRestartToken.current=null;setUpdateProtection(null);setUpdateState("available");}
    catch(error){showError(error,"No se pudo devolver el espacio de trabajo. La preparación se conserva.");}
  }

  function showError(
    error: unknown,
    fallback: string,
    options: { source?: string; suppressApiConnectionNotice?: boolean } = {},
  ) {
    const message = getApiErrorMessage(error, fallback);
    const detail = describeError(error);
    const isConnectionError = isApiConnectionError(error);
    if (isConnectionError) setConfigPersistenceAvailable(false);

    if (options.suppressApiConnectionNotice && isConnectionError) return;

    const errorNotice = { title: "No se pudo completar la operación", message, tone: "error" as const };
    setNotice(errorNotice);
    void recordDiagnosticError(options.source ?? "app.showError", message, detail).then(eventId=>{
      if(eventId)setNotice(current=>current===errorNotice?{...current,message:`${current.message}\nReferencia técnica: ${eventId}`}:current);
    });
  }

  async function recordDiagnosticError(source: string, message: string, detail: string) {
    const fingerprint = `${source}:${message}:${detail.slice(0, 400)}`;
    const now = Date.now();
    if (lastTraceLogRef.current?.fingerprint === fingerprint && now - lastTraceLogRef.current.timestamp < 10_000) {
      return;
    }

    lastTraceLogRef.current = { fingerprint, timestamp: now };
    return recordTraceLog({ source, message, detail });
  }

  async function beforeCriticalStateChange(){
    await protectForCriticalTransition({
      hasPendingSettings:()=> (["app","ai","export"] as const).some(domain=>settingsPersistence.hasPending(domain)),
      protectDocuments:()=>checkpointOpenWork(),
      pause:()=>flushSync(()=>{
        setCriticalTransitionBusy(true);setConfigLoaded(false);
        // Even an unchanged project ID may resolve to a different restored root.
        // Discard only acknowledged in-memory snapshots, never their local drafts.
        aiWorkspaceEpoch.current.value++;
        documentLoads.current.clear();handwrittenLoads.current.clear();sessionLoadSequence.current++;
        documentPostSaveSyncSequenceRef.current++;
        documentSessionsRef.current={};handwrittenSessionsRef.current={};
        setDocumentSessions({});setHandwrittenSessions({});
        setImageTabs([]);setActiveImageId("");setReferenceDocumentTabs([]);setActiveReferenceDocumentId("");
        setExternalChangeSet(null);setExternalChangeDecisions({});setExternalChangesMessage(null);setHistoryOpen(false);
      }),
    });
  }
  function afterCriticalStateChange(outcome:StateTransitionOutcome){
    setAppSettingsOpen(false);setRecoverableDraftsOpen(false);
    setNotice({title:outcome.confirmed?"Estado revisado":"Cambio de estado sin confirmar",message:outcome.message+" La vista se actualiza desde el almacenamiento local.",tone:"info"});
    handleRetryLocalRuntimeRecovery();
  }

  function handleRetryLocalRuntimeRecovery() {
    setLocalRuntimeRecoveryError(null);
    setConfigLoaded(false);
    setStartupRetrySequence((sequence) => sequence + 1);
  }

  function handleLayoutConfigChange(nextLayoutConfig: Partial<LayoutConfig>) {
    setLayoutConfig((currentLayoutConfig) => ({ ...currentLayoutConfig, ...nextLayoutConfig }));
  }

  function handleAppearanceConfigChange(nextAppearanceConfig: Partial<AppearanceConfig>) {
    setAppearanceConfig((currentAppearanceConfig) => {
      const updatedAppearanceConfig = { ...currentAppearanceConfig, ...nextAppearanceConfig };
      cacheLocalAppPreferences({ appearance: updatedAppearanceConfig });
      return updatedAppearanceConfig;
    });
  }

  function handleDiagnosticsConfigChange(nextDiagnosticsConfig: Partial<DiagnosticsConfig>) {
    setDiagnosticsConfig((currentDiagnosticsConfig) => {
      const updatedDiagnosticsConfig = { ...currentDiagnosticsConfig, ...nextDiagnosticsConfig };
      cacheLocalAppPreferences({ diagnostics: updatedDiagnosticsConfig });
      return updatedDiagnosticsConfig;
    });
  }

  function handleExportTemplateChange(patch: ExportTemplateUpdate) {
    if (exportResetPending.current) return;
    const next = mergeExportSettings(exportTemplateConfigRef.current, patch);
    exportTemplateConfigRef.current = next;
    setExportTemplateConfig(next);
    void saveSettings("export", "export-template", () => updateExportTemplate(next), saved => {
      exportTemplateConfigRef.current = saved;
      setExportTemplateConfig(saved);
    });
  }

  async function handleResetExportTemplate() {
    if (exportResetPending.current) return;
    exportResetPending.current = true; setExportResetting(true);
    try {
      await saveSettings("export", "export-template", async () => {
        exportResetPending.current = true; setExportResetting(true);
        try { return await resetExportTemplate(); }
        finally { exportResetPending.current = false; setExportResetting(false); }
      }, saved => {
        exportTemplateConfigRef.current = saved; setExportTemplateConfig(saved);
        void getExportTemplatePath().then(setExportTemplatePath).catch(() => undefined);
      });
    } finally { exportResetPending.current = false; setExportResetting(false); }
  }

  async function refreshAiState(projectId = activeProject?.id) {
    const request = ++aiRefreshSequence.current;
    const projectAtStart = activeAiProjectRef.current;
    const preferenceRevision = settingsPersistence.getRevision("ai");
    const credentialsAtStart = credentialRevision.current;
    try {
      const nextAiConfig = await getAiConfig();
      const [conversation, indexStatus, usageSummary, pendingIntent, contextSources] = await Promise.all([
        projectId ? getAiConversation(projectId) : Promise.resolve({ events: [] }),
        projectId && nextAiConfig.rag.enabled ? getAiIndexStatus(projectId) : Promise.resolve(null),
        loadAiUsageSummary("app.aiState.aiUsageSummary"),
        projectId ? getAiPendingIntent(projectId) : Promise.resolve(null),
        projectId ? getAiContextSources(projectId) : Promise.resolve({ sources: [], expiredSourceIds: [] }),
      ]);
      if (!acceptsAiRefresh({request, latest: aiRefreshSequence.current, projectAtStart, currentProject: activeAiProjectRef.current, requestedProject: projectId})) return;
      const refreshed = reconcileAiSettingsRefresh(aiConfigRef.current, nextAiConfig,
        settingsPersistence.hasPending("ai") || settingsPersistence.getRevision("ai") !== preferenceRevision,
        credentialRevision.current !== credentialsAtStart);
      aiConfigRef.current = refreshed; setAiConfig(refreshed);
      setAiConversationEvents(conversation.events);
      setAiIndexStatus(indexStatus);
      setAiUsageSummary(usageSummary);
      setAiPendingIntent(pendingIntent);
      setAiContextSources(contextSources.sources);
    } catch (error) {
      showError(error, "No se pudo cargar la configuración de IA.", { source: "app.aiState" });
    }
  }

  async function refreshAiContextSources(projectId = activeProject?.id, options: { silent?: boolean } = {}) {
    if (!projectId) return;
    try {
      const response = await getAiContextSources(projectId);
      setAiContextSources(response.sources);
    } catch (error) {
      if (!options.silent) showError(error, "No se pudo cargar el contexto IA.", { source: "app.aiContext" });
    }
  }

  async function refreshAiUsageSummary() {
    setAiUsageSummary(await loadAiUsageSummary("app.aiUsageSummary"));
  }

  async function loadAiUsageSummary(source: string) {
    try {
      return await getAiUsageSummary();
    } catch (error) {
      void recordTraceLog({
        source,
        message: "No se pudo cargar el resumen de uso IA.",
        detail: describeError(error),
      });
      return null;
    }
  }

  function handleAiConfigChange(next: AiConfigStatus) {
    aiConfigRef.current = next;
    setAiConfig(next);
    const payload = aiSettingsPayload(next);
    cacheLocalAppPreferences({ai: payload});
    void saveSettings("ai", "configuration", () => updateAiConfig(payload), saved => {
      const acknowledged = {...aiConfigRef.current, ...aiSettingsPayload(saved)};
      aiConfigRef.current = acknowledged;
      setAiConfig(acknowledged);
      cacheLocalAppPreferences({ai: aiSettingsPayload(acknowledged)});
    });
  }

  function handleAiTranscriptionChange(transcription: Partial<AiConfigStatus["transcription"]>) {
    handleAiConfigChange({
      ...aiConfig,
      transcription: {
        ...aiConfig.transcription,
        ...transcription,
      },
    });
  }

  async function handleSaveOpenAiKey(apiKey: string) {
    credentialRevision.current += 1;
    const status = await saveOpenAiKey(apiKey);
    const configured = {...aiConfigRef.current, openaiKeyConfigured:status.configured, openaiKeyPreview:status.preview, credentialStorageError:status.storageError, credentialProtection:status.protection};
    aiConfigRef.current = configured;
    setAiConfig(configured);
    try {
      await refreshAiState();
    } catch (error) {
      showError(error, "La clave se ha guardado, pero no se pudo actualizar todo el estado de IA.", { source: "app.openAiKey" });
    }
  }

  async function handleDeleteOpenAiKey() {
    credentialRevision.current += 1;
    try {
      await deleteOpenAiKey();
      await refreshAiState();
    } catch (error) {
      showError(error, "No se pudo eliminar la clave de OpenAI.", { source: "app.openAiKey" });
    }
  }

  async function handleReindexProjectImages() {
    if (!activeProject) return;
    try {
      const result = await reindexProjectImages(activeProject.id);
      await refreshAiState(activeProject.id);
      setNotice({
        title: "Imagenes reindexadas",
        message: `Se procesaron ${result.indexedImageCount} de ${result.imageCount} imagen(es) del proyecto.`,
        tone: "info",
      });
    } catch (error) {
      showError(error, "No se pudo reindexar las imágenes para IA.", { source: "app.aiImageIndex" });
    }
  }

  async function refreshTraceLogStatus() {
    try {
      setTraceLogStatus(await getTraceLogStatus());
    } catch (error) {
      showError(error, "No se pudo cargar el estado de las trazas.");
    }
  }

  async function refreshRuntimeServiceStatus(options?: { silent?: boolean }) {
    if (!options?.silent) setRuntimeServicesRefreshing(true);
    try {
      const nextStatus = await getRuntimeServiceStatus();
      setRuntimeServicesStatus((currentStatus) => {
        if (options?.silent && shouldKeepCurrentRuntimeStatus(currentStatus, nextStatus, runtimeServiceSilentFailuresRef)) {
          return currentStatus;
        }
        if (!hasUnavailableRuntime(nextStatus)) runtimeServiceSilentFailuresRef.current = 0;
        return nextStatus;
      });
    } catch (error) {
      if (!options?.silent) showError(error, "No se pudo consultar el estado de los servicios.");
    } finally {
      if (!options?.silent) setRuntimeServicesRefreshing(false);
    }
  }

  async function handleOpenTraceLogFolder() {
    const folderPath = traceLogStatus?.folderPath;
    if (!folderPath) return;

    try {
      await openTraceLogFolder(folderPath);
    } catch (error) {
      showError(error, "No se pudo abrir la carpeta de logs.");
    }
  }

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let alive=true;const unlisteners:Array<()=>void>=[];
    void listenRecordingEvent<{id:string}>("recording-document-created",event=>{setRecordingNotice({id:event.payload.id});if(alive&&activeProject)void handleReloadProjectTree(activeProject.id);}).then(unlisten=>{if(alive)unlisteners.push(unlisten);else unlisten();});
    void listenRecordingEvent<{view:string;sessionId?:string;projectId?:string}>("recording-open-workspace",event=>{if(!alive)return;if(event.payload.view === "settings") setAppSettingsOpen(true); else if(event.payload.view==="minutes"&&event.payload.sessionId&&event.payload.projectId){setRecordingPanel(false);setMeetingMinutes({projectId:event.payload.projectId,sessionId:event.payload.sessionId});}else setRecordingPanel(true);}).then(unlisten=>{if(alive)unlisteners.push(unlisten);else unlisten();});
    void listenRecordingEvent("recording-create-project",()=>{setRecordingPanel(false);setCreateProjectOpen(true);}).then(unlisten=>{if(alive)unlisteners.push(unlisten);else unlisten();});
    void listenRecordingEvent("recording-changed",()=>{if(alive&&activeProject)void handleReloadProjectTree(activeProject.id);}).then(unlisten=>{if(alive)unlisteners.push(unlisten);else unlisten();});
    void listenRecordingEvent<{id:string}>("recording-open-document",event=>{void openRecordingDocument(event.payload.id);}).then(unlisten=>{if(alive)unlisteners.push(unlisten);else unlisten();});
    return()=>{alive=false;unlisteners.forEach(f=>f());};
  },[activeProject?.id]);

  function handleTreeContextAction(action: DocumentTreeAction, node: DocumentTreeNode) {
    if (action === "record-audio" && activeProject) { setRecordingDestination({projectId:activeProject.id,folderId:node.id,name:`Reunión ${new Date().toISOString().slice(0,16).replace(/:/g,"-")}.md`}); setRecordingPanel(true); return; }
    if (action === "export-md" || action === "export-pdf" || action === "export-docx") {
      const format = action === "export-md" ? "md" : action === "export-pdf" ? "pdf" : "docx";
      void handleExportDocument(node.id, format);
      return;
    }

    if (action === "export-knote" || action === "export-note-png" || action === "export-note-svg" || action === "export-note-pdf") {
      const format: HandwrittenExportFormat = action === "export-knote" ? "knote" : action === "export-note-png" ? "png" : action === "export-note-svg" ? "svg" : "pdf";
      void handleExportHandwrittenNote(node.id, format);
      return;
    }

    if (action === "rename") {
      updateCurrentProjectTree((currentTree) => markNodeEditing(currentTree, node.id));
      return;
    }

    if (action === "create-folder") {
      void handleCreateFolder(node.id);
      return;
    }

    if (action === "create-document") {
      setCreateDocumentParentId(node.id);
      setCreateDocumentInitialKind("document");
      setCreateDocumentOpen(true);
      return;
    }

    if (action === "create-handwritten-note") {
      setCreateDocumentParentId(node.id);
      setCreateDocumentInitialKind("handwritten-note");
      setCreateDocumentOpen(true);
      return;
    }

    if (action === "import-image") {
      void promptImportImage(node.id);
      return;
    }

    if (action === "import-file") {
      void promptImportProjectFile(node.id);
      return;
    }

    if (action === "open-image" && node.path) {
      handleOpenImage(node.id, node.name, node.path);
      return;
    }

    if (action === "open-handwritten-note") {
      handleOpenHandwrittenNote(node.id, node.name);
      return;
    }

    if (action === "open-reference-document" && node.path) {
      handleOpenReferenceDocument(node.id, node.name, node.path);
      return;
    }

    if (action === "add-image-context") {
      void handleAddProjectImageContext(node.id);
      return;
    }

    if (action === "add-attachment-context") {
      void handleAddProjectAttachmentContext(node.id);
      return;
    }

    if (action === "add-handwritten-context") {
      void handleAddHandwrittenNoteContext(node.id);
      return;
    }

    if (action === "copy-path" && node.path) {
      void navigator.clipboard?.writeText(node.path);
      setNotice({ title: "Ruta copiada", message: node.path, tone: "info" });
      return;
    }

    if (action === "copy-image-reference" && node.path) {
      void navigator.clipboard?.writeText(`![${node.name.replace(/\.[^.]+$/, "")}](${node.path})`);
      setNotice({ title: "Referencia copiada", message: node.path, tone: "info" });
      return;
    }

    if (action === "insert-image") {
      if (!activeDocumentId) {
        setNotice({ title: "Abre un documento", message: "Necesitas un documento activo para insertar un recurso visual.", tone: "info" });
        return;
      }
      if (node.type === "handwritten-note") {
        void insertHandwrittenNoteIntoActiveDocument(node);
      } else {
        void insertImageIntoActiveDocument(node.id);
      }
      return;
    }

    if (action === "delete") {
      void handleDeleteNode(node);
      return;
    }

    if (action === "duplicate") {
      void handleDuplicateDocument(node);
      return;
    }

    if (action === "move") {
      setMoveNode(node);
    }
  }

  function handleCaptureDocumentTemplate(documentId: string, snapshot: () => string) {
    try {
      const name = documentSessionsRef.current[documentId]?.document?.name ?? findNodeById(tree, documentId)?.name ?? "Documento";
      setTemplateCapture({ name, markdown: snapshot(),documentId });
    } catch (error) { showError(error, "No se pudo capturar el documento para la plantilla.", { source: "app.templateCapture" }); }
  }

  async function handleExportDocument(documentId: string, format: ExportFormat, snapshot?: () => string) {
    const session = documentSessions[documentId];
    const documentName = session?.document?.name ?? findNodeById(tree, documentId)?.name ?? "documento.md";
    if(exportInFlight.current)return;
    exportInFlight.current=true;setExportedFileNotice(null);setExportProgress(documentName);

    try {
      const exportMarkdown = snapshot ? snapshot() : await resolveExportMarkdown(documentId, session);
      const diagramAssets = format === "pdf" || format === "docx"
        ? await prepareMermaidDiagramAssets(exportMarkdown, exportTemplateConfig.document.diagramResolution)
        : [];
      if(isTauriMobileRuntime()) {
        const result=await exportMarkdownToMobile(documentId,{format,markdown:exportMarkdown,diagramAssets});
        if(result.status==="saved")setExportedFileNotice({exportId:result.exportId,fileName:result.fileName});
        return;
      }
      if (!isTauriRuntime()) {
        const exportTarget = await selectBrowserExportTarget(documentName, format);
        if (!exportTarget) return;
        const blob = await exportDocumentContent(documentId, {
          format,
          markdown: exportMarkdown,
          diagramAssets,
        });
        await exportTarget.save(blob);
        setNotice({
          title: "Documento exportado",
          message: exportTarget.fileName,
          tone: "info",
        });
        return;
      }

      const outputPath = await selectExportFilePath(withExportExtension(documentName, format), format);
      if (!outputPath) return;

      const response = await exportDocument(documentId, {
        format,
        outputPath,
        markdown: exportMarkdown,
        diagramAssets,
      });
      setNotice({
        title: "Documento exportado",
        message: response.outputPath,
        tone: "info",
      });
    } catch (error) {
      showError(error, "No se pudo exportar el documento.", { source: "app.documentExport" });
    } finally {exportInFlight.current=false;setExportProgress(null);}
  }

  async function handleExportHandwrittenNote(noteId: string, format: HandwrittenExportFormat, pageId?: string) {
    const session = handwrittenSessions[noteId];
    const noteName = session?.note?.name ?? findNodeById(tree, noteId)?.name ?? "nota-a-mano.knote";
    const content = session?.content ?? null;
    if(exportInFlight.current)return;
    exportInFlight.current=true;setExportedFileNotice(null);setExportProgress(noteName);

    try {
      if(isTauriMobileRuntime()) {
        const result=await exportHandwrittenToMobile(noteId,{format,pageId:format==="png"||format==="svg"?pageId??content?.pages[0]?.id??null:null,content});
        if(result.status==="saved")setExportedFileNotice({exportId:result.exportId,fileName:result.fileName});
        return;
      }
      if (!isTauriRuntime()) {
        const exportTarget = await selectBrowserHandwrittenExportTarget(noteName, format);
        if (!exportTarget) return;
        const blob = await exportHandwrittenNoteContent(noteId, {
          format,
          pageId: format === "png" || format === "svg" ? pageId ?? content?.pages[0]?.id ?? null : null,
          content,
        });
        await exportTarget.save(blob);
        setNotice({ title: "Nota exportada", message: exportTarget.fileName, tone: "info" });
        return;
      }

      const outputPath = await selectHandwrittenExportFilePath(withHandwrittenExportExtension(noteName, format), format);
      if (!outputPath) return;
      const response = await exportHandwrittenNote(noteId, {
        format,
        outputPath,
        pageId: format === "png" || format === "svg" ? pageId ?? content?.pages[0]?.id ?? null : null,
        content,
      });
      setNotice({ title: "Nota exportada", message: response.outputPath, tone: "info" });
    } catch (error) {
      showError(error, "No se pudo exportar la nota a mano.", { source: "app.handwrittenExport" });
    } finally {exportInFlight.current=false;setExportProgress(null);}
  }

  async function resolveExportMarkdown(documentId: string, session: DocumentSession | undefined) {
    if (session?.markdown !== undefined) return session.markdown;
    const record = await getDocument(documentId);
    return record.markdown;
  }

  async function handleDeleteNode(node: DocumentTreeNode) {
    if(!activeProject)return;
    const projectId=activeProject.id,epoch=aiWorkspaceEpoch.current.value;
    const stillHere=()=>activeAiProjectRef.current===projectId&&aiWorkspaceEpoch.current.value===epoch;
    try {
      if(!await flushPendingDrafts()||!stillHere())return;
      const links=await getAssetLinks(projectId,node.id);
      if(!stillHere())return;
      const accepted=await assetMoveReview.request({operation:"delete",name:node.name,path:node.path??node.name,incoming:links.incoming.length,outgoing:links.outgoing.length,complete:links.complete,warnings:links.warnings});
      if(!accepted||!stillHere())return;
      const result=await deleteTreeNode(projectId,node.id);
      if(stillHere())applyFileOperationResult(result,node);
    }catch(error){if(stillHere())showError(error,"No se pudo enviar el elemento a la papelera.");}
  }

  async function handleDuplicateDocument(node: DocumentTreeNode) {
    if (!activeProject || (node.type !== "document" && node.type !== "handwritten-note")) return;
    try {
      const result = await duplicateProjectDocument(activeProject.id, node.id);
      applyFileOperationResult(result);
      if (result.node?.type === "document") {
        openOrReplaceTab(result.node.id, result.node.name);
      }
      if (result.node?.type === "handwritten-note") {
        handleOpenHandwrittenNote(result.node.id, result.node.name);
      }
    } catch (error) {
      showError(error, "No se pudo duplicar el archivo.");
    }
  }

  async function beforeFileBatchExecute(){
    const batch=fileBatchRef.current;if(!batch||!await flushPendingDrafts())return false;
    const stillHere=()=>fileBatchRef.current===batch&&activeAiProjectRef.current===batch.projectId&&aiWorkspaceEpoch.current.value===batch.workspaceEpoch;
    if(!stillHere())return false;if(batch.action!=="move"&&batch.action!=="trash"&&batch.action!=="rename")return true;
    const catalog=await getAssetCatalog(batch.projectId);if(!stillHere())return false;
    const paths=batch.nodeIds.map(id=>id.slice(batch.projectId.length+2));
    const selected=catalog.items.filter(item=>paths.some(path=>item.target.path===path||item.target.path.startsWith(path+"/")));
    const incoming=selected.reduce((n,item)=>n+item.incomingCount,0),outgoing=selected.reduce((n,item)=>n+item.outgoingCount,0);
    if(incoming||outgoing||!catalog.complete){const accepted=await assetMoveReview.request({operation:batch.action==="trash"?"delete":batch.action,name:"Selección",path:batch.nodeIds.length+" elementos seleccionados",incoming,outgoing,complete:catalog.complete,warnings:catalog.warnings});if(!accepted)return false;}
    return stillHere();
  }

  async function handleMoveNode(targetFolderId: string | null) {
    if (!activeProject || !moveNode) return;
    const moved = await moveTreeNodeToFolder(moveNode, targetFolderId);
    if (moved) setMoveNode(null);
  }

  async function handleMoveTreeNodeDrop(node: DocumentTreeNode, targetFolderId: string | null) {
    await moveTreeNodeToFolder(node, targetFolderId);
  }

  async function moveTreeNodeToFolder(node: DocumentTreeNode, targetFolderId: string | null) {
    if (!activeProject) return false;
    const projectId=activeProject.id,epoch=aiWorkspaceEpoch.current.value;
    const stillHere=()=>activeAiProjectRef.current===projectId&&aiWorkspaceEpoch.current.value===epoch;
    try {
      if(!await flushPendingDrafts()||!stillHere())return false;
      const links=await getAssetLinks(projectId,node.id);
      if(!stillHere())return false;
      if(links.incoming.length||links.outgoing.length||!links.complete){
        if(!await assetMoveReview.request({name:node.name,path:node.path??node.name,incoming:links.incoming.length,outgoing:links.outgoing.length,complete:links.complete,warnings:links.warnings}))return false;
      }
      if(!stillHere())return false;
      const result = await moveTreeNode(projectId, node.id, targetFolderId);
      if(!stillHere())return false;
      applyFileOperationResult(result, node);
      const targetFolder = targetFolderId ? findNodeById(result.treeAvailable===false?tree:result.tree,targetFolderId) : null;
      setNotice({
        title: "Elemento movido",
        message: targetFolderId ? targetFolder ? `"${node.name}" se movió a "${targetFolder.name}".` : `"${node.name}" se movió a la carpeta elegida.` : `"${node.name}" se movió a la raíz del proyecto.`,
        tone: "info",
      });
      return true;
    } catch (error) {
      if(stillHere())showError(error, "No se pudo mover el elemento.");
      return false;
    }
  }

  function openOrReplaceTab(documentId: string, name: string) {
    setTabs((currentTabs) => (
      currentTabs.some((tab) => tab.id === documentId)
        ? currentTabs.map((tab) => (tab.id === documentId ? { id: documentId, name } : tab))
        : [...currentTabs, { id: documentId, name }]
    ));
    setActiveDocumentId(documentId);
    setActiveTreeNodeId(documentId);
    setActiveImageId("");
    setActiveHandwrittenNoteId("");
    setActiveReferenceDocumentId("");
    setActiveUtilityTab(null);
  }

  async function handleAddHandwrittenNoteContext(noteId: string) {
    if (!activeProject) return;
    try {
      await addProjectHandwrittenNoteAiContextSource(activeProject.id, noteId);
      await refreshAiContextSources(activeProject.id);
      setNotice({ title: "Nota añadida a IA", message: findNodeById(tree, noteId)?.name ?? "Nota a mano", tone: "info" });
    } catch (error) {
      showError(error, "No se pudo añadir la nota al contexto IA.", { source: "app.aiContext.addHandwritten" });
    }
  }

  async function promptImportImage(parentId: string | null) {
    if (!activeProject) return;
    const project=activeProject; const epoch=aiWorkspaceEpoch.current.value;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if(activeAiProjectRef.current!==project.id || aiWorkspaceEpoch.current.value!==epoch){
        setNotice({title:"Destino de importación cambiado",message:"El proyecto cambió mientras elegías el archivo. Vuelve a importar desde el proyecto de destino.",tone:"info"});return;
      }
      try {
        const result = await importProjectImage(project.id, parentId, file);
        if (!acceptImportResult(result,project,epoch)) return;
        if(result.importReceipt?.treeAvailable!==false)setProjectTree(project.id, result.tree);
        handleOpenImage(result.asset.id, result.asset.name, result.asset.path);
      } catch (error) {
        showError(error, "No se pudo importar la imagen.");
      }
    };
    input.click();
  }

  async function promptImportProjectFile(parentId: string | null = null) {
    if (!activeProject) return;
    const project=activeProject; const epoch=aiWorkspaceEpoch.current.value;
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if(activeAiProjectRef.current!==project.id || aiWorkspaceEpoch.current.value!==epoch){
        setNotice({title:"Destino de importación cambiado",message:"El proyecto cambió mientras elegías el archivo. Vuelve a importar desde el proyecto de destino.",tone:"info"});return;
      }
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

      try {
        if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) {
          const result = await importProjectImage(project.id, parentId, file);
          if (!acceptImportResult(result,project,epoch)) return;
          if(result.importReceipt?.treeAvailable!==false)setProjectTree(project.id, result.tree);
          handleOpenImage(result.asset.id, result.asset.name, result.asset.path);
          return;
        }

        const result = await importProjectAttachment(project.id, parentId, file);
        if (!acceptImportResult(result,project,epoch)) return;
        applyFileOperationResult(result);
        if (result.node?.type === "document") {
          openOrReplaceTab(result.node.id, result.node.name);
          return;
        }
        if (result.node?.type === "attachment") {
          setActiveTreeNodeId(result.node.id);
          const importedPath = result.node.path ?? result.node.name;
          if (isReferenceDocumentPath(importedPath)) {
            handleOpenReferenceDocument(result.node.id, result.node.name, importedPath);
          } else if(!result.warnings?.length) {
            setNotice({
              title: "Archivo importado",
              message: "Se gestionará en el proyecto sin abrir un visualizador interno.",
              tone: "info",
            });
          }
        }
      } catch (error) {
        showError(error, "No se pudo importar el archivo.");
      }
    };
    input.click();
  }

  async function handleImportProjectImage(parentId: string | null, file: File): Promise<AssetImportResponse> {
    if (!activeProject) throw new Error("No active project");
    const project=activeProject;const epoch=aiWorkspaceEpoch.current.value;
    const result = await importProjectImage(project.id, parentId, file);
    if(activeAiProjectRef.current===project.id&&aiWorkspaceEpoch.current.value===epoch){if(result.importReceipt?.treeAvailable!==false)setProjectTree(project.id,result.tree);else markProjectTreeIssue(project.id,"Imagen importada; no se pudo actualizar su estructura. Consulta la vista sin repetir la importación.");}
    return result;
  }

  function acceptImportResult(result:AssetImportResponse|FileOperationResult,project:Project,epoch:number) {
    if(activeAiProjectRef.current!==project.id||aiWorkspaceEpoch.current.value!==epoch){
      setNotice({title:"Archivo importado",message:`Se ha guardado en ${project.name}: ${result.importReceipt?.path ?? "biblioteca del proyecto"}. Puedes consultarlo al volver a ese proyecto.`,tone:"info"});
      return false;
    }
    if(result.importReceipt?.treeAvailable===false)markProjectTreeIssue(project.id,"Archivo importado; no se pudo actualizar su estructura. Consulta la vista sin repetir la importación.");
    if(result.warnings?.length)setNotice({title:"Archivo importado",message:result.warnings.join("\n"),tone:"info"});
    return true;
  }

  function captureImageInsertionInput(documentId:string){
    const reader=liveEditorSnapshots.current.get(documentId),session=documentSessionsRef.current[documentId];
    if(reader&&session?.document&&!reader.matchesMarkdown(session.markdown)){
      const markdown=reader.getMarkdownSnapshot();if(markdown!==session.markdown)handleMarkdownChange(documentId,markdown);
    }
  }

  function captureImageInsertion(documentId:string):ImageInsertionTarget {
    if(activeAiProjectRef.current!==activeProject?.id||activeWorkspaceTabIdRef.current!==documentId)throw new Error("Abre el documento donde quieres insertar la imagen.");
    captureImageInsertionInput(documentId);
    const session=documentSessionsRef.current[documentId];
    if(!activeProject||!session)throw new Error("Abre el documento donde quieres insertar la imagen.");
    const target={projectId:activeProject.id,projectEpoch:aiWorkspaceEpoch.current.value,documentId,session:{...session}};
    currentImageInsertionSession(target);return target;
  }

  function currentImageInsertionSession(target:ImageInsertionTarget):DocumentSession {
    if(activeAiProjectRef.current===target.projectId&&aiWorkspaceEpoch.current.value===target.projectEpoch&&activeWorkspaceTabIdRef.current===target.documentId)captureImageInsertionInput(target.documentId);
    if(!imageInsertionTargetIsCurrent(target,{projectId:activeAiProjectRef.current,projectEpoch:aiWorkspaceEpoch.current.value,activeDocumentId:activeWorkspaceTabIdRef.current,sessions:documentSessionsRef.current}))
      throw new Error("El documento o la sesión ha cambiado. Se conserva la edición actual; revisa la imagen y vuelve a insertarla en el documento que quieras.");
    return documentSessionsRef.current[target.documentId];
  }

  async function handleBuildImageReference(documentId: string, assetId: string, altText?: string | null): Promise<InsertImageReferenceResponse> {
    const target=captureImageInsertion(documentId);
    const response=await buildImageReference(target.projectId,documentId,assetId,altText);
    currentImageInsertionSession(target);return response;
  }

  async function handleUploadEditorImage(documentId: string, file: File): Promise<string> {
    const target = captureImageInsertion(documentId);
    const imported = await handleImportProjectImage(null, file);
    try {
      currentImageInsertionSession(target);
      const reference = await buildImageReference(target.projectId, documentId, imported.asset.id, file.name);
      currentImageInsertionSession(target);
      return reference.markdown;
    } catch (error) {
      throw new Error(`La imagen ya está guardada como ${imported.asset.name}. Puedes insertarla desde las imágenes del proyecto. ${getApiErrorMessage(error, "No se pudo insertar en este documento.")}`);
    }
  }

  async function handleBuildHandwrittenImageReference(documentId: string, noteId: string, altText?: string | null): Promise<HandwrittenNoteInsertMarkdownResponse> {
    const target=captureImageInsertion(documentId);
    const session=handwrittenSessionsRef.current[noteId];
    const loadedNote=session?.content?null:await getHandwrittenNote(noteId);
    currentImageInsertionSession(target);
    const content=session?.content??loadedNote?.content??null;
    const name=session?.note?.name??loadedNote?.name??findNodeById(tree,noteId)?.name??"Nota manuscrita.knote";
    const response=await insertHandwrittenPageIntoMarkdown(noteId,{documentId,pageId:content?.pages[0]?.id??"page-1",altText:altText||name.replace(/\.knote$/i,"")||"Nota manuscrita",content:session?.content??null});
    currentImageInsertionSession(target);
    await handleReloadProjectTree(target.projectId);
    currentImageInsertionSession(target);return response;
  }

  function applyImageInsertion(target:ImageInsertionTarget,markdown:string){
    currentImageInsertionSession(target);
    const controller=liveEditorSnapshots.current.get(target.documentId);
    if(!controller||!controller.appendMarkdown||!controller.appendMarkdown(markdown,{addToHistory:true}))throw new Error("No se pudo insertar la imagen en el editor. El texto y los recursos se conservan; vuelve a intentarlo cuando termine la edición.");
    let current:string;try{current=controller.getMarkdownSnapshot();}catch{throw new Error("La imagen está en el editor, pero no se pudo confirmar su texto. Revisa el documento antes de volver a insertarla.");}
    handleMarkdownChange(target.documentId,current);
  }

  async function insertImageIntoActiveDocument(assetId: string) {
    if(!activeProject||!activeDocumentId)return;
    const projectId=activeProject.id,epoch=aiWorkspaceEpoch.current.value,documentId=activeDocumentId;
    if(imageInsertionWork.current.has(documentId))return;imageInsertionWork.current.add(documentId);
    try {
      const target=captureImageInsertion(documentId);
      const reference=await handleBuildImageReference(documentId,assetId,null);
      applyImageInsertion(target,reference.markdown);
      setNotice({title:"Imagen insertada",message:reference.asset.name,tone:"info"});
    }catch(error){if(activeAiProjectRef.current===projectId&&aiWorkspaceEpoch.current.value===epoch)showError(error,"No se pudo insertar la imagen.");}
    finally{imageInsertionWork.current.delete(documentId);}
  }

  async function insertHandwrittenNoteIntoActiveDocument(note: DocumentTreeNode) {
    if(!activeProject||!activeDocumentId){setNotice({title:"Abre un documento",message:"Necesitas un documento Markdown activo para insertar la nota manuscrita.",tone:"info"});return;}
    const projectId=activeProject.id,epoch=aiWorkspaceEpoch.current.value,documentId=activeDocumentId;
    if(imageInsertionWork.current.has(documentId))return;imageInsertionWork.current.add(documentId);
    try {
      const target=captureImageInsertion(documentId);
      const response=await handleBuildHandwrittenImageReference(documentId,note.id,note.name.replace(/\.knote$/i,""));
      applyImageInsertion(target,response.markdown);
      setNotice({title:"Imagen insertada",message:response.asset.name,tone:"info"});
    }catch(error){if(activeAiProjectRef.current===projectId&&aiWorkspaceEpoch.current.value===epoch)showError(error,"No se pudo insertar la nota manuscrita.");}
    finally{imageInsertionWork.current.delete(documentId);}
  }

  function applyFileOperationResult(result: FileOperationResult, sourceNode?: DocumentTreeNode | null, additionalOpenPaths: string[] = []) {
    if((result.treeAvailable===false||result.importReceipt?.treeAvailable===false)&&activeProject)markProjectTreeIssue(activeProject.id,result.treeWarning||"Los cambios están aplicados; no se pudo cargar su estructura. Actualiza la vista sin repetir la operación.");
    if (result.warnings?.length) setNotice({treeProjectId:result.treeAvailable===false&&result.treeWarning&&result.warnings.every(message=>message===result.treeWarning)?activeProject?.id:undefined,title:result.treeAvailable===false?"Operación completada; vista pendiente":result.importReceipt?"Archivo importado; revisa el resultado":"Archivos trasladados; revisión pendiente",message:result.warnings.join("\n"),tone:"info"});
    for (const affected of result.affectedDocuments) {
      documentLoads.current.delete(affected.oldId);
      handwrittenLoads.current.delete(affected.oldId);
    }
    if (activeProject && result.treeAvailable!==false && result.importReceipt?.treeAvailable!==false) {
      setProjectTree(activeProject.id, result.tree, {
        additionalOpenPaths: sourceNode?.type === "folder" && sourceNode.open && result.node?.type === "folder" && result.node.path
          ? [result.node.path]
          : additionalOpenPaths,
      });
      void refreshProjectSyncStatus(activeProject.id, { autoRun: isAutomaticSyncMode(activeProject.syncMode), silent: true });
    } else if(!activeProject && result.treeAvailable!==false && result.importReceipt?.treeAvailable!==false) {
      setTree(result.tree);
    }

    if (sourceNode?.type === "image") {
      if (result.node?.type === "image") {
        setImageTabs((currentTabs) => currentTabs.map((tab) => (
          tab.id === sourceNode.id
            ? { id: result.node!.id, name: result.node!.name, path: result.node!.path ?? tab.path }
            : tab
        )));
        setActiveImageId((currentImageId) => (currentImageId === sourceNode.id ? result.node!.id : currentImageId));
      } else {
        setImageTabs((currentTabs) => {
          const nextTabs = currentTabs.filter((tab) => tab.id !== sourceNode.id);
          setActiveImageId((currentImageId) => (currentImageId === sourceNode.id ? nextTabs[0]?.id ?? "" : currentImageId));
          return nextTabs;
        });
      }
    }

    if (sourceNode?.type === "attachment") {
      if (result.node?.type === "attachment") {
        setActiveTreeNodeId((currentNodeId) => (currentNodeId === sourceNode.id ? result.node!.id : currentNodeId));
      } else {
        setActiveTreeNodeId((currentNodeId) => (currentNodeId === sourceNode.id ? activeDocumentId : currentNodeId));
      }
    }

    if (sourceNode?.type === "handwritten-note") {
      if (result.node?.type === "handwritten-note") {
        setHandwrittenTabs((currentTabs) => currentTabs.map((tab) => (
          tab.id === sourceNode.id ? { id: result.node!.id, name: result.node!.name } : tab
        )));
        setActiveHandwrittenNoteId((currentNoteId) => (currentNoteId === sourceNode.id ? result.node!.id : currentNoteId));
        setActiveTreeNodeId((currentNodeId) => (currentNodeId === sourceNode.id ? result.node!.id : currentNodeId));
      } else {
        setHandwrittenTabs((currentTabs) => {
          const nextTabs = currentTabs.filter((tab) => tab.id !== sourceNode.id);
          setActiveHandwrittenNoteId((currentNoteId) => (currentNoteId === sourceNode.id ? nextTabs[0]?.id ?? "" : currentNoteId));
          return nextTabs;
        });
        setHandwrittenSessions((currentSessions) => {
          const { [sourceNode.id]: _removedSession, ...nextSessions } = currentSessions;
          return nextSessions;
        });
      }
    }

    if (sourceNode?.type === "folder" && sourceNode.path) {
      const nextFolderPath = result.node?.type === "folder" ? result.node.path ?? null : null;
      const projectId = activeProject?.id ?? "";
      setImageTabs((currentTabs) => {
        let nextActiveImageId = activeImageId;
        const nextTabs = currentTabs.flatMap((tab) => {
          if (!isPathInScope(tab.path, sourceNode.path ?? "")) return [tab];
          if (!nextFolderPath) {
            if (tab.id === activeImageId) nextActiveImageId = "";
            return [];
          }
          const nextPath = remapPathInScope(tab.path, sourceNode.path ?? "", nextFolderPath);
          const nextId = projectScopedNodeId(projectId, nextPath, tab.id);
          if (tab.id === activeImageId) nextActiveImageId = nextId;
          return [{ id: nextId, name: fileNameFromPath(nextPath), path: nextPath }];
        });
        if (nextActiveImageId && !nextTabs.some((tab) => tab.id === nextActiveImageId)) nextActiveImageId = nextTabs[0]?.id ?? "";
        setActiveImageId(nextActiveImageId);
        return nextTabs;
      });
      setReferenceDocumentTabs((currentTabs) => {
        let nextActiveReferenceDocumentId = activeReferenceDocumentId;
        const nextTabs = currentTabs.flatMap((tab) => {
          if (!isPathInScope(tab.path, sourceNode.path ?? "")) return [tab];
          if (!nextFolderPath) {
            if (tab.id === activeReferenceDocumentId) nextActiveReferenceDocumentId = "";
            return [];
          }
          const nextPath = remapPathInScope(tab.path, sourceNode.path ?? "", nextFolderPath);
          const nextId = projectScopedNodeId(projectId, nextPath, tab.id);
          if (tab.id === activeReferenceDocumentId) nextActiveReferenceDocumentId = nextId;
          return [{ ...tab, id: nextId, name: fileNameFromPath(nextPath), path: nextPath }];
        });
        if (nextActiveReferenceDocumentId && !nextTabs.some((tab) => tab.id === nextActiveReferenceDocumentId)) nextActiveReferenceDocumentId = nextTabs[0]?.id ?? "";
        setActiveReferenceDocumentId(nextActiveReferenceDocumentId);
        return nextTabs;
      });
    }

    if (result.affectedDocuments.length === 0) return;

    setTabs((currentTabs) => {
      let nextTabs = currentTabs;
      for (const affectedDocument of result.affectedDocuments) {
        if (affectedDocument.newId) {
          nextTabs = nextTabs.map((tab) => (
            tab.id === affectedDocument.oldId
              ? { id: affectedDocument.newId!, name: affectedDocument.name ?? tab.name }
              : tab
          ));
        } else {
          nextTabs = nextTabs.filter((tab) => tab.id !== affectedDocument.oldId);
        }
      }
      return nextTabs;
    });

    setHandwrittenTabs((currentTabs) => {
      let nextTabs = currentTabs;
      for (const affectedDocument of result.affectedDocuments) {
        if (affectedDocument.newId) {
          nextTabs = nextTabs.map((tab) => (
            tab.id === affectedDocument.oldId
              ? { id: affectedDocument.newId!, name: affectedDocument.name ?? tab.name }
              : tab
          ));
        } else {
          nextTabs = nextTabs.filter((tab) => tab.id !== affectedDocument.oldId);
        }
      }
      return nextTabs;
    });

    documentSessionsRef.current = applyDocumentFileChanges(documentSessionsRef.current,result.affectedDocuments);
    handwrittenSessionsRef.current = applyHandwrittenFileChanges(handwrittenSessionsRef.current,result.affectedDocuments);
    setDocumentSessions(current=>applyDocumentFileChanges(current,result.affectedDocuments));
    setHandwrittenSessions(current=>applyHandwrittenFileChanges(current,result.affectedDocuments));

    const activeChange = result.affectedDocuments.find((affectedDocument) => affectedDocument.oldId === activeDocumentId);
    if (activeChange?.newId) {
      setActiveDocumentId(activeChange.newId);
      setActiveTreeNodeId(activeChange.newId);
      return;
    }

    if (activeChange && !activeChange.newId) {
      const firstDocument = findFirstDocument(result.tree);
      setActiveDocumentId(firstDocument?.id ?? "");
      setActiveTreeNodeId(firstDocument?.id ?? "");
      setTabs((currentTabs) => currentTabs.length > 0 ? currentTabs : firstDocument ? [{ id: firstDocument.id, name: firstDocument.name }] : []);
    }

    const activeHandwrittenChange = result.affectedDocuments.find((affectedDocument) => affectedDocument.oldId === activeHandwrittenNoteId);
    if (activeHandwrittenChange?.newId) {
      setActiveHandwrittenNoteId(activeHandwrittenChange.newId);
      setActiveTreeNodeId(activeHandwrittenChange.newId);
      return;
    }

    if (activeHandwrittenChange && !activeHandwrittenChange.newId) {
      const firstHandwrittenNote = findFirstHandwrittenNote(result.tree);
      setActiveHandwrittenNoteId(firstHandwrittenNote?.id ?? "");
      setActiveTreeNodeId(firstHandwrittenNote?.id ?? "");
      setHandwrittenTabs((currentTabs) => currentTabs.length > 0 ? currentTabs : firstHandwrittenNote ? [{ id: firstHandwrittenNote.id, name: firstHandwrittenNote.name }] : []);
    }
  }

  const historyEnabled = Boolean(activeProject && versioningStatus?.enabled);

  const settingsSurface = (<AppSettingsDialog
        privacyProject={activeProject?{id:activeProject.id,name:activeProject.name}:null}
        onBeforeProjectBackup={async projectId=>{
          const epoch=aiWorkspaceEpoch.current.value;
          if(activeAiProjectRef.current!==projectId||!await checkpointOpenWork())throw Error("Protege los cambios pendientes antes de preparar la copia.");
          if(activeAiProjectRef.current!==projectId||aiWorkspaceEpoch.current.value!==epoch)throw Error("El espacio de trabajo ha cambiado. Revisa el proyecto antes de preparar la copia.");
        }}
        onProjectBackupRestorePrepared={(projectId,transferId)=>{
          if(activeAiProjectRef.current!==projectId)return;
          setAppSettingsOpen(false);
          setExpectedBackupTransferId(transferId);
          setProjectTransferMode({kind:"import"});
        }}
        onSecurityChanged={async()=>{credentialRevision.current++;githubAuthEpochRef.current++;setGithubDevice(null);setGithubLoginState("idle");setAuthStatus(await getAuthStatus());await refreshAiState();}}
        onBeforeChange={beforeCriticalStateChange}
        onSettled={afterCriticalStateChange}
        presentation="workspace"
        section={settingsInitialSection}
        onSectionChange={setSettingsInitialSection}
        initialSection={settingsInitialSection}
        navigationWidth={layoutConfig.sidebarWidth}
        onOpenRecordings={() => {setRecordingDestination(null);setRecordingPanel(true);}}
        open={appSettingsOpen}
        appearance={appearanceConfig}
        diagnostics={diagnosticsConfig}
        exportTemplate={exportTemplateConfig}
        exportTemplatePath={exportTemplatePath}
        ai={aiConfig}
        aiIndexStatus={aiIndexStatus}
        traceLogStatus={traceLogStatus}
        runtimeServicesStatus={runtimeServicesStatus}
        runtimeServicesRefreshing={runtimeServicesRefreshing}
        exportResetting={exportResetting}
        saveFailures={Object.entries(settingsPersistence.states).flatMap(([id, state]) => state.phase === "error" ? [{id: id as SettingsDomain, label: ({app: appearanceConfig.language === "en" ? "Application preferences" : "Preferencias de la aplicación", ai: appearanceConfig.language === "en" ? "AI preferences" : "Preferencias de IA", export: appearanceConfig.language === "en" ? "Export styles" : "Estilos de exportación"})[id as SettingsDomain], message: state.message ?? "No se pudieron guardar estos ajustes."}] : [])}
        onRetrySave={domain => void settingsPersistence.retry(domain)}
        saveState={appSettingsSaveState}
        saveMessage={appSettingsSaveMessage}
        configPersistenceAvailable={configPersistenceAvailable}
        onClose={() => setAppSettingsOpen(false)}
        onAppearanceChange={handleAppearanceConfigChange}
        onDiagnosticsChange={handleDiagnosticsConfigChange}
        onExportTemplateChange={handleExportTemplateChange}
        onResetExportTemplate={() => void handleResetExportTemplate()}
        onAiChange={handleAiConfigChange}
        onSaveOpenAiKey={handleSaveOpenAiKey}
        onDeleteOpenAiKey={() => void handleDeleteOpenAiKey()}
        aiIndexBusy={aiIndexMaintenance.busy}
        aiIndexError={aiIndexMaintenance.error}
        onRefreshAiIndex={() => void aiIndexMaintenance.refresh()}
        onRebuildAiIndex={() => void aiIndexMaintenance.rebuild()}
        onReindexImages={() => void handleReindexProjectImages()}
        onDeleteAiIndex={() => void aiIndexMaintenance.clear()}
        onOpenTraceLogFolder={() => void handleOpenTraceLogFolder()}
        onRefreshRuntimeServices={() => void refreshRuntimeServiceStatus()}
      />);

  return (
    <>
      <DesktopLayout
        continuityNotice={<WorkspaceContinuityNotice state={workspaceContinuity.state} onRetry={workspaceContinuity.retry}/>}
        applyingAiEditProposalId={applyingAiEditProposalId}
        canApplyEditorOperation={operation => !operation.aiProposalId || (aiProposalExecution.current.mayApply(operation.id) && aiProposalRequests.current.has(operation.aiProposalId) && aiConfigRef.current.permissions.editDocuments && aiTrackedOperationEpochs.current.get(operation.id)?.epoch===aiWorkspaceEpoch.current.value && aiTrackedOperationEpochs.current.get(operation.id)?.projectId===activeAiProjectRef.current)}
        aiResultReview={{ count: aiResultReview.entries.length, hasError: Boolean(aiResultReview.error || aiResultReview.warnings.length || aiResultReview.entries.some(entry => entry.error)), onOpen: () => setAiResultReviewOpen(true) }}
        settingsWorkspace={{
          open: appSettingsOpen,
          content: settingsSurface,
          navigation: actions => <SettingsNavigation language={appearanceConfig.language} section={settingsInitialSection} onSelectSection={setSettingsInitialSection} {...actions}/>,
          context: <SettingsContext section={settingsInitialSection} language={appearanceConfig.language} projectName={activeProject?.name}/>,
          onClose: () => setAppSettingsOpen(false),
        }}
        onOpenTrash={() => setTrashOpen(true)}
        appearance={appearanceConfig}
        appVersion={APP_VERSION}
        appLanguage={appearanceConfig.language}
        markdownExtendedUnderlineEnabled={appearanceConfig.markdownExtendedUnderlineEnabled}
        authStatus={authStatus}
        projects={projects}
        activeProject={activeProject}
        aiConfig={aiConfig}
        aiIndexStatus={aiIndexStatus}
        aiConversationEvents={aiConversationEvents}
        aiUsageSummary={aiUsageSummary}
        aiPendingIntent={aiPendingIntent}
        aiEditProposal={visibleAiEditProposal}
        staleAiEditOperationIds={staleAiEditOperationIds}
        blockedAiEditOperationReasons={blockedAiEditOperationReasons}
        appliedAiEditOperationIds={appliedAiEditOperationIds}
        aiBubble={aiBubble}
        aiAppliedChange={aiAppliedChange}
        aiSelectionFocus={aiSelectionFocus}
        aiResearchBrief={aiResearchBrief}
        aiResearchJob={aiResearchJob}
        aiResearchJobs={aiResearchJobs}
        aiContextSources={visibleAiContextSources}
        tree={tree}
        treeReadIssue={treeReadIssue?.projectId===activeProject?.id?treeReadIssue?.message:null}
        treeReadBusy={treeReadBusy}
        onReloadProjectTree={()=>void handleReloadProjectTree()}
        tabs={workspaceTabs}
        activeTabId={activeTabId}
        activeDocumentId={activeDocumentId}
        activeTreeNodeId={activeTreeNodeId}
        activeImageId={activeImageId}
        activeHandwrittenNoteId={activeHandwrittenNoteId}
        editorSessions={editorSessions}
        onOpenRecordings={()=>{setRecordingDestination(null);setRecordingPanel(true);}}
        onRetryDocumentLoad={id=>{void loadDocumentSession(id, true);}}
        onRetryHandwrittenLoad={id=>{void(async()=>{if(await flushPendingDrafts())await loadHandwrittenNoteSession(id,true);})();}}
        activeHandwrittenLoadError={activeHandwrittenSession?.loadError}
        notesMarkdown={notesMarkdown}
        notesUpdatedAt={notesUpdatedAt}
        notesEditorKey={`${NOTES_WORKSPACE_TAB_ID}-${notesLoadVersion}`}
        notesLoaded={notesLoaded}
        notesSaveState={notesSaveState}
        notesDirty={notesMarkdown!==notesSavedMarkdown}
        releaseNotesMarkdown={RELEASE_NOTES_MARKDOWN}
        activeDocument={activeSession?.document ?? null}
        activeMarkdown={activeSession?.markdown ?? ""}
        activeHandwrittenNote={activeHandwrittenNote}
        activeHandwrittenContent={activeHandwrittenContent}
        handwrittenToolPresets={handwrittenConfig.toolPresets}
        handwrittenEraserConfig={handwrittenConfig.eraser}
        activeHandwrittenDirty={activeHandwrittenSession?.isDirty ?? false}
        activeHandwrittenLoading={!activeHandwrittenSession||activeHandwrittenSession.isLoading}
        activeHandwrittenSaveState={activeHandwrittenSession?.saveState ?? "idle"}
        activeHandwrittenConflictStatus={activeHandwrittenSession?.conflictStatus}
        activeHandwrittenDiskChanged={activeHandwrittenSession?.diskChanged}
        onKeepHandwrittenVersion={()=>void handleSaveHandwrittenNote(activeHandwrittenNoteId, true)}
        onLoadHandwrittenDiskVersion={()=>void handleLoadHandwrittenDiskVersion()}
        onMergeHandwrittenDiskVersion={()=>void requestHandwrittenMerge()}
        onRecoverHandwrittenCopy={()=>{void(async()=>{if(!await flushPendingDrafts())return;const session=handwrittenSessionsRef.current[activeHandwrittenNoteId];if(session&&await persistHandwrittenDraft(activeHandwrittenNoteId,session,true)&&await flushPendingDrafts()){setRecoverableDraftsOpen(true);void refreshOrphanDrafts();}})();}}
        activeDocumentDirty={activeSession?.isDirty ?? false}
        activeDocumentLoading={!activeSession||activeSession.isLoading}
        activeDocumentLoadError={activeSession?.loadError}
        activeDocumentSyncStatus={activeDocumentSyncStatus}
        activeDocumentPostSaveSyncState={documentPostSaveSyncStates[activeDocumentId]?.state ?? "idle"}
        activeDocumentPendingSaveHint={activeDocumentPendingSaveHint}
        pendingEditorOperations={pendingEditorOperations}
        activeDocumentConflictStatus={activeSession?.conflictStatus ?? "none"}
        activeDocumentHasRecoveredDraft={activeSession?.hasRecoveredDraft ?? false}
        activeDraftWriteConflict={Boolean(activeSession?.draftWriteConflict)}
        activeHandwrittenDraftWriteConflict={Boolean(activeHandwrittenSession?.draftWriteConflict)}
        draftReviewBusy={draftReviewBusy}
        onReviewChangedDraft={(id,ink)=>void reviewChangedDraft(id,ink)}
        activeDocumentDiskChanged={activeSession?.diskChanged ?? false}
        dirtyDocumentIds={dirtyDocumentIds}
        orphanDraftCount={orphanDrafts.length}
        isCheckingForUpdates={updateState === "checking"}
        saveState={activeSession?.saveState ?? "idle"}
        historyOpen={historyOpen}
        historyEnabled={historyEnabled}
        versioningStatus={versioningStatus}
        projectSyncStatus={projectSyncStatus}
        fileSyncOverview={fileSyncOverview}
        fileSyncOverviewError={fileSyncOverviewError}
        openDocumentDraftStates={openDocumentDraftStates}
        externalChangeSet={externalChangeSet}
        externalChangeDecisions={externalChangeDecisions}
        projectActivity={projectActivity}
        externalChangesOpen={externalChangesOpen}
        externalChangesBusy={externalChangesBusy}
        projectSyncState={projectSyncState}
        externalChangeSetAcknowledged={isAcknowledgedExternalChangeSet(activeProject?.id, externalChangeSet, acknowledgedExternalChangeSets)}
        externalChangesMessage={externalChangesMessage}
        layoutConfig={layoutConfig}
        onSelectProject={handleSelectProject}
        onCreateProject={() => setCreateProjectOpen(true)}
        onImportProjectPackage={() => setProjectTransferMode({ kind: "import" })}
        stateTransitionAuthority={{onBeforeChange:beforeCriticalStateChange,onSettled:afterCriticalStateChange}}
        onOpenAiChangeHistory={()=>setAiChangeHistoryOpen(true)}
        onOpenAssetCatalog={()=>setAssetCatalogOpen(true)}
        onOpenProjectReplace={()=>setProjectReplaceOpen(true)}
        onExportProjectPackage={() => { if (activeProject) setProjectTransferMode({ kind: "export", projectId: activeProject.id, projectName: activeProject.name }); }}
        onRetiredProjects={returnFocus=>{retiredProjectsFocus.current=returnFocus;setRetiredProjectsOpen(true);}}
        onRegisterEditorSnapshot={registerLiveEditor}
        onConfigureProject={() => {
          if (activeProject) setEditProjectOpen(true);
        }}
        onOpenLocalReference={handleOpenLocalReference}
        onOpenAppSettings={(section) => { setSettingsInitialSection(section ?? "summary"); setAppSettingsOpen(true); }}
        onCreateFolder={(parentId) => void handleCreateFolder(parentId)}
        onImportProjectFile={(parentId) => void promptImportProjectFile(parentId)}
        onRenameNode={handleRenameNode}
        onToggleNode={handleToggleNode}
        onExpandTree={handleExpandTree}
        onCollapseTree={handleCollapseTree}
        onRecordAudio={parentId => {if(activeProject){setRecordingDestination({projectId:activeProject.id,folderId:parentId,name:`Reunión ${new Date().toISOString().slice(0,16).replace(/:/g,"-")}.md`});setRecordingPanel(true);}}}
        onCreateDocument={(parentId) => {
          setCreateDocumentParentId(parentId);
          setCreateDocumentInitialKind("document");
          setCreateDocumentOpen(true);
        }}
        onCreateHandwrittenNote={(parentId) => {
          setCreateDocumentParentId(parentId);
          setCreateDocumentInitialKind("handwritten-note");
          setCreateDocumentOpen(true);
        }}
        onOpenRecoverableDrafts={() => {
          setRecoverableDraftsOpen(true);
          void refreshOrphanDrafts();
        }}
        onCheckForUpdates={() => void handleCheckForUpdates("manual")}
        onOpenReleaseNotes={handleOpenReleaseNotes}
        onLoginGithub={() => void handleOpenGithubLogin()}
        onLogout={() => void handleLogoutGithub()}
        onPullProject={() => void handlePullProject()}
        onPushProject={() => void handlePushProject()}
        onOpenProjectGithub={() => void handleOpenProjectGithub()}
        onOpenExternalChanges={() => {
          setExternalChangesOpen(true);
          void handleRefreshProtectionState(activeProject?.id);
        }}
        onCloseExternalChanges={() => setExternalChangesOpen(false)}
        onRefreshExternalChanges={() => void handleRefreshProtectionState(activeProject?.id)}
        beforeMixedApplication={async()=>{if(!activeProject||activeAiProjectRef.current!==activeProject.id||!await checkpointOpenWork())return false;return activeAiProjectRef.current===activeProject.id;}}
        onMixedApplicationChanged={()=>{if(activeProject&&activeAiProjectRef.current===activeProject.id){void handleReloadProjectTree(activeProject.id);void checkOpenDocumentSync({silent:true});void handleRefreshProtectionState(activeProject.id);}}}
        onHistoricalCopyTreeUnavailable={(projectId,message)=>{if(activeAiProjectRef.current===projectId&&aiWorkspaceEpoch.current.value===historicalCopyRenderEpoch)markProjectTreeIssue(projectId,message);}}
        onHistoricalCopyTree={(projectId,nextTree)=>{if(activeAiProjectRef.current===projectId&&aiWorkspaceEpoch.current.value===historicalCopyRenderEpoch)setProjectTree(projectId,nextTree);}}
        onExternalChangeDecision={handleExternalChangeDecision}
        onImportExternalChanges={() => void handleImportExternalChanges()}
        onImportSafeExternalChanges={() => void handleImportExternalChanges({ safeOnly: true })}
        onOmitExternalChanges={handleOmitExternalChanges}
        onSaveDocument={(documentId) => handleSave(documentId)}
        onDiscardDocumentDraft={(documentId) => handleDiscardActiveDocumentDraft(documentId)}
        onRestoreVersion={handleRestoreActiveVersion}
        onSaveActiveDocument={() => handleSave()}
        onDiscardActiveDocumentDraft={handleDiscardActiveDocumentDraft}
        onSendAiPrompt={handleSendAiPrompt}
        onUpdateAiResearchBrief={setAiResearchBrief}
        onReviewResearchEvidence={jobId=>{if(activeProject)setResearchEvidenceReview({projectId:activeProject.id,projectName:activeProject.name,jobId});}}
        onStartAiResearch={(brief) => void handleStartAiResearch(brief)}
        onCancelAiResearchBrief={() => {
          setAiResearchBrief(null);
          setAiResearchJob(null);
        }}
        onCancelAiResearchJob={(jobId) => void handleCancelAiResearchJob(jobId)}
        onRetryAiResearchJob={(jobId) => void handleRetryAiResearchJob(jobId)}
        onAiTranscriptionChange={handleAiTranscriptionChange}
        onClearAiSelectionFocus={() => setAiSelectionFocus(null)}
        onSearchAiContextDocuments={handleSearchAiContextDocuments}
        onAddProjectDocumentContext={handleAddProjectDocumentContext}
        onAddProjectImageContext={handleAddProjectImageContext}
        onUploadAiContextFiles={handleUploadAiContextFiles}
        onPickLocalAiContextFiles={handlePickLocalAiContextFiles}
        onRemoveAiContextSource={handleRemoveAiContextSource}
        onExtendAiContextSource={handleExtendAiContextSource}
        onPreviewAiContextSource={handlePreviewAiContextSource}
        onRefreshAiContextSource={handleRefreshAiContextSource}
        onAddAiContextSourceToProject={handleAddAiContextSourceToProject}
        onAiIntentAction={handleAiIntentAction}
        onApplyAiEditProposal={handleApplyAiEditProposal}
        onDiscardAiEditProposal={handleDiscardAiEditProposal}
        onCloseAiBubble={() => setAiBubble(null)}
        onDismissAiAppliedChange={handleDismissAiAppliedChange}
        onOpenAiConversation={() => handleSelectTab(AI_CONVERSATION_TAB_ID)}
        isSyncingProject={syncState !== "idle"}
        onOpenDocument={handleOpenDocument}
        onOpenHandwrittenNote={handleOpenHandwrittenNote}
        onOpenImage={handleOpenImage}
        onOpenReferenceDocument={handleOpenReferenceDocument}
        onActivateTreeNode={handleActivateTreeNode}
        onSelectTreeNode={handleSelectTreeNode}
        handwrittenPageFocus={handwrittenPageFocus}
        onHandwrittenPageFocusHandled={requestId=>setHandwrittenPageFocus(current=>current?.requestId===requestId?null:current)}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onCloseTabs={handleCloseTabs}
        onReorderDocumentTabs={handleReorderDocumentTabs}
        onTreeContextAction={handleTreeContextAction}
        onExportDocument={handleExportDocument}
        onSaveDocumentTemplate={handleCaptureDocumentTemplate}
        onHandwrittenChange={handleHandwrittenChange}
        onHandwrittenToolPresetsChange={handleHandwrittenToolPresetsChange}
        onHandwrittenEraserConfigChange={handleHandwrittenEraserConfigChange}
        onBeforeHandwrittenOcr={beforeHandwrittenOcr}
        onApplyHandwrittenOcr={applyReviewedHandwrittenOcr}
        onHandwrittenOcrObserved={observeHandwrittenOcr}
        onSaveHandwrittenNote={handleSaveHandwrittenNote}
        onExportHandwrittenNote={handleExportHandwrittenNote}
        onAddHandwrittenNoteContext={handleAddHandwrittenNoteContext}
        onMoveTreeNode={handleMoveTreeNodeDrop}
        onBatchAction={activeProject ? (action, nodeIds,initialTargetFolderId) => {if(action==="export")setProjectTransferMode({kind:"export",projectId:activeProject.id,projectName:activeProject.name,nodeIds});else setFileBatch({ projectId: activeProject.id, action, nodeIds,initialTargetFolderId,workspaceEpoch:aiWorkspaceEpoch.current.value });} : undefined}
        onImportProjectImage={handleImportProjectImage}
        onUploadEditorImage={handleUploadEditorImage}
        onBuildImageReference={handleBuildImageReference}
        onBuildHandwrittenImageReference={handleBuildHandwrittenImageReference}
        onInsertImageIntoActiveDocument={(assetId) => void insertImageIntoActiveDocument(assetId)}
        onMarkdownChange={handleMarkdownChange}
        onNotesMarkdownChange={handleNotesMarkdownChange}
        onEditorOperationApplied={handleEditorOperationApplied}
        onEditorOperationFailed={handleEditorOperationFailed}
        onDocumentSelectionChange={handleDocumentSelectionChange}
        onSave={() => void handleSave()}
        onSynchronizeDocument={requestSynchronizeActiveDocument}
        onUpdateDocumentFromRemote={requestIncomingDocumentVersion}
        onDiscardPendingDocumentChanges={requestDiscardActiveDocumentDraft}
        onKeepLocalVersion={() => void handleSave(activeDocumentId, true)}
        onLoadDiskVersion={() => void handleLoadDiskVersion()}
        onMergeDiskVersion={()=>void requestDocumentMerge()}
        onRestoreVersionParts={versionId=>void requestDocumentMerge(versionId)}
        onReviewRemoteVersion={activeProject&&(activeProject.syncMode==="manual-github"||activeProject.syncMode==="auto-github")?()=>void requestDocumentMerge(undefined,true):undefined}
        onToggleHistory={() => {
          if (historyEnabled) setHistoryOpen((isOpen) => !isOpen);
        }}
        onCloseHistory={() => setHistoryOpen(false)}
        onLayoutConfigChange={handleLayoutConfigChange}
      />
      <GlobalTooltip />
      <StartupOverlay loading={!configLoaded} />
      {exitProtection&&<ModalFrame label="Protegiendo el trabajo antes de salir" onClose={()=>{}} className="!z-[180] !bg-white"><section className="max-w-sm p-5 text-center"><h2 data-autofocus tabIndex={-1} className="text-lg font-semibold outline-none">Protegiendo el trabajo antes de salir</h2><p role="status" className="mt-3 text-sm leading-6 text-ink-secondary">Se confirman los borradores y las notas antes de cerrar. Si falta una confirmación, el espacio permanece abierto para resolverla.</p></section></ModalFrame>}
      {updateProtection&&<ModalFrame label="Trabajo protegido para actualizar" onClose={()=>{}} className="!z-[175] !bg-white"><section className="max-w-sm p-5 text-center"><h2 data-autofocus tabIndex={-1} className="text-lg font-semibold outline-none">Trabajo protegido para actualizar</h2><p role="status" className="mt-3 text-sm leading-6 text-ink-secondary">{updateProtection==="protecting"?"Se confirma el trabajo actual y se prepara la instalación. Las nuevas ediciones y capturas esperan para conservar este punto de recuperación.":"El instalador se ha abierto o su resultado requiere revisión. El espacio permanece protegido. Si vuelves a trabajar, comprueba que la instalación haya terminado o se haya cancelado."}</p>{updateProtection==="installer-open"&&<button className="mt-4 min-h-11 rounded bg-brand-orange px-4 text-sm font-semibold text-white" onClick={()=>void returnFromUpdatePreparation()}>Volver al espacio</button>}</section></ModalFrame>}
      {criticalTransitionBusy&&<ModalFrame label="Revisando el estado protegido" onClose={()=>{}} className="!z-[170] !bg-white"><section className="max-w-sm p-5 text-center"><h2 data-autofocus tabIndex={-1} className="text-lg font-semibold outline-none">Revisando el estado protegido</h2><p role="status" className="mt-3 text-sm leading-6 text-ink-secondary">El trabajo está protegido. Se comprueba la operación y se vuelve a cargar el estado conservado, sin repetir acciones.</p></section></ModalFrame>}
      {aiChangeHistoryOpen&&activeProject&&<AiChangeHistoryDialog key={activeProject.id} projectId={activeProject.id} projectName={activeProject.name} onClose={()=>setAiChangeHistoryOpen(false)} onBeforeChange={beforeCriticalStateChange} onSettled={afterCriticalStateChange}/>}
      {projectReplaceOpen&&activeProject&&<ProjectReplaceDialog key={activeProject.id} projectId={activeProject.id} projectName={activeProject.name} onClose={()=>setProjectReplaceOpen(false)} onBeforeReview={async()=>{if(!await checkpointOpenWork())throw Error("Protege los cambios pendientes antes de revisar el reemplazo");}} onBeforeChange={beforeCriticalStateChange} onSettled={afterCriticalStateChange}/>}
      {localRuntimeRecoveryOpen && <StartupRecovery error={localRuntimeRecoveryError} onRetry={handleRetryLocalRuntimeRecovery}/>}
      <AppNoticeBanner notice={notice} onClose={() => setNotice(null)} />
      <ExportStatus progress={exportProgress} saved={exportedFileNotice} opening={exportOpening} onClose={()=>setExportedFileNotice(null)} onOpen={()=>{if(!exportedFileNotice||exportOpening)return;setExportOpening(true);void openMobileExport(exportedFileNotice.exportId).catch(error=>showError(error,"El archivo está guardado, pero no se pudo abrir.")).finally(()=>setExportOpening(false));}}/>
      {recordingNotice && <div role="status" className="fixed bottom-20 right-4 z-[130] flex items-center gap-3 rounded-lg border border-line bg-white p-3 text-sm shadow-lg"><span>Transcripción guardada</span><button className="min-h-11 text-brand-orange" onClick={()=>{void openRecordingDocument(recordingNotice.id);setRecordingNotice(null);}}>Abrir documento</button><button className="min-h-11 px-2" aria-label="Cerrar aviso de transcripción" onClick={()=>setRecordingNotice(null)}>×</button></div>}
      {aiResultReviewOpen && <AiResultReviewDialog {...aiResultReview} onClose={() => setAiResultReviewOpen(false)} onRetry={entry => aiResultReview.retain(entry.result)} onReload={aiResultReview.reload} onRemove={aiResultReview.remove} onCopy={async (id, outputId) => {
        const entry = aiResultReview.entries.find(entry => entry.result.id === id);
        const result = await aiResultReview.copy(id, outputId);
        if (!result) return null;
        if (entry && entry.result.projectId === activeAiProjectRef.current) setProjectTree(entry.result.projectId, result.tree);
        return result.node?.path ?? result.node?.name ?? "Archivo nuevo en el proyecto de origen";
      }}/>}
      {researchEvidenceReview&&activeProject?.id===researchEvidenceReview.projectId&&<ResearchEvidenceReviewDialog key={researchEvidenceReview.projectId+researchEvidenceReview.jobId} {...researchEvidenceReview} onClose={()=>setResearchEvidenceReview(null)} onOpenLocalReference={handleOpenLocalReference} onOpenExternal={url=>{void openExternalUrl(url).catch(error=>showError(error,"No se pudo abrir la fuente externa"));}}/>}
      {assetCatalogOpen&&activeProject&&<AssetCatalogDialog key={activeProject.id} projectId={activeProject.id} projectName={activeProject.name} onClose={()=>setAssetCatalogOpen(false)} onOpen={target=>{setAssetCatalogOpen(false);handleOpenLocalReference(target);}} onOpenExternal={url=>{void openExternalUrl(url).catch(error=>showError(error,"No se pudo abrir el enlace externo"));}}/>}
      {assetMoveReview.review&&<AssetMoveImpactDialog language={appearanceConfig.language} key={assetMoveReview.review.path} review={assetMoveReview.review} onDecide={assetMoveReview.settle}/>}
      {meetingMinutes&&<MeetingMinutesDialog key={meetingMinutes.projectId+meetingMinutes.sessionId} {...meetingMinutes} onClose={()=>setMeetingMinutes(null)} onBeforeChange={beforeCriticalStateChange} onSettled={afterCriticalStateChange} onPublished={id=>{setMeetingMinutes(null);setPendingRecordingDocument({id,projectId:id.split("::")[0]});}}/>}
      {recordingPanel && <ModalFrame label="Grabaciones" onClose={() => {setRecordingPanel(false); if(activeProject) void handleReloadProjectTree(activeProject.id);}} className="recording-overlay"><div className="recording-floating-panel"><RecordingPanel compact embedded onOpenMinutes={(sessionId,projectId)=>{setRecordingPanel(false);setMeetingMinutes({sessionId,projectId});}} onOpenSettings={()=>{setRecordingPanel(false);if(activeProject)void handleReloadProjectTree(activeProject.id);setAppSettingsOpen(true);}} initialDestination={recordingDestination} onClose={() => {setRecordingPanel(false); if(activeProject) void handleReloadProjectTree(activeProject.id);}} onOpenDocument={id => {void openRecordingDocument(id);}} /></div></ModalFrame>}
      {trashOpen && activeProject && <ProjectTrashDialog projectId={activeProject.id} projectName={activeProject.name} onRestored={result => applyFileOperationResult(result)} onClose={() => setTrashOpen(false)}/>}
      {fileBatch && activeProject?.id === fileBatch.projectId && <FileBatchDialog {...fileBatch} nodes={tree} folders={collectFolders(tree)} beforeExecute={beforeFileBatchExecute} onClose={() => {assetMoveReview.settle(false);setFileBatch(null);}} onApplied={plan => {
        if(fileBatchRef.current!==fileBatch||activeAiProjectRef.current!==fileBatch.projectId||aiWorkspaceEpoch.current.value!==fileBatch.workspaceEpoch)return;
        if(plan.action==="context"){void refreshAiContextSources(fileBatch.projectId).catch(error=>showError(error,"El contexto se ha actualizado; no se pudo refrescar su vista."));return;}
        for (const effect of fileBatchEffects(plan,id=>findNodeById(tree,id))) applyFileOperationResult(effect.result,effect.source,effect.openPaths);
      }}/>}

      <AiDeleteConfirmationDialog
        pendingDelete={aiPendingDelete}
        onCancel={() => setAiPendingDelete(null)}
        onConfirm={() => void handleConfirmAiDelete()}
      />
      <UpdateAvailableDialog
        update={availableUpdate}
        state={updateState}
        progress={updateProgress}
        error={updateError}
        onClose={() => {
          if (updateState === "downloading" || updateState === "installing") return;
          setAvailableUpdate(null);
          setUpdateError(null);
          setUpdateState("idle");
        }}
        onInstall={() => void handleInstallUpdate()}
      />
      <GithubLoginDialog
        open={githubLoginOpen}
        state={githubLoginState}
        device={githubDevice}
        error={githubLoginError}
        polling={githubLoginPolling}
        onClose={handleCloseGithubLogin}
        onStart={() => void handleStartGithubLogin()}
        onOpenGithub={() => void handleOpenGithubDevicePage()}
        onPoll={() => void handlePollGithubLogin()}
      />
      <CreateDocumentDialog
        open={createDocumentOpen}
        initialKind={createDocumentInitialKind}
        projectId={activeProject?.id}
        destinationLabel={activeProject ? `${activeProject.name} / ${createDocumentParentId ? findNodeById(tree, createDocumentParentId)?.path ?? "Carpeta seleccionada" : "Raíz del proyecto"}` : undefined}
        onClose={() => {
          setCreateDocumentOpen(false);
          setCreateDocumentParentId(null);
          setCreateDocumentInitialKind("document");
        }}
        onCreate={handleCreateDocument}
      />
      {templateCapture && (
        <SaveDocumentTemplateDialog source={templateCapture} onClose={() => setTemplateCapture(null)} onSaved={name => {
          setTemplateCapture(null);
          setNotice({ title: "Plantilla guardada", message: `«${name}» está disponible en Crear documento.`, tone: "info" });
        }}/>
      )}
      <CreateProjectDialog
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreate={handleCreateProject}
        onImportPackage={() => setProjectTransferMode({ kind: "import" })}
        onProjectTemplates={()=>setProjectTemplateCatalog(true)}
        authStatus={authStatus}
        capabilities={projectCapabilities}
        githubRepositories={githubRepositories}
        githubRepositoriesLoading={githubRepositoriesLoading}
        onLoginGithub={() => void handleOpenGithubLogin()}
        onRefreshGithubRepositories={() => void refreshGithubRepositories()}
      />
      <CreateProjectDialog
        open={editProjectOpen}
        mode="edit"
        project={activeProject}
        onClose={() => setEditProjectOpen(false)}
        onCreate={handleCreateProject}
        onUpdate={handleUpdateProject}
        onDelete={handleDeleteProject}
        authStatus={authStatus}
        capabilities={projectCapabilities}
        githubRepositories={githubRepositories}
        githubRepositoriesLoading={githubRepositoriesLoading}
        projectSyncStatus={projectSyncStatus}
        onLoginGithub={() => void handleOpenGithubLogin()}
        onLogoutGithub={() => void handleLogoutGithub()}
        onVerifyGithubConnection={() => handleVerifyGithubConnection()}
        onRefreshGithubRepositories={() => void refreshGithubRepositories()}
      />
      {projectLocationReview.review&&<ProjectLocationReviewDialog review={projectLocationReview.review} onConfirm={projectLocationReview.confirm} onCancel={projectLocationReview.cancel}/>}
      {projectTemplateCatalog&&<ProjectTemplateCatalogDialog onClose={()=>setProjectTemplateCatalog(false)} onChoose={mode=>{setProjectTemplateCatalog(false);setProjectTransferMode(mode);}} onImport={()=>{setProjectTemplateCatalog(false);setProjectTransferMode({kind:"import"});}}/>}
      {projectTransferMode && <ProjectTransferDialog key={expectedBackupTransferId??"project-transfer"} expectedTransferId={expectedBackupTransferId} onBeforeChange={beforeCriticalStateChange} onSettled={afterCriticalStateChange} mode={projectTransferMode} onClose={() => {setProjectTransferMode(null);setExpectedBackupTransferId(undefined);}} onImported={async () => {
        const updated = await listProjects(); setProjects(updated);
      }}/>}
      {retiredProjectsOpen&&<RetiredProjectsDialog onClose={()=>setRetiredProjectsOpen(false)} fallbackFocus={()=>retiredProjectsFocus.current?.()??null} onCatalogChanged={async()=>{const updated=await listProjects();setProjects(updated);}}/>}
      <DocumentFooterActionDialog
        key={documentFooterDialog?`${documentFooterDialog.documentId}:${documentFooterDialog.action}`:"no-footer-action"}
        open={documentFooterDialog !== null}
        action={documentFooterDialog?.action??null}
        documentName={documentFooterDialog?.revision.document?.name ?? "documento"}
        onCancel={() => setDocumentFooterDialog(null)}
        onConfirm={confirmDocumentFooterDialog}
      />
      {documentMerge&&<DocumentConflictDialog name={documentMerge.expected.document?.name??"Documento"} localMarkdown={documentMerge.expected.markdown} review={documentMerge.review} loading={documentMerge.loading} busy={documentMerge.busy} error={documentMerge.error} checkingAttempt={documentMerge.checkingAttempt} onCheckAttempt={documentMerge.attemptPayload?()=>void applyMergedDocument(documentMerge.attemptPayload!.mergedMarkdown,true):undefined} onReload={()=>void requestDocumentMerge(documentMerge.historyVersionId,documentMerge.remote)} onApply={markdown=>void applyMergedDocument(markdown)} onClose={()=>{if(!documentMerge.busy){++documentMergeEpoch.current;setDocumentMerge(null);}}}/>}
      {handwrittenMerge?.expected.content&&<HandwrittenConflictDialog name={handwrittenMerge.expected.note?.name??"Nota"} localContent={handwrittenMerge.expected.content} review={handwrittenMerge.review} loading={handwrittenMerge.loading} busy={handwrittenMerge.busy} error={handwrittenMerge.error} checkingAttempt={handwrittenMerge.checkingAttempt} onCheckAttempt={handwrittenMerge.attemptPayload?()=>void applyMergedHandwritten(handwrittenMerge.attemptPayload!.mergedContent,true):undefined} onReload={()=>void requestHandwrittenMerge()} onApply={content=>void applyMergedHandwritten(content)} onClose={()=>{if(!handwrittenMerge.busy){++handwrittenMergeEpoch.current;setHandwrittenMerge(null);}}}/>}
      <MoveDocumentDialog
        open={moveNode !== null}
        node={moveNode}
        folders={moveNode ? collectMoveTargetFolders(tree, moveNode) : collectFolders(tree)}
        onClose={() => setMoveNode(null)}
        onMove={handleMoveNode}
      />
      <CloseDirtyDocumentDialog
        key={closeDocumentId??"no-document-to-close"}
        open={closeDocumentId !== null}
        documentName={closeDocumentId ? tabs.find((tab) => tab.id === closeDocumentId)?.name ?? handwrittenTabs.find((tab) => tab.id === closeDocumentId)?.name ?? "documento" : ""}
        onCancel={() => {
          setCloseDocumentId(null);
          setPendingCloseDocumentIds([]);
        }}
        onDiscard={async() => {
          if (!closeDocumentId) return false;
          const documentId = closeDocumentId;
          const isHandwritten = handwrittenTabs.some((tab) => tab.id === documentId);
          const close=()=>{
            if(isHandwritten){const{[documentId]:_closed,...remaining}=handwrittenSessionsRef.current;handwrittenSessionsRef.current=remaining;closeHandwrittenTabNow(documentId);}
            else{const{[documentId]:_closed,...remaining}=documentSessionsRef.current;documentSessionsRef.current=remaining;closeTabNow(documentId);}
            setCloseDocumentId(null);showNextPendingCloseDialog();
          };
          return isHandwritten
            ?discardSessionForClose({id:documentId,queue:sessionWrites.current,pending:pendingSaveIds.current,current:()=>handwrittenSessionsRef.current[documentId],sameRevision:sameHandwrittenRevision,discard:()=>discardHandwrittenNoteDraft(documentId,handwrittenSessionsRef.current[documentId]?.draftWriteRevision??null),close,protect:session=>{void persistHandwrittenDraft(documentId,session,true);}})
            :discardSessionForClose({id:documentId,queue:sessionWrites.current,pending:pendingSaveIds.current,current:()=>documentSessionsRef.current[documentId],sameRevision:sameDocumentRevision,discard:()=>discardDocumentDraft(documentId,documentSessionsRef.current[documentId]?.draftWriteRevision??null),close,protect:session=>{void persistDraft(documentId,session,true);}});
        }}
        onSave={async() => {
          if (!closeDocumentId) return false;
          const documentId = closeDocumentId;
          const isHandwritten = handwrittenTabs.some((tab) => tab.id === documentId);
          const saved=await (isHandwritten ? handleSaveHandwrittenNote(documentId) : handleSave(documentId));
          if(!saved||(isHandwritten?handwrittenSessionsRef.current[documentId]?.isDirty:documentSessionsRef.current[documentId]?.isDirty))return false;
          setCloseDocumentId(null);
          if (isHandwritten) closeHandwrittenTabNow(documentId);
          else closeTabNow(documentId);
          showNextPendingCloseDialog();return true;
        }}
      />
      <RecoverableDraftsDialog
        projects={projects}
        activeProjectId={activeProject?.id}
        initialCategory={lastProtectedCopy?"archive":"review"}
        onBeforeChange={beforeCriticalStateChange}
        onSettled={afterCriticalStateChange}
        open={recoverableDraftsOpen}
        drafts={orphanDrafts}
        limited={orphanCoverage.limited}
        coverageWarnings={orphanCoverage.warnings}
        onClose={() => setRecoverableDraftsOpen(false)}
        onRefresh={refreshOrphanDrafts}
        onRestore={handleRestoreOrphanDraft}
        onDiscard={handleDiscardOrphanDraft}
        review={(archived,copies) => <RecoveryReviewSection knownCopies={copies} knownCopy={lastProtectedCopy} open={recoverableDraftsOpen} archived={archived} projects={projects} activeProjectId={activeProject?.id} onRecovered={handleRecoveredCopy} onChanged={() => void refreshOrphanDrafts()}/>}
      />
    </>
  );

  async function loadDocumentSession(documentId: string, forceReload = false, expected?: DocumentSession) {
    if (expected && !sameDocumentRevision(documentSessionsRef.current[documentId], expected)) return false;
    if (documentLoads.current.has(documentId) && !forceReload) return;
    const requestId = ++sessionLoadSequence.current;
    documentLoads.current.set(documentId, requestId);
    setDocumentSessions(current => expected && !sameDocumentRevision(current[documentId], expected) ? current : ({ ...current, [documentId]: beginDocumentLoad(current[documentId], requestId, forceReload) }));
    try {
      const record = await getDocument(documentId);
      if (documentLoads.current.get(documentId) !== requestId) return;
      const revisionCurrent = !expected || sameDocumentRevision(documentSessionsRef.current[documentId], expected);
      setDocumentSessions(current => {
        const settled = settleDocumentLoad(current[documentId], requestId, record);
        return settled ? { ...current, [documentId]: settled } : current;
      });
      if (!revisionCurrent) return false;
      try {
        const response = await getDocumentsSyncStatus([{ documentId, baseFingerprint: record.baseFingerprint }]);
        if (documentLoads.current.get(documentId) !== requestId) return;
        const latest = documentSessionsRef.current[documentId];
        if (!latest?.document || latest.baseFingerprint?.sha256 !== record.baseFingerprint?.sha256) return;
        setDocumentSyncStatuses(current => ({ ...current, ...Object.fromEntries(response.documents.map(status => [status.documentId, status])) }));
      } catch (error) {
        if (documentLoads.current.get(documentId) === requestId) showError(error, "No se pudo comprobar el estado del documento abierto.", {
          source: "app.documentSync.load", suppressApiConnectionNotice: true,
        });
      }
      return true;
    } catch (error) {
      if (documentLoads.current.get(documentId) !== requestId) return;
      setDocumentSessions(current => {
        const settled = settleDocumentLoad(current[documentId], requestId);
        if (settled) return { ...current, [documentId]: settled };
        const { [documentId]: _failed, ...remaining } = current;
        return remaining;
      });
      showError(error, "No se pudo abrir el documento. Se conserva el contenido que ya estaba abierto.");
      return false;
    } finally {
      if (documentLoads.current.get(documentId) === requestId) documentLoads.current.delete(documentId);
    }
  }

  async function loadHandwrittenNoteSession(noteId: string, forceReload = false, expected?: HandwrittenNoteSession) {
    if (expected && !sameHandwrittenRevision(handwrittenSessionsRef.current[noteId], expected)) return false;
    if (handwrittenLoads.current.has(noteId) && !forceReload) return;
    const requestId = ++sessionLoadSequence.current;
    handwrittenLoads.current.set(noteId, requestId);
    setHandwrittenSessions(current => expected && !sameHandwrittenRevision(current[noteId], expected) ? current : ({ ...current, [noteId]: beginHandwrittenLoad(current[noteId], requestId, forceReload) }));
    try {
      const record = await getHandwrittenNote(noteId);
      if (handwrittenLoads.current.get(noteId) !== requestId) return;
      const revisionCurrent = !expected || sameHandwrittenRevision(handwrittenSessionsRef.current[noteId], expected);
      setHandwrittenSessions(current => {
        const settled = settleHandwrittenLoad(current[noteId], requestId, record);
        return settled ? { ...current, [noteId]: settled } : current;
      });
      return revisionCurrent;
    } catch (error) {
      if (handwrittenLoads.current.get(noteId) !== requestId) return;
      setHandwrittenSessions(current => {
        const settled = settleHandwrittenLoad(current[noteId], requestId);
        if (settled) return { ...current, [noteId]: settled };
        const { [noteId]: _failed, ...remaining } = current;
        return remaining;
      });
      showError(error, "No se pudo abrir la nota a mano. Se conservan los trazos que ya estaban abiertos.");
      return false;
    } finally {
      if (handwrittenLoads.current.get(noteId) === requestId) handwrittenLoads.current.delete(noteId);
    }
  }

  function markDraftWriteBlocked(id:string,ink:boolean){
    if(ink){const current=handwrittenSessionsRef.current[id];if(!current)return;const next={...current,draftWriteConflict:true,saveState:"idle" as const};handwrittenSessionsRef.current={...handwrittenSessionsRef.current,[id]:next};setHandwrittenSessions(all=>({...all,[id]:next}));}
    else{const current=documentSessionsRef.current[id];if(!current)return;const next={...current,draftWriteConflict:true,saveState:"idle" as const};documentSessionsRef.current={...documentSessionsRef.current,[id]:next};setDocumentSessions(all=>({...all,[id]:next}));}
  }

  async function protectBlockedEdit(id:string,ink:boolean):Promise<ProtectionOutcome>{
    const session=ink?handwrittenSessionsRef.current[id]:documentSessionsRef.current[id];
    if(!session)return "superseded";
    const payload="markdown" in session?{documentId:id,markdown:session.markdown,baseFingerprint:session.baseFingerprint??null}
      :session.content?{documentId:id,content:session.content,baseFingerprint:session.baseFingerprint??null}:null;
    if(!payload)return "failed";
    try{const proof=await localEditProtection.current.protect(payload);setLastProtectedCopy(proof.copy);const current=ink?handwrittenSessionsRef.current[id]:documentSessionsRef.current[id];
      return (ink?sameHandwrittenRevision(current as HandwrittenNoteSession,session as HandwrittenNoteSession):sameDocumentRevision(current as DocumentSession,session as DocumentSession))?"protected":"superseded";
    }catch(error){showError(error,"No se confirmó la copia de la edición abierta. Se conserva en el editor; revisa Recuperación antes de cerrar.");return "failed";}
  }

  async function reviewChangedDraft(id:string,ink:boolean){
    if(pendingSaveIds.current.has(id))return;
    checkpointPendingEditorInput();
    pendingSaveIds.current.add(id);setDraftReviewBusy(id);
    try{await sessionWrites.current.run(id,async()=>{
      if(ink){const expected=handwrittenSessionsRef.current[id];if(!expected?.content)return;
        if(await protectBlockedEdit(id,true)!=="protected")return;
        const record=await getHandwrittenNote(id);
        if(!sameHandwrittenRevision(handwrittenSessionsRef.current[id],expected))throw new Error("Hay trazos nuevos. Se mantienen abiertos; conserva de nuevo antes de revisar.");
        const loaded=createLoadedHandwrittenNoteSession(record,{...expected,loadVersion:expected.loadVersion+1});
        handwrittenSessionsRef.current={...handwrittenSessionsRef.current,[id]:loaded};setHandwrittenSessions(all=>({...all,[id]:loaded}));
      }else{const expected=documentSessionsRef.current[id];if(!expected?.document)return;
        if(await protectBlockedEdit(id,false)!=="protected")return;
        const record=await getDocument(id);
        if(!sameDocumentRevision(documentSessionsRef.current[id],expected))throw new Error("Hay texto nuevo. Se mantiene abierto; conserva de nuevo antes de revisar.");
        const loaded=createLoadedDocumentSession(record,{...expected,loadVersion:expected.loadVersion+1});
        documentSessionsRef.current={...documentSessionsRef.current,[id]:loaded};setDocumentSessions(all=>({...all,[id]:loaded}));
      }
      setNotice({title:"Borrador guardado abierto",message:"Tu edición anterior está conservada en Recuperación. Puedes recuperarla como otro archivo para comparar ambas.",tone:"info"});
    });}catch(error){showError(error,"No se pudo revisar el borrador. La edición abierta se conserva.");}
    finally{pendingSaveIds.current.delete(id);setDraftReviewBusy(null);}
  }

  async function persistDraft(documentId: string, session: DocumentSession, forceProtection = false) {
    if(aiChangeJournal.current.hasDocument(documentId))return "superseded" as ProtectionOutcome;
    return sessionWrites.current.run<ProtectionOutcome>(documentId, async () => {
      if(aiChangeJournal.current.hasDocument(documentId))return "superseded";
      const latest=documentSessionsRef.current[documentId];
      if((!forceProtection&&pendingSaveIds.current.has(documentId))||!latest||latest.loadVersion!==session.loadVersion||latest.markdown!==session.markdown)return "superseded";
      if(latest.draftWriteConflict)return protectBlockedEdit(documentId,false);
      if(!shouldPersistDraft(latest,forceProtection))return "protected";
      session=latest;const requestMarkdown=session.markdown;
      try{
        const draft=await saveDocumentDraft(documentId,{markdown:requestMarkdown,baseFingerprint:session.baseFingerprint,baseContentHash:session.savedContentHash??null,expectedDraftWriteRevision:session.draftWriteRevision??null});
        const current=acknowledgeDraftWrite(documentSessionsRef.current[documentId],session,draft.draftWriteRevision);
        if(!current)return "superseded";
        if(current.loadVersion!==session.loadVersion||current.savedMarkdown!==session.savedMarkdown||current.baseFingerprint?.sha256!==session.baseFingerprint?.sha256)return "superseded";
        const matches=current.loadVersion===session.loadVersion&&current.markdown===requestMarkdown;
        const next=matches?{...current,lastDraftMarkdown:draft.isDirty?requestMarkdown:"",draftUpdatedAt:draft.draftUpdatedAt,hasRecoveredDraft:!!draft.hasDraft,draftContentHash:draft.draftContentHash??null,savedContentHash:draft.savedContentHash??draft.diskContentHash??current.savedContentHash,pendingDraftDiscard:false,pendingSaveReason: draft.isDirty?current.pendingSaveReason:null}:current;
        documentSessionsRef.current={...documentSessionsRef.current,[documentId]:next};setDocumentSessions(all=>({...all,[documentId]:next}));
        if(!matches){if(!current.isDirty)void discardPersistedDocumentDraft(documentId);return "superseded";}
        return "protected";
      }catch(error){if(isDraftWriteConflict(error)){markDraftWriteBlocked(documentId,false);return protectBlockedEdit(documentId,false);}showError(error,"No se pudo guardar el borrador interno del documento.");return "failed";}
    });
  }

  async function persistHandwrittenDraft(noteId: string, session: HandwrittenNoteSession, forceProtection = false) {
    if(aiChangeJournal.current.hasDocument(noteId)||ocrDraftWrites.current.has(noteId))return "superseded" as ProtectionOutcome;
    return sessionWrites.current.run<ProtectionOutcome>(noteId, async () => {
      if(aiChangeJournal.current.hasDocument(noteId)||ocrDraftWrites.current.has(noteId))return "superseded";
      const latest=handwrittenSessionsRef.current[noteId];
      if((!forceProtection&&pendingSaveIds.current.has(noteId))||!latest?.content||latest.loadVersion!==session.loadVersion||stringifyHandwrittenContent(latest.content)!==(session.content?stringifyHandwrittenContent(session.content):""))return "superseded";
      if(latest.draftWriteConflict)return protectBlockedEdit(noteId,true);
      if(!shouldPersistHandwrittenDraft(latest,forceProtection))return "protected";
      session=latest;const requestContent=latest.content;
      try{
        const draft=await saveHandwrittenNoteDraft(noteId,{content:requestContent,baseFingerprint:session.baseFingerprint,baseContentHash:session.savedContentHash??null,expectedDraftWriteRevision:session.draftWriteRevision??null});
        const current=acknowledgeDraftWrite(handwrittenSessionsRef.current[noteId],session,draft.draftWriteRevision);
        if(!current)return "superseded";
        if(current.loadVersion!==session.loadVersion||current.savedContent!==session.savedContent||current.baseFingerprint?.sha256!==session.baseFingerprint?.sha256)return "superseded";
        const matches=current.loadVersion===session.loadVersion&&current.content&&handwrittenContentMatchesSaved(current.content,requestContent);
        const next=matches?{...current,lastDraftContentJson:draft.isDirty?stringifyHandwrittenContent(requestContent):"",draftUpdatedAt:draft.draftUpdatedAt,hasRecoveredDraft:!!draft.hasDraft,draftContentHash:draft.draftContentHash??null,savedContentHash:draft.savedContentHash??draft.diskContentHash??current.savedContentHash,pendingDraftDiscard:false,
          note:current.note?{...current.note,sourceUnavailable:!!draft.sourceWarning,recoveryWarning:draft.sourceWarning??(current.note.sourceUnavailable?null:current.note.recoveryWarning),baseVerified:draft.sourceWarning?false:current.note.baseVerified}:null,
          diskChanged:!!draft.sourceWarning||current.diskChanged,conflictStatus:draft.sourceWarning?"disk-changed" as const:current.conflictStatus}:current;
        handwrittenSessionsRef.current={...handwrittenSessionsRef.current,[noteId]:next};setHandwrittenSessions(all=>({...all,[noteId]:next}));
        if(!matches){if(!current.isDirty)void discardPersistedHandwrittenDraft(noteId);return "superseded";}
        return "protected";
      }catch(error){if(isDraftWriteConflict(error)){markDraftWriteBlocked(noteId,true);return protectBlockedEdit(noteId,true);}showError(error,"No se pudo guardar el borrador interno de la nota.");return "failed";}
    });
  }

  async function discardPersistedDocumentDraft(documentId: string) {
    if (draftDiscardInFlightRef.current.has(documentId)) return true;
    draftDiscardInFlightRef.current.add(documentId);
    try {
      return await sessionWrites.current.run(documentId, async () => {
      const expected=documentSessionsRef.current[documentId];
      if(!expected||expected.isDirty||pendingSaveIds.current.has(documentId))return true;
      if(expected.draftWriteConflict)return await protectBlockedEdit(documentId,false)==="protected";
      await discardDocumentDraft(documentId,expected.draftWriteRevision??null);
      const current=acknowledgeDraftWrite(documentSessionsRef.current[documentId],expected,null);
      if(current){const next=current.isDirty?current:{...current,lastDraftMarkdown:"",pendingSaveReason:null,draftUpdatedAt:null,hasRecoveredDraft:false,draftContentHash:null,pendingDraftDiscard:false};
        documentSessionsRef.current={...documentSessionsRef.current,[documentId]:next};setDocumentSessions(all=>({...all,[documentId]:next}));}
      return true;
      });
    } catch (error) {
      if(isDraftWriteConflict(error)){markDraftWriteBlocked(documentId,false);return await protectBlockedEdit(documentId,false)==="protected";}
      showError(error, "No se pudo limpiar el borrador interno del documento.", {
        source: "app.documentDraft.discard",
        suppressApiConnectionNotice: true,
      });
      return false;
    } finally {
      draftDiscardInFlightRef.current.delete(documentId);
    }
  }

  async function discardPersistedHandwrittenDraft(noteId: string) {
    if (handwrittenDraftDiscardInFlightRef.current.has(noteId)) return true;
    handwrittenDraftDiscardInFlightRef.current.add(noteId);
    try {
      return await sessionWrites.current.run(noteId, async () => {
      const expected=handwrittenSessionsRef.current[noteId];
      if(!expected||expected.isDirty||pendingSaveIds.current.has(noteId))return true;
      if(expected.draftWriteConflict)return await protectBlockedEdit(noteId,true)==="protected";
      await discardHandwrittenNoteDraft(noteId,expected.draftWriteRevision??null);
      const current=acknowledgeDraftWrite(handwrittenSessionsRef.current[noteId],expected,null);
      if(current){const next=current.isDirty?current:{...current,lastDraftContentJson:"",draftUpdatedAt:null,hasRecoveredDraft:false,draftContentHash:null,pendingDraftDiscard:false};
        handwrittenSessionsRef.current={...handwrittenSessionsRef.current,[noteId]:next};setHandwrittenSessions(all=>({...all,[noteId]:next}));}
      return true;
      });
    } catch (error) {
      if(isDraftWriteConflict(error)){markDraftWriteBlocked(noteId,true);return await protectBlockedEdit(noteId,true)==="protected";}
      showError(error, "No se pudo limpiar el borrador interno de la nota.", {
        source: "app.handwrittenDraft.discard",
        suppressApiConnectionNotice: true,
      });
      return false;
    } finally {
      handwrittenDraftDiscardInFlightRef.current.delete(noteId);
    }
  }

  async function persistNotes(markdown:string){
    return protectNotesSnapshot(markdown,{queue:sessionWrites.current,current:()=>notesLoadedRef.current?notesMarkdownRef.current:undefined,saved:()=>notesSavedMarkdownRef.current,write:saveUserNotes,
      started:()=>setNotesSaveState("saving"),
      acknowledge:saved=>{notesSavedMarkdownRef.current=saved.markdown;setNotesSavedMarkdown(saved.markdown);setNotesUpdatedAt(saved.updatedAt);setNotesSaveState("idle");},
      failed:error=>{setNotesSaveState("error");showError(error,"No se pudieron guardar las notas automáticamente.",{source:"app.notesPersistence",suppressApiConnectionNotice:true});}});
  }

  async function checkpointOpenWork(finalizeInput=true){
    try{
      if(finalizeInput){
        checkpointPendingEditorInput();
        const snapshots=captureWorkspaceEditorSnapshots(liveEditorSnapshots.current,documentSessionsRef.current,{id:NOTES_WORKSPACE_TAB_ID,loaded:notesLoadedRef.current,markdown:notesMarkdownRef.current});
        for(const snapshot of snapshots){if(snapshot.documentId===NOTES_WORKSPACE_TAB_ID)handleNotesMarkdownChange(snapshot.markdown);else handleMarkdownChange(snapshot.documentId,snapshot.markdown);}
      }
      return await flushPendingDrafts();
    }catch{return false;}
  }

  async function reconcileOpenWork(){
    const projectId=activeAiProjectRef.current;
    const results=await Promise.all([checkOpenDocumentSync({silent:true}),projectId?refreshExternalChangeSet(projectId,{reportErrors:false,currentOnly:true}):Promise.resolve(true)]);
    if(!results.every(Boolean))throw new Error("No se confirmó la revisión del estado local");
  }

  async function flushPendingDrafts(captureProjectId?:string) {
    if(captureProjectId){
      try{for(const snapshot of captureProjectEditorSnapshots(captureProjectId,liveEditorSnapshots.current,documentSessionsRef.current))handleMarkdownChange(snapshot.documentId,snapshot.markdown);}
      catch(error){showError(error,"No se pudo capturar el texto actual. El proyecto y su editor permanecen abiertos; vuelve a intentarlo.");return false;}
    }
    const protectedDocuments=new Map<string,DocumentSession>(),protectedInk=new Map<string,HandwrittenNoteSession>();
    for(let pass=0;pass<4;pass++){
      await sessionWrites.current.idle();
      const pendingDrafts=Object.entries(documentSessionsRef.current).filter(([id,session])=>(shouldPersistDraft(session)||session.draftWriteConflict)&&(!protectedDocuments.has(id)||!sameDocumentRevision(session,protectedDocuments.get(id)!)));
      const pendingInk=Object.entries(handwrittenSessionsRef.current).filter(([id,session])=>(shouldPersistHandwrittenDraft(session)||session.draftWriteConflict)&&(!protectedInk.has(id)||!sameHandwrittenRevision(session,protectedInk.get(id)!)));
      const notes=notesLoadedRef.current&&notesMarkdownRef.current!==notesSavedMarkdownRef.current?notesMarkdownRef.current:null;
      if(!pendingDrafts.length&&!pendingInk.length&&notes===null&&!pendingSaveIds.current.size)return true;
      const results=await Promise.all([
        ...pendingDrafts.map(async([id,session])=>{const result=await persistDraft(id,session,true);if(result==="protected")protectedDocuments.set(id,session);return result;}),
        ...pendingInk.map(async([id,session])=>{const result=await persistHandwrittenDraft(id,session,true);if(result==="protected")protectedInk.set(id,session);return result;}),
        ...(notes!==null?[persistNotes(notes)]:[]),
      ]);
      if(results.includes("failed"))return false;
      const documentsPending=Object.entries(documentSessionsRef.current).some(([id,session])=>(shouldPersistDraft(session)||session.draftWriteConflict)&&(!protectedDocuments.has(id)||!sameDocumentRevision(session,protectedDocuments.get(id)!)));
      const inkPending=Object.entries(handwrittenSessionsRef.current).some(([id,session])=>(shouldPersistHandwrittenDraft(session)||session.draftWriteConflict)&&(!protectedInk.has(id)||!sameHandwrittenRevision(session,protectedInk.get(id)!)));
      if(!documentsPending&&!inkPending&&(!notesLoadedRef.current||notesMarkdownRef.current===notesSavedMarkdownRef.current)&&!pendingSaveIds.current.size)return true;
      await new Promise<void>(resolve=>window.setTimeout(resolve,0));
    }
    setNotice({title:"Espera a que termine el guardado",message:"Hay cambios nuevos o un guardado en curso. Vuelve a intentar la operación cuando termine.",tone:"info"});
    return false;
  }

  async function handleLoadDiskVersion(documentId = activeDocumentId) {
    try {
      return await replaceSessionFromDisk({id:documentId,queue:sessionWrites.current,pending:pendingSaveIds.current,
        current:()=>documentSessionsRef.current[documentId],sameRevision:sameDocumentRevision,
        readAndDiscard:()=>loadDocumentDiskVersion(documentId,documentSessionsRef.current[documentId]?.draftWriteRevision??null),
        apply:(record,expected)=>{
          const loaded=createLoadedDocumentSession(record,{...expected,loadVersion:expected.loadVersion+1});
          documentSessionsRef.current={...documentSessionsRef.current,[documentId]:loaded};
          setDocumentSessions(current=>({...current,[documentId]:loaded}));
        },protect:session=>{void persistDraft(documentId,session,true);}});
    } catch (error) { showError(error, "No se pudo cargar la versión del disco. Se conserva el contenido abierto."); return false; }
  }

  async function handleLoadHandwrittenDiskVersion(noteId = activeHandwrittenNoteId) {
    try {
      return await replaceSessionFromDisk({id:noteId,queue:sessionWrites.current,pending:pendingSaveIds.current,
        current:()=>handwrittenSessionsRef.current[noteId],sameRevision:sameHandwrittenRevision,
        readAndDiscard:()=>loadHandwrittenDiskVersion(noteId,handwrittenSessionsRef.current[noteId]?.draftWriteRevision??null),
        apply:(record,expected)=>{
          const loaded=createLoadedHandwrittenNoteSession(record,{...expected,loadVersion:expected.loadVersion+1});
          handwrittenSessionsRef.current={...handwrittenSessionsRef.current,[noteId]:loaded};
          setHandwrittenSessions(current=>({...current,[noteId]:loaded}));
        },protect:session=>{void persistHandwrittenDraft(noteId,session,true);}});
    } catch (error) { showError(error, "No se pudo cargar la nota del disco. Se conservan los trazos abiertos."); return false; }
  }

  async function checkOpenDocumentSync(options:{silent?:boolean}={}) {
    const observedSessions=documentSessionsRef.current;
    const documents = Object.entries(observedSessions)
      .filter(([, session]) => session.document && !session.isLoading)
      .map(([documentId, session]) => ({
        documentId,
        baseFingerprint: session.baseFingerprint,
      }));
    if (documents.length === 0) return true;

    try {
      const response = await getDocumentsSyncStatus(documents);
      response.documents=response.documents.filter(status=>acceptsDocumentSyncObservation(documentSessionsRef.current[status.documentId],observedSessions[status.documentId]));
      setDocumentSyncStatuses((currentStatuses) => ({
        ...currentStatuses,
        ...Object.fromEntries(response.documents.filter(status=>acceptsDocumentSyncObservation(documentSessionsRef.current[status.documentId],observedSessions[status.documentId])).map((status) => [status.documentId, status])),
      }));
      const cleanChangedDocumentIds = response.documents
        .filter((status) => {
          if (!status.diskChanged) return false;
          const session = documentSessionsRef.current[status.documentId];
          return Boolean(session && !session.isDirty && !session.hasRecoveredDraft && !status.hasDraft);
        })
        .map((status) => status.documentId);

      setDocumentSessions((currentSessions) => {
        let nextSessions = currentSessions;
        for (const status of response.documents) {
          const session = nextSessions[status.documentId];
          if (!acceptsDocumentSyncObservation(session,observedSessions[status.documentId])) continue;

          const patch: Partial<DocumentSession> = {};
          if (!status.exists && status.orphaned) {
            patch.orphaned = true;
            patch.conflictStatus = "orphaned";
            patch.isDirty = true;
            patch.hasRecoveredDraft = true;
          } else if (status.diskChanged) {
            if (!session.isDirty && !session.hasRecoveredDraft && !status.hasDraft) continue;
            patch.diskChanged = true;
            patch.conflictStatus = "disk-changed";
          } else if (!session.isDirty && status.currentFingerprint) {
            patch.baseFingerprint = status.currentFingerprint;
            patch.savedContentHash = status.savedContentHash ?? status.diskContentHash ?? session.savedContentHash ?? null;
            patch.draftContentHash = status.hasDraft ? status.draftContentHash ?? session.draftContentHash ?? null : null;
            patch.diskChanged = false;
            patch.orphaned = false;
            patch.conflictStatus = status.hasDraft ? "draft" : "none";
            patch.hasRecoveredDraft = status.hasDraft;
            patch.draftUpdatedAt = status.hasDraft ? session.draftUpdatedAt : null;
            patch.pendingDraftDiscard = false;
            patch.pendingSaveReason = status.hasDraft ? "opened" : null;
          }

          if (Object.keys(patch).length > 0) {
            nextSessions = updateSession(nextSessions, status.documentId, patch);
          }
        }
        return nextSessions;
      });

      for (const documentId of cleanChangedDocumentIds) {
        void loadDocumentSession(documentId, true);
      }
      return true;
    } catch (error) {
      if(!options.silent)showError(error, "No se pudo comprobar el estado de sincronización de los documentos.", {
        source: "app.documentSync",
        suppressApiConnectionNotice: true,
      });
      return false;
    }
  }

  async function refreshOrphanDrafts() {
    const sequence=++orphanReviewSequence.current;
    try {
      const inventory=await getOrphanDraftInventory();if(sequence!==orphanReviewSequence.current)return false;setOrphanDrafts(inventory.items);setOrphanCoverage({limited:inventory.limited,warnings:inventory.warnings});return true;
    } catch (error) {
      if(sequence!==orphanReviewSequence.current)return false;
      showError(error, "No se pudieron cargar los borradores recuperables.", {
        source: "app.orphanDrafts",
        suppressApiConnectionNotice: true,
      });
      return false;
    }
  }

  async function handleRestoreOrphanDraft(draft: OrphanDraft) {
    const id=draft.documentId,ink=draft.kind==="handwritten-note";
    if(pendingSaveIds.current.has(id))return false;
    const expectedDoc=documentSessionsRef.current[id],expectedNote=handwrittenSessionsRef.current[id];
    pendingSaveIds.current.add(id);let committed=false;
    try{
      const restored=await sessionWrites.current.run(id,async()=>{
        const value=await restoreOrphanDraft(draft.draftKey,draft);committed=true;
        if(value.note){const current=handwrittenSessionsRef.current[id];
          if(current&&expectedNote&&current.loadVersion===expectedNote.loadVersion){const next=acknowledgeHandwrittenSave(current,value.note,value.note.content);handwrittenSessionsRef.current={...handwrittenSessionsRef.current,[id]:next};setHandwrittenSessions(all=>({...all,[id]:next}));}
        }else{const current=documentSessionsRef.current[id];
          if(current&&expectedDoc&&current.loadVersion===expectedDoc.loadVersion){const next=acknowledgeDocumentSave(current,value.document,value.document.markdown);documentSessionsRef.current={...documentSessionsRef.current,[id]:next};setDocumentSessions(all=>({...all,[id]:next}));}
        }
        return value;
      });
      pendingSaveIds.current.delete(id);
      const record=restored.note??restored.document;
      setOrphanDrafts(current=>current.filter(item=>item.draftKey!==draft.draftKey));setRecoverableDraftsOpen(false);
      if(activeProject?.id!==record.projectId){setNotice({title:"Archivo recreado",message:"Se ha recreado en su proyecto de origen. Selecciona ese proyecto para abrirlo; tu espacio actual se conserva.",tone:"info"});return true;}
      await handleReloadProjectTree(record.projectId);
      if(restored.note)handleOpenHandwrittenNote(record.id,record.name);else openOrReplaceTab(record.id,record.name);
      if(restored.recoveryWarning)setNotice({title:"Archivo recreado; copia conservada",message:restored.recoveryWarning,tone:"info"});return true;
    }catch(error){if(!committed)throw error;showError(error,"El archivo se ha recreado, pero no se pudo actualizar la vista. Consulta el proyecto sin repetir la recuperación.");return true;}
    finally{pendingSaveIds.current.delete(id);if(ink){const current=handwrittenSessionsRef.current[id];if(current)void persistHandwrittenDraft(id,current);}else{const current=documentSessionsRef.current[id];if(current)void persistDraft(id,current);}}
  }

  async function handleDiscardOrphanDraft(draft: OrphanDraft) {
    const id=draft.documentId;
    if(pendingSaveIds.current.has(id))return false;
    const doc=documentSessionsRef.current[id],note=handwrittenSessionsRef.current[id];
    if(doc?.isDirty||doc?.hasRecoveredDraft||doc?.isLoading||note?.isDirty||note?.hasRecoveredDraft||note?.isLoading)throw new Error("El borrador sigue abierto. Revisa y cierra esa pestaña antes de retirar su copia de recuperación; la edición abierta se conserva.");
    pendingSaveIds.current.add(id);
    try{await sessionWrites.current.run(id,async()=>{
      const chosenDoc=documentSessionsRef.current[id],chosenNote=handwrittenSessionsRef.current[id];
      if(chosenDoc?.isDirty||chosenDoc?.hasRecoveredDraft||chosenDoc?.isLoading||chosenNote?.isDirty||chosenNote?.hasRecoveredDraft||chosenNote?.isLoading)throw new Error("La edición sigue abierta; cierra esa pestaña antes de retirar su copia.");
      await discardOrphanDraft(draft.draftKey,draft);
      const nextDoc=chosenDoc?acknowledgeDraftWrite(documentSessionsRef.current[id],chosenDoc,null):undefined;
      const nextNote=chosenNote?acknowledgeDraftWrite(handwrittenSessionsRef.current[id],chosenNote,null):undefined;
      if(nextDoc){documentSessionsRef.current={...documentSessionsRef.current,[id]:nextDoc};setDocumentSessions(all=>({...all,[id]:nextDoc}));}
      if(nextNote){handwrittenSessionsRef.current={...handwrittenSessionsRef.current,[id]:nextNote};setHandwrittenSessions(all=>({...all,[id]:nextNote}));}
    });setOrphanDrafts(current=>current.filter(item=>item.draftKey!==draft.draftKey));return true;}
    finally{pendingSaveIds.current.delete(id);const doc=documentSessionsRef.current[id],note=handwrittenSessionsRef.current[id];if(doc)void persistDraft(id,doc);if(note)void persistHandwrittenDraft(id,note);}
  }

  async function handleRecoveredCopy(restored: RestoreDraftResponse) {
    const record = restored.note ?? restored.document;
    if (activeProject?.id !== record.projectId) {
      setNotice({ title: "Archivo nuevo recuperado", message: "Se ha creado en el proyecto elegido. Selecciona ese proyecto para abrirlo; la copia de origen se conserva.", tone: "info" });
      return;
    }
    await handleReloadProjectTree(record.projectId);
    if (restored.note) {
      handleOpenHandwrittenNote(record.id, record.name);
    } else {
      openOrReplaceTab(record.id, record.name);
      void loadDocumentSession(record.id, true);
    }
  }
}

function hasUnavailableRuntime(status: RuntimeServicesStatus | null) {
  return status?.services.some((service) => service.id === "local-runtime" && service.status === "unavailable") ?? false;
}

function hasAvailableRuntime(status: RuntimeServicesStatus | null) {
  return status?.services.some((service) => service.id === "local-runtime" && service.status !== "unavailable") ?? false;
}

function shouldKeepCurrentRuntimeStatus(
  currentStatus: RuntimeServicesStatus | null,
  nextStatus: RuntimeServicesStatus,
  silentFailuresRef: MutableRefObject<number>,
) {
  if (!hasAvailableRuntime(currentStatus) || !hasUnavailableRuntime(nextStatus)) {
    silentFailuresRef.current = 0;
    return false;
  }
  silentFailuresRef.current += 1;
  return silentFailuresRef.current < 3;
}

function getUniqueFolderName(nodes: DocumentTreeNode[]) {
  const names = new Set(nodes.filter((node) => node.type === "folder").map((node) => node.name));
  if (!names.has("Nueva carpeta")) return "Nueva carpeta";

  let counter = 2;
  while (names.has(`Nueva carpeta ${counter}`)) counter += 1;
  return `Nueva carpeta ${counter}`;
}

function getDeletedOperationPaths(response: AiInteractionResponse) {
  return response.operations
    .filter((operation) => operation.type === "node_deleted" && operation.runtimeApplied === true && operation.path)
    .map((operation) => normalizeDocumentPath(operation.path ?? ""));
}

function buildActiveHandwrittenSummary(content: HandwrittenNoteContent, pageId: string) {
  const page = content.pages.find((candidate) => candidate.id === pageId) ?? content.pages[0];
  const textByPage = content.ocr?.textByPage ?? {};
  const totalStrokeCount = content.pages.reduce((total, candidate) => total + candidate.strokes.length, 0);
  return {
    noteId: content.id,
    title: content.title,
    pageId: page?.id ?? null,
    pageCount: content.pages.length,
    pageSize: page?.size ?? null,
    pageBackground: page?.background ?? null,
    pageStrokeCount: page?.strokes.length ?? 0,
    totalStrokeCount,
    generatedElementCount: page?.generatedElements?.length ?? 0,
    ocrText: page ? String(textByPage[page.id] ?? "").slice(0, 2000) : "",
    toolPresets: content.toolPresets.map((preset) => ({
      id: preset.id,
      type: preset.type ?? "pen",
      label: preset.label,
      color: preset.color,
      width: preset.width,
      opacity: preset.opacity,
    })),
  };
}

function markAiHandwrittenDraftApplied(session: HandwrittenNoteSession, content: HandwrittenNoteContent, updatedAt: string,draftWriteRevision?:string|null): HandwrittenNoteSession {
  if (!session.isDirty) return {...session,draftWriteRevision:draftWriteRevision===undefined?session.draftWriteRevision:draftWriteRevision};
  return {
    ...session,
    hasRecoveredDraft: true,
    lastDraftContentJson: stringifyHandwrittenContent(content),
    draftWriteRevision: draftWriteRevision===undefined?session.draftWriteRevision:draftWriteRevision,
    draftWriteConflict: draftWriteRevision===undefined?session.draftWriteConflict:false,
    draftUpdatedAt: updatedAt,
    draftContentHash: null,
    pendingDraftDiscard: false,
  };
}

function simpleStringHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isPathInDeletedScope(documentPath: string, deletedPaths: string[]) {
  const normalizedDocumentPath = normalizeDocumentPath(documentPath);
  return deletedPaths.some((deletedPath) => normalizedDocumentPath === deletedPath || normalizedDocumentPath.startsWith(`${deletedPath}/`));
}

function isPathInScope(path: string, scopePath: string) {
  const normalizedPath = normalizeDocumentPath(path);
  const normalizedScope = normalizeDocumentPath(scopePath);
  return normalizedPath === normalizedScope || normalizedPath.startsWith(`${normalizedScope}/`);
}

function remapPathInScope(path: string, oldScopePath: string, newScopePath: string) {
  const normalizedPath = normalizeDocumentPath(path);
  const oldScope = normalizeDocumentPath(oldScopePath);
  const newScope = normalizeDocumentPath(newScopePath);
  const suffix = normalizedPath === oldScope ? "" : normalizedPath.slice(oldScope.length).replace(/^\/+/, "");
  return suffix ? `${newScope}/${suffix}` : newScope;
}

function projectScopedNodeId(projectId: string, path: string, fallbackId: string) {
  const normalizedPath = normalizeDocumentPath(path);
  return projectId && normalizedPath ? `${projectId}::${normalizedPath}` : fallbackId;
}

function fileNameFromPath(path: string) {
  return normalizeDocumentPath(path).split("/").filter(Boolean).pop() ?? path;
}

function normalizeDocumentPath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function renameNode(nodes: DocumentTreeNode[], nodeId: string, name: string): DocumentTreeNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) return { ...node, name, isEditing: false };
    if (node.children) return { ...node, children: renameNode(node.children, nodeId, name) };
    return node;
  });
}

function toggleNodeOpen(nodes: DocumentTreeNode[], nodeId: string): DocumentTreeNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId && node.type === "folder") return { ...node, open: !node.open };
    if (node.children) return { ...node, children: toggleNodeOpen(node.children, nodeId) };
    return node;
  });
}

function openTreeNodePath(nodes: DocumentTreeNode[], nodeId: string): DocumentTreeNode[] {
  const { nodes: nextNodes } = openTreeNodePathRecursive(nodes, nodeId);
  return nextNodes;
}

function openTreeNodePathRecursive(nodes: DocumentTreeNode[], nodeId: string): { nodes: DocumentTreeNode[]; found: boolean } {
  let foundInBranch = false;
  const nextNodes = nodes.map((node) => {
    const childResult = node.children ? openTreeNodePathRecursive(node.children, nodeId) : { nodes: node.children, found: false };
    const foundHere = node.id === nodeId;
    const shouldOpen = node.type === "folder" && (foundHere || childResult.found);
    foundInBranch = foundInBranch || foundHere || childResult.found;
    if (!node.children && !shouldOpen) return node;
    return {
      ...node,
      open: shouldOpen ? true : node.open,
      children: childResult.nodes,
    };
  });
  return { nodes: nextNodes, found: foundInBranch };
}

function setAllFoldersOpen(nodes: DocumentTreeNode[], open: boolean): DocumentTreeNode[] {
  return nodes.map((node) => {
    if (node.type === "folder") {
      return {
        ...node,
        open,
        children: node.children ? setAllFoldersOpen(node.children, open) : node.children,
      };
    }

    return node;
  });
}

function reorderOpenDocumentTabs(tabs: OpenDocumentTab[], draggedTabId: string, targetTabId: string, placement: "before" | "after") {
  if (draggedTabId === targetTabId) return tabs;
  const draggedTab = tabs.find((tab) => tab.id === draggedTabId);
  if (!draggedTab || !tabs.some((tab) => tab.id === targetTabId)) return tabs;

  const remainingTabs = tabs.filter((tab) => tab.id !== draggedTabId);
  const targetIndex = remainingTabs.findIndex((tab) => tab.id === targetTabId);
  if (targetIndex < 0) return tabs;

  const insertIndex = placement === "before" ? targetIndex : targetIndex + 1;
  const nextTabs = [...remainingTabs];
  nextTabs.splice(insertIndex, 0, draggedTab);
  return areOpenDocumentTabsEqual(tabs, nextTabs) ? tabs : nextTabs;
}

function normalizeWorkspaceTabOrder(order: string[], visibleTabIds: string[]) {
  const visibleTabIdSet = new Set(visibleTabIds);
  const normalizedOrder = order.filter((tabId) => visibleTabIdSet.has(tabId));
  for (const tabId of visibleTabIds) {
    if (!normalizedOrder.includes(tabId)) normalizedOrder.push(tabId);
  }
  return areStringArraysEqual(order, normalizedOrder) ? order : normalizedOrder;
}

function orderWorkspaceTabs(tabs: WorkspaceTab[], order: string[]) {
  const tabById = new Map(tabs.map((tab) => [tab.id, tab]));
  const orderedTabs = order.flatMap((tabId) => {
    const tab = tabById.get(tabId);
    return tab ? [tab] : [];
  });
  const orderedTabIds = new Set(orderedTabs.map((tab) => tab.id));
  return [
    ...orderedTabs,
    ...tabs.filter((tab) => !orderedTabIds.has(tab.id)),
  ];
}

function reorderWorkspaceTabIds(order: string[], draggedTabId: string, targetTabId: string, placement: "before" | "after") {
  if (draggedTabId === targetTabId) return order;
  if (!order.includes(draggedTabId) || !order.includes(targetTabId)) return order;

  const nextOrder = order.filter((tabId) => tabId !== draggedTabId);
  const targetIndex = nextOrder.indexOf(targetTabId);
  if (targetIndex < 0) return order;
  nextOrder.splice(placement === "before" ? targetIndex : targetIndex + 1, 0, draggedTabId);
  return areStringArraysEqual(order, nextOrder) ? order : nextOrder;
}

function areOpenDocumentTabsEqual(left: OpenDocumentTab[], right: OpenDocumentTab[]) {
  return left.length === right.length && left.every((tab, index) => tab.id === right[index]?.id && tab.name === right[index]?.name);
}

function areStringArraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function AppNoticeBanner({ notice, onClose }: { notice: AppNotice | null; onClose: () => void }) {
  const [renderedNotice, setRenderedNotice] = useState<AppNotice | null>(notice);
  const [visible, setVisible] = useState(false);
  const exitTimerRef = useRef<number | null>(null);
  const closeRequestTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
    if (closeRequestTimerRef.current !== null) window.clearTimeout(closeRequestTimerRef.current);
  }, []);

  useEffect(() => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (closeRequestTimerRef.current !== null) {
      window.clearTimeout(closeRequestTimerRef.current);
      closeRequestTimerRef.current = null;
    }

    if (notice) {
      setRenderedNotice(notice);
      setVisible(false);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setVisible(false);
    exitTimerRef.current = window.setTimeout(() => {
      setRenderedNotice(null);
      exitTimerRef.current = null;
    }, 220);
  }, [notice]);

  if (!renderedNotice) return null;

  function handleCloseRequest() {
    if (closeRequestTimerRef.current !== null) return;
    setVisible(false);
    closeRequestTimerRef.current = window.setTimeout(() => {
      closeRequestTimerRef.current = null;
      onClose();
    }, 220);
  }

  const toneClasses = renderedNotice.tone === "error"
    ? {
        background: "bg-red-50",
        border: "border-red-200",
        icon: "text-red-600",
        title: "text-red-950",
        message: "text-red-700",
        close: "text-red-700 hover:bg-red-100 hover:text-red-900",
        Icon: AlertCircle,
      }
    : {
        background: "bg-orange-50",
        border: "border-orange-200",
        icon: "text-brand-orange",
        title: "text-orange-950",
        message: "text-orange-800",
        close: "text-orange-700 hover:bg-orange-100 hover:text-orange-900",
        Icon: Info,
      };
  const NoticeIcon = toneClasses.Icon;
  const noticeKey = `${renderedNotice.tone}:${renderedNotice.title}:${renderedNotice.message}`;

  return (
    <div
      className={[
        "fixed right-5 top-[70px] z-[100] w-[min(420px,calc(100vw-32px))] rounded-lg border p-4 shadow-menu transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
        toneClasses.background,
        toneClasses.border,
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className={["mt-0.5 shrink-0", toneClasses.icon].join(" ")}>
          <NoticeIcon size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={["text-[11px] font-semibold", toneClasses.title].join(" ")}>{renderedNotice.title}</p>
          <p className={["mt-1 text-[11px] leading-5", toneClasses.message].join(" ")}>{renderedNotice.message}</p>
        </div>
        <CountdownCloseButton
          ariaLabel="Cerrar aviso"
          className={toneClasses.close}
          durationMs={10_000}
          onClose={handleCloseRequest}
          resetKey={noticeKey}
        />
      </div>
    </div>
  );
}

function StartupOverlay({ loading }: { loading: boolean }) {
  const [rendered, setRendered] = useState(true);

  useEffect(() => {
    if (loading) {
      setRendered(true);
      return;
    }

    const timeout = window.setTimeout(() => setRendered(false), 260);
    return () => window.clearTimeout(timeout);
  }, [loading]);

  if (!rendered) return null;

  return (
    <div
      className={[
        "fixed inset-0 z-[120] grid place-items-center bg-white transition-opacity duration-200 ease-out",
        loading ? "opacity-100" : "pointer-events-none opacity-0",
      ].join(" ")}
      aria-busy={loading}
      aria-live="polite"
    >
      <div className="w-[min(320px,calc(100vw-48px))] text-center">
        <BrandMark className="mx-auto h-10 w-10" />
        <p className="mt-4 text-[13px] font-semibold text-ink-primary">Preparando espacio de trabajo</p>
        <p className="mt-1 text-[11px] text-ink-secondary">Cargando proyectos, configuración y estado local.</p>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-panel">
          <div className="h-full w-1/2 animate-[startup-progress_1.1s_ease-in-out_infinite] rounded-full bg-brand-orange" />
        </div>
      </div>
    </div>
  );
}

function getGithubDeviceFlowErrorMessage(error?: string | null) {
  if (error === "github_remote_not_configured") return "GitHub remoto no está configurado en esta instalación.";
  if (error === "github_network_unavailable") return "No se pudo contactar con GitHub. Comprueba la conexión e inténtalo de nuevo.";
  if (error === "github_device_start_failed") return "GitHub no devolvió un código de autorización válido. Inicia el login de nuevo.";
  if (error === "github_token_missing") return "GitHub autorizó el flujo, pero no devolvió un token válido. Inicia el login de nuevo.";
  if (error === "github_user_unavailable") return "No se pudo leer el usuario de GitHub autorizado. Revisa permisos e inténtalo de nuevo.";
  if (error === "expired_token") return "El código ha caducado. Inicia un nuevo login para generar otro código.";
  if (error === "access_denied") return "La autorización fue cancelada en GitHub.";
  if (error === "incorrect_device_code") return "GitHub no reconoce este código de dispositivo. Inicia el login de nuevo.";
  return error ?? "GitHub no pudo completar la autorización.";
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.stack ?? error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function areProjectTabsEqual(first: ProjectTabsConfig | undefined, second: ProjectTabsConfig) {
  if (!first) return false;
  if (first.activeDocumentId !== second.activeDocumentId) return false;
  if ((first.activeHandwrittenNoteId ?? "") !== (second.activeHandwrittenNoteId ?? "")) return false;
  if ((first.activeWorkspaceTabId ?? "") !== (second.activeWorkspaceTabId ?? "")) return false;
  if (first.openTabs.length !== second.openTabs.length) return false;
  const firstHandwrittenTabs = first.openHandwrittenTabs ?? [];
  const secondHandwrittenTabs = second.openHandwrittenTabs ?? [];
  if (firstHandwrittenTabs.length !== secondHandwrittenTabs.length) return false;

  const sameDocumentTabs = first.openTabs.every((tab, index) => {
    const otherTab = second.openTabs[index];
    return tab.id === otherTab.id && tab.name === otherTab.name;
  });
  if (!sameDocumentTabs) return false;
  return firstHandwrittenTabs.every((tab, index) => {
    const otherTab = secondHandwrittenTabs[index];
    return tab.id === otherTab.id && tab.name === otherTab.name;
  });
}

function buildDefaultExternalChangeDecisions(changeSet: ExternalChangeSet): Record<string, ExternalChangeDecision> {
  return changeSet.items.reduce<Record<string, ExternalChangeDecision>>((decisions, item) => {
    decisions[item.id] = item.decision;
    return decisions;
  }, {});
}

function readAcknowledgedExternalChangeSets(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ACKNOWLEDGED_EXTERNAL_CHANGES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.entries(parsed).reduce<Record<string, string[]>>((result, [projectId, value]) => {
      if (typeof projectId !== "string" || !Array.isArray(value)) return result;
      result[projectId] = value.filter((item): item is string => typeof item === "string");
      return result;
    }, {});
  } catch {
    return {};
  }
}

function writeAcknowledgedExternalChangeSets(value: Record<string, string[]>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACKNOWLEDGED_EXTERNAL_CHANGES_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Best effort only; the file remains safely omitted even if persistence fails.
  }
}

function addAcknowledgedExternalChangeSet(current: Record<string, string[]>, projectId: string, changeSetId: string) {
  const projectIds = current[projectId] ?? [];
  const nextProjectIds = [changeSetId, ...projectIds.filter((id) => id !== changeSetId)].slice(0, 20);
  return { ...current, [projectId]: nextProjectIds };
}

function isAcknowledgedExternalChangeSet(projectId: string | null | undefined, changeSet: ExternalChangeSet | null, acknowledged: Record<string, string[]>) {
  if (!projectId || !changeSet || changeSet.summary.total === 0) return false;
  return Boolean(acknowledged[projectId]?.includes(changeSet.id));
}

function buildExternalImportDecisions(
  changeSet: ExternalChangeSet,
  currentDecisions: Record<string, ExternalChangeDecision>,
  safeOnly = false,
) {
  return changeSet.items.map((item) => ({
    itemId: item.id,
    decision: safeOnly
      ? item.risk === "safe"
        ? "include" as const
        : "omit" as const
      : currentDecisions[item.id] ?? item.decision,
  }));
}

function findNodeById(nodes: DocumentTreeNode[], nodeId: string): DocumentTreeNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.children) {
      const child = findNodeById(node.children, nodeId);
      if (child) return child;
    }
  }
  return null;
}

function findParentNodeId(nodes: DocumentTreeNode[], nodeId: string, parentId: string | null = null): string | null | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return parentId;
    if (node.children) {
      const childParentId = findParentNodeId(node.children, nodeId, node.id);
      if (childParentId !== undefined) return childParentId;
    }
  }
  return undefined;
}

function resolveCurrentCreationParentId(nodes: DocumentTreeNode[], activeTreeNodeId: string | null | undefined, fallbackNodeIds: Array<string | null | undefined>): string | null {
  const selectedParentId = resolveNodeCreationParentId(nodes, activeTreeNodeId);
  if (selectedParentId !== undefined) return selectedParentId;
  for (const nodeId of fallbackNodeIds) {
    const parentId = resolveNodeCreationParentId(nodes, nodeId);
    if (parentId !== undefined) return parentId;
  }
  return null;
}

function resolveNodeCreationParentId(nodes: DocumentTreeNode[], nodeId: string | null | undefined): string | null | undefined {
  if (!nodeId) return undefined;
  const node = findNodeById(nodes, nodeId);
  if (!node) return undefined;
  if (node.type === "folder") return node.id;
  return findParentNodeId(nodes, node.id) ?? null;
}

function markNodeEditing(nodes: DocumentTreeNode[], nodeId: string | null): DocumentTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    isEditing: node.id === nodeId,
    children: node.children ? markNodeEditing(node.children, nodeId) : node.children,
  }));
}

function findFirstDocument(nodes: DocumentTreeNode[]): DocumentTreeNode | null {
  for (const node of nodes) {
    if (node.type === "document") return node;
    if (node.children) {
      const child = findFirstDocument(node.children);
      if (child) return child;
    }
  }
  return null;
}

function findFirstHandwrittenNote(nodes: DocumentTreeNode[]): DocumentTreeNode | null {
  for (const node of nodes) {
    if (node.type === "handwritten-note") return node;
    if (node.children) {
      const child = findFirstHandwrittenNote(node.children);
      if (child) return child;
    }
  }
  return null;
}

function collectFolders(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.flatMap((node) => {
    if (node.type !== "folder") return [];
    return [node, ...(node.children ? collectFolders(node.children) : [])];
  });
}

function collectMoveTargetFolders(nodes: DocumentTreeNode[], movingNode: DocumentTreeNode): DocumentTreeNode[] {
  return collectFolders(nodes).filter((folder) => {
    if (folder.id === movingNode.id) return false;
    if (movingNode.type === "folder" && isNodeDescendant(movingNode, folder.id)) return false;
    return true;
  });
}

function isNodeDescendant(node: DocumentTreeNode, targetNodeId: string): boolean {
  if (!node.children) return false;
  return node.children.some((child) => child.id === targetNodeId || isNodeDescendant(child, targetNodeId));
}

function mergeAiEvents(currentEvents: AiConversationEvent[], nextEvents: AiConversationEvent[]) {
  const seen = new Set(currentEvents.map((event) => event.id));
  return [
    ...currentEvents,
    ...nextEvents.filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    }),
  ];
}

function getStaleAiEditOperationIds(
  proposal: AiEditProposal | null,
  documentSessions: Record<string, DocumentSession>,
  notesMarkdown: string,
) {
  if (!proposal || proposal.status !== "proposed") return [];
  return proposal.operations
    .filter((operation) => aiEditOperationIsStale(operation, documentSessions, notesMarkdown))
    .map((operation) => operation.id);
}

function aiEditOperationIsStale(
  operation: AiEditOperation,
  documentSessions: Record<string, DocumentSession>,
  notesMarkdown: string,
) {
  const currentMarkdown = operation.documentId === NOTES_WORKSPACE_TAB_ID
    ? notesMarkdown
    : documentSessions[operation.documentId]?.markdown;
  if (typeof currentMarkdown !== "string") return false;
  if (typeof operation.expectedMarkdown === "string" && operation.expectedMarkdown !== currentMarkdown) return true;

  if (operation.action === "replace_selection" || operation.action === "edit_block") {
    const originalExcerpt = operation.originalExcerpt?.trim();
    if (!originalExcerpt) return false;
    return !markdownContainsExcerpt(currentMarkdown, originalExcerpt);
  }

  return false;
}

function buildActiveEditorAiOperation(
  interactionId: string,
  operation: AiEditOperation,
  activeEditorTargetId: string,
  imageMarkdown?: string | null,
): MarkdownEditorExternalOperation | null {
  if (!activeEditorTargetId || operation.documentId !== activeEditorTargetId) return null;
  const operationId = nextAiEditorOperationId(`ai-${interactionId}-${operation.id}`);

  if (operation.action === "replace_selection") {
    const replacement = operation.replacementMarkdown ?? operation.markdown;
    if (!replacement || typeof operation.from !== "number" || typeof operation.to !== "number") return null;
    return {
      id: operationId,
      documentId: operation.documentId,
      aiEditOperationId: operation.id,
      kind: "replace_range",
      from: operation.from,
      to: operation.to,
      markdown: replacement,
      source: "ai",
      addToHistory: true,
    };
  }

  if (operation.action === "insert_at_cursor") {
    const insertion = operation.markdown ?? operation.replacementMarkdown;
    const position = operation.position ?? operation.from;
    if (!insertion || typeof position !== "number") return null;
    return {
      id: operationId,
      documentId: operation.documentId,
      aiEditOperationId: operation.id,
      kind: "insert_at",
      position,
      markdown: insertion,
      source: "ai",
      addToHistory: true,
    };
  }

  if (operation.action === "insert_image") {
    const placementType = operation.placement?.type ?? "document_end";
    const position = placementType === "after_selection" ? operation.to : operation.position ?? operation.from;
    if (!imageMarkdown || typeof position !== "number") return null;
    if (placementType === "replace_selection" && typeof operation.from === "number" && typeof operation.to === "number") {
      return {
        id: operationId,
        documentId: operation.documentId,
        aiEditOperationId: operation.id,
        kind: "replace_range",
        from: operation.from,
        to: operation.to,
        markdown: imageMarkdown,
        source: "ai",
        addToHistory: true,
      };
    }
    return {
      id: operationId,
      documentId: operation.documentId,
      aiEditOperationId: operation.id,
      kind: "insert_at",
      position,
      markdown: `\n\n${imageMarkdown}\n\n`,
      source: "ai",
      addToHistory: true,
    };
  }

  return null;
}

function markdownContainsExcerpt(markdown: string, excerpt: string) {
  const normalizedMarkdown = normalizeLooseText(markdown);
  const normalizedExcerpt = normalizeLooseText(excerpt);
  return Boolean(normalizedExcerpt && normalizedMarkdown.includes(normalizedExcerpt));
}

function upsertAiResearchJob(jobs: AiResearchJob[], job: AiResearchJob): AiResearchJob[] {
  const next = [job, ...jobs.filter((item) => item.id !== job.id)];
  return next.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 50);
}

function isAiResearchReadyStatus(status: AiResearchJob["status"]) {
  return status === "ready" || status === "ready_pass" || status === "ready_warning";
}

function isAiResearchFailedStatus(status: AiResearchJob["status"]) {
  return status === "failed" || status === "failed_quality" || status === "failed_provider" || status === "failed_publish" || status === "failed_runtime";
}

function isAiResearchTerminalStatus(status: AiResearchJob["status"]) {
  return isAiResearchReadyStatus(status) || isAiResearchFailedStatus(status) || status === "cancelled";
}

function normalizeLooseText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isAutomaticSyncMode(syncMode?: SyncMode | null) {
  return syncMode === "auto-local" || syncMode === "auto-github";
}

function isGithubSyncMode(syncMode?: SyncMode | null) {
  return syncMode === "manual-github" || syncMode === "auto-github";
}

function shouldRunAutomaticSync(project: Project | null | undefined, authStatus: AuthStatus) {
  if (!project) return false;
  if (project.syncMode === "auto-local") return true;
  if (project.syncMode === "auto-github") return authStatus.isAuthenticated;
  return false;
}

function canUseGithubRemote(project: Project | null | undefined, authStatus: AuthStatus, syncStatus?: ProjectSyncStatus | null) {
  if (!isGithubSyncMode(project?.syncMode)) return true;
  if (!authStatus.isAuthenticated) return false;
  if (!syncStatus) return true;
  if (syncStatus.remotePaused) return false;
  return !syncStatus.remoteAccess || syncStatus.remoteAccess === "available";
}

function withDerivedRemoteSyncStatus(status: ProjectSyncStatus, project: Project | null | undefined, authStatus: AuthStatus): ProjectSyncStatus {
  const githubMode = isGithubSyncMode(project?.syncMode);
  if (!githubMode) {
    return {
      ...status,
      remoteAccess: status.remoteAccess ?? "not-configured",
      remotePaused: status.remotePaused ?? false,
      remoteReason: status.remoteReason ?? null,
      remoteAction: status.remoteAction ?? null,
      localState: status.localState ?? (status.pendingPush ? "pending-push" : "clean"),
    };
  }

  if (!authStatus.isAuthenticated) {
    return {
      ...status,
      mode: project?.syncMode === "auto-github" ? "github-auto" : "github-manual",
      state: status.pendingPush || status.state === "pending" ? "local-pending" : "local-history",
      label: "GitHub pausado",
      detail: "Sin cuenta GitHub. Puedes seguir trabajando y guardando historial local.",
      remoteAccess: "unauthenticated",
      remotePaused: true,
      remoteReason: "Sin cuenta GitHub",
      remoteAction: "connect-github",
      pendingPull: false,
      localState: status.pendingPush ? "pending-push" : "clean",
    };
  }

  return {
    ...status,
    mode: project?.syncMode === "auto-github" ? "github-auto" : "github-manual",
    remoteAccess: status.remoteAccess ?? "available",
    remotePaused: status.remotePaused ?? false,
    remoteReason: status.remoteReason ?? null,
    remoteAction: status.remoteAction ?? null,
    localState: status.localState ?? (status.pendingPush ? "pending-push" : "clean"),
  };
}

function isNoVersionChangesError(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 409) return false;
  const detail = typeof error.detail === "string" ? error.detail : error.message;
  return detail.includes("No document changes") || detail.includes("No selected changes");
}

function referenceDocumentFormat(path: string): "pdf" | "docx" | "xlsx" | null {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "pdf" || extension === "docx" || extension === "xlsx") return extension;
  return null;
}

function isReferenceDocumentPath(path: string) {
  return referenceDocumentFormat(path) !== null;
}
