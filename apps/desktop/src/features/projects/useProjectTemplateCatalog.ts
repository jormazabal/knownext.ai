import {useEffect,useRef,useState} from "react";
import {getProjectTemplates,retireProjectTemplate} from "../../lib/api/projectTemplates";
import {getApiErrorMessage} from "../../lib/api/client";
import type {ProjectTemplate,ProjectTemplateInventory} from "../../types/projectTemplates";

export function useProjectTemplateCatalog(){
  const[inventory,setInventory]=useState<ProjectTemplateInventory|null>(null);
  const[busy,setBusy]=useState(true),[error,setError]=useState("");
  const alive=useRef(true),pending=useRef(false);
  async function refresh(){const result=await getProjectTemplates();if(alive.current)setInventory(result);}
  useEffect(()=>{
    alive.current=true;void refresh().catch(failure=>{if(alive.current)setError(getApiErrorMessage(failure,"No se pudo consultar el catálogo"));}).finally(()=>{if(alive.current)setBusy(false);});
    return()=>{alive.current=false;};
  },[]);
  async function retire(template:ProjectTemplate){
    if(pending.current)return;pending.current=true;setBusy(true);setError("");
    try{await retireProjectTemplate(template,!template.retired);await refresh();}
    catch(failure){setError(getApiErrorMessage(failure,"No se confirmó el cambio. Actualiza antes de repetir."));try{await refresh();}catch{/* Keep the last observed catalogue. */}}
    finally{pending.current=false;setBusy(false);}
  }
  async function reload(){
    if(pending.current)return;pending.current=true;setBusy(true);setError("");
    try{await refresh();}catch(failure){if(alive.current)setError(getApiErrorMessage(failure,"No se pudo actualizar el catálogo"));}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  }
  return{inventory,busy,error,retire,reload,canClose:()=>!pending.current};
}
