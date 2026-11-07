import type {HandwrittenOcrApplyRequest,HandwrittenOcrApply,HandwrittenOcrResult} from "../types/handwrittenOcr";
import {HistoryRestoreDialog} from "../features/history/HistoryRestoreDialog";
import type {HandwrittenPageFocus,WorkspaceNodeFocus} from "../types/localSearch";
import { useWorkspaceSurfaceTransition } from "./useWorkspaceSurfaceTransition";
import { projectImageSource } from "../lib/projectImageSources";
import type { SettingsWorkspace } from "../types/settings";
import { DocumentToolsPanel } from "../features/editor/DocumentToolsPanel";
import { WorkspaceWelcome } from "../features/projects/WorkspaceWelcome";
import {ProjectTreeReadIssue} from "../features/documents/ProjectTreeReadIssue";
import { LoadFailure } from "../components/ui/LoadFailure";
import { WorkspaceCommandPalette } from "../features/documents/WorkspaceCommandPalette";
import { Search } from "lucide-react";
import "./DesktopLayout.css";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {createDeferredView} from "../components/ui/createDeferredView";
import {notesSaveFeedback} from "../features/documents/notesSaveFeedback";
import type {MarkdownEditorProps} from "../features/editor/MarkdownEditor";
import { AlertTriangle, ArrowLeft, FileText, GitCompareArrows, History, Image as ImageIcon, Maximize2, Mic, Minus, PanelLeftClose, PanelLeftOpen, PanelRightOpen, PanelRightClose, Pin, Settings, Trash2, Plus, RotateCcw } from "lucide-react";
import { AiConversationView } from "../features/assistant/AiConversationView";
import { AiPromptInput, type AiPromptExecutionOptions } from "../features/assistant/AiPromptInput";
import { AiResponseBubble } from "../features/assistant/AiResponseBubble";
import { DocumentStatusBar } from "../features/documents/DocumentStatusBar";
import {DocumentConflictBanner} from "../features/documents/DocumentConflictBanner";
import {DraftWriteConflictBanner} from "../features/documents/DraftWriteConflictBanner";
import { DocumentTabs } from "../features/documents/DocumentTabs";
import { DocumentTree, type DocumentTreeAction, type ProjectTreeStatus } from "../features/documents/DocumentTree";
import { InsertDiagramDialog } from "../features/documents/InsertDiagramDialog";
import { InsertImageDialog } from "../features/documents/InsertImageDialog";
import { ExternalChangesDrawer, type OpenDocumentDraftState } from "../features/externalChanges/ExternalChangesDrawer";
import { ImageViewer } from "../features/documents/ImageViewer";
import { ReferenceDocumentViewer } from "../features/documentPreview/ReferenceDocumentViewer";
import { HandwrittenEditor } from "../features/handwritten/HandwrittenEditor";
import { MarkdownToolbar } from "../features/editor/MarkdownToolbar";
import { MarkdownSourceViewer } from "../features/editor/MarkdownSourceViewer";
import {
  emptyMarkdownEditorHistoryState,
  emptyMarkdownEditorFormatState,
  type MarkdownEditorAction,
  type MarkdownEditorActionOptions,
  type MarkdownEditorChangeSource,
  type MarkdownEditorController,
  type MarkdownEditorDiagramEditTarget,
  type MarkdownEditorExternalOperation,
  type MarkdownEditorFormatState,
  type MarkdownEditorHistoryState,
  type MarkdownEditorImageEditTarget,
  type MarkdownEditorSelection,
} from "../features/editor/editorTypes";
import { ProjectActions } from "../features/projects/ProjectActions";
import { ProjectSelector } from "../features/projects/ProjectSelector";
import { ReleaseNotesViewer } from "../features/releaseNotes/ReleaseNotesViewer";
import { HistoryComparisonSurface } from "../features/versions/HistoryComparisonSurface";
import { HistoryPreviewWorkspace } from "../features/versions/HistoryPreviewWorkspace";
import { formatVersionFullDate, VersionHistoryPanel, type VersionPreview } from "../features/versions/VersionHistoryPanel";
import { DocumentInfoPanel } from "../features/editor/DocumentInfoPanel";
import { DocumentReferencesPanel } from "../features/editor/DocumentReferencesPanel";
import { useContextVisibility } from "../app/useContextVisibility";
import type { LocalReferenceTarget } from "../types/documentReferences";
import { BrandMark } from "../components/brand/BrandMark";
import { TitleBar } from "../components/window/TitleBar";
import { getDocumentTreeFileDragData } from "../lib/dragData";
import { isMobileDeviceRuntime, isPhoneAppShell } from "../lib/runtime/platform";
import type { ActivityEvent, AiConfigStatus, AiContextSearchResult, AiContextSource, AiContextSourcePreviewResponse, AiConversationEvent, AiEditProposal, AiIndexStatusResponse, AiIntentActionType, AiPendingIntent, AiResearchBrief, AiResearchJob, AiSelectionFocus, AiSkillApplication, AiSkillDiagnostic, AiUsageSummaryResponse, AppearanceConfig, AssetImportResponse, AssetMetadata, AuthStatus, RestoreVersionResponse, DocumentConflictStatus, DocumentPostSaveSyncState, DocumentRecord, DocumentSyncStatus, DocumentTreeNode, ExportFormat, ExternalChangeDecision, ExternalChangeSet, HandwrittenEraserConfig, HandwrittenExportFormat, HandwrittenNoteContent, HandwrittenNoteInsertMarkdownResponse, HandwrittenNoteRecord, HandwrittenToolPreset, InsertImageReferenceResponse, LayoutConfig, Project, ProjectFileSyncOverview, ProjectSyncState, ProjectSyncStatus, ProjectVersioningStatus, VersionRecord, WorkspaceTab } from "../types/domain";

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

const MarkdownEditor = createDeferredView<MarkdownEditorProps>(() => import("../features/editor/MarkdownEditor").then((module) => ({ default: module.MarkdownEditor })),"Preparando editor…","No se pudo cargar el editor. Los cambios del documento se conservan.");

