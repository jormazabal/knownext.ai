import { Mic, Plus, SendHorizontal } from "lucide-react";
import { useState } from "react";
import { promptAssistant } from "../../lib/api/ai";

type AiPromptInputProps = {
  documentId?: string;
  projectId?: string;
  markdown: string;
};

export function AiPromptInput({ documentId, projectId, markdown }: AiPromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const canPrompt = Boolean(documentId || projectId);

  async function handleSubmit() {
    if (!prompt.trim() || !canPrompt) return;
    setLoading(true);
    try {
      await promptAssistant({ documentId, projectId, markdown, prompt });
      setPrompt("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pointer-events-auto absolute bottom-11 left-1/2 z-20 w-[min(700px,calc(100%-56px))] -translate-x-1/2">
      <div className="flex h-9 items-center rounded-md border border-line bg-white px-2 shadow-subtle">
        <button className="grid h-6 w-6 place-items-center rounded-md hover:bg-brand-hover" data-tooltip="Añadir contexto" aria-label="Añadir contexto">
          <Plus size={16} />
        </button>
        <input
          className="min-w-0 flex-1 bg-transparent px-2 text-[11px] outline-none placeholder:text-ink-secondary"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleSubmit();
          }}
          placeholder={
            !canPrompt
              ? "Crea un proyecto para activar la asistencia de documentación."
              : documentId
              ? "Pregunta algo sobre este documento... (ej. Resúmelo, enumera los acuerdos, crea tareas, etc.)"
              : "Pregunta algo sobre la documentación del proyecto... (ej. Resume, busca acuerdos, crea tareas, etc.)"
          }
          disabled={!canPrompt}
        />
        <button
          className="grid h-6 w-6 place-items-center rounded-md text-brand-orange hover:bg-brand-hover disabled:opacity-50"
          data-tooltip="Enviar"
          aria-label="Enviar"
          onClick={() => void handleSubmit()}
          disabled={loading || !canPrompt}
        >
          <SendHorizontal size={16} />
        </button>
        <button className="grid h-6 w-6 place-items-center rounded-md hover:bg-brand-hover" data-tooltip="Micrófono" aria-label="Micrófono">
          <Mic size={15} />
        </button>
      </div>
    </div>
  );
}
