import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Image as ImageIcon, Maximize2, Minus, PanelLeftClose, PanelLeftOpen, Plus, Upload, X } from "lucide-react";
import { AiConversationView } from "../features/assistant/AiConversationView";
import { AiPromptInput, type AiPromptExecutionOptions } from "../features/assistant/AiPromptInput";
import { AiResponseBubble } from "../features/assistant/AiResponseBubble";
import { DocumentStatusBar } from "../features/documents/DocumentStatusBar";
import { DocumentTabs } from "../features/documents/DocumentTabs";
import { DocumentTree, type DocumentTreeAction } from "../features/documents/DocumentTree";
import { ImageViewer } from "../features/documents/ImageViewer";
import { MarkdownToolbar } from "../features/editor/MarkdownToolbar";
import {
  emptyMarkdownEditorHistoryState,
  emptyMarkdownEditorFormatState,
  type MarkdownEditorAction,
  type MarkdownEditorActionOptions,
  type MarkdownEditorController,
  type MarkdownEditorExternalOperation,
  type MarkdownEditorFormatState,
  type MarkdownEditorHistoryState,
  type MarkdownEditorSelection,
} from "../features/editor/editorTypes";
import { ProjectActions } from "../features/projects/ProjectActions";
import { ProjectSelector } from "../features/projects/ProjectSelector";
import { ReleaseNotesViewer } from "../features/releaseNotes/ReleaseNotesViewer";
import { VersionHistoryPanel } from "../features/versions/VersionHistoryPanel";
import { BrandMark } from "../components/brand/BrandMark";
import { TitleBar } from "../components/window/TitleBar";
import { getProjectImageContentUrl } from "../lib/api/projects";
import type { AiConfigStatus, AiContextSearchResult, AiContextSource, AiContextSourcePreviewResponse, AiConversationEvent, AiIndexStatusResponse, AiIntentActionType, AiPendingIntent, AiSelectionFocus, AiUsageSummaryResponse, AppearanceConfig, AssetImportResponse, AssetMetadata, AuthStatus, CreateVersionResponse, DocumentConflictStatus, DocumentRecord, DocumentTreeNode, InsertImageReferenceResponse, LayoutConfig, Project, ProjectVersioningStatus, WorkspaceTab } from "../types/domain";

const sidebarWidthConfig = {
  defaultWidth: 338,
  minWidth: 260,
  maxWidth: 480,
};

const historyWidthConfig = {
  defaultWidth: 320,
  minWidth: 280,
  maxWidth: 460,
};

const MarkdownEditor = lazy(() => import("../features/editor/MarkdownEditor").then((module) => ({ default: module.MarkdownEditor })));

type DesktopLayoutProps = {
  appVersion: string;
  appLanguage: AppearanceConfig["language"];
  markdownExtendedUnderlineEnabled: boolean;
  authStatus: AuthStatus;
  projects: Project[];
  activeProject: Project | null;
  aiConfig: AiConfigStatus;
  aiIndexStatus: AiIndexStatusResponse | null;
  aiConversationEvents: AiConversationEvent[];
  aiUsageSummary: AiUsageSummaryResponse | null;
  aiPendingIntent: AiPendingIntent | null;
  aiBubble: { id: string; answer: string } | null;
  aiAppliedChange: { documentId: string; summary: string } | null;
  aiSelectionFocus: AiSelectionFocus | null;
  aiContextSources: AiContextSource[];
  tree: DocumentTreeNode[];
  tabs: WorkspaceTab[];
  activeTabId: string;
  activeDocumentId: string;
  activeImageId: string;
  editorSessions: EditorDocumentSession[];
  releaseNotesMarkdown: string;
  activeDocument: DocumentRecord | null;
  activeMarkdown: string;
  activeDocumentDirty: boolean;
  pendingEditorOperations: MarkdownEditorExternalOperation[];
  activeDocumentConflictStatus: DocumentConflictStatus;
  activeDocumentHasRecoveredDraft: boolean;
  activeDocumentDiskChanged: boolean;
  dirtyDocumentIds: string[];
  orphanDraftCount: number;
  isCheckingForUpdates: boolean;
  saveState: "idle" | "saving" | "saved";
  historyOpen: boolean;
  historyEnabled: boolean;
  versioningStatus: ProjectVersioningStatus | null;
  layoutConfig: LayoutConfig;
  onSelectProject: (project: Project) => void;
  onCreateProject: () => void;
  onConfigureProject: () => void;
  onOpenAppSettings: () => void;
  onCreateFolder: () => void;
  onImportProjectFile: () => void;
  onRenameNode: (nodeId: string, name: string) => void;
  onToggleNode: (nodeId: string) => void;
  onExpandTree: () => void;
  onCollapseTree: () => void;
  onCreateDocument: () => void;
  onOpenRecoverableDrafts: () => void;
  onCheckForUpdates: () => void;
  onOpenReleaseNotes: () => void;
  onLoginGithub: () => void;
  onLogout: () => void;
  onPullProject: () => void;
  onPushProject: () => void;
  onCreateVersion: (title: string) => Promise<CreateVersionResponse | null>;
  onSendAiPrompt: (prompt: string, selectionFocus?: AiSelectionFocus | null, options?: AiPromptExecutionOptions) => void | Promise<void>;
  onAiTranscriptionChange: (transcription: Partial<AiConfigStatus["transcription"]>) => void;
  onClearAiSelectionFocus: () => void;
  onSearchAiContextDocuments: (query: string) => Promise<AiContextSearchResult[]>;
  onAddProjectDocumentContext: (documentId: string) => void | Promise<void>;
  onAddProjectImageContext: (assetId: string) => void | Promise<void>;
  onUploadAiContextFiles: (files: File[]) => void | Promise<void>;
  onRemoveAiContextSource: (sourceId: string) => void | Promise<void>;
  onExtendAiContextSource: (sourceId: string) => void | Promise<void>;
  onPreviewAiContextSource: (sourceId: string) => Promise<AiContextSourcePreviewResponse>;
  onAddAiContextSourceToProject: (sourceId: string) => void | Promise<void>;
  onAiIntentAction: (action: AiIntentActionType, intentId: string) => void | Promise<void>;
  onCloseAiBubble: () => void;
  onDismissAiAppliedChange: () => void;
  onOpenAiConversation: () => void;
  isSyncingProject: boolean;
  onOpenDocument: (documentId: string, name: string) => void;
  onOpenImage: (assetId: string, name: string, path: string) => void;
  onSelectTab: (documentId: string) => void;
  onCloseTab: (documentId: string) => void;
  onTreeContextAction: (action: DocumentTreeAction, node: DocumentTreeNode) => void;
  onMoveTreeNode: (node: DocumentTreeNode, targetFolderId: string | null) => void | Promise<void>;
  onImportProjectImage: (parentId: string | null, file: File) => Promise<AssetImportResponse>;
  onBuildImageReference: (documentId: string, assetId: string, altText?: string | null) => Promise<InsertImageReferenceResponse>;
  onInsertImageIntoActiveDocument: (assetId: string) => void | Promise<void>;
  onMarkdownChange: (documentId: string, markdown: string) => void;
  onEditorOperationApplied: (operationId: string) => void;
  onEditorOperationFailed: (operation: MarkdownEditorExternalOperation) => void;
  onDocumentSelectionChange: (documentId: string, selection: MarkdownEditorSelection | null) => void;
  onSave: () => void;
  onKeepLocalVersion: () => void;
  onLoadDiskVersion: () => void;
  onToggleHistory: () => void;
  onCloseHistory: () => void;
  onLayoutConfigChange: (layoutConfig: Partial<LayoutConfig>) => void;
};

