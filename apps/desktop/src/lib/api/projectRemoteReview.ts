import type {MixedSelectionReview,MixedSelectionProof} from "../../types/mixedSelections";
import { ApiError, requestJson } from "./client";
import type { GraphJoinProof, GraphJoinResolution, ProjectRemoteReview } from "../../types/projectRemoteReview";
export function reviewRemoteProject(projectId: string) {
  return requestJson<ProjectRemoteReview>(`/api/projects/${encodeURIComponent(projectId)}/sync/remote-review`);
}
export function createGraphJoinId(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return `attempt-${Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("")}`;}
function mixedProofValid(proof:MixedSelectionProof|null|undefined){return !!proof&&/^mixed-[a-f0-9]{32}$/i.test(proof.planId)&&[proof.planRevision,proof.choicesSha256].every(v=>typeof v==="string"&&/^[a-f0-9]{64}$/i.test(v))&&[proof.localChoices,proof.remoteChoices,proof.combinedChoices].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=256)&&proof.localChoices+proof.remoteChoices+proof.combinedChoices<=256&&(proof.combinedChoices>0||(proof.localChoices>0&&proof.remoteChoices>0));}
export async function reviewGraphJoin(projectId:string,attemptId:string){
  if(!/^attempt-[a-f0-9]{32}$/i.test(attemptId))throw Error("Identidad de reunión no válida.");
  const proof=await requestJson<GraphJoinProof>(`/api/projects/${encodeURIComponent(projectId)}/sync/graph-joins/${encodeURIComponent(attemptId)}`);
  if(proof.resolution!==undefined&&proof.resolution!=="identical"&&proof.resolution!=="keep-local"&&proof.resolution!=="mixed")throw Error("La elección del recibo no es compatible; se conserva sin repetir.");
  if(proof.schemaVersion!==1||proof.projectId!==projectId||proof.attemptId!==attemptId||proof.canReplay!==false||!["absent","pending","changed","confirmed"].includes(proof.status)||(proof.status!=="absent"&&(!/^[a-f0-9]{64}$/i.test(proof.reviewedRevision||"")||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(proof.targetCommit||""))))throw Error("El recibo no corresponde a esta reunión.");
  if(proof.status!=="absent"&&proof.resolution==="mixed"&&!mixedProofValid(proof.mixedSelection))throw Error("El recibo no vincula una selección mixta válida; no se repite.");
  return proof;
}
export async function joinIdenticalHistories(projectId:string,review:ProjectRemoteReview,attemptId:string){
  return publishGraphJoin(projectId,review,attemptId,"identical");
}
export async function keepLocalHistories(projectId:string,review:ProjectRemoteReview,attemptId:string,acknowledgedRemoteHistoryOnly:boolean){
  if(!acknowledgedRemoteHistoryOnly)throw Error("Confirma que los cambios remotos permanecerán solo en el historial.");
  return publishGraphJoin(projectId,review,attemptId,"keep-local");
}
export async function joinMixedHistories(projectId:string,review:MixedSelectionReview,attemptId:string,acknowledged:boolean){
 if(!acknowledged||!review.ready||!mixedProofValid(review.proof)||review.proof.planId!==review.id||review.proof.planRevision!==review.planRevision)throw Error("Revisa y confirma la combinación guardada antes de reunir los historiales.");
 return publishGraphJoin(projectId,review,attemptId,"mixed",review);
}
async function publishGraphJoin(projectId:string,review:Pick<ProjectRemoteReview,"schemaVersion"|"projectId"|"revision"|"relation">&{graphJoin?:ProjectRemoteReview["graphJoin"]},attemptId:string,resolution:GraphJoinResolution,mixed?:MixedSelectionReview){
  const available=resolution==="mixed"?mixed?.ready:resolution==="keep-local"?review.graphJoin?.canKeepLocal:review.graphJoin?.canJoin;
  if(review.projectId!==projectId||review.schemaVersion!==1||review.relation!=="diverged"||!available||!/^[a-f0-9]{64}$/i.test(review.revision)||!/^attempt-[a-f0-9]{32}$/i.test(attemptId))throw Error("Vuelve a revisar los dos historiales antes de reunirlos.");
  const valid=(proof:GraphJoinProof)=>proof.schemaVersion===1&&proof.projectId===projectId&&proof.attemptId===attemptId&&proof.reviewedRevision===review.revision&&(proof.resolution??"identical")===resolution&&proof.canReplay===false&&proof.status==="confirmed"&&(resolution!=="mixed"||(mixedProofValid(proof.mixedSelection)&&proof.mixedSelection?.planId===mixed?.id&&proof.mixedSelection?.planRevision===mixed?.planRevision&&proof.mixedSelection?.choicesSha256===mixed?.proof.choicesSha256))&&typeof proof.targetCommit==="string"&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(proof.targetCommit);
  const payload={revision:review.revision,attemptId,...(resolution==="mixed"?{resolution,mixedPlanId:mixed?.id,mixedPlanRevision:mixed?.planRevision,acknowledgePreparedCombination:true}:resolution==="keep-local"?{resolution,acknowledgeRemoteHistoryOnly:true}:{})};
  try{
    const proof=await requestJson<GraphJoinProof>(`/api/projects/${encodeURIComponent(projectId)}/sync/graph-joins`,{method:"POST",body:JSON.stringify(payload)});
    if(!valid(proof))throw Error("Publicación del historial pendiente de confirmar.");return proof;
  }catch(failure){
    if(failure instanceof ApiError&&failure.operationOutcome==="not-started")throw failure;
    const proof=await reviewGraphJoin(projectId,attemptId);if(valid(proof))return proof;throw Error(proof.message||"No se confirma la reunión. Conserva el recibo y consúltalo sin repetir.");
  }
}
