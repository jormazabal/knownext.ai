import {useEffect,useRef,useState} from "react";
import {createHistoricalCopyId,publishHistoricalCopy,reviewHistoricalCopy,reviewHistoricalCopySource} from "../../lib/api/historyCopies";
import {getApiErrorMessage} from "../../lib/api/client";
import type {DocumentTreeNode} from "../../types/domain";
import type {HistoricalCopyProof,HistoricalCopyReview,HistoricalCopyTarget} from "../../types/historyCopies";
type Attempt={id:string;name:string;sourceRevision:string;sha256:string;sizeBytes:number};
export function useHistoricalResourceCopy(projectId:string,target:HistoricalCopyTarget,onCreated?:(projectId:string,tree:DocumentTreeNode[])=>void,onTreeUnavailable?:(projectId:string,message:string)=>void){
 const[review,setReview]=useState<HistoricalCopyReview|null>(null),[name,setName]=useState(""),[proof,setProof]=useState<HistoricalCopyProof|null>(null),[pending,setPending]=useState<Attempt|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const epoch=useRef(0),inFlight=useRef(false),notified=useRef(new Set<string>());
 const sourceKey=target.kind==="source"?JSON.stringify(target.source):target.summary.attemptId;
 function accept(result:HistoricalCopyProof,attempt:Attempt,turn:number,notify:typeof onCreated,unavailable:typeof onTreeUnavailable){
  if(turn!==epoch.current)return;
  if(result.status!=="absent"&&(result.name!==attempt.name||result.sourceRevision!==attempt.sourceRevision||result.sha256!==attempt.sha256||result.sizeBytes!==attempt.sizeBytes))throw Error("El recibo no corresponde a la copia seleccionada.");
  setProof(result);
  if(result.status==="confirmed"&&(result.treeAvailable===false||!Array.isArray(result.tree))&&!notified.current.has(`${projectId}:${attempt.id}:unavailable`)){
   notified.current.add(`${projectId}:${attempt.id}:unavailable`);try{unavailable?.(projectId,"Copia del historial comprobada; no se pudo actualizar la estructura. Consulta la vista sin repetir la copia.");}catch{setError("Copia comprobada. No se pudo comunicar el estado de su vista; vuelve a abrir el proyecto sin repetir la copia.");}
  }
  if(result.status==="confirmed"&&result.treeAvailable!==false&&Array.isArray(result.tree)&&!notified.current.has(`${projectId}:${attempt.id}:tree`)){
   notified.current.add(`${projectId}:${attempt.id}:tree`);try{notify?.(projectId,result.tree);}catch{setError("Copia comprobada. No se pudo actualizar su vista; vuelve a abrir el proyecto sin repetir la copia.");}
  }
 }
 async function load(){
  const turn=++epoch.current;inFlight.current=true;setBusy(true);setError("");setProof(null);setPending(null);setReview(null);
  const notify=onCreated,unavailable=onTreeUnavailable;
  try{
   if(target.kind==="source"){const result=await reviewHistoricalCopySource(projectId,target.source);if(turn===epoch.current){setReview(result);setName(current=>current||result.defaultName);}}
   else{const summary=target.summary;const attempt={id:summary.attemptId,name:summary.name,sourceRevision:summary.sourceRevision,sha256:summary.sha256,sizeBytes:summary.sizeBytes};if(turn===epoch.current){setPending(attempt);setName(summary.name);}const result=await reviewHistoricalCopy(projectId,summary.attemptId);accept(result,attempt,turn,notify,unavailable);}
  }catch(failure){if(turn===epoch.current)setError(getApiErrorMessage(failure,"No se pudo revisar la copia. Las fuentes se conservan."));}
  finally{if(turn===epoch.current){inFlight.current=false;setBusy(false);}}
 }
 useEffect(()=>{setName("");const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);++epoch.current;};},[projectId,sourceKey]);
 async function create(){
  if(inFlight.current||!review||pending||!name.trim())return;const turn=epoch.current;const notify=onCreated,unavailable=onTreeUnavailable;inFlight.current=true;setBusy(true);setError("");
  try{const attempt={id:createHistoricalCopyId(),name,sourceRevision:review.sourceRevision,sha256:review.sha256,sizeBytes:review.sizeBytes};setPending(attempt);const result=await publishHistoricalCopy(projectId,review,name,attempt.id);accept(result,attempt,turn,notify,unavailable);}
  catch(failure){if(turn===epoch.current)setError(getApiErrorMessage(failure,"No se confirma la copia. Consulta este intento sin repetir."));}
  finally{if(turn===epoch.current){inFlight.current=false;setBusy(false);}}
 }
 async function reviewAgain(){
  if(inFlight.current||target.kind!=="source")return;const turn=epoch.current;inFlight.current=true;setBusy(true);setError("");
  try{const result=await reviewHistoricalCopySource(projectId,target.source);if(turn===epoch.current){setReview(result);setName(current=>current||result.defaultName);setPending(null);setProof(null);}}
  catch(failure){if(turn===epoch.current)setError(getApiErrorMessage(failure,"No se pudo revisar otra decisión. El intento anterior se conserva."));}
  finally{if(turn===epoch.current){inFlight.current=false;setBusy(false);}}
 }
 async function consult(){
  if(inFlight.current||!pending)return;const turn=epoch.current;const notify=onCreated,unavailable=onTreeUnavailable;inFlight.current=true;setBusy(true);setError("");
  try{const result=await reviewHistoricalCopy(projectId,pending.id);accept(result,pending,turn,notify,unavailable);}
  catch(failure){if(turn===epoch.current)setError(getApiErrorMessage(failure,"No se pudo consultar el recibo. No se ha repetido la copia."));}
  finally{if(turn===epoch.current){inFlight.current=false;setBusy(false);}}
 }
 return{review,name,setName,proof,pending,busy,error,load,create,consult,reviewAgain};
}