type DesktopLayoutProps = {
  continuityNotice?:ReactNode;
  applyingAiEditProposalId?: string | null;
  canApplyEditorOperation?: (operation: MarkdownEditorExternalOperation) => boolean;
  aiResultReview?: { count: number; hasError: boolean; onOpen: () => void };
  settingsWorkspace?: SettingsWorkspace;
  onBatchAction?: (action: import("../types/fileBatch").SelectionAction, nodeIds: string[], targetFolderId?:string|null) => void;
  onOpenTrash?: () => void;
  onOpenRecordings: () => void;
  appearance?: AppearanceConfig;
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
  aiEditProposal: AiEditProposal | null;
  staleAiEditOperationIds: string[];
  blockedAiEditOperationReasons: Record<string, string>;
  appliedAiEditOperationIds: string[];
  aiBubble: { id: string; answer: string; usedSkills?: string[]; skillApplications?: AiSkillApplication[]; skillDiagnostics?: AiSkillDiagnostic[] } | null;
  aiAppliedChange: { documentId: string; summary: string } | null;
  aiSelectionFocus: AiSelectionFocus | null;
  aiResearchBrief: AiResearchBrief | null;
  aiResearchJob: AiResearchJob | null;
  aiResearchJobs: AiResearchJob[];
  aiContextSources: AiContextSource[];
  tree: DocumentTreeNode[];
  treeReadIssue?:string|null;
  treeReadBusy?:boolean;
  onReloadProjectTree?:()=>void;
  tabs: WorkspaceTab[];
  activeTabId: string;
  activeDocumentId: string;
  activeTreeNodeId: string;
  activeImageId: string;
  activeHandwrittenNoteId: string;
  handwrittenPageFocus?:HandwrittenPageFocus|null;
  onHandwrittenPageFocusHandled?:(requestId:number)=>void;
  editorSessions: EditorDocumentSession[];
  notesMarkdown: string;
  notesUpdatedAt: string | null;
  notesEditorKey: string;
  notesLoaded: boolean;
  notesSaveState: "idle" | "saving" | "error";
  notesDirty:boolean;
  releaseNotesMarkdown: string;
  activeDocument: DocumentRecord | null;
  activeMarkdown: string;
  activeHandwrittenNote: HandwrittenNoteRecord | null;
  activeHandwrittenContent: HandwrittenNoteContent | null;
  handwrittenToolPresets: HandwrittenToolPreset[];
  handwrittenEraserConfig: HandwrittenEraserConfig;
  activeHandwrittenDirty: boolean;
  activeHandwrittenLoading?: boolean;
  activeHandwrittenSaveState: "idle" | "saving" | "saved" | "error";
  activeHandwrittenConflictStatus?: DocumentConflictStatus;
  activeHandwrittenDiskChanged?: boolean;
  onKeepHandwrittenVersion?: () => void;
  onLoadHandwrittenDiskVersion?: () => void;
  onMergeHandwrittenDiskVersion?: () => void;
  onRecoverHandwrittenCopy?:()=>void;
  activeDocumentDirty: boolean;
  activeDocumentLoading?: boolean;
  activeDocumentLoadError?: string;
  activeDocumentSyncStatus: DocumentSyncStatus | null;
  activeDocumentPostSaveSyncState: DocumentPostSaveSyncState;
  activeDocumentPendingSaveHint?: string | null;
  pendingEditorOperations: MarkdownEditorExternalOperation[];
  activeDocumentConflictStatus: DocumentConflictStatus;
  activeDocumentHasRecoveredDraft: boolean;
  activeDocumentDiskChanged: boolean;
  activeDraftWriteConflict?:boolean;
  activeHandwrittenDraftWriteConflict?:boolean;
  draftReviewBusy?:string|null;
  onReviewChangedDraft?:(id:string,ink:boolean)=>void;
  dirtyDocumentIds: string[];
  orphanDraftCount: number;
  isCheckingForUpdates: boolean;
  saveState: "idle" | "saving" | "saved";
  historyOpen: boolean;
  historyEnabled: boolean;
  versioningStatus: ProjectVersioningStatus | null;
  projectSyncStatus: ProjectSyncStatus | null;
  fileSyncOverview: ProjectFileSyncOverview | null;
  fileSyncOverviewError?: string | null;
  openDocumentDraftStates: OpenDocumentDraftState[];
  externalChangeSet: ExternalChangeSet | null;
  externalChangeDecisions: Record<string, ExternalChangeDecision>;
  projectActivity: ActivityEvent[];
  externalChangesOpen: boolean;
  externalChangesBusy: boolean;
  projectSyncState: ProjectSyncState;
  externalChangeSetAcknowledged: boolean;
  externalChangesMessage?: string | null;
  layoutConfig: LayoutConfig;
  onSelectProject: (project: Project) => void;
  onCreateProject: () => void;
  onImportProjectPackage?: () => void;
  onExportProjectPackage?: () => void;
  onOpenAssetCatalog?:()=>void;
  onOpenProjectReplace?:()=>void;
  onOpenAiChangeHistory?:()=>void;
  stateTransitionAuthority?:import("../types/stateMigrations").StateTransitionAuthority;
  onRetiredProjects?: (returnFocus:()=>HTMLElement|null) => void;
  onRegisterEditorSnapshot?: (id:string, controller:MarkdownEditorController|null, released?:MarkdownEditorController|null) => void;
  onConfigureProject: () => void;
  onOpenLocalReference: (target: LocalReferenceTarget) => void;
  onOpenAppSettings: (section?: "ai") => void;
  onCreateFolder: (parentId: string | null) => void;
  onImportProjectFile: (parentId: string | null) => void;
  onRenameNode: (nodeId: string, name: string) => void;
  onToggleNode: (nodeId: string) => void;
  onExpandTree: () => void;
  onCollapseTree: () => void;
  onCreateDocument: (parentId: string | null) => void;
  onRecordAudio?: (parentId: string | null) => void;
  onCreateHandwrittenNote: (parentId: string | null) => void;
  onOpenRecoverableDrafts: () => void;
  onCheckForUpdates: () => void;
  onOpenReleaseNotes: () => void;
  onLoginGithub: () => void;
  onLogout: () => void;
  onPullProject: () => void;
  onPushProject: () => void;
  onOpenProjectGithub: () => void;
  onOpenExternalChanges: () => void;
  onCloseExternalChanges: () => void;
  onRefreshExternalChanges: () => void;
  beforeMixedApplication?:()=>Promise<boolean>;onMixedApplicationChanged?:()=>void;
  onHistoricalCopyTreeUnavailable?:(projectId:string,message:string)=>void;
  onHistoricalCopyTree?:(projectId:string,tree:DocumentTreeNode[])=>void;
  onExternalChangeDecision: (itemId: string, decision: ExternalChangeDecision) => void;
  onImportExternalChanges: () => void;
  onImportSafeExternalChanges: () => void;
  onOmitExternalChanges: () => void;
  onSaveDocument: (documentId: string) => Promise<boolean>;
  onDiscardDocumentDraft: (documentId: string) => Promise<boolean>;
  onRestoreVersion: (versionId: string) => Promise<RestoreVersionResponse | null>;
  onSaveActiveDocument: () => Promise<boolean>;
  onDiscardActiveDocumentDraft: () => Promise<boolean>;
  onSendAiPrompt: (prompt: string, selectionFocus?: AiSelectionFocus | null, options?: AiPromptExecutionOptions) => void | Promise<void>;
  onUpdateAiResearchBrief: (brief: AiResearchBrief) => void;
  onReviewResearchEvidence?:(jobId:string)=>void;
  onStartAiResearch: (brief: AiResearchBrief) => void | Promise<void>;
  onCancelAiResearchBrief: () => void;
  onCancelAiResearchJob: (jobId: string) => void | Promise<void>;
  onRetryAiResearchJob: (jobId: string) => void | Promise<void>;
  onAiTranscriptionChange: (transcription: Partial<AiConfigStatus["transcription"]>) => void;
  onClearAiSelectionFocus: () => void;
  onSearchAiContextDocuments: (query: string) => Promise<AiContextSearchResult[]>;
  onAddProjectDocumentContext: (documentId: string) => void | Promise<void>;
  onAddProjectImageContext: (assetId: string) => void | Promise<void>;
  onUploadAiContextFiles: (files: File[]) => void | Promise<void>;
  onPickLocalAiContextFiles: () => void | Promise<void>;
  onRemoveAiContextSource: (sourceId: string) => void | Promise<void>;
  onExtendAiContextSource: (sourceId: string) => void | Promise<void>;
  onPreviewAiContextSource: (sourceId: string) => Promise<AiContextSourcePreviewResponse>;
  onRefreshAiContextSource?:(sourceId:string,review:import("../types/domain").AiContextOriginReview)=>Promise<AiContextSourcePreviewResponse>;
  onAddAiContextSourceToProject: (sourceId: string) => void | Promise<void>;
  onAiIntentAction: (action: AiIntentActionType, intentId: string) => void | Promise<void>;
  onApplyAiEditProposal: (proposalId: string, operationIds?: string[]) => void | Promise<void>;
  onDiscardAiEditProposal: (proposalId: string) => void;
  onCloseAiBubble: () => void;
  onDismissAiAppliedChange: () => void;
  onOpenAiConversation: () => void;
  isSyncingProject: boolean;
  onOpenDocument: (documentId: string, name: string) => void;
  onOpenHandwrittenNote: (noteId: string, name: string) => void;
  onOpenImage: (assetId: string, name: string, path: string) => void;
  onOpenReferenceDocument: (nodeId: string, name: string, path: string) => void;
  onActivateTreeNode: (nodeId: string) => void;
  onSelectTreeNode: (nodeId: string, type: DocumentTreeNode["type"], name: string, focus?:WorkspaceNodeFocus) => void;
  onSelectTab: (documentId: string) => void;
  onCloseTab: (documentId: string) => void;
  onCloseTabs: (documentIds: string[]) => void;
  onReorderDocumentTabs: (draggedTabId: string, targetTabId: string, placement: "before" | "after") => void;
  onTreeContextAction: (action: DocumentTreeAction, node: DocumentTreeNode) => void;
  onExportDocument: (documentId: string, format: ExportFormat, snapshot?: () => string) => void | Promise<void>;
  onSaveDocumentTemplate?: (documentId: string, snapshot: () => string) => void;
  onHandwrittenChange: (noteId: string, content: HandwrittenNoteContent) => void;
  onHandwrittenToolPresetsChange: (toolPresets: HandwrittenToolPreset[]) => void;
  onHandwrittenEraserConfigChange: (eraser: HandwrittenEraserConfig) => void;
  onHandwrittenOcrObserved?:(receipt:HandwrittenOcrResult)=>Promise<void>;
  onBeforeHandwrittenOcr?:(noteId:string)=>Promise<void>;
  onApplyHandwrittenOcr?:(request:HandwrittenOcrApplyRequest)=>Promise<HandwrittenOcrApply>;
  onSaveHandwrittenNote: (noteId?: string) => Promise<boolean>;
  onExportHandwrittenNote: (noteId: string, format: HandwrittenExportFormat, pageId?: string) => void | Promise<void>;
  onAddHandwrittenNoteContext: (noteId: string) => void | Promise<void>;
  onMoveTreeNode: (node: DocumentTreeNode, targetFolderId: string | null) => void | Promise<void>;
  onImportProjectImage: (parentId: string | null, file: File) => Promise<AssetImportResponse>;
  onBuildImageReference: (documentId: string, assetId: string, altText?: string | null) => Promise<InsertImageReferenceResponse>;
  onBuildHandwrittenImageReference: (documentId: string, noteId: string, altText?: string | null) => Promise<HandwrittenNoteInsertMarkdownResponse>;
  onInsertImageIntoActiveDocument: (assetId: string) => void | Promise<void>;
  onMarkdownChange: (documentId: string, markdown: string, source?: MarkdownEditorChangeSource) => void;
  onNotesMarkdownChange: (markdown: string) => void;
  onEditorOperationApplied: (operationId: string) => void;
  onEditorOperationFailed: (operation: MarkdownEditorExternalOperation) => void;
  onDocumentSelectionChange: (documentId: string, selection: MarkdownEditorSelection | null) => void;
  onSave: () => void;
  onSynchronizeDocument: () => void;
  onUpdateDocumentFromRemote: () => void;
  onDiscardPendingDocumentChanges: () => void;
  onKeepLocalVersion: () => void;
  onLoadDiskVersion: () => void;
  onMergeDiskVersion?: () => void;
  onRestoreVersionParts?: (versionId:string)=>void;
  onReviewRemoteVersion?:()=>void;
  onRetryDocumentLoad: (id: string) => void;
  onRetryHandwrittenLoad: (id: string) => void;
  activeHandwrittenLoadError?: string;
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
  loadError?: string;
};

type RestoreStrategy = "restore" | "save-and-restore" | "discard-and-restore";

