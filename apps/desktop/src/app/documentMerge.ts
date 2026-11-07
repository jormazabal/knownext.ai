import {applyLocalMarkdownEdit,createLoadedDocumentSession,sameDocumentRevision,type DocumentSession} from "./documentSessions";
import type {DocumentRecord,DocumentSyncStatus} from "../types/domain";
import type {DocumentConflictReview,DocumentConflictResult,RemoteSource} from "../types/documentConflicts";
import {ApiError} from "../lib/api/client";
import type {ConflictAttemptConfirmation} from "../types/conflictAttempts";

export function remoteSourceProof(source:RemoteSource):RemoteSource{
  return {localCommit:source.localCommit,remoteCommit:source.remoteCommit,markdownSha256:source.markdownSha256,revision:source.revision,sourcePath:source.sourcePath};
}

export function acknowledgeMergedDraft(current:DocumentSession,record:DocumentRecord,expected:DocumentSession):DocumentSession{
  const loaded={...createLoadedDocumentSession(record,{...current,loadVersion:current.loadVersion+1}),pendingSaveReason:null};
  return sameDocumentRevision(current,expected)?loaded:applyLocalMarkdownEdit(loaded,current.markdown);
}

export function acknowledgeMergedSyncStatus(status:DocumentSyncStatus|undefined,session:DocumentSession):DocumentSyncStatus|undefined{
  return status?{...status,diskChanged:session.diskChanged,orphaned:session.orphaned,hasDraft:session.hasRecoveredDraft,conflictStatus:session.conflictStatus,currentFingerprint:session.baseFingerprint,savedContentHash:session.savedContentHash,draftContentHash:session.draftContentHash,localChanged:status.localChanged||session.isDirty}:undefined;
}

type AttemptReview={review:DocumentConflictReview;markdown:string;attempt:ConflictAttemptConfirmation<DocumentConflictResult>};
function matchesAttempt({review,markdown,attempt}:AttemptReview,result:DocumentConflictResult){
  const sameHistory=(source:DocumentConflictResult['historySource'])=>!review.historySource||source?.versionId===review.historySource.versionId&&source.markdownSha256===review.historySource.markdownSha256;
  const sameRemote=(source:DocumentConflictResult['remoteSource'])=>!review.remoteSource||!!source&&source.localCommit===review.remoteSource.localCommit&&source.remoteCommit===review.remoteSource.remoteCommit&&source.markdownSha256===review.remoteSource.markdownSha256&&source.revision===review.remoteSource.revision&&source.sourcePath===review.remoteSource.sourcePath;
  return result.document?.id===review.documentId&&result.document.markdown===markdown&&result.document.baseFingerprint?.sha256===review.diskFingerprint.sha256&&result.sourceUnchanged===true&&sameHistory(result.historySource)&&sameRemote(result.remoteSource)&&result.attemptId===attempt.id&&result.preservedCopies.length===(review.remoteSource?4:3)&&new Set(result.preservedCopies).size===result.preservedCopies.length;
}
/** Explicit read-only recheck of the same attempt, without a mutation callback. */
export async function verifyDocumentMergeAttempt(options:AttemptReview){
  const confirmed=await options.attempt.verify();if(confirmed&&matchesAttempt(options,confirmed))return {...confirmed,reconciled:true};
  throw new Error("El recibo todavía no confirma este intento. Revisa su estado sin repetirlo.");
}
/** Only a durable, verified receipt can reconcile a lost acknowledgement. */
export async function confirmDocumentMerge({review,markdown,submit,attempt}:AttemptReview&{submit:()=>Promise<DocumentConflictResult>}):Promise<DocumentConflictResult&{reconciled?:boolean}>{
  if(!attempt?.id||typeof attempt.verify!=="function")throw new Error("Falta el recibo del intento. La combinación no ha comenzado.");
  const options={review,markdown,attempt};
  try{const result=await submit();if(!matchesAttempt(options,result))throw new Error("La confirmación de combinación no corresponde a la revisión enviada.");return result;}catch(cause){
    if(cause instanceof ApiError&&cause.operationOutcome==="not-started")throw cause;
    const confirmed=await attempt.verify();if(confirmed&&matchesAttempt(options,confirmed))return {...confirmed,reconciled:true};
    throw cause;
  }
}
