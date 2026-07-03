import { APP_VERSION } from "../appVersion";
import type {
  ActivityEvent,
  AiConfigStatus,
  AppConfig,
  DocumentRecord,
  DocumentSyncStatus,
  DocumentTreeNode,
  DraftResponse,
  ExportTemplateConfig,
  FileOperationResult,
  Project,
  ProjectCapabilities,
  ProjectPayload,
  ProjectSyncStatus,
  ProjectVersioningStatus,
  UserNotes,
} from "../../types/domain";

type WebDevLocalApiResponse<T = unknown> = {
  status: number;
  body: T;
};

type WebDevRuntimeHealth = {
  app: "knownext";
  schemaVersion: number;
  status: "ok";
  service: "local-web-dev";
  version: string;
  profile: "web-dev";
  host: "local-web-dev";
  port: null;
  endpoint: "tauri://local-api";
  instanceId: "web-dev-local";
  startedAt: string;
  managedBy: "manual";
  appDataDir: "browser-local-storage";
};

type WebDevProjectState = {
  tree: DocumentTreeNode[];
  documents: Record<string, DocumentRecord>;
  activity: ActivityEvent[];
};

type WebDevLocalApiState = {
  schemaVersion: number;
  startedAt: string;
  activeProjectId: string | null;
  projects: Project[];
  projectState: Record<string, WebDevProjectState>;
  config: AppConfig;
  aiConfig: AiConfigStatus;
  exportTemplate: ExportTemplateConfig;
  notes: UserNotes;
};

const storageKey = "knownext.web-dev.local-api";

export async function handleWebDevLocalApiRequest<T>(
  method: string,
  path: string,
  body: unknown,
): Promise<WebDevLocalApiResponse<T>> {
  const state = readState();
  const route = parseRoute(path);
  const segments = route.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const normalizedMethod = method.toUpperCase();

  try {
    const response = routeRequest(state, normalizedMethod, segments, body);
    writeState(state);
    return response as WebDevLocalApiResponse<T>;
  } catch (error) {
    return {
      status: 400,
      body: { detail: error instanceof Error ? error.message : String(error) } as T,
    };
  }
}

