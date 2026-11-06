import {requestJson} from "./client";
import type {MigrationRetentionAction,MigrationRetentionReview,MigrationRetentionResult} from "../../types/migrationRetention";
export function reviewMigrationRetention(id:string){return requestJson<MigrationRetentionReview>(`/api/recovery/upgrades/${encodeURIComponent(id)}/retention`);}
export function changeMigrationRetention(id:string,revision:string,action:MigrationRetentionAction,confirmDelete=false){return requestJson<MigrationRetentionResult>(`/api/recovery/upgrades/${encodeURIComponent(id)}/retention`,{method:"POST",body:JSON.stringify({revision,action,confirmDelete})});}
