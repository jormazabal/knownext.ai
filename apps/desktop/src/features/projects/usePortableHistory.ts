import {useEffect,useRef,useState} from "react";
import {getPortableHistoryCatalog,reviewPortableHistory,adoptPortableHistory} from "../../lib/api/portableHistory";
import {getApiErrorMessage} from "../../lib/api/client";
import type {PortableHistoryCatalog,PortableHistoryEntry,PortableHistoryReview} from "../../types/portableHistory";
import type {StateTransitionAuthority,StateTransitionOutcome} from "../../types/stateMigrations";
export function usePortableHistory(projectId:string,authority:StateTransitionAuthority){
 const[catalog,setCatalog]=useState<PortableHistoryCatalog|null>(null),[review,setReview]=useState<PortableHistoryReview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[tip,setTip]=useState(""),[ack,setAck]=useState(false),[fresh,setFresh]=useState(false);
 const alive=useRef(false),flight=useRef(false);const canApply=Boolean(authority.onBeforeChange&&authority.onSettled);
 async function run(work:()=>Promise<void>){if(flight.current)return;flight.current=true;setBusy(true);setError("");try{await work();}catch(cause){if(alive.current)setError(getApiErrorMessage(cause,"No se pudo revisar el historial. Los originales permanecen."));}finally{flight.current=false;if(alive.current)setBusy(false);}}
 function accept(value:PortableHistoryReview){setReview(value);setTip("");setAck(false);setFresh(true);}
 const refresh=()=>run(async()=>{setCatalog(null);setReview(null);setFresh(false);setAck(false);setTip("");const value=await getPortableHistoryCatalog(projectId);if(alive.current)setCatalog(value);});
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;};},[projectId]);
 const inspect=(entry:PortableHistoryEntry)=>run(async()=>{if(!catalog)return;setFresh(false);setAck(false);const value=await reviewPortableHistory(catalog,entry);if(alive.current)accept(value);});
 const apply=()=>run(async()=>{if(!canApply||!catalog||!review||!fresh||!ack||!tip||!review.canAdopt)return;const entry=catalog.items.find(item=>item.id===review.entryId);if(!entry)return;setFresh(false);setAck(false);let prepared=false,outcome:StateTransitionOutcome|undefined;
  try{await authority.onBeforeChange!();prepared=true;await adoptPortableHistory(review,tip);outcome={confirmed:true,message:"Historial incorporado para consulta. Los documentos permanecen; no se ha activado el guardado automático de versiones."};}
  catch(cause){let message=getApiErrorMessage(cause,"No se confirmó el historial.");if(prepared){try{const observed=await reviewPortableHistory(catalog,entry);message+=observed.nativeState==="occupied"?" Se consultó el destino: hay historial local. Revísalo sin repetir la incorporación.":" Se consultó el destino sin repetir la incorporación.";}catch{message+=" No se pudo confirmar el destino; conserva el archivo y revisa de nuevo.";}outcome={confirmed:false,message};}if(alive.current)setError(message);}
  finally{if(prepared&&outcome)authority.onSettled!(outcome);}
 });
 return{catalog,review,busy,error,tip,ack,setAck,fresh,canApply,refresh,inspect,apply,chooseTip:(value:string)=>{setTip(value);setAck(false);},back:()=>{setReview(null);setFresh(false);setTip("");setAck(false);setError("");}};
}
