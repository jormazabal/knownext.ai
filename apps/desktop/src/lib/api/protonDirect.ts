import {requestJson} from "./client";
import type {ProtonAccountStatus, ProtonDirectStatus, ProtonDirectReview, ProtonDirectConflict, ProtonDirectConflicts, ProtonDirectStorage, ProtonConflictResolution, ProtonRetentionReview, ProtonRetentionReceipt, ProtonMigrationDestination, ProtonMigrationReview, ProtonMigrationAttempt, ProtonMigrationStatus} from "../../types/protonDirect";
const account="/api/proton/accounts";
const project=(id:string)=>`/api/projects/${encodeURIComponent(id)}/proton-direct`;
const post=<T>(path:string,body:unknown)=>requestJson<T>(path,{method:"POST",body:JSON.stringify(body),timeoutMs:120000});
export const PROTON_WORKSPACE_CHANGED_EVENT="knownext:proton-workspace-changed";
async function workspaceMutation<T>(projectId:string,action:()=>Promise<T>):Promise<T>{
  try{return await action();}
  finally{
    // A failed acknowledgement may follow confirmed partial writes; refresh without replaying.
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(PROTON_WORKSPACE_CHANGED_EVENT,{detail:{projectId}}));
  }
}
export const getProtonAccount=()=>requestJson<ProtonAccountStatus>(`${account}/status`);
export const startProtonConnection=()=>post<ProtonAccountStatus>(`${account}/start`,{});
export const pollProtonConnection=(connectionId:string)=>post<ProtonAccountStatus>(`${account}/poll`,{connectionId});
export const cancelProtonConnection=(connectionId:string)=>post<ProtonAccountStatus>(`${account}/cancel`,{connectionId});
export const disconnectProtonAccount=(accountId:string)=>post<ProtonAccountStatus>(`${account}/disconnect`,{accountId});
export const getProtonDirectStatus=(id:string)=>requestJson<ProtonDirectStatus>(project(id));
export const reviewProtonDirect=(id:string,accountId:string,remoteRootId?:string)=>post<ProtonDirectReview>(`${project(id)}/review`,{accountId,...(remoteRootId?{remoteRootId}:{})});
export const connectProtonDirect=(id:string,review:Pick<ProtonDirectReview,"id"|"revision">)=>post<ProtonDirectStatus>(`${project(id)}/connect`,{id:review.id,revision:review.revision});
export const syncProtonDirect=(id:string)=>workspaceMutation(id,()=>post<ProtonDirectStatus>(`${project(id)}/sync`,{}));
export const pauseProtonDirect=(id:string,paused:boolean)=>post<ProtonDirectStatus>(`${project(id)}/pause`,{paused});
export const disconnectProtonDirect=(id:string,generation:number)=>post<ProtonDirectStatus>(`${project(id)}/disconnect`,{generation});
export const getProtonDirectConflicts=(id:string)=>requestJson<ProtonDirectConflicts>(`${project(id)}/conflicts`);
export const reviewProtonDirectConflict=(id:string,conflictId:string)=>post<ProtonDirectConflict>(`${project(id)}/conflicts/review`,{conflictId});
export const resolveProtonDirectConflict=(id:string,conflictId:string,revision:string,resolution:ProtonConflictResolution)=>workspaceMutation(id,()=>post<ProtonDirectStatus>(`${project(id)}/conflicts/resolve`,{conflictId,revision,resolution}));
export const getProtonDirectStorage=(id:string)=>requestJson<ProtonDirectStorage>(`${project(id)}/storage`);
export const reviewProtonRetention=(id:string)=>post<ProtonRetentionReview>(`${project(id)}/retention/review`,{});
export const applyProtonRetention=(id:string,review:Pick<ProtonRetentionReview,"id"|"revision">)=>post<ProtonRetentionReceipt>(`${project(id)}/retention/apply`,{id:review.id,revision:review.revision});
export const cancelProtonRetention=(id:string,review:Pick<ProtonRetentionReview,"id"|"revision">)=>post<ProtonRetentionReceipt>(`${project(id)}/retention/cancel`,{id:review.id,revision:review.revision});
export const reviewProtonMigration=(id:string,destination:ProtonMigrationDestination)=>post<ProtonMigrationReview>(`${project(id)}/migration/review`,destination);
export const startProtonMigration=(id:string,review:Pick<ProtonMigrationReview,"id"|"revision">)=>post<ProtonMigrationAttempt>(`${project(id)}/migration/start`,{id:review.id,revision:review.revision});
export const getProtonMigration=(id:string)=>requestJson<ProtonMigrationStatus>(`${project(id)}/migration`);
export const resumeProtonMigration=(id:string,attempt:Pick<ProtonMigrationAttempt,"id"|"revision">)=>post<ProtonMigrationAttempt>(`${project(id)}/migration/start`,{attemptId:attempt.id,revision:attempt.revision});
export const cancelProtonMigration=(id:string,attempt:Pick<ProtonMigrationAttempt,"id"|"revision">)=>post<ProtonMigrationAttempt>(`${project(id)}/migration/cancel`,{attemptId:attempt.id,revision:attempt.revision});
export const acknowledgeProtonMigration=(id:string,attempt:Pick<ProtonMigrationAttempt,"id"|"revision">)=>workspaceMutation(id,()=>post<ProtonMigrationAttempt>(`${project(id)}/migration/ack`,{attemptId:attempt.id,revision:attempt.revision}));
