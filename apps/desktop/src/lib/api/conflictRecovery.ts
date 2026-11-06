import {requestJson} from "./client";
import type {ConflictAttemptInventory,ConflictAttemptRecovery} from "../../types/conflictAttempts";
export function listConflictAttempts(archived=false){return requestJson<ConflictAttemptInventory>(archived?"/api/recovery/conflict-attempt-archives":"/api/recovery/conflict-attempts");}
export function reviewConflictAttempt(id:string){return requestJson<ConflictAttemptRecovery>(`/api/recovery/conflict-attempts/${encodeURIComponent(id)}`);}
export function changeConflictAttemptArchive(id:string,revision:string,action:"archive"|"reopen"){return requestJson<{id:string;status:"archived"|"active";revision:string;checkedAt:string}>(`/api/recovery/conflict-attempts/${encodeURIComponent(id)}/archive-state`,{method:"POST",body:JSON.stringify({revision,action})});}