function routeRequest(
  state: WebDevLocalApiState,
  method: string,
  segments: string[],
  body: unknown,
): WebDevLocalApiResponse {
  if (method === "GET" && matches(segments, ["health"])) {
    return ok<WebDevRuntimeHealth>({
      app: "knownext",
      schemaVersion: 3,
      status: "ok",
      service: "local-web-dev",
      version: APP_VERSION,
      profile: "web-dev",
      host: "local-web-dev",
      port: null,
      endpoint: "tauri://local-api",
      instanceId: "web-dev-local",
      startedAt: state.startedAt,
      managedBy: "manual",
      appDataDir: "browser-local-storage",
    });
  }

  if (matches(segments, ["api", "config"])) {
    if (method === "GET") return ok(state.config);
    if (method === "PUT") {
      state.config = {
        ...state.config,
        ...asObject(body),
        updatedAt: nowIso(),
      };
      return ok(state.config);
    }
  }

  if (matches(segments, ["api", "config", "ai"])) {
    if (method === "GET") return ok(state.aiConfig);
    if (method === "PUT") {
      state.aiConfig = {
        ...defaultAiConfigStatus(),
        ...asObject(body),
        openaiKeyConfigured: state.aiConfig.openaiKeyConfigured,
        openaiKeyPreview: state.aiConfig.openaiKeyPreview,
      };
      return ok(state.aiConfig);
    }
  }

  if (matches(segments, ["api", "config", "export-template"])) {
    if (method === "GET") return ok(state.exportTemplate);
    if (method === "PUT") {
      state.exportTemplate = { ...state.exportTemplate, ...asObject(body), updatedAt: nowIso() };
      return ok(state.exportTemplate);
    }
  }

  if (method === "POST" && matches(segments, ["api", "config", "export-template", "reset"])) {
    state.exportTemplate = defaultExportTemplate();
    return ok(state.exportTemplate);
  }

  if (method === "GET" && matches(segments, ["api", "config", "export-template", "path"])) {
    return ok({ path: "browser-local-storage/export-template.json" });
  }

  if (method === "GET" && matches(segments, ["api", "auth", "status"])) {
    return ok({ isAuthenticated: false, provider: null, user: null, scopes: [] });
  }

  if (method === "POST" && matches(segments, ["api", "auth", "github", "device", "start"])) {
    return ok({
      status: "error",
      error: "github_remote_not_configured",
      deviceCode: "web-dev",
      userCode: "WEB-DEV",
      verificationUri: "https://github.com/login/device",
      expiresIn: 900,
      interval: 5,
      mock: true,
    });
  }

  if (method === "POST" && matches(segments, ["api", "auth", "github", "device", "poll"])) {
    return ok({
      status: "error",
      error: "github_remote_not_configured",
      auth: { isAuthenticated: false, provider: null, user: null, scopes: [] },
    });
  }

  if (method === "POST" && matches(segments, ["api", "auth", "logout"])) {
    return ok({ isAuthenticated: false, provider: null, user: null, scopes: [] });
  }

  if (method === "GET" && matches(segments, ["api", "projects"])) return ok(state.projects);
  if (method === "POST" && matches(segments, ["api", "projects"])) return ok(createProject(state, body));
  if (method === "GET" && matches(segments, ["api", "projects", "active"])) {
    const active = state.projects.find((project) => project.id === state.activeProjectId) ?? state.projects[0];
    return active ? ok(active) : notFound("No hay proyecto activo");
  }
  if (method === "GET" && matches(segments, ["api", "projects", "capabilities"])) return ok(projectCapabilities());

  if (segments[0] === "api" && segments[1] === "projects" && segments[2]) {
    const projectId = segments[2];
    if (method === "GET" && segments[3] === "tree") return ok(projectState(state, projectId).tree);
    if (method === "PUT" && segments[3] === "active") return ok(setActiveProject(state, projectId));
    if (method === "GET" && segments[3] === "versioning" && segments[4] === "status") return ok(versioningStatus(state, projectId));
    if (method === "GET" && segments[3] === "sync" && segments[4] === "status") return ok(syncStatus(state, projectId));
    if (method === "POST" && segments[3] === "sync" && (segments[4] === "scan" || segments[4] === "auto-run")) return ok(syncStatus(state, projectId));
    if (method === "GET" && segments[3] === "activity") return ok({ projectId, events: projectState(state, projectId).activity });
    if (method === "POST" && segments[3] === "activity") return ok(recordActivity(state, projectId, body));
    if (method === "POST" && segments[3] === "documents") return ok(createDocument(state, projectId, body));
    if (method === "POST" && segments[3] === "folders") return ok(createFolder(state, projectId, body));
    if (method === "GET" && segments[3] === "external-changes") return ok(emptyExternalChanges(projectId));
    if (method === "POST" && segments[3] === "external-changes" && segments[4] === "scan") return ok(emptyExternalChanges(projectId));
    if (method === "GET" && segments[3] === "ai" && segments[4] === "context" && segments[5] === "search") return ok([]);
    if (method === "GET" && segments[3] === "ai" && segments[4] === "context" && segments[5] === "sources") return ok({ sources: [], expiredSourceIds: [] });
    if (method === "GET" && segments[3] === "ai" && segments[4] === "index" && segments[5] === "status") return ok(aiIndexStatus(projectId));
    if (method === "GET" && segments[3] === "ai" && segments[4] === "conversation") return ok({ events: [] });
    if (method === "GET" && segments[3] === "ai" && segments[4] === "pending-intent") return ok(null);
  }

  if (segments[0] === "api" && segments[1] === "documents" && segments[2]) {
    const documentId = segments[2];
    if (method === "GET" && segments.length === 3) return ok(getDocument(state, documentId));
    if (method === "PUT" && segments.length === 3) return ok(saveDocument(state, documentId, body));
    if (method === "PUT" && segments[3] === "draft") return ok(saveDraft(state, documentId, body));
    if (method === "DELETE" && segments[3] === "draft") return ok(undefined);
  }

  if (method === "POST" && matches(segments, ["api", "documents", "sync-status"])) {
    const documents = Array.isArray(asObject(body).documents) ? asObject(body).documents as Array<{ documentId?: string }> : [];
    return ok({ documents: documents.map((item) => documentSyncStatus(String(item.documentId ?? ""))) });
  }

  if (method === "GET" && matches(segments, ["api", "notes"])) return ok(state.notes);
  if (method === "PUT" && matches(segments, ["api", "notes"])) {
    state.notes = { markdown: String(asObject(body).markdown ?? ""), updatedAt: nowIso() };
    return ok(state.notes);
  }

  if (method === "GET" && matches(segments, ["api", "drafts", "orphans"])) return ok([]);
  if (method === "GET" && matches(segments, ["api", "ai", "usage", "summary"])) return ok(aiUsageSummary());
  if (method === "GET" && matches(segments, ["api", "credentials", "openai-key"])) return ok({ configured: false, preview: null });
  if (method === "GET" && matches(segments, ["api", "skills"])) return ok({ skills: [] });
  if (method === "GET" && matches(segments, ["api", "runtime", "logging"])) return ok(traceLogStatus());
  if (method === "POST" && matches(segments, ["api", "runtime", "logging"])) return ok(traceLogStatus());
  if (method === "POST" && matches(segments, ["api", "runtime", "open-folder"])) return ok({ opened: false });

  return notFound(`Endpoint web-dev no implementado: ${method} /${segments.join("/")}`);
}

