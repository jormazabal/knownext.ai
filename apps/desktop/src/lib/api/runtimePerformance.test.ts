import {afterEach,expect,it,vi} from "vitest";
import {requestJson} from "./client";
import {isTauriRuntime} from "../runtime/platform";
import {getRuntimePerformance,parseRuntimePerformance} from "./runtimePerformance";
vi.mock("./client",()=>({requestJson:vi.fn()}));vi.mock("../runtime/platform",()=>({isTauriRuntime:vi.fn(()=>true)}));
afterEach(()=>{vi.clearAllMocks();vi.mocked(isTauriRuntime).mockReturnValue(true);});
const row={operationClass:"documents",count:2,errorCount:1,totalDurationUs:300,maxDurationUs:200,p95RecentDurationUs:200,recentSamples:2};
const snapshot={schemaVersion:1,available:true,scope:"local-api-requests",clock:"monotonic-wall-clock",persistent:false,readOnly:true,startsProvider:false,includesStartup:false,sampleLimitPerClass:128,maximumClasses:11,observedRequests:2,errorCount:1,classes:[row]};
it("reads native-only timings without substituting browser measurements",async()=>{vi.mocked(isTauriRuntime).mockReturnValue(false);expect(await getRuntimePerformance()).toBeNull();expect(requestJson).not.toHaveBeenCalled();});
it("distinguishes an older runtime without performance from measured zero",async()=>{vi.mocked(requestJson).mockResolvedValue({schemaVersion:1,events:[]});expect(await getRuntimePerformance()).toBeNull();expect(requestJson).toHaveBeenCalledWith("/api/runtime/diagnostics");});
it("retains only whitelisted metadata for diagnostics consumers",async()=>{vi.mocked(requestJson).mockResolvedValue({performance:{...snapshot,privatePath:"DO_NOT_COPY",classes:[{...row,prompt:"DO_NOT_COPY"}]}});const observed=await getRuntimePerformance();expect(observed?.classes[0].count).toBe(2);expect(JSON.stringify(observed)).not.toContain("DO_NOT_COPY");});
it("accepts a measured empty session without inventing percentile samples",()=>{expect(parseRuntimePerformance({...snapshot,observedRequests:0,errorCount:0,classes:[]}).classes).toEqual([]);});
it("rejects future authority, invalid counters, unknown classes and inconsistent recent samples",()=>{
 for(const value of [{...snapshot,schemaVersion:2},{...snapshot,startsProvider:true},{...snapshot,persistent:true},{...snapshot,includesStartup:true},{...snapshot,observedRequests:3},{...snapshot,classes:[row,row]},{...snapshot,classes:[{...row,operationClass:"private-project-id"}]},{...snapshot,classes:[{...row,recentSamples:1}]},{...snapshot,classes:[{...row,errorCount:3}]},{...snapshot,classes:[{...row,p95RecentDurationUs:201}]},{...snapshot,classes:[{...row,totalDurationUs:199}]},{...snapshot,classes:[{...row,count:Number.MAX_SAFE_INTEGER+1}]}])expect(()=>parseRuntimePerformance(value)).toThrow(/mediciones/);
});
