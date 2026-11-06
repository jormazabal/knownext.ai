export function ProjectTreeReadIssue({message,hasPreviousView,busy,onRetry,onSearch}:{message:string;hasPreviousView:boolean;busy:boolean;onRetry:()=>void;onSearch:()=>void}){
 return <section className="shrink-0 rounded-lg bg-panel px-3 py-2" aria-label="Estado de la estructura del proyecto">
  <p role="alert" className="text-xs font-medium">No se pudo actualizar la estructura</p>
  <p className="mt-1 text-xs leading-5 text-ink-secondary">{hasPreviousView?"Se conserva la última vista comprobada. Puede haber cambios que aún no aparecen.":"No hay una vista completa disponible. Este estado no significa que el proyecto esté vacío."}</p>
  <details className="mt-1 text-xs text-ink-secondary"><summary className="cursor-pointer py-2">Ver motivo</summary><p className="break-words pb-2 leading-5">{message}</p></details>
  <div className="flex flex-wrap gap-1"><button disabled={busy} onClick={onRetry} className="min-h-11 rounded px-2 text-xs font-medium text-brand-dark hover:bg-brand-hover disabled:opacity-50">{busy?"Consultando…":"Reintentar lectura"}</button><button onClick={onSearch} className="min-h-11 rounded px-2 text-xs hover:bg-white">Buscar contenido</button></div>
 </section>;
}
