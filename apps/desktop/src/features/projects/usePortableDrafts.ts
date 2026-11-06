import {useEffect,useRef,useState} from "react";
import {getPortableDraftCatalog,reviewPortableDraft,adoptPortableDraft} from "../../lib/api/portableDrafts";
import {getApiErrorMessage} from "../../lib/api/client";
import type {PortableDraftCatalog,PortableDraftEntry,PortableDraftReview} from "../../types/portableDrafts";
import type {StateTransitionAuthority,StateTransitionOutcome} from "../../types/stateMigrations";
export function usePortableDrafts(projectId:string,authority:StateTransitionAuthority){
 const[catalog,setCatalog]=useState<PortableDraftCatalog|null>(null),[review,setReview]=useState<PortableDraftReview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[fresh,setFresh]=useState(false),[ack,setAck]=useState(false);
 const alive=useRef(false),flight=useRef(false);const canResume=Boolean(authority.onBeforeChange&&authority.onSettled);
 async function run(work:()=>Promise<void>){if(flight.current)return;flight.current=true;setBusy(true);setError("");setNotice("");try{await work();}catch(cause){if(alive.current)setError(getApiErrorMessage(cause,"No se pudo revisar el archivo. Las fuentes permanecen."));}finally{flight.current=false;if(alive.current)setBusy(false);}}
 function accept(value:PortableDraftReview,valid:boolean){setReview(value);setFresh(valid);setAck(false);}
 const refresh=()=>run(async()=>{setReview(null);setFresh(false);setAck(false);const value=await getPortableDraftCatalog(projectId);if(alive.current)setCatalog(value);});
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;};},[projectId]);
 const inspect=(entry:PortableDraftEntry)=>run(async()=>{if(!catalog)return;setFresh(false);setAck(false);const value=await reviewPortableDraft(catalog,entry);if(alive.current)accept(value,true);});
 const apply=(mode:"copy"|"resume")=>run(async()=>{
  if(!catalog||!review||!fresh||!ack||mode==="resume"&&!canResume)return;const entry=catalog.items.find(item=>item.id===review.entryId);if(!entry)return;setFresh(false);setAck(false);let prepared=false,outcome:StateTransitionOutcome|undefined;
  try{if(mode==="resume"){await authority.onBeforeChange!();prepared=true;}const result=await adoptPortableDraft(review,mode);const message=mode==="resume"?`Borrador preparado en «${entry.path}». Abre ese documento para continuar.`:"Copia nativa conservada en Apartadas. Puedes revisarla o recuperarla como otro archivo.";if(prepared)outcome={confirmed:true,message};if(alive.current){accept(result.review,false);setNotice(message);}}
  catch(cause){const message=getApiErrorMessage(cause,"No se confirmó la acción. Se consultará sin repetirla.");if(prepared)outcome={confirmed:false,message};if(alive.current)setError(message);try{const observed=await reviewPortableDraft(catalog,entry);if(alive.current){accept(observed,false);setNotice("Estado consultado sin repetir la acción. Revisa de nuevo antes de otro intento.");}}catch{if(alive.current)setReview(null);}}
  finally{if(prepared&&outcome)authority.onSettled!(outcome);}
 });
 return{catalog,review,busy,error,notice,fresh,ack,setAck,canResume,refresh,inspect,apply,back:()=>{setReview(null);setFresh(false);setAck(false);setError("");setNotice("");}};
}
