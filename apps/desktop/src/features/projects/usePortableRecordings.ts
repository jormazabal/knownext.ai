import {useEffect,useRef,useState} from "react";
import {getPortableRecordingCatalog,reviewPortableRecording,adoptPortableRecording} from "../../lib/api/portableRecordings";
import {getApiErrorMessage} from "../../lib/api/client";
import type {PortableRecordingCatalog,PortableRecordingEntry,PortableRecordingReview} from "../../types/portableRecordings";
export function usePortableRecordings(projectId:string){
 const[catalog,setCatalog]=useState<PortableRecordingCatalog|null>(null),[review,setReview]=useState<PortableRecordingReview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[ack,setAck]=useState(false),[fresh,setFresh]=useState(false),[limit,setLimit]=useState(30);
 const alive=useRef(false),flight=useRef(false);
 async function run(work:()=>Promise<void>){if(flight.current)return;flight.current=true;setBusy(true);setError("");setNotice("");try{await work();}catch(cause){if(alive.current)setError(getApiErrorMessage(cause,"No se pudo revisar el audio. El original permanece."));}finally{flight.current=false;if(alive.current)setBusy(false);}}
 const refresh=()=>run(async()=>{setCatalog(null);setReview(null);setAck(false);setFresh(false);setLimit(30);const value=await getPortableRecordingCatalog(projectId);if(alive.current)setCatalog(value);});
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;};},[projectId]);
 const inspect=(entry:PortableRecordingEntry)=>run(async()=>{if(!catalog)return;setFresh(false);setAck(false);const value=await reviewPortableRecording(catalog,entry);if(alive.current){setReview(value);setFresh(true);}});
 const apply=()=>run(async()=>{if(!catalog||!review||!fresh||!ack||!review.canImport)return;const entry=catalog.items.find(row=>row.id===review.entryId);if(!entry)return;setAck(false);setFresh(false);let confirmed=false;
  try{await adoptPortableRecording(review);confirmed=true;if(alive.current)setNotice("Audio conservado en Grabaciones. Escúchalo y revisa su destino antes de iniciar una transcripción.");}
  catch(cause){if(alive.current)setError(getApiErrorMessage(cause,"La copia no está confirmada. Se consultará sin repetir."));}
  try{const observed=await reviewPortableRecording(catalog,entry);if(alive.current){setReview(observed);if(!confirmed)setNotice("Estado consultado sin repetir la copia. Un destino reservado puede contener una copia completa o interrumpida; comprueba Grabaciones antes de actuar.");}}
  catch{if(alive.current){setReview(null);setNotice(confirmed?"La copia se confirmó en Grabaciones; no se pudo actualizar esta revisión. El original permanece.":"No se pudo confirmar el destino. Conserva el archivo y actualiza la lista; no se ha repetido la copia.");}}
 });
 return {catalog,review,busy,error,notice,ack,setAck,fresh,limit,setLimit,refresh,inspect,apply,back:()=>{setReview(null);setFresh(false);setAck(false);setError("");setNotice("");}};
}
