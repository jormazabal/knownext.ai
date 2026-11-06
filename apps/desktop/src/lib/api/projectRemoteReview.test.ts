import {beforeEach,expect,it,vi} from "vitest";
import {ApiError,requestJson} from "./client";
import {joinIdenticalHistories,keepLocalHistories,reviewGraphJoin} from "./projectRemoteReview";
import type {ProjectRemoteReview,GraphJoinProof} from "../../types/projectRemoteReview";
vi.mock("./client",async importOriginal=>({...await importOriginal<typeof import("./client")>(),requestJson:vi.fn()}));
beforeEach(()=>{vi.mocked(requestJson).mockReset();});
const id=`attempt-${"1".repeat(32)}`;
const review:ProjectRemoteReview={schemaVersion:1,projectId:"p",revision:"a".repeat(64),localCommit:"a".repeat(40),remoteCommit:"b".repeat(40),baseCommit:"c".repeat(40),relation:"diverged",local:[],remote:[],warnings:[],checkedAt:"2026-11-02T09:00:00Z",graphJoin:{canJoin:true,message:"Same tree"}};
const proof:GraphJoinProof={schemaVersion:1,projectId:"p",attemptId:id,reviewedRevision:review.revision,targetCommit:"d".repeat(40),status:"confirmed",canReplay:false,checkedAt:review.checkedAt};
it("observes the same durable join after a lost acknowledgement without resending",async()=>{
 vi.mocked(requestJson).mockRejectedValueOnce(Error("ACK lost")).mockResolvedValueOnce(proof);
 expect(await joinIdenticalHistories("p",review,id)).toEqual(proof);expect(requestJson).toHaveBeenCalledTimes(2);
 expect(requestJson).toHaveBeenNthCalledWith(1,"/api/projects/p/sync/graph-joins",{method:"POST",body:JSON.stringify({revision:review.revision,attemptId:id})});expect(requestJson).toHaveBeenNthCalledWith(2,`/api/projects/p/sync/graph-joins/${id}`);
});
it("refuses a different receipt or an unreviewed request and never retries the POST",async()=>{
 await expect(joinIdenticalHistories("other",review,id)).rejects.toThrow(/revisar/);expect(requestJson).not.toHaveBeenCalled();
 vi.mocked(requestJson).mockRejectedValueOnce(Error("ACK lost")).mockResolvedValueOnce({...proof,attemptId:`attempt-${"2".repeat(32)}`});await expect(joinIdenticalHistories("p",review,id)).rejects.toThrow(/recibo/);expect(requestJson).toHaveBeenCalledTimes(2);
});
it("skips observation after explicit non-admission and rejects incomplete confirmation",async()=>{
 const failure=new ApiError(409,"Busy","No admission","not-started");vi.mocked(requestJson).mockRejectedValueOnce(failure);await expect(joinIdenticalHistories("p",review,id)).rejects.toBe(failure);expect(requestJson).toHaveBeenCalledTimes(1);
 vi.mocked(requestJson).mockResolvedValueOnce({...proof,targetCommit:undefined});await expect(reviewGraphJoin("p",id)).rejects.toThrow(/recibo/);
});
it("binds the local choice and explicit acknowledgement to the same durable receipt",async()=>{
 const selected={...review,graphJoin:{canJoin:false,canKeepLocal:true,message:"Distinct trees"}};
 await expect(keepLocalHistories("p",selected,id,false)).rejects.toThrow(/Confirma/);expect(requestJson).not.toHaveBeenCalled();
 vi.mocked(requestJson).mockRejectedValueOnce(Error("ACK lost")).mockResolvedValueOnce({...proof,resolution:"keep-local"});expect((await keepLocalHistories("p",selected,id,true)).resolution).toBe("keep-local");expect(requestJson).toHaveBeenNthCalledWith(1,"/api/projects/p/sync/graph-joins",{method:"POST",body:JSON.stringify({revision:review.revision,attemptId:id,resolution:"keep-local",acknowledgeRemoteHistoryOnly:true})});expect(requestJson).toHaveBeenCalledTimes(2);
 vi.mocked(requestJson).mockReset();vi.mocked(requestJson).mockResolvedValueOnce(proof).mockResolvedValueOnce(proof);await expect(keepLocalHistories("p",selected,id,true)).rejects.toThrow(/confirma/);expect(requestJson).toHaveBeenCalledTimes(2);
});
