import {ProjectProtectionSummary} from "./ProjectProtectionSummary";
import {PortableHistoryDialog} from "../projects/PortableHistoryDialog";
import {PortableRecordingsDialog} from "../projects/PortableRecordingsDialog";
import {useEffect,useRef,useState,type ComponentProps} from "react";
import {createDeferredView} from "../../components/ui/createDeferredView";
import {RefreshCw} from "lucide-react";
import type {Project} from "../../types/domain";
import type {MixedApplication} from "../../types/mixedApplication";
import {getApiErrorMessage} from "../../lib/api/client";
import {getMixedRecoveryCatalog,type MixedRecoveryCatalog} from "../../lib/api/mixedRecovery";
import {getMixedApplication} from "../../lib/api/mixedApplication";
import {MixedBackupDialog} from "../externalChanges/MixedBackupDialog";
import {MixedPayloadRetentionDialog} from "../externalChanges/MixedPayloadRetentionDialog";
import {MixedRetirementDialog} from "../externalChanges/MixedRetirementDialog";
import {MixedIncompleteDialog} from "../externalChanges/MixedIncompleteDialog";
import type {StateTransitionAuthority} from "../../types/stateMigrations";
import {PortableDraftsDialog} from "../projects/PortableDraftsDialog";
import type {RecoveryCopy} from "../../types/recovery";
import {PortablePreferencesDialog} from "../projects/PortablePreferencesDialog";
import type {ProjectTransferDialog as ProjectTransferDialogView} from "../projects/ProjectTransferDialog";
const ProjectTransferDialog=createDeferredView<ComponentProps<typeof ProjectTransferDialogView>>(()=>import("../projects/ProjectTransferDialog").then(m=>({default:m.ProjectTransferDialog})),"Preparando transferencia…","No se pudo cargar la transferencia. Las copias se conservan; puedes volver a intentarlo.");
const action="min-h-11 max-w-full whitespace-normal break-words rounded-md bg-white px-3 text-xs font-medium hover:bg-brand-hover disabled:opacity-50";
const phase:Record<MixedApplication["phase"],string>={absent:"Sin preparación de archivos",preview:"Revisión sin aplicar",prepared:"Preparada",partial:"Aplicación interrumpida",blocked:"Revisión necesaria",completed:"Aplicación completada",changed:"Cambió el ámbito o el contenido",abandoned:"Preparación cerrada",retiring:"Retirada local interrumpida",retired:"Copias locales retiradas"};

