import {useEffect,useRef,useState} from "react";
import {getSystemRecovery,reviewSystemRecovery,exportSystemRecovery} from "../../lib/api/systemRecovery";
import {getApiErrorMessage} from "../../lib/api/client";
import type {SystemRecoveryCopy,SystemRecoveryInventory,SystemRecoveryReview} from "../../types/systemRecovery";
export function useSystemRecovery(){
  const[inventory,setInventory]=useState<SystemRecoveryInventory|null>(null),[review,setReview]=useState<SystemRecoveryReview|null>(null),[group,setGroup]=useState("");
  const[busy,setBusy]=useState<"inventory"|"review"|"export"|null>(null),[error,setError]=useState(""),[message,setMessage]=useState("");
  const epoch=useRef(0),alive=useRef(true),delivering=useRef(false);
  async function refresh(){if(delivering.current)return;const request=++epoch.current;setBusy("inventory");setError("");setMessage("");setReview(null);
    try{const next=await getSystemRecovery();if(alive.current&&epoch.current===request)setInventory(next);}
    catch(cause){if(alive.current&&epoch.current===request)setError(getApiErrorMessage(cause,"No se pudo completar el inventario. No se considera vacío."));}
    finally{if(alive.current&&epoch.current===request)setBusy(null);}}
  useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;epoch.current++;};},[]);
  async function inspect(copy:SystemRecoveryCopy){if(delivering.current)return;const request=++epoch.current;setReview(null);setBusy("review");setError("");setMessage("");
    try{const next=await reviewSystemRecovery(copy.id);if(!alive.current||epoch.current!==request)return;if(next.id!==copy.id||next.canRestore!==false||!next.fingerprint)throw Error("La revisión no confirma esta copia. No se inicia su entrega.");setReview(next);}
    catch(cause){if(alive.current&&epoch.current===request)setError(getApiErrorMessage(cause,"No se pudo revisar la copia; se conserva su origen."));}
    finally{if(alive.current&&epoch.current===request)setBusy(null);}}
  function back(){if(delivering.current)return;epoch.current++;setReview(null);setBusy(null);setError("");setMessage("");}
  async function deliver(){if(delivering.current||!review?.canExport)return;delivering.current=true;setBusy("export");setError("");setMessage("");
    try{const result=await exportSystemRecovery(review.id,review.fingerprint);if(!alive.current)return;if(result.status==="cancelled")setMessage("Destino cancelado. La copia original permanece en su lugar.");else if(result.status==="saved")setMessage(`Copia externa confirmada${result.fileName?`: ${result.fileName}`:""}. El estado activo y el original se conservan.`);else throw Error("La respuesta no confirma la entrega. Comprueba el destino antes de repetir.");}
    catch(cause){if(alive.current)setError(getApiErrorMessage(cause,"No se confirmó la entrega. Comprueba el destino antes de repetir; no se ha vuelto a ejecutar automáticamente."));}
    finally{delivering.current=false;if(alive.current)setBusy(null);}}
  return{inventory,review,group,setGroup,busy,error,message,refresh,inspect,back,deliver};
}
