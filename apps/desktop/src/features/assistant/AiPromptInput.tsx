import { Mic, Plus, SendHorizontal } from "lucide-react";
import { useState } from "react";

type AiPromptInputProps = {
  documentId?: string;
  projectId?: string;
  markdown: string;
  providerReady: boolean;
  onSubmit: (prompt: string) => void;
};

export function AiPromptInput({ documentId, projectId, providerReady, onSubmit }: AiPromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const hasContext = Boolean(documentId || projectId);
  const canPrompt = hasContext && providerReady;

  async function handleSubmit() {
    if (!prompt.trim() || !canPrompt) return;
    setLoading(true);
    try {
      await onSubmit(prompt.trim());
      setPrompt("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pointer-events-auto absolute bottom-11 left-1/2 z-20 w-[min(700px,calc(100%-56px))] -translate-x-1/2">
      <div className="flex min-h-10 items-end rounded-md border border-line bg-white px-2 py-1.5 shadow-subtle">
        <button className="mb-0.5 grid h-6 w-6 place-items-center rounded-md text-ink-secondary opacity-60" data-tooltip="Añadir contexto" aria-label="Añadir contexto" disabled>
          <Plus size={16} />
        </button>
        <textarea
          className="max-h-20 min-h-6 min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-[11px] leading-4 outline-none placeholder:text-ink-secondary"
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
              ? "Pregunta algo sobre este documento... (ej. Resúmelo, enumera los acuerdos, crea tareas, etc.)"
              : "Pregunta algo sobre la documentación del proyecto... (ej. Resume, busca acuerdos, crea tareas, etc.)"
          }
          rows={1}
          disabled={!canPrompt}
        />
        <button
          className="mb-0.5 grid h-6 w-6 place-items-center rounded-md text-brand-orange hover:bg-brand-hover disabled:opacity-50"
          data-tooltip="Enviar"
          aria-label="Enviar"
          onClick={() => void handleSubmit()}
          disabled={loading || !canPrompt}
        >
          {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-orange border-t-transparent" /> : <SendHorizontal size={16} />}
        </button>
        <button className="mb-0.5 grid h-6 w-6 place-items-center rounded-md text-ink-secondary opacity-50" data-tooltip="Micrófono no disponible" aria-label="Micrófono no disponible" disabled>
          <Mic size={15} />
        </button>
      </div>
    </div>
  );
}
