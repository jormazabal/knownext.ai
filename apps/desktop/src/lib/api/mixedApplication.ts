import {ApiError,requestJson} from "./client";
import type {MixedApplication} from "../../types/mixedApplication";
const hash=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{64}$/i.test(v);
const base=(project:string,plan:string)=>`/api/projects/${encodeURIComponent(project)}/sync/mixed-selections/${encodeURIComponent(plan)}/application`;
function validate(value:MixedApplication,project:string,plan:string){
 const count=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=256;
 const bytes=(v:unknown)=>v===null||typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=8*1024*1024;
 if(!value||value.schemaVersion!==1||value.projectId!==project||value.planId!==plan||!["absent","preview","prepared","partial","blocked","completed","changed","abandoned","retiring","retired"].includes(value.phase)||typeof value.canContinue!=="boolean"||!Array.isArray(value.rows)||value.rows.length>256||new Set(value.rows.map(row=>row?.path)).size!==value.rows.length||value.rows.some(row=>!row||typeof row.path!=="string"||!row.path||row.path.length>4096||row.path.includes("\\")||row.path.split('/').some(part=>!part||part==='.'||part==='..')||!["create","replace","delete"].includes(row.action)||!["before","after","changed","unavailable"].includes(row.state)||[row.beforeMode,row.afterMode].some(mode=>mode!==undefined&&mode!==null&&!["100644","100755"].includes(mode))||!bytes(row.beforeBytes)||!bytes(row.afterBytes)||row.beforeBytes===null&&row.afterBytes===null||row.action==="create"&&row.beforeBytes!==null||row.action==="delete"&&row.afterBytes!==null)||!Number.isFinite(Date.parse(value.checkedAt)))throw Error("La respuesta no identifica esta preparación. Conserva la selección y consulta sin repetir.");
 if(value.phase==="retiring"||value.phase==="retired"){
   if(!hash(value.revision)||value.canContinue||value.canRelease!==false||value.canAbandon!==false||value.copiesPreserved!==false||value.canReplay!==false||value.rows.length||typeof value.message!=="string")throw Error("La retirada no confirma su estado sin repetición.");return value;
 }
 if(value.phase!=="absent"&&(!hash(value.revision)||!hash(value.planRevision)||!count(value.unchangedCount)||value.rows.length+(value.unchangedCount??0)>256))throw Error("La preparación no confirma su revisión.");
 if(value.phase!=="preview"&&value.phase!=="absent"&&(value.copiesPreserved!==true||value.canReplay!==false||!count(value.appliedCount)||!count(value.pendingCount)||value.appliedCount!==value.rows.filter(row=>row.state==="after").length||value.pendingCount!==value.rows.filter(row=>row.state==="before").length||value.canContinue&&(!value.scopeMatches||!["prepared","partial"].includes(value.phase)||value.rows.some(row=>!["before","after"].includes(row.state)))))throw Error("El estado de los archivos no confirma una continuación segura.");
 if(value.phase==="completed"&&(value.canContinue||value.rows.some(row=>row.state!=="after")))throw Error("La preparación no confirma todos los archivos.");return value;
}
export async function getMixedApplication(project:string,plan:string){return validate(await requestJson<MixedApplication>(base(project,plan)),project,plan);}
export async function previewMixedApplication(project:string,plan:string){return validate(await requestJson<MixedApplication>(`${base(project,plan)}/review`,{method:"POST",body:JSON.stringify({})}),project,plan);}
export async function mutateMixedApplication(project:string,plan:string,review:MixedApplication){
 if(review.projectId!==project||review.planId!==plan||!hash(review.revision)||!(review.phase==="preview"&&review.canStart||review.canContinue))throw Error("Consulta la preparación antes de aplicar.");
 try{return{review:validate(await requestJson<MixedApplication>(base(project,plan)+(review.phase==="preview"?"":"/continue"),{method:"POST",body:JSON.stringify({revision:review.revision,acknowledge:true})}),project,plan),observed:false};}
 catch(error){if(error instanceof ApiError&&error.operationOutcome==="not-started")throw error;try{return{review:await getMixedApplication(project,plan),observed:true};}catch{throw error;}}
}
export async function copyMixedApplication(project:string,plan:string,review:MixedApplication,path:string,side:"before"|"after",name:string){
 if(!hash(review.revision)||review.projectId!==project||review.planId!==plan||!review.rows.some(row=>row.path===path&&(side==="before"?row.beforeBytes:row.afterBytes)!==null))throw Error("La variante no está conservada en esta revisión.");
 const value=await requestJson<{projectId:string;planId:string;name:string;sha256:string;documentId:string;bytes:number}>(`${base(project,plan)}/copy`,{method:"POST",body:JSON.stringify({revision:review.revision,path,side,name})});
 if(value.projectId!==project||value.planId!==plan||value.name!==name||!hash(value.sha256)||!Number.isSafeInteger(value.bytes)||value.bytes<0||value.bytes>8*1024*1024)throw Error("No se confirmó esta copia. Comprueba el destino antes de repetir.");return value;
}

export async function closeMixedApplication(project:string,plan:string,review:MixedApplication,action:"abandon"|"release"){if(!hash(review.revision)||!(action==="abandon"?review.canAbandon:review.canRelease))throw Error("Revisa el cierre de esta preparación antes de continuar.");try{return{review:validate(await requestJson<MixedApplication>(`${base(project,plan)}/close`,{method:"POST",body:JSON.stringify({revision:review.revision,action,acknowledge:true})}),project,plan),observed:false};}catch(error){if(error instanceof ApiError&&error.operationOutcome==="not-started")throw error;try{return{review:await getMixedApplication(project,plan),observed:true};}catch{throw error;}}}
