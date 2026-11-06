import {ApiError,requestJson} from "./client";
import type {HistoricalCopySource,HistoricalCopyReview,HistoricalCopyProof} from "../../types/historyCopies";
const sha=(s:unknown):s is string=>typeof s==="string"&&/^[a-f0-9]{64}$/i.test(s);
const id=(s:string)=>/^attempt-[a-f0-9]{32}$/i.test(s);
const commit=(s:unknown):s is string=>typeof s==="string"&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(s);
export function createHistoricalCopyId(){const bytes=crypto.getRandomValues(new Uint8Array(16));return `attempt-${Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("")}`;}
export async function reviewHistoricalCopySource(projectId:string,source:HistoricalCopySource){
 const review=await requestJson<HistoricalCopyReview>(`/api/projects/${encodeURIComponent(projectId)}/sync/history-copies/review`,{method:"POST",body:JSON.stringify(source)});
 if(!review||review.schemaVersion!==1||review.projectId!==projectId||!review.source||review.source.revision!==source.revision||review.source.path!==source.path||review.source.side!==source.side||!sha(review.sourceRevision)||!sha(review.sha256)||!commit(review.sourceCommit)||!commit(review.blob)||typeof review.canCopy!=="boolean"||!(review.previewText===null||typeof review.previewText==="string")||typeof review.previewTruncated!=="boolean"||!Number.isSafeInteger(review.sizeBytes)||review.sizeBytes<0||review.sizeBytes>32*1024*1024||!review.defaultName)throw Error("La fuente no corresponde a la revisión seleccionada.");return review;
}
export async function reviewHistoricalCopy(projectId:string,attemptId:string){
 if(!id(attemptId))throw Error("Identidad de copia no válida.");
 const proof=await requestJson<HistoricalCopyProof>(`/api/projects/${encodeURIComponent(projectId)}/sync/history-copies/${encodeURIComponent(attemptId)}`);
 if(!proof||proof.schemaVersion!==1||proof.projectId!==projectId||proof.attemptId!==attemptId||proof.canReplay!==false||!["absent","pending","changed","unavailable","confirmed"].includes(proof.status)||(proof.status!=="absent"&&(!sha(proof.sourceRevision)||!sha(proof.sha256)||!proof.name||proof.documentId!==`${projectId}::${proof.name}`)))throw Error("El recibo no corresponde a esta copia.");return proof;
}
export async function publishHistoricalCopy(projectId:string,review:HistoricalCopyReview,name:string,attemptId:string){
 if(review.projectId!==projectId||review.schemaVersion!==1||review.canCopy!==true||!sha(review.sourceRevision)||!id(attemptId)||!name.trim())throw Error("Revisa la fuente y el nombre antes de crear la copia.");
 const confirmed=(proof:HistoricalCopyProof)=>proof.schemaVersion===1&&proof.projectId===projectId&&proof.attemptId===attemptId&&proof.status==="confirmed"&&proof.canReplay===false&&proof.sourceRevision===review.sourceRevision&&proof.name===name&&proof.documentId===`${projectId}::${name}`&&proof.sha256===review.sha256&&proof.sizeBytes===review.sizeBytes;
 try{
  const proof=await requestJson<HistoricalCopyProof>(`/api/projects/${encodeURIComponent(projectId)}/sync/history-copies`,{method:"POST",body:JSON.stringify({source:review.source,sourceRevision:review.sourceRevision,attemptId,name})});if(!confirmed(proof))throw Error("La publicación de la copia no está confirmada.");return proof;
 }catch(failure){
  if(failure instanceof ApiError&&failure.operationOutcome==="not-started")throw failure;
  const proof=await reviewHistoricalCopy(projectId,attemptId);if(confirmed(proof))return proof;throw Error(proof.message||"No se confirma la copia. Consulta el intento sin repetir.");
 }
}
