import {useEffect,useRef,useState} from "react";
import {listConflictAttempts,reviewConflictAttempt,changeConflictAttemptArchive} from "../../lib/api/conflictRecovery";
import {getApiErrorMessage} from "../../lib/api/client";
import type {ConflictAttemptInventory,ConflictAttemptRecovery} from "../../types/conflictAttempts";
export function useConflictAttempts(){
  const [inventory,setInventory]=useState<ConflictAttemptInventory|null>(null),[detail,setDetail]=useState<ConflictAttemptRecovery|null>(null),[loading,setLoading]=useState(false),[reviewing,setReviewing]=useState<string|null>(null),[error,setError]=useState("");
  const [archived,setArchivedState]=useState(false),[mutating,setMutating]=useState(false),[fresh,setFresh]=useState(false),[notice,setNotice]=useState("");
  const request=useRef(0),catalogue=useRef(0),inFlight=useRef(false);
  function setArchived(value:boolean){if(inFlight.current||value===archived)return;++request.current;++catalogue.current;setInventory(null);setDetail(null);setFresh(false);setArchivedState(value);}
  async function refresh(){if(inFlight.current)return;const sequence=++catalogue.current;++request.current;setLoading(true);setError("");setDetail(null);setFresh(false);setReviewing(null);
    try{const data=await listConflictAttempts(archived);if(sequence===catalogue.current)setInventory(data);}catch(cause){if(sequence===catalogue.current)setError(getApiErrorMessage(cause,"No se pudieron consultar los recibos. Se conservan sin cambios."));}finally{if(sequence===catalogue.current)setLoading(false);}}
  async function inspect(id:string){if(inFlight.current)return;const sequence=++request.current;setReviewing(id);setDetail(null);setFresh(false);setError("");setNotice("");
    try{const data=await reviewConflictAttempt(id);if(sequence===request.current){if(data.receipt.id!==id)throw new Error("La respuesta no corresponde al intento consultado; vuelve a revisar.");setDetail(data);setFresh(true);setInventory(current=>current?{...current,items:current.items.map(item=>item.id===id?data.receipt:item)}:current);}}catch(cause){if(sequence===request.current)setError(getApiErrorMessage(cause,"No se pudo revisar el intento. Sus copias se conservan; no se repite."));}finally{if(sequence===request.current)setReviewing(null);}}
  async function changeArchive(action:"archive"|"reopen"){
    if(inFlight.current||!fresh||!detail?.receipt.revision||detail.receipt.phase!=="completed")return;
    const chosen=detail;const sequence=++request.current;inFlight.current=true;setMutating(true);setFresh(false);setError("");setNotice("");let acknowledgementLost=false;
    try{
      try{await changeConflictAttemptArchive(chosen.receipt.id,chosen.receipt.revision!,action);}catch{acknowledgementLost=true;}
      // Observe after the one mutation. Never resend an uncertain metadata change.
      const observed=await reviewConflictAttempt(chosen.receipt.id);
      if(sequence!==request.current)return;
      if(observed.receipt.id!==chosen.receipt.id||observed.receipt.documentId!==chosen.receipt.documentId||observed.receipt.phase!=="completed"||Boolean(observed.receipt.archivedAt)!==(action==="archive"))throw new Error("No se confirmó el cambio de archivo. Revisa el intento antes de otra acción; no se ha repetido la solicitud.");
      setInventory(current=>current?{...current,items:current.items.filter(item=>item.id!==chosen.receipt.id)}:current);setDetail(null);
      setNotice(`${action==="archive"?"El recibo aparece en Archivados":"El recibo aparece en Sin archivar"}. Sus copias se conservan.${acknowledgementLost?" No llegó el acuse; se ha consultado su estado sin repetir el cambio.":""}`);
    }catch(cause){if(sequence===request.current)setError(getApiErrorMessage(cause,"No se pudo consultar el resultado. Revisa el intento antes de otra acción; las copias se conservan."));}
    finally{inFlight.current=false;if(sequence===request.current)setMutating(false);}
  }
  useEffect(()=>{const timer=window.setTimeout(()=>void refresh(),0);return()=>{window.clearTimeout(timer);++request.current;++catalogue.current;};},[archived]);
  return {inventory,detail,loading,reviewing,error,refresh,inspect,archived,setArchived,mutating,fresh,notice,changeArchive};
}
