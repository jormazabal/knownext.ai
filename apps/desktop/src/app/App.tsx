import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { DocumentTreeAction } from "../features/documents/DocumentTree";
import type { MarkdownEditorExternalOperation, MarkdownEditorSelection } from "../features/editor/editorTypes";
import type { AiPromptExecutionOptions } from "../features/assistant/AiPromptInput";
import { CreateDocumentDialog } from "../features/documents/CreateDocumentDialog";
import { CreateProjectDialog } from "../features/projects/CreateProjectDialog";
import { AppSettingsDialog } from "../features/settings/AppSettingsDialog";
import { BrandMark } from "../components/brand/BrandMark";
import { GlobalTooltip } from "../components/ui/GlobalTooltip";
import { DesktopLayout } from "../layouts/DesktopLayout";
import {
  applyExternalMarkdownUpdate,
  countWords,
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
  defaultLayoutConfig,
  defaultProjectTabsConfig,
  getAppConfig,
  getAiConfig,
  readLocalAppPreferences,
  updateAppConfig,
  updateAiConfig,
  writeLocalAppPreferences,
} from "../lib/api/config";
import {
  clearAiConversation,
  confirmAiDelete,
  deleteAiIndex,
  deleteOpenAiKey,
  addAiContextSourceToProject,
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
  uploadAiContextFiles,
} from "../lib/api/ai";
import { API_BASE_URL, ApiError, getApiErrorMessage, isApiConnectionError, isBackendEnabled, waitForApiReady } from "../lib/api/client";
import {
  discardDocumentDraft,
  discardOrphanDraft,
  getDocument,
  getDocumentsSyncStatus,
  listOrphanDrafts,
  restoreOrphanDraft,
  saveDocument,
  saveDocumentDraft,
} from "../lib/api/documents";
import { APP_VERSION } from "../lib/appVersion";
import { RELEASE_NOTES_MARKDOWN } from "../lib/releaseNotes";
import { getAuthStatus, logout as logoutGithub, pollGithubDeviceFlow, startGithubDeviceFlow } from "../lib/api/auth";
import { listGithubRepositories } from "../lib/api/github";
import { createProjectVersion } from "../lib/api/versions";
import {
  checkForUpdate,
  getUpdaterStatus,
  installUpdate,
  type AvailableUpdate,
  type UpdateDownloadProgress,
} from "../lib/runtime/updater";
import { getTraceLogStatus, openTraceLogFolder, recordTraceLog, type TraceLogStatus } from "../lib/runtime/logging";
import { openExternalUrl } from "../lib/runtime/links";
import { getRuntimeServiceStatus, restartBackendService, updateBackendPortConfig, type BackendPortConfig, type RuntimeServicesStatus } from "../lib/runtime/services";
import { applyAppearanceAttributes, useResolvedAppearanceTheme } from "../lib/theme/appearance";
import { ArchiveRestore, FileWarning, RefreshCw, Trash2, X } from "lucide-react";
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
  DiagnosticsConfig,
  AssetImportResponse,
  DocumentRecord,
  DocumentTreeNode,
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
  WorkspaceTab,
} from "../types/domain";
import {
  ensureReleaseNotesTab,
  RELEASE_NOTES_UTILITY_TAB_ID,
  RELEASE_NOTES_WORKSPACE_TAB_ID,
  removeReleaseNotesTab,
  shouldOpenReleaseNotesAfterStartup,
} from "./releaseNotesState";

type AppNotice = {
  title: string;
  message: string;
  tone: "error" | "info";
};

