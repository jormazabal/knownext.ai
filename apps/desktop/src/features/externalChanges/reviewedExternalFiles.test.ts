import { describe, expect, it } from "vitest";
import { reviewedExternalFiles } from "./reviewedExternalFiles";
import type { ExternalChangeSet, ProjectFileSyncItem, ProjectFileSyncOverview } from "../../types/domain";
const file:ProjectFileSyncItem={id:"file",projectId:"a",path:"Plan.md",name:"Plan.md",kind:"document",localStatus:{state:"ok",label:"Guardado local"},historyStatus:{state:"pending",label:"Pendiente"},githubStatus:{state:"waiting",label:"Esperando"},change:{itemId:"old-path-id",changeType:"modified",risk:"safe",decision:"include"}};
const overview:ProjectFileSyncOverview={projectId:"a",generatedAt:"today",summary:{total:1,attention:1,historyPending:1,githubPending:0,conflicts:0,omitted:0},files:[file]};
const review:ExternalChangeSet={id:"cohort",revision:"fresh-content-review",projectId:"a",title:"Revisión",source:"git",status:"needs-review",detectedAt:"today",requiresReview:true,summary:{total:1,safe:0,review:1,blocked:0,added:0,modified:1,deleted:0,folders:0,documents:1,images:0,attachments:0,omitted:0,totalBytes:4},items:[{id:"fresh-sha-id",path:"Plan.md",name:"Plan.md",kind:"document",changeType:"modified",risk:"safe",decision:"include"}]};
describe("reviewed external cohort",()=>{
 it("takes identities and blocking decisions from the current review, not the older overview",()=>{
  expect(reviewedExternalFiles("a",overview,review)[0].change?.itemId).toBe("fresh-sha-id");
  const blocked={...review,items:[{...review.items[0],risk:"blocked" as const,decision:"omit" as const,reason:"Preparado por otra herramienta"}]};
  const row=reviewedExternalFiles("a",overview,blocked)[0];expect(row.change?.risk).toBe("blocked");expect(row.historyStatus.detail).toBe("Preparado por otra herramienta");expect(file.change?.itemId).toBe("old-path-id");
 });
 it("removes actionable selections without revision, for another project, or for paths outside the cohort",()=>{
  for(const r of [null,{...review,revision:null},{...review,projectId:"b"},{...review,items:[]}])expect(reviewedExternalFiles("a",overview,r)[0].change).toBeNull();
  expect(reviewedExternalFiles("b",overview,null)).toEqual([]);
  expect(reviewedExternalFiles(undefined,null,null)).toEqual([]);
 });
 it("includes reviewed additions and deletions absent from the older file overview exactly once",()=>{
  const r={...review,items:[review.items[0],{...review.items[0],id:"deleted",path:"Quitado.md",name:"Quitado.md",changeType:"deleted" as const}]};
  const rows=reviewedExternalFiles("a",overview,r);expect(rows).toHaveLength(2);expect(rows[1].change?.itemId).toBe("deleted");expect(rows[1].localStatus.label).toBe("Baja guardada");
 });
});