type EditorDocumentSession = {
  documentId: string;
  document: DocumentRecord | null;
  markdown: string;
  editorKey: string;
  isLoading: boolean;
};

export function DesktopLayout(props: DesktopLayoutProps) {
  const [editorControllers, setEditorControllers] = useState<Record<string, MarkdownEditorController>>({});
  const [editorFormatState, setEditorFormatState] = useState<MarkdownEditorFormatState>(emptyMarkdownEditorFormatState);
  const [editorHistoryStates, setEditorHistoryStates] = useState<Record<string, MarkdownEditorHistoryState>>({});
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [desktopNavigationVisible, setDesktopNavigationVisible] = useState(true);
  const [imageZoomPercent, setImageZoomPercent] = useState(100);
  const [imageFitToWindow, setImageFitToWindow] = useState(true);
  const [activeImageAsset, setActiveImageAsset] = useState<AssetMetadata | null>(null);
  const activeWorkspaceTab = props.tabs.find((tab) => tab.id === props.activeTabId);
  const hasOpenDocument = activeWorkspaceTab?.kind === "document" && Boolean(props.activeDocumentId);
  const hasOpenImage = activeWorkspaceTab?.kind === "image" && Boolean(props.activeImageId);
  const hasReleaseNotes = activeWorkspaceTab?.kind === "release-notes";
  const hasAiConversation = activeWorkspaceTab?.kind === "ai-conversation";
  const hasOpenTab = hasOpenDocument || hasOpenImage || hasReleaseNotes || hasAiConversation;
  const activeEditorController = editorControllers[props.activeDocumentId] ?? null;
  const activeEditorHistoryState = editorHistoryStates[props.activeDocumentId] ?? emptyMarkdownEditorHistoryState;
  const sidebar = useResizablePanelWidth({
    ...sidebarWidthConfig,
    width: props.layoutConfig.sidebarWidth,
    resizeEdge: "right",
    onWidthChange: (sidebarWidth) => props.onLayoutConfigChange({ sidebarWidth }),
  });
  const history = useResizablePanelWidth({
    ...historyWidthConfig,
    width: props.layoutConfig.historyWidth,
    resizeEdge: "left",
    onWidthChange: (historyWidth) => props.onLayoutConfigChange({ historyWidth }),
  });

  useEffect(() => {
    setActiveImageAsset(null);
    setImageFitToWindow(true);
    setImageZoomPercent(100);
  }, [props.activeImageId]);

  const handleRunEditorAction = useCallback((action: MarkdownEditorAction, options?: MarkdownEditorActionOptions) => {
    if (!activeEditorController) return;
    if (action === "image" && !options?.image) {
      setImageInsertOpen(true);
      return;
    }

    activeEditorController.run(action, options);
    setEditorFormatState((currentFormatState) => keepStableFormatState(currentFormatState, activeEditorController.getFormatState()));
    setEditorHistoryStates((currentHistoryStates) => keepStableHistoryStateForDocument(currentHistoryStates, props.activeDocumentId, activeEditorController.getHistoryState()));
  }, [activeEditorController, props.activeDocumentId]);

  const handlePreviewDocumentDictation = useCallback((text: string) => {
    activeEditorController?.setTransientTextPreview(text);
  }, [activeEditorController]);

  const handleCommitDocumentDictation = useCallback((text: string) => {
    if (!activeEditorController || !text) return;
    activeEditorController.clearTransientTextPreview();
    activeEditorController.insertText(text, { addToHistory: true });
    setEditorFormatState((currentFormatState) => keepStableFormatState(currentFormatState, activeEditorController.getFormatState()));
    setEditorHistoryStates((currentHistoryStates) => keepStableHistoryStateForDocument(currentHistoryStates, props.activeDocumentId, activeEditorController.getHistoryState()));
  }, [activeEditorController, props.activeDocumentId]);

  const handleClearDocumentDictationPreview = useCallback(() => {
    activeEditorController?.clearTransientTextPreview();
  }, [activeEditorController]);

  const handleEditorControllerChange = useCallback((documentId: string, controller: MarkdownEditorController | null) => {
    setEditorControllers((currentControllers) => {
      if (!controller) {
        const { [documentId]: _removedController, ...nextControllers } = currentControllers;
        return nextControllers;
      }
      return { ...currentControllers, [documentId]: controller };
    });
    if (documentId === props.activeDocumentId) {
      setEditorFormatState((currentFormatState) =>
        keepStableFormatState(currentFormatState, controller ? controller.getFormatState() : emptyMarkdownEditorFormatState),
      );
      setEditorHistoryStates((currentHistoryStates) =>
        keepStableHistoryStateForDocument(currentHistoryStates, documentId, controller ? controller.getHistoryState() : emptyMarkdownEditorHistoryState),
      );
    }
    if (!controller) {
      setEditorHistoryStates((currentHistoryStates) => {
        const { [documentId]: _removedHistoryState, ...nextHistoryStates } = currentHistoryStates;
        return nextHistoryStates;
      });
    }
  }, [props.activeDocumentId]);

  useEffect(() => {
    setEditorFormatState((currentFormatState) =>
      keepStableFormatState(currentFormatState, activeEditorController ? activeEditorController.getFormatState() : emptyMarkdownEditorFormatState),
    );
    setEditorHistoryStates((currentHistoryStates) =>
      keepStableHistoryStateForDocument(currentHistoryStates, props.activeDocumentId, activeEditorController ? activeEditorController.getHistoryState() : emptyMarkdownEditorHistoryState),
    );
  }, [activeEditorController, props.activeDocumentId]);

  useEffect(() => {
    if (props.pendingEditorOperations.length === 0) return;

    for (const operation of props.pendingEditorOperations) {
      const controller = editorControllers[operation.documentId];
      if (!controller) continue;

      const session = props.editorSessions.find((candidate) => candidate.documentId === operation.documentId);
      const markdown = session?.document
        ? materializeProjectImageReferences(operation.markdown, props.activeProject?.id ?? "", session.document.path, props.tree)
        : operation.markdown;
      const applied = controller.replaceMarkdown(markdown, { addToHistory: operation.addToHistory ?? true });
      if (!applied) {
        props.onEditorOperationFailed(operation);
        continue;
      }

      setEditorHistoryStates((currentHistoryStates) =>
        keepStableHistoryStateForDocument(currentHistoryStates, operation.documentId, controller.getHistoryState()),
      );
      if (operation.documentId === props.activeDocumentId) {
        setEditorFormatState((currentFormatState) => keepStableFormatState(currentFormatState, controller.getFormatState()));
      }
      props.onEditorOperationApplied(operation.id);
    }
  }, [
    editorControllers,
    props.activeDocumentId,
    props.activeProject?.id,
    props.editorSessions,
    props.onEditorOperationApplied,
    props.onEditorOperationFailed,
    props.pendingEditorOperations,
    props.tree,
  ]);

  useEffect(() => {
    if (!navigationOpen) return;

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setNavigationOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [navigationOpen]);

  useEffect(() => {
    if (!props.historyOpen || navigationOpen) return;

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") props.onCloseHistory();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [navigationOpen, props.historyOpen, props.onCloseHistory]);

  const handleOpenDocument = useCallback((documentId: string, name: string) => {
    props.onOpenDocument(documentId, name);
    setNavigationOpen(false);
  }, [props.onOpenDocument]);

  const [imageInsertOpen, setImageInsertOpen] = useState(false);

  const activeStatus = getDocumentStatus({
    saveState: props.saveState,
    isDirty: props.activeDocumentDirty,
    hasRecoveredDraft: props.activeDocumentHasRecoveredDraft,
    conflictStatus: props.activeDocumentConflictStatus,
    diskChanged: props.activeDocumentDiskChanged || props.activeDocumentConflictStatus === "disk-changed",
  });

  return (
    <div className="h-screen overflow-hidden bg-white text-ink-primary">
      <TitleBar />
      <div className="relative flex h-[calc(100vh-36px)]">
        {navigationOpen ? (
          <button
            className="fixed inset-x-0 bottom-0 top-9 z-40 bg-black/20 lg:hidden"
            aria-label="Cerrar panel de documentos"
            onClick={() => setNavigationOpen(false)}
          />
        ) : null}
        <aside
          className={[
            "absolute inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-line bg-panel shadow-menu transition-transform duration-200 ease-out lg:relative lg:translate-x-0 lg:shadow-none",
            navigationOpen ? "translate-x-0" : "-translate-x-full",
            desktopNavigationVisible ? "" : "lg:hidden",
          ].join(" ")}
          style={{ width: sidebar.width, maxWidth: "calc(100vw - 48px)" }}
        >
          <div className="px-4 pb-2 pt-3">
            <ProjectSelector
              projects={props.projects}
              activeProject={props.activeProject}
              language={props.appLanguage}
              headerAction={
                <>
                  <button
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange lg:hidden"
                    data-tooltip="Ocultar documentos"
                    data-tooltip-placement="bottom"
                    aria-label="Ocultar panel de documentos"
                    onClick={() => setNavigationOpen(false)}
                  >
                    <PanelLeftClose size={16} />
                  </button>
                  <button
                    className="hidden h-8 w-8 shrink-0 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange lg:grid"
                    data-tooltip="Ocultar documentos"
                    data-tooltip-placement="bottom"
                    aria-label="Ocultar panel de documentos"
                    onClick={() => setDesktopNavigationVisible(false)}
                  >
                    <PanelLeftClose size={16} />
                  </button>
                </>
              }
              onSelectProject={props.onSelectProject}
              onCreateProject={props.onCreateProject}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-1.5">
            {props.activeProject ? (
              <DocumentTree
                nodes={props.tree}
                activeDocumentId={props.activeDocumentId}
                hasActiveProject={Boolean(props.activeProject)}
                onOpenDocument={handleOpenDocument}
                onOpenImage={props.onOpenImage}
                onCreateFolder={props.onCreateFolder}
                onCreateDocument={props.onCreateDocument}
                onImportFile={props.onImportProjectFile}
                onExpandTree={props.onExpandTree}
                onCollapseTree={props.onCollapseTree}
                onConfigureProject={props.onConfigureProject}
                onRenameNode={props.onRenameNode}
                onToggleNode={props.onToggleNode}
                onContextAction={props.onTreeContextAction}
                onMoveNode={props.onMoveTreeNode}
              />
            ) : null}
          </div>
          <ProjectActions
            appVersion={props.appVersion}
            language={props.appLanguage}
            authStatus={props.authStatus}
            aiUsageSummary={props.aiUsageSummary}
            orphanDraftCount={props.orphanDraftCount}
            onLoginGithub={props.onLoginGithub}
            onLogout={props.onLogout}
            onOpenAppSettings={props.onOpenAppSettings}
            onOpenRecoverableDrafts={props.onOpenRecoverableDrafts}
            onCheckForUpdates={props.onCheckForUpdates}
            onOpenReleaseNotes={props.onOpenReleaseNotes}
            isCheckingForUpdates={props.isCheckingForUpdates}
          />
        </aside>
        {desktopNavigationVisible ? (
          <div className="hidden lg:block">
            <PanelResizeHandle
              label="Cambiar anchura del árbol de documentos"
              minWidth={sidebarWidthConfig.minWidth}
              maxWidth={sidebarWidthConfig.maxWidth}
              value={sidebar.width}
              isResizing={sidebar.isResizing}
              onPointerDown={sidebar.startResize}
              onKeyDown={sidebar.resizeWithKeyboard}
            />
          </div>
        ) : (
          <div className="hidden w-11 shrink-0 border-r border-line bg-panel px-1.5 py-3 lg:flex lg:flex-col lg:items-center">
            <button
              className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
              data-tooltip="Mostrar documentos"
              data-tooltip-placement="right"
              aria-label="Mostrar panel de documentos"
              onClick={() => setDesktopNavigationVisible(true)}
            >
              <PanelLeftOpen size={16} />
            </button>
            <div className="mt-auto">
              <ProjectActions
                compact
                appVersion={props.appVersion}
                language={props.appLanguage}
                authStatus={props.authStatus}
                aiUsageSummary={props.aiUsageSummary}
                orphanDraftCount={props.orphanDraftCount}
                onLoginGithub={props.onLoginGithub}
                onLogout={props.onLogout}
                onOpenAppSettings={props.onOpenAppSettings}
                onOpenRecoverableDrafts={props.onOpenRecoverableDrafts}
                onCheckForUpdates={props.onCheckForUpdates}
                onOpenReleaseNotes={props.onOpenReleaseNotes}
                isCheckingForUpdates={props.isCheckingForUpdates}
              />
            </div>
          </div>
        )}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          {hasOpenTab ? (
            <>
          <DocumentTabs
            tabs={props.tabs}
            activeTabId={props.activeTabId}
            dirtyDocumentIds={props.dirtyDocumentIds}
            onOpenNavigation={() => setNavigationOpen(true)}
            onSelectTab={props.onSelectTab}
            onCloseTab={props.onCloseTab}
          />
              {hasReleaseNotes || hasAiConversation || hasOpenImage ? null : (
              <MarkdownToolbar
                historyOpen={props.historyOpen}
                historyEnabled={props.historyEnabled}
                historyDisabledReason={getHistoryDisabledReason(props.activeProject, props.authStatus, props.versioningStatus)}
                editorReady={activeEditorController !== null}
                extendedUnderlineEnabled={props.markdownExtendedUnderlineEnabled}
                activeActions={editorFormatState}
                editorHistoryState={activeEditorHistoryState}
                onRunEditorAction={handleRunEditorAction}
                onToggleHistory={props.onToggleHistory}
              />
              )}
            </>
          ) : null}
          <div className="flex min-h-0 flex-1">
            <section className={["relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", hasOpenTab ? "bg-white" : "bg-panel"].join(" ")}>
              {hasOpenTab ? (
                <>
                  <div className={hasAiConversation || hasOpenImage ? "mb-[54px] min-h-0 flex-1 overflow-hidden" : "mb-[54px] min-h-0 flex-1 overflow-y-auto px-8 pb-6 pt-4"}>
                    <div className={hasAiConversation || hasOpenImage ? "h-full min-h-0 w-full" : "mx-auto max-w-[900px]"}>
                      {hasReleaseNotes ? (
                        <ReleaseNotesViewer markdown={props.releaseNotesMarkdown} />
                      ) : hasAiConversation ? (
                        <AiConversationView
                          project={props.activeProject}
                          config={props.aiConfig}
                          indexStatus={props.aiIndexStatus}
                          events={props.aiConversationEvents}
                          pendingIntent={props.aiPendingIntent}
                          onIntentAction={props.onAiIntentAction}
                        />
                      ) : hasOpenImage && activeWorkspaceTab?.kind === "image" && props.activeProject ? (
                        <ImageViewer
                          project={props.activeProject}
                          assetId={activeWorkspaceTab.id}
                          name={activeWorkspaceTab.name}
                          path={activeWorkspaceTab.path}
                          zoomPercent={imageZoomPercent}
                          fitToWindow={imageFitToWindow}
                          onAddToAiContext={props.onAddProjectImageContext}
                          onInsertIntoActiveDocument={props.onInsertImageIntoActiveDocument}
                          onAssetMetadataChange={setActiveImageAsset}
                          onOpenReference={handleOpenDocument}
                        />
                      ) : (
                        <>
                      {props.activeDocumentDiskChanged || props.activeDocumentConflictStatus === "orphaned" ? (
                        <DocumentConflictBanner
                          conflictStatus={props.activeDocumentConflictStatus}
                          onKeepLocalVersion={props.onKeepLocalVersion}
                          onLoadDiskVersion={props.onLoadDiskVersion}
                        />
                      ) : null}
                      {props.editorSessions.map((session) => (
                        <div key={session.documentId} className={session.documentId === props.activeDocumentId ? "" : "hidden"}>
                          {session.document ? (
                            <Suspense fallback={<div className="pt-6 text-[11px] text-ink-secondary">Cargando editor...</div>}>
                              <MarkdownEditor
                                key={session.editorKey}
                                documentKey={session.editorKey}
                                markdown={materializeProjectImageReferences(session.markdown, props.activeProject?.id ?? "", session.document.path, props.tree)}
                                onChange={(markdown) => props.onMarkdownChange(session.documentId, restoreProjectImageReferences(markdown, props.activeProject?.id ?? "", session.document!.path, props.tree))}
                                onControllerChange={(controller) => handleEditorControllerChange(session.documentId, controller)}
                                onFormatStateChange={(formatState) => {
                                  if (session.documentId === props.activeDocumentId) {
                                    setEditorFormatState((currentFormatState) => keepStableFormatState(currentFormatState, formatState));
                                  }
                                }}
                                onHistoryStateChange={(historyState) => {
                                  setEditorHistoryStates((currentHistoryStates) =>
                                    keepStableHistoryStateForDocument(currentHistoryStates, session.documentId, historyState),
                                  );
                                }}
                                onSelectionChange={(selection) => props.onDocumentSelectionChange(session.documentId, selection)}
                                selectionFocus={toMarkdownEditorSelection(props.aiSelectionFocus, session.documentId)}
                              />
                            </Suspense>
                          ) : (
                            <div className="pt-6 text-[11px] text-ink-secondary">Cargando documento...</div>
                          )}
                        </div>
                      ))}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-[90px] h-4 bg-gradient-to-t from-[rgb(var(--app-surface))] to-transparent" />
                </>
              ) : (
                <>
                  <button
                    className="absolute left-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-md border border-line bg-white text-ink-secondary shadow-subtle hover:bg-brand-hover hover:text-brand-orange lg:hidden"
                    data-tooltip="Abrir documentos"
                    data-tooltip-placement="bottom"
                    aria-label="Abrir panel de documentos"
                    onClick={() => setNavigationOpen(true)}
                  >
                    <PanelLeftOpen size={16} />
                  </button>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <BrandMark variant="watermark" className="w-[min(420px,44vw)] max-w-[62%]" />
                  </div>
                </>
              )}
              <AiPromptInput
                documentId={hasOpenDocument ? props.activeDocumentId : undefined}
                projectId={props.activeProject?.id}
                markdown={hasOpenDocument ? props.activeMarkdown : ""}
                providerReady={props.aiConfig.openaiKeyConfigured}
                transcriptionConfig={props.aiConfig.transcription}
                documentDictationReady={Boolean(hasOpenDocument && activeEditorController?.canInsertText())}
                appliedChangeSummary={props.aiAppliedChange?.documentId === props.activeDocumentId ? props.aiAppliedChange.summary : null}
                selectionFocus={props.aiSelectionFocus?.documentId === props.activeDocumentId ? props.aiSelectionFocus : null}
                activeContextSources={props.aiContextSources}
                onSubmit={props.onSendAiPrompt}
                onTranscriptionConfigChange={props.onAiTranscriptionChange}
                onPreviewDocumentDictation={handlePreviewDocumentDictation}
                onCommitDocumentDictation={handleCommitDocumentDictation}
                onClearDocumentDictationPreview={handleClearDocumentDictationPreview}
                onClearSelectionFocus={props.onClearAiSelectionFocus}
                onDismissAppliedChange={props.onDismissAiAppliedChange}
                onSearchProjectDocuments={props.onSearchAiContextDocuments}
                onAddProjectDocumentContext={props.onAddProjectDocumentContext}
                onUploadContextFiles={props.onUploadAiContextFiles}
                onRemoveContextSource={props.onRemoveAiContextSource}
                onExtendContextSource={props.onExtendAiContextSource}
                onPreviewContextSource={props.onPreviewAiContextSource}
                onAddContextSourceToProject={props.onAddAiContextSourceToProject}
              />
              {hasOpenDocument ? (
                <AiResponseBubble
                  bubble={props.aiBubble}
                  pendingIntent={props.aiPendingIntent}
                  onIntentAction={props.onAiIntentAction}
                  onClose={props.onCloseAiBubble}
                  onOpenConversation={props.onOpenAiConversation}
                />
              ) : null}
              {imageInsertOpen && props.activeProject && hasOpenDocument ? (
                <InsertImageDialog
                  activeDocumentId={props.activeDocumentId}
                  activeDocumentPath={props.activeDocument?.path ?? null}
                  tree={props.tree}
                  onClose={() => setImageInsertOpen(false)}
                  onImportImage={props.onImportProjectImage}
                  onBuildReference={props.onBuildImageReference}
                  onInsert={(markdown) => {
                    const materializedMarkdown = materializeProjectImageReferences(
                      markdown,
                      props.activeProject?.id ?? "",
                      props.activeDocument?.path ?? "",
                      props.tree,
                    );
                    activeEditorController?.run("image", parseImageMarkdown(materializedMarkdown));
                    setImageInsertOpen(false);
                  }}
                />
              ) : null}
              {hasOpenDocument ? (
                <DocumentStatusBar
                  statusLabel={activeStatus.label}
                  statusTone={activeStatus.tone}
                  isDirty={props.activeDocumentDirty}
                  saveState={props.saveState}
                  wordCount={props.activeDocument?.wordCount ?? countWords(props.activeMarkdown)}
                  characterCount={countCharacters(props.activeMarkdown)}
                  gitEnabled={props.historyEnabled}
                  versioningLabel={props.versioningStatus?.statusLabel ?? "Sin historial"}
                  lastVersionHash={props.versioningStatus?.lastVersionHash}
                  lastVersionRelativeTime={props.versioningStatus?.lastVersionRelativeTime}
                  canSave={Boolean(props.activeDocument && props.activeDocumentId)}
                  onSave={props.onSave}
                />
              ) : hasOpenImage && activeWorkspaceTab?.kind === "image" ? (
                <ImageWorkspaceStatusBar
                  name={activeWorkspaceTab.name}
                  asset={activeImageAsset}
                  zoomPercent={imageZoomPercent}
                  fitToWindow={imageFitToWindow}
                  onZoomChange={(nextZoom) => {
                    setImageFitToWindow(false);
                    setImageZoomPercent(clamp(Math.round(nextZoom), 10, 200));
                  }}
                  onFitToWindow={() => setImageFitToWindow(true)}
                />
              ) : hasOpenTab ? (
                <WorkspaceStatusBar
                  kind={getWorkspaceStatusKind(activeWorkspaceTab?.kind)}
                  title={getWorkspaceStatusTitle(activeWorkspaceTab, props.aiConfig.openaiKeyConfigured)}
                  detail={getWorkspaceStatusDetail(activeWorkspaceTab, props.activeProject?.name)}
                />
              ) : null}
            </section>
            {props.historyOpen && hasOpenDocument ? (
              <>
                <button
                  className="fixed inset-x-0 bottom-0 top-9 z-40 bg-black/20 lg:hidden"
                  aria-label="Cerrar historial de versiones"
                  onClick={props.onCloseHistory}
                />
                <div className="hidden lg:block">
                  <PanelResizeHandle
                    label="Cambiar anchura del historial de versiones"
                    minWidth={historyWidthConfig.minWidth}
                    maxWidth={historyWidthConfig.maxWidth}
                    value={history.width}
                    isResizing={history.isResizing}
                    onPointerDown={history.startResize}
                    onKeyDown={history.resizeWithKeyboard}
                  />
                </div>
                <div
                  className="fixed bottom-0 right-0 top-9 z-50 flex shrink-0 shadow-menu lg:relative lg:inset-auto lg:z-auto lg:shadow-none"
                  style={{ width: history.width, maxWidth: "calc(100vw - 48px)" }}
                >
                  <VersionHistoryPanel
                    documentId={props.activeDocumentId}
                    syncMode={props.activeProject?.syncMode ?? "none"}
                    isSyncing={props.isSyncingProject}
                    onPullProject={props.onPullProject}
                    onPushProject={props.onPushProject}
                    onCreateVersion={props.onCreateVersion}
                    onClose={props.onCloseHistory}
                  />
                </div>
              </>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

type ResizablePanelConfig = {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  width: number;
  resizeEdge: "left" | "right";
  onWidthChange: (width: number) => void;
};

function useResizablePanelWidth({ defaultWidth, minWidth, maxWidth, width, resizeEdge, onWidthChange }: ResizablePanelConfig) {
  const [isResizing, setIsResizing] = useState(false);
  const clampedWidth = clamp(Number.isFinite(width) ? width : defaultWidth, minWidth, maxWidth);

  const resizeWithKeyboard = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextDelta = resizeEdge === "right" ? direction * 16 : direction * -16;
      onWidthChange(clamp(clampedWidth + nextDelta, minWidth, maxWidth));
    },
    [clampedWidth, maxWidth, minWidth, onWidthChange, resizeEdge],
  );

  const startResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = clampedWidth;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      function handlePointerMove(moveEvent: globalThis.PointerEvent) {
        const pointerDelta = moveEvent.clientX - startX;
        const nextDelta = resizeEdge === "right" ? pointerDelta : -pointerDelta;
        onWidthChange(clamp(startWidth + nextDelta, minWidth, maxWidth));
      }

      function stopResize() {
        setIsResizing(false);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", stopResize);
        window.removeEventListener("pointercancel", stopResize);
      }

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResize);
      window.addEventListener("pointercancel", stopResize);
    },
    [clampedWidth, maxWidth, minWidth, onWidthChange, resizeEdge],
  );

  return { width: clampedWidth, isResizing, startResize, resizeWithKeyboard };
}

function clamp(value: number, min: number, max: number) {
  return Math.round(Math.min(Math.max(value, min), max));
}

function InsertImageDialog({
  activeDocumentId,
  activeDocumentPath,
  tree,
  onClose,
  onImportImage,
  onBuildReference,
  onInsert,
}: {
  activeDocumentId: string;
  activeDocumentPath: string | null;
  tree: DocumentTreeNode[];
  onClose: () => void;
  onImportImage: (parentId: string | null, file: File) => Promise<AssetImportResponse>;
  onBuildReference: (documentId: string, assetId: string, altText?: string | null) => Promise<InsertImageReferenceResponse>;
  onInsert: (markdown: string) => void;
}) {
  const images = useMemo(() => collectImages(tree), [tree]);
  const uploadParentId = useMemo(() => resolveDocumentParentFolderId(tree, activeDocumentPath), [tree, activeDocumentPath]);
  const [mode, setMode] = useState<"project" | "upload" | "url">("project");
  const [query, setQuery] = useState("");
  const [altText, setAltText] = useState("");
  const [url, setUrl] = useState("https://");
  const [busy, setBusy] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState(images[0]?.id ?? "");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const visibleImages = images.filter((image) => {
    const value = `${image.name} ${image.path ?? ""}`.toLowerCase();
    return value.includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    if (!selectedAssetId && visibleImages[0]) setSelectedAssetId(visibleImages[0].id);
  }, [selectedAssetId, visibleImages]);

  async function insertSelectedAsset(assetId = selectedAssetId) {
    if (!assetId) return;
    setBusy(true);
    try {
      const reference = await onBuildReference(activeDocumentId, assetId, altText || null);
      onInsert(reference.markdown);
    } finally {
      setBusy(false);
    }
  }

  async function uploadAndInsert(file: File) {
    setBusy(true);
    try {
      const imported = await onImportImage(uploadParentId, file);
      const reference = await onBuildReference(activeDocumentId, imported.asset.id, altText || imported.asset.name.replace(/\.[^.]+$/, ""));
      onInsert(reference.markdown);
    } finally {
      setBusy(false);
    }
  }

  function insertUrl() {
    if (!url.trim()) return;
    const alt = altText.trim() || "Imagen";
    onInsert(`![${alt}](${url.trim()})`);
  }

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[98] grid place-items-center bg-black/20 px-4">
      <section className="flex max-h-[min(620px,calc(100vh-48px))] w-[min(640px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-primary">Insertar imagen</h2>
            <p className="mt-1 text-[11px] text-ink-secondary">Usa una imagen del proyecto, sube una nueva o enlaza una URL externa.</p>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="flex border-b border-line px-5 pt-3">
          {[
            ["project", "Proyecto"],
            ["upload", "Subir"],
            ["url", "URL"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={["h-8 border-b-2 px-3 text-[11px] font-semibold", mode === value ? "border-brand-orange text-brand-orange" : "border-transparent text-ink-secondary hover:text-ink-primary"].join(" ")}
              onClick={() => setMode(value as typeof mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label className="block text-[11px] font-semibold text-ink-secondary">
            Texto alternativo
            <input
              className="mt-1 h-9 w-full rounded-md border border-line px-3 text-[12px] text-ink-primary outline-none focus:border-brand-orange"
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              placeholder="Descripcion breve de la imagen"
            />
          </label>
          {mode === "project" ? (
            <div className="mt-4">
              <input
                className="h-9 w-full rounded-md border border-line px-3 text-[12px] outline-none focus:border-brand-orange"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar imagen del proyecto"
              />
              <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                {visibleImages.length === 0 ? (
                  <p className="rounded-md border border-line bg-panel px-3 py-4 text-center text-[11px] text-ink-secondary">No hay imagenes que coincidan.</p>
                ) : (
                  visibleImages.map((image) => (
                    <button
                      key={image.id}
                      className={["flex h-12 w-full items-center gap-3 rounded-md border px-3 text-left", selectedAssetId === image.id ? "border-orange-200 bg-brand-hover" : "border-line hover:bg-panel"].join(" ")}
                      onClick={() => setSelectedAssetId(image.id)}
                      onDoubleClick={() => void insertSelectedAsset(image.id)}
                    >
                      <ImageIcon size={15} className="text-brand-orange" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold text-ink-primary">{image.name}</span>
                        <span className="block truncate text-[10px] text-ink-secondary">{image.path}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : mode === "upload" ? (
            <div className="mt-4 rounded-md border border-dashed border-line bg-panel px-4 py-8 text-center">
              <Upload size={22} className="mx-auto text-brand-orange" />
              <p className="mt-2 text-[12px] font-semibold text-ink-primary">Subir imagen al proyecto</p>
              <p className="mt-1 text-[11px] text-ink-secondary">Se copiara al proyecto y se insertara una referencia relativa.</p>
              <button className="mt-4 h-8 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={() => fileInputRef.current?.click()}>
                Seleccionar imagen
              </button>
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void uploadAndInsert(file);
                }}
              />
            </div>
          ) : (
            <label className="mt-4 block text-[11px] font-semibold text-ink-secondary">
              URL de la imagen
              <input className="mt-1 h-9 w-full rounded-md border border-line px-3 text-[12px] outline-none focus:border-brand-orange" value={url} onChange={(event) => setUrl(event.target.value)} />
            </label>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onClose}>Cancelar</button>
          <button
            className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || (mode === "project" && !selectedAssetId)}
            onClick={() => {
              if (mode === "project") void insertSelectedAsset();
              if (mode === "upload") fileInputRef.current?.click();
              if (mode === "url") insertUrl();
            }}
          >
            {busy ? "Insertando" : "Insertar"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function collectImages(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.flatMap((node) => {
    if (node.type === "image") return [node];
    return node.children ? collectImages(node.children) : [];
  });
}

const markdownImageReferencePattern = /!\[([^\]]*)\]\(([^)\n]+)\)/g;

function materializeProjectImageReferences(markdown: string, projectId: string, documentPath: string, tree: DocumentTreeNode[]) {
  if (!projectId || !documentPath || !markdown.includes("](")) return markdown;
  const images = collectImages(tree);
  if (images.length === 0) return markdown;

  return markdown.replace(markdownImageReferencePattern, (fullMatch, alt: string, body: string) => {
    const parsed = splitMarkdownImageTarget(body);
    if (!parsed || isExternalImageTarget(parsed.target)) return fullMatch;
    const resolvedPath = resolveMarkdownAssetPath(documentPath, parsed.target);
    const image = images.find((node) => node.path === resolvedPath);
    const titlePart = parsed.title ? ` "${parsed.title}"` : "";
    if (!image) {
      const safeBody = `${formatMarkdownImageTarget(parsed.target)}${titlePart}`;
      return safeBody !== body.trim() ? `![${alt}](${safeBody})` : fullMatch;
    }
    return `![${alt}](${getProjectImageContentUrl(projectId, image.id)}${titlePart})`;
  });
}

function restoreProjectImageReferences(markdown: string, projectId: string, documentPath: string, tree: DocumentTreeNode[]) {
  if (!projectId || !documentPath || !markdown.includes("/assets/")) return markdown;
  const images = collectImages(tree);
  if (images.length === 0) return markdown;
  const byContentUrl = new Map(images.map((image) => [getProjectImageContentUrl(projectId, image.id), image]));

  return markdown.replace(markdownImageReferencePattern, (fullMatch, alt: string, body: string) => {
    const parsed = splitMarkdownImageTarget(body);
    if (!parsed) return fullMatch;
    const image = byContentUrl.get(parsed.target);
    if (!image?.path) return fullMatch;
    const relativeTarget = relativeMarkdownTarget(image.path, documentPath);
    const titlePart = parsed.title ? ` "${parsed.title}"` : "";
    return `![${alt}](${formatMarkdownImageTarget(relativeTarget)}${titlePart})`;
  });
}

function splitMarkdownImageTarget(body: string): { target: string; title: string | null } | null {
  const value = body.trim();
  if (!value) return null;
  if (value.startsWith("<") && value.includes(">")) {
    const end = value.indexOf(">");
    return { target: value.slice(1, end), title: value.slice(end + 1).trim().replace(/^["']|["']$/g, "") || null };
  }
  if (!value.includes(" ")) return { target: value.replace(/^["']|["']$/g, ""), title: null };
  const quotedTitle = value.match(/^(.+?)\s+(["'])(.*?)\2$/);
  if (quotedTitle) return { target: quotedTitle[1].replace(/^["']|["']$/g, ""), title: quotedTitle[3] || null };
  return { target: value.replace(/^["']|["']$/g, ""), title: null };
}

function isExternalImageTarget(target: string) {
  return /^(https?:|data:|mailto:|#)/i.test(target);
}

function resolveMarkdownAssetPath(documentPath: string, target: string) {
  const cleanTarget = decodeMarkdownTargetPath(target.split("#", 1)[0].split("?", 1)[0]);
  const parentParts = documentPath.split("/").slice(0, -1);
  return normalizePathParts([...parentParts, ...cleanTarget.split("/")]);
}

function decodeMarkdownTargetPath(target: string) {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

function relativeMarkdownTarget(assetPath: string, documentPath: string) {
  const fromParts = documentPath.split("/").slice(0, -1);
  const toParts = assetPath.split("/");
  while (fromParts.length > 0 && toParts.length > 0 && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  const relative = [...fromParts.map(() => ".."), ...toParts].join("/") || ".";
  return !relative.startsWith(".") && !relative.includes("/") ? `./${relative}` : relative;
}

function formatMarkdownImageTarget(target: string) {
  const escaped = target.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/\(/g, "%28").replace(/\)/g, "%29");
  return /\s/.test(escaped) ? `<${escaped}>` : escaped;
}

function normalizePathParts(parts: string[]) {
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }
  return normalized.join("/");
}

function resolveDocumentParentFolderId(nodes: DocumentTreeNode[], documentPath: string | null): string | null {
  if (!documentPath || !documentPath.includes("/")) return null;
  const parentPath = documentPath.split("/").slice(0, -1).join("/");
  return findFolderByPath(nodes, parentPath)?.id ?? null;
}

function findFolderByPath(nodes: DocumentTreeNode[], path: string): DocumentTreeNode | null {
  for (const node of nodes) {
    if (node.type === "folder" && node.path === path) return node;
    if (node.children) {
      const found = findFolderByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function parseImageMarkdown(markdown: string): MarkdownEditorActionOptions {
  const match = markdown.match(/^!\[([^\]]*)\]\((.*)\)$/);
  const parsed = match ? splitMarkdownImageTarget(match[2]) : null;
  return { image: { alt: match?.[1] ?? "Imagen", src: parsed?.target ?? markdown } };
}

function toMarkdownEditorSelection(selectionFocus: AiSelectionFocus | null, documentId: string): MarkdownEditorSelection | null {
  if (selectionFocus?.documentId !== documentId) return null;
  if (typeof selectionFocus.from !== "number" || typeof selectionFocus.to !== "number") return null;
  if (!selectionFocus.text.trim()) return null;
  return {
    from: selectionFocus.from,
    to: selectionFocus.to,
    text: selectionFocus.text,
  };
}

function keepStableFormatState(currentFormatState: MarkdownEditorFormatState, nextFormatState: MarkdownEditorFormatState) {
  const currentKeys = Object.keys(currentFormatState) as MarkdownEditorAction[];
  const nextKeys = Object.keys(nextFormatState) as MarkdownEditorAction[];

  if (currentKeys.length !== nextKeys.length) return nextFormatState;

  const isSame = nextKeys.every((key) => currentFormatState[key] === nextFormatState[key]);
  return isSame ? currentFormatState : nextFormatState;
}

function keepStableHistoryStateForDocument(
  currentHistoryStates: Record<string, MarkdownEditorHistoryState>,
  documentId: string,
  nextHistoryState: MarkdownEditorHistoryState,
) {
  const currentHistoryState = currentHistoryStates[documentId];
  if (
    currentHistoryState &&
    currentHistoryState.canUndo === nextHistoryState.canUndo &&
    currentHistoryState.canRedo === nextHistoryState.canRedo &&
    currentHistoryState.undoDepth === nextHistoryState.undoDepth &&
    currentHistoryState.redoDepth === nextHistoryState.redoDepth
  ) {
    return currentHistoryStates;
  }

  return { ...currentHistoryStates, [documentId]: nextHistoryState };
}

function getHistoryDisabledReason(project: Project | null, authStatus: AuthStatus, versioningStatus: ProjectVersioningStatus | null) {
  if (!project || project.versioningMode === "none") return "Historial no disponible en proyectos de archivos locales";
  if (!authStatus.isAuthenticated) return "Inicia sesión con GitHub para activar el historial versionado";
  return versioningStatus?.reason ?? "Historial no disponible";
}

function countWords(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

function countCharacters(markdown: string) {
  return markdown.length;
}

function getDocumentStatus({
  saveState,
  isDirty,
  hasRecoveredDraft,
  conflictStatus,
  diskChanged,
}: {
  saveState: "idle" | "saving" | "saved";
  isDirty: boolean;
  hasRecoveredDraft: boolean;
  conflictStatus: DocumentConflictStatus;
  diskChanged: boolean;
}) {
  if (conflictStatus === "orphaned") return { label: "Archivo no encontrado", tone: "warning" as const };
  if (diskChanged) return { label: "Conflicto con disco", tone: "warning" as const };
  if (saveState === "saved") return { label: "Guardado", tone: "success" as const };
  if (hasRecoveredDraft) return { label: "Borrador recuperado", tone: "warning" as const };
  if (isDirty) return { label: "Cambios sin guardar", tone: "warning" as const };
  return { label: "Sin cambios", tone: "success" as const };
}

function ImageWorkspaceStatusBar({
  name,
  asset,
  zoomPercent,
  fitToWindow,
  onZoomChange,
  onFitToWindow,
}: {
  name: string;
  asset: AssetMetadata | null;
  zoomPercent: number;
  fitToWindow: boolean;
  onZoomChange: (zoomPercent: number) => void;
  onFitToWindow: () => void;
}) {
  return (
    <footer className="z-10 flex h-9 shrink-0 items-center justify-between gap-4 border-t border-line bg-white px-3 text-[11px] text-ink-secondary">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink-primary">
          <ImageIcon size={14} className="text-brand-orange" />
          Imagen
        </span>
        <span className="h-5 border-l border-line" />
        <span className="truncate font-medium text-ink-primary">{asset?.name ?? name}</span>
        <span className="hidden h-5 border-l border-line sm:block" />
        <span className="hidden truncate sm:block">{formatImageTechnicalDetails(asset)}</span>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1.5">
        <button
          className={[
            "grid h-6 w-6 place-items-center rounded-md border text-ink-secondary transition",
            fitToWindow ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-line bg-white hover:bg-brand-hover hover:text-brand-orange",
          ].join(" ")}
          type="button"
          data-tooltip="Ajustar al espacio"
          aria-label="Ajustar imagen al espacio disponible"
          onClick={onFitToWindow}
        >
          <Maximize2 size={13} />
        </button>
        <div className="flex h-6 items-center gap-1 rounded-md border border-line bg-white px-1">
          <button
            className="grid h-5 w-5 place-items-center rounded text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
            type="button"
            data-tooltip="Reducir zoom"
            aria-label="Reducir zoom"
            onClick={() => onZoomChange(zoomPercent - 10)}
          >
            <Minus size={12} />
          </button>
          <input
            className="h-1.5 w-24 accent-brand-orange"
            aria-label="Zoom de visualización"
            type="range"
            min={10}
            max={200}
            step={10}
            value={zoomPercent}
            onChange={(event) => onZoomChange(Number(event.target.value))}
          />
          <button
            className="grid h-5 w-5 place-items-center rounded text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
            type="button"
            data-tooltip="Aumentar zoom"
            aria-label="Aumentar zoom"
            onClick={() => onZoomChange(zoomPercent + 10)}
          >
            <Plus size={12} />
          </button>
        </div>
        <button
          className="h-6 min-w-12 rounded-md border border-line bg-white px-2 text-[10px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange"
          type="button"
          onClick={() => onZoomChange(100)}
        >
          {fitToWindow ? "Auto" : `${zoomPercent}%`}
        </button>
      </div>
    </footer>
  );
}

function formatImageTechnicalDetails(asset: AssetMetadata | null) {
  if (!asset) return "Cargando datos";
  const dimensions = asset.width && asset.height ? `${asset.width} x ${asset.height} px` : null;
  const colorDepth = asset.colorDepthBits ? `${asset.colorDepthBits} bits` : null;
  const type = asset.mimeType?.split("/")[1]?.toUpperCase() ?? null;
  return [dimensions, colorDepth, type].filter(Boolean).join(" · ") || "Sin metadatos de imagen";
}

function WorkspaceStatusBar({ kind, title, detail }: { kind: string; title: string; detail: string }) {
  return (
    <footer className="z-10 flex h-9 shrink-0 items-center justify-between gap-4 border-t border-line bg-white px-3 text-[11px] text-ink-secondary">
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-semibold text-ink-primary">{kind}</span>
        <span className="h-5 border-l border-line" />
        <span className="truncate">{title}</span>
      </div>
      <div className="flex min-w-0 shrink-0 items-center justify-end gap-3">
        <span className="truncate">{detail}</span>
      </div>
    </footer>
  );
}

function getWorkspaceStatusKind(kind: WorkspaceTab["kind"] | undefined) {
  if (kind === "release-notes") return "Notas";
  if (kind === "ai-conversation") return "IA";
  if (kind === "image") return "Imagen";
  return "Workspace";
}

function getWorkspaceStatusTitle(tab: WorkspaceTab | undefined, openaiKeyConfigured: boolean) {
  if (tab?.kind === "release-notes") return "Notas de release";
  if (tab?.kind === "ai-conversation") return openaiKeyConfigured ? "Asistente documental activo" : "Asistente sin clave OpenAI";
  if (tab?.kind === "image") return tab.name;
  return tab?.name ?? "Vista activa";
}

function getWorkspaceStatusDetail(tab: WorkspaceTab | undefined, projectName?: string) {
  if (tab?.kind === "release-notes") return "Solo lectura";
  if (tab?.kind === "ai-conversation") return projectName ? `Proyecto: ${projectName}` : "Conversación del proyecto";
  if (tab?.kind === "image") return tab.path || "Activo del proyecto";
  return "Listo";
}

function DocumentConflictBanner({
  conflictStatus,
  onKeepLocalVersion,
  onLoadDiskVersion,
}: {
  conflictStatus: DocumentConflictStatus;
  onKeepLocalVersion: () => void;
  onLoadDiskVersion: () => void;
}) {
  const orphaned = conflictStatus === "orphaned";
  return (
    <div className="mb-3 flex items-center gap-3 rounded-md border border-orange-200 bg-brand-hover px-3 py-2 text-[11px] text-ink-primary">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{orphaned ? "El archivo ya no existe en disco" : "El archivo cambió en disco"}</p>
        <p className="mt-0.5 text-[11px] text-ink-secondary">
          {orphaned
            ? "Puedes guardar tu borrador para recrear el archivo o cargar disco para descartar el borrador local."
            : "Puedes guardar tu borrador sobre el archivo actual o cargar la versión del disco y descartar el borrador."}
        </p>
      </div>
      {!orphaned ? (
        <button className="h-7 rounded-md border border-brand-orange px-2.5 text-[11px] font-semibold text-brand-orange hover:bg-white" onClick={onLoadDiskVersion}>
          Cargar disco
        </button>
      ) : null}
      <button className="h-7 rounded-md bg-brand-orange px-2.5 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={onKeepLocalVersion}>
        {orphaned ? "Recrear archivo" : "Mantener mi versión"}
      </button>
    </div>
  );
}

type PanelResizeHandleProps = {
  label: string;
  minWidth: number;
  maxWidth: number;
  value: number;
  isResizing: boolean;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

function PanelResizeHandle({
  label,
  minWidth,
  maxWidth,
  value,
  isResizing,
  onPointerDown,
  onKeyDown,
}: PanelResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={value}
      tabIndex={0}
      className="group relative z-30 -mx-1 h-full w-2 shrink-0 cursor-col-resize touch-none select-none outline-none"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <div
        className={[
          "absolute inset-y-0 left-1/2 w-2 -translate-x-1/2 transition-colors",
          isResizing ? "bg-brand-hover/60" : "bg-transparent group-hover:bg-brand-hover/60 group-focus-visible:bg-brand-hover/60",
        ].join(" ")}
      />
      <div
        className={[
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-[background-color,opacity,width]",
          isResizing ? "w-0.5 bg-brand-orange opacity-100" : "opacity-100 group-hover:w-0.5 group-hover:bg-brand-orange group-focus-visible:w-0.5 group-focus-visible:bg-brand-orange",
        ].join(" ")}
      />
    </div>
  );
}
