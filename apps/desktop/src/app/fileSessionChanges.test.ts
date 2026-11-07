import { describe, expect, it } from "vitest";
import { applyDocumentFileChanges, applyHandwrittenFileChanges } from "./fileSessionChanges";
import { applyLocalMarkdownEdit, createLoadedDocumentSession } from "./documentSessions";
import { createLoadedHandwrittenNoteSession } from "./handwrittenSessions";
import { createDefaultHandwrittenContent } from "../features/handwritten/handwrittenModel";
import type { AffectedDocument, DocumentRecord } from "../types/domain";

const before:DocumentRecord={id:"p::a.md",name:"a.md",path:"a.md",projectId:"p",markdown:"[link](b.md) pending",diskMarkdown:"[link](b.md)",hasDraft:true,wordCount:2,updatedAt:"now",baseFingerprint:{size:12,sha256:"old"}};
const after:DocumentRecord={...before,id:"p::folder/a.md",path:"folder/a.md",markdown:"[link](../b.md) pending",diskMarkdown:"[link](../b.md)",baseFingerprint:{size:15,sha256:"rewritten"}};
const change:AffectedDocument={oldId:before.id,newId:after.id,path:after.path,referenceUpdated:true,previousMarkdown:before.markdown,document:after};

describe("file session continuity",()=>{
  it("applies confirmed link rewrites while keeping the document a recovery draft",()=>{
    const result=applyDocumentFileChanges({[before.id]:createLoadedDocumentSession(before)},[change]);
    expect(result[before.id]).toBeUndefined();
    expect(result[after.id].markdown).toBe(after.markdown);
    expect(result[after.id].savedMarkdown).toBe(after.diskMarkdown);
    expect(result[after.id].isDirty).toBe(true);
    expect(result[after.id].lastDraftMarkdown).toBe(after.markdown);
    expect(result[after.id].baseFingerprint).toEqual(after.baseFingerprint);
  });
  it("keeps newer typing and requires review instead of applying an older reference snapshot",()=>{
    const typing=applyLocalMarkdownEdit(createLoadedDocumentSession(before),"New typing");
    const result=applyDocumentFileChanges({[before.id]:typing},[change])[after.id];
    expect(result.markdown).toBe("New typing");expect(result.conflictStatus).toBe("disk-changed");
    expect(result.baseFingerprint).toEqual(before.baseFingerprint);expect(result.isDirty).toBe(true);
  });
  it("can apply final batch snapshots after an earlier item already remapped the tab",()=>{
    const moved=applyDocumentFileChanges({[before.id]:createLoadedDocumentSession(before)},[{oldId:before.id,newId:after.id,path:after.path}]);
    expect(applyDocumentFileChanges(moved,[change])[after.id].markdown).toBe(after.markdown);
    expect(applyDocumentFileChanges({},[change])).toEqual({});
  });
  it("remaps ink identity without dropping pages and retires removed sessions",()=>{
    const content=createDefaultHandwrittenContent("p::a.knote","Ink");
    const session=createLoadedHandwrittenNoteSession({id:"p::a.knote",name:"a.knote",path:"a.knote",projectId:"p",content,pageCount:1,updatedAt:"now"});
    const moved=applyHandwrittenFileChanges({"p::a.knote":session},[{oldId:"p::a.knote",newId:"p::folder/a.knote",path:"folder/a.knote"}]);
    expect(moved["p::folder/a.knote"].content?.pages).toBe(content.pages);
    expect(moved["p::folder/a.knote"].content?.id).toBe("p::folder/a.knote");
    expect(applyHandwrittenFileChanges(moved,[{oldId:"p::folder/a.knote",newId:null}])).toEqual({});
  });
});
