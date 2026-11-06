import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { settingsSaveSummary, useSettingsPersistence } from "./useSettingsPersistence";
afterEach(cleanup);
function deferred<T>() {let resolve!:(value:T)=>void, reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

it("orders app and AI writes to their shared store while another store remains available",async()=>{
  const first=deferred<string>(),second=deferred<string>(),calls:string[]=[];
  const {result}=renderHook(useSettingsPersistence);let a!:Promise<boolean>,b!:Promise<boolean>,other!:Promise<boolean>;
  await act(async()=>{a=result.current.save("app","configuration",()=>{calls.push("app");return first.promise;},()=>calls.push("app applied"));await Promise.resolve();});
  await act(async()=>{b=result.current.save("ai","configuration",()=>{calls.push("ai");return second.promise;},()=>calls.push("ai applied"));other=result.current.save("export","export-template",async()=>{calls.push("export");return "ok";},()=>{});await other;});
  expect(calls).toEqual(["app","export"]);
  await act(async()=>{first.resolve("saved");await a;});expect(calls).toEqual(["app","export","app applied","ai"]);
  await act(async()=>{second.resolve("saved");await b;});expect(result.current.states.ai?.phase).toBe("saved");
});

it("coalesces superseded queued settings and never applies an older in-flight acknowledgement",async()=>{
  const first=deferred<number>(),writeA=vi.fn(()=>first.promise),writeB=vi.fn(async()=>2),writeC=vi.fn(async()=>3),apply=vi.fn();
  const {result}=renderHook(useSettingsPersistence);let a!:Promise<boolean>,b!:Promise<boolean>,c!:Promise<boolean>;
  await act(async()=>{a=result.current.save("ai","configuration",writeA,apply);await Promise.resolve();});
  act(()=>{b=result.current.save("ai","configuration",writeB,apply);c=result.current.save("ai","configuration",writeC,apply);});
  await act(async()=>{first.resolve(1);await Promise.all([a,b,c]);});
  expect(writeA).toHaveBeenCalledOnce();expect(writeB).not.toHaveBeenCalled();expect(writeC).toHaveBeenCalledOnce();expect(apply).toHaveBeenCalledOnce();expect(apply).toHaveBeenCalledWith(3);
});

it("keeps a failed group visible when other groups save and retries only on an explicit request",async()=>{
  const write=vi.fn().mockRejectedValueOnce("Permiso denegado").mockResolvedValueOnce("saved"),apply=vi.fn();
  const {result}=renderHook(useSettingsPersistence);
  await act(async()=>{await result.current.save("ai","configuration",write,apply);});
  await act(async()=>{await result.current.save("app","configuration",async()=>"app saved",()=>{});});
  expect(write).toHaveBeenCalledOnce();expect(result.current.states.ai).toEqual({phase:"error",message:"Permiso denegado"});expect(settingsSaveSummary(result.current.states).state).toBe("error");expect(apply).not.toHaveBeenCalled();
  await act(async()=>{await Promise.all([result.current.retry("ai"),result.current.retry("ai")]);});
  expect(write).toHaveBeenCalledTimes(2);expect(apply).toHaveBeenCalledOnce();expect(apply).toHaveBeenCalledWith("saved");expect(settingsSaveSummary(result.current.states).state).toBe("saved");
});

it("marks a newer debounced value pending before an earlier write can report saved",async()=>{
  const first=deferred<number>(),apply=vi.fn();const {result}=renderHook(useSettingsPersistence);let task!:Promise<boolean>;
  await act(async()=>{task=result.current.save("app","configuration",()=>first.promise,apply);await Promise.resolve();});
  act(()=>result.current.stage("app"));await act(async()=>{first.resolve(1);await task;});
  expect(result.current.getRevision("app")).toBeGreaterThan(1);
  expect(apply).not.toHaveBeenCalled();expect(result.current.states.app?.phase).toBe("pending");
  await act(async()=>{await result.current.save("app","configuration",async()=>2,apply);});expect(apply).toHaveBeenCalledOnce();expect(apply).toHaveBeenCalledWith(2);
});

it("does not repeat a confirmed write when only its UI acknowledgement fails",async()=>{
  const write=vi.fn(async()=>"persisted");const {result}=renderHook(useSettingsPersistence);
  await act(async()=>{await result.current.save("export","export-template",write,()=>{throw new Error("view failed");});});
  expect(result.current.states.export?.phase).toBe("saved");expect(result.current.states.export?.message).toContain("guardados");
  await act(async()=>{expect(await result.current.retry("export")).toBe(false);});expect(write).toHaveBeenCalledOnce();
});
