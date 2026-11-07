import {useEffect,useRef,useState} from "react";
import {getAiBudget,setAiBudget,refreshAiExchangeRate} from "../../lib/api/aiBudget";
import {getApiErrorMessage} from "../../lib/api/client";
import type {AiBudgetMode,AiBudgetStatus} from "../../types/aiBudget";
export function useAiBudget(month:string,projectId:string){
  const[status,setStatus]=useState<AiBudgetStatus|null>(null),[amount,setAmount]=useState(""),[mode,setMode]=useState<AiBudgetMode>("notice");
  const[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[observeFirst,setObserveFirst]=useState(false);
  const alive=useRef(true),running=useRef(false),dirty=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  function verify(value:AiBudgetStatus){if(value.schemaVersion!==1||value.month!==month||(value.projectId??"")!==projectId||value.basis!=="local-recorded-estimates")throw Error("La respuesta no confirma el alcance elegido; no se guarda otro presupuesto.");return value;}
  async function review(){if(running.current)return;running.current=true;setBusy(true);setError("");setMessage("");
    try{const next=verify(await getAiBudget(month,projectId));if(!alive.current)return;setStatus(next);setObserveFirst(false);if(!dirty.current){setAmount(next.rule?.limitEur.toFixed(2)??"");setMode(next.rule?.mode??"notice");}setMessage("Estado consultado. El presupuesto se aplica solo a este mes y perfil local.");}
    catch(cause){if(alive.current){setObserveFirst(true);setError(getApiErrorMessage(cause,"No se pudo consultar el presupuesto; se conservan los campos."));}}
    finally{running.current=false;if(alive.current)setBusy(false);}}
  async function save(clear=false){if(running.current||observeFirst||!status)return;
    const value=Number(amount.replace(",","."));
    if(!clear&&(!/^[0-9]+([.,][0-9]{1,2})?$/.test(amount)||value<0.01||value>1_000_000)){setError("Introduce un importe entre 0,01 y 1.000.000 EUR, con hasta dos decimales.");return;}
    running.current=true;setBusy(true);setError("");setMessage("");
    try{const next=verify(await setAiBudget(month,projectId,status.revision,clear?null:{limitEur:value,mode}));if(!alive.current)return;setStatus(next);setObserveFirst(false);dirty.current=false;setAmount(next.rule?.limitEur.toFixed(2)??"");setMode(next.rule?.mode??"notice");setMessage(clear?"Límite retirado y confirmado.":"Presupuesto guardado y confirmado.");}
    catch(cause){if(alive.current){setObserveFirst(true);setError(getApiErrorMessage(cause,"No se confirmó el cambio. Comprueba el estado; no se repetirá automáticamente."));}}
    finally{running.current=false;if(alive.current)setBusy(false);}}
  async function refreshRate(){if(running.current)return;running.current=true;setBusy(true);setError("");setMessage("");
    try{await refreshAiExchangeRate();const next=verify(await getAiBudget(month,projectId));if(!alive.current)return;setStatus(next);setObserveFirst(false);setMessage(next.exchangeRateAvailable?"Referencia EUR vigente confirmada. Los importes históricos conservan su cambio.":"La referencia recibida todavía no es vigente; se mantienen los límites de detención.");}
    catch(cause){if(alive.current)setError(getApiErrorMessage(cause,"No se pudo actualizar la referencia. Se conserva el cambio anterior; no se presupone conversión."));}
    finally{running.current=false;if(alive.current)setBusy(false);}}
  return{status,amount,mode,busy,error,message,observeFirst,review,save,refreshRate,setAmount:(value:string)=>{dirty.current=true;setAmount(value);},setMode:(value:AiBudgetMode)=>{dirty.current=true;setMode(value);}};
}
