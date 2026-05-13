import { lazy, Suspense, useCallback, useEffect, useState, type KeyboardEvent, type PointerEvent } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { AiConversationView } from "../features/assistant/AiConversationView";
import { AiPromptInput, type AiPromptExecutionOptions } from "../features/assistant/AiPromptInput";
import { AiResponseBubble } from "../features/assistant/AiResponseBubble";
import { DocumentStatusBar } from "../features/documents/DocumentStatusBar";
import { DocumentTabs } from "../features/documents/DocumentTabs";
import { DocumentTree, type DocumentTreeAction } from "../features/documents/DocumentTree";
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
import { TitleBar } from "../components/window/TitleBar";
import type { AiConfigStatus, AiConversationEvent, AiIndexStatusResponse, AiIntentActionType, AiPendingIntent, AiSelectionFocus, AiUsageSummaryResponse, AppearanceConfig, AuthStatus, CreateVersionResponse, DocumentConflictStatus, DocumentRecord, DocumentTreeNode, LayoutConfig, Project, ProjectVersioningStatus, WorkspaceTab } from "../types/domain";

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
  tree: DocumentTreeNode[];
  tabs: WorkspaceTab[];
  activeTabId: string;
  activeDocumentId: string;
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
  onClearAiSelectionFocus: () => void;
  onAiIntentAction: (action: AiIntentActionType, intentId: string) => void | Promise<void>;
  onCloseAiBubble: () => void;
  onDismissAiAppliedChange: () => void;
  onOpenAiConversation: () => void;
  isSyncingProject: boolean;
  onOpenDocument: (documentId: string, name: string) => void;
  onSelectTab: (documentId: string) => void;
  onCloseTab: (documentId: string) => void;
  onTreeContextAction: (action: DocumentTreeAction, node: DocumentTreeNode) => void;
  onMoveTreeNode: (node: DocumentTreeNode, targetFolderId: string | null) => void | Promise<void>;
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
  const activeWorkspaceTab = props.tabs.find((tab) => tab.id === props.activeTabId);
  const hasOpenDocument = activeWorkspaceTab?.kind === "document" && Boolean(props.activeDocumentId);
  const hasReleaseNotes = activeWorkspaceTab?.kind === "release-notes";
  const hasAiConversation = activeWorkspaceTab?.kind === "ai-conversation";
  const hasOpenTab = hasOpenDocument || hasReleaseNotes || hasAiConversation;
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

  const handleRunEditorAction = useCallback((action: MarkdownEditorAction, options?: MarkdownEditorActionOptions) => {
    if (!activeEditorController) return;

    activeEditorController.run(action, options);
    setEditorFormatState((currentFormatState) => keepStableFormatState(currentFormatState, activeEditorController.getFormatState()));
    setEditorHistoryStates((currentHistoryStates) => keepStableHistoryStateForDocument(currentHistoryStates, props.activeDocumentId, activeEditorController.getHistoryState()));
  }, [activeEditorController, props.activeDocumentId]);

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

      const applied = controller.replaceMarkdown(operation.markdown, { addToHistory: operation.addToHistory ?? true });
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
    props.onEditorOperationApplied,
    props.onEditorOperationFailed,
    props.pendingEditorOperations,
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
          ].join(" ")}
          style={{ width: sidebar.width, maxWidth: "calc(100vw - 48px)" }}
        >
          <div className="flex items-start gap-2 px-4 pb-2 pt-3">
            <div className="min-w-0 flex-1">
              <ProjectSelector
                projects={props.projects}
                activeProject={props.activeProject}
                language={props.appLanguage}
                onSelectProject={props.onSelectProject}
                onCreateProject={props.onCreateProject}
              />
            </div>
            <button
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line bg-white text-ink-secondary hover:bg-brand-hover hover:text-brand-orange lg:hidden"
              data-tooltip="Ocultar documentos"
              data-tooltip-placement="bottom"
              aria-label="Ocultar panel de documentos"
              onClick={() => setNavigationOpen(false)}
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-1.5">
            {props.activeProject ? (
              <DocumentTree
                nodes={props.tree}
                activeDocumentId={props.activeDocumentId}
                onOpenDocument={handleOpenDocument}
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
            hasActiveProject={Boolean(props.activeProject)}
            orphanDraftCount={props.orphanDraftCount}
            onLoginGithub={props.onLoginGithub}
            onLogout={props.onLogout}
            onCreateFolder={props.onCreateFolder}
            onCreateDocument={props.onCreateDocument}
            onExpandTree={props.onExpandTree}
            onCollapseTree={props.onCollapseTree}
            onConfigureProject={props.onConfigureProject}
            onOpenAppSettings={props.onOpenAppSettings}
            onOpenRecoverableDrafts={props.onOpenRecoverableDrafts}
            onCheckForUpdates={props.onCheckForUpdates}
            onOpenReleaseNotes={props.onOpenReleaseNotes}
            isCheckingForUpdates={props.isCheckingForUpdates}
          />
        </aside>
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
              {hasReleaseNotes || hasAiConversation ? null : (
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
            <section className={["relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", hasOpenTab ? "bg-white" : "bg-[#F7F7F7]"].join(" ")}>
              {hasOpenTab ? (
                <>
                  <div className={hasAiConversation ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto px-8 pb-24 pt-4"}>
                    <div className={hasAiConversation ? "h-full min-h-0" : "mx-auto max-w-[900px]"}>
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
                                markdown={session.markdown}
                                onChange={(markdown) => props.onMarkdownChange(session.documentId, markdown)}
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
                  <div className="pointer-events-none absolute inset-x-0 bottom-9 h-28 bg-gradient-to-t from-white via-white/95 to-transparent" />
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
                    <img
                      className="w-[min(420px,44vw)] max-w-[62%] opacity-[0.18]"
                      src="/brand/knownext-logo-watermark.png"
                      alt=""
                      aria-hidden="true"
                    />
                  </div>
                </>
              )}
              <AiPromptInput
                documentId={hasOpenDocument ? props.activeDocumentId : undefined}
                projectId={props.activeProject?.id}
                markdown={hasOpenDocument ? props.activeMarkdown : ""}
                providerReady={props.aiConfig.openaiKeyConfigured}
                appliedChangeSummary={props.aiAppliedChange?.documentId === props.activeDocumentId ? props.aiAppliedChange.summary : null}
                selectionFocus={props.aiSelectionFocus?.documentId === props.activeDocumentId ? props.aiSelectionFocus : null}
                onSubmit={props.onSendAiPrompt}
                onClearSelectionFocus={props.onClearAiSelectionFocus}
                onDismissAppliedChange={props.onDismissAiAppliedChange}
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
              {hasOpenDocument ? (
                <DocumentStatusBar
                  statusLabel={activeStatus.label}
                  statusTone={activeStatus.tone}
                  isDirty={props.activeDocumentDirty}
                  saveState={props.saveState}
                  wordCount={props.activeDocument?.wordCount ?? countWords(props.activeMarkdown)}
                  gitEnabled={props.historyEnabled}
                  versioningLabel={props.versioningStatus?.statusLabel ?? "Sin historial"}
                  lastVersionHash={props.versioningStatus?.lastVersionHash}
                  lastVersionRelativeTime={props.versioningStatus?.lastVersionRelativeTime}
                  canSave={Boolean(props.activeDocument && props.activeDocumentId)}
                  onSave={props.onSave}
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
      className="group relative z-20 -mx-1 w-2 shrink-0 cursor-col-resize select-none outline-none"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <div
        className={[
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-brand-orange transition-opacity",
          isResizing ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        ].join(" ")}
      />
    </div>
  );
}
