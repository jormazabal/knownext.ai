import {requestJson} from "./client";
import type {PortablePreferencesReview,PortablePreferencesResult} from "../../types/portablePreferences";
const hash=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{64}$/i.test(v);
function validate(value:PortablePreferencesReview,projectId:string){
 if(!value||value.schemaVersion!==1||value.projectId!==projectId||!hash(value.revision)||!Number.isFinite(Date.parse(value.checkedAt))||value.source!=="Archivo KnowNext/Preferencias.json"||value.dataOnly!==true||value.changesAi!==false||typeof value.canApply!=="boolean")throw Error("La revisión no confirma el ámbito de las preferencias. Consulta de nuevo.");
 for(const projection of [value.imported,value.observed]){
  if(!projection||!projection.appearance||!projection.layout||Object.keys(projection).some(k=>!["appearance","layout"].includes(k)))throw Error("Proyección de preferencias no compatible.");
  for(const [group,keys] of [[projection.appearance,["language","themeMode","primaryColor","zoomPercent","markdownExtendedUnderlineEnabled"]],[projection.layout,["sidebarWidth","historyWidth","navigationVisible","contextPinned","contextKind"]]] as const){
   if(typeof group!=="object"||Array.isArray(group)||Object.entries(group).some(([key,item])=>!keys.some(k=>k===key)||item!==null&&!["string","number","boolean"].includes(typeof item)||typeof item==="string"&&item.length>64||typeof item==="number"&&!Number.isFinite(item)))throw Error("Valores de preferencias no comparables. Los ajustes actuales se conservan.");
  }
 }
 return value;
}
const path=(id:string)=>`/api/projects/${encodeURIComponent(id)}/portable-preferences`;
export async function reviewPortablePreferences(projectId:string){return validate(await requestJson<PortablePreferencesReview>(path(projectId)),projectId);}
export async function applyPortablePreferences(review:PortablePreferencesReview,appearance:boolean,layout:boolean){
 validate(review,review.projectId);if(!(appearance||layout))throw Error("Elige los ajustes que quieres aplicar.");
 const result=await requestJson<PortablePreferencesResult>(path(review.projectId),{method:"POST",body:JSON.stringify({revision:review.revision,appearance,layout,acknowledge:true})});
 if(result?.schemaVersion!==1||result.projectId!==review.projectId||result.requestRevision!==review.revision||!["applied","unchanged"].includes(result.status)||result.changesAi!==false||!Number.isFinite(Date.parse(result.checkedAt)))throw Error("No se recibió confirmación de las preferencias. Consulta sin repetir.");validate(result.review,review.projectId);return result;
}
