import {expect,it,vi} from "vitest";
import {acknowledgeDraftWrite,isDraftWriteConflict} from "./draftWriteRevision";
import {acknowledgeDocumentSave,applyLocalMarkdownEdit,createLoadedDocumentSession} from "./documentSessions";
import {applyLocalHandwrittenNoteEdit,createLoadedHandwrittenNoteSession} from "./handwrittenSessions";
import {createDefaultHandwrittenContent} from "../features/handwritten/handwrittenModel";
import {ApiError} from "../lib/api/client";
import {LocalEditProtection} from "./localEditProtection";
const record={id:"p::A.md",projectId:"p",path:"A.md",name:"A.md",markdown:"Disk",wordCount:1,updatedAt:"2026-11-02T00:00:00Z",draftWriteRevision:"old"};

it("advances an owned draft acknowledgement without replacing newer typing, undo or another loaded base",()=>{
  const submitted=applyLocalMarkdownEdit(createLoadedDocumentSession(record),"First edit");
  const typed=applyLocalMarkdownEdit(submitted,"New typing");const next=acknowledgeDraftWrite(typed,submitted,"new")!;
  expect(next.markdown).toBe("New typing");expect(next.draftWriteRevision).toBe("new");
  const undone=applyLocalMarkdownEdit(submitted,"Disk");expect(undone.draftWriteRevision).toBe("old");expect(acknowledgeDraftWrite(undone,submitted,"new")).toMatchObject({isDirty:false,draftWriteRevision:"new",pendingDraftDiscard:false});
  const afterDiscard=acknowledgeDraftWrite(typed,submitted,null)!;expect(afterDiscard).toMatchObject({markdown:"New typing",draftWriteRevision:null,isDirty:true});
  const reloaded={...typed,loadVersion:2};expect(acknowledgeDraftWrite(reloaded,submitted,"new")).toBe(reloaded);
  const newBase={...typed,savedMarkdown:"Changed disk base"};expect(acknowledgeDraftWrite(newBase,submitted,"new")).toBe(newBase);
  const warning=acknowledgeDocumentSave(typed,{...record,markdown:"First edit",draftWriteRevision:undefined,draftWriteConflict:true},"First edit");expect(warning).toMatchObject({markdown:"New typing",draftWriteConflict:true,draftWriteRevision:"old"});
});

it("keeps new strokes and ignores acknowledgements for a reloaded note",()=>{
  const content=createDefaultHandwrittenContent("p::A.knote","Sketch");
  const base=createLoadedHandwrittenNoteSession({id:content.id,projectId:"p",path:"A.knote",name:"A.knote",content,pageCount:1,updatedAt:"now",draftWriteRevision:"old"});
  const submitted=applyLocalHandwrittenNoteEdit(base,{...content,title:"First"});const typed=applyLocalHandwrittenNoteEdit(submitted,{...content,title:"More"});
  expect(acknowledgeDraftWrite(typed,submitted,"new")).toMatchObject({content:{title:"More"},draftWriteRevision:"new"});
  const reloaded={...typed,loadVersion:1};expect(acknowledgeDraftWrite(reloaded,submitted,"new")).toBe(reloaded);
});

it("uses structured private-draft errors without mislabelling a project admission or disk conflict",()=>{
  expect(isDraftWriteConflict(new ApiError(409,"Draft","detail","not-started","draft_write_conflict"))).toBe(true);
  expect(isDraftWriteConflict(new ApiError(503,"Draft","detail","not-started","draft_state_unavailable"))).toBe(true);
  expect(isDraftWriteConflict(new ApiError(409,"Draft","draft_write_conflict","not-started","project_write_not_started"))).toBe(false);
});

it("observes a known local-edit copy after a lost acknowledgement, and coalesces concurrent protection",async()=>{
  const copy={key:"recovery-owned",documentId:"p::A.md",fingerprint:"sha"};const proof={status:"verified" as const,copy,checkedAt:"now"} as Awaited<ReturnType<typeof import("../lib/api/recovery").preserveLocalEdit>>;
  const api={createId:vi.fn(()=>copy.key),preserve:vi.fn().mockRejectedValue(new Error("Lost ACK")),review:vi.fn().mockResolvedValue(proof)};
  const protection=new LocalEditProtection(api);const payload={documentId:copy.documentId,markdown:"Open text"};
  const first=protection.protect(payload);expect(protection.protect(payload)).toBe(first);await first;await protection.protect(payload);
  expect(api.preserve).toHaveBeenCalledTimes(1);expect(api.review).toHaveBeenCalledTimes(2);expect(api.createId).toHaveBeenCalledTimes(1);
});

it("never reloads on absent or mismatching protection and never resends an uncertain copy",async()=>{
  const api={createId:vi.fn(()=>"recovery-owned"),preserve:vi.fn().mockRejectedValue(new Error("Unknown")),review:vi.fn().mockResolvedValue({status:"absent",checkedAt:"now"})};
  const protection=new LocalEditProtection(api);const payload={documentId:"p::A.md",markdown:"Keep RAM"};
  await expect(protection.protect(payload)).rejects.toThrow("No se confirmó");await expect(protection.protect(payload)).rejects.toThrow("No se confirmó");expect(api.preserve).toHaveBeenCalledTimes(1);expect(api.review).toHaveBeenCalledTimes(2);
  api.review.mockResolvedValue({status:"verified",copy:{key:"another-copy",documentId:payload.documentId,fingerprint:"sha"},checkedAt:"now"});
  await expect(protection.protect(payload)).rejects.toThrow("No se confirmó");
});
