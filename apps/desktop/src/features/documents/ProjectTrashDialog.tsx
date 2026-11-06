import { X } from "lucide-react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { useProjectTrash } from "./useProjectTrash";
import type { FileOperationResult } from "../../types/domain";

export function ProjectTrashDialog({ projectId, projectName, onRestored, onClose }: {
  projectId: string; projectName: string; onRestored: (result: FileOperationResult) => void; onClose: () => void;
}) {
  const { snapshot, selected, blocked, attempt, error, notice, loading, busy, review, restore, reload,verifyAttempt, clearReview } = useProjectTrash(projectId, onRestored);
  const attempts=Array.from(new Map([...(attempt?[attempt]:[]),...(snapshot.restorations??[])].map(item=>[item.id,item])).values());
  return <ModalFrame label="Papelera del proyecto" onClose={() => { if (!busy) onClose(); }}>
    <section className="flex max-h-[calc(100dvh-24px)] w-full max-w-[640px] flex-col overflow-hidden bg-white p-4 text-sm">
      <header className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Papelera</h2><p>{projectName}</p></div><button disabled={busy} aria-label="Cerrar papelera" className="min-h-9 min-w-9" onClick={onClose}><X size={18}/></button></header>
      <p className="my-3 text-xs text-ink-secondary">Los elementos se conservan en este proyecto, sin borrado automático. Restaurar nunca reemplaza un destino existente.</p>
      {error && <p role="alert" className="my-3 text-red-800">{error}</p>}
      {notice && <p role="status" className="mb-3">{notice}</p>}
      {snapshot.limited && <p role="status" className="mb-3 text-xs">Inventario parcial. Hay contenido que no se ha podido revisar; no se ha retirado.</p>}
      {Boolean(snapshot.warnings.length) && <details className="mb-3 text-xs"><summary>Avisos de esta revisión ({snapshot.warnings.length})</summary><div className="max-h-24 overflow-y-auto">{snapshot.warnings.map((warning,index) => <p className="break-words py-1" key={index}>{warning}</p>)}</div></details>}
      {loading ? <p role="status">Cargando papelera…</p> : null}
      {busy ? <p role="status">Comprobando operación…</p> : null}
      <div className="min-h-0 overflow-y-auto">
        {Boolean(attempts.length)&&<details className="mb-3 text-xs"><summary>Intentos de restauración ({attempts.length})</summary><p className="py-2 text-ink-secondary">Consultar contrasta el recibo y el destino actual. La fase del recibo no confirma por sí sola la restauración; no se repite ningún movimiento.</p>{attempts.map((item,index)=><article key={item.id} className="flex items-center justify-between gap-2 py-2"><div className="min-w-0"><p className="break-words font-semibold">{item.originalPath}</p><p>{item.phase==="completed"?"Recibo completado":"Recibo de publicación"} · {new Date(item.createdAt).toLocaleString()}</p></div><button disabled={busy||loading} className="min-h-11 shrink-0 px-2 disabled:opacity-50" aria-label={`Consultar intento ${index+1} de ${item.originalPath}`} onClick={()=>void verifyAttempt(item)}>Consultar</button></article>)}</details>}
        {Boolean(snapshot.batches?.length) && <section className="mb-4 rounded bg-panel p-3"><h3 className="font-semibold">Operaciones que revisar</h3><p className="my-2 text-xs text-ink-secondary">El registro conserva los resultados tras una interrupción. Comprueba los archivos y destinos antes de preparar otra operación; no se repetirá ningún movimiento automáticamente.</p>{snapshot.batches?.map(batch => <details key={batch.id} className="py-2"><summary>{batch.action === "move" ? "Movimiento" : "Papelera"} · {new Date(batch.createdAt).toLocaleString()} · {batch.items.filter(item => item.state === "applied").length}/{batch.items.length} completados</summary>{batch.referencesPending && <p className="mt-2 text-xs">Hay referencias pendientes de comprobar tras los movimientos.</p>}{batch.error && <p className="mt-2 text-xs text-red-700">{batch.error}</p>}<ul className="mt-2 space-y-2">{batch.items.map(item => <li key={item.nodeId} className="break-all text-xs">{item.path}{item.destination ? ` → ${item.destination}` : ""}<br/>{item.state === "applied" ? "Completado" : item.state === "pending" ? "Sin ejecutar" : "Resultado pendiente de comprobar"}{item.error ? ` · ${item.error}` : ""}</li>)}</ul></details>)}</section>}
        {!loading && !snapshot.entries.length && !error ? <p className="py-6">{snapshot.limited ? "No se encontraron elementos en la parte revisada." : "La papelera está vacía."}</p> : null}
        {snapshot.entries.map(entry => <article key={entry.id} className="flex items-center justify-between gap-3 border-b border-line py-3">
          <div className="min-w-0"><h3 className="break-words font-semibold">{entry.originalPath}</h3><p className="text-xs text-ink-secondary">{entry.directory ? "Carpeta y contenido" : "Archivo"} · {new Date(entry.deletedAt).toLocaleString()}</p>{entry.status === "attention" && <p>Requiere atención: no se localiza el contenido conservado.</p>}</div>
          <button className="min-h-11 shrink-0 rounded border border-line px-3 disabled:opacity-50" disabled={busy || loading || blocked.has(entry.id) || entry.status !== "stored"} aria-label={`Revisar ${entry.originalPath}`} onClick={() => void review(entry.id)}>Revisar</button>
        </article>)}
      </div>
      {selected && <section className="mt-3 rounded bg-panel p-3" aria-label="Contenido revisado para restaurar"><h3 className="break-words font-semibold">{selected.entry.originalPath}</h3><p className="my-2 text-xs">Contenido y ubicación comprobados. Restaurar devuelve este elemento a su ruta original; si cambia o el destino está ocupado, se conservará sin reemplazarlo.</p><div className="flex flex-wrap gap-2"><button className="min-h-11 rounded bg-brand-orange px-3 text-white disabled:opacity-50" disabled={busy || loading} aria-label={`Restaurar ${selected.entry.originalPath}`} onClick={()=>void restore()}>Restaurar</button><button className="min-h-11 px-3" disabled={busy} onClick={clearReview}>Volver a la lista</button></div></section>}
      <footer className="mt-3"><button className="min-h-11 px-2" disabled={busy || loading} onClick={() => void reload()}>Actualizar</button></footer>
    </section>
  </ModalFrame>;
}
