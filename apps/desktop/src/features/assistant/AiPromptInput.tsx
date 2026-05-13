import { Brain, Check, ChevronDown, Mic, Plus, SendHorizontal, SlidersHorizontal, X, Zap } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AiExecutionMode, AiReasoningDepth, AiSelectionFocus } from "../../types/domain";

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
  onSubmit: (prompt: string, selectionFocus?: AiSelectionFocus | null, options?: AiPromptExecutionOptions) => void | Promise<void>;
  onClearSelectionFocus?: () => void;
  onDismissAppliedChange?: () => void;
};

export function AiPromptInput({
  documentId,
  projectId,
  providerReady,
  appliedChangeSummary,
  selectionFocus,
  onSubmit,
  onClearSelectionFocus,
  onDismissAppliedChange,
}: AiPromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [executionMode, setExecutionMode] = useState<AiExecutionMode>("quick");
  const [reasoningDepth, setReasoningDepth] = useState<AiReasoningDepth>("light");
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [depthMenuOpen, setDepthMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);
  const hasContext = Boolean(documentId || projectId);
  const canPrompt = hasContext && providerReady;
  const selectedModeLabel = executionMode === "quick" ? "Rápido" : "Razonar";
  const selectedDepthLabel = reasoningDepthLabels[reasoningDepth];

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
    if (!prompt.trim() || !canPrompt) return;
    setLoading(true);
    try {
      await onSubmit(prompt.trim(), selectionFocus ?? null, { executionMode, reasoningDepth });
      setPrompt("");
    } finally {
      setLoading(false);
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
      <div className="pointer-events-auto flex min-h-11 w-[min(760px,100%)] flex-col rounded-[28px] border border-line/90 bg-white px-2.5 py-1.5 shadow-[0_10px_28px_rgba(17,24,39,0.12)]">
        {selectionFocus ? (
          <div className="mx-1 mb-1.5 flex justify-start">
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
          </div>
        ) : null}
        <div className="flex items-center gap-1.5">
          <button className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-primary transition hover:bg-panel disabled:opacity-60" data-tooltip="Añadir contexto" aria-label="Añadir contexto" disabled>
            <Plus size={19} strokeWidth={1.8} />
          </button>
          <textarea
            ref={textareaRef}
            className="max-h-20 min-h-7 min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-[13px] leading-5 text-ink-primary outline-none placeholder:text-ink-secondary/70"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
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
          <div className="relative shrink-0" ref={modeMenuRef}>
            <button
              type="button"
              className="flex h-7 items-center gap-1 rounded-full bg-panel px-2 text-[11px] font-normal text-ink-primary transition hover:bg-brand-hover"
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
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-brand-orange transition hover:bg-brand-hover disabled:opacity-50"
            data-tooltip="Enviar"
            aria-label="Enviar"
            onClick={() => void handleSubmit()}
            disabled={loading || !canPrompt}
          >
            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-orange border-t-transparent" /> : <SendHorizontal size={18} />}
          </button>
          <button className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-panel text-ink-primary opacity-50" data-tooltip="Micrófono no disponible" aria-label="Micrófono no disponible" disabled>
            <Mic size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

const reasoningDepthLabels: Record<AiReasoningDepth, string> = {
  light: "Ligero",
  medium: "Medio",
  deep: "Profundo",
};

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
