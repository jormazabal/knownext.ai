import { useEffect, useRef, useState } from "react";
import { addProjectFavorite, getProjectFavorites, removeProjectFavorite } from "../../lib/api/favorites";
import { getApiErrorMessage } from "../../lib/api/client";
import type { FavoriteEntry, ProjectFavorites } from "../../types/favorites";

export function useProjectFavorites(project: string | null,language:"es"|"en"="es") {
  const t=(es:string,en:string)=>language==="en"?en:es;
  const [inventory,setInventory] = useState<ProjectFavorites|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const epoch=useRef(0); const flight=useRef(false);
  useEffect(()=>{
    const generation=++epoch.current;
    setInventory(null);setError("");setNotice("");flight.current=false;
    if(project)void refresh(generation);else setBusy(false);
    return ()=>{epoch.current++;};
  },[project]);

  async function refresh(generation=epoch.current) {
    if(!project||flight.current)return;
    flight.current=true;setBusy(true);setError("");
    try {
      const result=await getProjectFavorites(project);
      if(epoch.current===generation)setInventory(result);
    } catch(failure) {
      if(epoch.current===generation)setError(getApiErrorMessage(failure,t('No se pueden consultar los favoritos. Los archivos y acciones siguen disponibles.','Favorites could not be read. Files and actions are still available.')));
    } finally {if(epoch.current===generation){flight.current=false;setBusy(false);}}
  }

  async function toggle(path: string, existing?: FavoriteEntry) {
    if(!project||!inventory||flight.current)return;
    flight.current=true;setBusy(true);setError("");setNotice("");
    const generation=epoch.current;
    const current=()=>epoch.current===generation;
    try {
      const response=existing ? await removeProjectFavorite(project,existing.id,inventory.revision) : await addProjectFavorite(project,path,inventory.revision);
      if(!current())return;
      const record=response.favorite;
      const entry=record?{...record,nodeId:`${project}::${record.path}`,name:record.path.split('/').pop()??record.path,available:true}:null;
      setInventory(value=>value?{...value,revision:response.revision,checkedAt:response.checkedAt,entries:entry?[...value.entries.filter(item=>item.id!==entry.id),entry]:value.entries.filter(item=>item.id!==existing?.id)}:value);
      setNotice(existing?t('Favorito retirado. El archivo se conserva.','Favorite removed. The file is preserved.'):t('Favorito guardado en este dispositivo.','Favorite saved on this device.'));
    } catch(failure) {
      if(!current())return;
      setError(getApiErrorMessage(failure,t('No se pudo confirmar el cambio. Actualiza los favoritos antes de reintentar.','The change was not confirmed. Refresh favorites before retrying.')));
      try {
        const observed=await getProjectFavorites(project);
        if(!current())return;
        setInventory(observed);
        if(existing?!observed.entries.some(entry=>entry.id===existing.id):observed.entries.some(entry=>entry.path===path)) {
          setError("");setNotice(existing?t('El favorito ya está retirado. El archivo se conserva.','The favorite is already removed. The file is preserved.'):t('El favorito está guardado en este dispositivo.','The favorite is saved on this device.'));
        }
      } catch {/* An unknown result never triggers a second mutation. */}
    } finally {if(current()){flight.current=false;setBusy(false);}}
  }
  return {inventory,busy,error,notice,refresh:()=>refresh(),toggle};
}
