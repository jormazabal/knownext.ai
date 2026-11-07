import {requestJson} from "./client";
import {deliverConflictPackage} from "./conflictPackageDelivery";
import type {ConflictPackageReview,ConflictPackageDelivery} from "../../types/conflictPackage";
const hash=(value:unknown):value is string=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
const bytes=(value:unknown,max:number):value is number=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0&&value<=max;
export async function reviewConflictPackage(id:string):Promise<ConflictPackageReview>{
 const value=await requestJson<ConflictPackageReview>(`/api/recovery/conflict-attempts/${encodeURIComponent(id)}/package-review`);
 const paths=new Set<string>();
 if(value?.schemaVersion!==1||value.attemptId!==id||!hash(value.reviewRevision)||!hash(value.packageSha256)||!bytes(value.byteLength,32*1024*1024)||!value.byteLength||typeof value.fileName!=="string"||value.fileName.length>140||!/^Variantes-[a-zA-Z0-9-]+\.zip$/.test(value.fileName)||value.originalsPreserved!==true||value.canExport!==true||!Array.isArray(value.files)||value.files.length<3||value.files.length>5||value.files.some(file=>!file||typeof file.path!=="string"||! /^(?:Variantes\/(?:Equipo|Disco|Propuesta|Remoto)\.(?:md|knote)|Fuentes\/Historico\.md)$/.test(file.path)||paths.has(file.path)||!paths.add(file.path)||typeof file.role!=="string"||file.role.length>40||!hash(file.sha256)||!bytes(file.byteLength,8*1024*1024))||!Array.isArray(value.warnings)||value.warnings.length>16||value.warnings.some(warning=>typeof warning!=="string"||warning.length>1000)||!Number.isFinite(Date.parse(value.checkedAt)))throw Error("La revisión del paquete no confirma su identidad o contenido. Se conservan los originales.");
 return value;
}
export async function exportConflictPackage(review:ConflictPackageReview):Promise<ConflictPackageDelivery>{
 const value=await deliverConflictPackage(review.attemptId,review.reviewRevision) as ConflictPackageDelivery;
 if(!value||value.attemptId!==review.attemptId||value.reviewRevision!==review.reviewRevision||!(value.status==="saved"||value.status==="cancelled")||typeof value.requestId!=="string"||!value.requestId||!Number.isFinite(Date.parse(value.completedAt))||value.status==="saved"&&(value.byteLength!==review.byteLength||typeof value.fileName!=="string"||!value.fileName))throw Error("No se confirmó la entrega de este conjunto. Comprueba el destino antes de repetir.");
 return value;
}
