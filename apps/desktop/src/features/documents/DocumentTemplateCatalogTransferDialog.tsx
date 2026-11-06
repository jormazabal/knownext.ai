import {useEffect,useState} from "react";
import {X} from "lucide-react";
import {ModalFrame} from "../../components/ui/ModalFrame";
import {ReadonlyMarkdownViewer} from "../editor/ReadonlyMarkdownViewer";
import {useDocumentTemplateCatalogTransfer,type TemplateCatalogTransferMode} from "./useDocumentTemplateCatalogTransfer";
import type {DocumentTemplate} from "../../types/documentTemplates";

export function DocumentTemplateCatalogTransferDialog({mode,onClose,onImported}:{mode:TemplateCatalogTransferMode;onClose:()=>void;onImported:(template:DocumentTemplate)=>void|Promise<void>}){
  const state=useDocumentTemplateCatalogTransfer(mode,onImported);
  const[resourcesReviewed,setResourcesReviewed]=useState(false);
  const[previewIndex,setPreviewIndex]=useState(0);
  const[contentOpen,setContentOpen]=useState(false);
  const isImport=mode.kind==="import-catalog",title=isImport?"Importar catálogo de plantillas":"Compartir varias plantillas";
  const previews=state.review?.catalog??[];
  const selectedKey=[...state.selected].sort((a,b)=>a-b).join(",");
  useEffect(()=>setResourcesReviewed(false),[state.review?.digest,selectedKey]);
  const resources=previews.filter(item=>state.selected.has(item.index)).flatMap(item=>item.resources??[]);
  const preview=previews.find(item=>item.index===previewIndex)??previews[0];
  const newCount=state.result?.outcomes.filter(item=>item.status==="new").length??0;
  const importedCount=state.result?.outcomes.filter(item=>item.status==="imported").length??0;
  const primaryLabel=isImport?(state.needsReview?"Revisar importación":newCount?`Importar ${newCount} ${newCount===1?"plantilla":"plantillas"}`:"Sin plantillas nuevas"):(state.file?"Elegir destino…":"Preparar selección");
  return <ModalFrame label={title} onClose={()=>{if(!state.running.current)onClose();}}>
    <section aria-busy={state.busy} className="flex max-h-[calc(100dvh-24px)] w-full max-w-[740px] flex-col overflow-hidden rounded-lg bg-white shadow-menu">
      <header className="flex shrink-0 items-center justify-between gap-2 px-4 py-2"><h2 className="text-base font-semibold">{title}</h2><button type="button" aria-label="Cerrar catálogo" disabled={state.busy} onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded hover:bg-panel"><X size={18}/></button></header>
      <div className="min-h-0 overflow-y-auto px-4 py-3 text-sm">
        <p className="text-xs leading-5 text-ink-secondary">Selecciona hasta 32 plantillas. Solo viajan nombre, descripción y contenido, incluidas sus imágenes embebidas; no configuración, credenciales ni valores rellenados. El archivo completo admite hasta 2 MiB.</p>
        {isImport&&<p className="mt-2 text-xs leading-5">Revisa los nombres antes de crear. Las plantillas existentes se conservan; un contenido idéntico no se duplica.</p>}
        <p className="my-3 break-words text-xs text-ink-secondary [overflow-wrap:anywhere]">{state.selected.size}/32 seleccionadas · {isImport?mode.file.fileName:state.file?.fileName??"Catálogo personal e inicial"}</p>
        <fieldset disabled={state.busy} className="min-w-0 space-y-2"><legend className="sr-only">Plantillas que se trasladarán</legend>
          {state.items.map(item=>{const outcome=state.result?.outcomes.find(entry=>entry.index===item.index);return <div key={item.index} className="min-w-0 rounded bg-panel px-3 py-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-xs font-medium"><input type="checkbox" checked={state.selected.has(item.index)} disabled={!state.selected.has(item.index)&&state.selected.size>=32} onChange={()=>state.toggle(item.index)} className="accent-brand-dark"/><span className="min-w-0 break-words [overflow-wrap:anywhere]">{item.name}</span></label>
            {isImport&&state.selected.has(item.index)&&<label className="block pb-2 text-xs">Nombre en tu catálogo · {item.index+1}<input value={state.names[item.index]??item.name} maxLength={240} onChange={event=>state.rename(item.index,event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded border border-line bg-white px-3"/></label>}
            {item.description&&<p className="break-words text-xs leading-5 text-ink-secondary [overflow-wrap:anywhere]">{item.description}</p>}
            {outcome&&<p className={`break-words text-xs leading-5 ${outcome.status==="conflict"||outcome.status==="blocked"||outcome.status==="unconfirmed"?"text-red-700":"text-ink-secondary"}`}><span className="font-medium">{outcome.status==="imported"?"Creada":outcome.status==="existing"?"Ya disponible":outcome.status==="new"?"Nueva":outcome.status==="conflict"?"Nombre en uso":outcome.status==="blocked"?"Capacidad insuficiente":"Sin confirmar"}</span> · {outcome.message}</p>}
          </div>;})}
        </fieldset>
        {!state.items.length&&<p className="py-3 text-xs">No hay plantillas disponibles para compartir.</p>}
        {previews.length>0&&<details className="mt-3" onToggle={event=>setContentOpen(event.currentTarget.open)}><summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-brand-dark">Revisar contenido de las plantillas</summary>{contentOpen&&<><label className="my-2 block text-xs">Plantilla que se muestra<select value={preview?.index??0} onChange={event=>setPreviewIndex(Number(event.target.value))} className="mt-1 min-h-11 w-full min-w-0 rounded border border-line bg-white px-3">{previews.map(item=><option key={item.index} value={item.index}>{item.name}</option>)}</select></label>{preview&&<ReadonlyMarkdownViewer markdown={preview.markdown} ariaLabel="Contenido del catálogo" emptyMessage="Plantilla vacía"/>}</>}</details>}
        {resources.length>0&&<div className="mt-3 rounded bg-panel p-3 text-xs leading-5"><h3 className="font-medium">Adjuntos de la selección ({resources.length})</h3><ul className="my-2 space-y-1">{resources.map((resource,index)=><li key={index} className="break-all">{resource.name} · {(resource.bytes/1024).toFixed(1)} KiB</li>)}</ul><p>El contenido se copia completo y puede contener información confidencial; no se analiza ni se ejecuta.</p><label className="mt-2 flex min-h-11 items-start gap-2"><input type="checkbox" className="mt-1 accent-[#F37021]" checked={resourcesReviewed} disabled={state.busy} onChange={event=>setResourcesReviewed(event.target.checked)}/><span>He revisado los adjuntos seleccionados y autorizo trasladar su contenido</span></label></div>}
        {state.file&&<p className="mt-3 text-xs text-ink-secondary">Preparación revisada · {state.file.byteLength.toLocaleString()} bytes. Cambiar la selección requiere preparar de nuevo.</p>}
      </div>
      {(state.result||state.error||state.notice)&&<div className="max-h-[25dvh] shrink-0 overflow-y-auto px-4 py-2">
        {isImport&&state.result&&<p role="status" className="text-xs leading-5">{state.result.applied?`${importedCount} ${importedCount===1?"creación confirmada":"creaciones confirmadas"} · ${state.result.outcomes.filter(item=>item.status==="existing").length} ya disponibles. Revisa cada entrada.`:"Revisión de solo lectura. No se ha creado ni sustituido ninguna plantilla."}</p>}
        {state.error&&<p role="alert" className="break-words text-sm text-red-700">{state.error}</p>}
        {state.notice&&<p role="status" className="break-words text-xs">{state.notice}</p>}
        {isImport&&state.needsReview&&state.error&&<p className="mt-2 text-xs leading-5 text-ink-secondary">La siguiente acción consulta el catálogo; no repite la importación sin una nueva revisión.</p>}
      </div>}
      <footer className="flex shrink-0 justify-end gap-2 px-4 py-2"><button type="button" disabled={state.busy} onClick={onClose} className="min-h-11 rounded px-3 text-xs hover:bg-panel">Volver</button>{!state.delivered&&<button type="button" disabled={state.busy||!state.valid||resources.length>0&&!resourcesReviewed&&((isImport&&!state.needsReview)||(!isImport&&!!state.file))||(isImport&&!state.needsReview&&!newCount)} onClick={()=>void state.primary(resourcesReviewed)} className="min-h-11 rounded bg-brand-dark px-3 text-xs font-medium text-white disabled:opacity-50">{state.busy?"Procesando…":primaryLabel}</button>}</footer>
    </section>
  </ModalFrame>;
}
