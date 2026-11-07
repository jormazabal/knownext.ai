import {useEffect,useRef,useState} from "react";
import {getAiUsageLedger,upgradeAiUsageLedger} from "../../lib/api/aiUsageLedger";
import {getApiErrorMessage} from "../../lib/api/client";
import type {AiUsageLedgerInfo} from "../../types/aiUsage";
export function useAiUsageLedger(onChanged:()=>void|Promise<void>){
  const[info,setInfo]=useState<AiUsageLedgerInfo|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const[observeFirst,setObserveFirst]=useState(false);
  const alive=useRef(true),running=useRef(false),notify=useRef(onChanged);notify.current=onChanged;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function review(){if(running.current)return;running.current=true;setBusy(true);setError("");
    try{const next=await getAiUsageLedger();if(!alive.current)return;if(!((next.schemaVersion===1&&next.needsUpgrade)||(next.schemaVersion===2&&!next.needsUpgrade)))throw Error("El estado de conservación no es compatible; no se presupone una conversión.");setInfo(next);setObserveFirst(false);if(!next.needsUpgrade){try{await notify.current();}catch{if(alive.current)setError("El estado quedó confirmado, pero falta actualizar el resumen del alcance elegido.");}}}
    catch(cause){if(alive.current){setObserveFirst(true);setError(getApiErrorMessage(cause,"No se pudo revisar la conservación; se mantiene el registro."));}}
    finally{running.current=false;if(alive.current)setBusy(false);}}
  async function apply(){if(running.current||observeFirst||!info?.needsUpgrade)return;running.current=true;setBusy(true);setError("");
    try{const next=await upgradeAiUsageLedger(info.revision);if(!alive.current)return;if(next.schemaVersion!==2||next.needsUpgrade)throw Error("La respuesta no confirma la conversión. Comprueba el estado antes de continuar.");setInfo(next);setObserveFirst(false);try{await notify.current();}catch{if(alive.current)setError("La conservación quedó confirmada, pero falta actualizar el resumen. Vuelve a consultar el alcance elegido.");}}
    catch(cause){if(alive.current){setObserveFirst(true);setError(getApiErrorMessage(cause,"No se confirmó la conversión. Comprueba el estado; no se repetirá automáticamente."));}}
    finally{running.current=false;if(alive.current)setBusy(false);}}
  return{info,busy,error,observeFirst,review,apply};
}