export function DesktopLayout(props: DesktopLayoutProps) {
  const [commandsOpen,setCommandsOpen] = useState(false);
  const [recentByProject,setRecentByProject] = useState<Record<string,string[]>>({});
  useEffect(()=>{
    const project = props.activeProject?.id; const id = props.activeTabId;
    if(project && id) setRecentByProject(current=>({...current,[project]:[id,...(current[project]??[]).filter(item=>item!==id)].slice(0,12)}));
  },[props.activeProject?.id,props.activeTabId]);
  useEffect(()=>{
    const shortcut=(event:globalThis.KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==='p'&&!event.isComposing&&!event.repeat){
        if(document.querySelector('[role="dialog"]'))return;
        event.preventDefault();setCommandsOpen(true);
      }
    };
    window.addEventListener('keydown',shortcut);
    return()=>window.removeEventListener('keydown',shortcut);
  },[]);
  const settingsMode = Boolean(props.settingsWorkspace?.open);
  const [settingsNavigationVisible, setSettingsNavigationVisible] = useState(true);
  const [settingsContextVisible, setSettingsContextVisible] = useState(false);
  const settingsContentRef = useRef<HTMLElement>(null);
  const settingsContextRef = useRef<HTMLElement>(null);
  const documentSurfaceRef = useRef<HTMLElement>(null);
  const mobileShell = isMobileDeviceRuntime();
  const phoneShell = isPhoneAppShell();
  const [editorControllers, setEditorControllers] = useState<Record<string, MarkdownEditorController>>({});
  const editorControllersRef = useRef<Record<string, MarkdownEditorController>>({});
  const [editorFormatState, setEditorFormatState] = useState<MarkdownEditorFormatState>(emptyMarkdownEditorFormatState);
  const [editorHistoryStates, setEditorHistoryStates] = useState<Record<string, MarkdownEditorHistoryState>>({});
  const [navigationOpen, setNavigationOpen] = useState(false);
  useWorkspaceSurfaceTransition(settingsMode, settingsContentRef, documentSurfaceRef, setNavigationOpen);
  const [desktopNavigationVisible, setDesktopNavigationVisible] = useState(props.layoutConfig.navigationVisible !== false);
  const [contextKind, setContextKind] = useState(()=>readContextKind(props.layoutConfig.contextKind));
  const contextPinned = Boolean(props.layoutConfig.contextPinned);
  const [contextVisible, setContextVisible] = useContextVisibility(contextPinned, props.activeProject?.id ?? null, props.activeTabId);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantComposerExpanded, setAssistantComposerExpanded] = useState(false);
  const assistantComposerHidden = Boolean(props.aiEditProposal?.status === "proposed") && !assistantComposerExpanded && !assistantBusy;
  const navigationVisible = settingsMode ? settingsNavigationVisible : desktopNavigationVisible;
  const contextOpen = settingsMode ? settingsContextVisible : contextVisible || props.historyOpen;
  const navigationToggleRef = useRef<HTMLButtonElement>(null);
  const contextToggleRef = useRef<HTMLButtonElement>(null);
  const contextPanelRef = useRef<HTMLElement>(null);
  function closeContext() {
    const returnFocus = (settingsMode ? settingsContextRef : contextPanelRef).current?.contains(document.activeElement);
    if (settingsMode) {
      setSettingsContextVisible(false);
      if (returnFocus) requestAnimationFrame(()=>contextToggleRef.current?.focus());
      return;
    }
    setContextVisible(false);
    if (props.historyOpen) props.onCloseHistory();
    if (returnFocus) requestAnimationFrame(()=>contextToggleRef.current?.focus());
  }
  function changeNavigation(visible: boolean) {
    if (settingsMode) setSettingsNavigationVisible(visible);
    else { setDesktopNavigationVisible(visible); props.onLayoutConfigChange({ navigationVisible: visible }); }
    if (!visible) requestAnimationFrame(()=>navigationToggleRef.current?.focus());
  }
  useEffect(()=>{
    if(!contextOpen)return;
    const escape=(event:globalThis.KeyboardEvent)=>{
      if(event.key==='Escape'&&!event.defaultPrevented&&!event.isComposing&&!document.querySelector('[role="dialog"]')&&(settingsMode ? settingsContextRef : contextPanelRef).current?.contains(event.target as Node)){
        event.preventDefault();closeContext();
      }
    };
    window.addEventListener('keydown',escape);
    return()=>window.removeEventListener('keydown',escape);
  },[contextOpen,settingsMode,props.historyOpen,props.onCloseHistory]);
  useEffect(() => { setDesktopNavigationVisible(props.layoutConfig.navigationVisible !== false); }, [props.layoutConfig.navigationVisible]);
  useEffect(() => { setContextKind(readContextKind(props.layoutConfig.contextKind)); }, [props.layoutConfig.contextKind]);
  useEffect(() => { setNavigationOpen(false); }, [props.activeProject?.id, props.activeTabId]);
  // A navigation transition reveals the center. Opening history explicitly on
  // the same tab still works, including when it is a temporary overlay.
  useEffect(() => {
    if(!window.matchMedia("(min-width: 1280px)").matches && props.historyOpen) props.onCloseHistory();
  }, [props.activeProject?.id, props.activeTabId]);


  const [imageZoomPercent, setImageZoomPercent] = useState(100);
  const [imageFitToWindow, setImageFitToWindow] = useState(true);
  const [markdownZoomPercent, setMarkdownZoomPercent] = useState(100);
  const [markdownSourceVisible, setMarkdownSourceVisible] = useState(false);
  const [activeImageAsset, setActiveImageAsset] = useState<AssetMetadata | null>(null);
  const activeWorkspaceTab = props.tabs.find((tab) => tab.id === props.activeTabId);
  const hasOpenDocument = activeWorkspaceTab?.kind === "document" && Boolean(props.activeDocumentId);
  const hasOpenHandwrittenNote = activeWorkspaceTab?.kind === "handwritten-note" && Boolean(props.activeHandwrittenNoteId);
  const hasOpenImage = activeWorkspaceTab?.kind === "image" && Boolean(props.activeImageId);
  const hasOpenReferenceDocument = activeWorkspaceTab?.kind === "reference-document";
  const hasReleaseNotes = activeWorkspaceTab?.kind === "release-notes";
  const showWelcome = props.projects.length === 0 && props.notesLoaded && !props.notesMarkdown.trim()
    && !props.layoutConfig.firstUseDismissed && (!activeWorkspaceTab || activeWorkspaceTab.kind === "notes");
  const hasNotes = activeWorkspaceTab?.kind === "notes" && !showWelcome;
  const hasAiConversation = activeWorkspaceTab?.kind === "ai-conversation";
  const displayedContextKind = effectiveContextKind(contextKind, activeWorkspaceTab?.kind);
  const historyIsActive = props.historyOpen && hasOpenDocument;
  const hasOpenTab = hasOpenDocument || hasOpenHandwrittenNote || hasOpenImage || hasOpenReferenceDocument || hasReleaseNotes || hasNotes || hasAiConversation;
  const activeEditorId = hasNotes ? "user-notes" : props.activeDocumentId;
  const activeEditorController = editorControllers[activeEditorId] ?? null;
  function captureActiveDocumentMarkdown() {
    if (!activeEditorController || !props.activeDocument || props.activeDocument.id !== props.activeDocumentId) throw new Error("El editor aún no está preparado para capturar el documento. Vuelve a intentarlo.");
    return activeEditorController.getMarkdownSnapshot();
  }
  const activeEditorHistoryState = editorHistoryStates[activeEditorId] ?? emptyMarkdownEditorHistoryState;
  const [historyPreview, setHistoryPreview] = useState<VersionPreview | null>(null);
  const [nativeHistoryRestore,setNativeHistoryRestore]=useState<{documentId:string;versionId?:string}|null>(null);
  const [restoreTarget, setRestoreTarget] = useState<VersionRecord | null>(null);
  const [restoringVersion, setRestoringVersion] = useState(false);
  const activeHistoryPreview = historyPreview?.documentId === props.activeDocumentId ? historyPreview : null;
  const promptDocumentId = hasOpenDocument ? props.activeDocumentId : hasNotes && props.activeProject ? "user-notes" : undefined;
  const promptMarkdown = hasOpenDocument ? props.activeMarkdown : hasNotes ? props.notesMarkdown : "";

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
    editorControllersRef.current = editorControllers;
  }, [editorControllers]);

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
    if (action === "diagram" && !options?.diagram) {
      setDiagramInsertOpen(true);
      return;
    }

    activeEditorController.run(action, options);
    setEditorFormatState((currentFormatState) => keepStableFormatState(currentFormatState, activeEditorController.getFormatState()));
    setEditorHistoryStates((currentHistoryStates) => keepStableHistoryStateForDocument(currentHistoryStates, activeEditorId, activeEditorController.getHistoryState()));
  }, [activeEditorController, activeEditorId]);

  const refreshActiveEditorState = useCallback(() => {
    if (!activeEditorController) return;
    setEditorFormatState((currentFormatState) => keepStableFormatState(currentFormatState, activeEditorController.getFormatState()));
    setEditorHistoryStates((currentHistoryStates) => keepStableHistoryStateForDocument(currentHistoryStates, activeEditorId, activeEditorController.getHistoryState()));
  }, [activeEditorController, activeEditorId]);

  const handleReplaceActiveImage = useCallback((target: MarkdownEditorImageEditTarget, markdown: string) => {
    if (!activeEditorController) return;
    if (activeEditorController.replaceImageAt(target.position, markdown, { addToHistory: true })) {
      refreshActiveEditorState();
    }
    setImageEditTarget(null);
  }, [activeEditorController, props.activeDocument?.path, props.activeProject?.id, props.tree, refreshActiveEditorState]);

  const handleDeleteActiveImage = useCallback((target: MarkdownEditorImageEditTarget) => {
    if (activeEditorController?.deleteImageAt(target.position, { addToHistory: true })) {
      refreshActiveEditorState();
    }
    setImageEditTarget(null);
  }, [activeEditorController, refreshActiveEditorState]);

  const handleReplaceActiveDiagram = useCallback((target: MarkdownEditorDiagramEditTarget, markdown: string) => {
    if (activeEditorController?.replaceDiagramAt(target.position, target.nodeSize, markdown, { addToHistory: true })) {
      refreshActiveEditorState();
    }
    setDiagramEditTarget(null);
  }, [activeEditorController, refreshActiveEditorState]);

  const handleDeleteActiveDiagram = useCallback((target: MarkdownEditorDiagramEditTarget) => {
    if (activeEditorController?.deleteDiagramAt(target.position, target.nodeSize, { addToHistory: true })) {
      refreshActiveEditorState();
    }
    setDiagramEditTarget(null);
  }, [activeEditorController, refreshActiveEditorState]);

  const insertProjectVisualAtEditorPoint = useCallback(async (nodeId: string, clientX: number, clientY: number) => {
    if (!activeEditorController || !props.activeProject || !props.activeDocumentId || !props.activeDocument?.path) return false;

    const cursorMoved = activeEditorController.setCursorAtClientPoint(clientX, clientY, { addToHistory: false });
    if (!cursorMoved) return false;

    const node = findNodeById(props.tree, nodeId);
    if (!node || (node.type !== "image" && node.type !== "handwritten-note")) return false;
    const reference = node.type === "image"
      ? await props.onBuildImageReference(props.activeDocumentId, node.id, null)
      : await props.onBuildHandwrittenImageReference(props.activeDocumentId, node.id, node.name.replace(/\.knote$/i, ""));
    if (!activeEditorController.insertMarkdown(reference.markdown, { addToHistory: true })) return false;

    refreshActiveEditorState();
    return true;
  }, [activeEditorController, props.activeDocument?.path, props.activeDocumentId, props.activeProject, props.onBuildHandwrittenImageReference, props.onBuildImageReference, props.tree, refreshActiveEditorState]);

  const previewProjectImageDropAtEditorPoint = useCallback((assetId: string, clientX: number, clientY: number) => {
    if (!assetId || !activeEditorController || !hasOpenDocument) return;
    activeEditorController.setCursorAtClientPoint(clientX, clientY, { addToHistory: false });
  }, [activeEditorController, hasOpenDocument]);

  const handleEditorImageDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    const projectFile = getDocumentTreeFileDragData(event.dataTransfer);
    if(projectFile?.nodeIds?.length)return;
    if (!isInsertableProjectVisual(projectFile?.type) || !activeEditorController || !hasOpenDocument) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    activeEditorController.setCursorAtClientPoint(event.clientX, event.clientY, { addToHistory: false });
  }, [activeEditorController, hasOpenDocument]);

  const handleEditorImageDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    const projectFile = getDocumentTreeFileDragData(event.dataTransfer);
    if(projectFile?.nodeIds?.length)return;
    if (!isInsertableProjectVisual(projectFile?.type) || !activeEditorController || !hasOpenDocument) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    void insertProjectVisualAtEditorPoint(projectFile.id, event.clientX, event.clientY);
  }, [activeEditorController, hasOpenDocument, insertProjectVisualAtEditorPoint]);

  const handlePreviewDocumentDictation = useCallback((text: string) => {
    activeEditorController?.setTransientTextPreview(text);
  }, [activeEditorController]);

  const handleCommitDocumentDictation = useCallback((text: string) => {
    if (!activeEditorController || !text) return;
    activeEditorController.clearTransientTextPreview();
    activeEditorController.insertText(text, { addToHistory: true });
    setEditorFormatState((currentFormatState) => keepStableFormatState(currentFormatState, activeEditorController.getFormatState()));
    setEditorHistoryStates((currentHistoryStates) => keepStableHistoryStateForDocument(currentHistoryStates, activeEditorId, activeEditorController.getHistoryState()));
  }, [activeEditorController, activeEditorId]);

  const handleClearDocumentDictationPreview = useCallback(() => {
    activeEditorController?.clearTransientTextPreview();
  }, [activeEditorController]);

  const handleEditorControllerChange = useCallback((documentId: string, controller: MarkdownEditorController | null, releasedController?: MarkdownEditorController | null) => {
    props.onRegisterEditorSnapshot?.(documentId,controller,releasedController);
    const shouldReleaseController = Boolean(releasedController && editorControllersRef.current[documentId] === releasedController);

    setEditorControllers((currentControllers) => {
      if (!controller) {
        if (!shouldReleaseController || currentControllers[documentId] !== releasedController) {
          return currentControllers;
        }
        const { [documentId]: _removedController, ...nextControllers } = currentControllers;
        editorControllersRef.current = nextControllers;
        return nextControllers;
      }
      const nextControllers = { ...currentControllers, [documentId]: controller };
      editorControllersRef.current = nextControllers;
      return nextControllers;
    });
    if (documentId === activeEditorId && (controller || shouldReleaseController)) {
      setEditorFormatState((currentFormatState) =>
        keepStableFormatState(currentFormatState, controller ? controller.getFormatState() : emptyMarkdownEditorFormatState),
      );
      setEditorHistoryStates((currentHistoryStates) =>
        keepStableHistoryStateForDocument(currentHistoryStates, documentId, controller ? controller.getHistoryState() : emptyMarkdownEditorHistoryState),
      );
    }
    if (!controller) {
      setEditorHistoryStates((currentHistoryStates) => {
        if (!shouldReleaseController) {
          return currentHistoryStates;
        }
        const { [documentId]: _removedHistoryState, ...nextHistoryStates } = currentHistoryStates;
        return nextHistoryStates;
      });
    }
  }, [activeEditorController, activeEditorId, props.onRegisterEditorSnapshot]);

  useEffect(() => {
    setEditorFormatState((currentFormatState) =>
      keepStableFormatState(currentFormatState, activeEditorController ? activeEditorController.getFormatState() : emptyMarkdownEditorFormatState),
    );
    setEditorHistoryStates((currentHistoryStates) =>
      keepStableHistoryStateForDocument(currentHistoryStates, activeEditorId, activeEditorController ? activeEditorController.getHistoryState() : emptyMarkdownEditorHistoryState),
    );
  }, [activeEditorController, activeEditorId]);

  useEffect(() => {
    if (props.pendingEditorOperations.length === 0) return;

    for (const operation of props.pendingEditorOperations) {
      if (props.canApplyEditorOperation && !props.canApplyEditorOperation(operation)) { props.onEditorOperationFailed({ ...operation, failureReason: "source_changed" }); continue; }
      const controller = editorControllers[operation.documentId];
      if (!controller) continue;

      if (typeof operation.expectedMarkdown === "string") {
        if (!controller.matchesMarkdown(operation.expectedMarkdown)) { props.onEditorOperationFailed({ ...operation, failureReason: "source_changed" }); continue; }
      }
      const markdown = operation.markdown;
      const operationKind = operation.kind ?? "replace_document";
      const applied = operationKind === "replace_range"
        ? controller.replaceRange(operation.from ?? 0, operation.to ?? operation.from ?? 0, markdown, { addToHistory: operation.addToHistory ?? true })
        : operationKind === "insert_at"
        ? controller.insertMarkdownAt(operation.position ?? operation.from ?? 0, markdown, { addToHistory: operation.addToHistory ?? true })
        : controller.replaceMarkdown(markdown, { addToHistory: operation.addToHistory ?? true });
      if (!applied) {
        props.onEditorOperationFailed(operation);
        continue;
      }

      setEditorHistoryStates((currentHistoryStates) =>
        keepStableHistoryStateForDocument(currentHistoryStates, operation.documentId, controller.getHistoryState()),
      );
      if (operation.documentId === activeEditorId) {
        setEditorFormatState((currentFormatState) => keepStableFormatState(currentFormatState, controller.getFormatState()));
      }
      props.onEditorOperationApplied(operation.id);
    }
  }, [
    editorControllers,
    activeEditorId,
    props.activeProject?.id,
    props.editorSessions,
    props.onEditorOperationApplied,
    props.onEditorOperationFailed,
    props.pendingEditorOperations,
    props.canApplyEditorOperation,
    props.tree,
  ]);

  useEffect(() => {
    if (!navigationOpen) return;

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector('[role="dialog"]')) { setNavigationOpen(false); requestAnimationFrame(()=>navigationToggleRef.current?.focus()); }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [navigationOpen]);

  useEffect(() => {
    setHistoryPreview(null);
    setRestoreTarget(null);
  }, [props.activeDocumentId]);

  useEffect(() => {
    if (settingsMode || !props.historyOpen || navigationOpen) return;

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector('[role="dialog"]')) props.onCloseHistory();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [navigationOpen, settingsMode, props.historyOpen, props.onCloseHistory]);

  const handleOpenDocument = useCallback((documentId: string, name: string) => {
    props.onOpenDocument(documentId, name);
    setNavigationOpen(false);
  }, [props.onOpenDocument]);

  const handleOpenReleaseNotes = useCallback(() => {
    setNavigationOpen(false);
    props.onOpenReleaseNotes();
  }, [props.onOpenReleaseNotes]);

  const [imageInsertOpen, setImageInsertOpen] = useState(false);
  const [imageEditTarget, setImageEditTarget] = useState<MarkdownEditorImageEditTarget | null>(null);
  const [diagramInsertOpen, setDiagramInsertOpen] = useState(false);
  const [diagramEditTarget, setDiagramEditTarget] = useState<MarkdownEditorDiagramEditTarget | null>(null);

  const externalChangeBadges = useMemo(() => buildExternalChangeBadges(props.externalChangeSet), [props.externalChangeSet]);
  const projectTreeStatus = useMemo(
    () => buildProjectTreeStatus(props.activeProject, props.externalChangeSet, props.projectSyncStatus, props.projectSyncState, props.externalChangesBusy, props.externalChangeSetAcknowledged),
    [props.activeProject, props.externalChangeSet, props.projectSyncStatus, props.projectSyncState, props.externalChangesBusy, props.externalChangeSetAcknowledged],
  );

  async function confirmRestoreVersion(strategy: RestoreStrategy) {
    if (!restoreTarget) return;
    setRestoringVersion(true);
    try {
      if (strategy === "save-and-restore") {
        const saved = await props.onSaveActiveDocument();
        if (!saved) return;
      }
      if (strategy === "discard-and-restore") {
        const discarded = await props.onDiscardActiveDocumentDraft();
        if (!discarded) return;
      }
      const response = await props.onRestoreVersion(restoreTarget.id);
      if (response) {
        setRestoreTarget(null);
        setHistoryPreview(null);
      }
    } finally {
      setRestoringVersion(false);
    }
  }

  return (
    <div className={["workspace-v3 h-full overflow-hidden bg-white text-ink-primary", mobileShell ? "knownext-mobile-shell" : "", phoneShell ? "knownext-phone-shell" : ""].join(" ")}>
      {mobileShell ? null : <TitleBar />}
      {commandsOpen && <WorkspaceCommandPalette language={props.appLanguage} key={props.activeProject?.id ?? "none"} tree={props.tree} projectId={props.activeProject?.id ?? null} projects={props.projects} recentIds={recentByProject[props.activeProject?.id ?? ""] ?? []} onClose={()=>setCommandsOpen(false)} onSelectProject={id=>{setNavigationOpen(false);props.settingsWorkspace?.onClose();props.onSelectProject(id);}} onSelectNode={(id,type,name,focus)=>{setNavigationOpen(false);props.settingsWorkspace?.onClose();props.onSelectTreeNode(id,type,name,focus);if(type==='folder'){changeNavigation(true);setNavigationOpen(true);}}} commands={[
        {id:'settings',label:settingsMode?(props.appLanguage==="en"?'Back to document':'Volver al documento'):(props.appLanguage==="en"?'Open settings':'Abrir configuración'),detail:(props.appLanguage==="en"?'Settings on this device':'Ajustes de este dispositivo'),run:()=>{if(settingsMode)props.settingsWorkspace?.onClose();else props.onOpenAppSettings();}},
        {id:'project',label:(props.appLanguage==="en"?'Create or open a project':'Crear o abrir un proyecto'),run:props.onCreateProject},
        ...(props.activeProject&&props.onOpenProjectReplace?[{id:'replace-project',label:(props.appLanguage==="en"?'Replace in documents':'Reemplazar en documentos'),detail:(props.appLanguage==="en"?'Select, compare and apply as drafts':'Seleccionar, comparar y aplicar como borradores'),run:props.onOpenProjectReplace}]:[]),
        ...(props.activeProject&&props.historyEnabled?[{id:'history-file-restore',label:(props.appLanguage==="en"?'Restore a historical file':'Restaurar archivo histórico'),detail:(props.appLanguage==="en"?'Review Markdown, notes and resources by path':'Revisar Markdown, notas y recursos por ruta'),run:()=>setNativeHistoryRestore({documentId:props.activeDocumentId||`${props.activeProject!.id}::`})}]:[]),
        ...(props.activeProject&&props.onOpenAssetCatalog?[{id:'asset-catalog',label:(props.appLanguage==="en"?'Project resources and links':'Recursos y enlaces del proyecto'),detail:(props.appLanguage==="en"?'Review attachments, references, available text and missing items':'Consultar adjuntos, referencias, texto disponible y faltantes'),run:props.onOpenAssetCatalog}]:[]),
        ...(props.activeProject&&props.onOpenAiChangeHistory?[{id:'ai-changes',label:(props.appLanguage==="en"?'AI changes and reversal':'Cambios IA y reversión'),detail:(props.appLanguage==="en"?'Review operations and preserve later edits':'Revisar operaciones y conservar ediciones posteriores'),run:props.onOpenAiChangeHistory}]:[]),
        {id:'recovery',label:(props.appLanguage==="en"?'Recover drafts':'Recuperar borradores'),detail:props.appLanguage==="en"?`${props.orphanDraftCount} missing files · review other copies`:`${props.orphanDraftCount} archivos desaparecidos · revisar otras copias`,run:props.onOpenRecoverableDrafts},
        {id:'navigation',label:(window.matchMedia('(min-width: 1024px)').matches?navigationVisible:navigationOpen)?(props.appLanguage==="en"?'Hide navigation':'Ocultar navegación'):(props.appLanguage==="en"?'Show navigation':'Mostrar navegación'),run:()=>{if(window.matchMedia('(min-width: 1024px)').matches)changeNavigation(!navigationVisible);else setNavigationOpen(!navigationOpen);}},
        {id:'assistant',label:(props.appLanguage==="en"?'Open assistant':'Abrir asistente'),detail:(props.appLanguage==="en"?'Active document context':'Contexto del documento activo'),run:()=>{props.settingsWorkspace?.onClose();setContextKind('assistant');props.onCloseHistory();setContextVisible(true);}},
        ...(props.activeProject ? [{id:'create',label:(props.appLanguage==="en"?'Create document':'Crear documento'),detail:(props.appLanguage==="en"?'At the project root':'En la raíz del proyecto'),run:()=>props.onCreateDocument(null)}] : []),
        ...(hasOpenTab && !settingsMode ? [{id:'save',label:(props.appLanguage==="en"?'Save active document':'Guardar documento activo'),run:props.onSave}] : []),
        ...(props.activeProject && props.onOpenTrash ? [{id:'trash',label:(props.appLanguage==="en"?'Open trash':'Abrir papelera'),detail:(props.appLanguage==="en"?'Recover files and review operations':'Recuperar archivos y revisar operaciones'),run:props.onOpenTrash}] : []),
      ]}/>}
      <div
        className={["relative flex", mobileShell ? "h-full" : "h-[calc(100%-36px)]"].join(" ")}
        style={mobileShell ? { paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" } : undefined}
      >
        {navigationOpen ? (
          <button
            className={["fixed inset-x-0 bottom-0 z-40 bg-black/20 lg:hidden", mobileShell ? "top-0" : "top-9"].join(" ")}
            aria-label="Cerrar panel de documentos"
            onClick={() => setNavigationOpen(false)}
          />
        ) : null}
        <aside
          className={[
            "workspace-navigation absolute inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-line bg-panel shadow-menu transition-transform duration-200 ease-out lg:relative lg:translate-x-0 lg:shadow-none",
            navigationOpen ? "visible translate-x-0" : "invisible -translate-x-full lg:visible",
            navigationVisible ? "" : "lg:hidden",
          ].join(" ")}
          style={{ width: phoneShell ? "min(100vw, 420px)" : sidebar.width, maxWidth: phoneShell ? "100vw" : "calc(100vw - 48px)" }}
        >
          <div className="min-h-0 flex-1 flex-col" style={{display: settingsMode ? "none" : "flex"}}>
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
                    onClick={() => changeNavigation(false)}
                  >
                    <PanelLeftClose size={16} />
                  </button>
                </>
              }
              onSelectProject={props.onSelectProject}
              onCreateProject={props.onCreateProject}
              onImportPackage={props.onImportProjectPackage}
              onExportPackage={props.onExportProjectPackage}
              onOpenHistoryRestore={props.activeProject&&props.historyEnabled?()=>setNativeHistoryRestore({documentId:props.activeDocumentId||`${props.activeProject!.id}::`}):undefined}
              onOpenAssetCatalog={props.onOpenAssetCatalog}
              onOpenProjectReplace={props.onOpenProjectReplace}
              onOpenAiChangeHistory={props.onOpenAiChangeHistory}
              onRetiredProjects={props.onRetiredProjects}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2 py-1.5">
            {props.activeProject&&props.treeReadIssue&&<ProjectTreeReadIssue message={props.treeReadIssue} hasPreviousView={!!props.tree.length} busy={props.treeReadBusy??false} onRetry={()=>props.onReloadProjectTree?.()} onSearch={()=>setCommandsOpen(true)}/>}
            {props.activeProject&&(!props.treeReadIssue||!!props.tree.length) ? (
              <DocumentTree
                key={props.activeProject?.id ?? "none"}
                onBatchAction={props.onBatchAction}
                nodes={props.tree}
                activeDocumentId={props.activeDocumentId}
                activeTreeNodeId={props.activeTreeNodeId}
                hasActiveProject={Boolean(props.activeProject)}
                onOpenDocument={handleOpenDocument}
                onOpenHandwrittenNote={(...args)=>{setNavigationOpen(false);props.onOpenHandwrittenNote(...args);}}
                onOpenImage={(...args)=>{setNavigationOpen(false);props.onOpenImage(...args);}}
                onOpenReferenceDocument={(...args)=>{setNavigationOpen(false);props.onOpenReferenceDocument(...args);}}
                onActivateTreeNode={props.onActivateTreeNode}
                onSelectTreeNode={props.onSelectTreeNode}
                onCreateFolder={props.onCreateFolder}
                onCreateDocument={(...args)=>{setNavigationOpen(false);props.onCreateDocument(...args);}}
                onRecordAudio={props.onRecordAudio}
                onCreateHandwrittenNote={(...args)=>{setNavigationOpen(false);props.onCreateHandwrittenNote(...args);}}
                onImportFile={props.onImportProjectFile}
                onExpandTree={props.onExpandTree}
                onCollapseTree={props.onCollapseTree}
                onConfigureProject={props.onConfigureProject}
                onOpenProjectStatus={props.onOpenExternalChanges}
                onRenameNode={props.onRenameNode}
                onToggleNode={props.onToggleNode}
                onContextAction={props.onTreeContextAction}
                onMoveNode={props.onMoveTreeNode}
                onAddNodeContext={props.onAddProjectDocumentContext}
                onPreviewImageDropIntoActiveDocument={previewProjectImageDropAtEditorPoint}
                onDropImageIntoActiveDocument={(nodeId, clientX, clientY) => void insertProjectVisualAtEditorPoint(nodeId, clientX, clientY)}
                changeBadges={externalChangeBadges}
                projectStatus={projectTreeStatus}
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
            onOpenReleaseNotes={handleOpenReleaseNotes}
            isCheckingForUpdates={props.isCheckingForUpdates}
          />
          </div>
          <div className="min-h-0 flex-1 flex-col" style={{display: settingsMode ? "flex" : "none"}}>
            {props.settingsWorkspace?.navigation({onNavigate: () => setNavigationOpen(false), onHide: () => {setNavigationOpen(false);changeNavigation(false);}})}
          </div>
        </aside>
        {navigationVisible ? (
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
        ) : null}

        <main data-workspace-focus-anchor tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <nav className="workspace-panel-controls" aria-label="Paneles de trabajo">
            <button ref={navigationToggleRef} aria-label="Alternar navegación" aria-expanded={window.matchMedia("(min-width: 1024px)").matches ? navigationVisible : navigationOpen} onClick={() => { if (window.matchMedia("(min-width: 1024px)").matches) changeNavigation(!navigationVisible); else setNavigationOpen(value => !value); }}><PanelLeftOpen size={16}/><span>Navegación</span></button>
            {settingsMode && <button aria-label="Volver al documento" onClick={props.settingsWorkspace?.onClose}><ArrowLeft size={16}/><span>Volver al documento</span></button>}
            <span className="min-w-0 flex-1 truncate text-xs text-ink-secondary">{settingsMode ? (props.appLanguage === "en" ? "This device" : "Este dispositivo") : props.activeProject?.name}</span>
            <button aria-label="Acceso rápido" title="Acceso rápido · Ctrl/Cmd Shift P" onClick={()=>setCommandsOpen(true)}><Search size={16}/></button>
            <button aria-label="Abrir Grabaciones" title="Grabaciones" onClick={props.onOpenRecordings}><Mic size={16}/></button>
            {props.aiResultReview && <button className="relative" aria-label={`Resultados IA conservados${props.aiResultReview.count ? `: ${props.aiResultReview.count}` : ""}`} title={props.aiResultReview.hasError ? "Revisar resultados · Hay un aviso de conservación" : "Resultados IA conservados"} onClick={props.aiResultReview.onOpen}><GitCompareArrows size={16}/><span>Resultados IA{props.aiResultReview.count ? ` · ${props.aiResultReview.count}` : props.aiResultReview.hasError ? " · !" : ""}</span>{(props.aiResultReview.count > 0 || props.aiResultReview.hasError) && <span className="workspace-result-count" aria-hidden="true">{props.aiResultReview.count || "!"}</span>}</button>}
            <button aria-label="Configuración" aria-pressed={settingsMode} onClick={() => {if(settingsMode)props.settingsWorkspace?.onClose();else props.onOpenAppSettings();}}><Settings size={16}/></button>
            {!settingsMode && props.activeProject && props.onOpenTrash && <button aria-label="Papelera del proyecto" onClick={props.onOpenTrash}><Trash2 size={16}/></button>}
            <span className="workspace-activity" role="status">{assistantBusy ? "IA en curso" : props.aiBubble ? "Resultado IA disponible" : ""}</span>
            <button ref={contextToggleRef} aria-label="Alternar contexto" aria-expanded={contextOpen} onClick={() => { const next = !contextOpen; if(settingsMode){setSettingsContextVisible(next);return;} if (props.historyOpen) props.onCloseHistory(); setContextVisible(next); }}><span>Contexto</span><PanelRightOpen size={16}/></button>
          </nav>
          {props.activeProject&&props.treeReadIssue&&!settingsMode&&<div className={navigationVisible?"shrink-0 p-2 lg:hidden":"shrink-0 p-2"}><ProjectTreeReadIssue message={props.treeReadIssue} hasPreviousView={!!props.tree.length} busy={props.treeReadBusy??false} onRetry={()=>props.onReloadProjectTree?.()} onSearch={()=>setCommandsOpen(true)}/></div>}
          {props.continuityNotice}
          {hasOpenTab && !settingsMode ? (
            <>
          <DocumentTabs
            tabs={props.tabs}
            activeTabId={props.activeTabId}
            activeDocumentId={props.activeDocumentId}
            dirtyDocumentIds={props.dirtyDocumentIds}
            onOpenNavigation={() => setNavigationOpen(true)}
            onSelectTab={props.onSelectTab}
            onCloseTab={props.onCloseTab}
            onCloseTabs={props.onCloseTabs}
            onReorderDocumentTabs={props.onReorderDocumentTabs}
          />
              {hasReleaseNotes || hasAiConversation || hasOpenImage || hasOpenReferenceDocument || hasOpenHandwrittenNote || hasOpenDocument ? null : (
              <MarkdownToolbar
                historyOpen={props.historyOpen}
                historyEnabled={props.historyEnabled}
                historyDisabledReason={getHistoryDisabledReason(props.activeProject, props.versioningStatus)}
                editorReady={activeEditorController !== null && !activeHistoryPreview && !markdownSourceVisible}
                extendedUnderlineEnabled={props.markdownExtendedUnderlineEnabled}
                markdownZoomPercent={markdownZoomPercent}
                markdownSourceVisible={markdownSourceVisible}
                activeActions={editorFormatState}
                editorHistoryState={activeEditorHistoryState}
                imageInsertionEnabled={!hasNotes}
                documentActionsEnabled={!hasNotes}
                onRunEditorAction={handleRunEditorAction}
                onExportDocument={(format) => props.onExportDocument(props.activeDocumentId, format, captureActiveDocumentMarkdown)}
                onSaveTemplate={props.onSaveDocumentTemplate ? () => props.onSaveDocumentTemplate!(props.activeDocumentId, captureActiveDocumentMarkdown) : undefined}
                onMarkdownZoomChange={(nextZoom) => setMarkdownZoomPercent(clamp(Math.round(nextZoom), 80, 150))}
                onToggleMarkdownSource={() => setMarkdownSourceVisible((visible) => !visible)}
                onToggleHistory={props.onToggleHistory}
              />
              )}
            </>
          ) : null}
          <div className="relative flex min-h-0 flex-1">
            <section ref={documentSurfaceRef} aria-hidden={settingsMode || undefined} style={{display: settingsMode ? "none" : undefined}} className={["relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", hasOpenTab ? "bg-white" : "bg-panel"].join(" ")}>
              {hasOpenTab ? (
                <>
                  <div className={hasAiConversation || hasOpenImage || hasOpenReferenceDocument || hasOpenHandwrittenNote || hasOpenDocument ? "min-h-0 flex-1 overflow-hidden pb-[54px]" : "min-h-0 flex-1 overflow-y-auto px-8 pt-4 pb-12"}>
                    <div className={hasAiConversation || hasOpenImage || hasOpenReferenceDocument || hasOpenHandwrittenNote ? "h-full min-h-0 w-full" : "mx-auto max-w-[900px]"}>
                      {hasReleaseNotes ? (
                        <ReleaseNotesViewer markdown={props.releaseNotesMarkdown} />
                      ) : hasAiConversation ? (
                        <AiConversationView
                          project={props.activeProject}
                          config={props.aiConfig}
                          indexStatus={props.aiIndexStatus}
                          events={props.aiConversationEvents}
                          pendingIntent={props.aiPendingIntent}
                          editProposal={props.aiEditProposal}
                          applyingEditProposalId={props.applyingAiEditProposalId}
                          staleEditOperationIds={props.staleAiEditOperationIds}
                          blockedEditOperationReasons={props.blockedAiEditOperationReasons}
                          appliedEditOperationIds={props.appliedAiEditOperationIds}
                          onIntentAction={props.onAiIntentAction}
                          onApplyEditProposal={props.onApplyAiEditProposal}
                          onDiscardEditProposal={props.onDiscardAiEditProposal}
                          onOpenDocument={props.onOpenDocument}
                        />
                      ) : hasOpenHandwrittenNote && activeWorkspaceTab?.kind === "handwritten-note" ? (
                        <div className="flex h-full min-h-0 flex-col">
                        {props.activeHandwrittenLoadError && <LoadFailure message={props.activeHandwrittenLoadError} onRetry={()=>props.onRetryHandwrittenLoad(activeWorkspaceTab.id)}/>}
                        {props.activeHandwrittenDraftWriteConflict&&<DraftWriteConflictBanner busy={props.draftReviewBusy===activeWorkspaceTab.id} onReview={()=>props.onReviewChangedDraft?.(activeWorkspaceTab.id,true)} onRecovery={props.onOpenRecoverableDrafts}/>}
                        {(props.activeHandwrittenDiskChanged || props.activeHandwrittenConflictStatus === "orphaned" || props.activeHandwrittenNote?.baseVerified === false) && <div className="shrink-0 px-3 pt-3"><DocumentConflictBanner
                          conflictStatus={props.activeHandwrittenConflictStatus ?? "disk-changed"}
                          baseVerified={props.activeHandwrittenNote?.baseVerified}
                          sourceUnavailable={props.activeHandwrittenNote?.sourceUnavailable}
                          recoveryMessage={props.activeHandwrittenNote?.recoveryWarning}
                          onReviewRecovery={props.onRecoverHandwrittenCopy??props.onOpenRecoverableDrafts}
                          onRetrySource={()=>props.onRetryHandwrittenLoad(activeWorkspaceTab.id)}
                          onKeepLocalVersion={()=>props.onKeepHandwrittenVersion?.()}
                          onLoadDiskVersion={()=>props.onLoadHandwrittenDiskVersion?.()}
                          onMergeDiskVersion={props.onMergeHandwrittenDiskVersion}
                        /></div>}
                        <div className="min-h-0 flex-1">
                        <HandwrittenEditor
                          noteId={activeWorkspaceTab.id}
                          pageFocus={props.handwrittenPageFocus}
                          onPageFocusHandled={props.onHandwrittenPageFocusHandled}
                          name={activeWorkspaceTab.name}
                          content={props.activeHandwrittenContent}
                          toolPresets={props.handwrittenToolPresets}
                          eraserConfig={props.handwrittenEraserConfig}
                          isDirty={props.activeHandwrittenDirty}
                          saveState={props.activeHandwrittenSaveState}
                          onBeforeOcr={props.onBeforeHandwrittenOcr?()=>props.onBeforeHandwrittenOcr!(activeWorkspaceTab.id):undefined}
                          onApplyOcr={props.onApplyHandwrittenOcr}
                          onOcrObserved={props.onHandwrittenOcrObserved}
                          onChange={(nextContent) => props.onHandwrittenChange(activeWorkspaceTab.id, nextContent)}
                          onToolPresetsChange={props.onHandwrittenToolPresetsChange}
                          onEraserConfigChange={props.onHandwrittenEraserConfigChange}
                        />
                        </div>
                        </div>
                      ) : hasNotes ? (
                        props.notesLoaded ? (
                          markdownSourceVisible ? (
                            <MarkdownSourceViewer markdown={props.notesMarkdown} zoomPercent={markdownZoomPercent} ariaLabel="Markdown puro de Notas" />
                          ) : (
                              <MarkdownEditor
                                key={props.notesEditorKey}
                                documentKey={props.notesEditorKey}
                                markdown={props.notesMarkdown}
                                onChange={props.onNotesMarkdownChange}
                                onControllerChange={(controller, releasedController) => handleEditorControllerChange("user-notes", controller, releasedController)}
                                onFormatStateChange={(formatState) => {
                                  if (hasNotes) {
                                    setEditorFormatState((currentFormatState) => keepStableFormatState(currentFormatState, formatState));
                                  }
                                }}
                                onHistoryStateChange={(historyState) => {
                                  setEditorHistoryStates((currentHistoryStates) =>
                                    keepStableHistoryStateForDocument(currentHistoryStates, "user-notes", historyState),
                                  );
                                }}
                                onSelectionChange={(selection) => props.onDocumentSelectionChange("user-notes", selection)}
                                selectionFocus={toMarkdownEditorSelection(props.aiSelectionFocus, "user-notes")}
                                zoomPercent={markdownZoomPercent}
                              />
                          )
                        ) : (
                          <div className="pt-6 text-[11px] text-ink-secondary">Cargando notas...</div>
                        )
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
                      ) : hasOpenReferenceDocument && activeWorkspaceTab?.kind === "reference-document" && props.activeProject ? (
                        <ReferenceDocumentViewer project={props.activeProject} tab={activeWorkspaceTab} />
                      ) : (
                        <HistoryComparisonSurface documentId={props.activeDocumentId} preview={activeHistoryPreview ? (
                        <HistoryPreviewWorkspace
                          preview={activeHistoryPreview}
                          currentMarkdown={props.activeMarkdown}
                          markdownZoomPercent={markdownZoomPercent}
                          onModeChange={(mode) => setHistoryPreview((currentPreview) => (
                            currentPreview && currentPreview.documentId === props.activeDocumentId
                              ? { ...currentPreview, mode }
                              : currentPreview
                          ))}
                          onRestore={()=>setNativeHistoryRestore({documentId:activeHistoryPreview.documentId,versionId:activeHistoryPreview.version.id})}
                          onRestoreParts={props.onRestoreVersionParts?()=>{setHistoryPreview(null);props.onRestoreVersionParts?.(activeHistoryPreview.version.id);}:undefined}
                          onSwap={() => setHistoryPreview(current => current?.comparison ? {...current, version:current.comparison.version, markdown:current.comparison.markdown, comparison:{version:current.version,markdown:current.markdown}} : current)}
                          onBackToCurrent={() => setHistoryPreview(null)}
                        />
                        ) : null}>
                      {props.activeDraftWriteConflict&&<DraftWriteConflictBanner busy={props.draftReviewBusy===props.activeDocumentId} onReview={()=>props.onReviewChangedDraft?.(props.activeDocumentId,false)} onRecovery={props.onOpenRecoverableDrafts}/>}
                      {props.activeDocumentDiskChanged || props.activeDocumentConflictStatus === "orphaned" || props.activeDocument?.baseVerified === false ? (
                        <DocumentConflictBanner
                          conflictStatus={props.activeDocumentConflictStatus}
                          baseVerified={props.activeDocument?.baseVerified}
                          onKeepLocalVersion={props.onKeepLocalVersion}
                          onLoadDiskVersion={props.onLoadDiskVersion}
                          onMergeDiskVersion={props.onMergeDiskVersion}
                        />
                      ) : null}
                      {props.editorSessions.map((session) => (
                        <div
                          key={session.documentId}
                          className={session.documentId === props.activeDocumentId ? "" : "hidden"}
                          onDragOver={session.documentId === props.activeDocumentId ? handleEditorImageDragOver : undefined}
                          onDrop={session.documentId === props.activeDocumentId ? handleEditorImageDrop : undefined}
                        >
                          {session.loadError && <LoadFailure message={session.loadError} onRetry={()=>props.onRetryDocumentLoad(session.documentId)}/>}
                          {session.document ? (
                            markdownSourceVisible && session.documentId === props.activeDocumentId ? (
                              <MarkdownSourceViewer markdown={session.markdown} zoomPercent={markdownZoomPercent} ariaLabel={`Markdown puro de ${session.document.name}`} />
                            ) : (
                                <MarkdownEditor
                                  key={session.editorKey}
                                  documentKey={session.editorKey}
                                  markdown={session.markdown}
                                  resolveImageSource={source => projectImageSource(source, props.activeProject?.id ?? "", session.document!.path, props.tree)}
                                  onChange={(markdown, source) => props.onMarkdownChange(session.documentId, markdown, source)}
                                  onControllerChange={(controller, releasedController) => handleEditorControllerChange(session.documentId, controller, releasedController)}
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
                                  onImageEditRequest={setImageEditTarget}
                                  onDiagramEditRequest={setDiagramEditTarget}
                                  selectionFocus={toMarkdownEditorSelection(props.aiSelectionFocus, session.documentId)}
                                  zoomPercent={markdownZoomPercent}
                                />
                            )
                          ) : (
                            session.isLoading ? <div className="pt-6 text-[11px] text-ink-secondary" role="status">Cargando documento...</div> : null
                          )}
                        </div>
                      ))}
                        </HistoryComparisonSurface>
                      )}
                    </div>
                  </div>

                </>
              ) : showWelcome ? (
                <WorkspaceWelcome language={props.appLanguage} onCreateProject={props.onCreateProject} onUseNotes={() => {
                  props.onLayoutConfigChange({ firstUseDismissed: true });
                  const notes = props.tabs.find(tab => tab.kind === "notes");
                  if (notes) props.onSelectTab(notes.id);
                }}/>
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
              {imageInsertOpen && props.activeProject && hasOpenDocument ? (
                <InsertImageDialog
                  activeProjectId={props.activeProject.id}
                  activeDocumentId={props.activeDocumentId}
                  activeDocumentPath={props.activeDocument?.path ?? null}
                  tree={props.tree}
                  onClose={() => setImageInsertOpen(false)}
                  onImportImage={props.onImportProjectImage}
                  onBuildReference={props.onBuildImageReference}
                  onBuildHandwrittenReference={props.onBuildHandwrittenImageReference}
                  onInsert={(markdown) => {
                    if (activeEditorController?.insertMarkdown(markdown, { addToHistory: true })) {
                      refreshActiveEditorState();
                    }
                    setImageInsertOpen(false);
                  }}
                />
              ) : null}
              {imageEditTarget && props.activeProject && hasOpenDocument ? (
                <InsertImageDialog
                  variant="edit"
                  activeProjectId={props.activeProject.id}
                  activeDocumentId={props.activeDocumentId}
                  activeDocumentPath={props.activeDocument?.path ?? null}
                  tree={props.tree}
                  initialAltText={imageEditTarget.alt}
                  initialUrl={imageEditTarget.src}
                  onClose={() => setImageEditTarget(null)}
                  onImportImage={props.onImportProjectImage}
                  onBuildReference={props.onBuildImageReference}
                  onBuildHandwrittenReference={props.onBuildHandwrittenImageReference}
                  onInsert={(markdown) => handleReplaceActiveImage(imageEditTarget, markdown)}
                  onDelete={() => handleDeleteActiveImage(imageEditTarget)}
                />
              ) : null}
              {diagramInsertOpen && hasOpenDocument ? (
                <InsertDiagramDialog
                  diagramConfig={props.aiConfig.diagrams}
                  onClose={() => setDiagramInsertOpen(false)}
                  onInsert={(markdown) => {
                    if (activeEditorController?.insertMarkdown(markdown, { addToHistory: true })) {
                      refreshActiveEditorState();
                    }
                    setDiagramInsertOpen(false);
                  }}
                />
              ) : null}
              {diagramEditTarget && hasOpenDocument ? (
                <InsertDiagramDialog
                  variant="edit"
                  diagramConfig={props.aiConfig.diagrams}
                  initialCode={diagramEditTarget.code}
                  initialCaption={diagramEditTarget.caption}
                  onClose={() => setDiagramEditTarget(null)}
                  onInsert={(markdown) => handleReplaceActiveDiagram(diagramEditTarget, markdown)}
                  onDelete={() => handleDeleteActiveDiagram(diagramEditTarget)}
                />
              ) : null}
              <ExternalChangesDrawer
                open={props.externalChangesOpen}
                project={props.activeProject}
                overview={props.fileSyncOverview}
                overviewError={props.fileSyncOverviewError}
                openDrafts={props.openDocumentDraftStates}
                changeSet={props.externalChangeSet}
                decisions={props.externalChangeDecisions}
                syncStatus={props.projectSyncStatus}
                syncState={props.projectSyncState}
                acknowledged={props.externalChangeSetAcknowledged}
                busy={props.externalChangesBusy}
                message={props.externalChangesMessage}
                onDecisionChange={props.onExternalChangeDecision}
                onImport={props.onImportExternalChanges}
                onOmitAll={props.onOmitExternalChanges}
                onPushGithub={props.onPushProject}
                onPullGithub={props.onPullProject}
                onOpenGithubRepository={props.onOpenProjectGithub}
                onOpenDocument={props.onOpenDocument}
                onSaveDocument={props.onSaveDocument}
                onDiscardDocumentDraft={props.onDiscardDocumentDraft}
                onRefresh={props.onRefreshExternalChanges}
                beforeApply={props.beforeMixedApplication} onApplicationChanged={props.onMixedApplicationChanged}
                onLocalTreeChanged={props.onHistoricalCopyTree} onLocalTreeUnavailable={props.onHistoricalCopyTreeUnavailable}
                onClose={props.onCloseExternalChanges}
              />
              {hasOpenDocument ? (
                <DocumentStatusBar
                  isLoading={props.activeDocumentLoading}
                  loadError={props.activeDocumentLoadError}
                  isDirty={props.activeDocumentDirty}
                  saveState={props.saveState}
                  wordCount={props.activeDocument?.wordCount ?? countWords(props.activeMarkdown)}
                  gitEnabled={props.historyEnabled}
                  canSave={Boolean(props.activeDocument && props.activeDocumentId)}
                  documentSyncStatus={props.activeDocumentSyncStatus}
                  remoteAccess={props.projectSyncStatus?.remoteAccess}
                  remotePaused={props.projectSyncStatus?.remotePaused}
                  remoteReason={props.projectSyncStatus?.remoteReason}
                  isSyncing={props.isSyncingProject || props.externalChangesBusy}
                  postSaveSyncState={props.activeDocumentPostSaveSyncState}
                  pendingSaveHint={props.activeDocumentPendingSaveHint}
                  onSave={props.onSave}
                  onSynchronize={props.onSynchronizeDocument}
                  onUpdateFromRemote={props.onUpdateDocumentFromRemote}
                  onDiscardPendingChanges={props.onDiscardPendingDocumentChanges}
                />
              ) : hasNotes ? (
                <WorkspaceStatusBar
                  kind="MD"
                  title="Notas"
                  detail={`${countWords(props.notesMarkdown)} palabras · ${props.notesLoaded?notesSaveFeedback(props.notesSaveState,props.notesDirty,props.notesUpdatedAt?formatCompactDateTime(props.notesUpdatedAt):null):"Lectura pendiente"}`}
                />
              ) : hasOpenHandwrittenNote ? (
                <DocumentStatusBar
                  isLoading={props.activeHandwrittenLoading}
                  loadError={props.activeHandwrittenLoadError}
                  blockedSaveReason={props.activeHandwrittenNote?.sourceUnavailable?props.activeHandwrittenNote.recoveryWarning??"La fuente no es compatible; el borrador local se conserva.":undefined}
                  isDirty={props.activeHandwrittenDirty}
                  saveState={props.activeHandwrittenSaveState}
                  kindLabel="KNOTE"
                  metricLabel={`${props.activeHandwrittenContent?.pages.length ?? 0} página(s)`}
                  gitEnabled={false}
                  canSave={Boolean(props.activeHandwrittenNoteId)}
                  canDiscard={false}
                  isSyncing={false}
                  onSave={() => { void props.onSaveHandwrittenNote(props.activeHandwrittenNoteId); }}
                  onSynchronize={() => undefined}
                  onUpdateFromRemote={() => undefined}
                  onDiscardPendingChanges={() => undefined}
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
              ) : hasOpenReferenceDocument && activeWorkspaceTab?.kind === "reference-document" ? (
                <WorkspaceStatusBar
                  kind={activeWorkspaceTab.format.toUpperCase()}
                  title="Solo lectura"
                  detail={activeWorkspaceTab.path}
                />
              ) : hasOpenTab ? (
                <WorkspaceStatusBar
                  kind={getWorkspaceStatusKind(activeWorkspaceTab?.kind)}
                  title={getWorkspaceStatusTitle(activeWorkspaceTab, props.aiConfig.openaiKeyConfigured)}
                  detail={getWorkspaceStatusDetail(activeWorkspaceTab, props.activeProject?.name)}
                />
              ) : null}
            </section>
            <section ref={settingsContentRef} tabIndex={-1} aria-label="Configuración de este dispositivo" className="min-h-0 min-w-0 flex-1 overflow-hidden" style={{display: settingsMode ? undefined : "none"}}>{props.settingsWorkspace?.content}</section>
            <aside ref={contextPanelRef} aria-label="Contexto" hidden={!contextOpen || settingsMode} className="workspace-context" style={{ width: history.width }}>
              <div className="workspace-context-resize"><PanelResizeHandle
                label="Cambiar anchura del contexto" minWidth={historyWidthConfig.minWidth} maxWidth={historyWidthConfig.maxWidth}
                value={history.width} isResizing={history.isResizing} onPointerDown={history.startResize} onKeyDown={history.resizeWithKeyboard}/></div>
              <header className="workspace-context-header">
                <label className="sr-only" htmlFor="workspace-context-kind">Contenido del panel contextual</label>
                <select id="workspace-context-kind" value={historyIsActive ? "history" : displayedContextKind}
                  onChange={event => {
                    setContextVisible(true);
                    if (event.target.value === "history") { if (!props.historyOpen) props.onToggleHistory(); }
                    else { const kind=readContextKind(event.target.value);setContextKind(kind);props.onLayoutConfigChange({contextKind:kind});if (props.historyOpen) props.onCloseHistory(); }
                  }}>
                  <option value="assistant">Asistente</option>
                  <option value="history" disabled={!hasOpenDocument || !props.historyEnabled}>Historial</option>
                  <option value="document" disabled={!hasOpenDocument && !hasNotes}>Buscar y secciones</option>
                  <option value="properties" disabled={!activeWorkspaceTab || hasAiConversation}>Información</option>
                  <option value="references" disabled={!hasOpenDocument && !hasOpenHandwrittenNote && !hasOpenImage && !hasOpenReferenceDocument}>Referencias</option>
                </select>
                <button aria-label={contextPinned ? "Desfijar contexto" : "Fijar contexto"} aria-pressed={contextPinned} onClick={() => props.onLayoutConfigChange({contextPinned:!contextPinned})}><Pin size={16}/></button>
                <button aria-label="Ocultar contexto" onClick={closeContext}><PanelRightClose size={16}/></button>
              </header>
              <div className="workspace-context-content" hidden={historyIsActive || displayedContextKind !== "assistant" || Boolean(activeHistoryPreview)}>
                <p className="workspace-context-scope">{hasOpenDocument ? props.activeDocument?.name : hasOpenHandwrittenNote ? props.activeHandwrittenNote?.name : hasNotes ? "Notas personales" : props.activeProject?.name ?? "Sin proyecto"}</p>
                {!props.aiConfig.openaiKeyConfigured && <button className="workspace-configure-ai" onClick={() => props.onOpenAppSettings("ai")}>Configurar IA</button>}
                {!hasAiConversation && <AiResponseBubble embedded bubble={props.aiBubble} pendingIntent={props.aiPendingIntent} editProposal={props.aiEditProposal}
                  applyingEditProposalId={props.applyingAiEditProposalId} staleEditOperationIds={props.staleAiEditOperationIds} blockedEditOperationReasons={props.blockedAiEditOperationReasons} appliedEditOperationIds={props.appliedAiEditOperationIds}
                  onIntentAction={props.onAiIntentAction} onApplyEditProposal={props.onApplyAiEditProposal} onDiscardEditProposal={props.onDiscardAiEditProposal} onClose={props.onCloseAiBubble} onOpenConversation={props.onOpenAiConversation}/>}
              {props.aiEditProposal?.status === "proposed" && <button type="button" className="min-h-11 w-full py-2 text-left text-xs font-medium text-brand-orange" aria-expanded={!assistantComposerHidden} aria-controls="assistant-composer" disabled={assistantBusy} onClick={() => setAssistantComposerExpanded(value => !value)}>{assistantComposerHidden ? (props.appLanguage === "en" ? "New instruction" : "Nueva instrucción") : (props.appLanguage === "en" ? "Hide input" : "Ocultar entrada")}</button>}
              <div id="assistant-composer" hidden={assistantComposerHidden}>
              <AiPromptInput
                embedded
                onActivityChange={setAssistantBusy}
                documentId={promptDocumentId}
                projectId={props.activeProject?.id}
                markdown={promptMarkdown}
                providerReady={props.aiConfig.openaiKeyConfigured}
                transcriptionConfig={props.aiConfig.transcription}
                documentDictationReady={Boolean((hasOpenDocument || hasNotes) && activeEditorController?.canInsertText())}
                appliedChangeSummary={props.aiAppliedChange?.documentId === activeEditorId ? props.aiAppliedChange.summary : null}
                selectionFocus={props.aiSelectionFocus?.documentId === activeEditorId ? props.aiSelectionFocus : null}
                activeContextSources={props.aiContextSources}
                researchBrief={props.aiResearchBrief}
                researchJob={props.aiResearchJob}
                researchJobs={props.aiResearchJobs}
                onSubmit={props.onSendAiPrompt}
                onUpdateResearchBrief={props.onUpdateAiResearchBrief}
                onReviewResearchEvidence={props.onReviewResearchEvidence}
                onStartResearch={props.onStartAiResearch}
                onCancelResearchBrief={props.onCancelAiResearchBrief}
                onCancelResearchJob={props.onCancelAiResearchJob}
                onRetryResearchJob={props.onRetryAiResearchJob}
                onTranscriptionConfigChange={props.onAiTranscriptionChange}
                onPreviewDocumentDictation={handlePreviewDocumentDictation}
                onCommitDocumentDictation={handleCommitDocumentDictation}
                onClearDocumentDictationPreview={handleClearDocumentDictationPreview}
                onClearSelectionFocus={props.onClearAiSelectionFocus}
                onDismissAppliedChange={props.onDismissAiAppliedChange}
                onSearchProjectDocuments={props.onSearchAiContextDocuments}
                onAddProjectDocumentContext={props.onAddProjectDocumentContext}
                onAddProjectSelectionContext={props.onBatchAction?ids=>props.onBatchAction?.("context",ids):undefined}
                onUploadContextFiles={props.onUploadAiContextFiles}
                onPickLocalContextFiles={props.onPickLocalAiContextFiles}
                onRemoveContextSource={props.onRemoveAiContextSource}
                onExtendContextSource={props.onExtendAiContextSource}
                onPreviewContextSource={props.onPreviewAiContextSource}
                onRefreshContextSource={props.onRefreshAiContextSource}
                onAddContextSourceToProject={props.onAddAiContextSourceToProject}
              />
              </div>

              </div>
              <div className="workspace-context-content" hidden={historyIsActive || displayedContextKind !== "document"}>
                <DocumentToolsPanel controller={hasOpenDocument || hasNotes ? activeEditorController : null} revision={promptMarkdown} scope={JSON.stringify([props.activeProject?.id, activeEditorId])} name={hasNotes ? "Notas personales" : props.activeDocument?.name ?? "ningún documento"}/>
              </div>
              <div className="workspace-context-content" hidden={historyIsActive || displayedContextKind !== "properties"}>
                <DocumentInfoPanel tab={activeWorkspaceTab ?? null} project={props.activeProject} document={props.activeDocument} note={props.activeHandwrittenNote} image={activeImageAsset}
                  dirty={hasNotes?props.notesDirty:hasOpenHandwrittenNote ? props.activeHandwrittenDirty : props.activeDocumentDirty}
                  saveState={hasNotes ? props.notesSaveState : hasOpenHandwrittenNote ? props.activeHandwrittenSaveState : props.saveState}
                  needsReview={hasOpenHandwrittenNote ? props.activeHandwrittenDiskChanged || props.activeHandwrittenConflictStatus==="orphaned" : hasOpenDocument ? props.activeDocumentDiskChanged || props.activeDocumentConflictStatus==="orphaned" : false}
                  loadError={hasOpenHandwrittenNote ? props.activeHandwrittenLoadError : hasOpenDocument ? props.editorSessions.find(session=>session.documentId===props.activeDocumentId)?.loadError : undefined}
                  versioning={props.versioningStatus} onConfigureProject={props.onConfigureProject}/>
              </div>
              {!settingsMode && contextOpen && !historyIsActive && displayedContextKind==="references" && <div className="workspace-context-content">
                {activeWorkspaceTab && props.activeProject && (hasOpenDocument || hasOpenHandwrittenNote || hasOpenImage || hasOpenReferenceDocument) ? <DocumentReferencesPanel
                  documentId={activeWorkspaceTab.id} name={activeWorkspaceTab.name}
                  revision={hasOpenDocument ? props.activeDocument?.baseFingerprint?.sha256 ?? "" : hasOpenHandwrittenNote ? props.activeHandwrittenNote?.baseFingerprint?.sha256 ?? "" : ""}
                  dirty={hasOpenDocument ? props.activeDocumentDirty : hasOpenHandwrittenNote ? props.activeHandwrittenDirty : false}
                  onOpen={target => {
                    props.onOpenLocalReference(target);
                    if (target.kind === "folder" && target.status === "available" && target.projectId === props.activeProject?.id) {
                      changeNavigation(true); setNavigationOpen(true);
                      requestAnimationFrame(() => {
                        const item = Array.from(document.querySelectorAll<HTMLElement>('[data-focus-node-id]')).find(node => node.dataset.focusNodeId === target.id);
                        item?.focus({ preventScroll: true }); item?.scrollIntoView({ block: "nearest" });
                      });
                    }
                  }}
                /> : <p className="px-2 py-5 text-sm text-ink-secondary">Abre un archivo del proyecto para consultar sus referencias.</p>}
              </div>}
              {props.historyOpen && hasOpenDocument ? <div className="min-h-0 flex-1 overflow-auto">
                  <VersionHistoryPanel
                    {...props.stateTransitionAuthority}
                    documentId={props.activeDocumentId}
                    documentName={props.activeDocument?.name ?? "documento"}
                    activePreviewVersionId={activeHistoryPreview?.version.id ?? null}
                    onPreviewChange={setHistoryPreview}
                    onReviewRemoteVersion={props.onReviewRemoteVersion}
                  onConfigureProject={props.onConfigureProject}
                  onMilestoneChange={(versionId,milestone)=>setHistoryPreview(current=>current ? {...current,version:current.version.id===versionId?{...current.version,milestone}:current.version,comparison:current.comparison?{...current.comparison,version:current.comparison.version.id===versionId?{...current.comparison.version,milestone}:current.comparison.version}:undefined}:current)}
                    onClose={closeContext}
                  />
              </div> : null}
            </aside>
            {props.settingsWorkspace && <aside ref={settingsContextRef} aria-label="Contexto de configuración" hidden={!settingsMode || !settingsContextVisible} className="workspace-context" style={{width: history.width}}>
              <header className="workspace-context-header"><h2 className="flex-1 text-sm font-semibold">{props.appLanguage === "en" ? "Help and scope" : "Ayuda y alcance"}</h2><button aria-label="Ocultar contexto de configuración" onClick={closeContext}><PanelRightClose size={16}/></button></header>
              <div className="workspace-context-content">{props.settingsWorkspace.context}</div>
            </aside>}
          </div>
        </main>
        {nativeHistoryRestore&&props.activeProject&&<HistoryRestoreDialog {...props.stateTransitionAuthority} projectId={props.activeProject.id} documentId={nativeHistoryRestore.documentId} versionId={nativeHistoryRestore.versionId} onClose={()=>setNativeHistoryRestore(null)}/>}
        {restoreTarget ? (
          <RestoreVersionDialog
            version={restoreTarget}
            isDirty={props.activeDocumentDirty}
            restoring={restoringVersion}
            onCancel={() => setRestoreTarget(null)}
            onConfirm={(strategy) => void confirmRestoreVersion(strategy)}
          />
        ) : null}
      </div>
    </div>
  );
}

function RestoreVersionDialog({
  version,
  isDirty,
  restoring,
  onCancel,
  onConfirm,
}: {
  version: VersionRecord;
  isDirty: boolean;
  restoring: boolean;
  onCancel: () => void;
  onConfirm: (strategy: RestoreStrategy) => void;
}) {
  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[90] grid place-items-center bg-black/25">
      <section className="w-[min(460px,calc(100vw-32px))] rounded-lg border border-line bg-white shadow-menu">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-hover text-brand-orange">
            <RotateCcw size={17} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-ink-primary">Restaurar versión</h3>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
              Se restaurará la versión del {formatVersionFullDate(version)}. KnowNext.ai creará una nueva versión actual; el historial anterior no se borrará.
            </p>
          </div>
        </header>
        {isDirty ? (
          <div className="mx-5 mt-4 flex gap-3 rounded-md border border-orange-200 bg-brand-hover px-3 py-2 text-[11px] leading-5 text-ink-secondary">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-brand-orange" />
            <p>Tienes cambios pendientes sin guardar. Guarda esos cambios antes de restaurar o descártalos para volver directamente a esta versión.</p>
          </div>
        ) : null}
        <footer className="flex flex-wrap justify-end gap-2 px-5 py-4">
          <button
            className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel"
            type="button"
            onClick={onCancel}
            disabled={restoring}
          >
            Cancelar
          </button>
          {isDirty ? (
            <>
              <button
                className="h-9 rounded-md border border-line px-4 text-[11px] font-semibold text-ink-primary hover:bg-panel disabled:opacity-60"
                type="button"
                onClick={() => onConfirm("save-and-restore")}
                disabled={restoring}
              >
                Guardar y restaurar
              </button>
              <button
                className="h-9 rounded-md bg-red-700 px-4 text-[11px] font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                type="button"
                onClick={() => onConfirm("discard-and-restore")}
                disabled={restoring}
              >
                Descartar y restaurar
              </button>
            </>
          ) : (
            <button
              className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              type="button"
              onClick={() => onConfirm("restore")}
              disabled={restoring}
            >
              {restoring ? "Restaurando" : "Restaurar versión"}
            </button>
          )}
        </footer>
      </section>
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

function findNodeById(nodes: DocumentTreeNode[], nodeId: string): DocumentTreeNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.children) {
      const found = findNodeById(node.children, nodeId);
      if (found) return found;
    }
  }
  return null;
}

function isInsertableProjectVisual(type: DocumentTreeNode["type"] | undefined) {
  return type === "image" || type === "handwritten-note";
}

function toMarkdownEditorSelection(selectionFocus: AiSelectionFocus | null, documentId: string): MarkdownEditorSelection | null {
  if (selectionFocus?.documentId !== documentId) return null;
  if (typeof selectionFocus.from !== "number" || typeof selectionFocus.to !== "number") return null;
  if (selectionFocus.focusType !== "cursor" && !selectionFocus.text.trim()) return null;
  return {
    focusType: selectionFocus.focusType === "cursor" ? "cursor" : "selection",
    from: selectionFocus.from,
    to: selectionFocus.to,
    position: selectionFocus.position ?? null,
    text: selectionFocus.text,
    nearTextBefore: selectionFocus.nearTextBefore ?? null,
    nearTextAfter: selectionFocus.nearTextAfter ?? null,
    blockType: selectionFocus.blockType ?? null,
    blockHash: selectionFocus.blockHash ?? null,
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

function getHistoryDisabledReason(project: Project | null, versioningStatus: ProjectVersioningStatus | null) {
  if (!project || project.versioningMode === "none") return "Historial no disponible en proyectos de archivos locales";
  return versioningStatus?.reason ?? "Historial no disponible";
}

function countWords(markdown: string) {
  return markdown.replace(/<[^>\n]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

function formatCompactDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ahora";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildExternalChangeBadges(changeSet: ExternalChangeSet | null): Record<string, string> {
  if (!changeSet?.items.length) return {};
  return changeSet.items.reduce<Record<string, string>>((badges, item) => {
    if (item.risk === "blocked") return badges;
    badges[item.path] = item.risk === "review" ? "Revisar" : item.changeType === "modified" ? "Modificado" : item.changeType === "deleted" ? "Eliminado" : "Nuevo";
    return badges;
  }, {});
}

function buildProjectTreeStatus(
  project: Project | null,
  changeSet: ExternalChangeSet | null,
  syncStatus: ProjectSyncStatus | null,
  syncState: ProjectSyncState,
  busy: boolean,
  acknowledged: boolean,
): ProjectTreeStatus | null {
  if (!project) return null;
  const total = changeSet?.summary.total ?? 0;
  const safe = changeSet?.summary.safe ?? 0;
  const review = changeSet?.summary.review ?? 0;
  const blocked = changeSet?.summary.blocked ?? 0;
  const state = syncStatus?.state ?? syncState;
  const hasGithub = Boolean(project.githubRepository) || project.syncMode === "manual-github" || project.syncMode === "auto-github";
  const hasLocalGit = hasGithub || project.versioningMode === "local-git" || project.isGitRepository || project.syncMode === "manual-local" || project.syncMode === "auto-local";
  const remoteAccess = syncStatus?.remoteAccess;
  const remotePaused = Boolean(syncStatus?.remotePaused || (hasGithub && remoteAccess && remoteAccess !== "available" && remoteAccess !== "not-configured"));
  const remoteLabel = remoteAccess === "unauthorized"
    ? "Sin permiso GitHub"
    : remoteAccess === "offline"
      ? "GitHub sin conexión"
      : remoteAccess === "unauthenticated"
        ? "Sin acceso a GitHub"
        : "GitHub pausado";
  const scopeLabel = hasGithub
    ? remotePaused
      ? remoteLabel
      : "GitHub conectado"
    : hasLocalGit
      ? "Historial local"
      : "Archivos locales";

  if (acknowledged) {
    return {
      label: "Todo correcto",
      detail: total > 0 ? `${total} omitidos aceptados` : scopeLabel,
      badge: null,
      tone: "ok",
      showFooter: false,
    };
  }

  if (busy) {
    return {
      label: "Comprobando",
      detail: "Revisando guardado y sincronización",
      badge: "…",
      tone: "warning",
      showFooter: true,
      footerLabel: "Comprobando",
      footerDetail: "El estado se actualizará en unos segundos.",
    };
  }

  if (state === "conflict" || syncStatus?.hasConflicts) {
    const conflictCount = syncStatus?.conflicts.filter((conflict) => conflict.status === "open").length ?? 1;
    return {
      label: "Conflictos",
      detail: `${conflictCount} conflictos requieren decisión`,
      badge: String(conflictCount),
      tone: "danger",
      showFooter: true,
      footerLabel: "Conflictos",
      footerDetail: "Abre guardado y sincronización para resolverlos.",
    };
  }

  if (review > 0 || changeSet?.requiresReview) {
    return {
      label: "Revisión necesaria",
      detail: `${review || total} cambios necesitan decisión`,
      badge: String(review || total),
      tone: "warning",
      showFooter: true,
      footerLabel: "Cambios para guardar",
      footerDetail: "Hay archivos que revisar antes de guardarlos.",
    };
  }

  if (blocked > 0 && safe === 0) {
    return {
      label: "Archivos protegidos",
      detail: `${blocked} omitidos por seguridad`,
      badge: String(blocked),
      tone: "warning",
      showFooter: true,
      footerLabel: "Archivos omitidos",
      footerDetail: "No requieren acción si esperabas excluirlos.",
    };
  }

  if (safe > 0 || total > 0) {
    return {
      label: "Cambios pendientes",
      detail: `${safe || total} cambios listos para guardar`,
      badge: String(safe || total),
      tone: "warning",
      showFooter: true,
      footerLabel: "Cambios para guardar",
      footerDetail: "Puedes guardarlos en el historial.",
    };
  }

  if (hasGithub && remotePaused) {
    return {
      label: remoteLabel,
      detail: syncStatus?.remoteReason ?? "Puedes seguir trabajando con historial local.",
      badge: null,
      tone: "warning",
      showFooter: true,
      footerLabel: remoteLabel,
      footerDetail: "GitHub se reanudará cuando recuperes cuenta, conexión o permisos.",
    };
  }

  if (syncStatus?.pendingPull || state === "remote-available") {
    return {
      label: "Remoto pendiente",
      detail: "Hay cambios en GitHub por incorporar",
      badge: "1",
      tone: "warning",
      showFooter: true,
      footerLabel: "GitHub tiene cambios",
      footerDetail: "Revisa antes de actualizar la carpeta local.",
    };
  }

  if (syncStatus?.pendingPush || state === "local-pending" || state === "pending") {
    return {
      label: "Sincronización pendiente",
      detail: "Hay cambios locales pendientes de subir",
      badge: "1",
      tone: "warning",
      showFooter: true,
      footerLabel: "Pendiente de sincronizar",
      footerDetail: "Abre guardado y sincronización para ver el resumen.",
    };
  }

  if (state === "offline" || state === "error") {
    return {
      label: state === "offline" ? "GitHub sin conexión" : "Error de sincronización",
      detail: syncStatus?.detail ?? "No se pudo comprobar el estado remoto",
      badge: "!",
      tone: "danger",
      showFooter: true,
      footerLabel: state === "offline" ? "GitHub sin conexión" : "Error de sincronización",
      footerDetail: "Abre guardado y sincronización para ver el detalle.",
    };
  }

  return {
    label: "Todo correcto",
    detail: scopeLabel,
    badge: null,
    tone: "ok",
    showFooter: false,
  };
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
  if (kind === "notes") return "MD";
  if (kind === "handwritten-note") return "KNOTE";
  if (kind === "ai-conversation") return "IA";
  if (kind === "image") return "Imagen";
  return "Workspace";
}

function getWorkspaceStatusTitle(tab: WorkspaceTab | undefined, openaiKeyConfigured: boolean) {
  if (tab?.kind === "release-notes") return "Notas de release";
  if (tab?.kind === "notes") return "Notas";
  if (tab?.kind === "handwritten-note") return tab.name;
  if (tab?.kind === "ai-conversation") return openaiKeyConfigured ? "Asistente documental activo" : "Asistente sin clave OpenAI";
  if (tab?.kind === "image") return tab.name;
  return tab?.name ?? "Vista activa";
}

function getWorkspaceStatusDetail(tab: WorkspaceTab | undefined, projectName?: string) {
  if (tab?.kind === "release-notes") return "Solo lectura";
  if (tab?.kind === "notes") return "Notas personales";
  if (tab?.kind === "handwritten-note") return "Nota a mano";
  if (tab?.kind === "ai-conversation") return projectName ? `Proyecto: ${projectName}` : "Conversación del proyecto";
  if (tab?.kind === "image") return tab.path || "Activo del proyecto";
  return "Listo";
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

function readContextKind(value: unknown): NonNullable<LayoutConfig["contextKind"]> {
  return value === "document" || value === "properties" || value === "references" ? value : "assistant";
}

function effectiveContextKind(preferred: NonNullable<LayoutConfig["contextKind"]>, workspace?: WorkspaceTab["kind"]): NonNullable<LayoutConfig["contextKind"]> {
  if (!workspace || workspace === "ai-conversation") return "assistant";
  if (preferred === "document" && workspace !== "document" && workspace !== "notes") return "properties";
  if (preferred === "references" && (workspace === "notes" || workspace === "release-notes")) return "properties";
  return preferred;
}
