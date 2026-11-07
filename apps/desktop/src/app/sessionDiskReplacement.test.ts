import {expect,it,vi} from "vitest";
import {SessionWriteQueue} from "./sessionWriteQueue";
import {replaceSessionFromDisk} from "./sessionDiskReplacement";

it("orders disk replacement after prior writes, preserves later edits and never applies an uncertain response",async()=>{
  const queue=new SessionWriteQueue(),pending=new Set<string>(),events:string[]=[];
  let current={revision:1};let releaseWrite!:()=>void;let releaseRead!:(value:string)=>void;
  const prior=queue.run("doc",async()=>{events.push("write");await new Promise<void>(done=>{releaseWrite=done;});});
  await Promise.resolve();const apply=vi.fn(),protect=vi.fn();
  const options={id:"doc",queue,pending,current:()=>current,sameRevision:(a:typeof current|undefined,b:typeof current)=>a?.revision===b.revision,
    readAndDiscard:()=>{events.push("read-and-discard");return new Promise<string>(done=>{releaseRead=done;});},apply,protect};
  const task=replaceSessionFromDisk(options);expect(pending.has("doc")).toBe(true);
  expect(await replaceSessionFromDisk(options)).toBe(false);expect(events).toEqual(["write"]);
  releaseWrite();await prior;await Promise.resolve();expect(events).toEqual(["write","read-and-discard"]);
  current={revision:2};releaseRead("prepared disk");await expect(task).rejects.toThrow(/edición más reciente/);
  expect(apply).not.toHaveBeenCalled();expect(protect).toHaveBeenLastCalledWith({revision:2});expect(pending.size).toBe(0);
  await expect(replaceSessionFromDisk({...options,readAndDiscard:async()=>{throw new Error("unknown acknowledgement");}})).rejects.toThrow("unknown acknowledgement");
  expect(apply).not.toHaveBeenCalled();expect(pending.size).toBe(0);
  expect(await replaceSessionFromDisk({...options,readAndDiscard:async()=>"prepared disk"})).toBe(true);
  expect(apply).toHaveBeenCalledWith("prepared disk",{revision:2});expect(pending.size).toBe(0);
});
