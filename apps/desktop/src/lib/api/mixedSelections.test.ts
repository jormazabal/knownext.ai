import {afterEach,expect,it,vi} from "vitest";
import {ApiError,requestJson} from "./client";
import {reviewMixedSelection,saveMixedSelection} from "./mixedSelections";
import {joinMixedHistories} from "./projectRemoteReview";
import type {MixedCandidates,MixedSelectionReview} from "../../types/mixedSelections";
vi.mock("./client",async()=>{const original=await vi.importActual<typeof import("./client")>("./client");return {...original,requestJson:vi.fn()};});
afterEach(()=>{vi.resetAllMocks();});
const key=`mixed-${"1".repeat(32)}`,entry={mode:"100644" as const,blob:"a".repeat(40)};
const rows=[{path:"A.md",choice:"remote" as const,local:entry,remote:{...entry,blob:"b".repeat(40)},current:{...entry,blob:"b".repeat(40)},documentId:"p::A.md",matches:true},{path:"B.md",choice:"local" as const,local:entry,remote:{...entry,blob:"b".repeat(40)},current:entry,documentId:"p::B.md",matches:true}];
const review:MixedSelectionReview={schemaVersion:1,projectId:"p",revision:"a".repeat(64),id:key,planRevision:"b".repeat(64),rows,localCommit:"a".repeat(40),remoteCommit:"b".repeat(40),relation:"diverged",ready:true,canReplay:false,proof:{planId:key,planRevision:"b".repeat(64),choicesSha256:"c".repeat(64),localChoices:1,remoteChoices:1,combinedChoices:0},additionalPaths:[],additionalCount:0,message:"Verified saved mixture",checkedAt:"2026-11-02T12:00:00Z"};
const candidates:MixedCandidates={...review,rows:rows.map(row=>({...row,choice:""}))};
it("confirms only the exact saved choices after an uncertain acknowledgement with one read and no replay",async()=>{
 vi.mocked(requestJson).mockRejectedValueOnce(Error("Lost acknowledgement")).mockResolvedValueOnce(review);await expect(saveMixedSelection("p",candidates,key,{"A.md":"remote","B.md":"local"})).resolves.toEqual(review);expect(requestJson).toHaveBeenCalledTimes(2);expect(vi.mocked(requestJson).mock.calls[1][0]).toContain(`/mixed-selections/${key}`);
 vi.mocked(requestJson).mockRejectedValueOnce(Error("Lost acknowledgement")).mockResolvedValueOnce({...review,rows:[{...rows[0],choice:"local"},rows[1]]});await expect(saveMixedSelection("p",candidates,key,{"A.md":"remote","B.md":"local"})).rejects.toThrow();expect(requestJson).toHaveBeenCalledTimes(4);
});
it("does not consult after explicit non-admission and rejects a mixed response with inconsistent counts",async()=>{
 vi.mocked(requestJson).mockRejectedValueOnce(new ApiError(409,"Conflict","Project busy","not-started","project_write_not_started"));await expect(saveMixedSelection("p",candidates,key,{"A.md":"remote","B.md":"local"})).rejects.toThrow();expect(requestJson).toHaveBeenCalledOnce();vi.mocked(requestJson).mockResolvedValueOnce({...review,proof:{...review.proof,localChoices:0,remoteChoices:2}});await expect(reviewMixedSelection("p",key)).rejects.toThrow(/no confirma/);
});
it("binds mixed publication to its selection and consults the same attempt without a second POST",async()=>{
 const id=`attempt-${"2".repeat(32)}`;const proof={schemaVersion:1,projectId:"p",attemptId:id,reviewedRevision:review.revision,resolution:"mixed",mixedSelection:review.proof,targetCommit:"d".repeat(40),status:"confirmed",canReplay:false,checkedAt:review.checkedAt};
 await expect(joinMixedHistories("p",review,id,false)).rejects.toThrow(/confirma/);expect(requestJson).not.toHaveBeenCalled();vi.mocked(requestJson).mockRejectedValueOnce(Error("Lost acknowledgement")).mockResolvedValueOnce(proof);await expect(joinMixedHistories("p",review,id,true)).resolves.toEqual(proof);expect(requestJson).toHaveBeenCalledTimes(2);expect(JSON.parse(vi.mocked(requestJson).mock.calls[0][1]?.body as string)).toMatchObject({resolution:"mixed",mixedPlanId:key,mixedPlanRevision:review.planRevision,acknowledgePreparedCombination:true});
});