function createProject(state: WebDevLocalApiState, body: unknown): Project {
  const payload = asObject(body) as Partial<ProjectPayload>;
  const id = compactId("project");
  const project: Project = {
    id,
    name: String(payload.name || "Nuevo proyecto"),
    folderPath: String(payload.folderPath || `browser-local-storage/projects/${id}`),
    icon: String(payload.icon || "folder"),
    iconColor: String(payload.iconColor || "#F37021"),
    storageMode: payload.storageMode ?? "local-files",
    versioningMode: payload.versioningMode ?? "none",
    syncMode: payload.syncMode ?? "none",
    authRequired: false,
    githubRepository: payload.githubRepository ?? null,
    isGitRepository: payload.versioningMode === "local-git",
    active: true,
  };

  state.projects = state.projects.map((current) => ({ ...current, active: false }));
  state.projects.push(project);
  state.activeProjectId = id;
  state.projectState[id] = { tree: [], documents: {}, activity: [] };
  return project;
}

function setActiveProject(state: WebDevLocalApiState, projectId: string) {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new Error("Proyecto no encontrado");
  state.activeProjectId = projectId;
  state.projects = state.projects.map((candidate) => ({ ...candidate, active: candidate.id === projectId }));
  return state.projects.find((candidate) => candidate.id === projectId)!;
}

function createDocument(state: WebDevLocalApiState, projectId: string, body: unknown): FileOperationResult {
  const payload = asObject(body);
  const name = sanitizeName(String(payload.name || "Documento.md"), "Documento.md");
  const parentId = typeof payload.parentId === "string" && payload.parentId ? payload.parentId : null;
  const path = parentId ? `${nodePath(projectState(state, projectId).tree, parentId)}/${name}` : name;
  const id = documentId(projectId, path);
  const markdown = String(payload.markdown ?? "");
  const record = documentRecord(projectId, path, markdown);
  const node: DocumentTreeNode = { id, name, type: "document", path };
  const projectData = projectState(state, projectId);
  projectData.documents[id] = record;
  projectData.tree = insertTreeNode(projectData.tree, parentId, node);
  return { tree: projectData.tree, node, affectedDocuments: [] };
}

