import { AlertCircle, AlertTriangle, Brain, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, File, FileText, Image, Loader2, MessageSquare, Mic, MoreVertical, Pause, Play, Plus, Search, SendHorizontal, SlidersHorizontal, Sparkles, Square, X, Zap, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import type { AiConfigStatus, AiContextSearchResult, AiContextSource, AiContextSourcePreviewResponse, AiExecutionMode, AiPromptIntent, AiReasoningDepth, AiResearchBrief, AiResearchJob, AiResearchReportLength, AiSelectionFocus, AiTranscriptionLanguage, AiTranscriptionTarget } from "../../types/domain";
import { getDocumentTreeFileDragData, hasDocumentTreeFileDragData } from "../../lib/dragData";
import { isPhoneAppShell } from "../../lib/runtime/platform";
import { xsViewportQuery } from "../../lib/runtime/responsive";
import { useRealtimeTranscription } from "../transcription/useRealtimeTranscription";

export type AiPromptExecutionOptions = {
  executionMode: AiExecutionMode;
  reasoningDepth: AiReasoningDepth;
  intent?: AiPromptIntent | null;
};

const promptControlClass =
  "border border-line bg-panel shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:border-orange-200 hover:bg-brand-hover hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-50";

type AiPromptInputProps = {
  documentId?: string;
  projectId?: string;
  markdown: string;
  providerReady: boolean;
  transcriptionConfig?: AiConfigStatus["transcription"];
  documentDictationReady?: boolean;
  appliedChangeSummary?: string | null;
  selectionFocus?: AiSelectionFocus | null;
  activeContextSources?: AiContextSource[];
  researchBrief?: AiResearchBrief | null;
  researchJob?: AiResearchJob | null;
  researchJobs?: AiResearchJob[];
  onSubmit: (prompt: string, selectionFocus?: AiSelectionFocus | null, options?: AiPromptExecutionOptions) => void | Promise<void>;
  onUpdateResearchBrief?: (brief: AiResearchBrief) => void;
  onStartResearch?: (brief: AiResearchBrief) => void | Promise<void>;
  onCancelResearchBrief?: () => void;
  onCancelResearchJob?: (jobId: string) => void | Promise<void>;
  onRetryResearchJob?: (jobId: string) => void | Promise<void>;
  onTranscriptionConfigChange?: (transcription: Partial<AiConfigStatus["transcription"]>) => void;
  onPreviewDocumentDictation?: (text: string) => void;
  onCommitDocumentDictation?: (text: string) => void;
  onClearDocumentDictationPreview?: () => void;
  onClearSelectionFocus?: () => void;
  onDismissAppliedChange?: () => void;
  onSearchProjectDocuments?: (query: string) => Promise<AiContextSearchResult[]>;
  onAddProjectDocumentContext?: (documentId: string) => void | Promise<void>;
  onUploadContextFiles?: (files: File[]) => void | Promise<void>;
  onPickLocalContextFiles?: () => void | Promise<void>;
  onRemoveContextSource?: (sourceId: string) => void | Promise<void>;
  onExtendContextSource?: (sourceId: string) => void | Promise<void>;
  onPreviewContextSource?: (sourceId: string) => Promise<AiContextSourcePreviewResponse>;
  onAddContextSourceToProject?: (sourceId: string) => void | Promise<void>;
};

export function AiPromptInput({
  documentId,
  projectId,
  providerReady,
  transcriptionConfig,
  documentDictationReady = false,
  appliedChangeSummary,
  selectionFocus,
  activeContextSources = [],
  researchBrief = null,
  researchJob = null,
  onSubmit,
  onUpdateResearchBrief,
  onStartResearch,
  onCancelResearchBrief,
  onCancelResearchJob,
  onRetryResearchJob,
  onTranscriptionConfigChange,
  onPreviewDocumentDictation,
  onCommitDocumentDictation,
  onClearDocumentDictationPreview,
  onClearSelectionFocus,
  onDismissAppliedChange,
  onSearchProjectDocuments,
  onAddProjectDocumentContext,
  onUploadContextFiles,
  onPickLocalContextFiles,
  onRemoveContextSource,
  onExtendContextSource,
  onPreviewContextSource,
  onAddContextSourceToProject,
}: AiPromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [executionMode, setExecutionMode] = useState<AiExecutionMode>("quick");
  const [reasoningDepth, setReasoningDepth] = useState<AiReasoningDepth>("light");
  const [intent, setIntent] = useState<AiPromptIntent | null>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [depthMenuOpen, setDepthMenuOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPreview, setContextMenuPreview] = useState<ContextMenuPreview | null>(null);
  const [contextMenuSubmenu, setContextMenuSubmenu] = useState<ContextMenuSubmenu | null>(null);
  const [compactOptionsOpen, setCompactOptionsOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [referenceQuery, setReferenceQuery] = useState<string | null>(null);
  const [referenceResults, setReferenceResults] = useState<AiContextSearchResult[]>([]);
  const [referenceIndex, setReferenceIndex] = useState(0);
  const [preview, setPreview] = useState<AiContextSourcePreviewResponse | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [transcriptionMenuOpen, setTranscriptionMenuOpen] = useState(false);
  const [transcriptionTarget, setTranscriptionTarget] = useState<AiTranscriptionTarget>(transcriptionConfig?.defaultTarget ?? "prompt");
  const [transcriptionLanguage, setTranscriptionLanguage] = useState<AiTranscriptionLanguage>(transcriptionConfig?.defaultLanguage ?? "auto");
  const [transcriptionNotice, setTranscriptionNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const sourcesRef = useRef<HTMLDivElement | null>(null);
  const transcriptionMenuRef = useRef<HTMLDivElement | null>(null);
  const contextMenuPointerToggleRef = useRef(false);
  const transcriptionMenuPointerToggleRef = useRef(false);
  const promptPartialRef = useRef<{ start: number; end: number; itemId?: string | null } | null>(null);
  const transcriptionItemBuffersRef = useRef<Record<string, string>>({});
  const hasContext = Boolean(documentId || projectId);
  const canPrompt = hasContext && providerReady;
  const canManageContext = hasContext && Boolean(onAddProjectDocumentContext || onUploadContextFiles || onPickLocalContextFiles);
  const hasBlockingContext = activeContextSources.some((source) => source.status === "processing");
  const transcription = transcriptionConfig ?? defaultTranscriptionConfig;
  const transcriptionState = useRealtimeTranscription();
  const compactPrompt = useCompactPromptMode();
  const transcribing = transcriptionState.status === "connecting" || transcriptionState.status === "listening" || transcriptionState.status === "stopping";
  const transcriptionAvailable = canPrompt && transcription.enabled;
  const canStartTranscription = transcriptionAvailable && !loading && !hasBlockingContext;
  const selectedDepthLabel = reasoningDepthLabels[reasoningDepth];
  const visibleSources = activeContextSources.slice(0, 4);
  const hiddenSourceCount = Math.max(0, activeContextSources.length - visibleSources.length);
  const contextWeightLabel = useMemo(() => getContextWeightLabel(activeContextSources), [activeContextSources]);
  const visibleSelectionFocus = selectionFocus?.focusType === "cursor" ? null : selectionFocus;

  useEffect(() => {
    if (!modeMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (modeMenuRef.current?.contains(event.target as Node)) return;
      setModeMenuOpen(false);
      setDepthMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setModeMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [modeMenuOpen]);

  useEffect(() => {
    if (transcribing) return;
    setTranscriptionTarget(transcription.defaultTarget);
    setTranscriptionLanguage(transcription.defaultLanguage);
  }, [transcribing, transcription.defaultLanguage, transcription.defaultTarget]);

  useEffect(() => {
    if (!transcriptionMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (transcriptionMenuRef.current?.contains(event.target as Node)) return;
      setTranscriptionMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setTranscriptionMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [transcriptionMenuOpen]);

  useEffect(() => {
    if (!contextMenuOpen && !sourcesOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (contextMenuRef.current?.contains(target) || sourcesRef.current?.contains(target)) return;
      setContextMenuOpen(false);
      setSourcesOpen(false);
      setPreview(null);
      setContextMenuPreview(null);
      setContextMenuSubmenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setContextMenuOpen(false);
        setSourcesOpen(false);
        setPreview(null);
        setContextMenuPreview(null);
        setContextMenuSubmenu(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenuOpen, sourcesOpen]);

  useEffect(() => {
    function handleTreeContextDrag(event: Event) {
      const detail = (event as CustomEvent<{ active?: boolean; over?: boolean }>).detail;
      setDragActive(Boolean(detail?.active && detail.over));
    }

    window.addEventListener("knownext:tree-context-drag", handleTreeContextDrag);
    return () => window.removeEventListener("knownext:tree-context-drag", handleTreeContextDrag);
  }, []);

  useEffect(() => {
    if (!compactOptionsOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setCompactOptionsOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [compactOptionsOpen]);

  useEffect(() => {
    if (referenceQuery === null || !onSearchProjectDocuments) {
      setReferenceResults([]);
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      onSearchProjectDocuments(referenceQuery)
        .then((results) => {
          if (cancelled) return;
          setReferenceResults(results);
          setReferenceIndex(0);
        })
        .catch(() => {
          if (!cancelled) setReferenceResults([]);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [onSearchProjectDocuments, referenceQuery]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = isPhoneAppShell() ? 132 : 80;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [prompt]);

  async function handleSubmit() {
    if (!prompt.trim() || !canPrompt || hasBlockingContext) return;
    setLoading(true);
    try {
      await onSubmit(prompt.trim(), selectionFocus ?? null, intent ? { executionMode, reasoningDepth, intent } : { executionMode, reasoningDepth });
      setPrompt("");
      if (intent?.kind === "research") setIntent(null);
    } finally {
      setLoading(false);
    }
  }

  function chooseResearchIntent() {
    setIntent({
      kind: "research",
      label: "Investigación",
      research: {
        sourceScope: "web_project",
        resultTarget: "new_document",
        confirmBeforeCreating: false,
      },
    });
    setExecutionMode("reasoning");
    setReasoningDepth("deep");
    setContextMenuOpen(false);
    textareaRef.current?.focus();
  }

  function chooseImageIntent() {
    setIntent({ kind: "image", label: "Crear imagen" });
    setContextMenuOpen(false);
    textareaRef.current?.focus();
  }

  function chooseDiagramIntent() {
    setIntent({ kind: "diagram", label: "Crear diagrama" });
    setContextMenuOpen(false);
    textareaRef.current?.focus();
  }

  function previewContextMenuOption(preview: ContextMenuPreview, submenu: ContextMenuSubmenu | null = null) {
    setContextMenuPreview(preview);
    setContextMenuSubmenu(submenu);
  }

  function handlePromptChange(value: string) {
    promptPartialRef.current = null;
    setPrompt(value);
    const mention = getActiveMention(value);
    setReferenceQuery(mention);
  }

  async function toggleTranscription() {
    setTranscriptionNotice(null);
    transcriptionState.resetError();
    if (transcribing) {
      await transcriptionState.stop();
      return;
    }
    if (!canStartTranscription) {
      setTranscriptionNotice(getTranscriptionUnavailableMessage(canPrompt, transcription.enabled, hasBlockingContext));
      return;
    }
    if (transcriptionTarget === "document" && !documentDictationReady) {
      setTranscriptionNotice("Coloca el cursor en el documento para dictar.");
      return;
    }

    await transcriptionState.start({
      target: transcriptionTarget,
      language: transcriptionLanguage,
      handlers: {
        onDelta: ({ itemId, delta }) => {
          const bufferedDelta = appendTranscriptionDelta(itemId, delta);
          if (transcriptionTarget === "document") {
            onPreviewDocumentDictation?.(bufferedDelta);
            return;
          }
          applyPromptPartial(bufferedDelta, itemId);
        },
        onCompleted: ({ transcript }) => {
          clearTranscriptionBuffer();
          if (transcriptionTarget === "document") {
            onClearDocumentDictationPreview?.();
            if (transcript) onCommitDocumentDictation?.(withTrailingSpace(transcript));
            return;
          }
          commitPromptPartial(withTrailingSpace(transcript));
        },
        onStopped: () => {
          promptPartialRef.current = null;
          clearTranscriptionBuffer();
          onClearDocumentDictationPreview?.();
        },
        onError: (message) => {
          setTranscriptionNotice(message);
          promptPartialRef.current = null;
          clearTranscriptionBuffer();
          onClearDocumentDictationPreview?.();
        },
      },
    });
  }

  function appendTranscriptionDelta(itemId: string | null | undefined, delta: string) {
    const key = itemId ?? "active";
    const nextValue = `${transcriptionItemBuffersRef.current[key] ?? ""}${delta}`;
    transcriptionItemBuffersRef.current = {
      ...transcriptionItemBuffersRef.current,
      [key]: nextValue,
    };
    return nextValue;
  }

  function clearTranscriptionBuffer() {
    transcriptionItemBuffersRef.current = {};
  }

  function applyPromptPartial(delta: string, itemId?: string | null) {
    const textarea = textareaRef.current;
    setPrompt((currentPrompt) => {
      const currentPartial = promptPartialRef.current;
      const reusePartial = currentPartial !== null && currentPartial.itemId === itemId;
      const insertionStart = reusePartial ? currentPartial.start : textarea?.selectionStart ?? currentPrompt.length;
      const insertionEnd = reusePartial ? currentPartial.end : textarea?.selectionEnd ?? insertionStart;
      const nextPrompt = `${currentPrompt.slice(0, insertionStart)}${delta}${currentPrompt.slice(insertionEnd)}`;
      promptPartialRef.current = { start: insertionStart, end: insertionStart + delta.length, itemId };
      return nextPrompt;
    });
  }

  function commitPromptPartial(transcript: string) {
    setPrompt((currentPrompt) => {
      const currentPartial = promptPartialRef.current;
      const insertionStart = currentPartial?.start ?? textareaRef.current?.selectionStart ?? currentPrompt.length;
      const insertionEnd = currentPartial?.end ?? textareaRef.current?.selectionEnd ?? insertionStart;
      const nextPrompt = `${currentPrompt.slice(0, insertionStart)}${transcript}${currentPrompt.slice(insertionEnd)}`;
      promptPartialRef.current = null;
      return nextPrompt;
    });
  }

  function chooseTranscriptionTarget(target: AiTranscriptionTarget) {
    if (transcribing) return;
    setTranscriptionTarget(target);
    onTranscriptionConfigChange?.({ defaultTarget: target });
    setTranscriptionMenuOpen(false);
  }

  function chooseTranscriptionLanguage(language: AiTranscriptionLanguage) {
    if (transcribing) return;
    setTranscriptionLanguage(language);
    onTranscriptionConfigChange?.({ defaultLanguage: language });
    setTranscriptionMenuOpen(false);
  }

  async function addReference(result: AiContextSearchResult) {
    if (!onAddProjectDocumentContext) return;
    await onAddProjectDocumentContext(result.documentId);
    setPrompt((currentPrompt) => removeActiveMention(currentPrompt));
    setReferenceQuery(null);
    setReferenceResults([]);
    textareaRef.current?.focus();
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || !onUploadContextFiles) return;
    await onUploadContextFiles(files);
    setContextMenuOpen(false);
    setCompactOptionsOpen(false);
  }

  async function pickLocalContextFiles() {
    if (onPickLocalContextFiles) {
      await onPickLocalContextFiles();
      setContextMenuOpen(false);
      setCompactOptionsOpen(false);
      setSourcesOpen(false);
      return;
    }
    fileInputRef.current?.click();
  }

  function isContextDrop(event: DragEvent<HTMLDivElement>) {
    return hasDocumentTreeFileDragData(event.dataTransfer) || Array.from(event.dataTransfer.types ?? []).includes("Files");
  }

  async function addDroppedProjectFile(dataTransfer: DataTransfer) {
    const projectFile = getDocumentTreeFileDragData(dataTransfer);
    if (!projectFile || !onAddProjectDocumentContext) return false;
    await onAddProjectDocumentContext(projectFile.id);
    setContextMenuOpen(false);
    textareaRef.current?.focus();
    return true;
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (getDocumentTreeFileDragData(event.dataTransfer)) {
      void addDroppedProjectFile(event.dataTransfer);
      return;
    }
    const files = Array.from(event.dataTransfer.files ?? []);
    void uploadFiles(files);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    void uploadFiles(files);
  }

  async function openPreview(source: AiContextSource) {
    if (!onPreviewContextSource) return;
    setPreviewLoadingId(source.id);
    try {
      setPreview(await onPreviewContextSource(source.id));
      setSourcesOpen(true);
    } finally {
      setPreviewLoadingId(null);
    }
  }

  function focusProjectReferenceSearch() {
    if (!hasContext || !onSearchProjectDocuments || !onAddProjectDocumentContext) return;
    setContextMenuOpen(false);
    setCompactOptionsOpen(false);
    setReferenceQuery("");
    textareaRef.current?.focus();
  }

  function focusPromptForPaste() {
    setContextMenuOpen(false);
    setCompactOptionsOpen(false);
    textareaRef.current?.focus();
  }

  function toggleContextMenuFromPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!canManageContext) return;
    event.preventDefault();
    event.stopPropagation();
    contextMenuPointerToggleRef.current = true;
    setContextMenuPreview(null);
    setContextMenuSubmenu(null);
    setContextMenuOpen((open) => !open);
  }

  function toggleContextMenuFromClick(event: ReactMouseEvent<HTMLButtonElement>) {
    if (!canManageContext) return;
    if (contextMenuPointerToggleRef.current) {
      contextMenuPointerToggleRef.current = false;
      event.preventDefault();
      return;
    }
    setContextMenuPreview(null);
    setContextMenuSubmenu(null);
    setContextMenuOpen((open) => !open);
  }

  function toggleTranscriptionMenuFromPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    transcriptionMenuPointerToggleRef.current = true;
    setTranscriptionMenuOpen((open) => !open);
  }

  function toggleTranscriptionMenuFromClick(event: ReactMouseEvent<HTMLButtonElement>) {
    if (transcriptionMenuPointerToggleRef.current) {
      transcriptionMenuPointerToggleRef.current = false;
      event.preventDefault();
      return;
    }
    setTranscriptionMenuOpen((open) => !open);
  }

  function openCompactOptions() {
    setContextMenuOpen(false);
    setModeMenuOpen(false);
    setDepthMenuOpen(false);
    setTranscriptionMenuOpen(false);
    setSourcesOpen(false);
    setCompactOptionsOpen(true);
  }

  function chooseExecutionMode(mode: AiExecutionMode, depth: AiReasoningDepth = "light") {
    setExecutionMode(mode);
    setReasoningDepth(mode === "quick" ? "light" : depth);
    setDepthMenuOpen(false);
    setModeMenuOpen(false);
  }

  return (
    <div className="knownext-ai-prompt-anchor pointer-events-none absolute inset-x-8 bottom-11 z-20 flex justify-center">
      {loading || appliedChangeSummary ? (
        <div className="absolute bottom-full right-0 mb-2 flex w-[min(320px,42vw)] min-w-[240px] flex-col items-end gap-2">
          {loading ? (
            <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-[11px] text-ink-secondary shadow-menu" role="status" aria-live="polite">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand-orange" />
              <span>Esperando respuesta...</span>
            </div>
          ) : null}
          {appliedChangeSummary ? (
            <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl border border-orange-200 bg-white px-3 py-2 text-[11px] text-ink-primary shadow-menu">
              <p className="min-w-0 flex-1 overflow-hidden break-words leading-4 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{appliedChangeSummary}</p>
              <button
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
                aria-label="Cerrar aviso de cambios IA"
                onClick={onDismissAppliedChange}
              >
                <X size={13} />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {researchBrief || researchJob ? (
        <ResearchPreparationCard
          brief={researchBrief}
          job={researchJob}
          onChange={onUpdateResearchBrief}
          onStart={onStartResearch}
          onCancelBrief={onCancelResearchBrief}
          onCancelJob={onCancelResearchJob}
          onRetryJob={onRetryResearchJob}
        />
      ) : null}
      <div
        className={[
          "knownext-ai-prompt pointer-events-auto relative flex min-h-11 w-[min(760px,100%)] flex-col rounded-[28px] border bg-white px-2.5 py-1.5 shadow-[0_10px_28px_rgba(17,24,39,0.12)] transition",
          dragActive ? "border-brand-orange bg-brand-hover/60" : "border-line/90",
        ].join(" ")}
        onDragEnter={(event) => {
          if (!isContextDrop(event)) return;
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          if (!isContextDrop(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
        }}
        onDrop={handleDrop}
      >
        {intent ? (
          <div className="flex items-center gap-1 px-1 pb-1 pt-0.5">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-orange-200 bg-brand-hover px-2.5 py-1 text-[10px] font-semibold text-brand-orange">
              <Sparkles size={12} />
              <span className="truncate">{intent.label}</span>
              <button
                type="button"
                className="grid h-4 w-4 place-items-center rounded-full hover:bg-white"
                aria-label="Quitar capacidad IA"
                onClick={() => setIntent(null)}
              >
                <X size={10} />
              </button>
            </span>
          </div>
        ) : null}
        {visibleSelectionFocus || activeContextSources.length > 0 ? (
          <div className="knownext-ai-context-strip pointer-events-auto flex max-h-[52px] w-full flex-wrap items-center gap-1 overflow-hidden px-1 pb-1.5 pt-0.5">
            {visibleSelectionFocus ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-brand-hover px-2 py-1 text-[10px] font-semibold text-brand-orange">
              Texto seleccionado
              <button
                className="grid h-4 w-4 place-items-center rounded-full text-brand-orange hover:bg-white"
                aria-label="Quitar texto seleccionado del contexto IA"
                onClick={onClearSelectionFocus}
              >
                <X size={11} />
              </button>
            </span>
            ) : null}
            {visibleSources.map((source) => (
              <ContextSourceChip
                key={source.id}
                source={source}
                onOpen={() => void openPreview(source)}
                onRemove={onRemoveContextSource ? () => void onRemoveContextSource(source.id) : undefined}
              />
            ))}
            {hiddenSourceCount > 0 ? (
              <button
                type="button"
                className="inline-flex h-6 items-center rounded-full border border-line bg-white px-2 text-[10px] font-semibold text-ink-secondary hover:border-orange-200 hover:bg-brand-hover hover:text-brand-orange"
                onClick={() => setSourcesOpen(true)}
              >
                +{hiddenSourceCount}
              </button>
            ) : null}
            {activeContextSources.length > 0 ? (
              <button
                type="button"
                className="ml-auto hidden h-6 items-center gap-1 rounded-full px-2 text-[10px] font-medium text-ink-secondary hover:bg-brand-hover hover:text-brand-orange sm:inline-flex"
                onClick={() => setSourcesOpen(true)}
              >
                <Sparkles size={11} />
                Fuentes · {activeContextSources.length} · {contextWeightLabel}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="knownext-ai-prompt-row flex items-center gap-1.5">
          {compactPrompt ? (
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              multiple
              accept=".md,.txt,.csv,.pdf,.docx,.pptx,.xlsx,image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                void uploadFiles(files);
              }}
            />
          ) : (
          <div className="relative" ref={contextMenuRef}>
            <button
              type="button"
              className={`knownext-ai-context-button grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-primary ${promptControlClass}`}
              data-tooltip="Añadir contexto"
              aria-label="Añadir contexto"
              aria-expanded={contextMenuOpen}
              onPointerDown={toggleContextMenuFromPointer}
              onClick={toggleContextMenuFromClick}
              disabled={!canManageContext}
            >
              <Plus size={19} strokeWidth={1.8} />
            </button>
            {contextMenuOpen ? (
              <div className="absolute bottom-full left-0 z-40 mb-2 flex items-end gap-2">
                <div className="grid w-60 gap-1 rounded-[16px] border border-line bg-white p-1.5 text-[11px] text-ink-primary shadow-menu">
                  <ContextMenuSectionTitle label="Contexto" />
                  <ContextMenuButton icon={FileText} title="Archivo del proyecto" detail="Busca documentos con @ y añádelos como contexto de la conversación." group="Añadir contexto" onPreview={previewContextMenuOption} onClick={focusProjectReferenceSearch} />
                  <ContextMenuButton icon={File} title="Adjuntar archivo" detail="Usa PDF, Office, CSV, Markdown o imágenes como material temporal del prompt." group="Añadir contexto" onPreview={previewContextMenuOption} onClick={() => void pickLocalContextFiles()} />
                  <ContextMenuButton icon={Image} title="Pegar imagen" detail="Pega una captura o imagen con Ctrl+V dentro del prompt." group="Añadir contexto" onPreview={previewContextMenuOption} onClick={focusPromptForPaste} />
                  <ContextMenuDivider />
                  <ContextMenuSectionTitle label="Capacidades" />
                  <ContextMenuButton icon={Search} title="Investigación" detail="Prepara un plan, busca fuentes web y crea un informe nuevo revisable." group="Capacidad" onPreview={previewContextMenuOption} onClick={chooseResearchIntent} />
                  <ContextMenuSubmenuButton
                    icon={Sparkles}
                    title="Crear"
                    detail="Genera imágenes o diagramas para usar en el proyecto."
                    active={contextMenuSubmenu === "create"}
                    onPreview={previewContextMenuOption}
                    onOpen={() => previewContextMenuOption({ icon: Sparkles, title: "Crear", detail: "Genera imágenes o diagramas para usar en el proyecto.", group: "Capacidad" }, "create")}
                    onToggle={() => {
                      if (contextMenuSubmenu === "create") {
                        setContextMenuSubmenu(null);
                        setContextMenuPreview(null);
                        return;
                      }
                      previewContextMenuOption({ icon: Sparkles, title: "Crear", detail: "Genera imágenes o diagramas para usar en el proyecto.", group: "Capacidad" }, "create");
                    }}
                  />
                </div>
                {contextMenuSubmenu ? (
                  <div className="flex items-end gap-2">
                    <ContextMenuSubmenuPanel
                      submenu={contextMenuSubmenu}
                      onPreview={previewContextMenuOption}
                      onImage={chooseImageIntent}
                      onDiagram={chooseDiagramIntent}
                    />
                    {contextMenuPreview ? <ContextMenuPreviewCard preview={contextMenuPreview} /> : null}
                  </div>
                ) : contextMenuPreview ? <ContextMenuPreviewCard preview={contextMenuPreview} /> : null}
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              multiple
              accept=".md,.txt,.csv,.pdf,.docx,.pptx,.xlsx,image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                void uploadFiles(files);
              }}
            />
          </div>
          )}
          <textarea
            ref={textareaRef}
            className="knownext-ai-prompt-textarea max-h-20 min-h-7 min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-[13px] leading-5 text-ink-primary outline-none placeholder:text-ink-secondary/70"
            value={prompt}
            onChange={(event) => handlePromptChange(event.target.value)}
            onKeyDown={(event) => {
              if (referenceQuery !== null && referenceResults.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setReferenceIndex((index) => Math.min(index + 1, referenceResults.length - 1));
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setReferenceIndex((index) => Math.max(index - 1, 0));
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addReference(referenceResults[referenceIndex]);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setReferenceQuery(null);
                  return;
                }
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            onPaste={handlePaste}
            placeholder={
              !hasContext
                ? "Crea un proyecto para activar la asistencia de documentación."
                : !providerReady
                ? "Configura OpenAI en Ajustes > IA para activar la asistencia."
                : intent?.kind === "research"
                ? "Describe qué quieres investigar..."
                : intent?.kind === "image"
                ? "Describe la imagen que quieres crear..."
                : intent?.kind === "diagram"
                ? "Describe el diagrama que necesitas..."
                : documentId
                ? "Pregunta algo sobre este documento..."
                : "Pregunta algo sobre la documentación del proyecto..."
            }
            rows={1}
            disabled={!hasContext}
          />
          {referenceQuery !== null ? (
            <ReferencePicker
              results={referenceResults}
              selectedIndex={referenceIndex}
              onSelect={(result) => void addReference(result)}
              onClose={() => setReferenceQuery(null)}
            />
          ) : null}
          {compactPrompt ? null : (
          <div className="relative shrink-0" ref={modeMenuRef}>
            <button
              type="button"
              className={`knownext-ai-mode-selector grid h-8 w-12 grid-cols-[1fr_auto] items-center rounded-full pl-2.5 pr-1.5 text-ink-primary ${promptControlClass}`}
              aria-expanded={modeMenuOpen}
              aria-haspopup="menu"
              aria-label="Selector de modo IA"
              data-tooltip={executionMode === "quick" ? "Rápido: respuesta directa" : `Razonar: ${selectedDepthLabel}, sin web externa`}
              onClick={() => {
                setModeMenuOpen((isOpen) => !isOpen);
                setDepthMenuOpen(executionMode === "reasoning");
              }}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full">
                {executionMode === "quick" ? <Zap size={14} /> : <Brain size={14} />}
              </span>
              <ChevronDown size={12} className={modeMenuOpen ? "rotate-180 transition" : "transition"} />
            </button>
            {modeMenuOpen ? (
              <div
                className="absolute bottom-full right-0 z-30 mb-2 grid w-44 gap-1 rounded-[16px] border border-line bg-white p-1.5 text-[11px] text-ink-primary shadow-[0_16px_38px_rgba(17,24,39,0.16)]"
                role="menu"
                aria-label="Modo de respuesta IA"
              >
                <p className="px-2 pb-0.5 pt-0.5 text-[10px] text-ink-secondary">Modo de respuesta</p>
                <button
                  type="button"
                  className={modeMenuItemClass(executionMode === "quick")}
                  role="menuitemradio"
                  aria-checked={executionMode === "quick"}
                  onClick={() => {
                    chooseExecutionMode("quick");
                  }}
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-panel text-ink-primary">
                    <Zap size={13} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">Rápido</span>
                  {executionMode === "quick" ? <Check size={13} className="text-brand-orange" /> : null}
                </button>
                <div className="relative">
                  <button
                    type="button"
                    className={modeMenuItemClass(executionMode === "reasoning" || depthMenuOpen)}
                    role="menuitemradio"
                    aria-checked={executionMode === "reasoning"}
                    aria-expanded={depthMenuOpen}
                    onMouseEnter={() => setDepthMenuOpen(true)}
                    onFocus={() => setDepthMenuOpen(true)}
                    onClick={() => setDepthMenuOpen(true)}
                  >
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-panel text-ink-primary">
                      <Brain size={13} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span>Razonar</span>
                      <span className="text-ink-secondary"> · {selectedDepthLabel}</span>
                    </span>
                    <SlidersHorizontal size={13} className="text-ink-secondary" />
                  </button>
                  {depthMenuOpen ? (
                    <div
                      className="absolute bottom-0 right-full z-40 mr-2 grid w-28 gap-1 rounded-[14px] border border-line bg-white p-1 shadow-[0_14px_34px_rgba(17,24,39,0.16)]"
                      role="menu"
                      aria-label="Profundidad de razonamiento"
                    >
                      {reasoningDepthOptions.map((option) => {
                        const selected = executionMode === "reasoning" && reasoningDepth === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={[
                              "flex h-6 w-full items-center justify-between rounded-lg border px-2 text-left text-[10px] transition",
                              selected ? "border border-orange-200 bg-brand-hover font-semibold text-brand-orange" : "border border-transparent text-ink-primary hover:bg-brand-hover",
                            ].join(" ")}
                            role="menuitemradio"
                            aria-checked={selected}
                            onClick={() => {
                              chooseExecutionMode("reasoning", option.value);
                            }}
                          >
                            <span>{option.label}</span>
                            {selected ? <Check size={12} /> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          )}
          {compactPrompt ? null : (
          <div ref={transcriptionMenuRef} className="relative shrink-0">
            <div
              className={[
                `knownext-ai-mic-control flex h-8 items-center overflow-hidden rounded-full text-ink-primary ${promptControlClass}`,
                transcribing ? "knownext-ai-mic-control-active border-brand-orange bg-brand-hover text-brand-orange" : "",
                transcriptionAvailable ? "" : "opacity-50",
              ].join(" ")}
            >
              <button
                type="button"
                className="grid h-8 w-8 place-items-center"
                data-tooltip={transcribing ? "Detener transcripción" : getTranscriptionTargetLabel(transcriptionTarget)}
                aria-label={transcribing ? "Detener transcripción" : "Iniciar transcripción"}
                disabled={!transcriptionAvailable && !transcribing}
                onClick={() => void toggleTranscription()}
              >
                {transcribing ? <Square size={13} fill="currentColor" /> : <TranscriptionTargetIcon target={transcriptionTarget} />}
              </button>
              <button
                type="button"
                className="grid h-8 w-7 -ml-1 place-items-center text-ink-secondary transition hover:text-brand-orange"
                data-tooltip="Opciones de transcripción"
                aria-label="Opciones de transcripción"
                aria-expanded={transcriptionMenuOpen}
                onPointerDown={toggleTranscriptionMenuFromPointer}
                onClick={toggleTranscriptionMenuFromClick}
              >
                <ChevronDown size={13} />
              </button>
            </div>
            {transcriptionMenuOpen ? (
              <div className="absolute bottom-full right-0 mb-2 w-56 rounded-xl border border-line bg-white p-1.5 shadow-menu" role="menu" aria-label="Opciones de transcripción">
                {transcribing ? <p className="px-2 py-1.5 text-[10px] leading-4 text-ink-secondary">Detén la transcripción para cambiar estas opciones.</p> : null}
                <button
                  type="button"
                  className={getTranscriptionMenuItemClass(transcriptionTarget === "prompt", transcribing)}
                  role="menuitemradio"
                  aria-checked={transcriptionTarget === "prompt"}
                  disabled={transcribing}
                  onClick={() => chooseTranscriptionTarget("prompt")}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <TranscriptionTargetIcon target="prompt" />
                    <span>Transcribir al prompt</span>
                  </span>
                  {transcriptionTarget === "prompt" ? <Check size={12} /> : null}
                </button>
                <button
                  type="button"
                  className={getTranscriptionMenuItemClass(transcriptionTarget === "document", transcribing)}
                  role="menuitemradio"
                  aria-checked={transcriptionTarget === "document"}
                  disabled={transcribing}
                  onClick={() => chooseTranscriptionTarget("document")}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <TranscriptionTargetIcon target="document" />
                    <span>Dictar en documento</span>
                  </span>
                  {transcriptionTarget === "document" ? <Check size={12} /> : null}
                </button>
                <div className="my-1 border-t border-line" />
                <p className="px-2 py-1 text-[9px] font-semibold uppercase text-ink-secondary">Idioma</p>
                {getTranscriptionMenuLanguages(transcription.favoriteLanguages, transcriptionLanguage).map((language) => (
                  <button
                    key={language}
                    type="button"
                    className={getTranscriptionMenuItemClass(transcriptionLanguage === language, transcribing)}
                    role="menuitemradio"
                    aria-checked={transcriptionLanguage === language}
                    disabled={transcribing}
                    onClick={() => chooseTranscriptionLanguage(language)}
                  >
                    <span>{transcriptionLanguageLabels[language]}</span>
                    {transcriptionLanguage === language ? <Check size={12} /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          )}
          {compactPrompt ? (
            <div className="knownext-ai-compact-actions flex h-9 shrink-0 overflow-hidden rounded-full border border-line bg-panel shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center border-r border-line text-ink-primary transition hover:bg-brand-hover hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-50"
                data-tooltip="Opciones del prompt"
                aria-label="Opciones del prompt"
                aria-haspopup="dialog"
                aria-expanded={compactOptionsOpen}
                onClick={openCompactOptions}
                disabled={!hasContext}
              >
                <MoreVertical size={18} />
              </button>
              <button
                className="grid h-9 w-9 place-items-center text-brand-orange transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                data-tooltip="Enviar prompt"
                aria-label="Enviar prompt"
                onClick={() => void handleSubmit()}
                disabled={loading || !canPrompt || hasBlockingContext}
              >
                {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-orange border-t-transparent" /> : <SendHorizontal size={18} />}
              </button>
            </div>
          ) : (
          <button
            className={`knownext-ai-send-button grid h-8 w-8 shrink-0 place-items-center rounded-full text-brand-orange ${promptControlClass}`}
            data-tooltip="Enviar"
            aria-label="Enviar"
            onClick={() => void handleSubmit()}
            disabled={loading || !canPrompt || hasBlockingContext}
          >
            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-orange border-t-transparent" /> : <SendHorizontal size={18} />}
          </button>
          )}
        </div>
        {hasBlockingContext ? (
          <p className="mx-10 mt-1 text-[10px] text-ink-secondary">Esperando a que las fuentes terminen de procesarse.</p>
        ) : null}
        {transcribing || transcriptionNotice ? (
          <p className="mx-10 mt-1 text-[10px] text-ink-secondary" role={transcriptionNotice ? "alert" : "status"} aria-live="polite">
            {transcriptionNotice ?? getTranscriptionStatusLabel(transcriptionState.status, transcriptionState.activeTarget ?? transcriptionTarget)}
          </p>
        ) : null}
        {dragActive ? (
          <div className="pointer-events-none absolute inset-1 grid place-items-center rounded-[24px] border border-dashed border-brand-orange bg-brand-hover/90 text-[11px] font-semibold text-brand-orange">
            Suelta archivos para usarlos como contexto IA
          </div>
        ) : null}
        {sourcesOpen ? (
          <ActiveSourcesPopover
            refElement={sourcesRef}
            sources={activeContextSources}
            preview={preview}
            previewLoadingId={previewLoadingId}
            onPreview={openPreview}
            onRemove={onRemoveContextSource}
            onExtend={onExtendContextSource}
            onAddToProject={onAddContextSourceToProject}
          />
        ) : null}
        {compactOptionsOpen ? (
          <PromptOptionsDialog
            canPrompt={canPrompt}
            canManageContext={canManageContext}
            hasBlockingContext={hasBlockingContext}
            transcriptionAvailable={transcriptionAvailable}
            canStartTranscription={canStartTranscription}
            transcribing={transcribing}
            transcriptionEnabled={transcription.enabled}
            transcriptionTarget={transcriptionTarget}
            transcriptionLanguage={transcriptionLanguage}
            transcriptionLanguages={getTranscriptionMenuLanguages(transcription.favoriteLanguages, transcriptionLanguage)}
            documentDictationReady={documentDictationReady}
            executionMode={executionMode}
            reasoningDepth={reasoningDepth}
            selectedDepthLabel={selectedDepthLabel}
            activeContextSources={activeContextSources}
            selectionFocus={visibleSelectionFocus}
            contextWeightLabel={contextWeightLabel}
            onClose={() => setCompactOptionsOpen(false)}
            onFocusProjectReferenceSearch={focusProjectReferenceSearch}
            onUploadFiles={() => void pickLocalContextFiles()}
            onFocusPromptForPaste={focusPromptForPaste}
            onOpenSources={() => {
              setCompactOptionsOpen(false);
              setSourcesOpen(true);
            }}
            onClearSelectionFocus={onClearSelectionFocus}
            onChooseExecutionMode={(mode, depth) => {
              chooseExecutionMode(mode, depth);
              setCompactOptionsOpen(false);
            }}
            onToggleTranscription={() => {
              void toggleTranscription();
              setCompactOptionsOpen(false);
            }}
            onChooseTranscriptionTarget={(target) => {
              chooseTranscriptionTarget(target);
              setCompactOptionsOpen(false);
            }}
            onChooseTranscriptionLanguage={(language) => {
              chooseTranscriptionLanguage(language);
              setCompactOptionsOpen(false);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

const reasoningDepthLabels: Record<AiReasoningDepth, string> = {
  light: "Ligero",
  medium: "Medio",
  deep: "Profundo",
};

const defaultTranscriptionConfig: AiConfigStatus["transcription"] = {
  enabled: true,
  model: "gpt-4o-mini-transcribe",
  defaultTarget: "prompt",
  defaultLanguage: "auto",
  favoriteLanguages: ["es", "en"],
};

const transcriptionLanguageLabels: Record<AiTranscriptionLanguage, string> = {
  auto: "Automático",
  es: "Español",
  en: "Inglés",
  fr: "Francés",
  de: "Alemán",
  it: "Italiano",
  pt: "Portugués",
  ca: "Catalán",
  eu: "Euskera",
  gl: "Gallego",
};

function getTranscriptionTargetLabel(target: AiTranscriptionTarget) {
  return target === "document" ? "Dictar en documento" : "Transcribir al prompt";
}

function getTranscriptionStatusLabel(status: string, target: AiTranscriptionTarget) {
  if (status === "connecting") return "Conectando micrófono...";
  if (status === "stopping") return "Finalizando transcripción...";
  return `Escuchando · ${target === "document" ? "Documento" : "Prompt"}`;
}

function getTranscriptionUnavailableMessage(canPrompt: boolean, enabled: boolean, hasBlockingContext: boolean) {
  if (!canPrompt) return "Configura OpenAI en Ajustes > IA para usar transcripción.";
  if (!enabled) return "Activa Audio y transcripción en Ajustes > IA.";
  if (hasBlockingContext) return "Espera a que las fuentes terminen de procesarse.";
  return "No se pudo iniciar la transcripción.";
}

function getTranscriptionMenuLanguages(favoriteLanguages: AiTranscriptionLanguage[], selectedLanguage: AiTranscriptionLanguage) {
  return Array.from(new Set<AiTranscriptionLanguage>(["auto", ...favoriteLanguages.filter((language) => language !== "auto"), selectedLanguage]));
}

function getTranscriptionMenuItemClass(selected: boolean, disabled: boolean) {
  return [
    "flex h-7 w-full items-center justify-between rounded-lg border px-2 text-left text-[10px] transition",
    selected ? "border-orange-200 bg-brand-hover font-semibold text-brand-orange" : "border-transparent text-ink-primary hover:bg-brand-hover",
    disabled ? "cursor-not-allowed opacity-50" : "",
  ].join(" ");
}

function TranscriptionTargetIcon({ target }: { target: AiTranscriptionTarget }) {
  const TargetIcon = target === "document" ? FileText : MessageSquare;
  return (
    <span className="relative grid h-5 w-5 shrink-0 place-items-center" aria-hidden="true">
      <Mic size={15} />
      <span
        className={[
          "knownext-transcription-target-badge absolute -bottom-0.5 -right-1 grid h-3.5 w-3.5 place-items-center rounded-full border border-line bg-white shadow-[0_1px_2px_rgba(17,24,39,0.12)]",
          target === "document" ? "text-brand-orange" : "text-ink-secondary",
        ].join(" ")}
      >
        <TargetIcon size={8} strokeWidth={2.2} />
      </span>
    </span>
  );
}

function withTrailingSpace(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return /[\s\n]$/.test(text) ? text : `${trimmed} `;
}

function ContextSourceChip({ source, onOpen, onRemove }: { source: AiContextSource; onOpen: () => void; onRemove?: () => void }) {
  const expiring = source.status === "expiring";
  const Icon = source.kind === "project_document" ? FileText : source.kind === "image" ? Image : File;
  const tooltip = expiring && source.expiresAt ? `Se quitará del contexto ${formatRelativeExpiry(source.expiresAt)} si no lo usas.` : source.warning || source.error || undefined;
  return (
    <span
      className={[
        "inline-flex h-6 max-w-[180px] items-center gap-1.5 rounded-full border px-2 text-[10px] font-medium transition",
        expiring ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-line bg-white text-ink-secondary hover:border-orange-200 hover:bg-brand-hover",
      ].join(" ")}
      data-tooltip={tooltip}
    >
      <Icon size={12} className={expiring ? "text-brand-orange" : "text-ink-secondary"} />
      <button type="button" className="min-w-0 truncate" onClick={onOpen}>
        {source.name}
      </button>
      {expiring || source.status === "warning" || source.status === "error" ? <AlertCircle size={12} className="shrink-0 text-brand-orange" /> : null}
      {onRemove ? (
        <button type="button" className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" aria-label={`Quitar ${source.name} del contexto IA`} onClick={onRemove}>
          <X size={10} />
        </button>
      ) : null}
    </span>
  );
}

const researchCandidateSourceOptions = [10, 50, 200, 500] as const;
const researchReportLengthOptions: Array<{ value: AiResearchReportLength; label: string; detail: string }> = [
  { value: "brief", label: "Breve", detail: "800-1.500 palabras" },
  { value: "standard", label: "Estándar", detail: "2.000-4.000 palabras" },
  { value: "wide", label: "Amplio", detail: "5.000-8.000 palabras" },
  { value: "exhaustive", label: "Exhaustivo", detail: "9.000-15.000 palabras" },
];

function ResearchPreparationCard({
  brief,
  job,
  onChange,
  onStart,
  onCancelBrief,
  onCancelJob,
  onRetryJob,
}: {
  brief: AiResearchBrief | null;
  job: AiResearchJob | null;
  onChange?: (brief: AiResearchBrief) => void;
  onStart?: (brief: AiResearchBrief) => void | Promise<void>;
  onCancelBrief?: () => void;
  onCancelJob?: (jobId: string) => void | Promise<void>;
  onRetryJob?: (jobId: string) => void | Promise<void>;
}) {
  const activeBrief = brief ?? job?.brief ?? null;
  const running = Boolean(job && !isResearchTerminalStatus(job.status));
  const ready = Boolean(job && isResearchReadyStatus(job.status));
  const failed = Boolean(job && isResearchFailedStatus(job.status));
  const cancelled = job?.status === "cancelled";
  const progress = Math.max(0, Math.min(100, job?.progress ?? (running ? 20 : ready || failed || cancelled ? 100 : 0)));
  const plan = activeBrief ? getResearchPlan(activeBrief) : null;
  const [editingPlan, setEditingPlan] = useState(false);
  const [draftPlan, setDraftPlan] = useState(plan);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [countdownPaused, setCountdownPaused] = useState(false);
  const [confirmCancelJob, setConfirmCancelJob] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const autoStartedRef = useRef<string | null>(null);

  useEffect(() => {
    setEditingPlan(false);
    setDraftPlan(plan);
    setSecondsLeft(60);
    setCountdownPaused(false);
    setConfirmCancelJob(false);
    autoStartedRef.current = null;
  }, [activeBrief?.id, plan?.updatedAt]);

  useEffect(() => {
    if (!activeBrief || job || editingPlan || countdownPaused || !plan || autoStartedRef.current === activeBrief.id) return;
    if (secondsLeft <= 0) {
      autoStartedRef.current = activeBrief.id;
      void onStart?.(withResearchPlan(activeBrief, draftPlan ?? plan));
      return;
    }
    const timeout = window.setTimeout(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1_000);
    return () => window.clearTimeout(timeout);
  }, [activeBrief, countdownPaused, draftPlan, editingPlan, job, onStart, plan, secondsLeft]);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [running]);

  const stalled = Boolean(job && running && isResearchStalled(job, nowMs));
  const activityLine = job ? researchProgressLine(job, { nowMs, stalled }) : "";
  const title = "Investigación";
  const footerText = job
    ? researchFooterText(job, stalled)
    : editingPlan
      ? "La cuenta atrás está pausada mientras editas el plan."
      : "Puedes cambiar el plan o dejar que empiece automáticamente.";

  if (!activeBrief && !job) return null;

  function updateDraftPlan(patch: Partial<NonNullable<typeof draftPlan>>) {
    setDraftPlan((current) => current ? { ...current, ...patch, updatedAt: new Date().toISOString() } : current);
  }

  function commitDraftPlan() {
    if (!activeBrief || !draftPlan || !onChange) return;
    onChange(withResearchPlan(activeBrief, draftPlan));
    setEditingPlan(false);
  }

  function startNow() {
    if (!activeBrief || !plan) return;
    autoStartedRef.current = activeBrief.id;
    void onStart?.(withResearchPlan(activeBrief, draftPlan ?? plan));
  }

  function requestCancelJob() {
    if (!job || !running) return;
    setConfirmCancelJob(true);
  }

  function confirmCancelRunningJob() {
    if (!job) return;
    setConfirmCancelJob(false);
    void onCancelJob?.(job.id);
  }

  return (
    <div className="pointer-events-auto absolute bottom-full left-1/2 mb-3 max-h-[min(640px,calc(100vh-136px))] w-[min(760px,calc(100vw-72px))] -translate-x-1/2 overflow-hidden rounded-[18px] border border-orange-100 bg-white shadow-[0_18px_55px_rgba(17,24,39,0.16)]">
      <div className="border-b border-line bg-panel/50 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-hover text-brand-orange">
              <Search size={17} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-semibold text-ink-primary">{title}</p>
                {activeBrief ? <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-ink-secondary ring-1 ring-line">Documento nuevo</span> : null}
              </div>
              <p className="mt-1 text-[11px] leading-4 text-ink-secondary">{job?.progressMessage ?? job?.message ?? "Revisa el guion. Puedes editarlo o dejar que empiece automáticamente."}</p>
            </div>
          </div>
          {job ? (
            <span className={["shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold", ready ? "bg-emerald-50 text-emerald-700" : failed ? "bg-red-50 text-red-700" : "bg-brand-hover text-brand-orange"].join(" ")}>
              {researchStatusLabel(job.status)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="max-h-[calc(min(640px,calc(100vh-136px))-132px)] overflow-y-auto px-4 py-3">
        {activeBrief && plan && !job ? (
          editingPlan && draftPlan ? (
            <div className="grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">Objetivo principal</span>
                <textarea className="min-h-[66px] resize-none rounded-xl border border-line bg-white px-3 py-2 text-[12px] leading-5 text-ink-primary outline-none transition focus:border-brand-orange focus:ring-2 focus:ring-orange-100" value={draftPlan.primaryObjective ?? draftPlan.objective} onChange={(event) => updateDraftPlan({ primaryObjective: event.target.value, objective: event.target.value })} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">3 objetivos secundarios</span>
                <textarea className="min-h-[108px] resize-none rounded-xl border border-line bg-white px-3 py-2 text-[12px] leading-5 text-ink-primary outline-none transition focus:border-brand-orange focus:ring-2 focus:ring-orange-100" value={(draftPlan.secondaryObjectives ?? []).join("\n")} onChange={(event) => updateDraftPlan({ secondaryObjectives: splitResearchPlanLines(event.target.value).slice(0, 3) })} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">5 aspectos a investigar</span>
                <textarea className="min-h-[132px] resize-none rounded-xl border border-line bg-white px-3 py-2 text-[12px] leading-5 text-ink-primary outline-none transition focus:border-brand-orange focus:ring-2 focus:ring-orange-100" value={(draftPlan.researchAspects ?? draftPlan.outline).join("\n")} onChange={(event) => updateDraftPlan({ researchAspects: splitResearchPlanLines(event.target.value).slice(0, 5) })} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">Estilo recomendado</span>
                <input className="h-9 rounded-xl border border-line bg-white px-3 text-[12px] text-ink-primary outline-none transition focus:border-brand-orange focus:ring-2 focus:ring-orange-100" value={draftPlan.recommendedReportStyle ?? ""} onChange={(event) => updateDraftPlan({ recommendedReportStyle: event.target.value })} />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <ResearchPlanSegmentedControl
                  label="Fuentes candidatas"
                  value={String(normalizeResearchCandidateSourceLimit(draftPlan.candidateSourceLimit ?? draftPlan.proposedCandidateSourceLimit))}
                  options={researchCandidateSourceOptions.map((value) => ({ value: String(value), label: String(value) }))}
                  onChange={(value) => updateDraftPlan({ candidateSourceLimit: Number(value) })}
                />
                <ResearchPlanSegmentedControl
                  label="Extensión del informe"
                  value={draftPlan.reportLength ?? draftPlan.proposedReportLength ?? "standard"}
                  options={researchReportLengthOptions.map((option) => ({ value: option.value, label: option.label, detail: option.detail }))}
                  onChange={(value) => updateDraftPlan({ reportLength: value as AiResearchReportLength })}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-[12px] leading-5 text-ink-primary">
              <p>
                <span className="font-semibold text-brand-orange">Plan propuesto.</span>{" "}
                <span className="font-semibold">{plan.title}</span>
              </p>
              <p>
                <span className="font-semibold">Objetivo principal:</span> {plan.primaryObjective ?? plan.objective}
              </p>
              <p>
                <span className="font-semibold">Objetivos secundarios:</span>{" "}
                {(plan.secondaryObjectives ?? []).slice(0, 3).map((item, index) => `${index + 1}. ${item}`).join(" · ")}
              </p>
              <p>
                <span className="font-semibold">Aspectos a investigar:</span>{" "}
                {(plan.researchAspects ?? plan.outline).slice(0, 5).map((item, index) => `${index + 1}. ${item}`).join(" · ")}
              </p>
              <p>
                <span className="font-semibold">Estilo:</span> {plan.recommendedReportStyle ?? "Informe profesional, trazable y orientado a conclusiones."}{" "}
                <span className="font-semibold">Salida:</span> Documento nuevo.{" "}
                <span className="font-semibold">Recursos:</span> {researchVisualToggleLabel(plan)}.
              </p>
              {plan.constraints ? (
                <p>
                  <span className="font-semibold">Criterios:</span> {plan.constraints}
                </p>
              ) : null}
              {plan.planningRationale ? (
                <p className="text-ink-secondary">
                  <span className="font-semibold text-brand-orange">Propuesta:</span> {plan.planningRationale}
                </p>
              ) : null}
              <div className="grid gap-3 pt-1 sm:grid-cols-2">
                <ResearchPlanSegmentedControl
                  label="Fuentes candidatas"
                  value={String(normalizeResearchCandidateSourceLimit((draftPlan ?? plan).candidateSourceLimit ?? (draftPlan ?? plan).proposedCandidateSourceLimit))}
                  options={researchCandidateSourceOptions.map((value) => ({ value: String(value), label: String(value) }))}
                  onChange={(value) => updateDraftPlan({ candidateSourceLimit: Number(value) })}
                />
                <ResearchPlanSegmentedControl
                  label="Extensión del informe"
                  value={(draftPlan ?? plan).reportLength ?? (draftPlan ?? plan).proposedReportLength ?? "standard"}
                  options={researchReportLengthOptions.map((option) => ({ value: option.value, label: option.label, detail: option.detail }))}
                  onChange={(value) => updateDraftPlan({ reportLength: value as AiResearchReportLength })}
                />
              </div>
            </div>
          )
        ) : null}

        {job ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-panel/60 px-3 py-2">
            {running ? <Loader2 size={14} className="shrink-0 animate-spin text-brand-orange" /> : ready ? <CheckCircle2 size={14} className="shrink-0 text-emerald-600" /> : failed ? <AlertTriangle size={14} className="shrink-0 text-red-600" /> : <Search size={14} className="shrink-0 text-ink-secondary" />}
            <p className="min-w-0 truncate text-[12px] text-ink-primary">{activityLine}</p>
          </div>
          <ResearchMetricChips job={job} />
          <div className="h-1.5 overflow-hidden rounded-full bg-panel">
            <div className="h-full rounded-full bg-brand-orange transition-all" style={{ width: `${progress}%` }} />
          </div>
          {failed ? <p className="rounded-lg bg-red-50 px-2 py-1.5 text-[10px] text-red-700">{researchErrorMessage(job.error) || job.message}</p> : null}
        </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line bg-white px-4 py-3">
        <p className="min-w-0 truncate text-[11px] text-ink-secondary">{footerText}</p>
        <div className="flex shrink-0 gap-2">
          {job && running ? <button className="h-9 rounded-xl border border-line px-4 text-[12px] font-semibold text-ink-secondary transition hover:bg-brand-hover" onClick={requestCancelJob}>Cancelar</button> : null}
          {!job && activeBrief ? <button className="h-9 rounded-xl border border-line px-4 text-[12px] font-semibold text-ink-secondary transition hover:bg-brand-hover" onClick={onCancelBrief}>Cancelar</button> : null}
          {!job && activeBrief && !editingPlan ? <button className="h-9 rounded-xl border border-line px-4 text-[12px] font-semibold text-ink-secondary transition hover:bg-brand-hover" onClick={() => setEditingPlan(true)}>Cambiar</button> : null}
          {!job && activeBrief && editingPlan ? <button className="h-9 rounded-xl border border-line px-4 text-[12px] font-semibold text-ink-secondary transition hover:bg-brand-hover" onClick={commitDraftPlan}>Guardar cambios</button> : null}
          {!job && activeBrief && !editingPlan ? <ResearchCountdownButton secondsLeft={secondsLeft} totalSeconds={60} paused={countdownPaused} onToggle={() => setCountdownPaused((paused) => !paused)} /> : null}
          {!job && activeBrief ? <button className="h-9 rounded-xl bg-brand-orange px-4 text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(243,112,33,0.22)] transition hover:bg-brand-dark" onClick={startNow}>Iniciar ahora</button> : null}
          {job && failed ? <button className="h-9 rounded-xl bg-brand-orange px-4 text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(243,112,33,0.22)] transition hover:bg-brand-dark" onClick={() => void onRetryJob?.(job.id)}>Reintentar</button> : null}
          {job && isResearchTerminalStatus(job.status) ? <button className="h-9 rounded-xl border border-line px-4 text-[12px] font-semibold text-ink-secondary transition hover:bg-brand-hover" onClick={onCancelBrief}>Cerrar</button> : null}
        </div>
      </div>
      {confirmCancelJob ? (
        <ResearchCancelConfirmationDialog
          onCancel={() => setConfirmCancelJob(false)}
          onConfirm={confirmCancelRunningJob}
        />
      ) : null}
    </div>
  );
}

function researchStatusLabel(status: AiResearchJob["status"]) {
  const labels: Record<AiResearchJob["status"], string> = {
    draft: "Borrador",
    planning: "Planificando",
    query_planning: "Preparando plan",
    searching: "Buscando",
    ranking: "Seleccionando",
    reading: "Leyendo",
    extracting: "Extrayendo",
    contrasting: "Contrastando",
    gap_analysis: "Revisando lagunas",
    synthesizing: "Sintetizando",
    drafting: "Redactando",
    reviewing: "Revisando",
    verifying: "Verificando",
    publishing: "Creando borrador",
    ready: "Lista",
    ready_pass: "Lista",
    ready_warning: "Lista con avisos",
    failed: "Error",
    failed_quality: "Calidad insuficiente",
    failed_provider: "Error técnico",
    failed_publish: "Error al crear borrador",
    failed_runtime: "Error interno",
    cancelled: "Cancelada",
  };
  return labels[status];
}

function ResearchCountdownButton({
  secondsLeft,
  totalSeconds,
  paused,
  onToggle,
}: {
  secondsLeft: number;
  totalSeconds: number;
  paused: boolean;
  onToggle: () => void;
}) {
  const progress = Math.max(0, Math.min(1, secondsLeft / Math.max(1, totalSeconds)));
  const degrees = Math.round(progress * 360);
  const Icon = paused ? Play : Pause;
  return (
    <button
      type="button"
      className="group inline-flex h-9 items-center gap-2 rounded-xl border border-orange-100 bg-brand-hover/70 pl-1.5 pr-3 text-[11px] font-semibold text-brand-orange transition hover:bg-brand-hover"
      onClick={onToggle}
      aria-label={paused ? "Reanudar cuenta atrás" : "Pausar cuenta atrás"}
      data-tooltip={paused ? "Reanudar inicio automático" : "Pausar inicio automático"}
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(#F37021 ${degrees}deg, #FFE2D1 ${degrees}deg)` }}
        aria-hidden="true"
      >
        <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-white">
          <Icon size={11} strokeWidth={2.4} />
        </span>
      </span>
      <span>{secondsLeft} s</span>
    </button>
  );
}

function ResearchCancelConfirmationDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-white/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="research-cancel-title">
      <div className="w-[min(360px,100%)] rounded-2xl border border-line bg-white p-4 shadow-[0_18px_45px_rgba(17,24,39,0.18)]">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
            <AlertTriangle size={17} />
          </span>
          <div className="min-w-0">
            <p id="research-cancel-title" className="text-[14px] font-semibold text-ink-primary">Cancelar investigación</p>
            <p className="mt-1 text-[12px] leading-5 text-ink-secondary">Se detendrá el proceso y no se creará ningún documento parcial.</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="h-9 rounded-xl border border-line px-4 text-[12px] font-semibold text-ink-secondary transition hover:bg-brand-hover" onClick={onCancel}>
            Volver
          </button>
          <button type="button" className="h-9 rounded-xl bg-red-600 px-4 text-[12px] font-semibold text-white transition hover:bg-red-700" onClick={onConfirm}>
            Cancelar investigación
          </button>
        </div>
      </div>
    </div>
  );
}

function isResearchReadyStatus(status: AiResearchJob["status"]) {
  return status === "ready" || status === "ready_pass" || status === "ready_warning";
}

function isResearchFailedStatus(status: AiResearchJob["status"]) {
  return status === "failed" || status === "failed_quality" || status === "failed_provider" || status === "failed_publish" || status === "failed_runtime";
}

function isResearchTerminalStatus(status: AiResearchJob["status"]) {
  return isResearchReadyStatus(status) || isResearchFailedStatus(status) || status === "cancelled";
}

function researchProgressLine(job: AiResearchJob, options?: { nowMs?: number; stalled?: boolean }) {
  const elapsed = formatResearchElapsed(job.startedAt ?? job.createdAt, options?.nowMs ?? Date.now());
  if (options?.stalled) {
    const message = latestResearchActivityMessage(job) || job.progressMessage || job.message || researchStatusLabel(job.status);
    return `${elapsed} · Sin actividad reciente. Último paso: ${message}`;
  }
  if (isResearchReadyStatus(job.status)) {
    return job.documentPath ? `${elapsed} · Borrador creado: ${job.documentPath}` : `${elapsed} · Investigación completada. Borrador creado.`;
  }
  if (isResearchFailedStatus(job.status)) {
    return `${elapsed} · ${researchErrorMessage(job.error) || job.message || "No se pudo completar la investigación."}`;
  }
  if (job.status === "cancelled") return `${elapsed} · Investigación cancelada.`;
  return `${elapsed} · ${latestResearchActivityMessage(job) || job.progressMessage || job.message || researchStatusLabel(job.status)}`;
}

function latestResearchActivityMessage(job: AiResearchJob) {
  const activity = job.activity ?? [];
  return activity.length > 0 ? activity[activity.length - 1]?.message?.trim() || "" : "";
}

function researchFooterText(job: AiResearchJob, stalled: boolean) {
  if (stalled) return "No hay actividad reciente. Puedes esperar o cancelar.";
  if (isResearchReadyStatus(job.status)) return job.documentPath ? `Borrador creado para revisar: ${job.documentPath}` : "Borrador creado para revisar.";
  if (isResearchFailedStatus(job.status)) return "No se creó ningún documento.";
  if (job.status === "cancelled") return "Investigación cancelada. No se creó ningún documento parcial.";
  return "La investigación está trabajando. Puedes cancelarla; no se creará documento parcial.";
}

function isResearchStalled(job: AiResearchJob, nowMs: number) {
  const heartbeat = job.heartbeatAt ?? job.lastActivityAt ?? job.updatedAt;
  const heartbeatMs = heartbeat ? Date.parse(heartbeat) : Number.NaN;
  if (!Number.isFinite(heartbeatMs)) return false;
  return nowMs - heartbeatMs > 120_000;
}

function formatResearchElapsed(startedAt: string | null | undefined, nowMs: number) {
  const startedMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const elapsedSeconds = Number.isFinite(startedMs) ? Math.max(0, Math.floor((nowMs - startedMs) / 1_000)) : 0;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function ResearchMetricChips({ job }: { job: AiResearchJob }) {
  const counts = job.artifactCounts;
  const usage = job.usage;
  const chips: string[] = [];
  if (counts) {
    const sourceTotal = counts.candidateSources || job.strategy?.candidateSourceLimit || job.brief.candidateSourceLimit || job.brief.maxSources || 0;
    const sourceCurrent = counts.readSources || counts.selectedSources || counts.rankedSources || counts.candidateSources;
    if (sourceCurrent > 0 || sourceTotal > 0) chips.push(`Fuentes ${sourceCurrent}${sourceTotal ? `/${sourceTotal}` : ""}`);
    if (counts.evidence > 0) chips.push(`Evidencias ${counts.evidence}`);
    if (counts.tables > 0) chips.push(`Tablas ${counts.tables}`);
    if (counts.diagrams > 0) chips.push(`Diagramas ${counts.diagrams}`);
    if (counts.images > 0) chips.push(`Imágenes ${counts.images}`);
  }
  if (usage) {
    if (usage.totalTokens > 0) chips.push(`Tokens ${formatCompactNumber(usage.totalTokens)}`);
    if (typeof usage.estimatedCostEur === "number" && usage.estimatedCostEur > 0) chips.push(`Coste aprox. ${formatEuro(usage.estimatedCostEur)}`);
  }
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.slice(0, 7).map((chip) => (
        <span key={chip} className="rounded-full border border-orange-100 bg-brand-hover/70 px-2 py-0.5 text-[10px] font-semibold text-brand-orange">
          {chip}
        </span>
      ))}
    </div>
  );
}

function formatCompactNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}`.replace(".", ",") + "k";
  return String(value);
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function getResearchPlan(brief: AiResearchBrief): NonNullable<AiResearchBrief["plan"]> {
  const now = new Date().toISOString();
  const candidateSourceLimit = normalizeResearchCandidateSourceLimit(brief.candidateSourceLimit ?? brief.maxSources ?? brief.plan?.candidateSourceLimit ?? brief.plan?.proposedCandidateSourceLimit);
  const reportLength = normalizeResearchReportLength(brief.plan?.reportLength ?? brief.plan?.proposedReportLength);
  const fallbackAspects = normalizeResearchPlanList(brief.questions, [
    `Delimitar el objetivo real de la investigación sobre ${brief.topic}`,
    "Localizar fuentes web fiables y recientes",
    "Contrastar coincidencias y contradicciones entre fuentes",
    "Separar hechos verificados, incertidumbres y recomendaciones",
    "Definir conclusiones accionables y limitaciones del informe",
  ], 5);
  const fallbackSecondary = normalizeResearchPlanList([], [
    `Aclarar el contexto y alcance de ${brief.topic}`,
    "Verificar la información con fuentes independientes",
    "Convertir los hallazgos en recomendaciones útiles",
  ], 3);
  return brief.plan ?? {
    title: brief.topic || "Investigación",
    objective: brief.objective || `Investigar de forma contrastada: ${brief.topic}`,
    primaryObjective: brief.objective || `Investigar de forma contrastada: ${brief.topic}`,
    secondaryObjectives: fallbackSecondary,
    researchAspects: fallbackAspects,
    objectiveCoverage: [
      { objectiveIndex: 0, aspectIndexes: [0, 1] },
      { objectiveIndex: 1, aspectIndexes: [1, 2, 3] },
      { objectiveIndex: 2, aspectIndexes: [3, 4] },
    ],
    recommendedReportStyle: "Informe profesional con conclusiones accionables",
    proposedCandidateSourceLimit: candidateSourceLimit,
    candidateSourceLimit,
    proposedReportLength: reportLength,
    reportLength,
    planningRationale: `${candidateSourceLimit} fuentes candidatas y extensión ${researchReportLengthLabel(reportLength).toLowerCase()} por el alcance previsto.`,
    outline: fallbackAspects,
    constraints: "Priorizar fuentes fiables, conclusiones accionables y limitaciones explícitas.",
    sourceScope: "web_project",
    reportSkillId: "knownext.research_report",
    auxiliarySkillIds: [],
    outputSummary: "Web activa · contexto del proyecto si se aporta · tablas y citas siempre disponibles",
    visualPlan: researchVisualToggleLabel({ diagramsEnabled: brief.reportProfile?.diagramsEnabled ?? false, imagesEnabled: brief.reportProfile?.imagesEnabled ?? false } as NonNullable<AiResearchBrief["plan"]>),
    diagramsEnabled: brief.reportProfile?.diagramsEnabled ?? false,
    imagesEnabled: brief.reportProfile?.imagesEnabled ?? false,
    estimatedDurationLabel: brief.depth === "quick" ? "3-5 min" : brief.depth === "deep" ? "8-15 min" : "6-10 min",
    autoStartAfterSeconds: 60,
    createdAt: brief.createdAt || now,
    updatedAt: brief.updatedAt || now,
  };
}

function withResearchPlan(brief: AiResearchBrief, plan: NonNullable<AiResearchBrief["plan"]>): AiResearchBrief {
  const now = new Date().toISOString();
  const primaryObjective = (plan.primaryObjective ?? plan.objective).trim();
  const secondaryObjectives = normalizeResearchPlanList(plan.secondaryObjectives ?? [], [
    `Aclarar el contexto y alcance de ${brief.topic}`,
    "Verificar la información con fuentes independientes",
    "Convertir los hallazgos en recomendaciones útiles",
  ], 3);
  const researchAspects = normalizeResearchPlanList(plan.researchAspects ?? plan.outline, [
    `Delimitar el objetivo real de la investigación sobre ${brief.topic}`,
    "Localizar fuentes web fiables y recientes",
    "Contrastar coincidencias y contradicciones entre fuentes",
    "Separar hechos verificados, incertidumbres y recomendaciones",
    "Definir conclusiones accionables y limitaciones del informe",
  ], 5);
  const candidateSourceLimit = normalizeResearchCandidateSourceLimit(plan.candidateSourceLimit ?? plan.proposedCandidateSourceLimit ?? brief.candidateSourceLimit ?? brief.maxSources);
  const reportLength = normalizeResearchReportLength(plan.reportLength ?? plan.proposedReportLength);
  const nextPlan = {
    ...plan,
    objective: primaryObjective,
    primaryObjective,
    secondaryObjectives,
    researchAspects,
    outline: researchAspects,
    sourceScope: "web_project" as const,
    proposedCandidateSourceLimit: normalizeResearchCandidateSourceLimit(plan.proposedCandidateSourceLimit ?? candidateSourceLimit),
    candidateSourceLimit,
    proposedReportLength: normalizeResearchReportLength(plan.proposedReportLength ?? reportLength),
    reportLength,
    updatedAt: now,
  };
  return {
    ...brief,
    topic: plan.title,
    objective: primaryObjective,
    questions: researchAspects,
    sourceScope: "web_project",
    maxSources: candidateSourceLimit,
    candidateSourceLimit,
    plan: nextPlan,
    updatedAt: now,
  };
}

function normalizeResearchCandidateSourceLimit(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 50;
  return researchCandidateSourceOptions.reduce((closest, option) => (
    Math.abs(option - numeric) < Math.abs(closest - numeric) ? option : closest
  ), researchCandidateSourceOptions[0]);
}

function normalizeResearchReportLength(value: unknown): AiResearchReportLength {
  return researchReportLengthOptions.some((option) => option.value === value)
    ? value as AiResearchReportLength
    : "standard";
}

function researchReportLengthLabel(value: AiResearchReportLength) {
  return researchReportLengthOptions.find((option) => option.value === value)?.label ?? "Estándar";
}

function normalizeResearchPlanList(values: string[], fallback: string[], count: number) {
  const items = [...values, ...fallback].map((value) => value.trim()).filter(Boolean);
  return items.slice(0, count);
}

function researchVisualToggleLabel(plan: Pick<NonNullable<AiResearchBrief["plan"]>, "diagramsEnabled" | "imagesEnabled">) {
  if (plan.diagramsEnabled && plan.imagesEnabled) return "Diagramas e imágenes permitidos";
  if (plan.diagramsEnabled) return "Diagramas permitidos";
  if (plan.imagesEnabled) return "Imágenes permitidas";
  return "Sin recursos visuales";
}

function splitResearchPlanLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function researchErrorMessage(error: AiResearchJob["error"]) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return error.message;
}

function ResearchPlanSegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; detail?: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel/50 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</p>
      <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              className={["min-h-8 rounded-lg px-2 py-1 text-[10px] font-semibold transition", selected ? "bg-brand-orange text-white shadow-[0_6px_14px_rgba(243,112,33,0.2)]" : "bg-white text-ink-secondary ring-1 ring-line hover:bg-brand-hover hover:text-brand-orange"].join(" ")}
              title={option.detail}
              onClick={() => onChange(option.value)}
            >
              <span className="block truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
      {options.find((option) => option.value === value)?.detail ? (
        <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{options.find((option) => option.value === value)?.detail}</p>
      ) : null}
    </div>
  );
}

type ContextMenuPreview = {
  icon: LucideIcon;
  title: string;
  detail: string;
  group: string;
};
type ContextMenuSubmenu = "create";

function ContextMenuSectionTitle({ label }: { label: string }) {
  return (
    <p className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">
      {label}
    </p>
  );
}

function ContextMenuDivider() {
  return <div className="my-1 h-px bg-line" />;
}

function ContextMenuSubmenuButton({
  icon: Icon,
  title,
  detail,
  active,
  onPreview,
  onOpen,
  onToggle,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  active: boolean;
  onPreview: (preview: ContextMenuPreview, submenu?: ContextMenuSubmenu | null) => void;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const preview = { icon: Icon, title, detail, group: "Capacidad" };
  return (
    <button
      type="button"
      className={["group flex h-8 w-full items-center gap-2 rounded-xl px-2 text-left transition focus-visible:outline-none", active ? "bg-brand-hover text-brand-orange" : "hover:bg-brand-hover focus-visible:bg-brand-hover"].join(" ")}
      onMouseEnter={() => {
        onPreview(preview);
        onOpen();
      }}
      onFocus={() => {
        onPreview(preview);
        onOpen();
      }}
      onClick={onToggle}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-panel text-brand-orange transition group-hover:bg-white">
        <Icon size={13} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink-primary">{title}</span>
      <ChevronRight size={13} className="shrink-0 text-ink-secondary group-hover:text-brand-orange" />
    </button>
  );
}

function ContextMenuSubmenuPanel({
  submenu,
  onPreview,
  onImage,
  onDiagram,
}: {
  submenu: ContextMenuSubmenu;
  onPreview: (preview: ContextMenuPreview, submenu?: ContextMenuSubmenu | null) => void;
  onImage: () => void;
  onDiagram: () => void;
}) {
  return (
    <div className="w-64 rounded-[16px] border border-orange-100 bg-white/95 p-1.5 text-left shadow-menu ring-1 ring-orange-50 backdrop-blur">
      <ContextMenuSectionTitle label="Crear" />
      <ContextMenuButton icon={Image} title="Crear imagen" detail="Genera un asset visual para el proyecto usando la intención indicada." group="Creación" onPreview={(preview) => onPreview(preview, submenu)} onClick={onImage} />
      <ContextMenuButton icon={Sparkles} title="Crear diagrama" detail="Prepara Mermaid o un diagrama insertable alineado con el documento." group="Creación" onPreview={(preview) => onPreview(preview, submenu)} onClick={onDiagram} />
    </div>
  );
}

function ContextMenuButton({
  icon: Icon,
  title,
  detail,
  group,
  onPreview,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  group?: string;
  onPreview?: (preview: ContextMenuPreview, submenu?: ContextMenuSubmenu | null) => void;
  onClick: () => void;
}) {
  const preview = { icon: Icon, title, detail, group: group ?? "Opción" };
  const compact = Boolean(onPreview);
  return (
    <button
      type="button"
      className={["group flex w-full items-center gap-2 rounded-xl px-2 text-left transition hover:bg-brand-hover focus-visible:bg-brand-hover focus-visible:outline-none", compact ? "h-8" : "py-2"].join(" ")}
      onMouseEnter={() => onPreview?.(preview)}
      onFocus={() => onPreview?.(preview)}
      onClick={onClick}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-panel text-brand-orange transition group-hover:bg-white">
        <Icon size={13} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold text-ink-primary">{title}</span>
        {!compact ? <span className="block truncate text-[10px] text-ink-secondary">{detail}</span> : null}
      </span>
    </button>
  );
}

function ContextMenuPreviewCard({ preview }: { preview: ContextMenuPreview }) {
  const Icon = preview.icon;
  return (
    <div className="hidden w-64 rounded-[16px] border border-orange-100 bg-white/95 p-3 text-left shadow-menu ring-1 ring-orange-50 backdrop-blur md:block">
      <div className="flex items-start gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-hover text-brand-orange">
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-orange">{preview.group}</p>
          <p className="mt-0.5 text-[12px] font-semibold text-ink-primary">{preview.title}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-ink-secondary">{preview.detail}</p>
    </div>
  );
}

function PromptOptionsDialog({
  canPrompt,
  canManageContext,
  hasBlockingContext,
  transcriptionAvailable,
  canStartTranscription,
  transcribing,
  transcriptionEnabled,
  transcriptionTarget,
  transcriptionLanguage,
  transcriptionLanguages,
  documentDictationReady,
  executionMode,
  reasoningDepth,
  selectedDepthLabel,
  activeContextSources,
  selectionFocus,
  contextWeightLabel,
  onClose,
  onFocusProjectReferenceSearch,
  onUploadFiles,
  onFocusPromptForPaste,
  onOpenSources,
  onClearSelectionFocus,
  onChooseExecutionMode,
  onToggleTranscription,
  onChooseTranscriptionTarget,
  onChooseTranscriptionLanguage,
}: {
  canPrompt: boolean;
  canManageContext: boolean;
  hasBlockingContext: boolean;
  transcriptionAvailable: boolean;
  canStartTranscription: boolean;
  transcribing: boolean;
  transcriptionEnabled: boolean;
  transcriptionTarget: AiTranscriptionTarget;
  transcriptionLanguage: AiTranscriptionLanguage;
  transcriptionLanguages: AiTranscriptionLanguage[];
  documentDictationReady: boolean;
  executionMode: AiExecutionMode;
  reasoningDepth: AiReasoningDepth;
  selectedDepthLabel: string;
  activeContextSources: AiContextSource[];
  selectionFocus?: AiSelectionFocus | null;
  contextWeightLabel: string;
  onClose: () => void;
  onFocusProjectReferenceSearch: () => void;
  onUploadFiles: () => void;
  onFocusPromptForPaste: () => void;
  onOpenSources: () => void;
  onClearSelectionFocus?: () => void;
  onChooseExecutionMode: (mode: AiExecutionMode, depth?: AiReasoningDepth) => void;
  onToggleTranscription: () => void;
  onChooseTranscriptionTarget: (target: AiTranscriptionTarget) => void;
  onChooseTranscriptionLanguage: (language: AiTranscriptionLanguage) => void;
}) {
  const transcriptionStatus = !canPrompt
    ? "Configura OpenAI en Ajustes > IA para usar el dictado."
    : !transcriptionEnabled
    ? "Activa Audio y transcripción en Ajustes > IA."
    : hasBlockingContext
    ? "Espera a que las fuentes terminen de procesarse."
    : transcriptionTarget === "document" && !documentDictationReady
    ? "Coloca el cursor en el documento antes de dictar sobre él."
    : null;

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[90] flex items-center justify-center bg-black/20 px-4 py-6" role="presentation" onMouseDown={onClose}>
      <section
        className="flex max-h-[min(680px,calc(100dvh-48px))] w-[min(460px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-options-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
          <h2 id="prompt-options-title" className="text-[13px] font-semibold text-ink-primary">Opciones del prompt</h2>
          <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" aria-label="Cerrar opciones del prompt" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          <PromptOptionsSection title="Contexto">
            <div className={`grid gap-1 rounded-xl border border-line p-1 ${canManageContext ? "" : "opacity-50"}`}>
              <ContextMenuButton icon={FileText} title="Archivo del proyecto" detail="Buscar con @ documentos del proyecto" onClick={onFocusProjectReferenceSearch} />
              <ContextMenuButton icon={File} title="Adjuntar archivo" detail="PDF, Office, CSV, Markdown e imagen" onClick={onUploadFiles} />
              <ContextMenuButton icon={Image} title="Pegar imagen" detail="Cierra este panel y usa Ctrl+V en el prompt" onClick={onFocusPromptForPaste} />
            </div>
            {selectionFocus ? (
              <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-brand-hover px-3 py-2 text-[11px] text-brand-orange">
                <span className="min-w-0 flex-1 truncate font-semibold">{selectionFocus.focusType === "cursor" ? "Cursor en documento" : "Texto seleccionado"}</span>
                {onClearSelectionFocus ? (
                  <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-white" aria-label={selectionFocus.focusType === "cursor" ? "Quitar cursor del contexto IA" : "Quitar texto seleccionado del contexto IA"} onClick={onClearSelectionFocus}>
                    <X size={14} />
                  </button>
                ) : null}
              </div>
            ) : null}
            {activeContextSources.length > 0 ? (
              <button className="flex h-10 w-full items-center gap-2 rounded-xl border border-line px-3 text-left text-[12px] text-ink-primary hover:bg-brand-hover" onClick={onOpenSources}>
                <Sparkles size={16} className="shrink-0 text-brand-orange" />
                <span className="min-w-0 flex-1 truncate">Fuentes activas · {activeContextSources.length} · {contextWeightLabel}</span>
              </button>
            ) : null}
          </PromptOptionsSection>

          <PromptOptionsSection title="Modo IA">
            <div className="grid grid-cols-2 gap-2">
              <PromptOptionButton
                icon={Zap}
                label="Rápido"
                detail="Respuesta directa"
                active={executionMode === "quick"}
                onClick={() => onChooseExecutionMode("quick")}
              />
              <PromptOptionButton
                icon={Brain}
                label="Razonar"
                detail={selectedDepthLabel}
                active={executionMode === "reasoning"}
                onClick={() => onChooseExecutionMode("reasoning", reasoningDepth)}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {reasoningDepthOptions.map((option) => {
                const selected = executionMode === "reasoning" && reasoningDepth === option.value;
                return (
                  <button
                    key={option.value}
                    className={`h-9 rounded-xl border text-[12px] font-semibold ${selected ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-line text-ink-primary hover:bg-brand-hover"}`}
                    aria-pressed={selected}
                    onClick={() => onChooseExecutionMode("reasoning", option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </PromptOptionsSection>

          <PromptOptionsSection title="Dictado">
            <button
              className={`flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-left text-[12px] font-semibold ${transcribing ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-line text-ink-primary hover:bg-brand-hover"} ${transcriptionAvailable || transcribing ? "" : "opacity-50"}`}
              disabled={!transcriptionAvailable && !transcribing}
              onClick={onToggleTranscription}
            >
              {transcribing ? <Square size={14} fill="currentColor" /> : <TranscriptionTargetIcon target={transcriptionTarget} />}
              <span className="min-w-0 flex-1 truncate">{transcribing ? "Detener transcripción" : "Iniciar transcripción"}</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <PromptOptionButton
                icon={MessageSquare}
                label="Al prompt"
                detail="Transcribir"
                active={transcriptionTarget === "prompt"}
                disabled={transcribing}
                onClick={() => onChooseTranscriptionTarget("prompt")}
              />
              <PromptOptionButton
                icon={FileText}
                label="Al documento"
                detail="Dictar"
                active={transcriptionTarget === "document"}
                disabled={transcribing}
                onClick={() => onChooseTranscriptionTarget("document")}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {transcriptionLanguages.map((language) => {
                const selected = transcriptionLanguage === language;
                return (
                  <button
                    key={language}
                    className={`h-9 rounded-xl border px-2 text-[12px] font-semibold ${selected ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-line text-ink-primary hover:bg-brand-hover"} ${transcribing ? "opacity-50" : ""}`}
                    disabled={transcribing}
                    aria-pressed={selected}
                    onClick={() => onChooseTranscriptionLanguage(language)}
                  >
                    {transcriptionLanguageLabels[language]}
                  </button>
                );
              })}
            </div>
            {transcriptionStatus && !canStartTranscription ? (
              <p className="rounded-xl border border-orange-200 bg-brand-hover px-3 py-2 text-[11px] leading-4 text-brand-orange">{transcriptionStatus}</p>
            ) : null}
          </PromptOptionsSection>
        </div>
      </section>
    </div>
  );
}

function PromptOptionsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-[11px] font-semibold uppercase text-ink-secondary">{title}</h3>
      {children}
    </section>
  );
}

function PromptOptionButton({
  icon: Icon,
  label,
  detail,
  active,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex h-11 min-w-0 items-center gap-2 rounded-xl border px-3 text-left ${active ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-line text-ink-primary hover:bg-brand-hover"} ${disabled ? "opacity-50" : ""}`}
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon size={16} className="shrink-0" />
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold">{label}</span>
        <span className="block truncate text-[10px] text-ink-secondary">{detail}</span>
      </span>
    </button>
  );
}

function ReferencePicker({
  results,
  selectedIndex,
  onSelect,
  onClose,
}: {
  results: AiContextSearchResult[];
  selectedIndex: number;
  onSelect: (result: AiContextSearchResult) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute bottom-full left-10 z-40 mb-2 flex max-h-[min(360px,calc(100dvh-180px))] w-[min(420px,calc(100%-80px))] flex-col overflow-hidden rounded-[16px] border border-line bg-white p-1.5 text-[11px] text-ink-primary shadow-menu">
      <div className="flex shrink-0 items-center justify-between gap-2 px-2 pb-1 pt-0.5 text-[10px] text-ink-secondary">
        <p className="flex min-w-0 items-center gap-1.5">
          <Search size={11} />
          <span>Referenciar archivo</span>
        </p>
        <button type="button" className="grid h-6 w-6 place-items-center rounded-md hover:bg-brand-hover hover:text-brand-orange" aria-label="Cerrar selector de archivos" onClick={onClose}>
          <X size={12} />
        </button>
      </div>
      {results.length === 0 ? (
        <p className="px-2 py-2 text-[11px] text-ink-secondary">No hay documentos que coincidan.</p>
      ) : (
        <div className="min-h-0 overflow-y-auto pr-1">
          {results.map((result, index) => (
            <button
              key={result.documentId}
              type="button"
              className={[
                "flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left",
                index === selectedIndex ? "bg-brand-hover text-brand-orange" : "hover:bg-brand-hover",
              ].join(" ")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(result)}
            >
              {result.kind === "image" ? <Image size={14} className="mt-3 shrink-0" /> : result.kind === "external_file" ? <File size={14} className="mt-3 shrink-0" /> : <FileText size={14} className="mt-3 shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10px] text-ink-secondary">{pathWithoutFileName(result.path, result.name) || "Proyecto"}</span>
                <span className="mt-0.5 block truncate text-[12px] font-semibold text-ink-primary">{result.name}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function pathWithoutFileName(path: string, name: string) {
  const normalized = path.replace(/\\/g, "/");
  if (!normalized) return "";
  if (normalized.endsWith(`/${name}`)) return normalized.slice(0, -name.length - 1);
  if (normalized === name) return "";
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
}

function ActiveSourcesPopover({
  refElement,
  sources,
  preview,
  previewLoadingId,
  onPreview,
  onRemove,
  onExtend,
  onAddToProject,
}: {
  refElement: RefObject<HTMLDivElement>;
  sources: AiContextSource[];
  preview: AiContextSourcePreviewResponse | null;
  previewLoadingId: string | null;
  onPreview: (source: AiContextSource) => void | Promise<void>;
  onRemove?: (sourceId: string) => void | Promise<void>;
  onExtend?: (sourceId: string) => void | Promise<void>;
  onAddToProject?: (sourceId: string) => void | Promise<void>;
}) {
  return (
    <div ref={refElement} className="absolute bottom-full left-0 z-40 mb-2 grid max-h-[430px] w-[min(560px,calc(100vw-80px))] grid-cols-[minmax(0,1fr)_minmax(220px,260px)] overflow-hidden rounded-[18px] border border-line bg-white text-[11px] text-ink-primary shadow-menu">
      <div className="min-w-0 border-r border-line p-2">
        <div className="mb-1 flex items-center justify-between gap-2 px-1">
          <p className="font-semibold">Fuentes activas</p>
          <span className="rounded-full bg-panel px-2 py-0.5 text-[10px] text-ink-secondary">{sources.length}</span>
        </div>
        <div className="max-h-[360px] space-y-1 overflow-y-auto pr-1">
          {sources.length === 0 ? (
            <p className="px-1 py-2 text-ink-secondary">No hay fuentes añadidas.</p>
          ) : (
            sources.map((source) => (
              <div key={source.id} className="flex items-start gap-2 rounded-xl px-2 py-2 hover:bg-brand-hover">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-brand-orange shadow-subtle">
                  {source.kind === "image" ? <Image size={14} /> : source.kind === "project_document" ? <FileText size={14} /> : <File size={14} />}
                </span>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void onPreview(source)}>
                  <span className="block truncate text-[11px] font-semibold">{source.name}</span>
                  <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-ink-secondary">
                    <SourceStatus source={source} />
                    <span>{source.kind === "image" ? "Imagen" : source.kind === "project_document" || source.path ? "Proyecto" : "Externo"}</span>
                    {source.expiresAt ? <span>{formatRelativeExpiry(source.expiresAt)}</span> : null}
                  </span>
                </button>
                {previewLoadingId === source.id ? <span className="mt-1 h-4 w-4 animate-spin rounded-full border-2 border-brand-orange border-t-transparent" /> : null}
                {onRemove ? (
                  <button type="button" className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-secondary hover:bg-white hover:text-brand-orange" aria-label={`Quitar ${source.name}`} onClick={() => void onRemove(source.id)}>
                    <X size={13} />
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
      <div className="min-w-0 bg-panel/50 p-3">
        {preview ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-ink-primary">{preview.source.name}</p>
              <p className="mt-1 text-[10px] text-ink-secondary">
                {preview.source.mimeType ?? preview.source.kind} · {formatSize(preview.source.sizeBytes)}
              </p>
              {preview.source.warning ? <p className="mt-2 rounded-xl border border-orange-200 bg-brand-hover px-2 py-1.5 text-[10px] text-brand-orange">{preview.source.warning}</p> : null}
              {preview.source.error ? <p className="mt-2 rounded-xl border border-orange-200 bg-brand-hover px-2 py-1.5 text-[10px] text-brand-orange">{preview.source.error}</p> : null}
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-white p-2 text-[10px] leading-4 text-ink-secondary">
              {preview.previewText ? <p className="whitespace-pre-wrap">{preview.previewText}</p> : <p>{preview.source.kind === "image" ? "Imagen lista para análisis visual." : "Sin texto de previsualización."}</p>}
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-1.5">
              {onExtend ? (
                <button type="button" className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-white px-2.5 text-[10px] font-medium text-ink-secondary hover:border-orange-200 hover:bg-brand-hover hover:text-brand-orange" onClick={() => void onExtend(preview.source.id)}>
                  <Clock3 size={12} />
                  Mantener 1 h
                </button>
              ) : null}
              {onAddToProject && preview.source.kind === "external_file" && !preview.source.path ? (
                <button type="button" className="inline-flex h-7 items-center gap-1 rounded-full bg-brand-orange px-2.5 text-[10px] font-semibold text-white hover:bg-brand-dark" onClick={() => void onAddToProject(preview.source.id)}>
                  <FileText size={12} />
                  Añadir al proyecto
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-[220px] place-items-center text-center text-[10px] leading-4 text-ink-secondary">
            <p>Selecciona una fuente para ver estado, caducidad y previsualización.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SourceStatus({ source }: { source: AiContextSource }) {
  if (source.status === "processing") return <span className="text-brand-orange">Procesando</span>;
  if (source.status === "error") return <span className="text-brand-orange">No se pudo leer</span>;
  if (source.status === "warning") return <span className="text-brand-orange">Aviso</span>;
  if (source.status === "expiring") return <span className="text-brand-orange">Caduca pronto</span>;
  return <span>Listo</span>;
}

function getActiveMention(value: string) {
  const match = value.match(/(?:^|\s)@([^\s@]*)$/);
  return match ? match[1] : null;
}

function removeActiveMention(value: string) {
  return value.replace(/(?:^|\s)@([^\s@]*)$/, (match) => (match.startsWith(" ") ? " " : "")).trimEnd();
}

function useCompactPromptMode() {
  const [compact, setCompact] = useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(xsViewportQuery).matches
      : false
  ));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(xsViewportQuery);
    const update = () => setCompact(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.("change", update);
    return () => mediaQuery.removeEventListener?.("change", update);
  }, []);

  return compact;
}

function getContextWeightLabel(sources: AiContextSource[]) {
  if (sources.some((source) => source.weight === "too_large")) return "muy alto";
  if (sources.some((source) => source.weight === "high")) return "alto";
  if (sources.some((source) => source.weight === "medium")) return "medio";
  return "ligero";
}

function formatRelativeExpiry(expiresAt: string) {
  const minutes = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000));
  if (minutes <= 0) return "ahora";
  if (minutes === 1) return "en 1 min";
  if (minutes < 60) return `en ${minutes} min`;
  return "en 1 h";
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "sin tamaño";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const reasoningDepthOptions: Array<{ value: AiReasoningDepth; label: string }> = [
  { value: "light", label: "Ligero" },
  { value: "medium", label: "Medio" },
  { value: "deep", label: "Profundo" },
];

function modeMenuItemClass(selected: boolean) {
  return [
    "flex h-8 w-full items-center gap-2 rounded-xl border px-2 text-left font-normal transition",
    selected ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-transparent hover:bg-brand-hover",
  ].join(" ");
}
