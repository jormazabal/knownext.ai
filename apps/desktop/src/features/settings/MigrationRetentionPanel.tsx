import {useEffect,useRef,useState} from "react";
import {listUpgradeRecoveries} from "../../lib/api/stateMigrations";
import {reviewMigrationRetention,changeMigrationRetention} from "../../lib/api/migrationRetention";
import {getApiErrorMessage} from "../../lib/api/client";
import type {UpgradeCatalog} from "../../types/stateMigrations";
import type {MigrationRetentionAction,MigrationRetentionReview} from "../../types/migrationRetention";
export function MigrationRetentionPanel({enabled,english=false,initialId,onChanged}:{enabled:boolean;english?:boolean;initialId?:string;onChanged:()=>void}){
 const[open,setOpen]=useState(false),[catalog,setCatalog]=useState<UpgradeCatalog|null>(null),[id,setId]=useState(initialId??""),[review,setReview]=useState<MigrationRetentionReview|null>(null),[fresh,setFresh]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[confirmed,setConfirmed]=useState(false);
 const epoch=useRef(0),mounted=useRef(true),inFlight=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;};},[]);
 useEffect(()=>{if(initialId){setId(initialId);setReview(null);setFresh(false);setConfirmed(false);}},[initialId]);
 async function inspect(chosen=id,preserveFeedback=false){
  if(inFlight.current)return;const sequence=++epoch.current;setBusy(true);setFresh(false);if(!preserveFeedback)setError("");setConfirmed(false);
  try{const[next,value]=await Promise.all([listUpgradeRecoveries(),chosen?reviewMigrationRetention(chosen):Promise.resolve(null)]);if(mounted.current&&epoch.current===sequence){setCatalog(next);setReview(value);setFresh(Boolean(value));}}
  catch(cause){if(mounted.current&&epoch.current===sequence)setError(getApiErrorMessage(cause,english?"Copies could not be reviewed. They remain unchanged.":"No se pudieron revisar las copias. Se conservan sin cambios."));}
  finally{if(mounted.current&&epoch.current===sequence)setBusy(false);}
 }
 useEffect(()=>{setReview(null);setFresh(false);setConfirmed(false);setNotice("");if(open)void inspect(id);else epoch.current++;},[open,id]);
 async function change(action:MigrationRetentionAction){
  if(!enabled||inFlight.current||busy||!fresh||!review||review.id!==id||(action==="delete"&&!confirmed))return;
  inFlight.current=true;setBusy(true);setFresh(false);setError("");setNotice("");let deleted=false;
  try{const result=await changeMigrationRetention(review.id,review.revision,action,confirmed);if(!mounted.current)return;setNotice(result.message);setReview(null);setConfirmed(false);deleted=result.status==="deleted";if(deleted)setId("");onChanged();}
  catch(cause){if(mounted.current)setError(getApiErrorMessage(cause,english?"No confirmation received. Review the point; do not repeat the action automatically.":"No se recibió confirmación. Revisa el punto; no se repite la acción automáticamente."));}
  finally{inFlight.current=false;if(mounted.current){setBusy(false);if(!deleted)void inspect(id,true);}}
 }
 const button="min-h-11 rounded px-3 text-xs font-medium hover:bg-white disabled:opacity-50";
 return <details open={open} onToggle={event=>setOpen(event.currentTarget.open)} className="mt-3 border-t border-line pt-1"><summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">{english?"Manage recovery point copies":"Gestionar copias de los puntos"}</summary><div aria-busy={busy} className="space-y-3 pb-2 text-xs leading-5">
  <p className="text-ink-secondary">{english?"Archive keeps all copies without freeing space and disables recovery until reopened. Deletion removes only the reviewed point. Documents and active data remain. Nothing expires automatically.":"Archivar conserva todas las copias sin liberar espacio y desactiva su recuperación hasta reabrir el punto. Eliminar retira solo el punto revisado. Los documentos y datos activos se conservan. No hay caducidad automática."}</p>
  <label className="block">{english?"Recovery point":"Punto de recuperación"}<select value={id} disabled={busy} onChange={event=>{epoch.current++;setId(event.target.value);}} className="mt-1 min-h-11 w-full min-w-0 rounded border border-line bg-white px-2"><option value="">{english?"Choose a point":"Elige un punto"}</option>{id&&!catalog?.entries.some(entry=>entry.id===id)&&<option value={id}>{id}</option>}{catalog?.entries.map(entry=><option key={entry.id} value={entry.id}>{entry.createdAt?new Date(entry.createdAt).toLocaleString(english?"en-GB":"es-ES"):entry.id}{entry.retentionStatus==="archived"?(english?" · archived":" · archivado"):entry.retentionStatus==="deleting"?(english?" · deletion pending":" · eliminación pendiente"):""}</option>)}</select></label>
  <button type="button" className={button} disabled={busy} onClick={()=>void inspect()}>{english?"Review copies":"Revisar copias del punto"}</button>
  {busy&&<p role="status">{english?"Reviewing the point…":"Revisando el punto…"}</p>}{error&&<p role="alert" className="break-words text-red-700">{error}</p>}{notice&&<p role="status" className="break-words">{notice}</p>}
  {catalog?.limited&&<p>{english?"Partial listing. Other points remain on disk.":"Listado parcial. Los otros puntos permanecen en disco."}</p>}
  {review&&review.id===id&&<><p>{review.phase==="absent"?(english?"Point no longer available":"El punto ya no está disponible"):review.phase==="active"?(english?"Active recovery point":"Punto activo"):review.phase==="archived"?(english?"Archived · copies preserved":"Archivado · copias conservadas"):(english?"Deletion interrupted · never resumed automatically":"Eliminación interrumpida · sin reanudación automática")} · {review.files} {english?"files":"archivos"} · {new Intl.NumberFormat(english?"en-GB":"es-ES").format(review.logicalBytes)} bytes</p>{review.warnings.map((warning,index)=><p key={index} className="text-ink-secondary">{warning}</p>)}
  <div className="flex flex-wrap gap-1">{review.canArchive&&<button type="button" className={button} disabled={!enabled||!fresh||busy} onClick={()=>void change("archive")}>{english?"Archive point":"Archivar punto"}</button>}{review.canReopen&&<button type="button" className={button} disabled={!enabled||!fresh||busy} onClick={()=>void change("reopen")}>{english?"Reopen point":"Reabrir punto"}</button>}</div>
  {review.canDelete&&<div><label className="flex min-h-11 cursor-pointer items-start gap-2 py-2"><input type="checkbox" checked={confirmed} disabled={busy||!enabled||!fresh} onChange={event=>setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-brand-dark"/><span>{english?"I understand these recovery copies will be permanently deleted. Other copies are not guaranteed.":"Entiendo que estas copias de recuperación se eliminarán definitivamente. No se garantiza que existan otras copias."}</span></label><button type="button" className={`${button} text-red-700`} disabled={!enabled||!fresh||busy||!confirmed} onClick={()=>void change("delete")}>{review.phase==="deleting"?(english?"Finish reviewed deletion":"Completar eliminación revisada"):(english?"Delete reviewed point":"Eliminar punto revisado")}</button></div>}
  {!enabled&&<p className="text-ink-secondary">{english?"Read-only view. Manage copies from the protected workspace.":"Vista de consulta. Gestiona las copias desde el espacio de trabajo protegido."}</p>}</>}
 </div></details>;
}
