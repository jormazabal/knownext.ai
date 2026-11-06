import {expect,it,vi} from "vitest";
import {confirmDocumentMerge,acknowledgeMergedDraft,acknowledgeMergedSyncStatus} from "./documentMerge";
import {createLoadedDocumentSession,applyLocalMarkdownEdit,acceptsDocumentSyncObservation} from "./documentSessions";
import type {DocumentRecord} from "../types/domain";
import type {DocumentConflictReview,DocumentConflictResult} from "../types/documentConflicts";
import {ApiError} from "../lib/api/client";
const attemptId='attempt-reviewed-0001';
function receipt(document:DocumentRecord,review:DocumentConflictReview):DocumentConflictResult{return {id:'conflict-verified',attemptId,document,preservedCopies:['local','disk','proposal',...(review.remoteSource?['remote']:[])].map(role=>'recovery-'+role),sourceUnchanged:true,checkedAt:'now',historySource:review.historySource,remoteSource:review.remoteSource};}
it("requires the exact durable attempt and real copy identities after an unknown acknowledgement",async()=>{
  const review:DocumentConflictReview={documentId:'p::a.md',locationRevision:'root',diskMarkdown:'Disk',diskFingerprint:{sha256:'disk'},draftRevision:'draft',checkedAt:'now'};
  const document:DocumentRecord={id:review.documentId,projectId:'p',name:'a.md',path:'a.md',markdown:'Combined',baseFingerprint:{sha256:'disk'},wordCount:1,updatedAt:'now'};
  const confirmed={id:'conflict-native',attemptId:'attempt-owned-0001',document,preservedCopies:['recovery-local','recovery-disk','recovery-proposal'],sourceUnchanged:true,checkedAt:'now'};
  for(const receipt of [null,{...confirmed,attemptId:'attempt-other'},{...confirmed,preservedCopies:[]},confirmed]){
    const submit=vi.fn(async()=>{throw Error('ACK unknown');});const verify=vi.fn(async()=>receipt);
    const result=confirmDocumentMerge({review,markdown:'Combined',submit,attempt:{id:'attempt-owned-0001',verify}});
    if(receipt===confirmed)expect(await result).toMatchObject({id:'conflict-native',reconciled:true,preservedCopies:confirmed.preservedCopies});else await expect(result).rejects.toThrow('ACK unknown');
    expect(submit).toHaveBeenCalledTimes(1);expect(verify).toHaveBeenCalledTimes(1);
  }
});

it("does not mistake an unchanged matching draft for success after a known preflight rejection",async()=>{
  const review:DocumentConflictReview={documentId:'p::a.md',locationRevision:'root',diskMarkdown:'Disk',diskFingerprint:{sha256:'disk'},draftRevision:'draft',checkedAt:'now'};
  const cause=new ApiError(409,'Local API error','Proyecto ocupado','not-started');
  const submit=vi.fn(async()=>{throw cause;});
  const verify=vi.fn(async()=>receipt({id:review.documentId,projectId:'p',name:'a.md',path:'a.md',markdown:'Same draft',baseFingerprint:{sha256:'disk'},wordCount:2,updatedAt:'now'},review));
  await expect(confirmDocumentMerge({review,markdown:'Same draft',submit,attempt:{id:attemptId,verify}})).rejects.toBe(cause);
  expect(submit).toHaveBeenCalledTimes(1);expect(verify).not.toHaveBeenCalled();
});

it("binds remote reconciliation to the exact known reference without replay",async()=>{
  const remoteSource={sourcePath:'a.md',localCommit:'local',remoteCommit:'remote',markdownSha256:'remote-text',revision:'authority',markdown:'Remote'};
  const review:DocumentConflictReview={documentId:'p::a.md',locationRevision:'root',diskMarkdown:'Disk',diskFingerprint:{sha256:'disk'},draftRevision:'draft',checkedAt:'now',remoteSource};
  const document:DocumentRecord={id:review.documentId,projectId:'p',name:'a.md',path:'a.md',markdown:'Combined',diskMarkdown:'Disk',baseFingerprint:{sha256:'disk'},wordCount:1,updatedAt:'now'};
  const submit=vi.fn(async()=>{throw Error('unknown result');});const result=await confirmDocumentMerge({review,markdown:'Combined',submit,attempt:{id:attemptId,verify:async()=>receipt(document,review)}});expect(result.reconciled).toBe(true);expect(result.remoteSource?.revision).toBe('authority');expect(submit).toHaveBeenCalledTimes(1);
  for(const changed of [undefined,{...remoteSource,remoteCommit:'new-remote'},{...remoteSource,localCommit:'new-local'},{...remoteSource,revision:'new-origin'},{...remoteSource,sourcePath:'renamed.md'}]){
    await expect(confirmDocumentMerge({review,markdown:'Combined',submit,attempt:{id:attemptId,verify:async()=>({...receipt(document,review),remoteSource:changed})}})).rejects.toThrow('unknown result');
  }
});

