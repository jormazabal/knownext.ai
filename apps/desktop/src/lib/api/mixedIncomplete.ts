import {requestJson} from "./client";
import {deliverIncompleteMixed} from "./mixedIncompleteDelivery";
import type {MixedIncomplete} from "../../types/mixedIncomplete";
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/i.test(v);
const size = (v: unknown, max: number) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
export async function reviewIncompleteMixed(project: string, plan: string) {
  const value = await requestJson<MixedIncomplete>(`/api/projects/${encodeURIComponent(project)}/sync/mixed-selections/${encodeURIComponent(plan)}/application/copies`);
  if (!value || value.schemaVersion !== 1 || value.projectId !== project || value.planId !== plan || !hash(value.revision) || !["missing","present","unavailable"].includes(value.recordState) || !Array.isArray(value.rows) || value.rows.length > 1024 || new Set(value.rows.map(r=>r?.key)).size !== value.rows.length || !size(value.ignoredCount,1027) || typeof value.limited !== "boolean" || value.provenanceVerified !== false || value.canApply !== false || value.canDelete !== false || !Number.isFinite(Date.parse(value.checkedAt)) || value.rows.some(row => !row || !size(row.slot,255) || !["before","after"].includes(row.side) || !["plain","compact"].includes(row.representation) || row.key !== `${String(row.slot).padStart(3,"0")}-${row.side}.bin${row.representation==="compact"?".zip":""}` || !["readable","unavailable"].includes(row.status) || (row.status === "readable" ? !size(row.bytes,8*1024*1024) || !hash(row.sha256) : row.bytes !== null || row.sha256 !== null))) throw Error("La respuesta no identifica las copias conservadas de esta preparación.");
  return value;
}
export async function exportIncompleteMixed(review: MixedIncomplete, key: string) {
  if (!hash(review.revision) || !review.rows.some(row => row.key === key && row.status === "readable")) throw Error("Elige una copia legible de la revisión actual.");
  const value = await deliverIncompleteMixed(review.projectId,review.planId,review.revision,key) as {schemaVersion:number; projectId:string; planId:string; reviewRevision:string; key:string; status:string; archiveSha256:string; byteLength?:number; fileName?:string; canApply:boolean; canDelete:boolean; requestId:string; completedAt:string};
  if (!value || value.schemaVersion!==1 || value.projectId!==review.projectId || value.planId!==review.planId || value.reviewRevision!==review.revision || value.key!==key || !["saved","cancelled"].includes(value.status) || !hash(value.archiveSha256) || value.canApply!==false || value.canDelete!==false || typeof value.requestId!=="string" || !value.requestId || !Number.isFinite(Date.parse(value.completedAt)) || value.status==="saved" && (!size(value.byteLength,10*1024*1024) || !value.byteLength || typeof value.fileName!=="string" || !value.fileName)) throw Error("No se confirmó esta extracción. Comprueba el destino antes de repetir.");
  return value;
}

export async function reprepareIncompleteMixed(review:MixedIncomplete){
 if(!review.canReprepare||!hash(review.revision))throw Error("Vuelve a revisar esta preparación antes de crear otra selección");
 const result=await requestJson<{projectId:string;sourcePlanId:string;planId:string;status:string;preservesOriginal:boolean}>(`/api/projects/${encodeURIComponent(review.projectId)}/sync/mixed-selections/${encodeURIComponent(review.planId)}/application/reprepare`,{method:"POST",body:JSON.stringify({revision:review.revision,acknowledge:true})});
 if(result.projectId!==review.projectId||result.sourcePlanId!==review.planId||!/^mixed-[a-f0-9]{32}$/.test(result.planId)||!["prepared","already-prepared"].includes(result.status)||result.preservesOriginal!==true)throw Error("La nueva selección no está confirmada. Consulta el catálogo sin repetir");return result;
}

export async function abandonIncompleteMixed(review:MixedIncomplete){
 if(!review.canAbandon||!hash(review.revision))throw Error("Revisa esta preparación antes de cerrar su admisión");
 const result=await requestJson<MixedIncomplete&{closed:boolean;preservesOriginal:boolean;changesWorkingFiles:boolean}>(`/api/projects/${encodeURIComponent(review.projectId)}/sync/mixed-selections/${encodeURIComponent(review.planId)}/application/abandon-incomplete`,{method:"POST",body:JSON.stringify({revision:review.revision,acknowledge:true})});
 if(result.projectId!==review.projectId||result.planId!==review.planId||result.closed!==true||result.preservesOriginal!==true||result.changesWorkingFiles!==false||!hash(result.revision))throw Error("El cierre no está confirmado. Consulta sin repetir");return result;
}
