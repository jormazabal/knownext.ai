import {expect,it,vi} from "vitest";
import {createDefaultHandwrittenContent} from "../features/handwritten/handwrittenModel";
import {acknowledgeMergedNote,confirmHandwrittenMerge,noteConflictRevision,verifyHandwrittenMergeAttempt} from "./handwrittenMerge";
import {applyLocalHandwrittenNoteEdit,createLoadedHandwrittenNoteSession} from "./handwrittenSessions";
import type {HandwrittenNoteRecord} from "../types/domain";
import type {HandwrittenConflictReview,HandwrittenConflictResult} from "../types/handwrittenConflicts";
import {ApiError} from "../lib/api/client";
const attemptId='attempt-reviewed-note-0001';
function receipt(note:HandwrittenNoteRecord):HandwrittenConflictResult{return {id:'conflict-verified',attemptId,note,preservedCopies:['recovery-local','recovery-disk','recovery-proposal'],sourceUnchanged:true,checkedAt:'now'};}
it("rechecks the same note attempt without requiring a mutation callback",async()=>{
  const content=createDefaultHandwrittenContent('p::note.knote');const review:HandwrittenConflictReview={noteId:content.id,locationRevision:'root',diskContent:content,diskFingerprint:{sha256:'disk'},draftRevision:'draft',checkedAt:'now'};
  const note:HandwrittenNoteRecord={id:content.id,projectId:'p',name:'note.knote',path:'note.knote',content,pageCount:1,updatedAt:'now',baseFingerprint:{sha256:'disk'}};
  const verify=vi.fn(async()=>receipt(note));expect(await verifyHandwrittenMergeAttempt({review,content,attempt:{id:attemptId,verify}})).toMatchObject({reconciled:true,preservedCopies:receipt(note).preservedCopies});expect(verify).toHaveBeenCalledTimes(1);
  await expect(verifyHandwrittenMergeAttempt({review,content,attempt:{id:attemptId,verify:async()=>null}})).rejects.toThrow('todavía no confirma');
});
it("binds a lost note acknowledgement to one durable attempt instead of coincident pages",async()=>{
  const content=createDefaultHandwrittenContent('p::note.knote');const review:HandwrittenConflictReview={noteId:content.id,locationRevision:'root',diskContent:content,diskFingerprint:{sha256:'disk'},draftRevision:'draft',checkedAt:'now'};
  const note:HandwrittenNoteRecord={id:content.id,projectId:'p',name:'note.knote',path:'note.knote',content,pageCount:1,updatedAt:'now',baseFingerprint:{sha256:'disk'}};
  const confirmed={id:'conflict-native',attemptId:'attempt-owned-note-0001',note,preservedCopies:['recovery-local','recovery-disk','recovery-proposal'],sourceUnchanged:true as const,checkedAt:'now'};
  const failed=vi.fn(async()=>{throw Error('ACK unknown');});
  await expect(confirmHandwrittenMerge({review,content,submit:failed,attempt:{id:confirmed.attemptId,verify:async()=>null}})).rejects.toThrow('ACK unknown');
  const submit=vi.fn(async()=>{throw Error('ACK unknown');});
  expect(await confirmHandwrittenMerge({review,content,submit,attempt:{id:confirmed.attemptId,verify:async()=>confirmed}})).toMatchObject({id:confirmed.id,reconciled:true,preservedCopies:confirmed.preservedCopies});
  expect(submit).toHaveBeenCalledTimes(1);expect(failed).toHaveBeenCalledTimes(1);
});
it("keeps a known unapplied note merge rejected even if existing content already matches",async()=>{
  const content=createDefaultHandwrittenContent('p::note.knote');const review:HandwrittenConflictReview={noteId:content.id,locationRevision:'root',diskContent:content,diskFingerprint:{sha256:'disk'},draftRevision:'draft',checkedAt:'now'};
  const cause=new ApiError(409,'Local API error','Proyecto ocupado','not-started');const submit=vi.fn(async()=>{throw cause;});
  const verify=vi.fn(async()=>receipt({id:content.id,projectId:'p',name:'note.knote',path:'note.knote',content,pageCount:1,updatedAt:'now',baseFingerprint:{sha256:'disk'}}));
  await expect(confirmHandwrittenMerge({review,content,submit,attempt:{id:attemptId,verify}})).rejects.toBe(cause);expect(submit).toHaveBeenCalledTimes(1);expect(verify).not.toHaveBeenCalled();
});
it("observes a lost note acknowledgement without replay, ignores JSON property order and keeps later strokes",async()=>{
  const content=createDefaultHandwrittenContent('p::note.knote');const record:HandwrittenNoteRecord={id:content.id,projectId:'p',name:'note.knote',path:'note.knote',content,diskContent:content,pageCount:1,updatedAt:'now',baseFingerprint:{sha256:'old'}};
  const expected=createLoadedHandwrittenNoteSession(record);const combined={...content,title:'Combined'};const observed={...record,content:combined,baseFingerprint:{sha256:'disk'},hasDraft:true};const review:HandwrittenConflictReview={noteId:record.id,locationRevision:'root',diskContent:content,diskFingerprint:{sha256:'disk'},draftRevision:'draft',checkedAt:'now'};
  const submit=vi.fn(async()=>{throw Error('unknown acknowledgement');});const result=await confirmHandwrittenMerge({review,content:combined,submit,attempt:{id:attemptId,verify:async()=>receipt(observed)}});expect(result.reconciled).toBe(true);expect(submit).toHaveBeenCalledTimes(1);expect(noteConflictRevision({...combined,title:'Combined'})).toBe(noteConflictRevision(Object.fromEntries(Object.entries(combined).reverse()) as typeof combined));
  const later={...content,title:'Newer edit'};const accepted=acknowledgeMergedNote(applyLocalHandwrittenNoteEdit(expected,later),observed,expected);expect(accepted.content?.title).toBe('Newer edit');expect(accepted.baseFingerprint?.sha256).toBe('disk');expect(accepted.isDirty).toBe(true);
  await expect(confirmHandwrittenMerge({review,content:combined,submit,attempt:{id:attemptId,verify:async()=>null}})).rejects.toThrow('unknown acknowledgement');
});
