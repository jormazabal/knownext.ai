import {useEffect, useRef, useState} from "react";
import {ArrowLeft, Check, Cloud, LoaderCircle, Pause, RefreshCw, ShieldCheck} from "lucide-react";
import * as api from "../../lib/api/protonDirect";
import {ApiError} from "../../lib/api/errors";
import type {ProtonAccount, ProtonAccountStatus, ProtonDirectStatus, ProtonDirectReview, ProtonDirectConflict, ProtonDirectStorage, ProtonConflictResolution, ProtonRetentionReview, ProtonRetentionReceipt, ProtonMigrationTarget, ProtonMigrationReview, ProtonMigrationAttempt} from "../../types/protonDirect";

type Loaded = {account: ProtonAccountStatus; project: ProtonDirectStatus};
type ReviewedConflict = ProtonDirectConflict & {remoteHash?:string|null};
export function ProtonDirectPanel({projectId,onBack,onBusyChange,initial}:{projectId:string;onBack:()=>void|Promise<void>;onBusyChange?:(busy:boolean)=>void;initial?:Loaded}) {
  const [account,setAccount]=useState<ProtonAccountStatus|null>(initial?.account??null);
  const [project,setProject]=useState<ProtonDirectStatus|null>(initial?.project??null);
  const [review,setReview]=useState<ProtonDirectReview|null>(null);
  const [destination,setDestination]=useState("");
  const [remoteProjects,setRemoteProjects]=useState<Array<{id:string;name:string}>>([]);
  const [conflicts,setConflicts]=useState<ProtonDirectConflict[]>([]);
  const [selectedConflict,setSelectedConflict]=useState<ReviewedConflict|null>(null);
  const [storage,setStorage]=useState<ProtonDirectStorage|null>(null);
  const [showAdvanced,setShowAdvanced]=useState(false);
  const [confirmDisconnect,setConfirmDisconnect]=useState(false);
  const [operationBusy,setBusy]=useState(false);
  const [controlBusy,setControlBusy]=useState(false);
  const [synchronizing,setSynchronizing]=useState(false);
  const [snapshotBusy,setSnapshotBusy]=useState(false);
  const [lifecycleBusy,setLifecycleBusy]=useState(false);
  const [awaitingReceipt,setAwaitingReceipt]=useState(false);
  const [statusWatchStopped,setStatusWatchStopped]=useState(false);
  const [watchVersion,setWatchVersion]=useState(0);
  const busy=operationBusy||controlBusy||lifecycleBusy;
  const [error,setError]=useState("");
  const [pollPaused,setPollPaused]=useState(false);
  const [loadKey,setLoadKey]=useState(0);
  const alive=useRef(true), authVersion=useRef(0), inFlight=useRef(false);
  const controlInFlight=useRef(false), snapshotInFlight=useRef(false), pauseVersion=useRef(0);
  const snapshotEpoch=useRef(0);
  const advancedRef=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;authVersion.current++;};},[]);
  useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
  useEffect(()=>{
    if(initial && loadKey===0)return;
    let current=true;
    void Promise.all([api.getProtonAccount(),api.getProtonDirectStatus(projectId)]).then(([a,p])=>{if(current){setAccount(a);setProject(p);setError("");}}).catch(e=>{if(current)setError(message(e));});
    return()=>{current=false;};
  },[projectId,initial,loadKey]);
  const attempt=account?.attempt;
  const boundAccountId=project?.binding?.accountId;
  const selectedAccount=boundAccountId
    ? account?.accounts?.find(item=>item.id===boundAccountId)??(account?.account?.id===boundAccountId?account.account:null)
    : account?.account;
  const missingBoundAccount=Boolean(boundAccountId&&!selectedAccount);
  const watchStatus=Boolean(project?.binding&&!project.paused&&(awaitingReceipt||synchronizing||project.pendingOperations||project.recoveryRequired||project.state==="syncing"));
  useEffect(()=>{
    if(!watchStatus)return;
    let current=true, attempts=0;
    const deadline=Date.now()+600000;
    let timer:ReturnType<typeof setTimeout>;
    setStatusWatchStopped(false);
    const schedule=()=>{
      if(!current)return;
      if(Date.now()>=deadline||attempts>=30){setStatusWatchStopped(true);return;}
      timer=setTimeout(()=>void poll(),attempts<3?5000:20000);
    };
    const poll=async()=>{
      if(!current)return;
      if(snapshotInFlight.current){schedule();return;}
      snapshotInFlight.current=true;
      const version=pauseVersion.current,epoch=snapshotEpoch.current;
      attempts++;
      try {
        const next=await api.getProtonDirectStatus(projectId);
        if(current&&applySnapshot(next,version,epoch)){
          if(next.remoteConfirmed&&!next.pendingOperations&&!next.recoveryRequired&&!next.pendingUnknown&&!next.statusIssue){setAwaitingReceipt(false);setError("");return;}
          if(next.paused||next.state==="needs-review"||next.state==="conflict"){setAwaitingReceipt(false);return;}
        }
      }catch(e){if(current&&epoch===snapshotEpoch.current)setError(message(e));}
      finally{snapshotInFlight.current=false;}
      schedule();
    };
    schedule();
    return()=>{current=false;clearTimeout(timer);};
  },[projectId,watchStatus,watchVersion]);
  useEffect(()=>{
    if(attempt?.state!=="pending"||pollPaused)return;
    let current=true;
    const parsedExpiry=attempt.expiresAt?Date.parse(attempt.expiresAt):NaN;
    const deadline=Number.isFinite(parsedExpiry)?Math.min(parsedExpiry,Date.now()+600000):Date.now()+600000;
    let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      if(!current)return;
      if(Number.isFinite(deadline)&&Date.now()>=deadline){setPollPaused(true);setError("El tiempo de espera ha terminado. Consulta la conexión antes de iniciar otra.");return;}
      const version=authVersion.current;
      try {const next=await api.pollProtonConnection(attempt.connectionId);if(current&&version===authVersion.current)setAccount(next);}
      catch(e){if(current&&version===authVersion.current){setPollPaused(true);setError(message(e));}return;}
      if(current)timer=setTimeout(()=>void poll(),5000);
    };
    timer=setTimeout(()=>void poll(),5000);
    return()=>{current=false;clearTimeout(timer);};
  },[attempt?.connectionId,attempt?.state,attempt?.expiresAt,pollPaused]);
  async function run(action:()=>Promise<void>){
    if(inFlight.current||controlInFlight.current)return;
    inFlight.current=true;setBusy(true);setError("");
    try {await action();}catch(e){if(alive.current)setError(message(e));}
    finally {inFlight.current=false;if(alive.current)setBusy(false);}
  }
  async function connectAccount(){authVersion.current++;const next=await api.startProtonConnection();if(alive.current){setAccount(next);setPollPaused(false);}}
  async function queryAccount(){authVersion.current++;const next=attempt?.state==="pending"?await api.pollProtonConnection(attempt.connectionId):await api.getProtonAccount();if(alive.current){setAccount(next);setPollPaused(false);}}
  async function cancel(){if(!attempt)return;authVersion.current++;const next=await api.cancelProtonConnection(attempt.connectionId);if(alive.current){setAccount(next);setPollPaused(false);}}
  async function inspect(){
    if(!selectedAccount)return;
    const next=await api.reviewProtonDirect(projectId,selectedAccount.id,destination||undefined);
    setReview(next);if(next.remoteProjects)setRemoteProjects(next.remoteProjects);
  }
  async function connectProject(){if(review){const next=await api.connectProtonDirect(projectId,review);setProject(next);setReview(null);}}
  async function disconnectProject(){
    if(!project?.binding||!canDisconnect)return;
    const next=await api.disconnectProtonDirect(projectId,project.binding.generation);
    setProject(next);setReview(null);setConflicts([]);setSelectedConflict(null);setStorage(null);setConfirmDisconnect(false);
  }
  function applySnapshot(next:ProtonDirectStatus,version:number,epoch=snapshotEpoch.current){
    if(epoch!==snapshotEpoch.current)return false;
    setProject(current=>version===pauseVersion.current?next:{...next,paused:current?.paused??next.paused});
    return true;
  }
  async function synchronize(){
    const version=pauseVersion.current;
    snapshotEpoch.current++;
    setProject(current=>current?{...current,remoteConfirmed:false}:current);
    setSynchronizing(true);setAwaitingReceipt(false);setWatchVersion(value=>value+1);
    try {
      let next:ProtonDirectStatus;
      try{next=await api.syncProtonDirect(projectId);}
      catch(e){
        if(alive.current){
          snapshotEpoch.current++;
          setProject(current=>current?{...current,remoteConfirmed:false}:current);
          if(e instanceof ApiError&&(e.status===504||e.operationOutcome==="unknown")){setAwaitingReceipt(true);setWatchVersion(value=>value+1);}
        }
        throw e;
      }
      snapshotEpoch.current++;
      if(alive.current)applySnapshot(next,version);
      const result=await api.getProtonDirectConflicts(projectId).catch(e=>{throw new Error(`No se pudo actualizar la lista de conflictos. ${message(e)}`);});
      if(alive.current){setConflicts(result.items);setSelectedConflict(null);}
    }finally{if(alive.current)setSynchronizing(false);}
  }
  async function queryProjectSnapshot(){
    if(snapshotInFlight.current)return;
    snapshotInFlight.current=true;setSnapshotBusy(true);setError("");
    const version=pauseVersion.current,epoch=snapshotEpoch.current;
    try {const next=await api.getProtonDirectStatus(projectId);if(alive.current&&applySnapshot(next,version,epoch)){setStatusWatchStopped(false);setWatchVersion(value=>value+1);if(next.remoteConfirmed&&!next.pendingOperations&&!next.recoveryRequired&&!next.pendingUnknown&&!next.statusIssue)setAwaitingReceipt(false);}}
    catch(e){if(alive.current&&epoch===snapshotEpoch.current)setError(message(e));}
    finally{snapshotInFlight.current=false;if(alive.current)setSnapshotBusy(false);}
  }
  async function togglePause(){
    if(controlInFlight.current||!project?.binding||!selectedAccount)return;
    controlInFlight.current=true;setControlBusy(true);setError("");
    const epoch=snapshotEpoch.current;
    try {const next=await api.pauseProtonDirect(projectId,!project.paused);if(alive.current){pauseVersion.current++;setProject(current=>epoch===snapshotEpoch.current||!current?next:{...current,paused:next.paused});}}
    catch(e){if(alive.current)setError(message(e));}
    finally {controlInFlight.current=false;if(alive.current)setControlBusy(false);}
  }
  async function compare(conflictId:string){setSelectedConflict(await api.reviewProtonDirectConflict(projectId,conflictId));}
  async function resolve(resolution:ProtonConflictResolution){
    if(!selectedConflict||(resolution==="both"&&selectedConflict.remoteHash===null))return;
    setProject(await api.resolveProtonDirectConflict(projectId,selectedConflict.id,selectedConflict.revision,resolution));
    setSelectedConflict(null);setConflicts((await api.getProtonDirectConflicts(projectId)).items);
  }
  function openMigrationOptions(){
    setShowAdvanced(true);
    if(advancedRef.current){advancedRef.current.open=true;advancedRef.current.querySelector<HTMLSelectElement>("#proton-migration-target")?.focus();}
  }
  async function refreshAfterMigration(){
    const epoch=++snapshotEpoch.current,version=pauseVersion.current;
    setProject(current=>current?{...current,remoteConfirmed:false}:current);
    const next=await api.getProtonDirectStatus(projectId);
    if(alive.current)applySnapshot(next,version,epoch);
  }
  const connected=selectedAccount?.state==="connected";
  const pending=attempt?.state==="pending";
  const mutable=Boolean(account?.available&&connected&&!pending);
  const canDisconnect=project?.canDisconnect??(!project?.recoveryRequired&&!project?.pendingOperations);
  const remoteDeleted=selectedConflict?.remoteHash===null;
  return <section className="min-h-0 overflow-y-auto px-5 py-4 text-sm" aria-busy={busy||snapshotBusy} aria-label="Conexión directa Proton">
    <button type="button" disabled={busy} onClick={()=>void onBack()} className="mb-4 flex min-h-11 items-center gap-2 rounded px-2 hover:bg-panel"><ArrowLeft size={16}/>Volver a destinos</button>
    <div className="flex items-center gap-2"><Cloud size={18} className="text-brand-orange"/><h3 className="font-semibold">Proton Drive</h3></div>
    <p className="mt-1 text-xs text-ink-secondary">Conexión directa. Tus documentos siguen disponibles en este dispositivo.</p>
    <p className="mt-2 text-xs text-ink-secondary">Beta experimental para uso personal no comercial. Integración de terceros no respaldada oficialmente por Proton; su SDK todavía no está preparado para uso de terceros en producción.</p>
    {!account||!project ? <div className="py-5"><p role="status">Consultando conexión…</p>{error&&<><p role="alert" className="mt-2 text-red-700">{error}</p><button className="mt-2 min-h-11 rounded px-3 hover:bg-panel" onClick={()=>setLoadKey(k=>k+1)}>Reintentar consulta</button></>}</div> : <>
      {!account.available&&<p role="status" className="mt-4 rounded bg-panel p-3 text-xs">{account.reason||"La conexión Proton no está disponible en este dispositivo."}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-medium">{connected?selectedAccount?.label:boundAccountId?"Vuelve a conectar la cuenta asociada":selectedAccount?.state==="needs-reconnect"?"La cuenta necesita reconectarse":"Conecta tu cuenta"}</p><p className="mt-1 text-xs text-ink-secondary">{connected?"Conexión recordada en este dispositivo.":pending?"Completa el acceso en el navegador de Proton.":"El acceso se realiza en Proton; KnowNext no solicita tu contraseña."}</p></div>
        {!connected&&!pending&&<button disabled={busy||!account.available} onClick={()=>void run(connectAccount)} className="min-h-11 rounded bg-brand-orange px-3 font-medium text-white disabled:opacity-50">{selectedAccount||missingBoundAccount?"Volver a conectar":"Conectar con Proton"}</button>}
        {connected&&<ShieldCheck size={20} className="text-ink-secondary" aria-label="Sesión protegida"/>}
      </div>
      {boundAccountId&&!connected&&<p role="status" className="mt-3 rounded bg-panel p-3 text-xs">El proyecto conserva su cuenta asociada. Inicia sesión con esa misma cuenta para continuar; conectar otra cuenta no cambia este proyecto.</p>}
      {pending&&<div className="mt-3 rounded bg-panel p-3"><p role="status" className="flex items-center gap-2"><LoaderCircle size={16} className="animate-spin"/>Esperando autorización</p><p className="mt-1 text-xs text-ink-secondary">Puedes cerrar esta ventana y consultar de nuevo. No se inicia otra conexión automáticamente.</p><div className="mt-2 flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void run(queryAccount)} className="min-h-11 rounded px-3 hover:bg-white">Consultar conexión</button><button disabled={busy} onClick={()=>void run(cancel)} className="min-h-11 rounded px-3 hover:bg-white">Cancelar conexión</button></div></div>}
      {(attempt?.state==="expired"||attempt?.state==="cancelled")&&<p role="status" className="mt-3 text-xs text-ink-secondary">{attempt.state==="expired"?"El acceso ha caducado. Puedes conectar de nuevo.":"Conexión cancelada. Los documentos se conservan."}</p>}
      {connected&&!project.binding&&<div className="mt-5">
        <label htmlFor="proton-destination" className="block font-medium">Proyecto en Proton</label>
        <select id="proton-destination" disabled={busy} value={destination} onChange={e=>{setDestination(e.target.value);setReview(null);}} className="mt-2 min-h-11 w-full rounded border border-border bg-white px-3">
          <option value="">Crear un proyecto nuevo</option>
          {remoteProjects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <p className="mt-1 text-xs text-ink-secondary">Revisa primero para ver los proyectos disponibles de tu cuenta.</p>
        <button disabled={busy||!mutable} onClick={()=>void run(inspect)} className="mt-2 min-h-11 rounded px-3 hover:bg-panel">Revisar destino</button>
        {review&&<div className="mt-3 rounded bg-panel p-3"><p className="font-medium">Contenido de este proyecto</p><p className="mt-1 text-xs">{review.summary.files} archivos · {bytes(review.summary.bytes)}</p>
          {[...review.warnings,...review.blockers].map((item,index)=><p key={index} className="mt-2 text-xs">{item}</p>)}
          <p className="mt-2 text-xs text-ink-secondary">Al conectar, los cambios guardados se sincronizarán automáticamente mientras KnowNext pueda ejecutarse. Puedes pausar la sincronización.</p>
          <button disabled={busy||!mutable||!review.canConnect||review.blockers.length>0} onClick={()=>void run(connectProject)} className="mt-3 min-h-11 rounded bg-brand-orange px-3 font-medium text-white disabled:opacity-50">Conectar este proyecto</button>
        </div>}
      </div>}
      {project.binding&&<div className="mt-5">
        <p className="font-medium" role="status">{!connected?"Conexión de cuenta pendiente":project.paused?"Sincronización en pausa":synchronizing?(project.publicationBlocked?"Recibiendo cambios…":"Sincronizando…"):awaitingReceipt?(statusWatchStopped?"Confirmación pendiente":"Comprobando confirmación…"):conflicts.length?"Necesita revisión":statusLabel(project)}</p>
        <p className="mt-1 text-xs text-ink-secondary">{project.detail}</p>
        {project.pendingUnknown&&<p className="mt-2 rounded bg-panel p-3 text-xs" role="alert">No se puede comprobar la cola de sincronización. Tus documentos se conservan; revisa el estado antes de volver a enviar.</p>}
        {project.pendingOperations!==undefined&&project.pendingOperations>0&&<p className="mt-1 text-xs">{project.pendingOperations} {project.pendingOperations===1?"operación pendiente":"operaciones pendientes"}</p>}
        {(project.notice||project.publicationBlocked)&&<div role="alert" className="mt-2 rounded bg-panel p-3 text-xs"><p className="font-medium">Cambió la sincronización del proyecto</p><p className="mt-1">{project.notice?.detail??"La conexión anterior necesita revisión antes de enviar nuevos cambios."}</p><p className="mt-2 text-ink-secondary">Este dispositivo conserva la conexión anterior y no enviará cambios. Puedes recibir actualizaciones y seguir trabajando localmente. Revisa el destino antes de volver a sincronizar; otros clientes antiguos pueden seguir enviando.</p><button disabled={busy} onClick={openMigrationOptions} className="mt-2 min-h-11 rounded px-3 font-medium hover:bg-white disabled:opacity-50">Revisar cambio de sincronización</button></div>}
        {awaitingReceipt&&<p className="mt-2 rounded bg-panel p-3 text-xs" role="status">Tus documentos siguen guardados aquí. La confirmación está tardando; puedes consultar el intento sin volver a enviarlo.</p>}
        {statusWatchStopped&&<p className="mt-2 text-xs text-ink-secondary">La consulta automática se ha detenido. Puedes consultar el estado para recuperar la confirmación; no repitas el envío.</p>}
        {project.lastSyncedAt&&project.remoteConfirmed&&!awaitingReceipt&&<p className="mt-1 text-xs text-ink-secondary">Última confirmación: {new Date(project.lastSyncedAt).toLocaleString("es-ES")}</p>}
        {project.paused&&<p className="mt-2 text-xs text-ink-secondary">La solicitud en curso puede terminar. La pausa se aplica antes de la siguiente transferencia.</p>}
        {project.recoveryRequired&&<p className="mt-2 rounded bg-panel p-3 text-xs">Hay una operación interrumpida. Sincronizar comprueba el intento guardado antes de continuar; conserva las variantes locales.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={busy||awaitingReceipt||!mutable||project.paused} onClick={()=>void run(synchronize)} className="flex min-h-11 items-center gap-2 rounded bg-brand-orange px-3 font-medium text-white disabled:opacity-50"><RefreshCw size={16}/>{project.publicationBlocked?"Recibir cambios":"Sincronizar ahora"}</button>
          <button disabled={controlBusy||!selectedAccount} onClick={()=>void togglePause()} className="flex min-h-11 items-center gap-2 rounded px-3 hover:bg-panel"><Pause size={16}/>{project.paused?"Reanudar":"Pausar"}</button>
          <button disabled={snapshotBusy} onClick={()=>void queryProjectSnapshot()} className="min-h-11 rounded px-3 hover:bg-panel">Consultar estado</button>
          <button disabled={busy} onClick={()=>void run(async()=>setConflicts((await api.getProtonDirectConflicts(projectId)).items))} className="min-h-11 rounded px-3 hover:bg-panel">Revisar conflictos</button>
        </div>
        {conflicts.length>0&&<div className="mt-4"><h4 className="font-medium">Necesita revisión</h4><ul>{conflicts.map(item=><li key={item.id} className="mt-2"><button disabled={busy} onClick={()=>void run(()=>compare(item.id))} className="min-h-11 w-full rounded bg-panel p-3 text-left"><span className="block break-all font-medium">{item.path}</span><span className="block text-xs text-ink-secondary">{item.reason}</span></button></li>)}</ul></div>}
        {selectedConflict&&<div className="mt-3 rounded bg-panel p-3"><h4 className="break-all font-medium">{selectedConflict.path}</h4><p className="mt-1 text-xs">Se conservará una copia antes de aplicar la resolución.</p><div className="mt-2 grid gap-3">
          {selectedConflict.local!=null&&<div><p className="text-xs font-medium">Este dispositivo</p><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 text-xs">{selectedConflict.local}</pre></div>}
          {selectedConflict.remote!=null&&<div><p className="text-xs font-medium">Proton</p><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 text-xs">{selectedConflict.remote}</pre></div>}
        </div>{remoteDeleted&&<p className="mt-3 text-xs text-ink-secondary">El archivo está eliminado en Proton. Puedes conservar la versión local o aplicar el borrado; no hay una versión recibida para conservar ambas.</p>}<div className="mt-3 flex flex-wrap gap-1">{([["local","Conservar local"],["remote","Usar recibido"],["both","Conservar ambos"]] as const).map(([value,label])=><button key={value} disabled={busy||!mutable||(value==="both"&&remoteDeleted)} onClick={()=>void run(()=>resolve(value))} className="min-h-11 rounded px-3 hover:bg-white disabled:opacity-50">{value==="remote"&&remoteDeleted?"Aplicar borrado de Proton":label}</button>)}</div></div>}
      </div>}
      <details ref={advancedRef} className="mt-5 text-xs" open={showAdvanced} onToggle={e=>setShowAdvanced(e.currentTarget.open)}><summary className="min-h-11 cursor-pointer py-3 font-medium">Opciones de conexión y almacenamiento</summary>
        <p className="text-ink-secondary">La sincronización no incluye credenciales, borradores sin guardar ni el historial Git. La disponibilidad remota no garantiza que otro dispositivo ya haya recibido los cambios.</p>
        {project.binding&&<div className="mt-3">
          {confirmDisconnect?<div className="rounded bg-panel p-3">
            <p className="font-medium">Desconectar este proyecto del dispositivo</p>
            <p className="mt-1">Los documentos locales, las copias de Proton y el material de recuperación se conservarán. Este dispositivo dejará de sincronizar el proyecto. La cuenta seguirá conectada.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button disabled={busy||!canDisconnect} onClick={()=>void run(disconnectProject)} className="min-h-11 rounded px-3 font-medium hover:bg-white disabled:opacity-50">Confirmar desconexión</button>
              <button disabled={busy} onClick={()=>setConfirmDisconnect(false)} className="min-h-11 rounded px-3 hover:bg-white">Seguir sincronizando</button>
            </div>
          </div>:<button disabled={busy||!canDisconnect} onClick={()=>setConfirmDisconnect(true)} className="min-h-11 rounded px-3 hover:bg-panel disabled:opacity-50">Desconectar sincronización</button>}
          {!canDisconnect&&<p className="mt-1 text-ink-secondary">Completa o recupera la operación pendiente antes de desconectar.</p>}
        </div>}
        {project.binding&&<button disabled={busy} onClick={()=>void run(async()=>setStorage(await api.getProtonDirectStorage(projectId)))} className="mt-2 min-h-11 rounded px-3 hover:bg-panel">Consultar almacenamiento</button>}
        {storage&&<div className="mt-2 rounded bg-panel p-3"><p className="font-medium">Almacén privado de este dispositivo</p><p className="mt-1">{bytes(storage.bytes)}{storage.limitBytes!=null?" de "+bytes(storage.limitBytes):" · límite local no disponible"}{storage.protectedBytes!==undefined?" · "+bytes(storage.protectedBytes)+" protegidos":""}</p><p className="mt-1 text-ink-secondary">Cuota de Proton: no consultada. El límite anterior sólo corresponde a las copias privadas de este dispositivo.</p>{storage.quotaStatus&&storage.quotaStatus!=="ok"&&<p className="mt-2">{storage.quotaStatus==="full"?"El almacén privado ha alcanzado su límite. Revisa la limpieza; los documentos se conservan.":"El almacén privado se acerca a su límite. Puedes revisar qué espacio se puede liberar."}</p>}{Boolean(storage.categories?.length)&&<details className="mt-2"><summary className="min-h-11 cursor-pointer py-3">Qué ocupa espacio</summary><ul className="space-y-2">{storage.categories!.map(item=><li key={item.id}><p className="flex justify-between gap-3"><span>{item.label}{item.protected?" · protegido":""}</span><span className="shrink-0">{bytes(item.bytes)}</span></p><p className="mt-1 text-ink-secondary">{item.reason}</p></li>)}</ul></details>}</div>}
        <ProtonLifecycleTools key={projectId} projectId={projectId} account={account} disabled={busy||awaitingReceipt} onBusyChange={setLifecycleBusy} onStorageChange={setStorage} onProjectChange={refreshAfterMigration}/>
        {connected&&<button disabled={busy||pending} onClick={()=>void run(connectAccount)} className="mt-2 min-h-11 rounded px-3 hover:bg-panel disabled:opacity-50">Conectar otra cuenta Proton</button>}
        {selectedAccount&&<button disabled={busy||Boolean(project.binding)||pending} onClick={()=>void run(async()=>{authVersion.current++;setAccount(await api.disconnectProtonAccount(selectedAccount!.id));})} className="mt-2 min-h-11 rounded px-3 hover:bg-panel">Desconectar cuenta</button>}
        {project.binding&&<p className="mt-1 text-ink-secondary">Para desconectar la cuenta, revisa primero el cambio de sincronización de los proyectos asociados.</p>}
      </details>
      {connected&&!project.binding&&<p className="mt-3 flex items-center gap-2 text-xs text-ink-secondary"><Check size={14}/>La cuenta está conectada; este proyecto aún no se sincroniza.</p>}
      {error&&!awaitingReceipt&&<p role="alert" className="mt-3 break-words rounded bg-panel p-3 text-red-700">{error}</p>}
    </>}
  </section>;
}
function message(error:unknown){
  const fallback="No se pudo confirmar la operación. Consulta el estado antes de repetir.";
  if(error instanceof ApiError)return typeof error.detail==="string"&&error.detail.trim()?error.detail:fallback;
  return error instanceof Error?error.message:fallback;
}
function bytes(value:number){return new Intl.NumberFormat("es-ES",{maximumFractionDigits:1}).format(value/1024)+" KiB";}
function statusLabel(value:ProtonDirectStatus){
  if(value.notice||value.publicationBlocked)return "Conexión anterior · necesita revisión";
  if(value.pendingUnknown||value.statusIssue)return "No se puede confirmar la sincronización";
  if(value.paused)return "Sincronización en pausa";
  if(value.recoveryRequired)return "Recuperación pendiente";
  if(value.state==="syncing")return "Sincronizando…";
  if(value.state==="conflict"||value.state==="needs-review")return "Necesita revisión";
  if(value.state==="offline")return "Sin conexión · cambios conservados";
  return value.remoteConfirmed&&!value.pendingOperations?"Al día con Proton":"Guardado en este dispositivo · sincronización pendiente";
}

function ProtonLifecycleTools({projectId,account,disabled,onBusyChange,onStorageChange,onProjectChange}:{projectId:string;account:ProtonAccountStatus;disabled:boolean;onBusyChange:(value:boolean)=>void;onStorageChange:(value:ProtonDirectStorage)=>void;onProjectChange:()=>Promise<void>}){
  const [retention,setRetention]=useState<ProtonRetentionReview|null>(null);
  const [retained,setRetained]=useState<ProtonRetentionReceipt|null>(null);
  const [target,setTarget]=useState<ProtonMigrationTarget>("local");
  const [accountId,setAccountId]=useState(account.account?.state==="connected"?account.account.id:account.accounts?.find(item=>item.state==="connected")?.id??"");
  const [remoteRoot,setRemoteRoot]=useState("");
  const [allowLocalRecovery,setAllowLocalRecovery]=useState(false);
  const [remoteProjects,setRemoteProjects]=useState<Array<{id:string;name:string}>>([]);
  const [migrationReview,setMigrationReview]=useState<ProtonMigrationReview|null>(null);
  const [migration,setMigration]=useState<ProtonMigrationAttempt|null>(null);
  const [migrationQueried,setMigrationQueried]=useState(false);
  const [error,setError]=useState("");
  const [errorContext,setErrorContext]=useState<"retention"|"migration">("migration");
  const [working,setWorking]=useState(false);
  const inFlight=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const accounts=account.accounts??(account.account?[account.account]:[]);
  const busy=disabled||working;
  const activeMigration=Boolean(migration&&!['complete','cancelled'].includes(migration.phase));
  const reviewDestinationKnown=Boolean(migrationReview&&migrationDestinationKnown(migrationReview,accounts));
  const attemptDestinationKnown=Boolean(migration&&migrationDestinationKnown(migration,accounts));
  async function run(action:()=>Promise<void>,context:"retention"|"migration"="migration"){
    if(inFlight.current||disabled)return;
    inFlight.current=true;setWorking(true);setError("");setErrorContext(context);onBusyChange(true);
    try{await action();}catch(e){if(alive.current)setError(message(e));}
    finally{inFlight.current=false;if(alive.current){setWorking(false);onBusyChange(false);}}
  }
  async function inspectRetention(){setRetention(await api.reviewProtonRetention(projectId));setRetained(null);}
  async function clean(){
    if(!retention)return;
    try{const receipt=await api.applyProtonRetention(projectId,retention);setRetained(receipt);setRetention(null);onStorageChange(receipt.storage);}
    catch(e){setRetention(null);throw e;}
  }
  async function cancelCleanup(){
    if(!retention)return;
    try{const receipt=await api.cancelProtonRetention(projectId,retention);setRetained(receipt);onStorageChange(receipt.storage);}
    finally{setRetention(null);}
  }
  async function inspectMigration(){
    const next=await api.reviewProtonMigration(projectId,{target,...(target==="proton"?{accountId,...(remoteRoot?{remoteRootId:remoteRoot}:{})}:{}),...(allowLocalRecovery?{allowLocalRecovery:true}:{})});
    setMigrationReview(next);setRemoteProjects(next.remoteProjects??[]);
  }
  async function start(){
    if(!migrationReview||!migrationReview.canStart||migrationReview.blockers.length||!reviewDestinationKnown)return;
    try{setMigration(await api.startProtonMigration(projectId,migrationReview));setMigrationReview(null);}
    catch(e){setMigrationReview(null);throw e;}
  }
  async function discardMigrationReview(){
    if(!migrationReview)return;
    try{setMigration(await api.cancelProtonMigration(projectId,migrationReview));}
    finally{setMigrationReview(null);}
  }
  async function query(){
    const result=await api.getProtonMigration(projectId);
    setMigration(result.attempt);setMigrationQueried(true);
    if(result.attempt){
      setTarget(result.attempt.target);
      setAccountId(result.attempt.destinationAccountId??"");
      const savedReview=result.review;
      setMigrationReview(result.attempt.phase==="reviewed"&&savedReview?.id===result.attempt.id&&savedReview.revision===result.attempt.revision?savedReview:null);
    }else setMigrationReview(null);
    if(result.attempt?.phase==="complete")await onProjectChange();
  }
  async function confirm(){if(migration?.canAcknowledge&&attemptDestinationKnown){setMigration(await api.acknowledgeProtonMigration(projectId,migration));await onProjectChange();}}
  async function resume(){if(migration?.canResume&&attemptDestinationKnown)setMigration(await api.resumeProtonMigration(projectId,migration));}
  function invalidate(){setMigrationReview(null);}
  return <div className="mt-4 space-y-4">
    <div>
      <h4 className="font-medium">Espacio y copias de recuperación</h4>
      <p className="mt-1 text-ink-secondary">La limpieza revisa las copias privadas del dispositivo. Conserva los documentos, las variantes necesarias y el contenido de Proton.</p>
      <button disabled={busy} onClick={()=>void run(inspectRetention,"retention")} className="mt-2 min-h-11 rounded px-3 hover:bg-panel disabled:opacity-50">Revisar limpieza</button>
      {retention&&<div className="mt-2 rounded bg-panel p-3">
        {retention.resume&&<p className="mb-2 font-medium">Limpieza interrumpida recuperada · {bytes(retention.progress?.reclaimedBytes??0)} ya liberados</p>}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1"><dt>{retention.resume?"Al inicio de la revisión":"Almacenado aquí"}</dt><dd className="text-right">{bytes(retention.bytesBefore)}</dd><dt>{retention.resume?"Protegido al revisar":"Protegido"}</dt><dd className="text-right">{bytes(retention.protectedBytes)}</dd><dt>{retention.resume?"Pendiente de confirmar":"Se puede liberar"}</dt><dd className="text-right font-medium">{bytes(Math.max(0,retention.reclaimableBytes-(retention.progress?.reclaimedBytes??0)))}</dd></dl>
        {[...retention.warnings,...retention.blockers].map((item,index)=><p key={index} className="mt-2">{item}</p>)}
        {retention.candidates.length>0&&<details className="mt-2"><summary className="min-h-11 cursor-pointer py-3">Ver {retention.candidates.length} copias revisadas</summary><ul className="max-h-40 space-y-2 overflow-y-auto">{retention.candidates.map(item=><li key={item.id} className="flex justify-between gap-3"><span>{item.reason}</span><span className="shrink-0">{bytes(item.bytes)}</span></li>)}</ul></details>}
        <div className="mt-2 flex flex-wrap gap-1"><button disabled={busy||!retention.canApply||retention.blockers.length>0||(retention.reclaimableBytes===0&&!retention.resume)} onClick={()=>void run(clean,"retention")} className="min-h-11 rounded px-3 font-medium hover:bg-white disabled:opacity-50">{retention.resume?"Continuar limpieza revisada":"Liberar espacio revisado"}</button>{retention.resume?<button disabled={busy} onClick={()=>void run(cancelCleanup,"retention")} className="min-h-11 rounded px-3 hover:bg-white">Cancelar lo pendiente</button>:<button disabled={busy} onClick={()=>setRetention(null)} className="min-h-11 rounded px-3 hover:bg-white">Cancelar limpieza</button>}</div>
      </div>}
      {retained&&<p role="status" className="mt-2">{retained.state==="complete"?`Limpieza completada · ${bytes(retained.reclaimedBytes)} liberados`:retained.state==="cancelled"?`Limpieza cancelada · ${bytes(retained.reclaimedBytes)} ya liberados. Las copias pendientes se conservan.`:retained.state==="pending"?"Limpieza pendiente de confirmación. Revisa de nuevo antes de continuar.":"El inventario ha cambiado. Revisa de nuevo la limpieza."}</p>}
    </div>
    <div>
      <h4 className="font-medium">Cambiar sincronización</h4>
      <p className="mt-1 text-ink-secondary">El proyecto mantiene sus documentos e historial local. El origen se conserva hasta verificar y confirmar el cambio; otros dispositivos necesitan revisar su conexión.</p>
      {!activeMigration&&<>
      <label htmlFor="proton-migration-target" className="mt-2 block">Destino del proyecto</label>
      <select id="proton-migration-target" value={target} disabled={busy||activeMigration} onChange={e=>{setTarget(e.target.value as ProtonMigrationTarget);setRemoteRoot("");setRemoteProjects([]);setAllowLocalRecovery(false);invalidate();}} className="mt-1 min-h-11 w-full rounded border border-border bg-white px-3"><option value="local">Sólo en este dispositivo</option><option value="proton">Proton · otra cuenta o ubicación</option><option value="github">GitHub configurado en el proyecto</option></select>
      {target==="proton"&&<>
        <label htmlFor="proton-migration-account" className="mt-2 block">Cuenta de destino</label>
        <select id="proton-migration-account" value={accountId} disabled={busy||activeMigration} onChange={e=>{setAccountId(e.target.value);setRemoteRoot("");setRemoteProjects([]);setAllowLocalRecovery(false);invalidate();}} className="mt-1 min-h-11 w-full rounded border border-border bg-white px-3"><option value="">Selecciona una cuenta conectada</option>{accounts.filter(item=>item.state==="connected").map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <label htmlFor="proton-migration-root" className="mt-2 block">Proyecto en Proton</label>
        <select id="proton-migration-root" value={remoteRoot} disabled={busy||activeMigration} onChange={e=>{setRemoteRoot(e.target.value);setAllowLocalRecovery(false);invalidate();}} className="mt-1 min-h-11 w-full rounded border border-border bg-white px-3"><option value="">Crear un espacio gestionado</option>{remoteProjects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <p className="mt-1 text-ink-secondary">Revisar muestra los destinos disponibles. No se trasladan contraseñas ni credenciales entre dispositivos.</p>
      </>}
      <label className="mt-2 flex min-h-11 items-center gap-2"><input type="checkbox" checked={allowLocalRecovery} disabled={busy||activeMigration} onChange={e=>{setAllowLocalRecovery(e.target.checked);invalidate();}}/>Preparar desde la copia local si el origen no está disponible</label>
      {allowLocalRecovery&&<p className="mt-1 text-ink-secondary">Puede faltar trabajo de otros dispositivos. El cambio se registrará como recuperación local, sin dar por trasladado todo el origen.</p>}
      <button disabled={busy||(target==="proton"&&!accountId)} onClick={()=>void run(inspectMigration)} className="mt-2 min-h-11 rounded px-3 hover:bg-panel disabled:opacity-50">Revisar cambio</button>
      </>}
      <button disabled={busy} onClick={()=>void run(query)} className="mt-2 min-h-11 rounded px-3 hover:bg-panel">Consultar cambio pendiente</button>
      {migrationQueried&&!migration&&<p role="status" className="mt-2 text-ink-secondary">No hay cambios de sincronización pendientes.</p>}
      {migrationReview&&<div className="mt-2 rounded bg-panel p-3"><p className="font-medium">{activeMigration?"Revisión guardada recuperada":"Revisión del cambio"}</p><MigrationDestinationSummary intent={migrationReview} accounts={accounts}/>{[...migrationReview.warnings,...migrationReview.blockers].map((item,index)=><p key={index} className="mt-2">{item}</p>)}<p className="mt-2 text-ink-secondary">Primero se prepara y verifica el destino. El cambio de sincronización requiere una confirmación posterior.</p><div className="mt-2 flex flex-wrap gap-1"><button disabled={busy||!migrationReview.canStart||migrationReview.blockers.length>0||!reviewDestinationKnown} onClick={()=>void run(start)} className="min-h-11 rounded px-3 font-medium hover:bg-white disabled:opacity-50">Preparar y verificar destino</button><button disabled={busy} onClick={()=>void run(discardMigrationReview)} className="min-h-11 rounded px-3 hover:bg-white">Descartar revisión</button></div></div>}
      {migration&&!migrationReview&&<div className="mt-2 rounded bg-panel p-3" role="status"><p className="font-medium">{migrationLabel(migration.phase,migration)}</p><MigrationDestinationSummary intent={migration} accounts={accounts} requireComplete={activeMigration}/><p className="mt-2">{migration.detail}</p>{migration.sourcePreserved&&<p className="mt-2 text-ink-secondary">Origen conservado.</p>}{[...(migration.warnings??[]),...(migration.blockers??[])].map((item,index)=><p key={index} className="mt-2">{item}</p>)}{migration.receiptId&&<p className="mt-2 break-all text-ink-secondary">Comprobante: {migration.receiptId}</p>}<div className="mt-2 flex flex-wrap gap-1">{migration.canAcknowledge&&<button disabled={busy||!attemptDestinationKnown} onClick={()=>void run(confirm)} className="min-h-11 rounded bg-brand-orange px-3 font-medium text-white disabled:opacity-50">Confirmar cambio verificado</button>}{migration.canResume&&<button disabled={busy||!attemptDestinationKnown} onClick={()=>void run(resume)} className="min-h-11 rounded px-3 font-medium hover:bg-white disabled:opacity-50">Continuar cambio revisado</button>}{migration.canCancel&&<button disabled={busy} onClick={()=>void run(async()=>setMigration(await api.cancelProtonMigration(projectId,migration)))} className="min-h-11 rounded px-3 hover:bg-white">Cancelar cambio</button>}</div></div>}
      {error&&<p role="alert" className="mt-2 break-words rounded bg-panel p-3 text-red-700">{error} {errorContext==="retention"?"Revisa la limpieza para recuperar su resultado antes de repetir.":"Consulta el cambio pendiente antes de repetir una preparación o confirmación."}</p>}
    </div>
  </div>;
}
type MigrationDestinationIntent=Pick<ProtonMigrationAttempt,"target"|"source"|"destination"|"destinationAccountId"|"destinationName"|"summary">;
function migrationDestinationKnown(intent:MigrationDestinationIntent,accounts:ProtonAccount[]){
  return Boolean(intent.source?.trim()&&intent.destination?.trim()&&intent.destinationName?.trim()&&intent.summary&&Number.isFinite(intent.summary.files)&&Number.isFinite(intent.summary.bytes)&&(intent.target!=="proton"||accounts.some(item=>item.id===intent.destinationAccountId&&item.state==="connected"&&item.label.trim())));
}
function MigrationDestinationSummary({intent,accounts,requireComplete=true}:{intent:MigrationDestinationIntent;accounts:ProtonAccount[];requireComplete?:boolean}){
  const destinationAccount=accounts.find(item=>item.id===intent.destinationAccountId);
  return <div role="group" aria-label="Destino del cambio guardado" className="mt-2">
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1"><dt>Origen</dt><dd className="break-words">{intent.source??"Origen pendiente de recuperar"}</dd><dt>Destino</dt><dd className="break-words">{intent.destination??({local:"Sólo en este dispositivo",proton:"Proton Drive",github:"GitHub"}[intent.target])}</dd>{intent.target==="proton"&&<><dt>Cuenta de destino</dt><dd className="break-words">{destinationAccount?.label??"Cuenta no disponible en este dispositivo"}</dd></>}<dt>Ubicación de destino</dt><dd className="break-words">{intent.destinationName??"Ubicación pendiente de recuperar"}</dd>{intent.summary&&<><dt>Contenido revisado</dt><dd>{intent.summary.files} archivos · {bytes(intent.summary.bytes)}</dd></>}</dl>
    {requireComplete&&!migrationDestinationKnown(intent,accounts)&&<p className="mt-2 text-ink-secondary">Consulta el cambio para recuperar su destino completo y conecta la cuenta indicada antes de continuar. El destino no se sustituye por la cuenta activa.</p>}
  </div>;
}
function migrationLabel(phase:ProtonMigrationAttempt["phase"],attempt:ProtonMigrationAttempt){
  if(phase==="complete"){
    if(attempt.pendingLocalChanges)return "Cambio activo · cambios nuevos pendientes";
    if(attempt.localRecovery)return "Recuperación local completada";
    if(attempt.fullyMigrated===false)return "Cambio activo · revisar alcance";
  }
  return {reviewed:"Cambio revisado",staging:"Preparando destino",verifying:"Verificando contenido",ready:"Destino verificado · pendiente de confirmar",switching:"Confirmando cambio",complete:"Cambio completado",'needs-review':"El cambio necesita revisión",cancelled:"Cambio cancelado · origen conservado"}[phase];
}


