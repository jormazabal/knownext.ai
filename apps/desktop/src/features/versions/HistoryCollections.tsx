import {useId,useRef,useState} from "react";
import {useHistoryGroups} from "./useHistoryGroups";
import type {HistoryGroup,HistoryGroupFilter,HistoryGroupIntent} from "../../types/historyGroups";
type Draft={id:string;action:"create"|"rename";title:string;description:string;versionId?:string;versionLabel?:string};
export function HistoryCollections({documentId,versionId,versionLabel,selectedGroupId,onFilter}:{documentId:string;versionId:string|null;versionLabel:string;selectedGroupId:string;onFilter:(filter:HistoryGroupFilter|null)=>void}){
  const[open,setOpen]=useState(false),[archived,setArchived]=useState(false),[draft,setDraft]=useState<Draft|null>(null),[validation,setValidation]=useState(""),[observedNotice,setObservedNotice]=useState("");
  const summaryRef=useRef<HTMLElement|null>(null);
  function finish(){setOpen(false);requestAnimationFrame(()=>summaryRef.current?.focus({preventScroll:true}));}
  const current=useRef({selectedGroupId,onFilter});current.current={selectedGroupId,onFilter};
  const state=useHistoryGroups(documentId,(snapshot,readOnly)=>{
    if(readOnly&&draft){const found=snapshot.groups.find(group=>group.id===draft.id);if(found&&found.title===draft.title.trim()&&found.description===draft.description.trim()&&(draft.action==="rename"||(!found.retired&&!!draft.versionId&&found.documentVersionIds.includes(draft.versionId)))){setDraft(null);finish();setObservedNotice("Colección confirmada al comprobar el estado. No se repitió el guardado.");current.current.onFilter(filter(found));return;}}
    const id=current.current.selectedGroupId;if(!id)return;const group=snapshot.groups.find(group=>group.id===id);current.current.onFilter(group?filter(group):null);
  });
  const id=useId(),groups=state.snapshot?.groups??[],selected=groups.find(group=>group.id===selectedGroupId),disabled=state.busy||state.observeFirst||!state.snapshot;
  const button="min-h-11 rounded px-2 text-xs font-medium text-brand-dark hover:bg-brand-hover disabled:opacity-50";
  async function save(){if(!draft)return;setObservedNotice("");setValidation("");if(!draft.title.trim()){setValidation("Escribe un nombre para la colección.");return;}
    let intent:HistoryGroupIntent;
    if(draft.action==="create"){if(!draft.versionId){setValidation("Elige una versión guardada antes de crear la colección.");return;}intent={action:"create",groupId:draft.id,title:draft.title.trim(),description:draft.description.trim(),versionId:draft.versionId};}
    else intent={action:"rename",groupId:draft.id,title:draft.title.trim(),description:draft.description.trim()};
    const observed=await state.change(intent);if(!observed)return;const group=observed.groups.find(group=>group.id===draft.id);if(group)onFilter(filter(group));setDraft(null);finish();
  }
  async function perform(intent:HistoryGroupIntent){setObservedNotice("");if(await state.change(intent))finish();}
  return <><details open={open} onToggle={event=>{const expanded=event.currentTarget.open;setOpen(expanded);if(expanded&&!state.snapshot&&!state.busy)void state.read();}} className="mb-3 text-xs leading-5">
    <summary ref={summaryRef} className="min-h-11 cursor-pointer py-3 font-semibold">Colecciones de versiones</summary>
    <p className="text-ink-secondary">Colecciones locales para entregas o revisiones. Archivar conserva todas las referencias.</p>
    {!draft&&<button type="button" disabled={state.busy} className={button} onClick={()=>void state.read()}>{state.observeFirst?"Comprobar estado":"Actualizar colecciones"}</button>}
    {state.busy&&!draft&&<p role="status">Consultando o conservando la colección…</p>}{state.error&&!draft&&<p role="alert" className="mt-2 break-words text-red-700">{state.error} Comprueba el estado antes de otro cambio.</p>}
    {state.snapshot&&<>
      <p className="mt-1 text-[11px] text-ink-secondary">{groups.length}/{state.snapshot.groupLimit} colecciones, incluidas archivadas.</p>
      <label htmlFor={`${id}-group`} className="mt-2 block">Colección<select id={`${id}-group`} value={selectedGroupId} disabled={state.busy} onChange={event=>{const group=groups.find(group=>group.id===event.target.value);onFilter(group?filter(group):null);}} className="mt-1 min-h-11 w-full min-w-0 rounded border border-line bg-white px-2"><option value="">Todo el historial</option>{groups.filter(group=>archived||!group.retired||group.id===selectedGroupId).map(group=><option key={group.id} value={group.id}>{group.title}{group.retired?" · archivada":""} · {group.documentVersionIds.length} aquí</option>)}</select></label>
      <label className="mt-1 flex min-h-11 items-center gap-2"><input type="checkbox" checked={archived} onChange={event=>setArchived(event.target.checked)} className="accent-brand-orange"/>Mostrar archivadas</label>
      {selected&&<><p className="mt-1 break-words font-semibold">{selected.title}</p>{selected.description&&<p className="break-words text-ink-secondary">{selected.description}</p>}<p className="mt-1 text-ink-secondary">{selected.referenceCount} referencias en el proyecto · {selected.documentVersionIds.length} versiones de este documento.</p></>}
      {versionId&&<p className="mt-2 break-words">Versión elegida: {versionLabel}</p>}
      <div className="mt-2 flex flex-wrap gap-1"><button type="button" disabled={disabled||!versionId} className={button} onClick={()=>{setDraft({action:"create",id:`history-group-${crypto.randomUUID()}`,title:"",description:"",versionId:versionId??undefined,versionLabel});setValidation("");setObservedNotice("");}}>Nueva colección</button>
        {selected&&<><button type="button" disabled={disabled} className={button} onClick={()=>{setDraft({action:"rename",id:selected.id,title:selected.title,description:selected.description});setValidation("");}}>Editar colección</button>
          {selected.retired?<button type="button" disabled={disabled} className={button} onClick={()=>void perform({action:"reopen",groupId:selected.id})}>Reabrir colección</button>:<><button type="button" disabled={disabled||!versionId} className={button} onClick={()=>{if(versionId)void perform({action:selected.documentVersionIds.includes(versionId)?"remove":"add",groupId:selected.id,versionId});}}>{versionId&&selected.documentVersionIds.includes(versionId)?"Quitar versión de la colección":"Añadir versión elegida"}</button><button type="button" disabled={disabled} className={button} onClick={()=>void perform({action:"retire",groupId:selected.id})}>Archivar colección</button></>}</>}
      </div>
      {draft&&<form className="mt-3 space-y-2 rounded bg-panel p-3" onSubmit={event=>{event.preventDefault();void save();}}><p className="font-semibold">{draft.action==="create"?"Nueva colección":"Editar colección"}</p>{draft.action==="create"&&<p className="break-words text-ink-secondary">Se incluirá: {draft.versionLabel}</p>}<label className="block">Nombre de la colección<input autoFocus maxLength={120} value={draft.title} disabled={state.busy} onChange={event=>setDraft({...draft,title:event.target.value})} className="mt-1 min-h-11 w-full min-w-0 rounded border border-line bg-white px-2"/></label><label className="block">Descripción (opcional)<input maxLength={500} value={draft.description} disabled={state.busy} onChange={event=>setDraft({...draft,description:event.target.value})} className="mt-1 min-h-11 w-full min-w-0 rounded border border-line bg-white px-2"/></label>{validation&&<p role="alert" className="text-red-700">{validation}</p>}{state.busy&&<p role="status">Conservando o comprobando la colección…</p>}{state.error&&<p role="alert" className="text-red-700">{state.error} Los campos se conservan.</p>}{state.observeFirst&&<button type="button" disabled={state.busy} className={button} onClick={()=>void state.read()}>Comprobar estado</button>}<div className="flex flex-wrap gap-1"><button type="submit" disabled={disabled} className={button}>Guardar colección</button><button type="button" disabled={state.busy} className={button} onClick={()=>{setDraft(null);setValidation("");}}>Cancelar edición</button></div></form>}
    </>}
  </details>{!draft&&(observedNotice||state.notice)&&<p role="status" className="mb-3 text-[11px] leading-5 text-ink-secondary">{observedNotice||state.notice}</p>}</>;
}
function filter(group:HistoryGroup):HistoryGroupFilter{return{id:group.id,title:group.title+(group.retired?" · archivada":""),versionIds:group.documentVersionIds};}
