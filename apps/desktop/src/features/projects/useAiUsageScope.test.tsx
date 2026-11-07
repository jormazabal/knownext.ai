import {act,cleanup,renderHook,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
const{getAiUsageSummary}=vi.hoisted(()=>({getAiUsageSummary:vi.fn()}));
vi.mock("../../lib/api/ai",()=>({getAiUsageSummary}));
import {useAiUsageScope} from "./useAiUsageScope";
import type {AiUsageSummaryResponse} from "../../types/domain";
afterEach(()=>{cleanup();vi.resetAllMocks();});
const summary=(projectId:string|null,cost:number):AiUsageSummaryResponse=>({projectId,month:"2026-11",currency:"EUR",estimated:true,totalEstimatedCost:cost,models:[],capabilities:[],generatedAt:"owned"});
it("discards a late scope and never attributes the global total to a project",async()=>{
  let finishA!:(value:unknown)=>void;
  getAiUsageSummary.mockImplementationOnce(()=>new Promise(resolve=>{finishA=resolve;})).mockResolvedValueOnce(summary("owned-b",2));
  const global=summary(null,10),{result}=renderHook(()=>useAiUsageScope(global));
  act(()=>{void result.current.load({month:"2026-11",projectId:"owned-a"});});
  expect(result.current.summary).toBeNull();expect(result.current.loading).toBe(true);
  await act(()=>result.current.load({month:"2026-11",projectId:"owned-b"}));
  expect(result.current.summary?.totalEstimatedCost).toBe(2);
  await act(async()=>finishA(summary("owned-a",7)));
  expect(result.current.query.projectId).toBe("owned-b");expect(result.current.summary?.projectId).toBe("owned-b");expect(global.totalEstimatedCost).toBe(10);
});
it("keeps an unavailable or mismatched scope distinct from an empty confirmed ledger",async()=>{
  getAiUsageSummary.mockResolvedValueOnce(summary(null,10)).mockRejectedValueOnce(new Error("Registro no representable")).mockResolvedValueOnce(summary("owned-a",0));
  const{result}=renderHook(()=>useAiUsageScope(summary(null,10)));
  await act(()=>result.current.load({month:"2026-11",projectId:"owned-a"}));
  expect(result.current.summary).toBeNull();expect(result.current.error).toContain("no confirma");
  await act(()=>result.current.load());expect(result.current.error).toContain("Registro no representable");expect(result.current.summary).toBeNull();
  await act(()=>result.current.load());await waitFor(()=>expect(result.current.summary?.totalEstimatedCost).toBe(0));expect(result.current.error).toBe("");
});
