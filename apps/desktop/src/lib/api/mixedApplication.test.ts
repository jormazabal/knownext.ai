import {afterEach,expect,it,vi} from "vitest";
import {requestJson} from "./client";
import {getMixedApplication,mutateMixedApplication,closeMixedApplication} from "./mixedApplication";
import type {MixedApplication} from "../../types/mixedApplication";
vi.mock("./client",()=>({ApiError:class extends Error{},requestJson:vi.fn()}));afterEach(()=>vi.resetAllMocks());
const plan=`mixed-${"1".repeat(32)}`;
const preview:MixedApplication={schemaVersion:1,projectId:"p",planId:plan,phase:"preview",revision:"a".repeat(64),planRevision:"b".repeat(64),rows:[{path:"A.md",action:"replace",state:"before",beforeBytes:8,afterBytes:9}],unchangedCount:1,canStart:true,canContinue:false,checkedAt:"2026-11-02T12:00:00Z"};
const pending:MixedApplication={...preview,phase:"partial",revision:"c".repeat(64),rows:[{...preview.rows[0],state:"after"}],canStart:undefined,canContinue:true,canAbandon:true,appliedCount:1,pendingCount:0,scopeMatches:true,copiesPreserved:true,canReplay:false};
it("observes once after an uncertain application and never resends the POST",async()=>{vi.mocked(requestJson).mockRejectedValueOnce(Error("Lost acknowledgement")).mockResolvedValueOnce(pending);const result=await mutateMixedApplication("p",plan,preview);expect(result).toEqual({review:pending,observed:true});expect(requestJson).toHaveBeenCalledTimes(2);expect(requestJson).toHaveBeenNthCalledWith(1,expect.stringMatching(/application$/),{method:"POST",body:JSON.stringify({revision:preview.revision,acknowledge:true})});expect(requestJson).toHaveBeenNthCalledWith(2,expect.stringMatching(/application$/));});
it("rejects mismatched identities, impossible progress and unsafe continuation",async()=>{for(const value of [{...pending,projectId:"other"},{...pending,appliedCount:0},{...pending,scopeMatches:false},{...pending,rows:[{...pending.rows[0],path:"../outside.md"}]}]){vi.mocked(requestJson).mockResolvedValue(value);await expect(getMixedApplication("p",plan)).rejects.toThrow();}});
it("closes only a reviewed preparation and observes a lost closure acknowledgement without replay",async()=>{const closed={...pending,phase:"abandoned",canContinue:false,canAbandon:false};vi.mocked(requestJson).mockRejectedValueOnce(Error("Lost closure")).mockResolvedValueOnce(closed);expect((await closeMixedApplication("p",plan,pending,"abandon")).observed).toBe(true);expect(requestJson).toHaveBeenCalledTimes(2);});

it("reads retired identities without advertising local recovery or execution",async()=>{
 const retired={schemaVersion:1,projectId:"p",planId:"mixed-"+"1".repeat(32),revision:"e".repeat(64),phase:"retired",canContinue:false,canRelease:false,canAbandon:false,canReplay:false,copiesPreserved:false,rows:[],checkedAt:"2026-11-02T12:00:00Z",message:"Recibos conservados"};
 vi.mocked(requestJson).mockResolvedValue(retired);expect((await getMixedApplication("p",retired.planId)).phase).toBe("retired");
 vi.mocked(requestJson).mockResolvedValue({...retired,canContinue:true});await expect(getMixedApplication("p",retired.planId)).rejects.toThrow();
});
