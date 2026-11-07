import {ApiError,requestJson} from "./client";
import type {AiContextOriginReview,AiContextSourcePreviewResponse} from "../../types/domain";
const digest=(value:unknown):value is string=>typeof value==="string"&&/^[a-f0-9]{64}$/i.test(value);
export async function refreshContextSource(projectId:string,sourceId:string,review:AiContextOriginReview):Promise<AiContextSourcePreviewResponse>{
  if(!review.canRefresh||review.source.id!==sourceId||review.source.projectId!==projectId||!digest(review.sourceRevision)||!digest(review.fileRevision)||!digest(review.locationRevision))throw new Error("Revisa primero la copia y el archivo de origen.");
  const random=new Uint8Array(16);crypto.getRandomValues(random);
  const payload={attemptId:`attempt-${Array.from(random,byte=>byte.toString(16).padStart(2,"0")).join("")}`,sourceRevision:review.sourceRevision,fileRevision:review.fileRevision,locationRevision:review.locationRevision};
  const path=`/api/projects/${encodeURIComponent(projectId)}/ai/context/sources/${encodeURIComponent(sourceId)}`;
  function confirmed(response:AiContextSourcePreviewResponse){const checked=response.originReview,receipt=checked?.lastRefresh;return response.source.id===sourceId&&response.source.projectId===projectId&&checked?.source.id===sourceId&&checked.source.projectId===projectId&&digest(checked.sourceRevision)&&checked.publicationReviewed===true&&receipt?.format===1&&receipt.attemptId===payload.attemptId&&receipt.previousSourceRevision===payload.sourceRevision&&receipt.fileRevision===payload.fileRevision&&receipt.locationRevision===payload.locationRevision;}
  try{
    const response=await requestJson<AiContextSourcePreviewResponse>(`${path}/refresh`,{method:"POST",body:JSON.stringify(payload)});
    if(!confirmed(response))throw new Error("El acuse no corresponde a la copia actualizada.");return response;
  }catch(failure){
    if(failure instanceof ApiError&&failure.operationOutcome==="not-started")throw failure;
    const observed=await requestJson<AiContextSourcePreviewResponse>(`${path}/preview`);
    if(confirmed(observed))return observed;
    throw failure;
  }
}
