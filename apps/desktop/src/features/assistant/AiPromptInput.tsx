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

  async function handleSubmit() {
    if (!prompt.trim()) return;
    setLoading(true);
    await promptAssistant({ documentId, projectId, markdown, prompt });
    setLoading(false);
    setPrompt("");
  }

  return (
    <div className="pointer-events-auto absolute bottom-[62px] left-1/2 z-20 w-[min(760px,calc(100%-80px))] -translate-x-1/2">
      <div className="flex h-11 items-center rounded-xl border border-line bg-white px-3 shadow-subtle">
        <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-brand-hover" data-tooltip="Añadir contexto" aria-label="Añadir contexto">
          <Plus size={19} />
        </button>
        <input
          className="min-w-0 flex-1 bg-transparent px-3 text-[13px] outline-none placeholder:text-ink-secondary"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleSubmit();
          }}
          placeholder={
            documentId
              ? "Pregunta algo sobre este documento... (ej. Resúmelo, enumera los acuerdos, crea tareas, etc.)"
              : "Pregunta algo sobre la documentación del proyecto... (ej. Resume, busca acuerdos, crea tareas, etc.)"
          }
        />
        <button
          className="grid h-8 w-8 place-items-center rounded-md text-brand-orange hover:bg-brand-hover disabled:opacity-50"
          data-tooltip="Enviar"
          aria-label="Enviar"
          onClick={() => void handleSubmit()}
          disabled={loading}
        >
          <SendHorizontal size={18} />
        </button>
        <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-brand-hover" data-tooltip="Micrófono" aria-label="Micrófono">
          <Mic size={17} />
        </button>
      </div>
    </div>
  );
}
