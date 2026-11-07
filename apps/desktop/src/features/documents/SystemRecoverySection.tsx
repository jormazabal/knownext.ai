import {useId} from "react";
import {ArrowLeft,Download,Eye,RefreshCw} from "lucide-react";
import {useSystemRecovery} from "./useSystemRecovery";
export function SystemRecoverySection({onReviewCohort}:{onReviewCohort?:(id:string)=>void}){
  const state=useSystemRecovery(),id=useId(),groups=[...new Map(state.inventory?.items.map(copy=>[copy.group,copy.groupLabel])).entries()];
  const review=state.review;
  return <section aria-label="Copias de sistema" className="pb-3 text-sm">
    <header className="flex flex-wrap items-center justify-between gap-2"><h3 className="sr-only font-semibold sm:not-sr-only">Copias de sistema</h3><button type="button" disabled={!!state.busy} onClick={()=>void state.refresh()} className="ml-auto flex min-h-11 items-center gap-2 rounded px-2 hover:bg-panel disabled:opacity-50"><RefreshCw size={15}/>Actualizar copias</button></header>
    <p className="mt-2 text-xs leading-5 text-ink-secondary">Originales conservados de consumo, grabación, configuración y migraciones. Consultar no modifica archivos. Estas copias pueden contener información privada.</p>
    {state.error&&<p role="alert" className="mt-3 break-words text-red-700">{state.error}{state.inventory&&!review?" Se conserva el inventario anterior; el estado actual no está confirmado.":""}</p>}{state.message&&<p role="status" className="mt-3 break-words leading-6">{state.message}</p>}
    {state.busy&&<p role="status" className="mt-3">{state.busy==="export"?"Eligiendo destino y conservando la copia…":state.busy==="review"?"Revisando la copia elegida…":"Consultando copias conservadas…"}</p>}
    {review?<>
      <button type="button" disabled={state.busy==="export"} onClick={state.back} className="mt-2 flex min-h-11 items-center gap-2 rounded px-2 hover:bg-panel"><ArrowLeft size={15}/>Volver a las copias</button>
      <h4 className="mt-2 break-words font-semibold">{review.groupLabel}</h4><p className="mt-1 break-all text-xs text-ink-secondary">{review.name}</p>
      <p className="mt-3 leading-6">{review.summary.message}</p>
      {review.summary.entries!==undefined&&review.summary.entries!==null&&<p className="mt-2">{review.summary.entries} registros conservados en esta copia.</p>}
      {review.summary.fragments!==undefined&&<p className="mt-2">{review.summary.completedFragments??0} de {review.summary.fragments} fragmentos completados{review.summary.durationSeconds!==null&&review.summary.durationSeconds!==undefined?` · ${review.summary.durationSeconds} s capturados`:""}.</p>}
      <p className={`mt-3 text-xs leading-5 ${review.provenance==="digest-mismatch"?"text-red-700":"text-ink-secondary"}`}>{review.provenance==="verified-filename-digest"?"Los bytes coinciden con la huella registrada en el nombre de la copia.":review.provenance==="digest-mismatch"?"La huella del nombre no coincide con los bytes actuales. Se conserva para revisión, sin restaurar.":"Huella calculada para esta copia. No existe una huella de origen en su nombre que permita compararlas."}</p>
      <details className="mt-2 text-xs text-ink-secondary"><summary className="min-h-11 cursor-pointer py-3">Identificar esta revisión</summary><p>{size(review.byteLength)}</p><p className="break-all">SHA-256 · {review.fingerprint}</p></details>
      <p className="mt-2 text-xs leading-5 text-ink-secondary">Conservar como archivo nuevo guarda los bytes revisados. No sustituye el consumo, los recibos, la configuración ni las sesiones actuales.</p>
      <button type="button" disabled={!!state.busy||!review.canExport} onClick={()=>void state.deliver()} className="mt-2 flex min-h-11 items-center gap-2 rounded px-2 font-semibold text-brand-dark hover:bg-brand-hover disabled:opacity-50"><Download size={15}/>Conservar copia externa</button>
      {review.relatedRecoveryId&&onReviewCohort&&<button type="button" disabled={!!state.busy} onClick={()=>onReviewCohort(review.relatedRecoveryId!)} className="mt-2 min-h-11 rounded px-2 text-left text-brand-dark hover:bg-brand-hover disabled:opacity-50">Revisar punto de recuperación</button>}
    </>:state.inventory&&<>
      <label htmlFor={id} className="mt-3 block text-xs">Origen de las copias<select id={id} value={state.group} disabled={!!state.busy} onChange={event=>state.setGroup(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded border border-line bg-white px-2"><option value="">Todos los orígenes</option>{groups.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      {state.inventory.limited&&<p className="mt-3 text-xs leading-5">Inventario parcial por límite de tiempo o entradas. Los elementos no revisados permanecen en disco.</p>}
      {!state.busy&&!state.inventory.items.length&&<p className="mt-3 text-ink-secondary">No se han encontrado copias en los orígenes consultados.</p>}
      {state.inventory.items.filter(copy=>!state.group||copy.group===state.group).map(copy=><article key={copy.id} className="mt-3 py-2"><h4 className="font-semibold">{copy.groupLabel}</h4><p className="mt-1 break-all text-xs text-ink-secondary">{copy.name}</p><p className="mt-1 text-xs text-ink-secondary">{size(copy.byteLength)}{copy.modifiedAt?` · ${new Date(copy.modifiedAt).toLocaleDateString("es-ES")}`:""}</p>{copy.canReview?<button type="button" disabled={!!state.busy} onClick={()=>void state.inspect(copy)} className="mt-1 flex min-h-11 items-center gap-2 rounded px-2 hover:bg-panel disabled:opacity-50"><Eye size={15}/>Revisar copia</button>:<p className="mt-2 text-xs leading-5">Elemento no regular o fuera del límite de lectura. Se conserva sin abrirlo.</p>}</article>)}
      {!!state.inventory.warnings.length&&<details className="mt-3 text-xs text-ink-secondary"><summary className="min-h-11 cursor-pointer py-3">Orígenes sin revisión completa</summary><ul className="list-disc space-y-2 pl-4">{state.inventory.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>}
    </>}
  </section>;
}
function size(bytes:number){return new Intl.NumberFormat("es-ES").format(bytes)+" bytes";}
