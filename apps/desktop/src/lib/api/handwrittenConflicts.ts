import {requestJson} from "./client";
import type {HandwrittenConflictApply,HandwrittenConflictResult,HandwrittenConflictReview} from "../../types/handwrittenConflicts";
import type {ConflictAttemptObservation} from "../../types/conflictAttempts";
export function reviewHandwrittenConflict(id:string){return requestJson<HandwrittenConflictReview>(`/api/handwritten-notes/${encodeURIComponent(id)}/conflict`);}
export function applyHandwrittenConflict(id:string,payload:HandwrittenConflictApply){return requestJson<HandwrittenConflictResult>(`/api/handwritten-notes/${encodeURIComponent(id)}/conflict`,{method:"POST",body:JSON.stringify(payload)});}
export function reviewHandwrittenConflictAttempt(id:string,attempt:string,payload:HandwrittenConflictApply){return requestJson<ConflictAttemptObservation<HandwrittenConflictResult>>(`/api/handwritten-notes/${encodeURIComponent(id)}/conflict-attempts/${encodeURIComponent(attempt)}/review`,{method:"POST",body:JSON.stringify(payload)});}
