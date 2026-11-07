import {useEffect,useRef,useState} from "react";
import {getPreviewCleanupInventory,cleanupPreviewReceipts} from "../../lib/api/previewCleanup";
import {getApiErrorMessage} from "../../lib/api/client";
import type {PreviewCleanupInventory,PreviewCleanupResult} from "../../types/previewCleanup";

/** Selection and confirmed outcomes are distinct; uncertain mutations are never replayed. */
export function PreviewCleanupPanel({english=false}:{english?:boolean}){
  const[inventory,setInventory]=useState<PreviewCleanupInventory|null>(null);
  const[selected,setSelected]=useState<Set<string>>(new Set());
  const[busy,setBusy]=useState(false);const[error,setError]=useState("");
  const[result,setResult]=useState<PreviewCleanupResult|null>(null);
  const[needsReview,setNeedsReview]=useState(false);
  const mounted=useRef(true);const inFlight=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function review(){
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError("");
    try{const next=await getPreviewCleanupInventory();if(!mounted.current)return;
      setInventory(next);setSelected(previous=>new Set([...previous].filter(id=>next.entries.some(e=>e.id===id))));setNeedsReview(false);
    }catch(cause){if(mounted.current)setError(getApiErrorMessage(cause,english?"The previous review is preserved.":"Se conserva la revisión anterior."));}
    finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  async function apply(){
    if(inFlight.current||needsReview||!inventory||!selected.size)return;
    const entries=inventory.entries.filter(e=>selected.has(e.id)).map(({id,revision})=>({id,revision}));
    if(!entries.length||entries.length>inventory.limits.selection)return;
    inFlight.current=true;setBusy(true);setError("");setResult(null);
    try{const next=await cleanupPreviewReceipts(entries);if(!mounted.current)return;setResult(next);
      const deleted=new Set(next.outcomes.filter(o=>o.status==="deleted").map(o=>o.id));
      setInventory(previous=>previous?{...previous,entries:previous.entries.filter(e=>!deleted.has(e.id))}:null);
      setSelected(previous=>new Set([...previous].filter(id=>!deleted.has(id))));
    }catch(cause){if(mounted.current)setError(getApiErrorMessage(cause,english?"Confirmation was not received. Review again before continuing.":"No se recibió la confirmación. Revisa de nuevo antes de continuar."));}
    finally{inFlight.current=false;if(mounted.current){setBusy(false);setNeedsReview(true);}}
  }
  const maximum=inventory?.limits.selection??64;
  const outcomeCopy={changed:english?"Changed since review":"Cambió desde la revisión",unavailable:english?"Receipt or source unavailable":"Recibo o fuente no disponible",preserved:english?"Could not remove; preserved":"No se pudo eliminar; conservado","budget-exceeded":english?"Review limit reached":"Límite de revisión alcanzado"};
  return <section aria-label={english?"Preview metadata cleanup":"Limpieza de metadatos de vistas"} className="mt-4 border-t border-line pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-sm font-medium">{english?"Preview metadata":"Metadatos de vistas previas"}</h5><button type="button" disabled={busy} onClick={()=>void review()} className="min-h-11 rounded px-3 text-xs font-medium text-brand-dark hover:bg-brand-hover disabled:opacity-50">{busy?(english?"Working…":"Procesando…"):inventory?(english?"Review again":"Revisar de nuevo"):(english?"Review preview metadata":"Revisar metadatos de vistas")}</button></div>
    <p className="text-xs leading-5 text-ink-secondary">{english?"Only local preview receipts. Source documents, drafts, trash, audio and indexes are preserved. Open previews may need the original file to be reopened.":"Solo recibos locales de vistas. Se conservan documentos originales, borradores, papelera, audio e índices. Una vista abierta puede requerir volver a abrir el archivo original."}</p>
    {error&&<p role="alert" className="mt-2 text-xs leading-5 text-red-700">{error}</p>}
    {result&&<div role="status" className="mt-3 rounded bg-white p-3 text-xs leading-5"><p>{english?"Confirmed removal":"Eliminación confirmada"}: {result.outcomes.filter(o=>o.status==="deleted").length} · {result.deletedBytes.toLocaleString(english?"en-US":"es-ES")} B {english?"of metadata":"de metadatos"}.</p>{result.outcomes.some(o=>o.status!=="deleted")&&<><p>{english?"Some receipts were preserved. Review again to check their current state.":"Se han conservado recibos. Revisa de nuevo para consultar su estado actual."}</p><ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">{result.outcomes.filter(o=>o.status!=="deleted").map(outcome=><li key={outcome.id} className="break-words [overflow-wrap:anywhere]">{inventory?.entries.find(e=>e.id===outcome.id)?.path??(english?"Preview":"Vista previa")} · {outcome.status!=="deleted"&&outcomeCopy[outcome.status]}</li>)}</ul></>}<details className="mt-2 text-ink-secondary"><summary className="min-h-11 cursor-pointer py-3">{english?"Operation reference":"Referencia de operación"}</summary><p className="break-words [overflow-wrap:anywhere]">{result.id}</p></details></div>}
    {needsReview&&<p role="status" className="mt-2 text-xs leading-5 text-ink-secondary">{english?"Review again before another removal. An uncertain operation is never repeated automatically.":"Revisa de nuevo antes de otra eliminación. Una operación sin confirmación no se repite automáticamente."}</p>}
    {inventory&&<div className="mt-3">
      <p className="mb-2 text-xs leading-5 text-ink-secondary">{inventory.entries.length} {english?(inventory.entries.length===1?"eligible receipt":"eligible receipts"):(inventory.entries.length===1?"recibo revisable":"recibos revisables")} · {inventory.skipped} {english?"omitted":inventory.skipped===1?"omitido":"omitidos"}. {inventory.limited&&(english?"Partial review: limits reached.":"Revisión parcial: se ha alcanzado un límite.")} {english?"Logical metadata size, not document size or guaranteed free space.":"Tamaño lógico de metadatos, no del documento ni espacio libre garantizado."}</p>
      <ul className="max-h-72 space-y-1 overflow-y-auto overscroll-contain rounded bg-white">{inventory.entries.map(entry=><li key={entry.id}><label className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2 text-xs"><input type="checkbox" className="mt-1 shrink-0 accent-brand-dark" checked={selected.has(entry.id)} disabled={busy||needsReview||(!selected.has(entry.id)&&selected.size>=maximum)} onChange={()=>setSelected(previous=>{const next=new Set(previous);if(next.has(entry.id))next.delete(entry.id);else next.add(entry.id);return next;})}/><span className="min-w-0 flex-1"><span className="block break-words [overflow-wrap:anywhere] font-medium">{entry.path}</span><span className="block break-words [overflow-wrap:anywhere] text-ink-secondary">{entry.projectName??(english?"Project":"Proyecto")} · {entry.bytes.toLocaleString(english?"en-US":"es-ES")} B</span><span className="block text-ink-secondary">{new Date(entry.generatedAt).toLocaleString(english?"en-US":"es-ES")}</span></span></label></li>)}</ul>
      {!inventory.entries.length&&<p className="py-3 text-xs">{english?"No eligible preview receipts were found in this review.":"No hay recibos de vistas aptos en esta revisión."}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-ink-secondary">{selected.size}/{maximum} {english?"selected":selected.size===1?"seleccionado":"seleccionados"}</p><button type="button" onClick={()=>void apply()} disabled={busy||needsReview||!selected.size} className="min-h-11 rounded bg-brand-dark px-3 text-xs font-medium text-white disabled:opacity-50">{english?"Delete selected receipts":"Eliminar recibos seleccionados"}</button></div>
    </div>}
  </section>;
}
