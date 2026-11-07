import type {HandwrittenNoteContent,HandwrittenNoteRecord} from "../types/domain";
import type {HandwrittenConflictResult,HandwrittenConflictReview} from "../types/handwrittenConflicts";
import {applyLocalHandwrittenNoteEdit,createLoadedHandwrittenNoteSession,sameHandwrittenRevision,type HandwrittenNoteSession} from "./handwrittenSessions";
import {ApiError} from "../lib/api/client";
import type {ConflictAttemptConfirmation} from "../types/conflictAttempts";
export function noteConflictRevision(value:HandwrittenNoteContent){return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);}
export function acknowledgeMergedNote(current:HandwrittenNoteSession,record:HandwrittenNoteRecord,expected:HandwrittenNoteSession):HandwrittenNoteSession{
  const loaded=createLoadedHandwrittenNoteSession(record,{...current,loadVersion:current.loadVersion+1});return sameHandwrittenRevision(current,expected)||!current.content?loaded:applyLocalHandwrittenNoteEdit(loaded,current.content);
}
type AttemptReview={review:HandwrittenConflictReview;content:HandwrittenNoteContent;attempt:ConflictAttemptConfirmation<HandwrittenConflictResult>};
function matchesAttempt({review,content,attempt}:AttemptReview,result:HandwrittenConflictResult){
  function matches(note:HandwrittenNoteRecord){return note.id===review.noteId&&noteConflictRevision(note.content)===noteConflictRevision(content)&&note.baseFingerprint?.sha256===review.diskFingerprint.sha256;}
  return !!result.note&&matches(result.note)&&result.sourceUnchanged===true&&result.attemptId===attempt.id&&result.preservedCopies.length===3&&new Set(result.preservedCopies).size===3;
}
export async function verifyHandwrittenMergeAttempt(options:AttemptReview){
  const confirmed=await options.attempt.verify();if(confirmed&&matchesAttempt(options,confirmed))return {...confirmed,reconciled:true};
  throw new Error("El recibo todavía no confirma este intento de páginas. Revisa su estado sin repetirlo.");
}
export async function confirmHandwrittenMerge({review,content,submit,attempt}:AttemptReview&{submit:()=>Promise<HandwrittenConflictResult>}):Promise<HandwrittenConflictResult>{
  if(!attempt?.id||typeof attempt.verify!=="function")throw new Error("Falta el recibo del intento. La combinación de páginas no ha comenzado.");
  const options={review,content,attempt};
  try{const result=await submit();if(!matchesAttempt(options,result))throw new Error("La confirmación de páginas no corresponde a la revisión enviada.");return result;}catch(cause){if(cause instanceof ApiError&&cause.operationOutcome==="not-started")throw cause;const confirmed=await attempt.verify();if(confirmed&&matchesAttempt(options,confirmed))return {...confirmed,reconciled:true};throw cause;}
}