function createFolder(state: WebDevLocalApiState, projectId: string, body: unknown): FileOperationResult {
  const payload = asObject(body);
  const name = sanitizeName(String(payload.name || "Nueva carpeta"), "Nueva carpeta");
  const parentId = typeof payload.parentId === "string" && payload.parentId ? payload.parentId : null;
  const path = parentId ? `${nodePath(projectState(state, projectId).tree, parentId)}/${name}` : name;
  const node: DocumentTreeNode = { id: documentId(projectId, path), name, type: "folder", path, children: [] };
  const projectData = projectState(state, projectId);
  projectData.tree = insertTreeNode(projectData.tree, parentId, node);
  return { tree: projectData.tree, node, affectedDocuments: [] };
}

function getDocument(state: WebDevLocalApiState, documentIdValue: string): DocumentRecord {
  const document = Object.values(state.projectState).flatMap((project) => Object.values(project.documents)).find((candidate) => candidate.id === documentIdValue);
  if (!document) throw new Error("Documento no encontrado");
  return document;
}

function saveDocument(state: WebDevLocalApiState, documentIdValue: string, body: unknown): DocumentRecord {
  const current = getDocument(state, documentIdValue);
  const markdown = String(asObject(body).markdown ?? current.markdown);
  const saved = documentRecord(current.projectId, current.path, markdown);
  projectState(state, current.projectId).documents[documentIdValue] = saved;
  return saved;
}

function saveDraft(state: WebDevLocalApiState, documentIdValue: string, body: unknown): DraftResponse {
  const document = getDocument(state, documentIdValue);
  const markdown = String(asObject(body).markdown ?? document.markdown);
  const isDirty = markdown !== document.markdown;
  return {
    documentId: documentIdValue,
    draftUpdatedAt: isDirty ? nowIso() : null,
    isDirty,
    hasDraft: isDirty,
    diskContentHash: document.diskContentHash,
    savedContentHash: document.savedContentHash,
    draftContentHash: isDirty ? contentHash(markdown) : null,
  };
}

function recordActivity(state: WebDevLocalApiState, projectId: string, body: unknown): ActivityEvent {
  const payload = asObject(body);
  const event: ActivityEvent = {
    id: compactId("activity"),
    projectId,
    type: String(payload.type || "event"),
    scope: payload.scope === "history" || payload.scope === "github" || payload.scope === "security" || payload.scope === "document" ? payload.scope : "project",
    title: String(payload.title || "Actividad"),
    message: String(payload.message || ""),
    tone: payload.tone === "warning" || payload.tone === "danger" || payload.tone === "info" ? payload.tone : "success",
    createdAt: nowIso(),
    documentPath: typeof payload.documentPath === "string" ? payload.documentPath : null,
    repository: typeof payload.repository === "string" ? payload.repository : null,
  };
  projectState(state, projectId).activity.unshift(event);
  return event;
}

function projectCapabilities(): ProjectCapabilities {
  return {
    canCreateLocalProject: true,
    canOpenLocalFolder: false,
    canUseLocalGit: false,
    canConnectGithub: false,
    canUseGithubApi: false,
    requiresGithubLoginForVersioning: true,
  };
}

function versioningStatus(state: WebDevLocalApiState, projectId: string): ProjectVersioningStatus {
  const project = requireProject(state, projectId);
  return {
    enabled: project.versioningMode !== "none",
    available: false,
    reason: project.versioningMode === "none" ? "Proyecto de solo archivos locales." : "Git local no está disponible en el runtime web-dev.",
    storageMode: project.storageMode,
    versioningMode: project.versioningMode,
    syncMode: project.syncMode,
    statusLabel: project.versioningMode === "none" ? "Sin historial" : "Historial no disponible",
    hasLocalChanges: false,
    hasRemoteChanges: false,
    lastVersionHash: null,
    lastVersionRelativeTime: null,
  };
}