type UpdateState = "idle" | "checking" | "available" | "not-available" | "unsupported" | "downloading" | "installing" | "error";
type GithubLoginState = "idle" | "starting" | "waiting" | "authenticated" | "error";
const AI_CONVERSATION_TAB_ID = "project-ai-conversation" as const;

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ isAuthenticated: false, provider: null, user: null, scopes: [] });
  const [projectCapabilities, setProjectCapabilities] = useState<ProjectCapabilities | null>(null);
  const [versioningStatus, setVersioningStatus] = useState<ProjectVersioningStatus | null>(null);
  const [tree, setTree] = useState<DocumentTreeNode[]>([]);
  const [tabs, setTabs] = useState<OpenDocumentTab[]>(defaultProjectTabsConfig.openTabs);
  const [activeDocumentId, setActiveDocumentId] = useState(defaultProjectTabsConfig.activeDocumentId);
  const [imageTabs, setImageTabs] = useState<Array<{ id: string; name: string; path: string }>>([]);
  const [activeImageId, setActiveImageId] = useState("");
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
  const [aiConfig, setAiConfig] = useState<AiConfigStatus>({ ...defaultAiConfig, openaiKeyConfigured: false, openaiKeyPreview: null });
  const aiConfigSaveSequence = useRef(0);
  const [aiConversationEvents, setAiConversationEvents] = useState<AiConversationEvent[]>([]);
  const [aiContextSources, setAiContextSources] = useState<AiContextSource[]>([]);
  const [aiIndexStatus, setAiIndexStatus] = useState<AiIndexStatusResponse | null>(null);
  const [aiUsageSummary, setAiUsageSummary] = useState<AiUsageSummaryResponse | null>(null);
  const [aiPendingDelete, setAiPendingDelete] = useState<AiPendingDelete | null>(null);
  const [aiPendingIntent, setAiPendingIntent] = useState<AiPendingIntent | null>(null);
  const [aiBubble, setAiBubble] = useState<{ id: string; answer: string } | null>(null);
  const [aiAppliedChange, setAiAppliedChange] = useState<{ documentId: string; summary: string } | null>(null);
  const [aiSelectionFocus, setAiSelectionFocus] = useState<AiSelectionFocus | null>(null);
  const [pendingEditorOperations, setPendingEditorOperations] = useState<MarkdownEditorExternalOperation[]>([]);
  const [tabsByProject, setTabsByProject] = useState<Record<string, ProjectTabsConfig>>({});
  const [openUtilityTabs, setOpenUtilityTabs] = useState<AppUtilityTabId[]>([]);
  const [activeUtilityTab, setActiveUtilityTab] = useState<AppUtilityTabId | null>(null);
  const [lastRunAppVersion, setLastRunAppVersion] = useState<string | null>(null);
  const [lastSeenReleaseNotesVersion, setLastSeenReleaseNotesVersion] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configPersistenceAvailable, setConfigPersistenceAvailable] = useState(true);
  const [notice, setNotice] = useState<AppNotice | null>(null);
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
  const lastTraceLogRef = useRef<{ fingerprint: string; timestamp: number } | null>(null);
  const githubLoginPollingRef = useRef(false);
  const lastDocumentContextRef = useRef<{ id: string | null; path: string | null }>({ id: null, path: null });
  const resolvedTheme = useResolvedAppearanceTheme(appearanceConfig.themeMode);

  useEffect(() => {
    void (async () => {
      const localPreferences = readLocalAppPreferences();
      try {
        await waitForApiReady();
        const [projectList, appConfig, auth, capabilities, loadedAiConfig, loadedAiUsageSummary] = await Promise.all([
          listProjects(),
          getAppConfig(),
          getAuthStatus(),
          getProjectCapabilities(),
          getAiConfig(),
          loadAiUsageSummary("app.startup.aiUsageSummary"),
        ]);
        const active = projectList.find((project) => project.active) ?? projectList[0];
        let projectTree: DocumentTreeNode[] = [];
        let activeVersioningStatus: ProjectVersioningStatus | null = null;
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
        setTree(projectTree);
        setLayoutConfig(appConfig.layout);
        setAppearanceConfig(appConfig.appearance ?? defaultAppearanceConfig);
        setDiagnosticsConfig(appConfig.diagnostics ?? defaultDiagnosticsConfig);
        setAiConfig(loadedAiConfig);
        setAiUsageSummary(loadedAiUsageSummary);
        setConfigPersistenceAvailable(true);
        setTabsByProject(appConfig.tabsByProject);
        setOpenUtilityTabs(nextOpenUtilityTabs);
        setActiveUtilityTab(shouldOpenReleaseNotes ? RELEASE_NOTES_UTILITY_TAB_ID : appConfig.activeUtilityTab ?? null);
        setLastRunAppVersion(APP_VERSION);
        setLastSeenReleaseNotesVersion(appConfig.lastSeenReleaseNotesVersion ?? null);
        setTabs(activeProjectTabs.openTabs);
        setActiveDocumentId(activeProjectTabs.activeDocumentId);
      } catch (error) {
        void recordTraceLog({
          source: "app.startup",
          message: getApiErrorMessage(error, "La aplicación no pudo cargar la configuración inicial."),
          detail: describeError(error),
        });
        setNotice({
          title: "No se pudo iniciar KnowNext.ai",
          message: getApiErrorMessage(error, "La aplicación no pudo cargar la configuración inicial."),
          tone: "error",
        });
        setProjects([]);
        setActiveProject(null);
        setVersioningStatus(null);
        setTree([]);
        setTabs([]);
        setActiveDocumentId("");
        setAppearanceConfig(localPreferences.appearance ?? defaultAppearanceConfig);
        setDiagnosticsConfig(localPreferences.diagnostics ?? defaultDiagnosticsConfig);
        setAiConfig({ ...(localPreferences.ai ?? defaultAiConfig), openaiKeyConfigured: false, openaiKeyPreview: null });
        setAiUsageSummary(null);
        setConfigPersistenceAvailable(false);
        setOpenUtilityTabs([]);
        setActiveUtilityTab(null);
      } finally {
        setConfigLoaded(true);
      }
    })();
  }, []);

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
      setAiConversationEvents([]);
      setAiContextSources([]);
      setAiIndexStatus(null);
      return;
    }
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

    const interval = window.setInterval(() => {
      void handlePollGithubLogin();
    }, Math.max(githubDevice.interval, 1) * 1000);

    return () => window.clearInterval(interval);
  }, [githubDevice, githubLoginOpen, githubLoginState]);

  useEffect(() => {
    function handlePageHide() {
      if (!isBackendEnabled()) return;

      for (const [documentId, session] of Object.entries(documentSessions)) {
        if (!shouldPersistDraft(session)) continue;
        void fetch(`${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown: session.markdown, baseFingerprint: session.baseFingerprint }),
          keepalive: true,
        });
      }
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [documentSessions]);

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
    setAiSelectionFocus((currentSelection) => (
      currentSelection && currentSelection.documentId !== activeDocumentId ? null : currentSelection
    ));
  }, [activeDocumentId]);

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

  const workspaceTabs = useMemo<WorkspaceTab[]>(() => [
    ...(activeProject
      ? [{
        kind: "ai-conversation" as const,
        id: AI_CONVERSATION_TAB_ID,
        name: "IA" as const,
        readonly: true as const,
      }]
      : []),
    ...tabs.map((tab) => ({ ...tab, kind: "document" as const })),
    ...imageTabs.map((tab) => ({ ...tab, kind: "image" as const })),
    ...(openUtilityTabs.includes(RELEASE_NOTES_UTILITY_TAB_ID)
      ? [{
        kind: "release-notes" as const,
        id: RELEASE_NOTES_WORKSPACE_TAB_ID,
        name: "Notas de release" as const,
        utilityTabId: RELEASE_NOTES_UTILITY_TAB_ID,
        readonly: true as const,
      }]
      : []),
  ], [activeProject, imageTabs, openUtilityTabs, tabs]);
  const activeTabId = activeUtilityTab === RELEASE_NOTES_UTILITY_TAB_ID ? RELEASE_NOTES_WORKSPACE_TAB_ID : activeImageId || activeDocumentId || (activeProject ? AI_CONVERSATION_TAB_ID : "");
  const activeSession = activeDocumentId ? documentSessions[activeDocumentId] : undefined;
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

  function handleOpenDocument(documentId: string, name: string) {
    setTabs((currentTabs) => (
      currentTabs.some((tab) => tab.id === documentId)
        ? currentTabs
        : [...currentTabs, { id: documentId, name }]
    ));
    setActiveDocumentId(documentId);
    setActiveImageId("");
    setActiveUtilityTab(null);
  }

  function handleOpenImage(assetId: string, name: string, path: string) {
    setImageTabs((currentTabs) => (
      currentTabs.some((tab) => tab.id === assetId)
        ? currentTabs.map((tab) => (tab.id === assetId ? { id: assetId, name, path } : tab))
        : [...currentTabs, { id: assetId, name, path }]
    ));
    setActiveImageId(assetId);
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

    const documentId = tabId;
    if (documentSessions[documentId]?.isDirty) {
      setCloseDocumentId(documentId);
      return;
    }
    closeTabNow(documentId);
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
      setActiveDocumentId(nextTabs[0]?.id ?? "");
    }
  }

  function handleSelectTab(tabId: string) {
    if (tabId === AI_CONVERSATION_TAB_ID) {
      if (activeDocumentId && documentSessions[activeDocumentId]) {
        void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
      }
      setActiveUtilityTab(null);
      setActiveImageId("");
      setActiveDocumentId("");
      return;
    }

    if (tabId === RELEASE_NOTES_WORKSPACE_TAB_ID) {
      setOpenUtilityTabs((currentTabs) => ensureReleaseNotesTab(currentTabs));
      setActiveUtilityTab(RELEASE_NOTES_UTILITY_TAB_ID);
      setActiveImageId("");
      return;
    }

    if (imageTabs.some((tab) => tab.id === tabId)) {
      if (activeDocumentId && documentSessions[activeDocumentId]) {
        void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
      }
      setActiveUtilityTab(null);
      setActiveImageId(tabId);
      return;
    }

    const documentId = tabId;
    if (activeDocumentId && documentSessions[activeDocumentId]) {
      void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
    }
    setActiveUtilityTab(null);
    setActiveImageId("");
    setActiveDocumentId(documentId);
  }

  function handleOpenReleaseNotes() {
    setOpenUtilityTabs((currentTabs) => ensureReleaseNotesTab(currentTabs));
    setActiveUtilityTab(RELEASE_NOTES_UTILITY_TAB_ID);
  }

  function handleMarkdownChange(documentId: string, nextMarkdown: string) {
    setDocumentSessions((currentSessions) => {
      const session = currentSessions[documentId];
      if (!session) return currentSessions;
      return {
        ...currentSessions,
        [documentId]: {
          ...session,
          markdown: nextMarkdown,
          isDirty: nextMarkdown !== session.savedMarkdown,
          saveState: "idle",
          document: session.document ? { ...session.document, wordCount: countWords(nextMarkdown) } : session.document,
        },
      };
    });
  }

  function handleEditorOperationApplied(operationId: string) {
    setPendingEditorOperations((currentOperations) => currentOperations.filter((operation) => operation.id !== operationId));
  }

  function handleEditorOperationFailed(operation: MarkdownEditorExternalOperation) {
    setPendingEditorOperations((currentOperations) => currentOperations.filter((currentOperation) => currentOperation.id !== operation.id));
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
    const hasDocumentContext = Boolean(activeDocumentId && activeSession?.document);
    if (hasDocumentContext && (activeSession?.conflictStatus === "disk-changed" || activeSession?.orphaned || activeSession?.conflictStatus === "missing")) {
      setAiBubble({ id: `local-${Date.now()}`, answer: "Resuelve el conflicto del documento antes de aplicar cambios con IA." });
      return;
    }

    setAiBubble(null);
    try {
      const response = await sendAiInteraction({
        projectId: activeProject.id,
        documentId: hasDocumentContext ? activeDocumentId : null,
        prompt,
        activeMarkdown: hasDocumentContext ? activeSession?.markdown ?? "" : "",
        selectionFocus: hasDocumentContext && selectionFocus?.documentId === activeDocumentId ? selectionFocus : null,
        clientContext: {
          lastDocumentId: lastDocumentContextRef.current.id,
          lastDocumentPath: lastDocumentContextRef.current.path,
        },
        executionMode: options?.executionMode ?? "quick",
        reasoningDepth: options?.reasoningDepth ?? "light",
        mode: hasDocumentContext ? "document" : "project",
        clientMessageId: `client-${Date.now()}`,
        contextSourceIds: aiContextSources.filter((source) => source.status !== "error" && source.status !== "processing").map((source) => source.id),
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
      if (documentId.startsWith("fs_") && findNodeById(tree, documentId)?.type === "image") {
        await addProjectImageAiContextSource(activeProject.id, documentId);
      } else {
        await addProjectDocumentAiContextSource(activeProject.id, documentId);
      }
      await refreshAiContextSources(activeProject.id);
    } catch (error) {
      showError(error, "No se pudo añadir el documento al contexto IA.", { source: "app.aiContext.addDocument" });
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

  async function handleRemoveAiContextSource(sourceId: string) {
    if (!activeProject) return;
    try {
      const response = await removeAiContextSource(activeProject.id, sourceId);
      setAiContextSources(response.sources);
    } catch (error) {
      showError(error, "No se pudo quitar la fuente del contexto IA.", { source: "app.aiContext.remove" });
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
      if (result.tree) setTree(result.tree);
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
    } else if (response.tree) {
      setTree(response.tree);
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
    if (documentId !== activeDocumentId) return;
    if (!selection) {
      setAiSelectionFocus((currentSelection) => (currentSelection?.documentId === documentId ? null : currentSelection));
      return;
    }

    setAiSelectionFocus({
      documentId,
      path: documentSessions[documentId]?.document?.path ?? null,
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
        setTree(await getProjectTree(saved.projectId));
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
      const nextVersioningStatus = await getProjectVersioningStatus(active.id);
      const nextProjectTabs = resolveProjectTabs(tabsByProject, active.id, nextTree);
      setProjects((currentProjects) => currentProjects.map((currentProject) => ({
        ...currentProject,
        active: currentProject.id === active.id,
      })));
      setActiveProject(active);
      setVersioningStatus(nextVersioningStatus);
      setTree(nextTree);
      setTabs(nextProjectTabs.openTabs);
      setActiveDocumentId(nextProjectTabs.activeDocumentId);
      setImageTabs([]);
      setActiveImageId("");
      if (!nextVersioningStatus.enabled) setHistoryOpen(false);
    } catch (error) {
      showError(error, "No se pudo cambiar de proyecto.");
    }
  }

  async function handleCreateFolder(parentId: string | null = null) {
    if (!activeProject) return;
    try {
      const result = await createFolder(activeProject.id, parentId, getUniqueFolderName(tree));
      setTree(markNodeEditing(result.tree, result.node?.id ?? null));
    } catch (error) {
      showError(error, "No se pudo crear la carpeta.");
    }
  }

  async function handleRenameNode(nodeId: string, name: string) {
    if (!activeProject) return;
    const nextName = name.trim() || "Nueva carpeta";
    const previousNode = findNodeById(tree, nodeId);
    if (previousNode?.name === nextName) {
      setTree((currentTree) => renameNode(currentTree, nodeId, nextName));
      return;
    }

    try {
      if (previousNode?.type === "image") {
        const usage = await getProjectImageUsage(activeProject.id, previousNode.id);
        if (usage.references.length > 0) {
          const proceed = window.confirm(`La imagen "${previousNode.name}" esta enlazada en ${usage.references.length} documento(s).\n\nKnowNext.ai actualizara las referencias relativas para que sigan apuntando a la imagen renombrada.`);
          if (!proceed) {
            setTree(markNodeEditing(tree, null));
            return;
          }
        }
      }
      const result = await renameTreeNode(activeProject.id, nodeId, nextName);
      applyFileOperationResult(result, previousNode);
    } catch (error) {
      showError(error, "No se pudo renombrar el elemento.");
      setTree(markNodeEditing(tree, null));
    }
  }

  function handleToggleNode(nodeId: string) {
    setTree((currentTree) => toggleNodeOpen(currentTree, nodeId));
  }

  function handleExpandTree() {
    setTree((currentTree) => setAllFoldersOpen(currentTree, true));
  }

  function handleCollapseTree() {
    setTree((currentTree) => setAllFoldersOpen(currentTree, false));
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
      const nextProjectTabs = resolveProjectTabs({}, nextProject.id, nextTree);
      setActiveProject(nextProject);
      setTree(nextTree);
      setTabs(nextProjectTabs.openTabs);
      setActiveDocumentId(nextProjectTabs.activeDocumentId);
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
      const updatedProject = await updateProject(projectId, project);
      setProjects((currentProjects) => currentProjects.map((currentProject) => (
        currentProject.id === projectId ? updatedProject : currentProject
      )));
      setActiveProject((currentProject) => (
        currentProject?.id === projectId ? updatedProject : currentProject
      ));
      if (activeProject?.id === projectId) {
        const nextTree = await getProjectTree(projectId);
        const nextVersioningStatus = await getProjectVersioningStatus(projectId);
        setTree(nextTree);
        setVersioningStatus(nextVersioningStatus);
        const nextProjectTabs = resolveProjectTabs(tabsByProject, projectId, nextTree);
        setTabs(nextProjectTabs.openTabs);
        setActiveDocumentId(nextProjectTabs.activeDocumentId);
        if (!nextVersioningStatus.enabled) setHistoryOpen(false);
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
      setEditProjectOpen(false);

      if (!nextActiveProject) {
        setActiveProject(null);
        setVersioningStatus(null);
        setTree([]);
        setTabs([]);
        setActiveDocumentId("");
        setDocumentSessions({});
        setHistoryOpen(false);
        return;
      }

      const nextTree = await getProjectTree(nextActiveProject.id);
      const nextVersioningStatus = await getProjectVersioningStatus(nextActiveProject.id);
      const nextProjectTabs = resolveProjectTabs(tabsByProject, nextActiveProject.id, nextTree);
      setActiveProject(nextActiveProject);
      setVersioningStatus(nextVersioningStatus);
      setTree(nextTree);
      setTabs(nextProjectTabs.openTabs);
      setActiveDocumentId(nextProjectTabs.activeDocumentId);
      if (!nextVersioningStatus.enabled) setHistoryOpen(false);
    } catch (error) {
      showError(error, "No se pudo eliminar el proyecto.");
    }
  }

  async function handleOpenGithubLogin() {
    setGithubLoginOpen(true);
    if (!githubDevice && githubLoginState === "idle") {
      await handleStartGithubLogin();
    }
  }

  async function handleStartGithubLogin() {
    setGithubLoginState("starting");
    setGithubLoginError(null);
    try {
      const device = await startGithubDeviceFlow();
      setGithubDevice(device);
      setGithubLoginState("waiting");
    } catch (error) {
      setGithubLoginState("error");
      setGithubLoginError(getApiErrorMessage(error, "No se pudo iniciar el login con GitHub."));
    }
  }

  async function handlePollGithubLogin() {
    if (!githubDevice || githubLoginPollingRef.current) return;
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

  async function handleLogoutGithub() {
    try {
      const auth = await logoutGithub();
      setAuthStatus(auth);
      setHistoryOpen(false);
      await refreshProjectCapabilityState();
    } catch (error) {
      showError(error, "No se pudo cerrar sesión de GitHub.");
    }
  }

  async function handlePullProject() {
    if (!activeProject || syncState !== "idle") return;
    setSyncState("pulling");
    try {
      const response = await pullProject(activeProject.id);
      setTree(await getProjectTree(activeProject.id));
      await refreshProjectCapabilityState(activeProject.id);
      setNotice({ title: "Sincronización completada", message: response.message, tone: "info" });
    } catch (error) {
      showError(error, "No se pudo traer cambios del proveedor remoto.");
    } finally {
      setSyncState("idle");
    }
  }

  async function handlePushProject() {
    if (!activeProject || syncState !== "idle") return;
    setSyncState("pushing");
    try {
      const response = await pushProject(activeProject.id);
      await refreshProjectCapabilityState(activeProject.id);
      setNotice({ title: "Sincronización completada", message: response.message, tone: "info" });
    } catch (error) {
      showError(error, "No se pudieron enviar cambios al proveedor remoto.");
    } finally {
      setSyncState("idle");
    }
  }

  async function handleCreateActiveVersion(title: string): Promise<CreateVersionResponse | null> {
    if (!activeProject || !activeDocumentId) return null;
    const session = documentSessions[activeDocumentId];
    if (session?.isDirty) {
      const saved = await handleSave(activeDocumentId);
      if (!saved) return null;
    }
    try {
      const response = await createProjectVersion(activeProject.id, activeDocumentId, title);
      await refreshProjectCapabilityState(activeProject.id);
      return response;
    } catch (error) {
      showError(error, "No se pudo crear la versión del documento.");
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
      showError(error, "No se pudo reindexar las imagenes para IA.", { source: "app.aiImageIndex" });
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
        if (!hasUnavailableBackend(nextStatus)) runtimeServiceSilentFailuresRef.current = 0;
        return nextStatus;
      });
    } catch (error) {
      if (!options?.silent) showError(error, "No se pudo consultar el estado de los servicios.");
    } finally {
      if (!options?.silent) setRuntimeServicesRefreshing(false);
    }
  }

  async function handleRestartBackendService() {
    setRuntimeServicesRefreshing(true);
    try {
      setRuntimeServicesStatus(await restartBackendService());
    } catch (error) {
      showError(error, "No se pudo reiniciar el backend local.", { source: "app.runtimeServices" });
      await refreshRuntimeServiceStatus({ silent: true });
    } finally {
      setRuntimeServicesRefreshing(false);
    }
  }

  async function handleUpdateBackendPortConfig(config: BackendPortConfig) {
    setRuntimeServicesRefreshing(true);
    try {
      const status = await updateBackendPortConfig(config);
      setRuntimeServicesStatus(status);
      await waitForApiReady({ attempts: 8, intervalMs: 250 });
    } catch (error) {
      const message = describeError(error);
      setNotice({
        title: "No se pudo aplicar la configuración del backend",
        message,
        tone: "error",
      });
      await refreshRuntimeServiceStatus();
      void recordTraceLog({
        source: "app.runtime.updateBackendPortConfig",
        message: "No se pudo aplicar la configuración de puerto del backend.",
        detail: message,
      });
    } finally {
      setRuntimeServicesRefreshing(false);
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
    if (action === "rename") {
      setTree((currentTree) => markNodeEditing(currentTree, node.id));
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

    if (action === "open-image" && node.path) {
      handleOpenImage(node.id, node.name, node.path);
      return;
    }

    if (action === "add-image-context") {
      void handleAddProjectImageContext(node.id);
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

  async function handleDeleteNode(node: DocumentTreeNode) {
    if (!activeProject) return;
    let message = node.type === "folder"
      ? `Se eliminará la carpeta "${node.name}" y su contenido del disco. Esta acción no se puede deshacer.`
      : node.type === "image"
        ? `Se eliminará la imagen "${node.name}" del disco. Esta acción no se puede deshacer.`
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
          const proceed = window.confirm(`${impact.message}${shared}\n\nKnowNext.ai actualizara las referencias relativas para mantener las imagenes enlazadas.`);
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
        setTree(result.tree);
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
    input.accept = ".md,.markdown,text/markdown,image/png,image/jpeg,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !activeProject) return;
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

      try {
        if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) {
          const result = await importProjectImage(activeProject.id, parentId, file);
          setTree(result.tree);
          handleOpenImage(result.asset.id, result.asset.name, result.asset.path);
          return;
        }

        if (["md", "markdown"].includes(extension)) {
          const markdown = await file.text();
          const result = await createProjectDocument(activeProject.id, parentId, file.name, markdown);
          applyFileOperationResult(result);
          if (result.node?.type === "document") openOrReplaceTab(result.node.id, result.node.name);
          return;
        }

        setNotice({
          title: "Formato no admitido",
          message: "Solo se pueden importar documentos Markdown e imágenes compatibles.",
          tone: "info",
        });
      } catch (error) {
        showError(error, "No se pudo importar el archivo.");
      }
    };
    input.click();
  }

  async function handleImportProjectImage(parentId: string | null, file: File): Promise<AssetImportResponse> {
    if (!activeProject) throw new Error("No active project");
    const result = await importProjectImage(activeProject.id, parentId, file);
    setTree(result.tree);
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
    setTree(result.tree);

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
      return;
    }

    if (activeChange && !activeChange.newId) {
      const firstDocument = findFirstDocument(result.tree);
      setActiveDocumentId(firstDocument?.id ?? "");
      setTabs((currentTabs) => currentTabs.length > 0 ? currentTabs : firstDocument ? [{ id: firstDocument.id, name: firstDocument.name }] : []);
    }
  }

  const historyEnabled = Boolean(activeProject && authStatus.isAuthenticated && versioningStatus?.enabled);

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
        aiContextSources={aiContextSources}
        tree={tree}
        tabs={workspaceTabs}
        activeTabId={activeTabId}
        activeDocumentId={activeDocumentId}
        activeImageId={activeImageId}
        editorSessions={editorSessions}
        releaseNotesMarkdown={RELEASE_NOTES_MARKDOWN}
        activeDocument={activeSession?.document ?? null}
        activeMarkdown={activeSession?.markdown ?? ""}
        activeDocumentDirty={activeSession?.isDirty ?? false}
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
        onCreateVersion={handleCreateActiveVersion}
        onSendAiPrompt={handleSendAiPrompt}
        onAiTranscriptionChange={handleAiTranscriptionChange}
        onClearAiSelectionFocus={() => setAiSelectionFocus(null)}
        onSearchAiContextDocuments={handleSearchAiContextDocuments}
        onAddProjectDocumentContext={handleAddProjectDocumentContext}
        onAddProjectImageContext={handleAddProjectImageContext}
        onUploadAiContextFiles={handleUploadAiContextFiles}
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
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onTreeContextAction={handleTreeContextAction}
        onMoveTreeNode={handleMoveTreeNodeDrop}
        onImportProjectImage={handleImportProjectImage}
        onBuildImageReference={handleBuildImageReference}
        onInsertImageIntoActiveDocument={(assetId) => void insertImageIntoActiveDocument(assetId)}
        onMarkdownChange={handleMarkdownChange}
        onEditorOperationApplied={handleEditorOperationApplied}
        onEditorOperationFailed={handleEditorOperationFailed}
        onDocumentSelectionChange={handleDocumentSelectionChange}
        onSave={() => void handleSave()}
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
      <AppNoticeBanner notice={notice} onClose={() => setNotice(null)} />
      <AppSettingsDialog
        open={appSettingsOpen}
        appearance={appearanceConfig}
        diagnostics={diagnosticsConfig}
        ai={aiConfig}
        aiIndexStatus={aiIndexStatus}
        traceLogStatus={traceLogStatus}
        runtimeServicesStatus={runtimeServicesStatus}
        runtimeServicesRefreshing={runtimeServicesRefreshing}
        onClose={() => setAppSettingsOpen(false)}
        onAppearanceChange={handleAppearanceConfigChange}
        onDiagnosticsChange={handleDiagnosticsConfigChange}
        onAiChange={handleAiConfigChange}
        onSaveOpenAiKey={(apiKey) => void handleSaveOpenAiKey(apiKey)}
        onDeleteOpenAiKey={() => void handleDeleteOpenAiKey()}
        onRebuildAiIndex={() => void handleRebuildAiIndex()}
        onReindexImages={() => void handleReindexProjectImages()}
        onDeleteAiIndex={() => void handleDeleteAiIndex()}
        onOpenTraceLogFolder={() => void handleOpenTraceLogFolder()}
        onRefreshRuntimeServices={() => void refreshRuntimeServiceStatus()}
        onRestartBackendService={() => void handleRestartBackendService()}
        onUpdateBackendPortConfig={(config) => void handleUpdateBackendPortConfig(config)}
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
        onClose={() => setGithubLoginOpen(false)}
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
        onLoginGithub={() => void handleOpenGithubLogin()}
        onRefreshGithubRepositories={() => void refreshGithubRepositories()}
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
        setTree(await getProjectTree(restored.document.projectId));
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

function hasUnavailableBackend(status: RuntimeServicesStatus | null) {
  return status?.services.some((service) => service.id === "backend" && service.status === "unavailable") ?? false;
}

function hasAvailableBackend(status: RuntimeServicesStatus | null) {
  return status?.services.some((service) => service.id === "backend" && service.status !== "unavailable") ?? false;
}

function shouldKeepCurrentRuntimeStatus(
  currentStatus: RuntimeServicesStatus | null,
  nextStatus: RuntimeServicesStatus,
  silentFailuresRef: MutableRefObject<number>,
) {
  if (!hasAvailableBackend(currentStatus) || !hasUnavailableBackend(nextStatus)) {
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

function AppNoticeBanner({ notice, onClose }: { notice: AppNotice | null; onClose: () => void }) {
  if (!notice) return null;

  const toneClasses = notice.tone === "error"
    ? { border: "border-red-200", dot: "bg-red-600" }
    : { border: "border-orange-200", dot: "bg-brand-orange" };

  return (
    <div className={["fixed right-5 top-[70px] z-[100] w-[380px] rounded-lg border bg-white p-4 shadow-menu", toneClasses.border].join(" ")}>
      <div className="flex items-start gap-3">
        <span className={["mt-1 h-2 w-2 shrink-0 rounded-full", toneClasses.dot].join(" ")} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-ink-primary">{notice.title}</p>
          <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{notice.message}</p>
        </div>
        <button className="rounded px-2 py-1 text-[11px] text-ink-secondary hover:bg-panel" onClick={onClose}>
          Cerrar
        </button>
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

function GithubLoginDialog({
  open,
  state,
  device,
  error,
  polling,
  onClose,
  onStart,
  onOpenGithub,
  onPoll,
}: {
  open: boolean;
  state: GithubLoginState;
  device: GithubDeviceStartResponse | null;
  error: string | null;
  polling: boolean;
  onClose: () => void;
  onStart: () => void;
  onOpenGithub: () => void;
  onPoll: () => void;
}) {
  if (!open) return null;

  const busy = state === "starting";
  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[95] grid place-items-center bg-black/20">
      <section className="w-[460px] rounded-lg border border-line bg-white shadow-menu">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">Conectar GitHub</h2>
          <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
            La cuenta GitHub activa el historial versionado, la sincronización manual y los proyectos conectados a repositorios.
          </p>
        </header>
        <div className="space-y-4 px-5 py-5 text-[11px] text-ink-secondary">
          {device ? (
            <>
              <div className="rounded-md border border-line bg-panel px-3 py-3">
                <div className="text-[10px] uppercase text-ink-secondary">Código de verificación</div>
                <div className="mt-1 font-mono text-[22px] font-semibold tracking-normal text-ink-primary">{device.userCode}</div>
              </div>
              <p>Abre GitHub, introduce el código y vuelve aquí para confirmar la conexión.</p>
              <p>KnowNext.ai comprobará la autorización automáticamente cada {Math.max(device.interval, 1)} s.</p>
              {device.mock ? (
                <p className="rounded-md border border-orange-200 bg-brand-hover px-3 py-2">
                  Modo desarrollo: no hay `KNOWNEXT_GITHUB_CLIENT_ID`, así que la autorización se completará con una cuenta mock.
                </p>
              ) : null}
            </>
          ) : (
            <p>Inicia el flujo de dispositivo para autorizar KnowNext.ai desde GitHub.</p>
          )}
          {error ? <p className="text-red-700">{error}</p> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onClose}>
            Cerrar
          </button>
          {!device ? (
            <button
              className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              disabled={busy}
              onClick={onStart}
            >
              {busy ? "Preparando" : "Iniciar login"}
            </button>
          ) : (
            <>
              <button className="h-9 rounded-md border border-brand-orange px-4 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover" onClick={onOpenGithub}>
                Abrir GitHub
              </button>
              <button
                className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
                disabled={polling}
                onClick={onPoll}
              >
                {polling ? "Comprobando" : "Ya autoricé"}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function getGithubDeviceFlowErrorMessage(error?: string | null) {
  if (error === "expired_token") return "El código ha caducado. Inicia un nuevo login para generar otro código.";
  if (error === "access_denied") return "La autorización fue cancelada en GitHub.";
  if (error === "incorrect_device_code") return "GitHub no reconoce este código de dispositivo. Inicia el login de nuevo.";
  return error ?? "GitHub no pudo completar la autorización.";
}

function UpdateAvailableDialog({
  update,
  state,
  progress,
  error,
  onClose,
  onInstall,
}: {
  update: AvailableUpdate | null;
  state: UpdateState;
  progress: UpdateDownloadProgress | null;
  error: string | null;
  onClose: () => void;
  onInstall: () => void;
}) {
  if (!update) return null;

  const busy = state === "downloading" || state === "installing";
  const progressLabel = progress?.percent !== undefined ? `${progress.percent}%` : "Preparando";
  const releaseDate = update.date ? formatDateTime(update.date) : null;

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[95] grid place-items-center bg-black/20">
      <section className="w-[460px] rounded-lg border border-line bg-white shadow-menu">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">Actualización disponible</h2>
          <p className="mt-1 text-[11px] text-ink-secondary">
            KnowNext.ai v{update.version} está lista para instalar.
          </p>
        </header>
        <div className="space-y-4 px-5 py-5 text-[11px] text-ink-secondary">
          <div className="flex items-center justify-between rounded-md border border-line bg-panel px-3 py-2">
            <span>Versión instalada</span>
            <span className="font-mono text-[11px] text-ink-primary">v{update.currentVersion}</span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-orange-200 bg-brand-hover px-3 py-2">
            <span>Nueva versión</span>
            <span className="font-mono text-[11px] font-semibold text-brand-orange">v{update.version}</span>
          </div>
          {releaseDate ? <p className="text-[11px]">Publicada el {releaseDate}.</p> : null}
          {update.notes ? (
            <div className="max-h-28 overflow-y-auto rounded-md border border-line bg-white px-3 py-2 text-[11px] leading-5">
              {update.notes}
            </div>
          ) : null}
          {busy ? (
            <div>
              <div className="flex items-center justify-between text-[11px]">
                <span>{state === "installing" ? "Instalando" : "Descargando"}</span>
                <span>{progressLabel}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel">
                <div
                  className="h-full rounded-full bg-brand-orange transition-all"
                  style={{ width: `${progress?.percent ?? 20}%` }}
                />
              </div>
            </div>
          ) : null}
          {error ? <p className="text-[11px] text-red-700">{error}</p> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button
            className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={onClose}
          >
            Más tarde
          </button>
          <button
            className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={onInstall}
          >
            {busy ? "Actualizando" : "Actualizar"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function CloseDirtyDocumentDialog({
  open,
  documentName,
  onCancel,
  onDiscard,
  onSave,
}: {
  open: boolean;
  documentName: string;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  if (!open) return null;

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[90] grid place-items-center bg-black/20">
      <section className="w-[430px] rounded-lg border border-line bg-white shadow-menu">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">Cerrar documento con cambios</h2>
          <p className="mt-1 truncate text-[11px] text-ink-secondary">{documentName}</p>
        </header>
        <div className="px-5 py-5 text-[11px] leading-5 text-ink-secondary">
          El documento tiene cambios pendientes de guardar en disco. Puedes guardarlos, descartar el borrador interno o cancelar el cierre.
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onCancel}>
            Cancelar
          </button>
          <button className="h-9 rounded-md border border-line px-4 text-[11px] text-red-700 hover:bg-red-50" onClick={onDiscard}>
            Descartar
          </button>
          <button className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={onSave}>
            Guardar
          </button>
        </footer>
      </section>
    </div>
  );
}

function RecoverableDraftsDialog({
  open,
  drafts,
  onClose,
  onRefresh,
  onRestore,
  onDiscard,
}: {
  open: boolean;
  drafts: OrphanDraft[];
  onClose: () => void;
  onRefresh: () => void;
  onRestore: (draft: OrphanDraft) => void;
  onDiscard: (draftKey: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[90] grid place-items-center bg-black/20">
      <section
        className="flex max-h-[min(620px,calc(100vh-48px))] w-[min(660px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recoverable-drafts-title"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex min-w-0 gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-hover text-brand-orange">
              <ArchiveRestore size={18} />
            </span>
            <div className="min-w-0">
              <h2 id="recoverable-drafts-title" className="text-[15px] font-semibold text-ink-primary">Borradores recuperables</h2>
              <p className="mt-1 max-w-[500px] text-[11px] leading-5 text-ink-secondary">
                Son copias locales de cambios sin guardar cuyo archivo original ya no está disponible. Puedes recrear el archivo desde el borrador o descartarlo si ya no lo necesitas.
              </p>
            </div>
          </div>
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
            data-tooltip="Cerrar"
            aria-label="Cerrar borradores recuperables"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 rounded-md border border-line bg-panel px-4 py-3 text-[11px] leading-5 text-ink-secondary">
            <p className="font-semibold text-ink-primary">Cuándo aparece un borrador aquí</p>
            <p className="mt-1">
              Si editas un documento, quedan cambios pendientes y después el archivo se elimina, se mueve fuera del proyecto o deja de poder localizarse, KnowNext.ai conserva el contenido para evitar perder trabajo.
            </p>
          </div>
          {drafts.length === 0 ? (
            <div className="grid place-items-center rounded-md border border-dashed border-line bg-white px-4 py-8 text-center">
              <FileWarning size={24} className="text-ink-secondary" />
              <p className="mt-3 text-[12px] font-semibold text-ink-primary">No hay borradores pendientes</p>
              <p className="mt-1 max-w-[420px] text-[11px] leading-5 text-ink-secondary">
                Todos los borradores locales siguen asociados a sus archivos o ya se han resuelto. Puedes actualizar para volver a comprobar el estado del disco.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {drafts.map((draft) => (
                <article key={draft.draftKey} className="rounded-md border border-line bg-white px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-ink-primary">{draft.name}</p>
                      <p className="mt-1 truncate text-[11px] text-ink-secondary">{draft.path}</p>
                      <p className="mt-2 text-[11px] text-ink-secondary">
                        {draft.wordCount} palabras · {formatDateTime(draft.draftUpdatedAt)}
                        {!draft.recoverable && draft.reason ? ` · ${draft.reason}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        className="flex h-8 items-center gap-2 rounded-md border border-line px-3 text-[11px] font-medium text-red-700 hover:bg-red-50"
                        onClick={() => onDiscard(draft.draftKey)}
                      >
                        <Trash2 size={14} />
                        Descartar
                      </button>
                      <button
                        className="flex h-8 items-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!draft.recoverable}
                        onClick={() => onRestore(draft)}
                      >
                        <ArchiveRestore size={14} />
                        Recrear archivo
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onClose}>
            Cerrar
          </button>
          <button className="flex h-9 items-center gap-2 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={onRefresh}>
            <RefreshCw size={14} />
            Actualizar
          </button>
        </footer>
      </section>
    </div>
  );
}

function AiDeleteConfirmationDialog({
  pendingDelete,
  onCancel,
  onConfirm,
}: {
  pendingDelete: AiPendingDelete | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!pendingDelete) return null;

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[96] grid place-items-center bg-black/20">
      <section className="w-[min(520px,calc(100vw-32px))] rounded-lg border border-line bg-white shadow-menu">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink-primary">La IA quiere eliminar elementos</h2>
          <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
            Revisa la lista antes de confirmar. Esta acción modifica el árbol del proyecto.
          </p>
        </header>
        <div className="max-h-64 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {pendingDelete.paths.map((path) => (
              <div key={path} className="rounded-md border border-line bg-panel px-3 py-2 font-mono text-[10px] text-ink-primary">
                {path}
              </div>
            ))}
          </div>
          {pendingDelete.documentCount > 1 ? (
            <p className="mt-3 text-[11px] text-ink-secondary">Se verán afectados {pendingDelete.documentCount} documentos.</p>
          ) : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onCancel}>
            Cancelar
          </button>
          <button className="h-9 rounded-md bg-red-600 px-4 text-[11px] font-semibold text-white hover:bg-red-700" onClick={onConfirm}>
            Eliminar
          </button>
        </footer>
      </section>
    </div>
  );
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("es", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
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

function MoveDocumentDialog({
  open,
  node,
  folders,
  onClose,
  onMove,
}: {
  open: boolean;
  node: DocumentTreeNode | null;
  folders: DocumentTreeNode[];
  onClose: () => void;
  onMove: (targetFolderId: string | null) => void;
}) {
  const [targetFolderId, setTargetFolderId] = useState("");

  useEffect(() => {
    if (open) setTargetFolderId("");
  }, [open]);

  if (!open || !node) return null;

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[80] grid place-items-center bg-black/20">
      <section className="w-[420px] rounded-lg border border-line bg-white shadow-menu">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">Mover elemento</h2>
          <p className="mt-1 truncate text-[11px] text-ink-secondary">{node.name}</p>
        </header>
        <div className="px-5 py-5">
          <label className="block text-[11px] font-medium text-ink-secondary">
            Carpeta de destino
            <select
              className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
              value={targetFolderId}
              onChange={(event) => setTargetFolderId(event.target.value)}
            >
              <option value="">Raíz del proyecto</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.path || folder.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark"
            onClick={() => onMove(targetFolderId || null)}
          >
            Mover
          </button>
        </footer>
      </section>
    </div>
  );
}
