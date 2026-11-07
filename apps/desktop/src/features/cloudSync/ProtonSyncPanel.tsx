import {useEffect,useRef,useState} from "react";
import {FolderOpen} from "lucide-react";
import {selectProjectFolder} from "../../lib/runtime/folders";
import * as api from "../../lib/api/protonSync";
import type {ProtonInbox,ProtonReceipt,ProtonReceiveReview,ProtonReview,ProtonStatus} from "../../types/protonSync";

export function ProtonSyncPanel({projectId,onBack,onBusyChange,initialStatus}:{projectId:string;onBack:()=>void|Promise<void>;onBusyChange?:(busy:boolean)=>void;initialStatus?:ProtonStatus}) {
  const [status,setStatus]=useState<ProtonStatus|null>(initialStatus??null);
  const [folder,setFolder]=useState(initialStatus?.binding?.folderPath??"");
  const [logicalId,setLogicalId]=useState("");
  const [review,setReview]=useState<ProtonReview|null>(null);
  const [inbox,setInbox]=useState<ProtonInbox|null>(null);
  const [receive,setReceive]=useState<ProtonReceiveReview|null>(initialStatus?.receiveReview??null);
  const [receipt,setReceipt]=useState<ProtonReceipt|null>(initialStatus?.lastReceipt??null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [disconnecting,setDisconnecting]=useState(false);
  const alive=useRef(true);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
  useEffect(()=>{heading.current?.focus();},[review,receive]);
  useEffect(()=>{
    alive.current=true;
    if(!initialStatus) void api.getProtonStatus(projectId).then(value=>{if(alive.current){setStatus(value);setFolder(value.binding?.folderPath??"");setReceive(value.receiveReview??null);setReceipt(value.lastReceipt??null);}}).catch(failure=>{if(alive.current)setError(message(failure));});
    return()=>{alive.current=false;};
  },[projectId,initialStatus]);
  async function run(work:()=>Promise<void>){if(busy)return;setBusy(true);setError("");onBusyChange?.(true);try{await work();}catch(failure){if(alive.current)setError(message(failure));}finally{onBusyChange?.(false);if(alive.current)setBusy(false);}}
  async function refresh(){const next=await api.getProtonStatus(projectId);if(alive.current){setStatus(next);setReceive(next.receiveReview??null);}}
  async function pick(){const selected=await selectProjectFolder(folder);if(selected){setFolder(selected);setReview(null);}}
  async function inspect(){const next=await api.reviewProton(projectId,folder,logicalId.trim()||undefined);if(alive.current)setReview(next);}
  async function connect(){if(!review?.canConnect||review.blockers.length)return;const next=await api.connectProton(projectId,review);if(alive.current){setReceipt(next);setReview(null);}await refresh();}
  async function publish(){const next=await api.publishProton(projectId);if(alive.current)setReceipt(next);await refresh();}
  async function scan(){const next=await api.getProtonInbox(projectId);if(alive.current)setInbox(next);}
  async function reviewReceive(publicationId:string){const next=await api.reviewProtonReceive(projectId,publicationId);if(alive.current)setReceive(next);}
  async function applyReceive(){if(!receive?.canApply)return;const next=await api.applyProtonReceive(projectId,receive);if(alive.current){setReceipt(next);setReceive(null);setInbox(null);}await refresh();}
  async function disconnect(){if(!status)return;const next=await api.disconnectProton(projectId,status.generation);if(alive.current){setReceipt(next);setInbox(null);setReceive(null);setDisconnecting(false);}await refresh();}
  const connected=Boolean(status?.binding);
  const pending=Boolean(status?.activeReceive||status?.activePublication);
  return <div className="min-h-0 overflow-y-auto px-5 py-4 text-sm leading-5" aria-busy={busy}>
    <h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">Proton Drive mediante su aplicación Windows</h3>
    <p className="mt-2 text-xs text-ink-secondary">Requiere la aplicación oficial Proton Drive configurada. El proyecto conserva su carpeta local; selecciona una carpeta de intercambio compartida entre tus equipos. KnowNext no solicita tu contraseña de Proton.</p>
    {!status&&!error&&<p role="status" className="mt-3">Consultando asociación…</p>}
    {status&&<p className="mt-3 text-xs text-ink-secondary">{status.detail}</p>}
    {pending&&<div className="mt-3 rounded bg-panel p-3 text-xs" role="alert"><p>Hay una operación anterior con resultado pendiente de consulta. Se conservan sus datos y no se repetirá automáticamente.</p><button type="button" disabled={busy} onClick={()=>void run(refresh)} className="mt-2 min-h-11 rounded px-3 font-medium hover:bg-white">Consultar estado</button></div>}
    {!connected&&status&&<>
      <ol aria-label="Configuración de Proton" className="my-3 flex flex-wrap gap-3 text-xs text-ink-secondary"><li aria-current={!review?"step":undefined}>1. Carpeta</li><li aria-current={review?"step":undefined}>2. Verificación</li><li>3. Conexión local</li></ol>
      {!review?<>
        <label htmlFor="proton-folder" className="mt-3 block font-medium">Carpeta de intercambio Proton Drive</label>
        <div className="mt-2 flex gap-2"><input id="proton-folder" value={folder} onChange={event=>setFolder(event.target.value)} disabled={busy} className="min-h-11 min-w-0 flex-1 rounded border border-line px-3 text-xs" placeholder="Carpeta sincronizada por la aplicación oficial"/><button type="button" disabled={busy} onClick={()=>void run(pick)} className="grid min-h-11 min-w-11 place-items-center rounded border border-line hover:bg-panel" aria-label="Seleccionar carpeta de intercambio"><FolderOpen size={18}/></button></div>
        <details className="mt-3 text-xs"><summary className="cursor-pointer py-2">Conectar con un proyecto de otro equipo</summary><label htmlFor="proton-logical-id" className="mt-2 block">ID del proyecto compartido</label><input id="proton-logical-id" value={logicalId} onChange={event=>setLogicalId(event.target.value)} disabled={busy} className="mt-1 min-h-11 w-full rounded border border-line px-3"/><p className="mt-2 text-ink-secondary">Si la carpeta contiene un único proyecto, se detectará automáticamente. Usa el ID para elegir entre varios. Una carpeta vacía preparará un proyecto nuevo.</p></details>
        <button type="button" disabled={busy||!folder.trim()} onClick={()=>void run(inspect)} className="mt-4 min-h-11 rounded bg-brand-orange px-3 font-medium text-white disabled:opacity-50">Verificar carpeta</button>
      </>:<>
        <h4 className="mt-3 font-medium">Revisión de la conexión</h4><p className="mt-2 break-all text-xs">{review.folderPath}</p><p className="mt-1 break-all text-xs text-ink-secondary">Proyecto compartido: {review.logicalProjectId}</p>
        <Messages warnings={review.warnings} blockers={review.blockers}/>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>setReview(null)} className="min-h-11 rounded px-3 hover:bg-panel">Cambiar carpeta</button><button type="button" disabled={busy||!review.canConnect||review.blockers.length>0} onClick={()=>void run(connect)} className="min-h-11 rounded bg-brand-orange px-3 font-medium text-white disabled:opacity-50">Conectar carpeta</button></div>
      </>}
    </>}
    {status?.binding&&<>
      <dl className="mt-3 rounded bg-panel p-3 text-xs"><dt className="font-medium">Carpeta de intercambio</dt><dd className="mt-1 break-all">{status.binding.folderPath}</dd><dt className="mt-3 font-medium">ID para conectar otro equipo</dt><dd className="mt-1"><input readOnly aria-label="ID del proyecto compartido conectado" value={status.binding.logicalProjectId} onFocus={event=>event.target.select()} className="min-h-11 w-full rounded border border-line bg-white px-2"/></dd></dl>
      <p className="mt-3 text-xs text-ink-secondary">Publica el contenido guardado y revisa los cambios recibidos antes de aplicarlos. Las actualizaciones compatibles usan su base conocida y conservan una copia anterior; las diferencias concurrentes requieren revisión. Los borrados pendientes bloquean la aplicación y no se ejecutan automáticamente.</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy||pending} onClick={()=>void run(publish)} className="min-h-11 rounded bg-brand-orange px-3 font-medium text-white disabled:opacity-50">Publicar copia</button><button type="button" disabled={busy||pending} onClick={()=>void run(scan)} className="min-h-11 rounded border border-line px-3 hover:bg-panel">Comprobar recibidos</button></div>
      {inbox&&<section className="mt-4"><h4 className="font-medium">Publicaciones disponibles</h4>{inbox.items.length===0?<p className="mt-2 text-xs text-ink-secondary">No hay publicaciones recibidas disponibles.</p>:<ul className="mt-2 space-y-2">{inbox.items.map(item=><li key={item.publicationId} className="rounded bg-panel p-3 text-xs"><p className="break-all">{item.publicationId}</p><p className="mt-1 text-ink-secondary">{Object.keys(item.files).length} archivos · Equipo {item.senderId}</p><button disabled={busy} onClick={()=>void run(()=>reviewReceive(item.publicationId))} className="mt-2 min-h-11 rounded px-3 font-medium hover:bg-brand-hover">Revisar publicación</button></li>)}</ul>}</section>}
      {receive&&<section className="mt-4"><h4 className="font-medium">Revisión de archivos recibidos</h4><Paths title="Archivos nuevos" paths={receive.additions}/><Paths title="Actualizaciones compatibles" paths={receive.updates??[]}/><Paths title="Borrados pendientes: requieren revisión" paths={receive.pendingDeletions??[]}/><Paths title="Se conserva la versión local" paths={receive.keepLocal??[]}/><Paths title="Ya coinciden" paths={receive.identical}/><Paths title="Diferencias conservadas sin sobrescribir" paths={receive.conflicts}/><Messages warnings={receive.warnings}/><button type="button" disabled={busy||pending||!receive.canApply||Boolean(receive.pendingDeletions?.length)||receive.conflicts.length>0} onClick={()=>void run(applyReceive)} className="mt-3 min-h-11 rounded bg-brand-orange px-3 font-medium text-white disabled:opacity-50">Aplicar cambios compatibles</button></section>}
      {disconnecting?<div className="mt-4 rounded bg-panel p-3 text-xs"><p>Desconectar conserva los documentos y la carpeta de intercambio. La aplicación Proton puede seguir sincronizando esa carpeta.</p><div className="mt-2 flex flex-wrap gap-2"><button disabled={busy} onClick={()=>setDisconnecting(false)} className="min-h-11 rounded px-3 hover:bg-white">Conservar conexión</button><button disabled={busy||pending} onClick={()=>void run(disconnect)} className="min-h-11 rounded px-3 font-semibold hover:bg-white">Desconectar carpeta</button></div></div>:<button disabled={busy||pending} onClick={()=>setDisconnecting(true)} className="mt-3 min-h-11 rounded px-3 text-xs text-ink-secondary hover:bg-panel">Desconectar Proton</button>}
    </>}
    {receipt&&<p role="status" className="mt-4 rounded bg-panel p-3 text-xs">{receipt.status==="handed-off"?"Entregado a la carpeta Proton; nube no confirmada.":receipt.status==="connected-local"?"Carpeta conectada en este dispositivo. No se ha confirmado ninguna transferencia a la nube.":receipt.status==="received-local"?`Recepción local registrada: ${receipt.added?.length??0} nuevos y ${receipt.updated?.length??0} actualizados. No confirma una sincronización completa.`:"Carpeta desconectada; los documentos se conservan."}</p>}
    {error&&<p role="alert" className="mt-3 text-red-700">{error}</p>}
    {busy&&<p role="status" className="mt-3 text-xs text-ink-secondary">Procesando la operación local…</p>}
    <button type="button" disabled={busy} onClick={()=>void run(async()=>{await onBack();})} className="mt-4 min-h-11 rounded px-3 hover:bg-panel">Volver a destinos</button>
  </div>;
}
function Messages({warnings=[],blockers=[]}:{warnings?:string[];blockers?:string[]}){return <>{warnings.length>0&&<ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-ink-secondary">{warnings.map((text,index)=><li key={index}>{text}</li>)}</ul>}{blockers.length>0&&<div className="mt-3 rounded bg-panel p-3 text-xs"><p className="font-medium">Requiere revisión</p><ul className="mt-1 list-disc space-y-1 pl-4">{blockers.map((text,index)=><li key={index}>{text}</li>)}</ul></div>}</>;}
function Paths({title,paths}:{title:string;paths:string[]}){return paths.length>0?<div className="mt-3 text-xs"><p className="font-medium">{title} ({paths.length})</p><ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-4">{paths.map(path=><li key={path} className="break-all">{path}</li>)}</ul></div>:null;}
function message(failure:unknown){return failure instanceof Error?failure.message:"No se pudo completar la operación. Consulta el estado antes de repetir.";}
