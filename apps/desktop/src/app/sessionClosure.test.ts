import {expect,it,vi} from "vitest";
import {SessionWriteQueue} from "./sessionWriteQueue";
import {discardSessionForClose} from "./sessionClosure";
it("ordena el descarte tras la escritura y protege una edición nueva que llega durante el acuse",async()=>{
  const queue=new SessionWriteQueue(),pending=new Set<string>(),events:string[]=[];
  let current:{revision:number}|undefined={revision:1};let releaseWrite!:()=>void;let releaseDiscard!:()=>void;
  const prior=queue.run("doc",async()=>{events.push("write");await new Promise<void>(done=>{releaseWrite=done;});});
  await Promise.resolve();const close=vi.fn(),protect=vi.fn();
  const task=discardSessionForClose({id:"doc",queue,pending,current:()=>current,sameRevision:(a,b)=>a?.revision===b.revision,discard:async()=>{events.push("discard");await new Promise<void>(done=>{releaseDiscard=done;});},close,protect});
  expect(pending.has("doc")).toBe(true);expect(events).toEqual(["write"]);
  releaseWrite();await prior;await Promise.resolve();expect(events).toEqual(["write","discard"]);
  current={revision:2};releaseDiscard();await expect(task).rejects.toThrow(/edición más reciente/);
  expect(close).not.toHaveBeenCalled();expect(protect).toHaveBeenCalledWith({revision:2});expect(pending.size).toBe(0);
});
