import {requestJson} from "./client";
import {isTauriRuntime} from "../runtime/platform";
import type {ScheduledBackupSnapshot,ScheduledBackupReceipt,ScheduledBackupPolicyDraft,ScheduledBackupRunResult,ScheduledBackupReceiptOwner,ScheduledBackupRestoreOptions,ScheduledBackupRestoreResult} from "../../types/scheduledBackups";
export type {ScheduledBackupSnapshot,ScheduledBackupReceipt,ScheduledBackupPolicyDraft,ScheduledBackupRunResult,ScheduledBackupReceiptOwner,ScheduledBackupRestoreOptions,ScheduledBackupRestoreResult} from "../../types/scheduledBackups";
const base=(projectId:string)=>`/api/projects/${encodeURIComponent(projectId)}/scheduled-backups`;
const hash=(value:unknown):value is string=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
const count=(value:unknown):value is number=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;
const object=(value:unknown)=>!!value&&typeof value==="object"&&!Array.isArray(value);
const stamp=(value:unknown)=>typeof value==="string"&&Number.isFinite(Date.parse(value));
const portable=(value:unknown):value is string=>typeof value==="string"&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(value);
function valid(value:unknown):asserts value{if(!value)throw Error("La copia no confirma el proyecto, la fuente y la generación revisados. Consulta su recibo sin repetir la operación.");}
function native(){if(!isTauriRuntime())throw Error("Las copias programadas requieren la aplicación nativa. No se sustituye su estado por un inventario vacío.");}
function owner(value:ScheduledBackupReceiptOwner){valid(object(value)&&hash(value.profileHash)&&hash(value.sourceRootHash));}
function sameOwner(a:ScheduledBackupReceiptOwner,b:ScheduledBackupReceiptOwner){return a.profileHash===b.profileHash&&a.sourceRootHash===b.sourceRootHash;}
function receipt(value:unknown,projectId:string,generation?:number,expected?:ScheduledBackupReceiptOwner):ScheduledBackupReceipt{
 const v=value as ScheduledBackupReceipt;valid(object(v)&&v.schemaVersion===1&&v.projectId===projectId&&count(v.generation)&&v.generation>0&&(generation===undefined||v.generation===generation)&&count(v.policyGeneration)&&hash(v.profileHash)&&hash(v.sourceRootHash)&&["preparing","interrupted","verified","partial","failed","retired","missing","outside-history"].includes(v.phase)&&stamp(v.createdAt)&&(v.finishedAt===null||stamp(v.finishedAt))&&(v.archiveSha256===null||hash(v.archiveSha256))&&count(v.archiveBytes)&&v.archiveBytes<=512*1024*1024&&typeof v.includeArchive==="boolean"&&typeof v.retentionEligible==="boolean"&&Array.isArray(v.warnings)&&v.warnings.length<=1024&&v.warnings.every(w=>typeof w==="string")&&(v.restoreTransferId===null||portable(v.restoreTransferId))&&["none","starting","ready","uncertain"].includes(v.restoreStatus)&&v.canReplay===false&&stamp(v.checkedAt));
 if(expected){owner(expected);valid(sameOwner(v,expected));}
 if(v.phase==="verified"||v.phase==="partial")valid(hash(v.archiveSha256)&&v.archiveBytes>0&&stamp(v.finishedAt));
 if(v.phase==="partial")valid(v.retentionEligible===false);
 if(v.restoreStatus==="ready"||v.restoreStatus==="starting")valid(!!v.restoreTransferId);
 if(v.restoreStatus==="none")valid(v.restoreTransferId===null);
 return v;
}
function snapshot(value:unknown,projectId:string,readOnly?:boolean):ScheduledBackupSnapshot{
 const v=value as ScheduledBackupSnapshot;valid(object(v)&&v.schemaVersion===1&&v.projectId===projectId&&hash(v.revision)&&hash(v.sourceRootHash)&&hash(v.profileHash)&&typeof v.bindingMatches==="boolean"&&(v.sourceAvailable===undefined||typeof v.sourceAvailable==="boolean")&&typeof v.readOnly==="boolean"&&(readOnly===undefined||v.readOnly===readOnly)&&v.startsProvider===false&&count(v.policyGeneration)&&count(v.latestGeneration)&&count(v.nextGeneration)&&v.nextGeneration>0&&v.nextGeneration===v.latestGeneration+1&&(v.nextDueAt===null||stamp(v.nextDueAt))&&Array.isArray(v.snapshots)&&v.snapshots.length<=64&&count(v.unknownEntries)&&count(v.storageBytes)&&v.maxBytes===10737418240&&stamp(v.checkedAt));
 valid(object(v.policy)&&typeof v.policy.enabled==="boolean"&&v.policy.intervalHours===24&&count(v.policy.keep)&&v.policy.keep>=1&&v.policy.keep<=16&&typeof v.policy.includeArchive==="boolean"&&typeof v.policy.retentionAllowed==="boolean");
 if(v.sourceAvailable===false)valid(v.bindingMatches===false);if(!v.bindingMatches)valid(v.policy.enabled===false);if(!v.policy.enabled)valid(v.nextDueAt===null);
 for(const row of v.snapshots)receipt(row,projectId);valid(new Set(v.snapshots.map(row=>row.generation)).size===v.snapshots.length);
 // Historical roots/profiles remain data; only a new explicit policy may bind the current source.
 return v;
}
function policyDraft(value:ScheduledBackupPolicyDraft){valid(object(value)&&typeof value.enabled==="boolean"&&count(value.keep)&&value.keep>=1&&value.keep<=16&&typeof value.includeArchive==="boolean"&&typeof value.ackRetention==="boolean"&&(value.ackBinding===undefined||typeof value.ackBinding==="boolean"));}
export async function getScheduledBackups(projectId:string):Promise<ScheduledBackupSnapshot>{native();return snapshot(await requestJson(base(projectId)),projectId,true);}
export async function updateScheduledBackupPolicy(projectId:string,current:ScheduledBackupSnapshot,draft:ScheduledBackupPolicyDraft):Promise<ScheduledBackupSnapshot>{
 native();snapshot(current,projectId);policyDraft(draft);if(draft.enabled)valid(current.sourceAvailable!==false&&(current.bindingMatches||draft.ackBinding===true));
 const body={revision:current.revision,enabled:draft.enabled,keep:draft.keep,includeArchive:draft.includeArchive,ackRetention:draft.ackRetention,...(draft.ackBinding?{ackBinding:true}:{})};
 const result=snapshot(await requestJson(base(projectId),{method:"PUT",body:JSON.stringify(body)}),projectId,false);
 const expectedBinding=current.sourceAvailable===false?false:current.bindingMatches||draft.ackBinding===true;
 valid(sameOwner(current,result)&&result.bindingMatches===expectedBinding&&result.revision!==current.revision&&result.policyGeneration>current.policyGeneration&&result.policy.enabled===draft.enabled&&result.policy.keep===draft.keep&&result.policy.includeArchive===draft.includeArchive&&result.policy.retentionAllowed===draft.ackRetention);return result;
}
export async function runScheduledBackup(projectId:string,current:ScheduledBackupSnapshot):Promise<ScheduledBackupRunResult>{
 native();snapshot(current,projectId);valid(current.bindingMatches&&current.sourceAvailable!==false);const expected=current.nextGeneration;
 const value=await requestJson<ScheduledBackupRunResult>(base(projectId)+"/run",{method:"POST",body:JSON.stringify({revision:current.revision,expectedGeneration:expected,acknowledge:true})});
 const result=snapshot(value,projectId,false);const proof=receipt(value.receipt,projectId,expected,current);
 valid(sameOwner(current,result)&&result.latestGeneration===expected&&result.nextGeneration===expected+1&&result.policyGeneration===current.policyGeneration&&proof.policyGeneration===current.policyGeneration&&proof.includeArchive===current.policy.includeArchive&&result.policy.enabled===current.policy.enabled&&result.policy.keep===current.policy.keep&&result.policy.includeArchive===current.policy.includeArchive&&result.policy.retentionAllowed===current.policy.retentionAllowed);
 return {...result,readOnly:false,receipt:proof};
}
export async function getScheduledBackupReceipt(projectId:string,generation:number,expected?:ScheduledBackupReceiptOwner):Promise<ScheduledBackupReceipt>{native();valid(count(generation)&&generation>0);if(expected)owner(expected);return receipt(await requestJson(base(projectId)+"/"+generation),projectId,generation,expected);}
export async function restoreScheduledBackup(projectId:string,current:ScheduledBackupSnapshot,selected:ScheduledBackupReceipt,options:ScheduledBackupRestoreOptions={}):Promise<ScheduledBackupRestoreResult>{
 native();snapshot(current,projectId);receipt(selected,projectId);valid(object(options)&&(options.ackPartial===undefined||typeof options.ackPartial==="boolean")&&(options.ackBinding===undefined||typeof options.ackBinding==="boolean"));valid(["verified","partial"].includes(selected.phase)&&hash(selected.archiveSha256));valid(selected.phase!=="partial"||options.ackPartial===true);valid(current.bindingMatches&&current.sourceAvailable!==false&&sameOwner(current,selected)||options.ackBinding===true);
 const body={revision:current.revision,archiveSha256:selected.archiveSha256,acknowledge:true,...(options.ackPartial?{ackPartial:true}:{}),...(options.ackBinding?{ackBinding:true}:{})};
 const value=await requestJson<ScheduledBackupRestoreResult>(base(projectId)+"/"+selected.generation+"/restore",{method:"POST",body:JSON.stringify(body)});
 valid(object(value)&&value.schemaVersion===1&&value.projectId===projectId&&value.generation===selected.generation&&portable(value.transferId)&&value.readOnly===false&&value.startsProvider===false);
 const proof=receipt(value.receipt,projectId,selected.generation,selected);valid(proof.archiveSha256===selected.archiveSha256&&proof.archiveBytes===selected.archiveBytes&&proof.phase===selected.phase&&proof.includeArchive===selected.includeArchive&&proof.restoreStatus==="ready"&&proof.restoreTransferId===value.transferId&&proof.policyGeneration===selected.policyGeneration);
 const job=value.transfer;valid(object(job)&&job.id===value.transferId&&job.kind==="import"&&job.phase==="ready"&&job.archiveSha256===selected.archiveSha256&&job.archiveBytes===selected.archiveBytes&&job.projectId===null&&job.targetProjectId===null&&job.cancelRequested===false&&job.interrupted===false&&object(job.manifest)&&job.manifest?.format==="knownext.project"&&[1,2,3].includes(job.manifest.schemaVersion)&&Array.isArray(job.manifest.files)&&job.manifest.files.length<=10000&&Array.isArray(job.manifest.directories)&&job.manifest.directories.length<=10000);
 return value;
}
