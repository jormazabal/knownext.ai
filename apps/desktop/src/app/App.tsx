import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { DocumentTreeAction } from "../features/documents/DocumentTree";
import type { MarkdownEditorExternalOperation, MarkdownEditorSelection } from "../features/editor/editorTypes";
import type { AiPromptExecutionOptions } from "../features/assistant/AiPromptInput";
import { AiDeleteConfirmationDialog } from "../features/assistant/AiDeleteConfirmationDialog";
import { CreateDocumentDialog } from "../features/documents/CreateDocumentDialog";
import { MoveDocumentDialog } from "../features/documents/MoveDocumentDialog";
import {
  CloseDirtyDocumentDialog,
  DocumentFooterActionDialog,
  RecoverableDraftsDialog,
  type DocumentFooterDialogAction,
} from "../features/documents/DocumentProtectionDialogs";
import { CreateProjectDialog } from "../features/projects/CreateProjectDialog";
import { GithubLoginDialog, type GithubLoginState } from "../features/projects/GithubLoginDialog";
import { UpdateAvailableDialog, type UpdateDialogState } from "../features/projects/UpdateAvailableDialog";
import { AppSettingsDialog } from "../features/settings/AppSettingsDialog";
import { BrandMark } from "../components/brand/BrandMark";
import { CountdownCloseButton } from "../components/ui/CountdownCloseButton";
import { GlobalTooltip } from "../components/ui/GlobalTooltip";
import { DesktopLayout } from "../layouts/DesktopLayout";
import {
  applyExternalMarkdownUpdate,
  applyLocalMarkdownEdit,
  createEmptyDocumentSession,
  createLoadedDocumentSession,
  shouldPersistDraft,
  updateSession,
  type DocumentSession,
} from "./documentSessions";
import {
  defaultAppearanceConfig,
  defaultAiConfig,
  defaultDiagnosticsConfig,
  defaultExportTemplateConfig,
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
  writeLocalAppPreferences,
} from "../lib/api/config";
import {
  clearAiConversation,
  confirmAiDelete,
  deleteAiIndex,
  deleteOpenAiKey,
  addAiContextSourceToProject,
  addProjectAttachmentAiContextSource,
  addProjectImageAiContextSource,
  addProjectDocumentAiContextSource,
  extendAiContextSource,
  getAiContextSources,
  getAiConversation,
  getAiIndexStatus,
  getAiPendingIntent,
  getAiUsageSummary,
  previewAiContextSource,
  removeAiContextSource,
  rebuildAiIndex,
  saveOpenAiKey,
  searchAiContextDocuments,
  sendAiInteraction,
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
  getDocumentsSyncStatus,
  listOrphanDrafts,
  restoreOrphanDraft,
  saveDocument,
  saveDocumentDraft,
} from "../lib/api/documents";
import { getUserNotes, saveUserNotes } from "../lib/api/notes";
import { getExternalChanges, importExternalChanges, scanExternalChanges } from "../lib/api/externalChanges";
import { autoRunProjectSync, changeProjectSyncMode, connectProjectGithub, enableProjectHistory, getProjectSyncStatus, publishProjectGithub, resolveProjectSyncConflict, scanProjectSync, verifyProjectGithubConnection } from "../lib/api/sync";
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
import { isTauriRuntime, selectBrowserExportTarget, selectExportFilePath, withExportExtension } from "../lib/runtime/exportDialogs";
import { selectAiContextFilePaths } from "../lib/runtime/fileDialogs";
import { isTauriMobileRuntime } from "../lib/runtime/platform";
import { getRuntimeServiceStatus, type RuntimeServicesStatus } from "../lib/runtime/services";
import { applyAppearanceAttributes, useResolvedAppearanceTheme } from "../lib/theme/appearance";
import { AlertCircle, Info, RefreshCw } from "lucide-react";
import {
  createFolder,
  createProjectDocument,
  createProject,
  buildImageReference,
  deleteProject,
  deleteTreeNode,
  duplicateProjectDocument,
  getDocumentMoveImpact,
  getProjectImageUsage,
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
  AiIndexStatusResponse,
  AiInteractionResponse,
  AiIntentActionType,
  AiPendingDelete,
  AiPendingIntent,
  AiSelectionFocus,
  AiUsageSummaryResponse,
  AppearanceConfig,
  AppUtilityTabId,
  ActivityEvent,
  DiagnosticsConfig,
  AssetImportResponse,
  DocumentSyncStatus,
  DocumentRecord,
  DocumentTreeNode,
  ExportFormat,
  ExportTemplateConfig,
  ExportTemplateUpdate,
  FileOperationResult,
  InsertImageReferenceResponse,
  LayoutConfig,
  OpenDocumentTab,
  OrphanDraft,
  Project,
  ProjectCapabilities,
  ProjectPayload,
  ProjectTabsConfig,
  ProjectVersioningStatus,
  GithubDeviceStartResponse,
  GithubRepositorySummary,
  CreateVersionResponse,
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

type AppNotice = {
  title: string;
  message: string;
  tone: "error" | "info";
};

type DocumentFooterDialog = DocumentFooterDialogAction;

type UpdateState = UpdateDialogState;
type NotesSaveState = "idle" | "saving" | "error";
const AI_CONVERSATION_TAB_ID = "project-ai-conversation" as const;
const ACKNOWLEDGED_EXTERNAL_CHANGES_STORAGE_KEY = "knownext.acknowledgedExternalChanges";

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ isAuthenticated: false, provider: null, user: null, scopes: [] });
  const [projectCapabilities, setProjectCapabilities] = useState<ProjectCapabilities | null>(null);
  const [versioningStatus, setVersioningStatus] = useState<ProjectVersioningStatus | null>(null);
  const [tree, setTree] = useState<DocumentTreeNode[]>([]);
  const [tabs, setTabs] = useState<OpenDocumentTab[]>(defaultProjectTabsConfig.openTabs);
  const [activeDocumentId, setActiveDocumentId] = useState(defaultProjectTabsConfig.activeDocumentId);
  const [activeTreeNodeId, setActiveTreeNodeId] = useState(defaultProjectTabsConfig.activeDocumentId);
  const [imageTabs, setImageTabs] = useState<Array<{ id: string; name: string; path: string }>>([]);
  const [activeImageId, setActiveImageId] = useState("");
  const [referenceDocumentTabs, setReferenceDocumentTabs] = useState<Array<{ id: string; name: string; path: string; format: "pdf" | "docx" | "xlsx" }>>([]);
  const [activeReferenceDocumentId, setActiveReferenceDocumentId] = useState("");
  const [workspaceTabOrder, setWorkspaceTabOrder] = useState<string[]>([]);
  const [documentSessions, setDocumentSessions] = useState<Record<string, DocumentSession>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [createDocumentOpen, setCreateDocumentOpen] = useState(false);
  const [createDocumentParentId, setCreateDocumentParentId] = useState<string | null>(null);
  const [moveNode, setMoveNode] = useState<DocumentTreeNode | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>(defaultLayoutConfig);
  const [appearanceConfig, setAppearanceConfig] = useState<AppearanceConfig>(defaultAppearanceConfig);
  const [diagnosticsConfig, setDiagnosticsConfig] = useState<DiagnosticsConfig>(defaultDiagnosticsConfig);
  const [exportTemplateConfig, setExportTemplateConfig] = useState<ExportTemplateConfig>(defaultExportTemplateConfig);
  const [exportTemplatePath, setExportTemplatePath] = useState("");
  const [aiConfig, setAiConfig] = useState<AiConfigStatus>({ ...defaultAiConfig, openaiKeyConfigured: false, openaiKeyPreview: null });
  const aiConfigSaveSequence = useRef(0);
  const [aiConversationEvents, setAiConversationEvents] = useState<AiConversationEvent[]>([]);
  const [aiContextSources, setAiContextSources] = useState<AiContextSource[]>([]);
  const [removingAiContextSourceIds, setRemovingAiContextSourceIds] = useState<Set<string>>(() => new Set());
  const [aiIndexStatus, setAiIndexStatus] = useState<AiIndexStatusResponse | null>(null);
  const [aiUsageSummary, setAiUsageSummary] = useState<AiUsageSummaryResponse | null>(null);
  const [aiPendingDelete, setAiPendingDelete] = useState<AiPendingDelete | null>(null);
  const [aiPendingIntent, setAiPendingIntent] = useState<AiPendingIntent | null>(null);
  const [aiBubble, setAiBubble] = useState<{ id: string; answer: string } | null>(null);
  const [aiAppliedChange, setAiAppliedChange] = useState<{ documentId: string; summary: string } | null>(null);
  const [aiSelectionFocus, setAiSelectionFocus] = useState<AiSelectionFocus | null>(null);
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
  const [configPersistenceAvailable, setConfigPersistenceAvailable] = useState(true);
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const [startupRetrySequence, setStartupRetrySequence] = useState(0);
  const [localRuntimeRecoveryOpen, setLocalRuntimeRecoveryOpen] = useState(false);
  const [localRuntimeRecoveryError, setLocalRuntimeRecoveryError] = useState<string | null>(null);
  const [closeDocumentId, setCloseDocumentId] = useState<string | null>(null);
  const [orphanDrafts, setOrphanDrafts] = useState<OrphanDraft[]>([]);
  const [recoverableDraftsOpen, setRecoverableDraftsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
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
  const [externalChangesBusy, setExternalChangesBusy] = useState(false);
  const [projectSyncState, setProjectSyncState] = useState<ProjectSyncState>("synced");
  const [projectSyncStatus, setProjectSyncStatus] = useState<ProjectSyncStatus | null>(null);
  const [projectActivity, setProjectActivity] = useState<ActivityEvent[]>([]);
  const [externalChangesMessage, setExternalChangesMessage] = useState<string | null>(null);
  const [acknowledgedExternalChangeSets, setAcknowledgedExternalChangeSets] = useState<Record<string, string[]>>(readAcknowledgedExternalChangeSets);
  const [documentSyncStatuses, setDocumentSyncStatuses] = useState<Record<string, DocumentSyncStatus>>({});
  const [documentFooterDialog, setDocumentFooterDialog] = useState<DocumentFooterDialog | null>(null);
  const lastTraceLogRef = useRef<{ fingerprint: string; timestamp: number } | null>(null);
  const githubLoginPollingRef = useRef(false);
  const lastDocumentContextRef = useRef<{ id: string | null; path: string | null }>({ id: null, path: null });
  const resolvedTheme = useResolvedAppearanceTheme(appearanceConfig.themeMode);

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
        let activeVersioningStatus: ProjectVersioningStatus | null = null;
        let activeSyncStatus: ProjectSyncStatus | null = null;
        if (active) {
          try {
            projectTree = await getProjectTree(active.id);
          } catch (error) {
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
          ? resolveProjectTabs(appConfig.tabsByProject, active.id, projectTree)
          : { openTabs: [], activeDocumentId: "" };
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
        setLayoutConfig(appConfig.layout);
        setAppearanceConfig(appConfig.appearance ?? defaultAppearanceConfig);
        setDiagnosticsConfig(appConfig.diagnostics ?? defaultDiagnosticsConfig);
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
        setActiveTreeNodeId(activeProjectTabs.activeDocumentId);
        setLocalRuntimeRecoveryOpen(false);
        setLocalRuntimeRecoveryError(null);
      } catch (error) {
        const startupMessage = getApiErrorMessage(error, "La aplicación no pudo cargar la configuración inicial.");
        void recordTraceLog({
          source: "app.startup",
          message: startupMessage,
          detail: describeError(error),
        });
        if (isTauriMobileRuntime()) {
          setLocalRuntimeRecoveryOpen(true);
          setLocalRuntimeRecoveryError(startupMessage);
        }
        setNotice({
          title: "No se pudo iniciar KnowNext.ai",
          message: startupMessage,
          tone: "error",
        });
        setProjects([]);
        setActiveProject(null);
        setVersioningStatus(null);
        setProjectSyncStatus(null);
        setTree([]);
        setTabs([]);
        setActiveDocumentId("");
        setActiveTreeNodeId("");
        setAppearanceConfig(localPreferences.appearance ?? defaultAppearanceConfig);
        setDiagnosticsConfig(localPreferences.diagnostics ?? defaultDiagnosticsConfig);
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

    const timeout = window.setTimeout(() => {
      writeLocalAppPreferences({
        appearance: appearanceConfig,
        diagnostics: diagnosticsConfig,
        ai: aiConfig,
      });

      if (!configPersistenceAvailable) return;

      void updateAppConfig({
        layout: layoutConfig,
        appearance: appearanceConfig,
        diagnostics: diagnosticsConfig,
        tabsByProject,
        treeOpenPathsByProject,
        lastRunAppVersion,
        lastSeenReleaseNotesVersion,
        openUtilityTabs,
        activeUtilityTab,
      }).catch((error) => {
        showError(error, "No se pudo guardar la configuración de la aplicación.", {
          source: "app.configPersistence",
          suppressApiConnectionNotice: true,
        });
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [
    activeUtilityTab,
    appearanceConfig,
    aiConfig,
    configLoaded,
    configPersistenceAvailable,
    diagnosticsConfig,
    lastRunAppVersion,
    lastSeenReleaseNotesVersion,
    layoutConfig,
    openUtilityTabs,
    tabsByProject,
    treeOpenPathsByProject,
  ]);

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
      return;
    }
    if (externalChangesBusy) return;
    void refreshExternalChangeSet(activeProject.id, { refreshTreeOnChanges: true, silent: true });
    const interval = window.setInterval(() => {
      void refreshExternalChangeSet(activeProject.id, { refreshTreeOnChanges: true, silent: true });
    }, 8000);
    return () => window.clearInterval(interval);
  }, [activeProject?.id, acknowledgedExternalChangeSets, configLoaded, externalChangesBusy]);

  useEffect(() => {
    if (!configLoaded || !activeProject) {
      setProjectActivity([]);
      return;
    }
    void refreshProjectActivity(activeProject.id);
  }, [activeProject?.id, configLoaded]);

  useEffect(() => {
    if (!configLoaded || !activeProject) return;
    void refreshProjectSyncStatus(activeProject.id, { autoRun: isAutomaticSyncMode(activeProject.syncMode), silent: true });
    const interval = window.setInterval(() => {
      void refreshProjectSyncStatus(activeProject.id, { autoRun: isAutomaticSyncMode(activeProject.syncMode), silent: true });
    }, 45000);
    return () => window.clearInterval(interval);
  }, [activeProject?.id, activeProject?.syncMode, activeDocumentId, authStatus.isAuthenticated, configLoaded, documentSessions]);

  useEffect(() => {
    if (!configLoaded || !activeProject) {
      setAiConversationEvents([]);
      setAiContextSources([]);
      setRemovingAiContextSourceIds(new Set());
      setAiIndexStatus(null);
      return;
    }
    setRemovingAiContextSourceIds(new Set());
    void refreshAiState(activeProject.id);
  }, [activeProject?.id, configLoaded]);

  useEffect(() => {
    if (!activeProject) return;
    const interval = window.setInterval(() => {
      void refreshAiContextSources(activeProject.id, { silent: true });
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [activeProject?.id]);

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

  useEffect(() => {
    function handlePageHide() {
      if (!isRuntimeApiEnabled()) return;

      for (const [documentId, session] of Object.entries(documentSessions)) {
        if (!shouldPersistDraft(session)) continue;
        void saveDocumentDraft(documentId, { markdown: session.markdown, baseFingerprint: session.baseFingerprint });
      }
      if (notesLoaded && notesMarkdown !== notesSavedMarkdown) {
        void saveUserNotes(notesMarkdown);
      }
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [documentSessions, notesLoaded, notesMarkdown, notesSavedMarkdown]);

  useEffect(() => {
    if (!configLoaded || !activeProject) return;

    const activeProjectTabs = normalizeProjectTabs({
      openTabs: tabs,
      activeDocumentId,
    });

    setTabsByProject((currentTabsByProject) => {
      const currentProjectTabs = currentTabsByProject[activeProject.id];
      if (areProjectTabsEqual(currentProjectTabs, activeProjectTabs)) return currentTabsByProject;
      return {
        ...currentTabsByProject,
        [activeProject.id]: activeProjectTabs,
      };
    });
  }, [activeDocumentId, activeProject, configLoaded, tabs]);

  useEffect(() => {
    if (!activeDocumentId || documentSessions[activeDocumentId]) return;
    void loadDocumentSession(activeDocumentId);
  }, [activeDocumentId, documentSessions]);

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
    window.addEventListener("focus", check);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
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
  ], [activeProject, imageTabs, openUtilityTabs, referenceDocumentTabs, tabs]);

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
  const activeTabId = activeUtilityTab === RELEASE_NOTES_UTILITY_TAB_ID
    ? RELEASE_NOTES_WORKSPACE_TAB_ID
    : activeUtilityTab === NOTES_UTILITY_TAB_ID
    ? NOTES_WORKSPACE_TAB_ID
    : activeReferenceDocumentId || activeImageId || activeDocumentId || (activeProject ? AI_CONVERSATION_TAB_ID : NOTES_WORKSPACE_TAB_ID);
  const activeSession = activeDocumentId ? documentSessions[activeDocumentId] : undefined;
  const activeDocumentSyncStatus = activeDocumentId ? documentSyncStatuses[activeDocumentId] ?? null : null;
  const visibleAiContextSources = useMemo(
    () => getVisibleAiContextSources(aiContextSources, removingAiContextSourceIds),
    [aiContextSources, removingAiContextSourceIds],
  );
  const promptContextSourceIds = useMemo(
    () => getPromptContextSourceIds(aiContextSources, removingAiContextSourceIds),
    [aiContextSources, removingAiContextSourceIds],
  );
  useEffect(() => {
    if (!activeDocumentId || !activeSession?.document) return;
    lastDocumentContextRef.current = { id: activeDocumentId, path: activeSession.document.path };
  }, [activeDocumentId, activeSession?.document?.path]);
  const dirtyDocumentIds = useMemo(
    () => Object.entries(documentSessions).filter(([, session]) => session.isDirty).map(([documentId]) => documentId),
    [documentSessions],
  );
  const editorSessions = useMemo(
    () => tabs.map((tab) => ({
      documentId: tab.id,
      document: documentSessions[tab.id]?.document ?? null,
      markdown: documentSessions[tab.id]?.markdown ?? "",
      editorKey: `${tab.id}-${documentSessions[tab.id]?.loadVersion ?? 0}`,
      isLoading: documentSessions[tab.id]?.isLoading ?? !documentSessions[tab.id],
    })),
    [documentSessions, tabs],
  );

  function persistTreeOpenState(projectId: string, nodes: DocumentTreeNode[]) {
    setTreeOpenPathsByProject((currentState) => updateTreeOpenPathsForProject(currentState, projectId, nodes));
  }

  function setProjectTree(
    projectId: string,
    nextTree: DocumentTreeNode[],
    options: { currentTree?: DocumentTreeNode[]; additionalOpenPaths?: string[]; persist?: boolean } = {},
  ) {
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

  function updateCurrentProjectTree(updater: (currentTree: DocumentTreeNode[]) => DocumentTreeNode[]) {
    setTree((currentTree) => {
      const nextTree = updater(currentTree);
      if (activeProject) persistTreeOpenState(activeProject.id, nextTree);
      return nextTree;
    });
  }

  function revealTreeNode(nodeId: string) {
    updateCurrentProjectTree((currentTree) => openTreeNodePath(currentTree, nodeId));
    setActiveTreeNodeId(nodeId);
  }

  function handleOpenDocument(documentId: string, name: string) {
    setTabs((currentTabs) => (
      currentTabs.some((tab) => tab.id === documentId)
        ? currentTabs
        : [...currentTabs, { id: documentId, name }]
    ));
    setActiveDocumentId(documentId);
    revealTreeNode(documentId);
    setActiveImageId("");
    setActiveReferenceDocumentId("");
    setActiveUtilityTab(null);
  }

  function handleSelectTreeNode(nodeId: string, type: DocumentTreeNode["type"], name: string) {
    revealTreeNode(nodeId);
    if (type === "document") handleOpenDocument(nodeId, name);
    if (type === "image") {
      const imageNode = findNodeById(tree, nodeId);
      if (imageNode?.path) handleOpenImage(nodeId, name, imageNode.path);
    }
    if (type === "attachment") {
      const referenceNode = findNodeById(tree, nodeId);
      if (referenceNode?.path && isReferenceDocumentPath(referenceNode.path)) handleOpenReferenceDocument(nodeId, name, referenceNode.path);
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
      setActiveImageId(assetId);
      setActiveReferenceDocumentId("");
      setActiveTreeNodeId(assetId);
      setActiveUtilityTab(null);
    }
  }

  function handleOpenReferenceDocument(nodeId: string, name: string, path: string) {
    const format = referenceDocumentFormat(path);
    if (!format) {
      setActiveTreeNodeId(nodeId);
      setNotice({ title: "Vista no disponible", message: "Este archivo de apoyo no tiene visor integrado.", tone: "info" });
      return;
    }
    setReferenceDocumentTabs((currentTabs) => (
      currentTabs.some((tab) => tab.id === nodeId)
        ? currentTabs.map((tab) => (tab.id === nodeId ? { id: nodeId, name, path, format } : tab))
        : [...currentTabs, { id: nodeId, name, path, format }]
    ));
    if (activeDocumentId && documentSessions[activeDocumentId]) {
      void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
    }
    setActiveReferenceDocumentId(nodeId);
    setActiveImageId("");
    setActiveDocumentId("");
    setActiveTreeNodeId(nodeId);
    setActiveUtilityTab(null);
  }

  async function refreshProjectCapabilityState(projectId = activeProject?.id) {
    try {
      const [capabilities, status] = await Promise.all([
        getProjectCapabilities(),
        projectId ? getProjectVersioningStatus(projectId) : Promise.resolve(null),
      ]);
      setProjectCapabilities(capabilities);
      setVersioningStatus(status);
      if (!status?.enabled) setHistoryOpen(false);
    } catch (error) {
      showError(error, "No se pudo actualizar el estado de versionado del proyecto.");
    }
  }

  async function refreshExternalChangeSet(projectId = activeProject?.id, options: { refreshTreeOnChanges?: boolean; silent?: boolean } = {}) {
    if (!projectId) return;
    try {
      const changeSet = options.silent ? await getExternalChanges(projectId) : await scanExternalChanges(projectId);
      const acknowledged = isAcknowledgedExternalChangeSet(projectId, changeSet, acknowledgedExternalChangeSets);
      if (acknowledged) {
        setExternalChangeSet(changeSet);
        setExternalChangeDecisions(buildDefaultExternalChangeDecisions(changeSet));
        setExternalChangesMessage("Cambios omitidos aceptados.");
        if (projectSyncState !== "pending") setProjectSyncState("synced");
        return;
      }
      setExternalChangeSet(changeSet);
      setExternalChangeDecisions(buildDefaultExternalChangeDecisions(changeSet));
      if (changeSet.summary.total > 0) {
        setProjectSyncState(changeSet.requiresReview ? "review-required" : "pending");
        if (options.refreshTreeOnChanges) {
          setProjectTree(projectId, await getProjectTree(projectId));
        }
      } else if (projectSyncState !== "pending") {
        setProjectSyncState(changeSet.status === "none" && changeSet.message ? "unsupported" : "synced");
      }
      setExternalChangesMessage(changeSet.message ?? null);
    } catch (error) {
      if (!options.silent) showError(error, "No se pudieron revisar los cambios externos.");
    }
  }

  function getOpenDocumentSyncState(): OpenDocumentSyncState[] {
    return Object.entries(documentSessions)
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

  async function refreshProjectSyncStatus(projectId = activeProject?.id, options: { autoRun?: boolean; silent?: boolean } = {}) {
    if (!projectId) return;
    try {
      const project = projects.find((candidate) => candidate.id === projectId) ?? (activeProject?.id === projectId ? activeProject : null);
      const payload = {
        openDocuments: getOpenDocumentSyncState(),
        allowAutoApply: Boolean(options.autoRun),
      };
      const canAutoRun = Boolean(options.autoRun && shouldRunAutomaticSync(project, authStatus));
      const status = canAutoRun ? await autoRunProjectSync(projectId, payload) : await scanProjectSync(projectId, payload);
      const normalizedStatus = withDerivedRemoteSyncStatus(status, project, authStatus);
      setProjectSyncStatus(normalizedStatus);
      setProjectSyncState(normalizedStatus.state);
      setExternalChangesMessage(normalizedStatus.detail ?? normalizedStatus.label);
    } catch (error) {
      if (!options.silent) showError(error, "No se pudo comprobar la sincronización del proyecto.");
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
    if (!activeProject || !externalChangeSet) return;
    if (externalChangesBusy) return;
    const decisions = buildExternalImportDecisions(externalChangeSet, externalChangeDecisions, options.safeOnly);
    setExternalChangesBusy(true);
    setProjectSyncState("saving");
    setExternalChangesMessage("Guardando versión local antes de sincronizar con GitHub.");
    try {
      const payload: ExternalChangeImportRequest = { decisions, syncRemote: true };
      const result = await importExternalChanges(activeProject.id, payload);
      setProjectTree(activeProject.id, result.tree);
      setProjectSyncState(result.status);
      setExternalChangesMessage(result.message);
      await refreshProjectCapabilityState(activeProject.id);
      await refreshExternalChangeSet(activeProject.id, { silent: true });
      await refreshProjectActivity(activeProject.id);
      setProjectSyncState(result.status);
      setExternalChangesMessage(result.message);
      if (!result.pendingRemoteSync) setExternalChangesOpen(false);
    } catch (error) {
      setProjectSyncState("error");
      showError(error, "No se pudieron guardar los cambios detectados.");
    } finally {
      setExternalChangesBusy(false);
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
    if (tabId === NOTES_WORKSPACE_TAB_ID) return;

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

    const documentId = tabId;
    if (documentSessions[documentId]?.isDirty) {
      setCloseDocumentId(documentId);
      return;
    }
    closeTabNow(documentId);
  }

  function handleReorderDocumentTabs(draggedTabId: string, targetTabId: string, placement: "before" | "after") {
    setWorkspaceTabOrder((currentOrder) => {
      const visibleTabIds = orderedScrollableWorkspaceTabs.map((tab) => tab.id);
      return reorderWorkspaceTabIds(normalizeWorkspaceTabOrder(currentOrder, visibleTabIds), draggedTabId, targetTabId, placement);
    });
    setTabs((currentTabs) => reorderOpenDocumentTabs(currentTabs, draggedTabId, targetTabId, placement));
  }

  function closeTabNow(documentId: string) {
    const nextTabs = tabs.filter((tab) => tab.id !== documentId);
    setTabs(nextTabs);
    setPendingEditorOperations((currentOperations) => currentOperations.filter((operation) => operation.documentId !== documentId));
    setDocumentSessions((currentSessions) => {
      const { [documentId]: _closedSession, ...nextSessions } = currentSessions;
      return nextSessions;
    });
    if (documentId === activeDocumentId && activeUtilityTab === null) {
      const nextActiveDocumentId = nextTabs[0]?.id ?? "";
      setActiveDocumentId(nextActiveDocumentId);
      if (nextActiveDocumentId) {
        revealTreeNode(nextActiveDocumentId);
      } else {
        setActiveTreeNodeId("");
      }
    }
  }

  function handleSelectTab(tabId: string) {
    if (tabId === AI_CONVERSATION_TAB_ID) {
      if (activeDocumentId && documentSessions[activeDocumentId]) {
        void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
      }
      setActiveUtilityTab(null);
      setActiveImageId("");
      setActiveReferenceDocumentId("");
      setActiveDocumentId("");
      setActiveTreeNodeId("");
      return;
    }

    if (tabId === RELEASE_NOTES_WORKSPACE_TAB_ID) {
      setOpenUtilityTabs((currentTabs) => ensureReleaseNotesTab(currentTabs));
      setActiveUtilityTab(RELEASE_NOTES_UTILITY_TAB_ID);
      setActiveImageId("");
      setActiveReferenceDocumentId("");
      setActiveTreeNodeId("");
      return;
    }

    if (tabId === NOTES_WORKSPACE_TAB_ID) {
      if (activeDocumentId && documentSessions[activeDocumentId]) {
        void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
      }
      setActiveUtilityTab(NOTES_UTILITY_TAB_ID);
      setActiveImageId("");
      setActiveReferenceDocumentId("");
      setActiveDocumentId("");
      setActiveTreeNodeId("");
      return;
    }

    if (imageTabs.some((tab) => tab.id === tabId)) {
      if (activeDocumentId && documentSessions[activeDocumentId]) {
        void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
      }
      setActiveUtilityTab(null);
      setActiveImageId(tabId);
      setActiveReferenceDocumentId("");
      setActiveTreeNodeId(tabId);
      return;
    }

    if (referenceDocumentTabs.some((tab) => tab.id === tabId)) {
      if (activeDocumentId && documentSessions[activeDocumentId]) {
        void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
      }
      setActiveUtilityTab(null);
      setActiveImageId("");
      setActiveReferenceDocumentId(tabId);
      setActiveDocumentId("");
      setActiveTreeNodeId(tabId);
      return;
    }

    const documentId = tabId;
    if (activeDocumentId && documentSessions[activeDocumentId]) {
      void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
    }
    setActiveUtilityTab(null);
    setActiveImageId("");
    setActiveReferenceDocumentId("");
    setActiveDocumentId(documentId);
    revealTreeNode(documentId);
  }

  function handleOpenReleaseNotes() {
    setOpenUtilityTabs((currentTabs) => ensureReleaseNotesTab(currentTabs));
    setActiveUtilityTab(RELEASE_NOTES_UTILITY_TAB_ID);
    setActiveReferenceDocumentId("");
    setActiveImageId("");
    setActiveTreeNodeId("");
  }

  function handleMarkdownChange(documentId: string, nextMarkdown: string) {
    setDocumentSessions((currentSessions) => {
      const session = currentSessions[documentId];
      if (!session) return currentSessions;
      return {
        ...currentSessions,
        [documentId]: applyLocalMarkdownEdit(session, nextMarkdown),
      };
    });
  }

  function handleNotesMarkdownChange(nextMarkdown: string) {
    setNotesMarkdown(nextMarkdown);
    setNotesSaveState("idle");
  }

  function handleEditorOperationApplied(operationId: string) {
    setPendingEditorOperations((currentOperations) => currentOperations.filter((operation) => operation.id !== operationId));
  }

  function handleEditorOperationFailed(operation: MarkdownEditorExternalOperation) {
    setPendingEditorOperations((currentOperations) => currentOperations.filter((currentOperation) => currentOperation.id !== operation.id));
    if (operation.documentId === NOTES_WORKSPACE_TAB_ID) {
      setNotesMarkdown(operation.markdown);
      void persistNotes(operation.markdown);
      return;
    }
    setDocumentSessions((currentSessions) => {
      const session = currentSessions[operation.documentId];
      if (!session) return currentSessions;
      return {
        ...currentSessions,
        [operation.documentId]: applyExternalMarkdownUpdate(session, operation.markdown),
      };
    });
  }

  async function handleSendAiPrompt(prompt: string, selectionFocus?: AiSelectionFocus | null, options?: AiPromptExecutionOptions) {
    if (!activeProject) return;
    const hasNotesContext = activeUtilityTab === NOTES_UTILITY_TAB_ID;
    const hasDocumentContext = Boolean(activeDocumentId && activeSession?.document);
    if (hasDocumentContext && (activeSession?.conflictStatus === "disk-changed" || activeSession?.orphaned || activeSession?.conflictStatus === "missing")) {
      setAiBubble({ id: `local-${Date.now()}`, answer: "Resuelve el conflicto del documento antes de aplicar cambios con IA." });
      return;
    }
    const interactionDocumentId = hasNotesContext ? NOTES_WORKSPACE_TAB_ID : hasDocumentContext ? activeDocumentId : null;
    const interactionMarkdown = hasNotesContext ? notesMarkdown : hasDocumentContext ? activeSession?.markdown ?? "" : "";
    const interactionSelection = hasNotesContext
      ? selectionFocus?.documentId === NOTES_WORKSPACE_TAB_ID ? selectionFocus : null
      : hasDocumentContext && selectionFocus?.documentId === activeDocumentId ? selectionFocus : null;

    setAiBubble(null);
    try {
      const response = await sendAiInteraction({
        projectId: activeProject.id,
        documentId: interactionDocumentId,
        prompt,
        activeMarkdown: interactionMarkdown,
        selectionFocus: interactionSelection,
        clientContext: {
          lastDocumentId: lastDocumentContextRef.current.id,
          lastDocumentPath: lastDocumentContextRef.current.path,
        },
        executionMode: options?.executionMode ?? "quick",
        reasoningDepth: options?.reasoningDepth ?? "light",
        mode: interactionDocumentId ? "document" : "project",
        clientMessageId: `client-${Date.now()}`,
        contextSourceIds: promptContextSourceIds,
      });
      applyAiInteractionResponse(response);
      void refreshAiUsageSummary();
    } catch (error) {
      showError(error, "No se pudo completar la interacción IA.", { source: "app.aiInteraction" });
    }
  }

  async function handleSearchAiContextDocuments(query: string): Promise<AiContextSearchResult[]> {
    if (!activeProject) return [];
    return searchAiContextDocuments(activeProject.id, query);
  }

  async function handleAddProjectDocumentContext(documentId: string) {
    if (!activeProject) return;
    try {
      const node = documentId.startsWith("fs_") ? findNodeById(tree, documentId) : null;
      if (node?.type === "image") {
        await addProjectImageAiContextSource(activeProject.id, documentId);
      } else if (node?.type === "attachment") {
        await addProjectAttachmentAiContextSource(activeProject.id, documentId);
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
    return previewAiContextSource(activeProject.id, sourceId);
  }

  async function handleAddAiContextSourceToProject(sourceId: string) {
    if (!activeProject) return;
    try {
      const source = aiContextSources.find((item) => item.id === sourceId);
      const result = await addAiContextSourceToProject(activeProject.id, sourceId, {
        name: source?.name ? `${source.name.replace(/\.[^.]+$/, "")}.md` : undefined,
        parentId: null,
      });
      if (result.tree && activeProject) setProjectTree(activeProject.id, result.tree);
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
    try {
      const response = await sendAiInteraction({
        projectId: activeProject.id,
        documentId: targetDocumentId ?? null,
        prompt: "",
        activeMarkdown: targetSession?.markdown ?? "",
        selectionFocus: null,
        clientContext: {
          lastDocumentId: lastDocumentContextRef.current.id,
          lastDocumentPath: lastDocumentContextRef.current.path,
        },
        intentAction: { type: action, intentId },
        mode: targetDocumentId ? "document" : "project",
        clientMessageId: `client-intent-${Date.now()}`,
      });
      applyAiInteractionResponse(response);
      void refreshAiUsageSummary();
    } catch (error) {
      showError(error, "No se pudo aplicar la intención IA.", { source: "app.aiIntentAction" });
    }
  }

  function applyAiInteractionResponse(response: AiInteractionResponse) {
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
    const affectedDocuments = response.affectedDocuments ?? [];
    if (response.tree && affectedDocuments.length > 0) {
      applyFileOperationResult({ tree: response.tree, node: null, affectedDocuments });
    } else if (response.tree && activeProject) {
      setProjectTree(activeProject.id, response.tree);
    }
    const generatedImage = response.generatedImages?.[0];
    const generatedImageToOpen = generatedImage?.asset;
    if (generatedImageToOpen) {
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

    if (response.updatedDocument) {
      const updated = response.updatedDocument;
      if (updated.documentId === NOTES_WORKSPACE_TAB_ID) {
        setNotesMarkdown(updated.markdown);
        setAiAppliedChange({
          documentId: NOTES_WORKSPACE_TAB_ID,
          summary: updated.summary,
        });
        void persistNotes(updated.markdown);
        setPendingEditorOperations((currentOperations) => [
          ...currentOperations,
          {
            id: `ai-${response.interactionId}-${NOTES_WORKSPACE_TAB_ID}-${Date.now()}`,
            documentId: NOTES_WORKSPACE_TAB_ID,
            markdown: updated.markdown,
            source: "ai",
            addToHistory: true,
          },
        ]);
      } else {
      const existingSession = documentSessions[updated.documentId];
      const targetNode = findNodeById(tree, updated.documentId);
      if (!existingSession) {
        setTabs((currentTabs) => (
          currentTabs.some((tab) => tab.id === updated.documentId)
            ? currentTabs
            : [...currentTabs, { id: updated.documentId, name: targetNode?.name ?? updated.documentId }]
        ));
        setActiveUtilityTab(null);
        setActiveDocumentId(updated.documentId);
        setActiveTreeNodeId(updated.documentId);
        void getDocument(updated.documentId)
          .then((record) => {
            setDocumentSessions((currentSessions) => ({
              ...currentSessions,
              [updated.documentId]: applyExternalMarkdownUpdate(createLoadedDocumentSession(record, currentSessions[updated.documentId]), updated.markdown),
            }));
            setAiAppliedChange({ documentId: updated.documentId, summary: updated.summary });
          })
          .catch((error) => showError(error, "No se pudo abrir el documento actualizado por IA.", { source: "app.aiUpdatedDocument" }));
      } else {
        const updatedSession = applyLocalMarkdownEdit(existingSession, updated.markdown);
        setDocumentSessions((currentSessions) => {
          const session = currentSessions[updated.documentId];
          if (!session) return currentSessions;
          return {
            ...currentSessions,
            [updated.documentId]: applyLocalMarkdownEdit(session, updated.markdown),
          };
        });
        void persistDraft(updated.documentId, updatedSession);
        setAiAppliedChange({
          documentId: updated.documentId,
          summary: updated.summary,
        });
        setPendingEditorOperations((currentOperations) => [
          ...currentOperations,
          {
            id: `ai-${response.interactionId}-${updated.documentId}-${Date.now()}`,
            documentId: updated.documentId,
            markdown: updated.markdown,
            source: "ai",
            addToHistory: true,
          },
        ]);
      }
      }
    }

    if (response.uiPlacement === "conversation_tab" || response.routeToAiTab) {
      handleSelectTab(AI_CONVERSATION_TAB_ID);
    }

    const createdDocument = response.operations.find((operation) => (
      (operation.type === "document_created" || operation.type === "document_duplicated") && operation.documentId
    ));
    if (createdDocument?.documentId) {
      handleOpenDocument(createdDocument.documentId, createdDocument.path?.split("/").pop() ?? "Documento IA");
    }

    if (response.answer && response.display !== "none") {
      setAiBubble({ id: response.interactionId, answer: response.answer });
    }
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
      from: selection.from,
      to: selection.to,
      text: selection.text,
    });
  }

  async function handleConfirmAiDelete() {
    if (!activeProject || !aiPendingDelete) return;
    try {
      const response = await confirmAiDelete(activeProject.id, { confirmationId: aiPendingDelete.confirmationId });
      setAiPendingDelete(null);
      applyAiInteractionResponse(response);
    } catch (error) {
      showError(error, "No se pudo confirmar el borrado solicitado por IA.", { source: "app.aiConfirmDelete" });
    }
  }

  async function handleSave(documentId = activeDocumentId, force = false) {
    const session = documentSessions[documentId];
    if (!documentId || !session?.document) return false;
    setDocumentSessions((currentSessions) => updateSession(currentSessions, documentId, { saveState: "saving" }));
    try {
      const saved = await saveDocument(documentId, {
        markdown: session.markdown,
        baseFingerprint: session.baseFingerprint,
        force,
      });
      if (force && session.orphaned && activeProject?.id === saved.projectId) {
        setProjectTree(saved.projectId, await getProjectTree(saved.projectId));
      }
      setDocumentSessions((currentSessions) => updateSession(currentSessions, documentId, {
        document: saved,
        markdown: saved.markdown,
        savedMarkdown: saved.markdown,
        isDirty: false,
        saveState: "saved",
        lastDraftMarkdown: "",
        baseFingerprint: saved.baseFingerprint,
        conflictStatus: "none",
        diskChanged: false,
        orphaned: false,
        hasRecoveredDraft: false,
        draftUpdatedAt: null,
      }));
      window.setTimeout(() => {
        setDocumentSessions((currentSessions) => {
          const currentSession = currentSessions[documentId];
          if (!currentSession || currentSession.saveState !== "saved") return currentSessions;
          return updateSession(currentSessions, documentId, { saveState: "idle" });
        });
      }, 1400);
      await refreshProjectCapabilityState(saved.projectId);
      await refreshProjectSyncStatus(saved.projectId, { autoRun: isAutomaticSyncMode(activeProject?.syncMode), silent: true });
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
      return true;
    } catch (error) {
      setDocumentSessions((currentSessions) => updateSession(currentSessions, documentId, { saveState: "idle" }));
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
    }
  }

  async function handleSelectProject(project: Project) {
    if (project.id === activeProject?.id) return;
    if (!await flushPendingDrafts()) return;
    if (activeProject) {
      setTabsByProject((currentTabsByProject) => ({
        ...currentTabsByProject,
        [activeProject.id]: normalizeProjectTabs({ openTabs: tabs, activeDocumentId }),
      }));
    }

    try {
      const active = await persistActiveProject(project.id);
      const nextTree = await getProjectTree(active.id);
      const restoredTree = applyTreeOpenState(nextTree, {
        openPaths: treeOpenPathsByProject[active.id] ?? [],
      });
      const nextVersioningStatus = await getProjectVersioningStatus(active.id);
      const nextProjectTabs = resolveProjectTabs(tabsByProject, active.id, restoredTree);
      setProjects((currentProjects) => currentProjects.map((currentProject) => ({
        ...currentProject,
        active: currentProject.id === active.id,
      })));
      setActiveProject(active);
      setVersioningStatus(nextVersioningStatus);
      setTree(restoredTree);
      persistTreeOpenState(active.id, restoredTree);
      setTabs(nextProjectTabs.openTabs);
      setActiveDocumentId(nextProjectTabs.activeDocumentId);
      setActiveTreeNodeId(nextProjectTabs.activeDocumentId);
      setImageTabs([]);
      setActiveImageId("");
      setReferenceDocumentTabs([]);
      setActiveReferenceDocumentId("");
      setExternalChangeSet(null);
      setExternalChangeDecisions({});
      setExternalChangesMessage(null);
      setProjectSyncState("synced");
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
      setProjectTree(activeProject.id, markNodeEditing(result.tree, result.node?.id ?? null));
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

    try {
      if (previousNode?.type === "image") {
        const usage = await getProjectImageUsage(activeProject.id, previousNode.id);
        if (usage.references.length > 0) {
          const proceed = window.confirm(`La imagen "${previousNode.name}" esta enlazada en ${usage.references.length} documento(s).\n\nKnowNext.ai actualizara las referencias relativas para que sigan apuntando a la imagen renombrada.`);
          if (!proceed) {
            updateCurrentProjectTree((currentTree) => markNodeEditing(currentTree, null));
            return;
          }
        }
      }
      const result = await renameTreeNode(activeProject.id, nodeId, nextName);
      applyFileOperationResult(result, previousNode);
    } catch (error) {
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

  async function handleCreateDocument(name: string, template: string) {
    if (!activeProject) return;
    const documentName = name.trim().endsWith(".md") ? name.trim() : `${name.trim()}.md`;
    const markdownValue = getTemplateMarkdown(template, documentName);
    try {
      const result = await createProjectDocument(activeProject.id, createDocumentParentId, documentName, markdownValue);
      applyFileOperationResult(result);
      if (result.node?.type === "document") {
        openOrReplaceTab(result.node.id, result.node.name);
      }
      setCreateDocumentOpen(false);
      setCreateDocumentParentId(null);
    } catch (error) {
      showError(error, "No se pudo crear el documento.");
    }
  }

  async function handleCreateProject(project: ProjectPayload) {
    try {
      if (!await flushPendingDrafts()) return;
      const nextProject = await createProject(project);

      setProjects((currentProjects) => [
        ...currentProjects.map((currentProject) => ({ ...currentProject, active: false })),
        nextProject,
      ]);
      const nextTree = await getProjectTree(nextProject.id);
      const restoredTree = applyTreeOpenState(nextTree);
      const nextProjectTabs = resolveProjectTabs({}, nextProject.id, restoredTree);
      setActiveProject(nextProject);
      setTree(restoredTree);
      persistTreeOpenState(nextProject.id, restoredTree);
      setTabs(nextProjectTabs.openTabs);
      setActiveDocumentId(nextProjectTabs.activeDocumentId);
      setActiveTreeNodeId(nextProjectTabs.activeDocumentId);
      setReferenceDocumentTabs([]);
      setActiveReferenceDocumentId("");
      setTabsByProject((currentTabsByProject) => ({
        ...currentTabsByProject,
        [nextProject.id]: nextProjectTabs,
      }));
      setHistoryOpen(false);
      setCreateProjectOpen(false);
      await refreshProjectCapabilityState(nextProject.id);
    } catch (error) {
      showError(error, "No se pudo crear el proyecto.");
    }
  }

  async function handleUpdateProject(projectId: string, project: ProjectPayload) {
    try {
      const currentProject = projects.find((candidate) => candidate.id === projectId);
      const githubRepository = project.githubRepository;
      const githubSyncMode = project.syncMode === "auto-github" ? "auto-github" : "manual-github";
      const isNewGithubConnection = Boolean(!currentProject?.githubRepository && githubRepository && project.syncMode !== "none");
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

      await updateProject(projectId, identityPayload);
      if (currentProject?.versioningMode === "none" && project.versioningMode === "local-git" && !isNewGithubConnection) {
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
      } else if (currentProject?.githubRepository && currentProject.syncMode !== project.syncMode) {
        await changeProjectSyncMode(projectId, project.syncMode);
      }

      const refreshedProjects = await listProjects();
      const updatedProject = refreshedProjects.find((candidate) => candidate.id === projectId) ?? currentProject ?? null;
      setProjects(refreshedProjects);
      if (updatedProject) {
        setActiveProject((currentProject) => (
          currentProject?.id === projectId ? updatedProject : currentProject
        ));
      }
      if (activeProject?.id === projectId) {
        const nextTree = await getProjectTree(projectId);
        const restoredTree = applyTreeOpenState(nextTree, {
          currentTree: tree,
          openPaths: treeOpenPathsByProject[projectId] ?? [],
        });
        const nextVersioningStatus = await getProjectVersioningStatus(projectId);
        setTree(restoredTree);
        persistTreeOpenState(projectId, restoredTree);
        setVersioningStatus(nextVersioningStatus);
        const nextProjectTabs = resolveProjectTabs(tabsByProject, projectId, restoredTree);
        setTabs(nextProjectTabs.openTabs);
        setActiveDocumentId(nextProjectTabs.activeDocumentId);
        setActiveTreeNodeId(nextProjectTabs.activeDocumentId);
        setReferenceDocumentTabs([]);
        setActiveReferenceDocumentId("");
        if (!nextVersioningStatus.enabled) setHistoryOpen(false);
        await refreshProjectSyncStatus(projectId, { autoRun: isAutomaticSyncMode(updatedProject?.syncMode), silent: true });
        await refreshProjectActivity(projectId);
      }
      setEditProjectOpen(false);
    } catch (error) {
      showError(error, "No se pudo guardar el proyecto.");
    }
  }

  async function handleDeleteProject(projectId: string) {
    try {
      if (!await flushPendingDrafts()) return;
      const nextProjects = await deleteProject(projectId);
      const nextActiveProject = nextProjects.find((project) => project.active) ?? nextProjects[0];

      setProjects(nextProjects);
      setTabsByProject((currentTabsByProject) => {
        const { [projectId]: _removedProjectTabs, ...nextTabsByProject } = currentTabsByProject;
        return nextTabsByProject;
      });
      setTreeOpenPathsByProject((currentState) => {
        const { [projectId]: _removedProjectTreeState, ...nextState } = currentState;
        return nextState;
      });
      setEditProjectOpen(false);

      if (!nextActiveProject) {
        setActiveProject(null);
        setVersioningStatus(null);
        setTree([]);
        setTabs([]);
        setActiveDocumentId("");
        setActiveTreeNodeId("");
        setImageTabs([]);
        setActiveImageId("");
        setReferenceDocumentTabs([]);
        setActiveReferenceDocumentId("");
        setDocumentSessions({});
        setHistoryOpen(false);
        setExternalChangeSet(null);
        setExternalChangeDecisions({});
        setExternalChangesMessage(null);
        setProjectSyncState("synced");
        return;
      }

      const nextTree = await getProjectTree(nextActiveProject.id);
      const restoredTree = applyTreeOpenState(nextTree, {
        openPaths: treeOpenPathsByProject[nextActiveProject.id] ?? [],
      });
      const nextVersioningStatus = await getProjectVersioningStatus(nextActiveProject.id);
      const nextProjectTabs = resolveProjectTabs(tabsByProject, nextActiveProject.id, restoredTree);
      setActiveProject(nextActiveProject);
      setVersioningStatus(nextVersioningStatus);
      setTree(restoredTree);
      persistTreeOpenState(nextActiveProject.id, restoredTree);
      setTabs(nextProjectTabs.openTabs);
      setActiveDocumentId(nextProjectTabs.activeDocumentId);
      setActiveTreeNodeId(nextProjectTabs.activeDocumentId);
      setImageTabs([]);
      setActiveImageId("");
      setReferenceDocumentTabs([]);
      setActiveReferenceDocumentId("");
      if (!nextVersioningStatus.enabled) setHistoryOpen(false);
    } catch (error) {
      showError(error, "No se pudo eliminar el proyecto.");
    }
  }

  async function handleOpenGithubLogin() {
    setGithubLoginOpen(true);
    if ((githubDevice?.mock || !githubDevice || githubLoginState === "error") && githubLoginState !== "starting") {
      await handleStartGithubLogin();
    }
  }

  async function handleStartGithubLogin() {
    setGithubLoginState("starting");
    setGithubLoginError(null);
    setGithubDevice(null);
    try {
      const device = await startGithubDeviceFlow();
      if (device.status === "error" && !device.mock) {
        setGithubDevice(null);
        setGithubLoginState("error");
        setGithubLoginError(getGithubDeviceFlowErrorMessage(device.error));
        return;
      }
      setGithubDevice(device);
      setGithubLoginState("waiting");
    } catch (error) {
      setGithubLoginState("error");
      setGithubLoginError(getApiErrorMessage(error, "No se pudo iniciar el login con GitHub."));
    }
  }

  async function handlePollGithubLogin() {
    if (!githubDevice || githubLoginPollingRef.current) return;
    if (githubDevice.mock && !import.meta.env.DEV) return;
    githubLoginPollingRef.current = true;
    setGithubLoginPolling(true);
    setGithubLoginError(null);
    try {
      const response = await pollGithubDeviceFlow(githubDevice.deviceCode);
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
    if (!activeProject || syncState !== "idle") return;
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
      return;
    }
    setSyncState("pulling");
    setExternalChangesBusy(true);
    setExternalChangesMessage("Actualizando el proyecto desde GitHub.");
    try {
      const response = await pullProject(activeProject.id);
      setProjectTree(activeProject.id, await getProjectTree(activeProject.id));
      await refreshProjectCapabilityState(activeProject.id);
      await refreshExternalChangeSet(activeProject.id, { silent: true });
      await refreshProjectSyncStatus(activeProject.id, { silent: true });
      await refreshProjectActivity(activeProject.id);
      setExternalChangesMessage(response.message);
    } catch (error) {
      showError(error, "No se pudo traer cambios del proveedor remoto.");
    } finally {
      setSyncState("idle");
      setExternalChangesBusy(false);
    }
  }

  async function refreshProjectActivity(projectId = activeProject?.id) {
    if (!projectId) return;
    try {
      const activity = await getProjectActivity(projectId);
      setProjectActivity(activity.events);
    } catch {
      setProjectActivity([]);
    }
  }

  async function handleRefreshProtectionState(projectId = activeProject?.id) {
    if (!projectId) return;
    setExternalChangesBusy(true);
    try {
      await Promise.all([
        refreshExternalChangeSet(projectId, { refreshTreeOnChanges: true }),
        refreshProjectSyncStatus(projectId, { autoRun: isAutomaticSyncMode(activeProject?.syncMode), silent: true }),
        refreshProjectActivity(projectId),
      ]);
    } finally {
      setExternalChangesBusy(false);
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
      return;
    }
    setSyncState("pushing");
    setExternalChangesBusy(true);
    setExternalChangesMessage("Subiendo el historial local a GitHub.");
    try {
      const response = await pushProject(activeProject.id);
      await refreshProjectCapabilityState(activeProject.id);
      await refreshProjectSyncStatus(activeProject.id, { silent: true });
      await refreshExternalChangeSet(activeProject.id, { silent: true });
      await refreshProjectActivity(activeProject.id);
      setExternalChangesMessage(response.message);
      if (response.status === "synced") setExternalChangesOpen(false);
    } catch (error) {
      showError(error, "No se pudieron enviar cambios al proveedor remoto.");
    } finally {
      setSyncState("idle");
      setExternalChangesBusy(false);
    }
  }

  async function handleResolveProjectGithubConflict(resolution: "keep-local" | "take-remote") {
    if (!activeProject || syncState !== "idle") return;
    const conflict = projectSyncStatus?.conflicts.find((item) => item.status === "open");
    if (!conflict) {
      await handleRefreshProtectionState(activeProject.id);
      return;
    }
    setSyncState(resolution === "keep-local" ? "pushing" : "pulling");
    setExternalChangesBusy(true);
    setExternalChangesMessage(resolution === "keep-local" ? "Sincronizando GitHub con este equipo." : "Actualizando este equipo desde GitHub.");
    try {
      await resolveProjectSyncConflict(activeProject.id, conflict.id, resolution);
      setProjectTree(activeProject.id, await getProjectTree(activeProject.id));
      await refreshProjectCapabilityState(activeProject.id);
      await refreshProjectSyncStatus(activeProject.id, { silent: true });
      await refreshExternalChangeSet(activeProject.id, { silent: true });
      await refreshProjectActivity(activeProject.id);
      setExternalChangesMessage(resolution === "keep-local" ? "GitHub queda sincronizado con este equipo." : "Este equipo queda sincronizado con GitHub.");
    } catch (error) {
      showError(error, resolution === "keep-local" ? "No se pudo sincronizar GitHub con este equipo." : "No se pudo actualizar este equipo desde GitHub.");
    } finally {
      setSyncState("idle");
      setExternalChangesBusy(false);
    }
  }

  async function handleOpenProjectGithub() {
    const repository = activeProject?.githubRepository;
    if (!repository) return;
    await openExternalUrl(`https://github.com/${repository.owner}/${repository.repo}`);
  }

  async function handleSynchronizeActiveDocument(options: { preserveDraft?: boolean } = {}) {
    if (!activeProject || !activeDocumentId || !versioningStatus?.enabled) return;
    const session = documentSessions[activeDocumentId];
    const documentName = session?.document?.name ?? "documento";

    if (session?.isDirty && !options.preserveDraft) {
      const saved = await handleSave(activeDocumentId);
      if (!saved) return;
    }

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
          return;
        }
        const response = await pushProject(activeProject.id);
        await refreshProjectCapabilityState(activeProject.id);
        await refreshProjectSyncStatus(activeProject.id, { silent: true });
        await checkOpenDocumentSync();
        setExternalChangesMessage(response.message);
        return;
      }

      await refreshProjectSyncStatus(activeProject.id, { silent: true });
      await checkOpenDocumentSync();
    } catch (error) {
      setProjectSyncState("error");
      showError(error, "No se pudo sincronizar el documento.");
    }
  }

  async function handleDiscardActiveDocumentDraft() {
    if (!activeDocumentId) return false;
    try {
      await discardDocumentDraft(activeDocumentId);
      await loadDocumentSession(activeDocumentId, true);
      await checkOpenDocumentSync();
      setNotice({ title: "Cambios descartados", message: "Se ha restaurado la última versión guardada del documento.", tone: "info" });
      return true;
    } catch (error) {
      showError(error, "No se pudieron descartar los cambios pendientes.");
      return false;
    }
  }

  async function handleApplyIncomingDocumentVersion(options: { discardDraft: boolean }) {
    if (!activeProject || !activeDocumentId) return;
    try {
      if (options.discardDraft) {
        await discardDocumentDraft(activeDocumentId);
      }

      const incomingForActiveDocument = activeDocumentSyncStatus?.versionState === "remote-ahead" || activeDocumentSyncStatus?.versionState === "diverged";
      if (incomingForActiveDocument && isGithubSyncMode(activeProject.syncMode)) {
        await handlePullProject();
        await loadDocumentSession(activeDocumentId, true);
        await refreshProjectSyncStatus(activeProject.id, { silent: true });
        await checkOpenDocumentSync();
        return;
      }

      if (activeDocumentSyncStatus?.diskChanged || activeDocumentSyncStatus?.conflictStatus === "disk-changed") {
        await handleLoadDiskVersion();
        await checkOpenDocumentSync();
        return;
      }

      await refreshProjectSyncStatus(activeProject.id, { autoRun: isAutomaticSyncMode(activeProject.syncMode), silent: true });
      await checkOpenDocumentSync();
    } catch (error) {
      showError(error, "No se pudo actualizar el documento con la última versión disponible.");
    }
  }

  function requestDiscardActiveDocumentDraft() {
    setDocumentFooterDialog("discard-draft");
  }

  function requestIncomingDocumentVersion() {
    setDocumentFooterDialog((activeSession?.isDirty ?? false) ? "update-remote-discard-draft" : "update-remote");
  }

  function requestSynchronizeActiveDocument() {
    if (activeSession?.isDirty) {
      setDocumentFooterDialog("sync-saved-while-draft");
      return;
    }
    void handleSynchronizeActiveDocument();
  }

  async function confirmDocumentFooterDialog() {
    const dialog = documentFooterDialog;
    setDocumentFooterDialog(null);
    if (dialog === "discard-draft") {
      await handleDiscardActiveDocumentDraft();
      return;
    }
    if (dialog === "update-remote" || dialog === "update-remote-discard-draft") {
      await handleApplyIncomingDocumentVersion({ discardDraft: dialog === "update-remote-discard-draft" });
      return;
    }
    if (dialog === "sync-saved-while-draft") {
      await handleSynchronizeActiveDocument({ preserveDraft: true });
    }
  }

  async function handleRestoreActiveVersion(versionId: string): Promise<CreateVersionResponse | null> {
    if (!activeProject || !activeDocumentId) return null;
    try {
      const response = await restoreVersion(activeDocumentId, versionId);
      await loadDocumentSession(activeDocumentId, true);
      await refreshProjectCapabilityState(activeProject.id);
      await refreshProjectSyncStatus(activeProject.id, { autoRun: isAutomaticSyncMode(activeProject.syncMode), silent: true });
      return response;
    } catch (error) {
      showError(error, "No se pudo restaurar la versión seleccionada.");
      return null;
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
    if (!availableUpdate || updateState === "downloading" || updateState === "installing") return;

    if (!await flushPendingDrafts()) {
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
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo instalar la actualización.";
      setUpdateState("error");
      setUpdateError(message);
      setNotice({
        title: "No se pudo instalar la actualización",
        message,
        tone: "error",
      });
    }
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

    recordDiagnosticError(options.source ?? "app.showError", message, detail);

    setNotice({
      title: "No se pudo completar la operación",
      message,
      tone: "error",
    });
  }

  function recordDiagnosticError(source: string, message: string, detail: string) {
    const fingerprint = `${source}:${message}:${detail.slice(0, 400)}`;
    const now = Date.now();
    if (lastTraceLogRef.current?.fingerprint === fingerprint && now - lastTraceLogRef.current.timestamp < 10_000) {
      return;
    }

    lastTraceLogRef.current = { fingerprint, timestamp: now };
    void recordTraceLog({ source, message, detail });
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
      writeLocalAppPreferences({ appearance: updatedAppearanceConfig });
      return updatedAppearanceConfig;
    });
  }

  function handleDiagnosticsConfigChange(nextDiagnosticsConfig: Partial<DiagnosticsConfig>) {
    setDiagnosticsConfig((currentDiagnosticsConfig) => {
      const updatedDiagnosticsConfig = { ...currentDiagnosticsConfig, ...nextDiagnosticsConfig };
      writeLocalAppPreferences({ diagnostics: updatedDiagnosticsConfig });
      return updatedDiagnosticsConfig;
    });
  }

  function handleExportTemplateChange(nextExportTemplate: ExportTemplateUpdate) {
    setExportTemplateConfig((currentTemplate) => {
      const updatedTemplate: ExportTemplateConfig = {
        ...currentTemplate,
        ...nextExportTemplate,
        page: nextExportTemplate.page ?? currentTemplate.page,
        normal: nextExportTemplate.normal ?? currentTemplate.normal,
        headings: nextExportTemplate.headings
          ? { ...currentTemplate.headings, ...nextExportTemplate.headings }
          : currentTemplate.headings,
        code: nextExportTemplate.code ?? currentTemplate.code,
        paragraph: nextExportTemplate.paragraph ?? currentTemplate.paragraph,
        document: nextExportTemplate.document ?? currentTemplate.document,
        headingFontFamily: nextExportTemplate.headingFontFamily ?? currentTemplate.headingFontFamily,
      };
      void updateExportTemplate(nextExportTemplate)
        .then(setExportTemplateConfig)
        .catch((error) => showError(error, "No se pudo guardar la plantilla de exportación.", { source: "app.exportTemplate" }));
      return updatedTemplate;
    });
  }

  async function handleResetExportTemplate() {
    try {
      setExportTemplateConfig(await resetExportTemplate());
      setExportTemplatePath(await getExportTemplatePath());
    } catch (error) {
      showError(error, "No se pudo restablecer la plantilla de exportación.", { source: "app.exportTemplate.reset" });
    }
  }

  async function refreshAiState(projectId = activeProject?.id) {
    try {
      const nextAiConfig = await getAiConfig();
      const [conversation, indexStatus, usageSummary, pendingIntent, contextSources] = await Promise.all([
        projectId ? getAiConversation(projectId) : Promise.resolve({ events: [] }),
        projectId && nextAiConfig.rag.enabled ? getAiIndexStatus(projectId) : Promise.resolve(null),
        loadAiUsageSummary("app.aiState.aiUsageSummary"),
        projectId ? getAiPendingIntent(projectId) : Promise.resolve(null),
        projectId ? getAiContextSources(projectId) : Promise.resolve({ sources: [], expiredSourceIds: [] }),
      ]);
      setAiConfig(nextAiConfig);
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

  function handleAiConfigChange(nextAiConfig: AiConfigStatus) {
    const saveSequence = aiConfigSaveSequence.current + 1;
    aiConfigSaveSequence.current = saveSequence;
    setAiConfig(nextAiConfig);
    void updateAiConfig({
      provider: nextAiConfig.provider,
      model: nextAiConfig.model,
      permissions: nextAiConfig.permissions,
      rag: nextAiConfig.rag,
      vision: nextAiConfig.vision,
      imageGeneration: nextAiConfig.imageGeneration,
      agentic: nextAiConfig.agentic,
      transcription: nextAiConfig.transcription,
    })
      .then((savedAiConfig) => {
        if (aiConfigSaveSequence.current === saveSequence) setAiConfig(savedAiConfig);
      })
      .catch((error) => showError(error, "No se pudo guardar la configuración de IA.", { source: "app.aiConfig" }));
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
    try {
      await saveOpenAiKey(apiKey);
      await refreshAiState();
    } catch (error) {
      showError(error, "No se pudo guardar la clave de OpenAI.", { source: "app.openAiKey" });
    }
  }

  async function handleDeleteOpenAiKey() {
    try {
      await deleteOpenAiKey();
      await refreshAiState();
    } catch (error) {
      showError(error, "No se pudo eliminar la clave de OpenAI.", { source: "app.openAiKey" });
    }
  }

  async function handleRebuildAiIndex() {
    if (!activeProject) return;
    try {
      setAiIndexStatus(await rebuildAiIndex(activeProject.id));
      await refreshAiState(activeProject.id);
    } catch (error) {
      showError(error, "No se pudo reindexar la documentación para IA.", { source: "app.aiIndex" });
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

  async function handleDeleteAiIndex() {
    if (!activeProject) return;
    try {
      setAiIndexStatus(await deleteAiIndex(activeProject.id));
      await refreshAiState(activeProject.id);
    } catch (error) {
      showError(error, "No se pudo eliminar el índice de IA.", { source: "app.aiIndex" });
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

  function handleTreeContextAction(action: DocumentTreeAction, node: DocumentTreeNode) {
    if (action === "export-md" || action === "export-pdf" || action === "export-docx") {
      const format = action === "export-md" ? "md" : action === "export-pdf" ? "pdf" : "docx";
      void handleExportDocument(node.id, format);
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
        setNotice({ title: "Abre un documento", message: "Necesitas un documento activo para insertar una imagen.", tone: "info" });
        return;
      }
      void insertImageIntoActiveDocument(node.id);
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

  async function handleExportDocument(documentId: string, format: ExportFormat) {
    const session = documentSessions[documentId];
    const documentName = session?.document?.name ?? findNodeById(tree, documentId)?.name ?? "documento.md";

    try {
      if (!isTauriRuntime()) {
        const exportTarget = await selectBrowserExportTarget(documentName, format);
        if (!exportTarget) return;
        const blob = await exportDocumentContent(documentId, {
          format,
          markdown: session?.markdown ?? null,
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
        markdown: session?.markdown ?? null,
      });
      setNotice({
        title: "Documento exportado",
        message: response.outputPath,
        tone: "info",
      });
    } catch (error) {
      showError(error, "No se pudo exportar el documento.", { source: "app.documentExport" });
    }
  }

  async function handleDeleteNode(node: DocumentTreeNode) {
    if (!activeProject) return;
    let message = node.type === "folder"
      ? `Se eliminará la carpeta "${node.name}" y su contenido del disco. Esta acción no se puede deshacer.`
      : node.type === "image"
        ? `Se eliminará la imagen "${node.name}" del disco. Esta acción no se puede deshacer.`
        : node.type === "attachment"
          ? `Se eliminará el archivo "${node.name}" del disco. Esta acción no se puede deshacer.`
          : `Se eliminará el documento "${node.name}" del disco. Esta acción no se puede deshacer.`;
    if (node.type === "image") {
      try {
        const usage = await getProjectImageUsage(activeProject.id, node.id);
        if (usage.references.length > 0) {
          message = `${message}\n\nEsta imagen esta enlazada en ${usage.references.length} documento(s). Si la eliminas, esas referencias quedaran rotas.`;
        }
      } catch {
        message = `${message}\n\nNo se pudo comprobar si otros documentos la enlazan.`;
      }
    }
    if (!window.confirm(message)) return;

    try {
      const result = await deleteTreeNode(activeProject.id, node.id);
      applyFileOperationResult(result, node);
    } catch (error) {
      showError(error, "No se pudo eliminar el elemento.");
    }
  }

  async function handleDuplicateDocument(node: DocumentTreeNode) {
    if (!activeProject || node.type !== "document") return;
    try {
      const result = await duplicateProjectDocument(activeProject.id, node.id);
      applyFileOperationResult(result);
      if (result.node?.type === "document") {
        openOrReplaceTab(result.node.id, result.node.name);
      }
    } catch (error) {
      showError(error, "No se pudo duplicar el documento.");
    }
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
    try {
      if (node.type === "document") {
        const impact = await getDocumentMoveImpact(activeProject.id, node.id);
        if (impact.references.length > 0) {
          const shared = impact.sharedAssetPaths.length > 0 ? ` ${impact.sharedAssetPaths.length} imagen(es) tambien se usan en otros documentos.` : "";
          const proceed = window.confirm(`${impact.message}${shared}\n\nKnowNext.ai actualizará las referencias relativas para mantener las imágenes enlazadas.`);
          if (!proceed) return false;
        }
      }
      if (node.type === "image") {
        const usage = await getProjectImageUsage(activeProject.id, node.id);
        if (usage.references.length > 0) {
          const proceed = window.confirm(`La imagen "${node.name}" esta enlazada en ${usage.references.length} documento(s).\n\nKnowNext.ai actualizara esas referencias para que sigan apuntando a la imagen movida.`);
          if (!proceed) return false;
        }
      }
      const result = await moveTreeNode(activeProject.id, node.id, targetFolderId);
      applyFileOperationResult(result, node);
      const targetFolder = targetFolderId ? findNodeById(result.tree, targetFolderId) : null;
      setNotice({
        title: "Elemento movido",
        message: targetFolder ? `"${node.name}" se movió a "${targetFolder.name}".` : `"${node.name}" se movió a la raíz del proyecto.`,
        tone: "info",
      });
      return true;
    } catch (error) {
      showError(error, "No se pudo mover el elemento.");
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
    setActiveUtilityTab(null);
  }

  async function promptImportImage(parentId: string | null) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !activeProject) return;
      try {
        const result = await importProjectImage(activeProject.id, parentId, file);
        setProjectTree(activeProject.id, result.tree);
        handleOpenImage(result.asset.id, result.asset.name, result.asset.path);
      } catch (error) {
        showError(error, "No se pudo importar la imagen.");
      }
    };
    input.click();
  }

  async function promptImportProjectFile(parentId: string | null = null) {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !activeProject) return;
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

      try {
        if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) {
          const result = await importProjectImage(activeProject.id, parentId, file);
          setProjectTree(activeProject.id, result.tree);
          handleOpenImage(result.asset.id, result.asset.name, result.asset.path);
          return;
        }

        const result = await importProjectAttachment(activeProject.id, parentId, file);
        applyFileOperationResult(result);
        if (result.node?.type === "document") {
          openOrReplaceTab(result.node.id, result.node.name);
          return;
        }
        if (result.node?.type === "attachment") {
          setActiveTreeNodeId(result.node.id);
          setNotice({
            title: "Archivo importado",
            message: "Se gestionará en el proyecto sin abrir un visualizador interno.",
            tone: "info",
          });
        }
      } catch (error) {
        showError(error, "No se pudo importar el archivo.");
      }
    };
    input.click();
  }

  async function handleImportProjectImage(parentId: string | null, file: File): Promise<AssetImportResponse> {
    if (!activeProject) throw new Error("No active project");
    const result = await importProjectImage(activeProject.id, parentId, file);
    setProjectTree(activeProject.id, result.tree);
    return result;
  }

  async function handleBuildImageReference(documentId: string, assetId: string, altText?: string | null): Promise<InsertImageReferenceResponse> {
    if (!activeProject) throw new Error("No active project");
    return buildImageReference(activeProject.id, documentId, assetId, altText);
  }

  async function insertImageIntoActiveDocument(assetId: string) {
    if (!activeProject || !activeDocumentId) return;
    try {
      const reference = await buildImageReference(activeProject.id, activeDocumentId, assetId, null);
      const session = documentSessions[activeDocumentId];
      if (!session) return;
      const nextMarkdown = `${session.markdown.trimEnd()}\n\n${reference.markdown}\n`;
      handleMarkdownChange(activeDocumentId, nextMarkdown);
      setNotice({ title: "Imagen insertada", message: reference.asset.name, tone: "info" });
    } catch (error) {
      showError(error, "No se pudo insertar la imagen.");
    }
  }

  function applyFileOperationResult(result: FileOperationResult, sourceNode?: DocumentTreeNode | null) {
    if (activeProject) {
      setProjectTree(activeProject.id, result.tree, {
        additionalOpenPaths: sourceNode?.type === "folder" && sourceNode.open && result.node?.type === "folder" && result.node.path
          ? [result.node.path]
          : [],
      });
      void refreshProjectSyncStatus(activeProject.id, { autoRun: isAutomaticSyncMode(activeProject.syncMode), silent: true });
    } else {
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

    setDocumentSessions((currentSessions) => {
      let nextSessions = { ...currentSessions };
      for (const affectedDocument of result.affectedDocuments) {
        const currentSession = nextSessions[affectedDocument.oldId];
        if (!currentSession) continue;

        delete nextSessions[affectedDocument.oldId];
        if (affectedDocument.newId) {
          nextSessions[affectedDocument.newId] = {
            ...currentSession,
            document: currentSession.document
              ? {
                ...currentSession.document,
                id: affectedDocument.newId,
                name: affectedDocument.name ?? currentSession.document.name,
                path: affectedDocument.path ?? currentSession.document.path,
              }
              : currentSession.document,
            loadVersion: currentSession.loadVersion + 1,
          };
        }
      }
      return nextSessions;
    });

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
  }

  const historyEnabled = Boolean(activeProject && versioningStatus?.enabled);

  return (
    <>
      <DesktopLayout
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
        aiBubble={aiBubble}
        aiAppliedChange={aiAppliedChange}
        aiSelectionFocus={aiSelectionFocus}
        aiContextSources={visibleAiContextSources}
        tree={tree}
        tabs={workspaceTabs}
        activeTabId={activeTabId}
        activeDocumentId={activeDocumentId}
        activeTreeNodeId={activeTreeNodeId}
        activeImageId={activeImageId}
        editorSessions={editorSessions}
        notesMarkdown={notesMarkdown}
        notesUpdatedAt={notesUpdatedAt}
        notesEditorKey={`${NOTES_WORKSPACE_TAB_ID}-${notesLoadVersion}`}
        notesLoaded={notesLoaded}
        notesSaveState={notesSaveState}
        releaseNotesMarkdown={RELEASE_NOTES_MARKDOWN}
        activeDocument={activeSession?.document ?? null}
        activeMarkdown={activeSession?.markdown ?? ""}
        activeDocumentDirty={activeSession?.isDirty ?? false}
        activeDocumentSyncStatus={activeDocumentSyncStatus}
        pendingEditorOperations={pendingEditorOperations}
        activeDocumentConflictStatus={activeSession?.conflictStatus ?? "none"}
        activeDocumentHasRecoveredDraft={activeSession?.hasRecoveredDraft ?? false}
        activeDocumentDiskChanged={activeSession?.diskChanged ?? false}
        dirtyDocumentIds={dirtyDocumentIds}
        orphanDraftCount={orphanDrafts.length}
        isCheckingForUpdates={updateState === "checking"}
        saveState={activeSession?.saveState ?? "idle"}
        historyOpen={historyOpen}
        historyEnabled={historyEnabled}
        versioningStatus={versioningStatus}
        projectSyncStatus={projectSyncStatus}
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
        onConfigureProject={() => {
          if (activeProject) setEditProjectOpen(true);
        }}
        onOpenAppSettings={() => setAppSettingsOpen(true)}
        onCreateFolder={() => void handleCreateFolder()}
        onImportProjectFile={() => void promptImportProjectFile(null)}
        onRenameNode={handleRenameNode}
        onToggleNode={handleToggleNode}
        onExpandTree={handleExpandTree}
        onCollapseTree={handleCollapseTree}
        onCreateDocument={() => {
          setCreateDocumentParentId(null);
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
        onResolveProjectGithubConflict={(resolution) => void handleResolveProjectGithubConflict(resolution)}
        onOpenProjectGithub={() => void handleOpenProjectGithub()}
        onOpenExternalChanges={() => setExternalChangesOpen(true)}
        onCloseExternalChanges={() => setExternalChangesOpen(false)}
        onRefreshExternalChanges={() => void handleRefreshProtectionState(activeProject?.id)}
        onExternalChangeDecision={handleExternalChangeDecision}
        onImportExternalChanges={() => void handleImportExternalChanges()}
        onImportSafeExternalChanges={() => void handleImportExternalChanges({ safeOnly: true })}
        onOmitExternalChanges={handleOmitExternalChanges}
        onRestoreVersion={handleRestoreActiveVersion}
        onSaveActiveDocument={() => handleSave()}
        onDiscardActiveDocumentDraft={handleDiscardActiveDocumentDraft}
        onSendAiPrompt={handleSendAiPrompt}
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
        onAddAiContextSourceToProject={handleAddAiContextSourceToProject}
        onAiIntentAction={handleAiIntentAction}
        onCloseAiBubble={() => setAiBubble(null)}
        onDismissAiAppliedChange={handleDismissAiAppliedChange}
        onOpenAiConversation={() => handleSelectTab(AI_CONVERSATION_TAB_ID)}
        isSyncingProject={syncState !== "idle"}
        onOpenDocument={handleOpenDocument}
        onOpenImage={handleOpenImage}
        onOpenReferenceDocument={handleOpenReferenceDocument}
        onActivateTreeNode={handleActivateTreeNode}
        onSelectTreeNode={handleSelectTreeNode}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onReorderDocumentTabs={handleReorderDocumentTabs}
        onTreeContextAction={handleTreeContextAction}
        onExportDocument={handleExportDocument}
        onMoveTreeNode={handleMoveTreeNodeDrop}
        onImportProjectImage={handleImportProjectImage}
        onBuildImageReference={handleBuildImageReference}
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
        onToggleHistory={() => {
          if (historyEnabled) setHistoryOpen((isOpen) => !isOpen);
        }}
        onCloseHistory={() => setHistoryOpen(false)}
        onLayoutConfigChange={handleLayoutConfigChange}
      />
      <GlobalTooltip />
      <StartupOverlay loading={!configLoaded} />
      <LocalRuntimeRecoveryOverlay
        open={localRuntimeRecoveryOpen}
        error={localRuntimeRecoveryError}
        onRetry={handleRetryLocalRuntimeRecovery}
      />
      <AppNoticeBanner notice={notice} onClose={() => setNotice(null)} />
      <AppSettingsDialog
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
        onClose={() => setAppSettingsOpen(false)}
        onAppearanceChange={handleAppearanceConfigChange}
        onDiagnosticsChange={handleDiagnosticsConfigChange}
        onExportTemplateChange={handleExportTemplateChange}
        onResetExportTemplate={() => void handleResetExportTemplate()}
        onAiChange={handleAiConfigChange}
        onSaveOpenAiKey={(apiKey) => void handleSaveOpenAiKey(apiKey)}
        onDeleteOpenAiKey={() => void handleDeleteOpenAiKey()}
        onRebuildAiIndex={() => void handleRebuildAiIndex()}
        onReindexImages={() => void handleReindexProjectImages()}
        onDeleteAiIndex={() => void handleDeleteAiIndex()}
        onOpenTraceLogFolder={() => void handleOpenTraceLogFolder()}
        onRefreshRuntimeServices={() => void refreshRuntimeServiceStatus()}
      />
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
        onClose={() => {
          setCreateDocumentOpen(false);
          setCreateDocumentParentId(null);
        }}
        onCreate={handleCreateDocument}
      />
      <CreateProjectDialog
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreate={handleCreateProject}
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
      <DocumentFooterActionDialog
        open={documentFooterDialog !== null}
        action={documentFooterDialog}
        documentName={activeSession?.document?.name ?? "documento"}
        onCancel={() => setDocumentFooterDialog(null)}
        onConfirm={() => void confirmDocumentFooterDialog()}
      />
      <MoveDocumentDialog
        open={moveNode !== null}
        node={moveNode}
        folders={moveNode ? collectMoveTargetFolders(tree, moveNode) : collectFolders(tree)}
        onClose={() => setMoveNode(null)}
        onMove={handleMoveNode}
      />
      <CloseDirtyDocumentDialog
        open={closeDocumentId !== null}
        documentName={closeDocumentId ? tabs.find((tab) => tab.id === closeDocumentId)?.name ?? "documento" : ""}
        onCancel={() => setCloseDocumentId(null)}
        onDiscard={() => {
          if (!closeDocumentId) return;
          const documentId = closeDocumentId;
          setCloseDocumentId(null);
          void discardDocumentDraft(documentId)
            .then(() => closeTabNow(documentId))
            .catch((error) => showError(error, "No se pudo descartar el borrador interno."));
        }}
        onSave={() => {
          if (!closeDocumentId) return;
          const documentId = closeDocumentId;
          void handleSave(documentId).then((saved) => {
            setCloseDocumentId(null);
            if (saved) closeTabNow(documentId);
          });
        }}
      />
      <RecoverableDraftsDialog
        open={recoverableDraftsOpen}
        drafts={orphanDrafts}
        onClose={() => setRecoverableDraftsOpen(false)}
        onRefresh={() => void refreshOrphanDrafts()}
        onRestore={(draft) => void handleRestoreOrphanDraft(draft)}
        onDiscard={(draftKey) => void handleDiscardOrphanDraft(draftKey)}
      />
    </>
  );

  async function loadDocumentSession(documentId: string, forceReload = false) {
    setDocumentSessions((currentSessions) => {
      const currentSession = currentSessions[documentId];
      if (currentSession?.isLoading && !forceReload) return currentSessions;
      return {
        ...currentSessions,
        [documentId]: {
          ...createEmptyDocumentSession(currentSession?.loadVersion ?? 0),
          ...currentSession,
          isLoading: true,
          loadVersion: forceReload ? (currentSession?.loadVersion ?? 0) + 1 : currentSession?.loadVersion ?? 0,
        },
      };
    });

    try {
      const record = await getDocument(documentId);
      setDocumentSessions((currentSessions) => {
        const currentSession = currentSessions[documentId];
        return {
          ...currentSessions,
          [documentId]: createLoadedDocumentSession(record, currentSession),
        };
      });
      try {
        const response = await getDocumentsSyncStatus([{ documentId, baseFingerprint: record.baseFingerprint }]);
        setDocumentSyncStatuses((currentStatuses) => ({
          ...currentStatuses,
          ...Object.fromEntries(response.documents.map((status) => [status.documentId, status])),
        }));
      } catch (error) {
        showError(error, "No se pudo comprobar el estado del documento abierto.", {
          source: "app.documentSync.load",
          suppressApiConnectionNotice: true,
        });
      }
    } catch (error) {
      setDocumentSessions((currentSessions) => {
        const { [documentId]: _failedSession, ...nextSessions } = currentSessions;
        return nextSessions;
      });
      showError(error, "No se pudo abrir el documento.");
    }
  }

  async function persistDraft(documentId: string, session: DocumentSession) {
    if (!shouldPersistDraft(session)) return true;
    try {
      const draft = await saveDocumentDraft(documentId, {
        markdown: session.markdown,
        baseFingerprint: session.baseFingerprint,
      });
      setDocumentSessions((currentSessions) => {
        const currentSession = currentSessions[documentId];
        if (!currentSession) return currentSessions;
        return updateSession(currentSessions, documentId, {
          lastDraftMarkdown: session.markdown,
          draftUpdatedAt: draft.draftUpdatedAt,
          hasRecoveredDraft: true,
        });
      });
      return true;
    } catch (error) {
      showError(error, "No se pudo guardar el borrador interno del documento.");
      return false;
    }
  }

  async function persistNotes(markdown: string) {
    setNotesSaveState("saving");
    try {
      const saved = await saveUserNotes(markdown);
      setNotesSavedMarkdown(saved.markdown);
      setNotesUpdatedAt(saved.updatedAt);
      setNotesSaveState("idle");
      return true;
    } catch (error) {
      setNotesSaveState("error");
      showError(error, "No se pudieron guardar las notas automáticamente.", {
        source: "app.notesPersistence",
        suppressApiConnectionNotice: true,
      });
      return false;
    }
  }

  async function flushPendingDrafts() {
    const pendingDrafts = Object.entries(documentSessions).filter(([, session]) => shouldPersistDraft(session));
    const results = await Promise.all(pendingDrafts.map(([documentId, session]) => persistDraft(documentId, session)));
    return results.every(Boolean);
  }

  async function handleLoadDiskVersion() {
    if (!activeDocumentId) return;
    await discardDocumentDraft(activeDocumentId);
    await loadDocumentSession(activeDocumentId, true);
  }

  async function checkOpenDocumentSync() {
    const documents = Object.entries(documentSessions)
      .filter(([, session]) => session.document && !session.isLoading)
      .map(([documentId, session]) => ({
        documentId,
        baseFingerprint: session.baseFingerprint,
      }));
    if (documents.length === 0) return;

    try {
      const response = await getDocumentsSyncStatus(documents);
      setDocumentSyncStatuses((currentStatuses) => ({
        ...currentStatuses,
        ...Object.fromEntries(response.documents.map((status) => [status.documentId, status])),
      }));
      const cleanChangedDocumentIds = response.documents
        .filter((status) => {
          if (!status.diskChanged) return false;
          const session = documentSessions[status.documentId];
          return Boolean(session && !session.isDirty && !session.hasRecoveredDraft && !status.hasDraft);
        })
        .map((status) => status.documentId);

      setDocumentSessions((currentSessions) => {
        let nextSessions = currentSessions;
        for (const status of response.documents) {
          const session = nextSessions[status.documentId];
          if (!session) continue;

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
            patch.diskChanged = false;
            patch.orphaned = false;
            patch.conflictStatus = status.hasDraft ? "draft" : "none";
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
    } catch (error) {
      showError(error, "No se pudo comprobar el estado de sincronización de los documentos.", {
        source: "app.documentSync",
        suppressApiConnectionNotice: true,
      });
    }
  }

  async function refreshOrphanDrafts() {
    try {
      setOrphanDrafts(await listOrphanDrafts());
    } catch (error) {
      showError(error, "No se pudieron cargar los borradores recuperables.", {
        source: "app.orphanDrafts",
        suppressApiConnectionNotice: true,
      });
    }
  }

  async function handleRestoreOrphanDraft(draft: OrphanDraft) {
    try {
      const restored = await restoreOrphanDraft(draft.draftKey);
      setOrphanDrafts((currentDrafts) => currentDrafts.filter((currentDraft) => currentDraft.draftKey !== draft.draftKey));
      if (activeProject?.id === restored.document.projectId) {
        setProjectTree(restored.document.projectId, await getProjectTree(restored.document.projectId));
      }
      openOrReplaceTab(restored.document.id, restored.document.name);
      setDocumentSessions((currentSessions) => ({
        ...currentSessions,
        [restored.document.id]: {
          document: restored.document,
          markdown: restored.document.markdown,
          savedMarkdown: restored.document.markdown,
          isDirty: false,
          isLoading: false,
          saveState: "idle",
          loadVersion: 0,
          lastDraftMarkdown: "",
          baseFingerprint: restored.document.baseFingerprint,
          conflictStatus: "none",
          diskChanged: false,
          orphaned: false,
          hasRecoveredDraft: false,
          draftUpdatedAt: null,
        },
      }));
      setRecoverableDraftsOpen(false);
    } catch (error) {
      showError(error, "No se pudo recrear el archivo desde el borrador.");
    }
  }

  async function handleDiscardOrphanDraft(draftKey: string) {
    try {
      await discardOrphanDraft(draftKey);
      setOrphanDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.draftKey !== draftKey));
    } catch (error) {
      showError(error, "No se pudo descartar el borrador recuperable.");
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
    .filter((operation) => operation.type === "node_deleted" && operation.path)
    .map((operation) => normalizeDocumentPath(operation.path ?? ""));
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

function getTemplateMarkdown(template: string, documentName: string) {
  const title = documentName.replace(/\.md$/i, "").replace(/-/g, " ");

  if (template === "meeting") {
    return `# ${title}\n\n## Información general\n\n## Asistentes\n\n## Acuerdos\n\n- [ ] Nueva tarea\n`;
  }

  if (template === "requirements") {
    return `# ${title}\n\n## Requisitos funcionales\n\n- \n\n## Requisitos no funcionales\n\n- \n`;
  }

  if (template === "decision") {
    return `# ${title}\n\n## Contexto\n\n## Decisión\n\n## Consecuencias\n\n`;
  }

  return `# ${title}\n\n`;
}

function resolveProjectTabs(tabsByProject: Record<string, ProjectTabsConfig>, projectId: string, tree: DocumentTreeNode[]) {
  const configuredTabs = normalizeProjectTabs(tabsByProject[projectId] ?? defaultProjectTabsConfig);
  const knownDocumentIds = new Set(collectDocuments(tree).map((node) => node.id));
  if (knownDocumentIds.size === 0) return { openTabs: [], activeDocumentId: "" };

  const openTabs = configuredTabs.openTabs.filter((tab) => knownDocumentIds.has(tab.id));
  if (openTabs.length > 0) {
    return normalizeProjectTabs({
      openTabs,
      activeDocumentId: knownDocumentIds.has(configuredTabs.activeDocumentId) ? configuredTabs.activeDocumentId : openTabs[0].id,
    });
  }

  return { openTabs: [], activeDocumentId: "" };
}

function normalizeProjectTabs(projectTabs: ProjectTabsConfig): ProjectTabsConfig {
  const seen = new Set<string>();
  const openTabs = projectTabs.openTabs.filter((tab) => {
    if (!tab.id || !tab.name || seen.has(tab.id)) return false;
    seen.add(tab.id);
    return true;
  });

  const normalizedOpenTabs = openTabs;
  const activeDocumentId = normalizedOpenTabs.some((tab) => tab.id === projectTabs.activeDocumentId)
    ? projectTabs.activeDocumentId
    : normalizedOpenTabs[0]?.id ?? "";

  return {
    openTabs: normalizedOpenTabs,
    activeDocumentId,
  };
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

function LocalRuntimeRecoveryOverlay({
  open,
  error,
  onRetry,
}: {
  open: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex min-h-[100dvh] items-center justify-center bg-white px-5 py-6">
      <section className="w-full max-w-[420px]">
        <BrandMark className="h-11 w-11" />
        <div className="mt-6 flex items-center gap-2 text-[11px] font-semibold uppercase text-brand-orange">
          Runtime móvil
        </div>
        <h1 className="mt-2 text-[23px] font-semibold leading-tight text-ink-primary">Runtime local no disponible</h1>
        <p className="mt-3 text-[12px] leading-5 text-ink-secondary">
          Android usa el runtime local de Tauri/Rust para abrir proyectos y documentos sin depender de un ordenador encendido.
        </p>
        <div className="mt-6 rounded-md border border-line bg-panel px-4 py-4">
          <div className="flex items-start gap-3">
            <RefreshCw size={18} className="mt-0.5 shrink-0 text-brand-orange" strokeWidth={2} />
            <div>
              <div className="text-[12px] font-semibold text-ink-primary">Contrato Tauri local</div>
              <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
                KnowNext.ai {APP_VERSION} usa solo el runtime Tauri/Rust integrado en Android. Reintenta el arranque para volver a inicializarlo.
              </p>
            </div>
          </div>
        </div>
        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-[11px] leading-5 text-red-700" role="alert">
            {error}
          </div>
        ) : null}
        <button
          type="button"
          className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-orange px-4 text-[12px] font-semibold text-white transition hover:bg-brand-orange-dark"
          onClick={onRetry}
        >
          <RefreshCw size={15} />
          Reintentar runtime local
        </button>
      </section>
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
  if (first.openTabs.length !== second.openTabs.length) return false;

  return first.openTabs.every((tab, index) => {
    const otherTab = second.openTabs[index];
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

function markNodeEditing(nodes: DocumentTreeNode[], nodeId: string | null): DocumentTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    isEditing: node.id === nodeId,
    children: node.children ? markNodeEditing(node.children, nodeId) : node.children,
  }));
}

function collectDocuments(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.flatMap((node) => {
    if (node.type === "document") return [node];
    return node.children ? collectDocuments(node.children) : [];
  });
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
