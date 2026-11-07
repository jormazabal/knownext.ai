import {beforeEach,expect,it,vi} from "vitest";
import {ApiError,requestJson} from "./client";
import {publishHistoricalCopy,reviewHistoricalCopySource} from "./historyCopies";
import type {HistoricalCopyReview,HistoricalCopyProof} from "../../types/historyCopies";
vi.mock("./client",async importOriginal=>({...await importOriginal<typeof import("./client")>(),requestJson:vi.fn()}));
beforeEach(()=>{vi.mocked(requestJson).mockReset();});
const attempt=`attempt-${"1".repeat(32)}`;
const review:HistoricalCopyReview={schemaVersion:1,projectId:"p",source:{revision:"a".repeat(64),side:"remote",path:"Remote.pdf"},sourceRevision:"b".repeat(64),sourceCommit:"c".repeat(40),blob:"d".repeat(40),sha256:"e".repeat(64),sizeBytes:128,defaultName:"Remote (histórico).pdf",canCopy:true,previewText:null,previewTruncated:false,checkedAt:"2026-11-02T10:00:00Z",message:"Original preserved"};
const proof:HistoricalCopyProof={schemaVersion:1,projectId:"p",attemptId:attempt,sourceRevision:review.sourceRevision,sha256:review.sha256,sizeBytes:128,name:review.defaultName,documentId:`p::${review.defaultName}`,status:"confirmed",canReplay:false,treeAvailable:true,tree:[],checkedAt:review.checkedAt};
it("observes a historical copy after a lost acknowledgement without posting again",async()=>{
 vi.mocked(requestJson).mockRejectedValueOnce(Error("ACK lost")).mockResolvedValueOnce(proof);expect(await publishHistoricalCopy("p",review,review.defaultName,attempt)).toEqual(proof);expect(requestJson).toHaveBeenCalledTimes(2);expect(requestJson).toHaveBeenNthCalledWith(2,`/api/projects/p/sync/history-copies/${attempt}`);expect(JSON.parse(vi.mocked(requestJson).mock.calls[0][1]!.body as string)).toEqual({source:review.source,sourceRevision:review.sourceRevision,attemptId:attempt,name:review.defaultName});
});
it("requires a compatible reviewed source and the exact copy receipt",async()=>{
 vi.mocked(requestJson).mockResolvedValueOnce({...review,projectId:"other"});await expect(reviewHistoricalCopySource("p",review.source)).rejects.toThrow(/fuente/);
 vi.mocked(requestJson).mockReset();await expect(publishHistoricalCopy("p",{...review,canCopy:false},review.defaultName,attempt)).rejects.toThrow(/Revisa/);expect(requestJson).not.toHaveBeenCalled();
 vi.mocked(requestJson).mockRejectedValueOnce(Error("ACK lost")).mockResolvedValueOnce({...proof,sha256:"f".repeat(64),message:"No se confirma esta copia"});await expect(publishHistoricalCopy("p",review,review.defaultName,attempt)).rejects.toThrow(/confirma/);expect(requestJson).toHaveBeenCalledTimes(2);
});
it("does not consult a receipt after explicit native non-admission",async()=>{
 const failure=new ApiError(409,"Busy","No admission","not-started");vi.mocked(requestJson).mockRejectedValueOnce(failure);await expect(publishHistoricalCopy("p",review,review.defaultName,attempt)).rejects.toBe(failure);expect(requestJson).toHaveBeenCalledTimes(1);
});
