import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { ReadonlyMarkdownViewer } from "../editor/ReadonlyMarkdownViewer";
import { drawPageBackground, drawStroke } from "../handwritten/handwrittenModel";
import type { HandwrittenNotePage } from "../../types/domain";
import type { AiResultReviewEntry } from "./useAiResultReview";

type Props = {
  entries: AiResultReviewEntry[]; warnings: string[]; error: string | null; busy: boolean;
  onClose: () => void; onCopy: (id: string, outputId: string) => Promise<string | null>;
  onRemove: (id: string) => Promise<void>; onRetry: (entry: AiResultReviewEntry) => Promise<void>; onReload: () => Promise<void>;
};
export function AiResultReviewDialog(props: Props) {
  const [selectedId, setSelectedId] = useState(props.entries[0]?.result.id ?? "");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [copies, setCopies] = useState<Record<string, string>>({});
  const entry = props.entries.find(entry => entry.result.id === selectedId) ?? props.entries[0];
  return <ModalFrame label="Resultados IA conservados" onClose={() => { if (!props.busy) props.onClose(); }}>
    <section className="flex max-h-[calc(100dvh-24px)] w-full max-w-[900px] flex-col overflow-hidden rounded-xl bg-white p-4 text-sm text-ink-primary sm:p-6">
      <header className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Resultados conservados</h2><p className="mt-1 text-xs text-ink-secondary">Copias de salida para comparar o guardar aparte. Pueden corresponder a cambios ya aplicados; no se reaplican al abrirlas.</p></div><button aria-label="Cerrar resultados" disabled={props.busy} className="grid min-h-11 min-w-11 place-items-center" onClick={props.onClose}><X size={18}/></button></header>
      {props.error && <p role="alert" className="my-2 text-red-800">{props.error}</p>}
      {props.warnings.map((warning,index) => <p role="status" className="my-2 text-xs" key={index}>{warning}</p>)}
      {!entry ? <p className="py-8">No hay resultados conservados en este dispositivo.</p> : <>
        <label className="my-4 flex flex-col gap-1 text-xs">Resultado<select aria-label="Elegir resultado" className="min-h-11 rounded border border-line bg-white px-2 text-sm" value={entry.result.id} onChange={event => { setSelectedId(event.target.value); setRemoveId(null); }}>
          {props.entries.map(({ result }) => <option key={result.id} value={result.id}>{result.projectName} · {new Date(result.receivedAt).toLocaleString()}</option>)}
        </select></label>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          <p className="mb-2 font-medium">{entry.result.projectName}</p><p className="text-xs leading-5">{entry.result.reason}</p>
          <p className="my-2 text-xs text-ink-secondary">{entry.stored ? "Conservado en este dispositivo hasta que lo quites. Sin borrado automático." : "Solo en esta sesión. No cierres la aplicación antes de conservarlo."}</p>
          {entry.error && <div className="my-2 text-xs"><p role="alert" className="text-red-800">{entry.error}</p><button disabled={props.busy} className="min-h-11 underline" onClick={() => void props.onRetry(entry)}>Reintentar conservación</button></div>}
          {entry.result.answer && <p className="my-3 whitespace-pre-wrap text-sm leading-6">{entry.result.answer}</p>}
          {entry.result.appliedPaths.length > 0 && <div className="my-3 text-xs"><p className="font-semibold">Cambios ya aplicados por el runtime</p><ul>{entry.result.appliedPaths.map((path,index) => <li key={index} className="break-words">{path}</li>)}</ul></div>}
          {entry.result.outputs.map(output => <article key={output.id} className="py-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{output.name}</h3><p className="text-xs leading-5 text-ink-secondary">{output.summary}</p></div>
              <button disabled={props.busy} className="min-h-11 rounded-full bg-brand-orange px-4 text-sm font-semibold text-white" onClick={() => { void props.onCopy(entry.result.id, output.id).then(path => { if (path) setCopies(current => ({ ...current, [`${entry.result.id}:${output.id}`]: path })); }); }}>Guardar copia</button></div>
            {copies[`${entry.result.id}:${output.id}`] && <p role="status" className="my-2 break-words text-xs">Copia guardada: {copies[`${entry.result.id}:${output.id}`]}</p>}
            <div className="mt-2 max-h-[400px] overflow-auto bg-panel/40 p-2 sm:p-4">{output.kind === "markdown" ? <ReadonlyMarkdownViewer markdown={output.markdown} ariaLabel={output.name} emptyMessage="Documento vacío"/> : output.kind === "image" ? <img alt={output.summary || output.name} src={`data:image/${output.format};base64,${output.dataBase64}`} className="mx-auto h-auto max-h-[360px] max-w-full object-contain"/> : output.content.pages.map(page => <HandwrittenResultPage key={page.id} page={page}/>)}</div>
          </article>)}
        </div>
        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          <button className="min-h-11 px-2" disabled={props.busy} onClick={() => void props.onReload()}>Actualizar</button>
          {removeId === entry.result.id ? <div className="flex flex-wrap items-center gap-2"><span>Se quitará esta copia del resultado.</span><button className="min-h-11 px-2" disabled={props.busy} onClick={() => setRemoveId(null)}>Cancelar</button><button className="min-h-11 px-2 text-red-800" disabled={props.busy} onClick={() => void props.onRemove(entry.result.id).then(() => setRemoveId(null))}>Quitar resultado</button></div> : <button className="min-h-11 px-2" disabled={props.busy} onClick={() => setRemoveId(entry.result.id)}>Quitar de la revisión…</button>}
        </footer>
      </>}
      {!entry && <footer className="mt-4 text-xs"><button className="min-h-11 px-2" disabled={props.busy} onClick={() => void props.onReload()}>Actualizar</button></footer>}
    </section>
  </ModalFrame>;
}
function HandwrittenResultPage({ page }: { page: HandwrittenNotePage }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current, context = element?.getContext("2d");
    if (!element || !context) return;
    const width = Math.max(1, Math.min(1200, page.size.width)), scale = width / Math.max(1, page.size.width);
    element.width = width; element.height = Math.max(1, Math.min(2400, page.size.height * scale));
    context.scale(scale, scale); drawPageBackground(context, page);
    for (const stroke of page.strokes) drawStroke(context, stroke);
  }, [page]);
  return <canvas ref={canvas} role="img" aria-label={page.title || "Página de la nota a mano propuesta"} className="my-2 h-auto max-w-full bg-white"/>;
}
