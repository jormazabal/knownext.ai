import { expect,it,vi } from "vitest";
import type { MarkdownEditorController } from "../features/editor/editorTypes";
import { captureProjectEditorSnapshots,captureWorkspaceEditorSnapshots,registerEditorSnapshot } from "./editorSnapshots";
const reader=(read:()=>string)=>({getMarkdownSnapshot:read} as MarkdownEditorController);
it("captures personal notes and document input together without reading an unloaded utility",()=>{
  const readers=new Map([["doc",reader(()=>"Latest document")],["user-notes",reader(()=>"Latest notes")]]);
  expect(captureWorkspaceEditorSnapshots(readers,{doc:{document:{},markdown:"Before"}},{id:"user-notes",loaded:true,markdown:"Before notes"})).toEqual([{documentId:"doc",markdown:"Latest document"},{documentId:"user-notes",markdown:"Latest notes"}]);
  expect(captureWorkspaceEditorSnapshots(new Map([["user-notes",reader(()=>{throw new Error("Must not read unloaded notes");})]]),{},{id:"user-notes",loaded:false,markdown:""})).toEqual([]);
});

it("captures unpublished text only for the project being retired",()=>{
  const old=reader(()=>"Old editor"),current=reader(()=>"Typing not yet published"),other=reader(()=>{throw new Error("Must not read another project");});
  const readers=new Map<string,MarkdownEditorController>();registerEditorSnapshot(readers,"p::Doc.md",old);registerEditorSnapshot(readers,"p::Doc.md",current);registerEditorSnapshot(readers,"other::Doc.md",other);
  registerEditorSnapshot(readers,"p::Doc.md",null,old);
  expect(captureProjectEditorSnapshots("p",readers,{"p::Doc.md":{document:{projectId:"p"},markdown:"Published"},"other::Doc.md":{document:{projectId:"other"},markdown:"Other"}})).toEqual([{documentId:"p::Doc.md",markdown:"Typing not yet published"}]);
  registerEditorSnapshot(readers,"p::Doc.md",null,current);expect(readers.has("p::Doc.md")).toBe(false);
});
it("a disposed editor aborts collection before any snapshot can be applied",()=>{
  const apply=vi.fn();const readers=new Map([["one",reader(()=>"Unpublished")],["two",reader(()=>{throw new Error("Disposed");})]]);
  const sessions={one:{document:{projectId:"p"},markdown:"Before"},two:{document:{projectId:"p"},markdown:"Before"}};
  expect(()=>{for(const snapshot of captureProjectEditorSnapshots("p",readers,sessions))apply(snapshot);}).toThrow("Disposed");expect(apply).not.toHaveBeenCalled();
});
it("does not republish equal text or global notes as edits to a project",()=>{
  expect(captureProjectEditorSnapshots("p",new Map([["one",reader(()=>"Equal")],["user-notes",reader(()=>"Notes")]]),{one:{document:{projectId:"p"},markdown:"Equal"}})).toEqual([]);
});
