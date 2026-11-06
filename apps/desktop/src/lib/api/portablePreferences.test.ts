import {beforeEach,expect,it,vi} from "vitest";
import type {PortablePreferencesReview} from "../../types/portablePreferences";
const request=vi.hoisted(()=>vi.fn());vi.mock("./client",()=>({requestJson:request}));
import {reviewPortablePreferences,applyPortablePreferences} from "./portablePreferences";
const value:PortablePreferencesReview={schemaVersion:1,projectId:"project-owned",revision:"a".repeat(64),checkedAt:"2026-11-04T12:00:00Z",source:"Archivo KnowNext/Preferencias.json",imported:{appearance:{language:"eu"},layout:{}},observed:{appearance:{language:"es"},layout:{}},canApply:true,dataOnly:true,changesAi:false};
beforeEach(()=>vi.resetAllMocks());
it("rejects another project and unexpected execution fields before exposing a review",async()=>{
 request.mockResolvedValueOnce({...value,projectId:"project-other"});await expect(reviewPortablePreferences(value.projectId)).rejects.toThrow("ámbito");request.mockResolvedValueOnce({...value,imported:{...value.imported,ai:{provider:"unexpected"}}});await expect(reviewPortablePreferences(value.projectId)).rejects.toThrow("Proyección");
});
it("sends only the reviewed identity and selected groups and never retries a failed write",async()=>{
 request.mockRejectedValue(new Error("Acuse perdido"));await expect(applyPortablePreferences(value,true,false)).rejects.toThrow("Acuse perdido");expect(request).toHaveBeenCalledTimes(1);expect(request).toHaveBeenCalledWith("/api/projects/project-owned/portable-preferences",{method:"POST",body:JSON.stringify({revision:value.revision,appearance:true,layout:false,acknowledge:true})});
});
it("rejects a contradictory acknowledgement instead of reporting applied preferences",async()=>{
 request.mockResolvedValue({schemaVersion:1,projectId:value.projectId,requestRevision:"b".repeat(64),status:"applied",checkedAt:value.checkedAt,changesAi:false,review:value});await expect(applyPortablePreferences(value,true,false)).rejects.toThrow("confirmación");expect(request).toHaveBeenCalledTimes(1);
});
it("accepts a scoped unchanged result with the observed current preferences",async()=>{
 const result={schemaVersion:1 as const,projectId:value.projectId,requestRevision:value.revision,status:"unchanged" as const,checkedAt:value.checkedAt,changesAi:false as const,review:value};request.mockResolvedValue(result);expect(await applyPortablePreferences(value,true,false)).toEqual(result);expect(request).toHaveBeenCalledTimes(1);
});
