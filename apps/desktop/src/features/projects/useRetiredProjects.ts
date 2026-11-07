import { useCallback, useEffect, useRef, useState } from "react";
import { getRetiredProjects, restoreRetiredProject } from "../../lib/api/projectLifecycle";
import { getApiErrorMessage } from "../../lib/api/client";
import type { RetiredProject, RetiredProjects } from "../../types/projectLifecycle";

export function useRetiredProjects(onCatalogChanged:()=>Promise<void>) {
  const [inventory,setInventory]=useState<RetiredProjects|null>(null);
  const [names,setNames]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [restoringId,setRestoringId]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [catalogRefreshPending,setCatalogRefreshPending]=useState(false);
  const inFlight=useRef(false);
  const callback=useRef(onCatalogChanged);callback.current=onCatalogChanged;

  const load=useCallback(async()=>{const next=await getRetiredProjects();setInventory(next);return next;},[]);
  const refresh=useCallback(async()=>{
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError(null);
    try {
      if(catalogRefreshPending){await callback.current();setCatalogRefreshPending(false);}
      await load();
    }catch(cause){setError(getApiErrorMessage(cause,"No se pudieron actualizar los proyectos retirados. Se conserva la revisión."));}
    finally{inFlight.current=false;setBusy(false);}
  },[catalogRefreshPending,load]);
  useEffect(()=>{void refresh();},[]);

  async function restore(entry:RetiredProject) {
    if(inFlight.current||entry.registered)return;
    const name=names[entry.id]??entry.name;if(!name.trim())return;
    inFlight.current=true;setBusy(true);setRestoringId(entry.id);setError(null);setNotice(null);
    let acknowledged=false;
    let paused=false;
    try {
      try {
        const result=await restoreRetiredProject(entry.id,entry.revision,name);
        acknowledged=true;paused=result.syncPaused;
      }catch(cause){
        // Reconcile a lost ACK through a read; never repeat the mutation.
        try{const current=await load();acknowledged=current.entries.some(item=>item.id===entry.id&&item.registered);}catch{/* Keep the original error and entered name. */}
        if(!acknowledged)throw cause;
      }
      setCatalogRefreshPending(true);
      try{await callback.current();setCatalogRefreshPending(false);}catch(cause){
        setError(getApiErrorMessage(cause,"El proyecto está reincorporado. No se pudo actualizar el selector; reintenta la actualización."));
        setNotice("Proyecto reincorporado. Actualizar el selector no repetirá la operación.");
        return;
      }
      setNotice(paused?"Proyecto reincorporado con sincronización en pausa. Ábrelo desde el selector de proyectos.":"El proyecto figura en el registro. Puedes abrirlo desde el selector de proyectos.");
      await load();
    }catch(cause){setError(getApiErrorMessage(cause,acknowledged?"El proyecto está reincorporado; actualiza la lista para continuar.":"No se pudo reincorporar. Se conservan el proyecto retirado y el nombre escrito."));}
    finally{inFlight.current=false;setBusy(false);setRestoringId(null);}
  }
  return {inventory,names,busy,restoringId,error,notice,catalogRefreshPending,refresh,restore,setName:(id:string,name:string)=>setNames(current=>({...current,[id]:name}))};
}
