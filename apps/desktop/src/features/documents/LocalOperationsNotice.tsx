import {useEffect,useId,useRef,useState,useSyncExternalStore} from "react";
import {Activity,LoaderCircle,X} from "lucide-react";
import {getRuntimeContinuity,cancelLocalOperation,dismissLocalOperation,getLocalOperations,localOperationDiagnostic,refreshLocalOperations,subscribeLocalOperations} from "../../lib/runtime/localOperations";
import {isTauriRuntime} from "../../lib/runtime/platform";
import type {OperationPhase} from "../../types/operations";
import {ModalFrame} from "../../components/ui/ModalFrame";

const labels:Record<OperationPhase,string>={queued:"En espera",running:"En curso",succeeded:"Terminada",failed:"Finalizada con error",cancelled:"Cancelada antes de empezar",expired:"No llegó a empezar",unknown:"Resultado sin confirmar"};
export function LocalOperationsNotice({assistantStatus,open:controlledOpen,onClose,onAttentionChange,fallbackFocus}:{assistantStatus?:string;open?:boolean;onClose?:()=>void;onAttentionChange?:(attention:boolean)=>void;fallbackFocus?:()=>HTMLElement|null}={}){
  useEffect(()=>{if(isTauriRuntime())void refreshLocalOperations(true).catch(()=>{/* The runtime remains usable if observation is unavailable. */});},[]);
  const operations=useSyncExternalStore(subscribeLocalOperations,getLocalOperations,getLocalOperations);
  const [localOpen,setLocalOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[visible,setVisible]=useState(false),[issue,setIssue]=useState<string|null>(null),[checking,setChecking]=useState(false);
  const open=controlledOpen ?? localOpen;
  function setOpen(next:boolean){if(controlledOpen===undefined)setLocalOpen(next);else if(!next)onClose?.();}
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLElement>(null);
  const panelId=useId();
  useEffect(()=>{
    if(!open)return;
    panel.current?.focus({preventScroll:true});
    const outside=(event:PointerEvent)=>{if(controlledOpen===undefined&&!root.current?.contains(event.target as Node))setOpen(false);};
    window.addEventListener("pointerdown",outside);
    return()=>window.removeEventListener("pointerdown",outside);
  },[open]);
  function close(){setOpen(false);trigger.current?.focus({preventScroll:true});}
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
  const summary=uncertain.length?`${uncertain.length} por revisar${pending.length?` · ${pending.length} pendientes`:""}`:visible?`${pending.length} operaciones en curso`:"Sin tareas pendientes";
  const attention=uncertain.length>0||continuityUnavailable;
  useEffect(()=>onAttentionChange?.(attention),[attention,onAttentionChange]);
  const details=open&&<aside ref={panel} id={panelId} tabIndex={-1} aria-label="Operaciones del espacio" className={controlledOpen===undefined?"workspace-operations-popover":"workspace-operations-dialog"}>
    <header className="flex shrink-0 items-center gap-2"><h2 className="min-w-0 flex-1 text-sm font-semibold">Actividad</h2><button aria-label="Cerrar actividad" title="Cerrar actividad" onClick={close}><X size={16}/></button></header>
    <p className="my-2 text-xs text-ink-secondary">{summary}</p>
    {assistantStatus&&<p className="mb-2 text-xs text-ink-secondary">{assistantStatus}</p>}
    {continuityUnavailable&&<p role="status" className="text-xs text-ink-secondary">El registro entre sesiones no está disponible. Puedes seguir trabajando; revisa los resultados en su sección antes de repetirlos.</p>}
    <div className="flex min-h-0 flex-1 flex-col pb-2">
      {!continuityUnavailable&&!issue&&<p className="mb-2 shrink-0 text-xs leading-5 text-ink-secondary">Revisa el resultado en su documento o sección antes de repetirlo. Puedes seguir editando.</p>}
      {issue&&<p role="alert" className="mb-2 shrink-0 text-xs leading-5">{issue}</p>
}
      <ul className="min-h-0 flex-1 overflow-y-auto">{shown.map(entry=><li key={entry.id} className="flex flex-wrap items-center gap-2 py-1"><div className="min-w-0 flex-1"><p className="text-xs font-medium">{entry.label}</p><p className="text-xs text-ink-secondary">{entry.cancelRequested&&entry.phase==="running"?"Detención solicitada · esperando punto seguro":entry.stoppedAfterStart?"Detenida antes de publicar":labels[entry.phase]}{entry.stage&&entry.phase==="running"?` · ${{preparing:"preparando","waiting-remote":"esperando respuesta",validating:"comprobando",publishing:"publicando",observing:"comprobando resultado"}[entry.stage]}`:""}{entry.unconfirmed&&entry.phase!=="unknown"?" · revisa el resultado":""}</p></div>{entry.cancellable&&<button className="min-h-11 rounded px-3 text-xs hover:bg-brand-hover" onClick={()=>void cancel(entry.id)}>{entry.phase==="running"?"Solicitar detención":"Cancelar en espera"}</button>}{!["queued","running"].includes(entry.phase)&&<button className="min-h-11 rounded px-3 text-xs hover:bg-brand-hover" onClick={()=>dismissLocalOperation(entry.id)}>Quitar aviso</button>}</li>)}{history.length>0&&<li><button className="min-h-11 rounded px-3 text-xs text-ink-secondary hover:bg-brand-hover" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(!historyOpen)}>{historyOpen?"Ocultar finalizadas":`Ver finalizadas (${history.length})`}</button></li>}</ul>
      <div className="flex shrink-0 flex-wrap"><button disabled={checking} className="min-h-11 rounded px-3 text-xs font-semibold text-brand-orange hover:bg-brand-hover disabled:opacity-50" onClick={()=>void refresh()}>{checking?"Comprobando…":"Comprobar estado"}</button><button className="min-h-11 rounded px-3 text-xs hover:bg-brand-hover" onClick={()=>void copy()}>Copiar diagnóstico</button></div>
    </div>
    </aside>;
  if(controlledOpen!==undefined)return open?<ModalFrame label="Actividad" onClose={close} fallbackFocus={fallbackFocus}><section className="w-[min(520px,calc(100vw-24px))] rounded-xl border border-line bg-white p-5 shadow-menu">{details}</section></ModalFrame>:null;
  return <div ref={root} className="workspace-operations" onKeyDown={event=>{if(open&&event.key==="Escape"&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();close();}}} onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}}>
    <button ref={trigger} className="relative" aria-label="Actividad" title={`Actividad · ${assistantStatus??summary}`} aria-expanded={open} aria-controls={panelId} onClick={()=>open?close():setOpen(true)}>
      {visible||assistantStatus==="IA en curso"?<LoaderCircle size={17} className="animate-spin motion-reduce:animate-none"/>:<Activity size={17}/>}
      {attention&&<span className="workspace-result-count" aria-hidden="true">!</span>}
    </button>
    <span className="sr-only" role="status">{assistantStatus ? `${assistantStatus}. ` : ""}{attention||visible?summary:""}{continuityUnavailable?". El registro entre sesiones no está disponible. Revisa Actividad.":""}</span>
    {details}
  </div>;
}
