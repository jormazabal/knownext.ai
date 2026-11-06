import {MixedSelectionDialog} from "./MixedSelectionDialog";
import { useEffect, useRef, useState } from "react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import {HistoricalResourceCopyDialog} from "./HistoricalResourceCopyDialog";
import type {DocumentTreeNode} from "../../types/domain";
import type {HistoricalCopyTarget} from "../../types/historyCopies";
import { createGraphJoinId, joinIdenticalHistories, keepLocalHistories, reviewGraphJoin, reviewRemoteProject } from "../../lib/api/projectRemoteReview";
import { getApiErrorMessage } from "../../lib/api/client";
import type { GraphJoinProof, GraphJoinResolution, ProjectRemoteReview, RemoteProjectChange } from "../../types/projectRemoteReview";
const labels = { added: "Añadido", deleted: "Eliminado", modified: "Modificado", renamed: "Renombrado", "type-changed": "Tipo cambiado" };
export function ProjectRemoteReviewDialog({ projectId, projectName, onClose, onOpenDocument,onLocalTreeChanged,onLocalTreeUnavailable,beforeApply,onApplicationChanged }: {
  projectId: string; projectName: string; onClose: () => void; onOpenDocument: (id: string, name: string) => void;
  beforeApply?:()=>Promise<boolean>;onApplicationChanged?:()=>void;
  onLocalTreeUnavailable?:(projectId:string,message:string)=>void;
  onLocalTreeChanged?:(projectId:string,tree:DocumentTreeNode[])=>void;
}) {
  const [review, setReview] = useState<ProjectRemoteReview | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [side, setSide] = useState<"local" | "remote">("local"); const [overlapOnly, setOverlapOnly] = useState(false);
  const [limit, setLimit] = useState(50); const epoch = useRef(0);
  const [confirmJoin,setConfirmJoin]=useState<Exclude<GraphJoinResolution,"mixed">|null>(null);
  const [acknowledgedRemote,setAcknowledgedRemote]=useState(false);
  const [attempt,setAttempt]=useState<{id:string;revision:string;target?:string;resolution?:GraphJoinResolution}|null>(null);
  const [proof,setProof]=useState<GraphJoinProof|null>(null);
  const [mixedTarget,setMixedTarget]=useState<{id?:string}|null>(null);
  const [copyTarget,setCopyTarget]=useState<HistoricalCopyTarget|null>(null);
  const writing=useRef(false);
  async function load() {
    const turn = ++epoch.current; setBusy(true); setError(""); setReview(null);setConfirmJoin(null);setAcknowledgedRemote(false);setAttempt(null);setProof(null);
    try { const result = await reviewRemoteProject(projectId); if (turn === epoch.current) {
      if (result.projectId !== projectId || result.schemaVersion !== 1) throw Error("La revisión no corresponde a este proyecto o formato.");
      setReview(result); setLimit(50);
    } } catch (failure) { if (turn === epoch.current) setError(getApiErrorMessage(failure, "No se pudo revisar el historial conocido. Las fuentes se conservan.")); }
    finally { if (turn === epoch.current) setBusy(false); }
  }
  useEffect(() => { writing.current=false;setCopyTarget(null);void load(); return () => { ++epoch.current; }; }, [projectId]);
  async function join(){
    if(!review||!confirmJoin||writing.current||busy||attempt||(confirmJoin==="keep-local"&&!acknowledgedRemote))return;
    const resolution=confirmJoin;const turn=epoch.current;writing.current=true;setBusy(true);setError("");setConfirmJoin(null);
    try{
      const id=createGraphJoinId();setAttempt({id,revision:review.revision,resolution});
      const result=await(resolution==="keep-local"?keepLocalHistories(projectId,review,id,acknowledgedRemote):joinIdenticalHistories(projectId,review,id));
      if(turn===epoch.current)setProof(result);
    }catch(failure){if(turn===epoch.current)setError(getApiErrorMessage(failure,"Publicación no confirmada. Consulta el recibo sin repetir."));}
    finally{if(turn===epoch.current){writing.current=false;setBusy(false);}}
  }
  async function consult(selected:{id:string;revision:string;target?:string;resolution?:GraphJoinResolution}){
    if(writing.current||busy)return;const turn=epoch.current;writing.current=true;setAttempt(selected);setProof(null);setBusy(true);setError("");setConfirmJoin(null);
    try{const result=await reviewGraphJoin(projectId,selected.id);
      if(result.status!=="absent"&&(result.reviewedRevision!==selected.revision||(selected.target&&result.targetCommit!==selected.target)||(result.resolution??"identical")!==(selected.resolution??"identical")))throw Error("El recibo no corresponde a la preparación seleccionada.");
      if(turn===epoch.current)setProof(result);
    }catch(failure){if(turn===epoch.current)setError(getApiErrorMessage(failure,"No se pudo comprobar la reunión. El intento se conserva y no se repite."));}
    finally{if(turn===epoch.current){writing.current=false;setBusy(false);}}
  }
  const items = (review?.[side] ?? []).filter(item => !overlapOnly || item.overlap);
  const coincidences = review ? [...review.local, ...review.remote].filter(item => item.overlap).length : 0;
  function row(item: RemoteProjectChange, index: number) {
    return <li key={`${side}:${index}:${item.path}`} className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{item.path}</p>{item.previousPath && <p className="mt-1 break-all text-xs text-ink-secondary">Antes: {item.previousPath}</p>}
        <p className="mt-1 text-xs text-ink-secondary">{labels[item.change]} · {item.kind === "markdown" ? "Documento" : item.kind === "resource" ? "Recurso" : "Tipo que requiere revisión manual"}{item.overlap ? item.identical ? " · Mismo resultado registrado" : " · Rutas coincidentes: revisar" : ""}</p></div>
        <div className="flex flex-wrap gap-1">{item.canOpen && item.documentId && <button className="min-h-11 shrink-0 rounded px-2 text-xs font-medium text-brand-dark hover:bg-brand-hover" onClick={() => onOpenDocument(item.documentId!, item.path.split("/").pop() ?? item.path)}>Abrir documento</button>}{item.canRecover&&review&&<button disabled={busy||!!confirmJoin} className="min-h-11 shrink-0 rounded px-2 text-xs font-medium text-brand-dark hover:bg-brand-hover disabled:opacity-50" onClick={()=>setCopyTarget({kind:"source",source:{revision:review.revision,side:item.side,path:item.path}})}>Recuperar copia</button>}</div></div>
    </li>;
  }
  return <>{!mixedTarget&&<ModalFrame label="Revisión del historial remoto conocido" onClose={onClose} className="!z-[170]">
    <section className="flex max-h-[calc(100dvh-24px)] w-full max-w-[800px] flex-col rounded-xl bg-white p-4 shadow-menu sm:p-6">
      <header className="shrink-0"><h2 className="text-base font-semibold">Revisar divergencia del proyecto</h2><p className="mt-1 break-words text-sm text-ink-secondary">{projectName} · Consultar conserva los archivos.</p></header>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {!confirmJoin&&<p className="text-xs leading-5 text-ink-secondary">Versiones guardadas y remoto conocido, que puede estar desactualizado. Los borradores y cambios sin registrar quedan fuera.</p>}
        {busy && <p role="status" className="mt-3 text-sm">{writing.current?"Comprobando la reunión local…":"Revisando versiones conocidas…"}</p>}{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {attempt&&<section className="mt-3 rounded-lg bg-panel p-3" aria-label="Recibo de reunión local"><p className="text-sm font-medium">{proof?.status==="confirmed"?"Historiales reunidos localmente":proof?.status==="changed"?"Historial cambiado después de la preparación":proof?.status==="absent"?"No se ha encontrado el recibo":"Confirmación de la reunión pendiente"}</p><p className="mt-2 text-xs leading-5 text-ink-secondary">{proof?.message||"Conserva este intento. Consultarlo comprueba el historial; no vuelve a ejecutar la reunión."}</p><p className="mt-1 break-all text-[11px] text-ink-secondary">Intento: {attempt.id}</p></section>}
        {review && <><p className="mt-3 text-sm font-medium">{confirmJoin==="keep-local"?"Revisa los cambios del remoto conocido":proof?.status==="confirmed"&&review.localCommit!==proof.targetCommit?"Revisión conservada anterior a la reunión":review.relation === "diverged" ? "Ambos lados tienen versiones propias" : review.relation === "up-to-date" ? "Las versiones conocidas coinciden" : review.relation === "local-ahead" ? "Versiones propias en este equipo" : "Versiones propias en el remoto conocido"}</p>
          {review.graphJoin&&proof?.status!=="confirmed"&&confirmJoin!=="keep-local"&&<p className="mt-2 text-xs leading-5 text-ink-secondary">{review.graphJoin.message}</p>}
          <div className="mt-3 grid grid-cols-2 gap-1 sm:flex" role="group" aria-label="Lado del historial"><button aria-pressed={side === "local"} onClick={() => { setSide("local"); setLimit(50); }} className="min-h-11 rounded px-2 text-xs aria-pressed:bg-brand-hover aria-pressed:text-brand-dark sm:px-3 sm:text-sm">Este equipo · {review.local.length}</button><button aria-pressed={side === "remote"} onClick={() => { setSide("remote"); setLimit(50); }} className="min-h-11 rounded px-2 text-xs aria-pressed:bg-brand-hover aria-pressed:text-brand-dark sm:px-3 sm:text-sm">Remoto conocido · {review.remote.length}</button></div>
          {confirmJoin!=="keep-local"&&<>          <label className="mt-2 flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={overlapOnly} onChange={event => { setOverlapOnly(event.target.checked); setLimit(50); }} />Solo cambios con rutas coincidentes · {coincidences}</label>
          <p className="text-xs leading-5 text-ink-secondary">Coincidencias de rutas; no confirman conflictos de texto.</p>
</>}
          <ul className="mt-2 divide-y divide-line">{items.slice(0, limit).map(row)}</ul>{!items.length && <p className="py-4 text-sm text-ink-secondary">No hay cambios con este filtro.</p>}{items.length > limit && <button className="min-h-11 rounded px-3 text-sm underline" onClick={() => setLimit(value => value + 50)}>Mostrar 50 más · {items.length - limit} restantes</button>}
          <details className="mt-3 text-xs"><summary className="cursor-pointer py-3">Base de la revisión</summary><p className="break-all leading-6">Equipo: {review.localCommit.slice(0,12)} · Remoto conocido: {review.remoteCommit.slice(0,12)} · Base: {review.baseCommit.slice(0,12)}</p><p className="mt-1">Consultado: {new Date(review.checkedAt).toLocaleString()}</p><p className="mt-2 leading-5">Abre un documento para comparar su texto desde Historial.</p>{review.warnings.map(warning => <p key={warning} className="mt-2 leading-5 text-ink-secondary">{warning}</p>)}</details>
          {review.relation==="diverged"&&<button disabled={busy} onClick={()=>setMixedTarget({})} className="mt-3 min-h-11 rounded px-3 text-xs font-semibold text-brand-dark hover:bg-brand-hover disabled:opacity-50">Combinación por archivo…</button>}
          {!!review.mixedSelections?.items.length&&<details className="mt-3 text-xs"><summary className="cursor-pointer py-3">Selecciones por archivo · {review.mixedSelections.items.length}</summary><ul>{review.mixedSelections.items.map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{new Date(item.createdAt).toLocaleString()} · {item.paths} rutas</span><button disabled={busy} onClick={()=>setMixedTarget({id:item.id})} className="min-h-11 rounded px-2 font-medium text-brand-dark disabled:opacity-50">Revisar selección {item.id.slice(-8)}</button></li>)}</ul></details>}
          {review.mixedSelections?.limited&&<p role="status" className="mt-3 text-xs leading-5 text-brand-dark">El catálogo de selecciones es parcial. Las entradas no revisables se conservan.</p>}
          {!!review.graphJoins?.items.length&&<details className="mt-3 text-xs"><summary className="cursor-pointer py-3">Reuniones preparadas · {review.graphJoins.items.length}</summary><p className="leading-5 text-ink-secondary">Cada recibo se consulta por separado. Su presencia no confirma una publicación.</p><ul>{review.graphJoins.items.map(item=><li key={item.attemptId} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{new Date(item.createdAt).toLocaleString()} · {item.attemptId.slice(-8)}{item.resolution==="mixed"?" · Combinación verificada":item.resolution==="keep-local"?" · Versión del equipo":""}</span><button disabled={busy} className="min-h-11 rounded px-2 font-medium text-brand-dark disabled:opacity-50" onClick={()=>void consult({id:item.attemptId,revision:item.reviewedRevision,target:item.targetCommit,resolution:item.resolution})}>Consultar reunión {item.attemptId.slice(-8)}</button></li>)}</ul></details>}
          {review.graphJoins?.limited&&<p role="status" className="mt-3 text-xs leading-5 text-brand-dark">El catálogo de reuniones es parcial. Las entradas no revisables se conservan.</p>}
          {!!review.historyCopies?.items.length&&<details className="mt-3 text-xs"><summary className="cursor-pointer py-3">Copias del historial · {review.historyCopies.items.length}</summary><p className="leading-5 text-ink-secondary">Preparaciones conservadas. Consultar comprueba cada copia sin volver a crearla.</p><ul>{review.historyCopies.items.map(item=><li key={item.attemptId} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="min-w-0 break-all">{item.name}</span><button className="min-h-11 rounded px-2 font-medium text-brand-dark" onClick={()=>setCopyTarget({kind:"receipt",summary:item})}>Consultar copia {item.name}</button></li>)}</ul></details>}
          {review.historyCopies?.limited&&<p role="status" className="mt-3 text-xs leading-5 text-brand-dark">El catálogo de copias es parcial. El contenido no revisable se conserva.</p>}
        </>}
      </div>
      <footer className="mt-4 shrink-0">
        {confirmJoin==="identical"&&<p className="mb-2 text-xs leading-5">Se creará una versión local que conserva ambos historiales y los mismos archivos. Tus borradores permanecen. No se envía nada al remoto.</p>}
        {confirmJoin==="keep-local"&&<div className="mb-2 text-xs leading-5"><p>Todo el proyecto: versión guardada del equipo. Cambios remotos solo en el historial. Borradores intactos; sin envío al remoto.</p><label className="mt-2 flex min-h-11 items-center gap-2"><input type="checkbox" checked={acknowledgedRemote} onChange={event=>setAcknowledgedRemote(event.target.checked)}/>Entiendo que no se incorporarán los cambios remotos</label></div>}
        <div className="flex flex-wrap justify-end gap-2">
          {attempt&&<button disabled={busy} onClick={()=>void consult(attempt)} className="min-h-11 rounded px-2 text-xs font-medium text-brand-dark hover:bg-brand-hover disabled:opacity-50">Consultar este intento</button>}
          {!!review&&!attempt&&(review.graphJoin?.canJoin||review.graphJoin?.canKeepLocal)&&(confirmJoin?<><button disabled={busy} onClick={()=>setConfirmJoin(null)} className="min-h-11 rounded px-2 text-xs">Cancelar</button><button disabled={busy||(confirmJoin==="keep-local"&&!acknowledgedRemote)} onClick={()=>void join()} className="min-h-11 rounded bg-brand-orange px-3 text-xs font-semibold text-white disabled:opacity-50">{confirmJoin==="keep-local"?"Confirmar versión del equipo":"Confirmar reunión local"}</button></>:review.graphJoin?.canJoin?<button disabled={busy} onClick={()=>setConfirmJoin("identical")} className="min-h-11 rounded bg-brand-orange px-3 text-xs font-semibold text-white disabled:opacity-50">Reunir historiales</button>:<button disabled={busy} onClick={()=>{setConfirmJoin("keep-local");setAcknowledgedRemote(false);setSide("remote");setOverlapOnly(false);setLimit(50);}} className="min-h-11 rounded bg-brand-orange px-3 text-xs font-semibold text-white disabled:opacity-50">Conservar versión del equipo</button>)}
          {!confirmJoin&&<button disabled={busy} onClick={() => void load()} className="min-h-11 rounded px-2 text-xs hover:bg-panel disabled:opacity-50 sm:px-3 sm:text-sm">Volver a consultar</button>}<button onClick={onClose} className="min-h-11 rounded px-3 text-xs font-semibold hover:bg-panel sm:px-4 sm:text-sm">Cerrar revisión</button>
        </div>
      </footer>
    </section>
  </ModalFrame>}{mixedTarget&&<MixedSelectionDialog key={`${projectId}:${mixedTarget.id??"new"}`} projectId={projectId} initialPlanId={mixedTarget.id} projectName={projectName} beforeApply={beforeApply} onApplicationChanged={onApplicationChanged} onClose={()=>{setMixedTarget(null);void load();}} onOpenDocument={onOpenDocument}/>}{copyTarget&&<HistoricalResourceCopyDialog projectId={projectId} target={copyTarget} onCreated={onLocalTreeChanged} onTreeUnavailable={onLocalTreeUnavailable} onClose={()=>{setCopyTarget(null);void load();}}/>}</>;
}
