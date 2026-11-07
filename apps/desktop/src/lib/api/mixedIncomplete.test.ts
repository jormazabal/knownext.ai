import {afterEach,expect,it,vi} from "vitest";
import {requestJson} from "./client";
import {deliverIncompleteMixed} from "./mixedIncompleteDelivery";
import {reviewIncompleteMixed,exportIncompleteMixed} from "./mixedIncomplete";
import type {MixedIncomplete} from "../../types/mixedIncomplete";
vi.mock("./client",()=>({requestJson:vi.fn()}));vi.mock("./mixedIncompleteDelivery",()=>({deliverIncompleteMixed:vi.fn()}));afterEach(()=>vi.resetAllMocks());
const review:MixedIncomplete={schemaVersion:1,projectId:"p",planId:"mixed-"+"1".repeat(32),revision:"a".repeat(64),recordState:"missing",rows:[{key:"000-before.bin",slot:0,side:"before",representation:"plain",status:"readable",bytes:100,sha256:"b".repeat(64)},{key:"000-after.bin.zip",slot:0,side:"after",representation:"compact",status:"unavailable",bytes:null,sha256:null}],ignoredCount:1,limited:true,provenanceVerified:false,canApply:false,canDelete:false,checkedAt:"2026-11-02T12:00:00Z"};
it("exports only a readable reviewed key and never repeats an uncertain delivery",async()=>{
 vi.mocked(requestJson).mockResolvedValue(review);expect(await reviewIncompleteMixed("p",review.planId)).toEqual(review);
 await expect(exportIncompleteMixed(review,"000-after.bin.zip")).rejects.toThrow("Elige");expect(deliverIncompleteMixed).not.toHaveBeenCalled();vi.mocked(deliverIncompleteMixed).mockRejectedValueOnce(Error("Lost delivery"));await expect(exportIncompleteMixed(review,"000-before.bin")).rejects.toThrow("Lost delivery");expect(deliverIncompleteMixed).toHaveBeenCalledOnce();expect(requestJson).toHaveBeenCalledOnce();
});
it("rejects scope/authority widening and never interprets arbitrary filenames",async()=>{
 for(const value of [{...review,projectId:"other"},{...review,canApply:true},{...review,provenanceVerified:true},{...review,rows:[{...review.rows[0],key:"../secret"}]}]){vi.mocked(requestJson).mockResolvedValue(value);await expect(reviewIncompleteMixed("p",review.planId)).rejects.toThrow();}
 vi.mocked(deliverIncompleteMixed).mockResolvedValue({schemaVersion:1,projectId:"p",planId:review.planId,reviewRevision:review.revision,key:"000-before.bin",status:"saved",archiveSha256:"c".repeat(64),byteLength:2000,fileName:"Copia.zip",canApply:false,canDelete:false,requestId:"owned",completedAt:review.checkedAt});expect((await exportIncompleteMixed(review,"000-before.bin")).status).toBe("saved");
});
