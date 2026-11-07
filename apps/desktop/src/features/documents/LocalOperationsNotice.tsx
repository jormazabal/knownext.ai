import {useEffect,useState,useSyncExternalStore} from "react";
import {getRuntimeContinuity,cancelLocalOperation,dismissLocalOperation,getLocalOperations,localOperationDiagnostic,refreshLocalOperations,subscribeLocalOperations} from "../../lib/runtime/localOperations";
import {isTauriRuntime} from "../../lib/runtime/platform";
import type {OperationPhase} from "../../types/operations";

const labels:Record<OperationPhase,string>={queued:"En espera",running:"En curso",succeeded:"Terminada",failed:"Finalizada con error",cancelled:"Cancelada antes de empezar",expired:"No llegó a empezar",unknown:"Resultado sin confirmar"};
export function LocalOperationsNotice(){
  useEffect(()=>{if(isTauriRuntime())void refreshLocalOperations(true).catch(()=>{/* The runtime remains usable if observation is unavailable. */});},[]);
  const operations=useSyncExternalStore(subscribeLocalOperations,getLocalOperations,getLocalOperations);
  const [open,setOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[visible,setVisible]=useState(false),[issue,setIssue]=useState<string|null>(null),[checking,setChecking]=useState(false);
  const pending=operations.filter(entry=>entry.phase==="queued"||entry.phase==="running");
  const uncertain=operations.filter(entry=>entry.unconfirmed||entry.phase==="unknown");
  const relevant=operations.filter(entry=>entry.phase==="queued"||entry.phase==="running"||entry.unconfirmed||entry.phase==="unknown");
  const history=operations.filter(entry=>!relevant.includes(entry));
  const shown=[...relevant.slice().reverse(),...(historyOpen?history.slice().reverse():[])];
  const nativePending=operations.some(entry=>entry.native&&(entry.phase==="queued"||entry.phase==="running"||entry.unconfirmed));
  useEffect(()=>{if(!pending.length){setVisible(false);return;}const timer=setTimeout(()=>setVisible(true),750);return()=>clearTimeout(timer);},[pending.length>0]);
  useEffect(()=>{
    if(!nativePending)return;
    let live=true;
    const refresh=()=>{void refreshLocalOperations().catch(()=>{if(live)setIssue("No se pudo comprobar el estado. No se han repetido las operaciones.");});};
    refresh();const timer=setInterval(refresh,2500);window.addEventListener("focus",refresh);
    return()=>{live=false;clearInterval(timer);window.removeEventListener("focus",refresh);};
  },[nativePending]);
  async function refresh(){setChecking(true);try{await refreshLocalOperations(true);setIssue(null);}catch{setIssue("No se pudo comprobar el estado. No se han repetido las operaciones.");}finally{setChecking(false);}}
  async function cancel(id:string){try{if(!await cancelLocalOperation(id))setIssue(getLocalOperations().find(e=>e.id===id)?.cancelRequested?null:"El trabajo no admite detención en esta etapa o no se pudo confirmar. Comprueba su estado.");else setIssue(null);}catch{setIssue("No se ha confirmado la cancelación. El trabajo puede seguir en curso.");}}
  async function copy(){try{await navigator.clipboard.writeText(localOperationDiagnostic());setIssue("Diagnóstico copiado sin documentos, nombres, rutas o contenido de las peticiones.");}catch{setIssue("No se pudo copiar el diagnóstico. Puedes seguir trabajando.");}}
  const continuityUnavailable=getRuntimeContinuity()===false;
  if(!visible&&!uncertain.length&&!open&&!continuityUnavailable)return null;
  return <aside aria-label="Operaciones del espacio" className="flex max-h-[45dvh] shrink-0 flex-col bg-panel px-4 py-1 text-sm">
    <div className="flex shrink-0 flex-wrap items-center gap-2"><p role="status" className="min-w-0 flex-1 text-xs text-ink-secondary">{uncertain.length?`${uncertain.length} por revisar${pending.length?` · ${pending.length} pendiente${pending.length===1?"":"s"}`:""}`:`${pending.length} operación${pending.length===1?"":"es"} pendiente${pending.length===1?"":"s"}`}</p><button className="min-h-11 rounded px-3 text-xs font-semibold hover:bg-brand-hover" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?"Ocultar tareas":"Ver tareas"}</button></div>
    {continuityUnavailable&&<p role="status" className="text-xs text-ink-secondary">El registro entre sesiones no está disponible. Puedes seguir trabajando; revisa los resultados en su sección antes de repetirlos.</p>}
    {open&&<div className="flex min-h-0 flex-1 flex-col pb-2">
      {!continuityUnavailable&&!issue&&<p className="mb-2 shrink-0 text-xs leading-5 text-ink-secondary">Revisa el resultado en su documento o sección antes de repetirlo. Puedes seguir editando.</p>}
      {issue&&<p role="alert" className="mb-2 shrink-0 text-xs leading-5">{issue}</p>}
      <ul className="min-h-0 flex-1 overflow-y-auto">{shown.map(entry=><li key={entry.id} className="flex flex-wrap items-center gap-2 py-1"><div className="min-w-0 flex-1"><p className="text-xs font-medium">{entry.label}</p><p className="text-xs text-ink-secondary">{entry.cancelRequested&&entry.phase==="running"?"Detención solicitada · esperando punto seguro":entry.stoppedAfterStart?"Detenida antes de publicar":labels[entry.phase]}{entry.stage&&entry.phase==="running"?` · ${{preparing:"preparando","waiting-remote":"esperando respuesta",validating:"comprobando",publishing:"publicando",observing:"comprobando resultado"}[entry.stage]}`:""}{entry.unconfirmed&&entry.phase!=="unknown"?" · revisa el resultado":""}</p></div>{entry.cancellable&&<button className="min-h-11 rounded px-3 text-xs hover:bg-brand-hover" onClick={()=>void cancel(entry.id)}>{entry.phase==="running"?"Solicitar detención":"Cancelar en espera"}</button>}{!["queued","running"].includes(entry.phase)&&<button className="min-h-11 rounded px-3 text-xs hover:bg-brand-hover" onClick={()=>dismissLocalOperation(entry.id)}>Quitar aviso</button>}</li>)}{history.length>0&&<li><button className="min-h-11 rounded px-3 text-xs text-ink-secondary hover:bg-brand-hover" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(!historyOpen)}>{historyOpen?"Ocultar finalizadas":`Ver finalizadas (${history.length})`}</button></li>}</ul>
      <div className="flex shrink-0 flex-wrap"><button disabled={checking} className="min-h-11 rounded px-3 text-xs font-semibold text-brand-orange hover:bg-brand-hover disabled:opacity-50" onClick={()=>void refresh()}>{checking?"Comprobando…":"Comprobar estado"}</button><button className="min-h-11 rounded px-3 text-xs hover:bg-brand-hover" onClick={()=>void copy()}>Copiar diagnóstico</button></div>
    </div>}
  </aside>;
}