function syncStatus(state: WebDevLocalApiState, projectId: string): ProjectSyncStatus {
  return {
    projectId,
    mode: "local-files",
    state: "local-only",
    label: "Solo local",
    detail: "Runtime web-dev con almacenamiento local del navegador.",
    remoteAccess: "not-configured",
    remotePaused: false,
    remoteReason: null,
    remoteAction: null,
    localState: "clean",
    pendingPush: false,
    pendingPull: false,
    hasConflicts: false,
    lastSyncAt: null,
    lastLocalVersionHash: null,
    lastRemoteHash: null,
    localAheadCount: 0,
    remoteAheadCount: 0,
    localAheadPaths: [],
    remoteAheadPaths: [],
    diverged: false,
    conflicts: [],
  };
}

function documentSyncStatus(documentIdValue: string): DocumentSyncStatus {
  return {
    documentId: documentIdValue,
    exists: true,
    currentFingerprint: null,
    diskContentHash: null,
    savedContentHash: null,
    draftContentHash: null,
    diskChanged: false,
    hasDraft: false,
    orphaned: false,
    conflictStatus: "none",
    versionState: "unversioned",
    localChanged: false,
    remoteChanged: false,
    localVersionHash: null,
    remoteVersionHash: null,
    message: null,
  };
}

function emptyExternalChanges(projectId: string) {
  return {
    id: `external-${projectId}`,
    projectId,
    title: "Sin cambios externos",
    source: "filesystem",
    status: "none",
    detectedAt: nowIso(),
    requiresReview: false,
    summary: {
      total: 0,
      safe: 0,
      review: 0,
      blocked: 0,
      added: 0,
      modified: 0,
      deleted: 0,
      folders: 0,
      documents: 0,
      images: 0,
      attachments: 0,
      omitted: 0,
      totalBytes: 0,
    },
    items: [],
    message: "El runtime web-dev no revisa cambios externos del sistema de archivos.",
  };
}

function aiIndexStatus(projectId: string) {
  return {
    projectId,
    enabled: true,
    status: "not-indexed",
    vectorStoreId: null,
    lastIndexedAt: null,
    error: null,
    documentCount: 0,
    indexedDocumentCount: 0,
    pendingDocumentCount: 0,
    failedDocumentCount: 0,
    deletedDocumentCount: 0,
    localExactReady: true,
  };
}

function aiUsageSummary() {
  return {
    month: new Date().toISOString().slice(0, 7),
    currency: "EUR",
    estimated: true,
    totalEstimatedCost: 0,
    generatedAt: nowIso(),
    capabilities: [],
    models: [],
  };
}

function traceLogStatus() {
  return {
    enabled: false,
    folderPath: "browser-local-storage/logs",
    filePath: "browser-local-storage/logs/knownext-web-dev.log",
  };
}

function documentRecord(projectId: string, path: string, markdown: string): DocumentRecord {
  const name = path.split("/").pop() || path;
  const hash = contentHash(markdown);
  return {
    id: documentId(projectId, path),
    name,
    path,
    projectId,
    markdown,
    diskMarkdown: markdown,
    diskContentHash: hash,
    savedContentHash: hash,
    draftContentHash: null,
    wordCount: markdown.trim() ? markdown.trim().split(/\s+/).length : 0,
    updatedAt: nowIso(),
    baseFingerprint: null,
    hasDraft: false,
    isDirty: false,
    diskChanged: false,
    orphaned: false,
    conflictStatus: "none",
    draftUpdatedAt: null,
  };
}

function insertTreeNode(nodes: DocumentTreeNode[], parentId: string | null, node: DocumentTreeNode): DocumentTreeNode[] {
  if (!parentId) return [...nodes, node].sort(compareTreeNodes);
  return nodes.map((current) => {
    if (current.id === parentId) {
      return { ...current, children: [...(current.children ?? []), node].sort(compareTreeNodes) };
    }
    return current.children ? { ...current, children: insertTreeNode(current.children, parentId, node) } : current;
  });
}

function nodePath(nodes: DocumentTreeNode[], nodeIdValue: string): string {
  for (const node of nodes) {
    if (node.id === nodeIdValue) return node.path ?? node.name;
    if (node.children) {
      const childPath = nodePath(node.children, nodeIdValue);
      if (childPath) return childPath;
    }
  }
  return "";
}

