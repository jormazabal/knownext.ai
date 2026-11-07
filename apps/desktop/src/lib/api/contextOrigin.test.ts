import {beforeEach,expect,it,vi} from "vitest";
import {ApiError,requestJson} from "./client";
import {refreshContextSource} from "./contextOrigin";
import type {AiContextOriginReview,AiContextSource} from "../../types/domain";
vi.mock("./client",async(importOriginal)=>({...await importOriginal<typeof import("./client")>(),requestJson:vi.fn()}));
const source:AiContextSource={id:"p::A.md",projectId:"p",kind:"project_document",name:"A.md",path:"A.md",sizeBytes:12,status:"ready",weight:"light",createdAt:"2026-11-02T08:00:00Z",updatedAt:"2026-11-02T08:00:00Z",sourceOrigin:"file",requiresReview:true};
const review:AiContextOriginReview={source,sourceRevision:"1".repeat(64),fileRevision:"2".repeat(64),locationRevision:"3".repeat(64),status:"changed",canRefresh:true,checkedAt:"2026-11-02T08:30:00Z"};
beforeEach(()=>{vi.mocked(requestJson).mockReset();});
it("observes the exact durable refresh after a lost ack without another post",async()=>{
  let submitted:Record<string,string>={};
  vi.mocked(requestJson).mockImplementation(async(_path,init)=>{if(init?.method==="POST"){submitted=JSON.parse(init.body as string);throw new Error("ack lost");}return {source:{...source,requiresReview:false},previewText:"updated snapshot",metadata:{},originReview:{...review,sourceRevision:"4".repeat(64),publicationReviewed:true,lastRefresh:{format:1,attemptId:submitted.attemptId,previousSourceRevision:submitted.sourceRevision,fileRevision:submitted.fileRevision,locationRevision:submitted.locationRevision}}};});
  const result=await refreshContextSource("p",source.id,review);
  expect(result.previewText).toBe("updated snapshot");expect(requestJson).toHaveBeenCalledTimes(2);
  expect(submitted.attemptId).toMatch(/^attempt-[a-f0-9]{32}$/);expect(requestJson).toHaveBeenLastCalledWith("/api/projects/p/ai/context/sources/p%3A%3AA.md/preview");
});
it("does not confirm matching text with an unrelated receipt or authorize a replay",async()=>{
  vi.mocked(requestJson).mockRejectedValueOnce(new Error("ack lost")).mockResolvedValueOnce({source,previewText:"updated snapshot",metadata:{},originReview:{...review,publicationReviewed:true,lastRefresh:{format:1,attemptId:"attempt-"+"0".repeat(32),previousSourceRevision:review.sourceRevision,fileRevision:review.fileRevision,locationRevision:review.locationRevision}}});
  await expect(refreshContextSource("p",source.id,review)).rejects.toThrow("ack lost");expect(requestJson).toHaveBeenCalledTimes(2);expect(vi.mocked(requestJson).mock.calls.filter(([,init])=>init?.method==="POST")).toHaveLength(1);
});
it("requires a real review before submitting",async()=>{
  await expect(refreshContextSource("p",source.id,{...review,canRefresh:false})).rejects.toThrow(/Revisa primero/);expect(requestJson).not.toHaveBeenCalled();
});
it("skips observation after explicit native non-admission",async()=>{
  const failure=new ApiError(409,"Busy","not started","not-started","project_write_not_started");vi.mocked(requestJson).mockRejectedValue(failure);let observed:unknown;try{await refreshContextSource("p",source.id,review);}catch(error){observed=error;} expect({notStarted:observed instanceof ApiError&&observed.operationOutcome==="not-started",calls:vi.mocked(requestJson).mock.calls.length}).toEqual({notStarted:true,calls:1});
});
