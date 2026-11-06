import {requestJson} from "./client";
import type {DocumentConflictReview,DocumentConflictApply,DocumentConflictResult} from "../../types/documentConflicts";
import type {ConflictAttemptObservation} from "../../types/conflictAttempts";
export function reviewDocumentConflict(id:string){return requestJson<DocumentConflictReview>(`/api/documents/${encodeURIComponent(id)}/conflict`);}
export function reviewRemoteDraft(id:string){return requestJson<DocumentConflictReview>(`/api/documents/${encodeURIComponent(id)}/remote-conflict`);}
export function reviewHistoricalDraft(id:string,version:string){return requestJson<DocumentConflictReview>(`/api/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/restore-draft`);}
export function applyDocumentConflict(id:string,payload:DocumentConflictApply){return requestJson<DocumentConflictResult>(`/api/documents/${encodeURIComponent(id)}/conflict`,{method:"POST",body:JSON.stringify(payload)});}
export function reviewDocumentConflictAttempt(id:string,attempt:string,payload:DocumentConflictApply){return requestJson<ConflictAttemptObservation<DocumentConflictResult>>(`/api/documents/${encodeURIComponent(id)}/conflict-attempts/${encodeURIComponent(attempt)}/review`,{method:"POST",body:JSON.stringify(payload)});}
