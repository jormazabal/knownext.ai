import {expect,it} from "vitest";
import {createLoadedDocumentSession,applyLocalMarkdownEdit} from "./documentSessions";
import {imageInsertionTargetIsCurrent,type ImageInsertionTarget} from "./imageInsertionTarget";
const session=createLoadedDocumentSession({id:"p::A.md",projectId:"p",path:"A.md",name:"A.md",markdown:"Original",wordCount:1,updatedAt:"2026-11-02T12:00:00Z"});
const target:ImageInsertionTarget={projectId:"p",projectEpoch:1,documentId:"p::A.md",session:{...session}};
const current={projectId:"p",projectEpoch:1,activeDocumentId:"p::A.md",sessions:{"p::A.md":session}};
it("accepts only the reviewed document revision and preserves later typing",()=>{
 expect(imageInsertionTargetIsCurrent(target,current)).toBe(true);const edited=applyLocalMarkdownEdit(session,"Original con edición posterior");expect(imageInsertionTargetIsCurrent(target,{...current,sessions:{"p::A.md":edited}})).toBe(false);expect(edited.markdown).toBe("Original con edición posterior");
});
it("does not revive an old visit, closed tab or reloaded document",()=>{
 for(const context of [{...current,projectId:"other"},{...current,projectEpoch:3},{...current,activeDocumentId:"p::B.md"},{...current,sessions:{}},{...current,sessions:{"p::A.md":{...session,loadVersion:session.loadVersion+1}}}])expect(imageInsertionTargetIsCurrent(target,context)).toBe(false);
});
it("blocks unavailable/protection-conflicted sessions while allowing ordinary unsaved work",()=>{
 for(const changes of [{isLoading:true},{orphaned:true},{draftWriteConflict:true}])expect(imageInsertionTargetIsCurrent(target,{...current,sessions:{"p::A.md":{...session,...changes}}})).toBe(false);
 const dirty=applyLocalMarkdownEdit(session,"Borrador propio");expect(imageInsertionTargetIsCurrent({...target,session:dirty},{...current,sessions:{"p::A.md":dirty}})).toBe(true);
});
