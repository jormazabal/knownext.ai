import { AlertCircle, Brain, Check, ChevronDown, Clock3, File, FileText, Image, Mic, Plus, Search, SendHorizontal, SlidersHorizontal, Sparkles, X, Zap } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type RefObject } from "react";
import type { AiContextSearchResult, AiContextSource, AiContextSourcePreviewResponse, AiExecutionMode, AiReasoningDepth, AiSelectionFocus } from "../../types/domain";

export type AiPromptExecutionOptions = {
  executionMode: AiExecutionMode;
  reasoningDepth: AiReasoningDepth;
};

type AiPromptInputProps = {
  documentId?: string;
  projectId?: string;
  markdown: string;
  providerReady: boolean;
  appliedChangeSummary?: string | null;
  selectionFocus?: AiSelectionFocus | null;
  activeContextSources?: AiContextSource[];
  onSubmit: (prompt: string, selectionFocus?: AiSelectionFocus | null, options?: AiPromptExecutionOptions) => void | Promise<void>;
  onClearSelectionFocus?: () => void;
  onDismissAppliedChange?: () => void;
  onSearchProjectDocuments?: (query: string) => Promise<AiContextSearchResult[]>;
  onAddProjectDocumentContext?: (documentId: string) => void | Promise<void>;
  onUploadContextFiles?: (files: File[]) => void | Promise<void>;
  onRemoveContextSource?: (sourceId: string) => void | Promise<void>;
  onExtendContextSource?: (sourceId: string) => void | Promise<void>;
  onPreviewContextSource?: (sourceId: string) => Promise<AiContextSourcePreviewResponse>;
  onAddContextSourceToProject?: (sourceId: string) => void | Promise<void>;
};

