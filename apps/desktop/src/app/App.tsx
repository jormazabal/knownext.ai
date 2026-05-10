import { useEffect, useMemo, useState } from "react";
import type { DocumentTreeAction } from "../features/documents/DocumentTree";
import { CreateDocumentDialog } from "../features/documents/CreateDocumentDialog";
import { CreateProjectDialog } from "../features/projects/CreateProjectDialog";
import { AppSettingsDialog } from "../features/settings/AppSettingsDialog";
import { DesktopLayout } from "../layouts/DesktopLayout";
import {
  countWords,
  createEmptyDocumentSession,
  createLoadedDocumentSession,
  shouldPersistDraft,
  updateSession,
  type DocumentSession,
} from "./documentSessions";
import {
  defaultAppearanceConfig,
  defaultDiagnosticsConfig,
  defaultLayoutConfig,
  defaultProjectTabsConfig,
  getAppConfig,
  updateAppConfig,
} from "../lib/api/config";
import { API_BASE_URL, ApiError, getApiErrorMessage, isBackendEnabled } from "../lib/api/client";
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
import {
  createFolder,
  createProjectDocument,
  createProject,
  deleteProject,
  deleteTreeNode,
  duplicateProjectDocument,
  getProjectTree,
  getProjectCapabilities,
  getProjectVersioningStatus,
  listProjects,
  moveTreeNode,
  pullProject,
  pushProject,
  renameTreeNode,
  setActiveProject as persistActiveProject,
  updateProject,
} from "../lib/api/projects";
import type {
  AuthStatus,
  AppearanceConfig,
  AppUtilityTabId,
  DiagnosticsConfig,
  DocumentRecord,
  DocumentTreeNode,
  FileOperationResult,
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

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ isAuthenticated: false, provider: null, user: null, scopes: [] });
  const [projectCapabilities, setProjectCapabilities] = useState<ProjectCapabilities | null>(null);
  const [versioningStatus, setVersioningStatus] = useState<ProjectVersioningStatus | null>(null);
  const [tree, setTree] = useState<DocumentTreeNode[]>([]);
  const [tabs, setTabs] = useState<OpenDocumentTab[]>(defaultProjectTabsConfig.openTabs);
  const [activeDocumentId, setActiveDocumentId] = useState(defaultProjectTabsConfig.activeDocumentId);
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
  const [tabsByProject, setTabsByProject] = useState<Record<string, ProjectTabsConfig>>({});
  const [openUtilityTabs, setOpenUtilityTabs] = useState<AppUtilityTabId[]>([]);
  const [activeUtilityTab, setActiveUtilityTab] = useState<AppUtilityTabId | null>(null);
  const [lastRunAppVersion, setLastRunAppVersion] = useState<string | null>(null);
  const [lastSeenReleaseNotesVersion, setLastSeenReleaseNotesVersion] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const [closeDocumentId, setCloseDocumentId] = useState<string | null>(null);
  const [orphanDrafts, setOrphanDrafts] = useState<OrphanDraft[]>([]);
  const [recoverableDraftsOpen, setRecoverableDraftsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [traceLogStatus, setTraceLogStatus] = useState<TraceLogStatus | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateProgress, setUpdateProgress] = useState<UpdateDownloadProgress | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [githubLoginOpen, setGithubLoginOpen] = useState(false);
  const [githubLoginState, setGithubLoginState] = useState<GithubLoginState>("idle");
  const [githubDevice, setGithubDevice] = useState<GithubDeviceStartResponse | null>(null);
  const [githubLoginError, setGithubLoginError] = useState<string | null>(null);
  const [githubRepositories, setGithubRepositories] = useState<GithubRepositorySummary[]>([]);
  const [githubRepositoriesLoading, setGithubRepositoriesLoading] = useState(false);
  const [syncState, setSyncState] = useState<"idle" | "pulling" | "pushing">("idle");

  useEffect(() => {
    void (async () => {
      try {
        const [projectList, appConfig, auth, capabilities] = await Promise.all([
          listProjects(),
          getAppConfig(),
          getAuthStatus(),
          getProjectCapabilities(),
        ]);
        const active = projectList.find((project) => project.active) ?? projectList[0];
        const projectTree = active ? await getProjectTree(active.id) : [];
        const activeVersioningStatus = active ? await getProjectVersioningStatus(active.id) : null;
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
        setTabsByProject(appConfig.tabsByProject);
        setOpenUtilityTabs(nextOpenUtilityTabs);
        setActiveUtilityTab(shouldOpenReleaseNotes ? RELEASE_NOTES_UTILITY_TAB_ID : appConfig.activeUtilityTab ?? null);
        setLastRunAppVersion(APP_VERSION);
        setLastSeenReleaseNotesVersion(appConfig.lastSeenReleaseNotesVersion ?? null);
        setTabs(activeProjectTabs.openTabs);
        setActiveDocumentId(activeProjectTabs.activeDocumentId);
      } catch (error) {
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
        showError(error, "No se pudo guardar la configuración de la aplicación.");
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [
    activeUtilityTab,
    appearanceConfig,
    configLoaded,
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
  }, [appearanceConfig.language, appearanceConfig.zoomPercent]);

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
    if (!authStatus.isAuthenticated) {
      setGithubRepositories([]);
      return;
    }
    void refreshGithubRepositories();
  }, [authStatus.isAuthenticated]);

  useEffect(() => {
    if (!githubLoginOpen || githubLoginState !== "waiting" || !githubDevice) return;

    const timeout = window.setTimeout(() => {
      void handlePollGithubLogin();
    }, Math.max(githubDevice.interval, 1) * 1000);

    return () => window.clearTimeout(timeout);
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
    ...tabs.map((tab) => ({ ...tab, kind: "document" as const })),
    ...(openUtilityTabs.includes(RELEASE_NOTES_UTILITY_TAB_ID)
      ? [{
        kind: "release-notes" as const,
        id: RELEASE_NOTES_WORKSPACE_TAB_ID,
        name: "Notas de release" as const,
        utilityTabId: RELEASE_NOTES_UTILITY_TAB_ID,
        readonly: true as const,
      }]
      : []),
  ], [openUtilityTabs, tabs]);
  const activeTabId = activeUtilityTab === RELEASE_NOTES_UTILITY_TAB_ID ? RELEASE_NOTES_WORKSPACE_TAB_ID : activeDocumentId;
  const activeSession = activeDocumentId ? documentSessions[activeDocumentId] : undefined;
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
    setDocumentSessions((currentSessions) => {
      const { [documentId]: _closedSession, ...nextSessions } = currentSessions;
      return nextSessions;
    });
    if (documentId === activeDocumentId && activeUtilityTab === null) {
      setActiveDocumentId(nextTabs[0]?.id ?? "");
    }
  }

  function handleSelectTab(tabId: string) {
    if (tabId === RELEASE_NOTES_WORKSPACE_TAB_ID) {
      setOpenUtilityTabs((currentTabs) => ensureReleaseNotesTab(currentTabs));
      setActiveUtilityTab(RELEASE_NOTES_UTILITY_TAB_ID);
      return;
    }

    const documentId = tabId;
    if (activeDocumentId && documentSessions[activeDocumentId]) {
      void persistDraft(activeDocumentId, documentSessions[activeDocumentId]);
    }
    setActiveUtilityTab(null);
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
      const result = await renameTreeNode(activeProject.id, nodeId, nextName);
      applyFileOperationResult(result);
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
    if (!githubDevice) return;
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
      if (response.interval && githubDevice) {
        setGithubDevice({ ...githubDevice, interval: response.interval });
      }
      setGithubLoginError(response.error && response.error !== "authorization_pending" ? response.error : null);
    } catch (error) {
      setGithubLoginState("error");
      setGithubLoginError(getApiErrorMessage(error, "No se pudo completar el login con GitHub."));
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

  function showError(error: unknown, fallback: string) {
    if (diagnosticsConfig.traceLoggingEnabled) {
      void recordTraceLog({
        source: "app.showError",
        message: getApiErrorMessage(error, fallback),
        detail: describeError(error),
      });
    }
    setNotice({
      title: "No se pudo completar la operación",
      message: getApiErrorMessage(error, fallback),
      tone: "error",
    });
  }

  function handleLayoutConfigChange(nextLayoutConfig: Partial<LayoutConfig>) {
    setLayoutConfig((currentLayoutConfig) => ({ ...currentLayoutConfig, ...nextLayoutConfig }));
  }

  function handleAppearanceConfigChange(nextAppearanceConfig: Partial<AppearanceConfig>) {
    setAppearanceConfig((currentAppearanceConfig) => ({ ...currentAppearanceConfig, ...nextAppearanceConfig }));
  }

  function handleDiagnosticsConfigChange(nextDiagnosticsConfig: Partial<DiagnosticsConfig>) {
    setDiagnosticsConfig((currentDiagnosticsConfig) => ({ ...currentDiagnosticsConfig, ...nextDiagnosticsConfig }));
  }

  async function refreshTraceLogStatus() {
    try {
      setTraceLogStatus(await getTraceLogStatus());
    } catch (error) {
      showError(error, "No se pudo cargar el estado de las trazas.");
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
    const message = node.type === "folder"
      ? `Se eliminará la carpeta "${node.name}" y su contenido del disco. Esta acción no se puede deshacer.`
      : `Se eliminará el documento "${node.name}" del disco. Esta acción no se puede deshacer.`;
    if (!window.confirm(message)) return;

    try {
      const result = await deleteTreeNode(activeProject.id, node.id);
      applyFileOperationResult(result);
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
    try {
      const result = await moveTreeNode(activeProject.id, moveNode.id, targetFolderId);
      applyFileOperationResult(result);
      setMoveNode(null);
    } catch (error) {
      showError(error, "No se pudo mover el elemento.");
    }
  }

  function openOrReplaceTab(documentId: string, name: string) {
    setTabs((currentTabs) => (
      currentTabs.some((tab) => tab.id === documentId)
        ? currentTabs.map((tab) => (tab.id === documentId ? { id: documentId, name } : tab))
        : [...currentTabs, { id: documentId, name }]
    ));
    setActiveDocumentId(documentId);
    setActiveUtilityTab(null);
  }

  function applyFileOperationResult(result: FileOperationResult) {
    setTree(result.tree);

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
        authStatus={authStatus}
        projects={projects}
        activeProject={activeProject}
        tree={tree}
        tabs={workspaceTabs}
        activeTabId={activeTabId}
        activeDocumentId={activeDocumentId}
        editorSessions={editorSessions}
        releaseNotesMarkdown={RELEASE_NOTES_MARKDOWN}
        activeDocument={activeSession?.document ?? null}
        activeMarkdown={activeSession?.markdown ?? ""}
        activeDocumentDirty={activeSession?.isDirty ?? false}
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
        isSyncingProject={syncState !== "idle"}
        onOpenDocument={handleOpenDocument}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onTreeContextAction={handleTreeContextAction}
        onMarkdownChange={handleMarkdownChange}
        onSave={() => void handleSave()}
        onKeepLocalVersion={() => void handleSave(activeDocumentId, true)}
        onLoadDiskVersion={() => void handleLoadDiskVersion()}
        onToggleHistory={() => {
          if (historyEnabled) setHistoryOpen((isOpen) => !isOpen);
        }}
        onCloseHistory={() => setHistoryOpen(false)}
        onLayoutConfigChange={handleLayoutConfigChange}
      />
      <StartupOverlay loading={!configLoaded} />
      <AppNoticeBanner notice={notice} onClose={() => setNotice(null)} />
      <AppSettingsDialog
        open={appSettingsOpen}
        appearance={appearanceConfig}
        diagnostics={diagnosticsConfig}
        traceLogStatus={traceLogStatus}
        onClose={() => setAppSettingsOpen(false)}
        onAppearanceChange={handleAppearanceConfigChange}
        onDiagnosticsChange={handleDiagnosticsConfigChange}
        onOpenTraceLogFolder={() => void handleOpenTraceLogFolder()}
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
        onClose={() => setGithubLoginOpen(false)}
        onStart={() => void handleStartGithubLogin()}
        onOpenGithub={() => {
          if (githubDevice) window.open(githubDevice.verificationUri, "_blank", "noopener,noreferrer");
        }}
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
        folders={collectFolders(tree)}
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
      showError(error, "No se pudo comprobar el estado de sincronización de los documentos.");
    }
  }

  async function refreshOrphanDrafts() {
    try {
      setOrphanDrafts(await listOrphanDrafts());
    } catch (error) {
      showError(error, "No se pudieron cargar los borradores recuperables.");
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

function getUniqueFolderName(nodes: DocumentTreeNode[]) {
  const names = new Set(nodes.filter((node) => node.type === "folder").map((node) => node.name));
  if (!names.has("Nueva carpeta")) return "Nueva carpeta";

  let counter = 2;
  while (names.has(`Nueva carpeta ${counter}`)) counter += 1;
  return `Nueva carpeta ${counter}`;
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
        <img
          className="mx-auto h-10 w-10 object-contain"
          src="/brand/knownext-logo.png"
          alt=""
          aria-hidden="true"
        />
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
  onClose,
  onStart,
  onOpenGithub,
  onPoll,
}: {
  open: boolean;
  state: GithubLoginState;
  device: GithubDeviceStartResponse | null;
  error: string | null;
  onClose: () => void;
  onStart: () => void;
  onOpenGithub: () => void;
  onPoll: () => void;
}) {
  if (!open) return null;

  const busy = state === "starting";
  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/20">
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
              <button className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={onPoll}>
                Ya autoricé
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
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
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/20">
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
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/20">
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
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/20">
      <section className="flex max-h-[72vh] w-[620px] flex-col rounded-lg border border-line bg-white shadow-menu">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold">Borradores recuperables</h2>
            <p className="mt-1 text-[11px] text-ink-secondary">Borradores internos cuyo archivo original ya no está disponible.</p>
          </div>
          <button className="rounded px-2 py-1 text-[11px] text-ink-secondary hover:bg-panel" onClick={onClose}>
            Cerrar
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {drafts.length === 0 ? (
            <div className="rounded-md border border-line bg-panel px-4 py-6 text-center text-[11px] text-ink-secondary">
              No hay borradores huérfanos pendientes.
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
                        className="h-8 rounded-md border border-line px-3 text-[11px] text-red-700 hover:bg-red-50"
                        onClick={() => onDiscard(draft.draftKey)}
                      >
                        Descartar
                      </button>
                      <button
                        className="h-8 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                        disabled={!draft.recoverable}
                        onClick={() => onRestore(draft)}
                      >
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
          <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onRefresh}>
            Actualizar
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
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/20">
      <section className="w-[420px] rounded-lg border border-line bg-white shadow-menu">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">Mover documento</h2>
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
