import { ArchiveRestore, Folder, X } from "lucide-react";
import { useState } from "react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { useRetiredProjects } from "./useRetiredProjects";

export function RetiredProjectsDialog({onClose,onCatalogChanged,fallbackFocus}:{onClose:()=>void;onCatalogChanged:()=>Promise<void>;fallbackFocus?:()=>HTMLElement|null}) {
  const state=useRetiredProjects(onCatalogChanged);
  const [visible,setVisible]=useState(20);
  const entries=state.inventory?.entries.filter(entry=>!entry.registered)??[];
  return <ModalFrame label="Proyectos retirados" className="z-[100]" fallbackFocus={fallbackFocus} onClose={()=>{if(!state.busy)onClose();}}>
    <section className="flex max-h-[calc(100dvh-40px)] w-[min(640px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white shadow-menu">
      <header className="flex shrink-0 items-start gap-3 px-5 pt-5 pb-3">
        <ArchiveRestore className="mt-1 shrink-0 text-brand-orange" size={20}/>
        <div className="min-w-0 flex-1"><h2 className="text-base font-semibold text-ink-primary">Proyectos retirados</h2><p className="mt-1 text-xs leading-5 text-ink-secondary">Retirar un proyecto conserva sus archivos, borradores e historial. Reincorporarlo recupera su identidad en este dispositivo.</p></div>
        <button type="button" aria-label="Cerrar proyectos retirados" disabled={state.busy} onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded hover:bg-panel disabled:opacity-40"><X size={18}/></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4" aria-busy={state.busy}>
        {state.error&&<p role="alert" className="mb-3 rounded bg-red-50 p-3 text-xs leading-5 text-red-800">{state.error}</p>}
        {state.notice&&<p role="status" className="mb-3 rounded bg-brand-hover p-3 text-xs leading-5 text-ink-primary">{state.notice}</p>}
        {state.restoringId&&<p role="status" className="mb-3 text-xs leading-5 text-ink-secondary">Comprobando la carpeta y reincorporando el proyecto…</p>}
        {!state.inventory&&state.busy&&<p className="text-sm text-ink-secondary">Consultando proyectos retirados…</p>}
        {state.inventory&&entries.length===0&&<p className="py-5 text-sm text-ink-secondary">No hay proyectos retirados pendientes de reincorporar.</p>}
        {entries.length>0&&<p className="mb-3 text-xs text-ink-secondary">{entries.length} {entries.length===1?"proyecto retirado":"proyectos retirados"} · Solo este dispositivo</p>}
        <ul className="space-y-4">{entries.slice(0,visible).map(entry=><li key={entry.id} className="rounded-md bg-panel p-3">
          <p className="flex items-start gap-2 text-sm font-medium"><Folder size={16} className="mt-0.5 shrink-0"/><span className="min-w-0 break-words">{entry.name}</span></p>
          <p className="mt-1 break-all font-mono text-[11px] leading-5 text-ink-secondary">{entry.folderPath}</p>
          <p className="mt-1 text-[11px] text-ink-secondary">Retirado el {new Date(entry.retiredAt).toLocaleDateString("es-ES")}</p>
          {!entry.originalFolderVerified&&<p className="mt-2 text-xs leading-5 text-ink-secondary">La carpeta no se pudo comprobar al retirar el proyecto. Se revisará su disponibilidad antes de reincorporarlo.</p>}
          <label className="mt-3 block text-xs text-ink-secondary">Nombre al reincorporar<input aria-label={`Nombre al reincorporar ${entry.name}`} value={state.names[entry.id]??entry.name} disabled={state.busy} onChange={event=>state.setName(entry.id,event.target.value)} className="mt-1 min-h-11 w-full rounded border border-line bg-white px-3 text-sm text-ink-primary focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"/></label>
          <div className="mt-3 flex flex-wrap items-center gap-2"><p className="min-w-0 flex-1 text-[11px] leading-5 text-ink-secondary">Sincronización en pausa hasta que revises sus ajustes.</p><button type="button" aria-label={`Reincorporar ${entry.name}`} disabled={state.busy||!(state.names[entry.id]??entry.name).trim()||state.catalogRefreshPending} onClick={()=>void state.restore(entry)} className="min-h-11 rounded bg-brand-orange px-3 text-xs font-medium text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 disabled:opacity-40">{state.restoringId===entry.id?"Reincorporando…":"Reincorporar"}</button></div>
        </li>)}</ul>
        {visible<entries.length&&<button type="button" disabled={state.busy} onClick={()=>setVisible(count=>count+20)} className="mt-3 min-h-11 px-3 text-xs underline">Mostrar más proyectos</button>}
      </div>
      <footer className="flex shrink-0 justify-end gap-2 px-5 py-3"><button type="button" disabled={state.busy} onClick={()=>void state.refresh()} className="min-h-11 rounded px-3 text-xs hover:bg-panel disabled:opacity-40">{state.catalogRefreshPending?"Actualizar selector":"Actualizar"}</button><button type="button" disabled={state.busy} onClick={onClose} className="min-h-11 rounded border border-line px-4 text-xs hover:bg-panel disabled:opacity-40">Cerrar</button></footer>
    </section>
  </ModalFrame>;
}