export function AiPromptInput({
  documentId,
  projectId,
  providerReady,
  appliedChangeSummary,
  selectionFocus,
  activeContextSources = [],
  onSubmit,
  onClearSelectionFocus,
  onDismissAppliedChange,
  onSearchProjectDocuments,
  onAddProjectDocumentContext,
  onUploadContextFiles,
  onRemoveContextSource,
  onExtendContextSource,
  onPreviewContextSource,
  onAddContextSourceToProject,
}: AiPromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [executionMode, setExecutionMode] = useState<AiExecutionMode>("quick");
  const [reasoningDepth, setReasoningDepth] = useState<AiReasoningDepth>("light");
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [depthMenuOpen, setDepthMenuOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [referenceQuery, setReferenceQuery] = useState<string | null>(null);
  const [referenceResults, setReferenceResults] = useState<AiContextSearchResult[]>([]);
  const [referenceIndex, setReferenceIndex] = useState(0);
  const [preview, setPreview] = useState<AiContextSourcePreviewResponse | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const sourcesRef = useRef<HTMLDivElement | null>(null);
  const hasContext = Boolean(documentId || projectId);
  const canPrompt = hasContext && providerReady;
  const hasBlockingContext = activeContextSources.some((source) => source.status === "processing");
  const selectedModeLabel = executionMode === "quick" ? "Rápido" : "Razonar";
  const selectedDepthLabel = reasoningDepthLabels[reasoningDepth];
  const visibleSources = activeContextSources.slice(0, 4);
  const hiddenSourceCount = Math.max(0, activeContextSources.length - visibleSources.length);
  const contextWeightLabel = useMemo(() => getContextWeightLabel(activeContextSources), [activeContextSources]);

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
    if (!contextMenuOpen && !sourcesOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (contextMenuRef.current?.contains(target) || sourcesRef.current?.contains(target)) return;
      setContextMenuOpen(false);
      setSourcesOpen(false);
      setPreview(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setContextMenuOpen(false);
        setSourcesOpen(false);
        setPreview(null);
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
    const maxHeight = 80;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [prompt]);

  async function handleSubmit() {
    if (!prompt.trim() || !canPrompt || hasBlockingContext) return;
    setLoading(true);
    try {
      await onSubmit(prompt.trim(), selectionFocus ?? null, { executionMode, reasoningDepth });
      setPrompt("");
    } finally {
      setLoading(false);
    }
  }

  function handlePromptChange(value: string) {
    setPrompt(value);
    const mention = getActiveMention(value);
    setReferenceQuery(mention);
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
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
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

  return (
    <div className="pointer-events-none absolute inset-x-8 bottom-11 z-20 flex justify-center">
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
      <div
        className={[
          "knownext-ai-prompt pointer-events-auto relative flex min-h-11 w-[min(760px,100%)] flex-col rounded-[28px] border bg-white px-2.5 py-1.5 shadow-[0_10px_28px_rgba(17,24,39,0.12)] transition",
          dragActive ? "border-brand-orange bg-brand-hover/60" : "border-line/90",
        ].join(" ")}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
        }}
        onDrop={handleDrop}
      >
        {selectionFocus || activeContextSources.length > 0 ? (
          <div className="mx-1 mb-1.5 flex max-h-[52px] flex-wrap items-center gap-1 overflow-hidden">
            {selectionFocus ? (
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
          <div className="relative" ref={contextMenuRef}>
          <button
            type="button"
            className="knownext-ai-context-button grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-primary transition hover:bg-panel disabled:opacity-60"
            data-tooltip="Añadir contexto"
            aria-label="Añadir contexto"
            aria-expanded={contextMenuOpen}
            onClick={() => setContextMenuOpen((open) => !open)}
            disabled={!canPrompt}
          >
            <Plus size={19} strokeWidth={1.8} />
          </button>
          {contextMenuOpen ? (
            <div className="absolute bottom-full left-0 z-40 mb-2 grid w-64 gap-1 rounded-[16px] border border-line bg-white p-1.5 text-[11px] text-ink-primary shadow-menu">
              <p className="px-2 pb-0.5 pt-0.5 text-[10px] text-ink-secondary">Añadir contexto</p>
              <ContextMenuButton icon={FileText} title="Archivo del proyecto" detail="Escribe @ para buscar documentos" onClick={() => {
                setContextMenuOpen(false);
                setReferenceQuery("");
                textareaRef.current?.focus();
              }} />
              <ContextMenuButton icon={File} title="Adjuntar archivo" detail="PDF, Word, PowerPoint, Markdown o imagen" onClick={() => fileInputRef.current?.click()} />
              <ContextMenuButton icon={Image} title="Pegar imagen" detail="Usa Ctrl+V dentro del prompt" onClick={() => {
                setContextMenuOpen(false);
                textareaRef.current?.focus();
              }} />
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            multiple
            accept=".md,.txt,.pdf,.docx,.pptx,image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              void uploadFiles(files);
            }}
          />
          </div>
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
                : documentId
                ? "Pregunta algo sobre este documento..."
                : "Pregunta algo sobre la documentación del proyecto..."
            }
            rows={1}
            disabled={!canPrompt}
          />
          {referenceQuery !== null ? (
            <ReferencePicker
              results={referenceResults}
              selectedIndex={referenceIndex}
              onSelect={(result) => void addReference(result)}
            />
          ) : null}
          <div className="relative shrink-0" ref={modeMenuRef}>
            <button
              type="button"
              className="knownext-ai-mode-selector flex h-7 items-center gap-1 rounded-full bg-panel px-2 text-[11px] font-normal text-ink-primary transition hover:bg-brand-hover"
              aria-expanded={modeMenuOpen}
              aria-haspopup="menu"
              aria-label="Selector de modo IA"
              data-tooltip={executionMode === "quick" ? "Rápido: una llamada, sin tareas agénticas" : `Razonar: ${selectedDepthLabel}`}
              onClick={() => {
                setModeMenuOpen((isOpen) => !isOpen);
                setDepthMenuOpen(executionMode === "reasoning");
              }}
            >
              <span>{selectedModeLabel}</span>
              {executionMode === "reasoning" ? <span className="text-[11px] text-ink-secondary">· {selectedDepthLabel}</span> : null}
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
                    setExecutionMode("quick");
                    setReasoningDepth("light");
                    setDepthMenuOpen(false);
                    setModeMenuOpen(false);
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
                              setExecutionMode("reasoning");
                              setReasoningDepth(option.value);
                              setDepthMenuOpen(false);
                              setModeMenuOpen(false);
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
          <button
            className="knownext-ai-send-button grid h-8 w-8 shrink-0 place-items-center rounded-full text-brand-orange transition hover:bg-brand-hover disabled:opacity-50"
            data-tooltip="Enviar"
            aria-label="Enviar"
            onClick={() => void handleSubmit()}
            disabled={loading || !canPrompt || hasBlockingContext}
          >
            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-orange border-t-transparent" /> : <SendHorizontal size={18} />}
          </button>
          <button className="knownext-ai-mic-button grid h-8 w-8 shrink-0 place-items-center rounded-full bg-panel text-ink-primary opacity-50" data-tooltip="Micrófono no disponible" aria-label="Micrófono no disponible" disabled>
            <Mic size={16} />
          </button>
        </div>
        {hasBlockingContext ? (
          <p className="mx-10 mt-1 text-[10px] text-ink-secondary">Esperando a que las fuentes terminen de procesarse.</p>
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
      </div>
    </div>
  );
}

const reasoningDepthLabels: Record<AiReasoningDepth, string> = {
  light: "Ligero",
  medium: "Medio",
  deep: "Profundo",
};

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

function ContextMenuButton({ icon: Icon, title, detail, onClick }: { icon: typeof FileText; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-brand-hover" onClick={onClick}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-panel text-brand-orange">
        <Icon size={14} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold text-ink-primary">{title}</span>
        <span className="block truncate text-[10px] text-ink-secondary">{detail}</span>
      </span>
    </button>
  );
}

function ReferencePicker({
  results,
  selectedIndex,
  onSelect,
}: {
  results: AiContextSearchResult[];
  selectedIndex: number;
  onSelect: (result: AiContextSearchResult) => void;
}) {
  return (
    <div className="absolute bottom-full left-10 z-40 mb-2 w-[min(360px,calc(100%-80px))] rounded-[16px] border border-line bg-white p-1.5 text-[11px] text-ink-primary shadow-menu">
      <p className="flex items-center gap-1.5 px-2 pb-1 pt-0.5 text-[10px] text-ink-secondary">
        <Search size={11} />
        Referenciar archivo
      </p>
      {results.length === 0 ? (
        <p className="px-2 py-2 text-[11px] text-ink-secondary">No hay documentos que coincidan.</p>
      ) : (
        results.map((result, index) => (
          <button
            key={result.documentId}
            type="button"
            className={[
              "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left",
              index === selectedIndex ? "bg-brand-hover text-brand-orange" : "hover:bg-brand-hover",
            ].join(" ")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(result)}
          >
            {result.kind === "image" ? <Image size={13} className="shrink-0" /> : <FileText size={13} className="shrink-0" />}
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-semibold">{result.name}</span>
              <span className="block truncate text-[10px] text-ink-secondary">{result.path}</span>
            </span>
          </button>
        ))
      )}
    </div>
  );
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
                    <span>{source.kind === "project_document" ? "Proyecto" : source.kind === "image" ? "Imagen" : "Externo"}</span>
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
              {onAddToProject && preview.source.kind === "external_file" ? (
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
