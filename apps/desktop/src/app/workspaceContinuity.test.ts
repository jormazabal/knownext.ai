import {afterEach,expect,it,vi} from "vitest";
import {WorkspaceContinuity,type ContinuityState} from "./workspaceContinuity";
afterEach(()=>vi.useRealTimers());
it("periodically protects published work without ending a gesture or starting observation",async()=>{
  const checkpoint=vi.fn().mockResolvedValue(true),reconcile=vi.fn(),states:ContinuityState[]=[];
  const controller=new WorkspaceContinuity({checkpoint,reconcile,observe:state=>states.push(state)});controller.periodic();
  await vi.waitFor(()=>expect(states[states.length-1]).toMatchObject({phase:"idle",running:false}));
  expect(checkpoint).toHaveBeenCalledWith(false);expect(reconcile).not.toHaveBeenCalled();controller.dispose();
});
it("protects the latest work after repeated resume signals and only then observes state",async()=>{
  const states:ContinuityState[]=[],order:string[]=[];let release!:(value:boolean)=>void;
  const checkpoint=vi.fn().mockImplementationOnce(()=>{order.push("first checkpoint");return new Promise<boolean>(resolve=>{release=resolve;});}).mockImplementation(async()=>{order.push("latest checkpoint");return true;});
  const reconcile=vi.fn(async()=>{order.push("observation");});const controller=new WorkspaceContinuity({checkpoint,reconcile,observe:state=>states.push(state)});
  controller.hidden();await vi.waitFor(()=>expect(checkpoint).toHaveBeenCalledOnce());
  controller.resumed();controller.resumed();controller.resumed();release(true);
  await vi.waitFor(()=>expect(states[states.length-1]).toMatchObject({phase:"idle",running:false}));
  expect(order).toEqual(["first checkpoint","latest checkpoint","observation"]);expect(reconcile).toHaveBeenCalledOnce();expect(states[states.length-1]?.lastProtectedAt).not.toBeNull();controller.dispose();
});
it("never retries a slow unacknowledged write and reports its actual completion",async()=>{
  vi.useFakeTimers();const states:ContinuityState[]=[];let release!:(value:boolean)=>void;
  const checkpoint=vi.fn(()=>new Promise<boolean>(resolve=>{release=resolve;}));const controller=new WorkspaceContinuity({checkpoint,reconcile:async()=>{},observe:state=>states.push(state),slowMs:100});
  controller.resumed();await vi.advanceTimersByTimeAsync(101);
  expect(states[states.length-1]).toMatchObject({phase:"attention",issue:"pending",running:true,lastProtectedAt:null});expect(checkpoint).toHaveBeenCalledOnce();
  release(true);await vi.advanceTimersByTimeAsync(0);expect(states[states.length-1]).toMatchObject({phase:"idle",running:false,issue:null});controller.dispose();
});
it("keeps a failed checkpoint unconfirmed and requires a later retry",async()=>{
  const states:ContinuityState[]=[];const checkpoint=vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true),reconcile=vi.fn().mockResolvedValue(undefined);
  const controller=new WorkspaceContinuity({checkpoint,reconcile,observe:state=>states.push(state)});controller.resumed();await vi.waitFor(()=>expect(states[states.length-1]).toMatchObject({phase:"attention",issue:"checkpoint",running:false,lastProtectedAt:null}));
  expect(reconcile).not.toHaveBeenCalled();expect(checkpoint).toHaveBeenCalledOnce();controller.retry();await vi.waitFor(()=>expect(states[states.length-1]).toMatchObject({phase:"idle",running:false}));expect(reconcile).toHaveBeenCalledOnce();controller.dispose();
});
it("does not publish or begin observation after disposal",async()=>{
  let release!:(value:boolean)=>void;const observe=vi.fn(),reconcile=vi.fn();const controller=new WorkspaceContinuity({checkpoint:()=>new Promise<boolean>(resolve=>{release=resolve;}),reconcile,observe});
  controller.hidden();await vi.waitFor(()=>expect(release).toBeTypeOf("function"));controller.dispose();const count=observe.mock.calls.length;release(true);await Promise.resolve();await Promise.resolve();expect(reconcile).not.toHaveBeenCalled();expect(observe).toHaveBeenCalledTimes(count);
});
