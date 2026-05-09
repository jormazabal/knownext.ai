import { useCallback, useEffect, useState, type KeyboardEvent, type PointerEvent } from "react";
import { AiPromptInput } from "../features/assistant/AiPromptInput";
import { DocumentStatusBar } from "../features/documents/DocumentStatusBar";
import { DocumentTabs } from "../features/documents/DocumentTabs";
import { DocumentTree, type DocumentTreeAction } from "../features/documents/DocumentTree";
import { MarkdownEditor } from "../features/editor/MarkdownEditor";
import { MarkdownToolbar } from "../features/editor/MarkdownToolbar";
import {
  emptyMarkdownEditorFormatState,
  type MarkdownEditorAction,
  type MarkdownEditorController,
  type MarkdownEditorFormatState,
} from "../features/editor/editorCommands";
import { ProjectActions } from "../features/projects/ProjectActions";
import { ProjectSelector } from "../features/projects/ProjectSelector";
import { VersionHistoryPanel } from "../features/versions/VersionHistoryPanel";
import { TitleBar } from "../components/window/TitleBar";
import { startWindowResize, type WindowResizeDirection } from "../lib/runtime/windowControls";
import type { DocumentConflictStatus, DocumentRecord, DocumentTreeNode, LayoutConfig, OpenDocumentTab, Project } from "../types/domain";

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

