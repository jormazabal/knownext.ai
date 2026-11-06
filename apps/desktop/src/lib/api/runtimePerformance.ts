import {requestJson} from "./client";
import {isTauriRuntime} from "../runtime/platform";
import {runtimeOperationClasses,type RuntimePerformance,type RuntimePerformanceClass} from "../../types/runtimePerformance";
const count=(value:unknown):value is number=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;
function valid(value:unknown):asserts value{if(!value)throw Error("Las mediciones no confirman su alcance. Consulta otra vez; no se sustituyen por valores cero.");}
export function parseRuntimePerformance(value:unknown):RuntimePerformance{
 const v=value as RuntimePerformance;
 valid(v&&v.schemaVersion===1&&v.available===true&&v.scope==="local-api-requests"&&v.clock==="monotonic-wall-clock"&&v.persistent===false&&v.readOnly===true&&v.startsProvider===false&&v.includesStartup===false&&v.sampleLimitPerClass===128&&v.maximumClasses===11&&count(v.observedRequests)&&count(v.errorCount)&&v.errorCount<=v.observedRequests&&Array.isArray(v.classes)&&v.classes.length<=11);
 const seen=new Set<string>();let observed=0,errors=0;
 const classes=v.classes.map(row=>{
  valid(row&&runtimeOperationClasses.includes(row.operationClass)&&!seen.has(row.operationClass)&&[row.count,row.errorCount,row.totalDurationUs,row.maxDurationUs,row.p95RecentDurationUs,row.recentSamples].every(count)&&row.count>0&&row.errorCount<=row.count&&row.recentSamples===Math.min(row.count,128)&&row.p95RecentDurationUs<=row.maxDurationUs&&row.maxDurationUs<=row.totalDurationUs);
  seen.add(row.operationClass);observed+=row.count;errors+=row.errorCount;
  return {operationClass:row.operationClass,count:row.count,errorCount:row.errorCount,totalDurationUs:row.totalDurationUs,maxDurationUs:row.maxDurationUs,p95RecentDurationUs:row.p95RecentDurationUs,recentSamples:row.recentSamples} satisfies RuntimePerformanceClass;
 });
 valid(count(observed)&&observed===v.observedRequests&&errors===v.errorCount);
 // A support consumer cannot accidentally copy unknown fields from a future runtime.
 return{schemaVersion:1,available:true,scope:"local-api-requests",clock:"monotonic-wall-clock",persistent:false,readOnly:true,startsProvider:false,includesStartup:false,sampleLimitPerClass:128,maximumClasses:11,observedRequests:observed,errorCount:errors,classes};
}
export async function getRuntimePerformance():Promise<RuntimePerformance|null>{
 if(!isTauriRuntime())return null;
 const report=await requestJson<{performance?:unknown}>("/api/runtime/diagnostics");
 if(report?.performance===undefined)return null;
 return parseRuntimePerformance(report.performance);
}
