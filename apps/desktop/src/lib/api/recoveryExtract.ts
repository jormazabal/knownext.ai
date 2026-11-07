import {invokeManagedNative as invoke} from "./nativeClient";
import {requestJson} from "./client";
import {isTauriRuntime} from "../runtime/platform";
import type {RecoveryContentReview,RecoveryContentDelivery} from "../../types/recoveryExtract";
function validate(review:RecoveryContentReview,key:string){
 const document=review?.schemaVersion===1&&review.kind==="document";
 const note=review?.schemaVersion===2&&review.kind==="handwritten-note"&&Number.isSafeInteger(review.pageCount)&&review.pageCount>0&&review.pageCount<=1000&&Number.isSafeInteger(review.strokeCount)&&review.strokeCount>=0&&review.strokeCount<=2_000_000;
 if(!review||(!document&&!note)||review.key!==key||review.provenanceVerified!==false||review.canRestore!==false||!(/^[a-f0-9]{64}$/i.test(review.revision))||!(/^[a-f0-9]{64}$/i.test(review.copySha256))||!Number.isSafeInteger(review.byteLength)||review.byteLength<0||review.byteLength>(document?2:8)*1024*1024||typeof review.canExport!=="boolean"||typeof review.fileName!=="string"||review.fileName.length>200||!review.fileName.endsWith(document?".md":".knote")||typeof review.checkedAt!=="string"||!Number.isFinite(Date.parse(review.checkedAt))||typeof review.text!=="string"||review.text.length>4000||[...review.text].length>2000||typeof review.previewTruncated!=="boolean")throw Error("La respuesta no identifica esta extracción. Revisa de nuevo; el original se conserva.");
 return review;
}
export async function reviewRecoveryContent(key:string):Promise<RecoveryContentReview>{return validate(await requestJson(`/api/recovery/archives/${encodeURIComponent(key)}/content-review`),key);}
export async function deliverRecoveryContent(review:RecoveryContentReview,acknowledgeUnverified:boolean):Promise<RecoveryContentDelivery>{
 validate(review,review.key);if(!review.canExport||!acknowledgeUnverified)throw Error("Confirma la procedencia no comprobada antes de extraer el contenido.");
 if(!isTauriRuntime())throw Error("Guardar la extracción requiere la aplicación nativa; no se simula una entrega.");
 const result=await invoke<RecoveryContentDelivery>("export_recovery_content",{key:review.key,revision:review.revision,acknowledgeUnverified:true});
 if(!result||!['saved','cancelled'].includes(result.status)||typeof result.requestId!=="string"||!result.requestId||typeof result.completedAt!=="string"||!Number.isFinite(Date.parse(result.completedAt)))throw Error("No se confirmó la extracción. Comprueba el destino antes de repetir.");return result;
}