type DesktopLayoutProps = {
  appVersion: string;
  projects: Project[];
  activeProject: Project | null;
  tree: DocumentTreeNode[];
  tabs: OpenDocumentTab[];
  activeTab?: OpenDocumentTab;
  activeDocumentId: string;
  editorSessions: EditorDocumentSession[];
  activeDocument: DocumentRecord | null;
  activeMarkdown: string;
  activeDocumentDirty: boolean;
  activeDocumentConflictStatus: DocumentConflictStatus;
  activeDocumentHasRecoveredDraft: boolean;
  activeDocumentDiskChanged: boolean;
  dirtyDocumentIds: string[];
  isCheckingForUpdates: boolean;
  saveState: "idle" | "saving" | "saved";
  historyOpen: boolean;
  historyEnabled: boolean;
  layoutConfig: LayoutConfig;
  onSelectProject: (project: Project) => void;
  onCreateProject: () => void;
  onConfigureProject: () => void;
  onCreateFolder: () => void;
  onRenameNode: (nodeId: string, name: string) => void;
  onToggleNode: (nodeId: string) => void;
  onExpandTree: () => void;
  onCollapseTree: () => void;
  onCreateDocument: () => void;
  onCheckForUpdates: () => void;
  onOpenDocument: (documentId: string, name: string) => void;
  onSelectTab: (documentId: string) => void;
  onCloseTab: (documentId: string) => void;
  onTreeContextAction: (action: DocumentTreeAction, node: DocumentTreeNode) => void;
  onMarkdownChange: (documentId: string, markdown: string) => void;
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
  const hasOpenDocument = props.tabs.length > 0 && Boolean(props.activeDocumentId);
  const activeEditorController = editorControllers[props.activeDocumentId] ?? null;
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

  const handleRunEditorAction = useCallback((action: MarkdownEditorAction) => {
    if (!activeEditorController) return;

    activeEditorController.run(action);
    setEditorFormatState(activeEditorController.getFormatState());
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
      setEditorFormatState(controller ? controller.getFormatState() : emptyMarkdownEditorFormatState);
    }
  }, [props.activeDocumentId]);

  useEffect(() => {
    setEditorFormatState(activeEditorController ? activeEditorController.getFormatState() : emptyMarkdownEditorFormatState);
  }, [activeEditorController, props.activeDocumentId]);

  const activeStatus = getDocumentStatus({
    saveState: props.saveState,
    isDirty: props.activeDocumentDirty,
    hasRecoveredDraft: props.activeDocumentHasRecoveredDraft,
    diskChanged: props.activeDocumentDiskChanged || props.activeDocumentConflictStatus === "disk-changed",
  });

  return (
    <div className="h-screen overflow-hidden bg-white text-ink-primary">
      <WindowResizeHandles />
      <TitleBar />
      <div className="flex h-[calc(100vh-54px)]">
        <aside className="flex shrink-0 flex-col border-r border-line bg-panel" style={{ width: sidebar.width }}>
          <div className="px-5 pb-3 pt-4">
            <ProjectSelector
              projects={props.projects}
              activeProject={props.activeProject}
              onSelectProject={props.onSelectProject}
              onCreateProject={props.onCreateProject}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
            <DocumentTree
              nodes={props.tree}
              activeDocumentId={props.activeDocumentId}
              onOpenDocument={props.onOpenDocument}
              onRenameNode={props.onRenameNode}
              onToggleNode={props.onToggleNode}
              onContextAction={props.onTreeContextAction}
            />
          </div>
          <ProjectActions
            appVersion={props.appVersion}
            isCheckingForUpdates={props.isCheckingForUpdates}
            onCreateFolder={props.onCreateFolder}
            onCreateDocument={props.onCreateDocument}
            onExpandTree={props.onExpandTree}
            onCollapseTree={props.onCollapseTree}
            onConfigureProject={props.onConfigureProject}
            onCheckForUpdates={props.onCheckForUpdates}
          />
        </aside>
        <PanelResizeHandle
          label="Cambiar anchura del árbol de documentos"
          minWidth={sidebarWidthConfig.minWidth}
          maxWidth={sidebarWidthConfig.maxWidth}
          value={sidebar.width}
          isResizing={sidebar.isResizing}
          onPointerDown={sidebar.startResize}
          onKeyDown={sidebar.resizeWithKeyboard}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-white">
          {hasOpenDocument ? (
            <>
          <DocumentTabs
            tabs={props.tabs}
            activeDocumentId={props.activeDocumentId}
            dirtyDocumentIds={props.dirtyDocumentIds}
            onSelectTab={props.onSelectTab}
            onCloseTab={props.onCloseTab}
          />
              <MarkdownToolbar
                historyOpen={props.historyOpen}
                historyEnabled={props.historyEnabled}
                editorReady={activeEditorController !== null}
                activeActions={editorFormatState}
                onRunEditorAction={handleRunEditorAction}
                onToggleHistory={props.onToggleHistory}
              />
            </>
          ) : null}
          <div className="flex min-h-0 flex-1">
            <section className={["relative flex min-w-0 flex-1 flex-col", hasOpenDocument ? "bg-white" : "bg-[#F7F7F7]"].join(" ")}>
              {hasOpenDocument ? (
                <>
                  <div className="min-h-0 flex-1 overflow-y-auto px-10 pb-28 pt-5">
                    <div className="mx-auto max-w-[930px]">
                      {props.activeDocumentDiskChanged ? (
                        <DocumentConflictBanner
                          onKeepLocalVersion={props.onKeepLocalVersion}
                          onLoadDiskVersion={props.onLoadDiskVersion}
                        />
                      ) : null}
                      {props.editorSessions.map((session) => (
                        <div key={session.documentId} className={session.documentId === props.activeDocumentId ? "" : "hidden"}>
                          {session.document ? (
                            <MarkdownEditor
                              documentKey={session.editorKey}
                              markdown={session.markdown}
                              onChange={(markdown) => props.onMarkdownChange(session.documentId, markdown)}
                              onControllerChange={(controller) => handleEditorControllerChange(session.documentId, controller)}
                              onFormatStateChange={(formatState) => {
                                if (session.documentId === props.activeDocumentId) setEditorFormatState(formatState);
                              }}
                            />
                          ) : (
                            <div className="pt-6 text-[13px] text-ink-secondary">Cargando documento...</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-[48px] h-40 bg-gradient-to-t from-white via-white/95 to-transparent" />
                </>
              ) : (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <img
                    className="w-[min(420px,44vw)] max-w-[62%] opacity-[0.18]"
                    src="/brand/knownext-logo-watermark.png"
                    alt=""
                    aria-hidden="true"
                  />
                </div>
              )}
              <AiPromptInput
                documentId={hasOpenDocument ? props.activeDocumentId : undefined}
                projectId={props.activeProject?.id}
                markdown={hasOpenDocument ? props.activeMarkdown : ""}
              />
              {hasOpenDocument ? (
                <DocumentStatusBar
                  statusLabel={activeStatus.label}
                  statusTone={activeStatus.tone}
                  isDirty={props.activeDocumentDirty}
                  saveState={props.saveState}
                  wordCount={props.activeDocument?.wordCount ?? countWords(props.activeMarkdown)}
                  gitEnabled={props.historyEnabled}
                  canSave={Boolean(props.activeDocument && props.activeDocumentId)}
                  onSave={props.onSave}
                />
              ) : null}
            </section>
            {props.historyOpen && hasOpenDocument ? (
              <>
                <PanelResizeHandle
                  label="Cambiar anchura del historial de versiones"
                  minWidth={historyWidthConfig.minWidth}
                  maxWidth={historyWidthConfig.maxWidth}
                  value={history.width}
                  isResizing={history.isResizing}
                  onPointerDown={history.startResize}
                  onKeyDown={history.resizeWithKeyboard}
                />
                <div className="flex shrink-0" style={{ width: history.width }}>
                  <VersionHistoryPanel documentId={props.activeDocumentId} onClose={props.onCloseHistory} />
                </div>
              </>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

const windowResizeHandles: Array<{
  direction: WindowResizeDirection;
  className: string;
}> = [
  { direction: "North", className: "inset-x-2 top-0 h-1 cursor-n-resize" },
  { direction: "South", className: "inset-x-2 bottom-0 h-1 cursor-s-resize" },
  { direction: "West", className: "inset-y-2 left-0 w-1 cursor-w-resize" },
  { direction: "East", className: "inset-y-2 right-0 w-1 cursor-e-resize" },
  { direction: "NorthWest", className: "left-0 top-0 h-3 w-3 cursor-nw-resize" },
  { direction: "NorthEast", className: "right-0 top-0 h-3 w-3 cursor-ne-resize" },
  { direction: "SouthWest", className: "bottom-0 left-0 h-3 w-3 cursor-sw-resize" },
  { direction: "SouthEast", className: "bottom-0 right-0 h-3 w-3 cursor-se-resize" },
];

function WindowResizeHandles() {
  return (
    <>
      {windowResizeHandles.map((handle) => (
        <div
          key={handle.direction}
          aria-hidden="true"
          className={["fixed z-50 select-none", handle.className].join(" ")}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            void startWindowResize(handle.direction);
          }}
        />
      ))}
    </>
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
  return Math.min(Math.max(value, min), max);
}

function countWords(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

function getDocumentStatus({
  saveState,
  isDirty,
  hasRecoveredDraft,
  diskChanged,
}: {
  saveState: "idle" | "saving" | "saved";
  isDirty: boolean;
  hasRecoveredDraft: boolean;
  diskChanged: boolean;
}) {
  if (diskChanged) return { label: "Conflicto con disco", tone: "warning" as const };
  if (saveState === "saved") return { label: "Guardado", tone: "success" as const };
  if (hasRecoveredDraft) return { label: "Borrador recuperado", tone: "warning" as const };
  if (isDirty) return { label: "Cambios sin guardar", tone: "warning" as const };
  return { label: "Sin cambios", tone: "success" as const };
}

function DocumentConflictBanner({
  onKeepLocalVersion,
  onLoadDiskVersion,
}: {
  onKeepLocalVersion: () => void;
  onLoadDiskVersion: () => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-md border border-orange-200 bg-brand-hover px-4 py-3 text-[13px] text-ink-primary">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">El archivo cambió en disco</p>
        <p className="mt-1 text-[12px] text-ink-secondary">
          Puedes guardar tu borrador sobre el archivo actual o cargar la versión del disco y descartar el borrador.
        </p>
      </div>
      <button className="h-8 rounded-md border border-brand-orange px-3 text-[12px] font-semibold text-brand-orange hover:bg-white" onClick={onLoadDiskVersion}>
        Cargar disco
      </button>
      <button className="h-8 rounded-md bg-brand-orange px-3 text-[12px] font-semibold text-white hover:bg-brand-dark" onClick={onKeepLocalVersion}>
        Mantener mi versión
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
