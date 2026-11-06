import {useRef,useState} from "react";
import {getApiErrorMessage} from "../../lib/api/client";
import {getProjectTemplates,saveProjectTemplate} from "../../lib/api/projectTemplates";
import type {ProjectTransferJob} from "../../types/projectTransfer";
import type {ProjectTemplate} from "../../types/projectTemplates";

export function useProjectTemplateSave(job:ProjectTransferJob,onSaved:(template:ProjectTemplate)=>void){
  const[name,setName]=useState(job.manifest?.projectName??"");
  const[description,setDescription]=useState(job.manifest?.templateDescription??"");
  const[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState("");
  const pending=useRef(false);
  async function observe(){
    const inventory=await getProjectTemplates();
    const found=inventory.templates.find(entry=>!entry.retired&&entry.name===name.trim()&&entry.description===description.trim()&&(entry.sourceArchiveSha256===job.archiveSha256||entry.archiveSha256===job.archiveSha256));
    if(found){onSaved(found);return true;}
    setUncertain(!inventory.complete);return false;
  }
  async function save(){
    if(pending.current||uncertain||!job.archiveSha256)return;
    pending.current=true;setBusy(true);setError("");
    try{onSaved(await saveProjectTemplate(job.id,job.archiveSha256,name.trim(),description.trim()));}
    catch(failure){
      try{if(await observe())return;}catch{setUncertain(true);}
      setError(getApiErrorMessage(failure,"No se confirmó el guardado de la plantilla. Consulta el catálogo antes de repetir."));
    }finally{pending.current=false;setBusy(false);}
  }
  async function consult(){
    if(pending.current)return;pending.current=true;setBusy(true);
    try{await observe();}catch{setError("No se pudo consultar el catálogo. La copia puede estar guardada.");}
    finally{pending.current=false;setBusy(false);}
  }
  return{name,setName,description,setDescription,busy,uncertain,error,save,consult,canClose:()=>!pending.current};
}
