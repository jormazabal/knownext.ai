import { useEffect, useRef, useState } from "react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { getApiErrorMessage } from "../../lib/api/client";
import { prepareFileBatch, executeFileBatch, getFileBatch, cancelFileBatch } from "../../lib/api/fileBatches";
import type { DocumentTreeNode } from "../../types/domain";
import type { FileBatchAction, FileBatchPlan } from "../../types/fileBatch";

const actionTitles={move:"Mover selección",trash:"Enviar selección a la papelera",duplicate:"Duplicar selección",rename:"Renombrar selección",context:"Añadir selección al contexto IA"};
export function FileBatchDialog({ projectId, action, nodeIds, folders, nodes=[], initialTargetFolderId=null, beforeExecute, onApplied, onClose }: {
  projectId: string; action: FileBatchAction; nodeIds: string[]; folders: DocumentTreeNode[];
  nodes?:DocumentTreeNode[];initialTargetFolderId?:string|null;
  beforeExecute: () => Promise<boolean>; onApplied: (plan: FileBatchPlan) => void; onClose: () => void;
}) {
  const [target, setTarget] = useState(initialTargetFolderId??"");
  const flat=(items:DocumentTreeNode[]):DocumentTreeNode[]=>items.flatMap(item=>[item,...flat(item.children??[])]);
  const selected=flat(nodes).filter(node=>nodeIds.includes(node.id));
  const roots=selected.filter(node=>!selected.some(parent=>parent.type==="folder"&&node.path?.startsWith((parent.path??parent.name)+"/")));
  const [names,setNames]=useState<Record<string,string>>(()=>Object.fromEntries(roots.map(node=>[node.id,node.name])));
  const [uncertain,setUncertain]=useState(false);
  const [plan, setPlan] = useState<FileBatchPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [executing,setExecuting]=useState(false);
  const [stopNotice,setStopNotice]=useState("");
  const [stopRequested,setStopRequested]=useState(false);
  const stopPending=useRef(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function run() {
    if (pending.current||uncertain) return;
    pending.current = true; setBusy(true); setError("");
    try {
      if (!plan) setPlan(await prepareFileBatch(projectId, action, nodeIds, target || null,action==="rename"?names:undefined));
      else {
        if (!await beforeExecute()) { setError("Revisión cancelada o borradores sin proteger. La operación no ha comenzado."); return; }
        if(!alive.current)return;
        let polling = true;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
          try { const progress = await getFileBatch(projectId,plan.id); if (polling) setPlan(progress); }
          catch { /* The execution response owns the outcome; polling is read-only. */ }
          if (polling) timer = setTimeout(() => void poll(),500);
        };
        timer = setTimeout(() => void poll(),500);
        setExecuting(true);
        try { const result = await executeFileBatch(projectId,plan.id); setPlan(result); onApplied(result); }
        catch(failure){setUncertain(true);try{const observed=await getFileBatch(projectId,plan.id);setPlan(observed);if(observed.state!=="prepared"){setUncertain(false);onApplied(observed);setError(observed.state==="completed"?"":"El registro confirma una operación iniciada que requiere revisión. No se repite.");return;}}catch{/* Keep the unknown outcome visible; never replay. */}throw failure;}
        finally { polling = false; clearTimeout(timer);setExecuting(false); }
      }
    } catch (failure) { setError(getApiErrorMessage(failure,"No se ha podido completar la operación. Revisa el estado de los archivos.")); }
    finally { pending.current = false; setBusy(false); }
  }
  async function stop(){
    if(!plan||!executing||stopPending.current)return;
    stopPending.current=true;setStopRequested(true);setStopNotice("Solicitando detención…");
    try{const response=await cancelFileBatch(projectId,plan.id);setStopNotice(response.requested?"Detención solicitada. Se terminará el elemento en curso; lo aplicado se conserva.":"No se confirma una ejecución activa. Se está consultando el resultado.");}
    catch{setStopNotice("No se ha podido confirmar la detención. Sigue observando el resultado; la operación puede continuar.");}
  }
  const reviewed = plan?.state === "prepared";
  const finished = Boolean(plan && !reviewed && !busy);
  const labels = { applied: "Completado", pending: busy ? "Pendiente" : "Sin ejecutar", running: busy ? "En curso" : "Revisar tras interrupción", attention: "Requiere revisión" };
  return <ModalFrame label={actionTitles[action]} onClose={() => { if (!pending.current) onClose(); }}>
    <section className="flex max-h-[calc(100dvh-24px)] w-full max-w-[560px] flex-col rounded-xl bg-white p-5 shadow-menu">
      <h2 className="text-base font-semibold">{actionTitles[action]}</h2>
      <p className="mt-1 text-sm text-ink-secondary">{nodeIds.length} seleccionados · {action==="duplicate"?"Se duplica lo guardado, sin sustituir originales ni sus borradores. Hasta 128 MiB y 10.000 entradas en la selección.":action==="context"?"Las carpetas aportan sus archivos visibles. Lectura local; no se envía nada a IA hasta que ejecutes un prompt.":action==="rename"?"Los nombres sin cambios se conservan; los descendientes siguen a sus carpetas.":action === "trash" ? "Podrás restaurarlos desde la papelera del proyecto." : "Se comprobarán los destinos antes de mover."}</p>
      {action==="rename"&&!plan&&<div className="mt-3 min-h-0 overflow-y-auto space-y-3">{roots.map(node=><label key={node.id} className="block text-xs"><span className="block break-all text-ink-secondary">{node.path??node.name}</span><input aria-label={`Nuevo nombre de ${node.name}`} value={names[node.id]??node.name} disabled={busy} onChange={event=>setNames(current=>({...current,[node.id]:event.target.value}))} className="mt-1 min-h-11 w-full rounded border border-line bg-white px-2 text-sm"/></label>)}</div>}
      {action === "move" && <label className="mt-4 text-sm">Carpeta de destino
        <select data-autofocus disabled={busy || finished || uncertain} value={target} onChange={event => { setTarget(event.target.value); setPlan(null); setError(""); }} className="mt-1 min-h-11 w-full rounded border border-line bg-white px-2">
          <option value="">Raíz del proyecto</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.path || folder.name}</option>)}
        </select>
      </label>}
      {plan && <div className="mt-4 min-h-0 overflow-y-auto text-sm">
        <p className="mb-2 font-medium">{plan.items.length} operaciones{plan.selectedCount > plan.items.length ? " · los descendientes ya están incluidos en sus carpetas" : ""}</p>
        <ul className="space-y-2">{plan.items.map(item => <li key={item.nodeId} className="rounded bg-panel p-2">
          <p className="break-all">{item.path}</p>{item.destination && <p className="break-all text-ink-secondary">→ {item.destination}</p>}
          {(finished || busy && plan.state !== "prepared") && <p className="mt-1 font-medium">{labels[item.state]}</p>}{item.error && <p className="text-red-700">{item.error}</p>}
        </li>)}</ul>
      </div>}
      {finished && <p role="status" className="mt-3 text-sm">{plan?.state === "completed" ? "Operación completada." : "El lote necesita revisión. Los elementos inciertos no se volverán a ejecutar automáticamente."}</p>}
      {finished && plan?.referencesPending && <p role="status" className="mt-2 text-sm">Hay referencias pendientes de comprobar tras los movimientos. Revisa los enlaces y recursos de los documentos antes de continuar.</p>}
      {plan?.error && <p role="alert" className="mt-2 text-sm text-red-700">{plan.error}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {uncertain&&<p role="status" className="mt-2 text-sm">No se confirmó el resultado. Consulta el estado antes de iniciar otra operación; no se repetirá automáticamente.</p>}
      {uncertain&&!busy&&plan&&<button className="min-h-11 text-sm underline" onClick={()=>{void getFileBatch(projectId,plan.id).then(observed=>{setPlan(observed);if(observed.state!=="prepared"){setUncertain(false);setError("");onApplied(observed);}else setError("El registro sigue preparado. Cierra y revisa de nuevo la selección antes de ejecutar.");}).catch(failure=>setError(getApiErrorMessage(failure,"No se pudo consultar el resultado")));}}>Consultar resultado</button>}
      {reviewed&&!busy&&!uncertain&&<button className="mt-2 min-h-11 self-start rounded px-2 text-sm underline" onClick={() => {setPlan(null);setError("");}}>Volver a revisar la selección</button>}
      {busy && <p role="status" className="mt-3 text-sm">{plan ? executing?`Aplicando… ${plan.items.filter(item => item.state === "applied").length}/${plan.items.length}`:"Protegiendo borradores…" : "Comprobando la selección…"}</p>}
      {executing&&stopNotice&&<p role="status" className="mt-2 text-sm">{stopNotice}</p>}
      <footer className="mt-5 flex flex-wrap justify-end gap-2">
        {executing&&<button disabled={stopRequested} className="min-h-11 rounded px-3 text-sm text-brand-orange hover:bg-brand-hover disabled:opacity-50" onClick={()=>void stop()}>{stopRequested?"Detención en revisión":"Detener lote"}</button>}
        <button disabled={busy} className="min-h-11 rounded px-3 hover:bg-panel" onClick={onClose}>{finished ? "Cerrar" : "Cancelar"}</button>
        {!finished && !executing && <button disabled={busy||uncertain} className="min-h-11 rounded bg-brand-orange px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void run()}>{reviewed ? (action === "move" ? "Confirmar movimiento" :action==="trash"? "Confirmar papelera":action==="rename"?"Confirmar nombres":action==="context"?"Añadir al contexto":"Duplicar lo guardado") : "Revisar operación"}</button>}
      </footer>
    </section>
  </ModalFrame>;
}