function projectState(state: WebDevLocalApiState, projectId: string): WebDevProjectState {
  requireProject(state, projectId);
  state.projectState[projectId] ??= { tree: [], documents: {}, activity: [] };
  return state.projectState[projectId];
}

function requireProject(state: WebDevLocalApiState, projectId: string): Project {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new Error("Proyecto no encontrado");
  return project;
}

function readState(): WebDevLocalApiState {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch {
      // Recreate corrupt development state below.
    }
  }
  return normalizeState({});
}

function writeState(state: WebDevLocalApiState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

function normalizeState(value: unknown): WebDevLocalApiState {
  const source = asObject(value);
  const projects = Array.isArray(source.projects) ? source.projects as Project[] : [];
  return {
    schemaVersion: 1,
    startedAt: typeof source.startedAt === "string" ? source.startedAt : nowIso(),
    activeProjectId: typeof source.activeProjectId === "string" ? source.activeProjectId : projects.find((project) => project.active)?.id ?? null,
    projects,
    projectState: source.projectState && typeof source.projectState === "object" ? source.projectState as Record<string, WebDevProjectState> : {},
    config: { ...defaultAppConfig(), ...asObject(source.config), updatedAt: typeof asObject(source.config).updatedAt === "string" ? String(asObject(source.config).updatedAt) : nowIso() },
    aiConfig: { ...defaultAiConfigStatus(), ...asObject(source.aiConfig) },
    exportTemplate: { ...defaultExportTemplate(), ...asObject(source.exportTemplate) },
    notes: {
      markdown: typeof asObject(source.notes).markdown === "string" ? String(asObject(source.notes).markdown) : "",
      updatedAt: typeof asObject(source.notes).updatedAt === "string" ? String(asObject(source.notes).updatedAt) : nowIso(),
    },
  };
}

function defaultAppConfig(): AppConfig {
  return {
    schemaVersion: 3,
    layout: { sidebarWidth: 338, historyWidth: 320 },
    appearance: {
      language: "es",
      zoomPercent: 100,
      markdownExtendedUnderlineEnabled: true,
      themeMode: "system",
      primaryColor: "orange",
    },
    diagnostics: { traceLoggingEnabled: false },
    ai: defaultAiConfigStatus(),
    tabsByProject: {},
    treeOpenPathsByProject: {},
    lastRunAppVersion: null,
    lastSeenReleaseNotesVersion: null,
    openUtilityTabs: [],
    activeUtilityTab: null,
    updatedAt: nowIso(),
  };
}

function defaultAiConfigStatus(): AiConfigStatus {
  return {
    provider: "openai",
    model: "gpt-5.4-mini",
    permissions: {
      editDocuments: true,
      createFolders: false,
      createDocuments: true,
      deleteDocumentsAndFolders: false,
      generateImages: true,
      createImageAssets: true,
      insertImagesIntoDocuments: true,
      useDocumentContextForImageGeneration: true,
    },
    rag: { enabled: true, vectorStoreId: null, lastIndexedAt: null, status: "not-indexed", error: null },
    vision: {
      enabled: true,
      model: "gpt-5.4-mini",
      imageIndexingEnabled: false,
      maxImagesPerPrompt: 4,
      maxImageSizeMb: 12,
      detail: "auto",
      storeVisualDescriptions: true,
    },
    imageGeneration: {
      enabled: true,
      model: "gpt-image-2",
      size: "auto",
      quality: "auto",
      outputFormat: "png",
      defaultFolder: "document_folder",
      customFolderPath: "assets/generated",
      maxImagesPerPrompt: 1,
      confirmBeforeDocumentInsert: false,
      confirmBeforeUsingMultipleSources: true,
      storePromptMetadata: true,
    },
    agentic: {
      depth: "guided",
      webResearchEnabled: true,
      confirmBeforeApplying: true,
      maxSteps: 4,
      maxDocuments: 6,
      maxEstimatedCostEur: 1,
      maxSources: 500,
      researchDiagramsEnabled: true,
      researchImagesEnabled: true,
      researchPresets: {
        quick: { candidateSourceLimit: 50, diagramsEnabled: false, imagesEnabled: false },
        deep: { candidateSourceLimit: 500, diagramsEnabled: true, imagesEnabled: true },
        compare: { candidateSourceLimit: 200, diagramsEnabled: true, imagesEnabled: false },
        currentDocument: { candidateSourceLimit: 10, diagramsEnabled: true, imagesEnabled: false },
      },
    },
    transcription: {
      enabled: true,
      model: "gpt-4o-mini-transcribe",
      defaultTarget: "prompt",
      defaultLanguage: "auto",
      favoriteLanguages: ["es", "en"],
    },
    diagrams: {
      enabled: true,
      visualProfile: "visual_local",
      iconSet: "lucide",
      imagePolicy: "project_assets",
      betaPolicy: "ask",
      defaultWidth: "wide",
      aiGenerationMode: "visual",
    },
    openaiKeyConfigured: false,
    openaiKeyPreview: null,
  };
}

function defaultExportTemplate(): ExportTemplateConfig {
  return {
    schemaVersion: 2,
    name: "basic",
    page: { size: "A4", margins: { topMm: 20, rightMm: 18, bottomMm: 20, leftMm: 18 } },
    normal: { fontFamily: "Arial", fontSizePt: 11, color: "#111827", textFormat: "normal" },
    headingFontFamily: "Arial",
    headings: {
      h1: { fontFamily: "Arial", fontSizePt: 22, color: "#111827", textFormat: "bold", spaceBeforePt: 12, spaceAfterPt: 8 },
      h2: { fontFamily: "Arial", fontSizePt: 18, color: "#111827", textFormat: "bold", spaceBeforePt: 10, spaceAfterPt: 6 },
      h3: { fontFamily: "Arial", fontSizePt: 15, color: "#111827", textFormat: "bold", spaceBeforePt: 8, spaceAfterPt: 5 },
      h4: { fontFamily: "Arial", fontSizePt: 13, color: "#111827", textFormat: "bold", spaceBeforePt: 6, spaceAfterPt: 4 },
      h5: { fontFamily: "Arial", fontSizePt: 12, color: "#111827", textFormat: "bold", spaceBeforePt: 4, spaceAfterPt: 3 },
      h6: { fontFamily: "Arial", fontSizePt: 11, color: "#111827", textFormat: "bold", spaceBeforePt: 3, spaceAfterPt: 3 },
    },
    code: { fontFamily: "Consolas", fontSizePt: 9.5, color: "#111827", textFormat: "normal" },
    paragraph: { lineSpacing: 1.2, spaceBeforePt: 0, spaceAfterPt: 3 },
    document: { includeTitle: false, linkColor: "#D85A12", horizontalRuleColor: "#E5E7EB", diagramResolution: "medium" },
    updatedAt: nowIso(),
  };
}

function parseRoute(path: string) {
  return new URL(path, "http://knownext-web-dev.local");
}

function matches(segments: string[], expected: string[]) {
  return segments.length === expected.length && expected.every((segment, index) => segment === segments[index]);
}

function ok<T>(body: T): WebDevLocalApiResponse<T> {
  return { status: 200, body };
}

function notFound(detail: string): WebDevLocalApiResponse {
  return { status: 404, body: { detail } };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function compactId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function documentId(projectId: string, path: string) {
  return `${projectId}:${path.replace(/\\/g, "/")}`;
}

function sanitizeName(name: string, fallback: string) {
  const trimmed = name.trim().replace(/[\\/]+/g, "-");
  return trimmed || fallback;
}

function compareTreeNodes(first: DocumentTreeNode, second: DocumentTreeNode) {
  if (first.type === "folder" && second.type !== "folder") return -1;
  if (first.type !== "folder" && second.type === "folder") return 1;
  return first.name.localeCompare(second.name);
}

function contentHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return `web-${Math.abs(hash).toString(16)}`;
}

function nowIso() {
  return new Date().toISOString();
}