export function ProjectRecoverySection({projects,activeProjectId,onBeforeChange,onSettled,onPortableCopy}:{projects:Project[];activeProjectId?:string;onPortableCopy?:(copy:RecoveryCopy)=>void}&StateTransitionAuthority){
 const[selected,setSelected]=useState(activeProjectId??projects[0]?.id??"");
 const project=projects.find(p=>p.id===selected);
 return <section aria-label="Preparaciones y traslado por proyecto"><h3 className="text-sm font-semibold">Preparaciones y traslado</h3><p className="mt-2 text-xs leading-5 text-ink-secondary">Elige un proyecto registrado para revisar sus variantes conservadas o preparar una copia de sus archivos. No cambia el proyecto abierto.</p><label className="mt-3 block text-xs">Proyecto de las copias<select aria-label="Proyecto de las copias" value={project?.id??""} onChange={e=>setSelected(e.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded border border-line bg-white px-2 text-sm"><option value="">Elige un proyecto…</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{project?<ProjectCopies key={project.id} project={project} onBeforeChange={onBeforeChange} onSettled={onSettled} onPortableCopy={onPortableCopy}/>:<p className="py-4 text-xs text-ink-secondary">Selecciona un proyecto registrado. Los proyectos retirados y las carpetas sin asociación no forman parte de esta consulta.</p>}</section>;
}
function ProjectCopies({project,onBeforeChange,onSettled,onPortableCopy}:{project:Project;onPortableCopy?:(copy:RecoveryCopy)=>void}&StateTransitionAuthority){
 const[history,setHistory]=useState(false);
 const[audio,setAudio]=useState(false);
 const[drafts,setDrafts]=useState(false);
 const[preferences,setPreferences]=useState(false);
 const[catalog,setCatalog]=useState<MixedRecoveryCatalog|null>(null),[detail,setDetail]=useState<{id:string;value:MixedApplication|null;error:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const[dialog,setDialog]=useState<{kind:"backup"|"retention"|"retirement"|"incomplete";id:string}|null>(null),[transfer,setTransfer]=useState(false);
 const alive=useRef(false),flight=useRef(false);
 async function run(work:()=>Promise<void>){if(flight.current)return;flight.current=true;setBusy(true);setError("");try{await work();}catch(cause){if(alive.current)setError(getApiErrorMessage(cause,"No se pudo consultar. Las copias se conservan."));}finally{flight.current=false;if(alive.current)setBusy(false);}}
 async function refresh(){await run(async()=>{setCatalog(null);setDetail(null);const value=await getMixedRecoveryCatalog(project.id);if(alive.current)setCatalog(value);});}
 async function inspect(id:string){await run(async()=>{setDetail(null);try{const value=await getMixedApplication(project.id,id);if(alive.current)setDetail({id,value,error:""});}catch(cause){if(alive.current)setDetail({id,value:null,error:getApiErrorMessage(cause,"No se pudo revisar la preparación completa.")});}});}
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;};},[]);
 function closeDetail(){const id=dialog?.id;setDialog(null);if(id)void inspect(id);}
 const value=detail?.value;
 const closed=!!value&&(value.phase==="completed"||value.phase==="abandoned"||value.phase==="changed"&&value.canAbandon===false);
 return <div className="mt-3 space-y-4"><ProjectProtectionSummary projectId={project.id}/><section className="rounded-lg bg-panel p-3"><h4 className="text-sm font-medium">Trasladar archivos y recursos</h4><p className="mt-2 text-xs leading-5 text-ink-secondary">El paquete permite crear otro proyecto con sus archivos. Opcionalmente añade un archivo privado de borradores, historial alcanzable, audio detenido y preferencias visuales; esas copias no se activan al importar.</p><button className={`${action} mt-2`} disabled={busy} onClick={()=>setTransfer(true)}>Preparar paquete de {project.name}…</button><button className={`${action} mt-2`} disabled={busy} onClick={()=>setPreferences(true)}>Revisar preferencias del archivo…</button><button className={`${action} mt-2`} disabled={busy} onClick={()=>setDrafts(true)}>Revisar borradores del archivo…</button><button className={`${action} mt-2`} disabled={busy} onClick={()=>setAudio(true)}>Revisar audio del archivo…</button><button className={`${action} mt-2`} disabled={busy} onClick={()=>setHistory(true)}>Revisar historial del archivo…</button></section>
 <section><header className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium">Variantes por archivo</h4><button className={`${action} flex items-center gap-2`} disabled={busy} onClick={()=>void refresh()}><RefreshCw size={14}/>Actualizar preparaciones</button></header><p className="mt-2 text-xs leading-5 text-ink-secondary">Consulta local del catálogo conservado. No depende de la conexión remota ni reanuda una aplicación.</p>
 {busy&&<p role="status" className="py-3 text-xs">Consultando {project.name}…</p>}{error&&<p role="alert" className="mt-2 break-words text-xs text-red-700">{error}</p>}{catalog?.limited&&<p role="status" className="mt-2 text-xs text-brand-dark">Catálogo parcial: puede haber preparaciones no revisables que se conservan.</p>}{!!catalog?.warnings.length&&<details className="mt-2 text-xs text-ink-secondary"><summary className="min-h-11 cursor-pointer py-3">Avisos de la consulta ({catalog.warnings.length})</summary>{catalog.warnings.map((w,i)=><p key={i} className="mb-2 break-words leading-5">{w}</p>)}</details>}
 {catalog&&!busy&&!catalog.items.length&&<p className="py-4 text-xs text-ink-secondary">{catalog.limited?"No se encontraron selecciones legibles en la parte revisada.":"No hay selecciones conservadas en este catálogo."}</p>}
 <ul className="mt-2 space-y-2">{catalog?.items.map(item=><li key={item.id} className="rounded-lg bg-panel p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="text-xs font-medium">{item.paths} {item.paths===1?"ruta":"rutas"} · {new Date(item.createdAt).toLocaleString("es-ES")}</p><p className="mt-1 text-[11px] text-ink-secondary">Selección {item.id.slice(-8)}</p></div><button className={action} disabled={busy} onClick={()=>void inspect(item.id)}>Revisar preparación</button></div>{detail?.id===item.id&&<div className="mt-3 space-y-2 text-xs leading-5" aria-label={`Preparación ${item.id.slice(-8)}`}>
 {detail.error&&<p role="alert" className="break-words text-red-700">{detail.error}</p>}{value&&<><p className="font-medium">{phase[value.phase]}</p>{value.message&&<p className="break-words text-ink-secondary">{value.message}</p>}{value.rows.length>0&&<p>{value.rows.length} rutas revisadas · {value.appliedCount??0} con contenido elegido observado.</p>}{!closed&&value.phase!=="retired"&&value.phase!=="retiring"&&<p className="text-ink-secondary">La continuación y la aplicación de archivos se revisan desde Guardado y sincronización.</p>}</>}
 <div className="flex flex-wrap gap-2">{closed&&<><button className={action} disabled={busy} onClick={()=>setDialog({kind:"backup",id:item.id})}>Respaldar variantes…</button><button className={action} disabled={busy} onClick={()=>setDialog({kind:"retention",id:item.id})}>Reducir espacio…</button></>}{(closed||value?.phase==="retiring"||value?.phase==="retired")&&<button className={action} disabled={busy} onClick={()=>setDialog({kind:"retirement",id:item.id})}>{value?.phase==="retired"?"Consultar retirada…":"Retirar copias locales…"}</button>}{detail.error&&<button className={action} disabled={busy} onClick={()=>setDialog({kind:"incomplete",id:item.id})}>Extraer una copia legible…</button>}</div></div>}</li>)}</ul>
 <p className="mt-3 text-[11px] leading-5 text-ink-secondary">Puede haber otras copias fuera de este catálogo. Revisar una preparación conserva sus archivos; respaldar o reducir espacio exige una revisión propia.</p></section>
 {history&&<PortableHistoryDialog projectId={project.id} projectName={project.name} onClose={()=>setHistory(false)} onBeforeChange={onBeforeChange} onSettled={onSettled}/>}
 {audio&&<PortableRecordingsDialog projectId={project.id} projectName={project.name} onClose={()=>setAudio(false)}/>}
 {drafts&&<PortableDraftsDialog projectId={project.id} projectName={project.name} onClose={()=>setDrafts(false)} onBeforeChange={onBeforeChange} onSettled={onSettled} onViewCopy={onPortableCopy?copy=>{setDrafts(false);onPortableCopy(copy);}:undefined}/>}
 {preferences&&<PortablePreferencesDialog projectId={project.id} projectName={project.name} onClose={()=>setPreferences(false)} onBeforeChange={onBeforeChange} onSettled={onSettled}/>}
 {transfer&&<ProjectTransferDialog mode={{kind:"export",projectId:project.id,projectName:project.name}} onClose={()=>setTransfer(false)} onImported={()=>{}}/>}
 {dialog?.kind==="backup"&&<MixedBackupDialog projectId={project.id} planId={dialog.id} projectName={project.name} onClose={closeDetail}/>}{dialog?.kind==="retention"&&<MixedPayloadRetentionDialog projectId={project.id} planId={dialog.id} onClose={closeDetail}/>}{dialog?.kind==="retirement"&&<MixedRetirementDialog projectId={project.id} planId={dialog.id} projectName={project.name} onClose={closeDetail}/>}{dialog?.kind==="incomplete"&&<MixedIncompleteDialog projectId={project.id} planId={dialog.id} projectName={project.name} onClose={closeDetail}/>}</div>;
}
