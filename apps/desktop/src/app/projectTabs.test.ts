import {expect,it} from "vitest";
import {resolveProjectTabs} from "./projectTabs";
import type {ProjectTabsConfig} from "../types/domain";

const tabs:ProjectTabsConfig={openTabs:[{id:"p::Kept.md",name:"Kept.md"},{id:"other::Foreign.md",name:"Foreign.md"}],activeDocumentId:"p::Kept.md",openHandwrittenTabs:[{id:"p::Sketch.knote",name:"Sketch.knote"},{id:"other::Foreign.knote",name:"Foreign.knote"}],activeHandwrittenNoteId:"p::Sketch.knote",activeWorkspaceTabId:"p::Sketch.knote"};
it("preserves scoped tabs and the selected ink surface when no complete tree is available",()=>{
 const result=resolveProjectTabs({p:tabs},"p",[],false);
 expect(result.openTabs.map(tab=>tab.id)).toEqual(["p::Kept.md"]);
 expect(result.openHandwrittenTabs?.map(tab=>tab.id)).toEqual(["p::Sketch.knote"]);
 expect(result.activeWorkspaceTabId).toBe("p::Sketch.knote");expect(result.activeHandwrittenNoteId).toBe("p::Sketch.knote");expect(result.activeDocumentId).toBe("");
 expect(tabs.openTabs).toHaveLength(2);
});
it("prunes tabs only when the complete tree confirms they are absent",()=>{
 const result=resolveProjectTabs({p:tabs},"p",[]);
 expect(result.openTabs).toEqual([]);expect(result.openHandwrittenTabs).toEqual([]);expect(result.activeWorkspaceTabId).toBe("");
});