it("rejects disk observations from a pre-merge base while preserving real remote divergence",()=>{
  const original:DocumentRecord={id:"p::a.md",projectId:"p",name:"a.md",path:"a.md",markdown:"Local",diskMarkdown:"Base",wordCount:1,updatedAt:"now",hasDraft:true,isDirty:true,baseFingerprint:{sha256:"old"},diskChanged:true,conflictStatus:"disk-changed"};
  const chosen=createLoadedDocumentSession(original);const merged=acknowledgeMergedDraft(chosen,{...original,markdown:"Combined",diskMarkdown:"Disk",baseFingerprint:{sha256:"new"},diskChanged:false,conflictStatus:"draft"},chosen);
  expect(acceptsDocumentSyncObservation(merged,chosen)).toBe(false);expect(acceptsDocumentSyncObservation(applyLocalMarkdownEdit(merged,"Typing after merge"),merged)).toBe(true);
  const status=acknowledgeMergedSyncStatus({documentId:original.id,exists:true,diskChanged:true,hasDraft:true,orphaned:false,conflictStatus:"disk-changed",versionState:"diverged",localChanged:true,remoteChanged:true,remoteVersionHash:"remote"},merged);
  expect(status?.diskChanged).toBe(false);expect(status?.conflictStatus).toBe("draft");expect(status?.remoteChanged).toBe(true);expect(status?.versionState).toBe("diverged");expect(status?.remoteVersionHash).toBe("remote");
});

it("requires matching historical provenance when reconciling a partial restore without replay",async()=>{
  const review:DocumentConflictReview={documentId:'p::a.md',locationRevision:'root',diskMarkdown:'Disk',diskFingerprint:{sha256:'disk'},draftRevision:'draft',checkedAt:'now',historySource:{versionId:'historical',markdownSha256:'old-text',markdown:'Historical'}};
  const document:DocumentRecord={id:review.documentId,projectId:'p',name:'a.md',path:'a.md',markdown:'Partial',diskMarkdown:'Disk',baseFingerprint:{sha256:'disk'},wordCount:1,updatedAt:'now'};const submit=vi.fn(async()=>{throw Error('unknown result');});
  const result=await confirmDocumentMerge({review,markdown:'Partial',submit,attempt:{id:attemptId,verify:async()=>receipt(document,review)}});expect(result.reconciled).toBe(true);expect(result.historySource?.versionId).toBe('historical');expect(submit).toHaveBeenCalledTimes(1);
  await expect(confirmDocumentMerge({review,markdown:'Partial',submit,attempt:{id:attemptId,verify:async()=>({...receipt(document,review),historySource:undefined})}})).rejects.toThrow('unknown result');
});

it("reconciles a lost merge acknowledgement by reading without replay and keeps newer typing on the reviewed disk base",async()=>{
  const original:DocumentRecord={id:"p::a.md",projectId:"p",name:"a.md",path:"a.md",markdown:"Local",diskMarkdown:"Base",wordCount:1,updatedAt:"now",hasDraft:true,isDirty:true,baseFingerprint:{sha256:"old"}};
  const chosen=createLoadedDocumentSession(original);const record:DocumentRecord={...original,markdown:"Combined",diskMarkdown:"Disk",baseFingerprint:{sha256:"disk"}};
  const review:DocumentConflictReview={documentId:original.id,locationRevision:"root",diskMarkdown:"Disk",diskFingerprint:{sha256:"disk"},draftRevision:"draft",checkedAt:"now"};const submit=vi.fn(async()=>{throw new Error("lost acknowledgement");}),verify=vi.fn(async()=>receipt(record,review));
  const result=await confirmDocumentMerge({review,markdown:"Combined",submit,attempt:{id:attemptId,verify}});expect(result.reconciled).toBe(true);expect(submit).toHaveBeenCalledTimes(1);expect(verify).toHaveBeenCalledTimes(1);
  const latest=applyLocalMarkdownEdit(chosen,"Newer typing");const accepted=acknowledgeMergedDraft(latest,record,chosen);expect(accepted.markdown).toBe("Newer typing");expect(accepted.savedMarkdown).toBe("Disk");expect(accepted.isDirty).toBe(true);expect(accepted.baseFingerprint?.sha256).toBe("disk");
  await expect(confirmDocumentMerge({review,markdown:"Combined",submit,attempt:{id:attemptId,verify:async()=>null}})).rejects.toThrow("lost acknowledgement");
});
