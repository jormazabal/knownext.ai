import {expect,it,vi} from "vitest";
import {protectNotesSnapshot} from "./notesProtection";
import {SessionWriteQueue} from "./sessionWriteQueue";
import type {UserNotes} from "../types/domain";
it("serializes note writes, preserves a newer edit and skips an obsolete queued snapshot",async()=>{
  let current="A",saved="",finish!:(value:UserNotes)=>void;const calls:string[]=[];
  const write=vi.fn((markdown:string)=>{calls.push(markdown);return new Promise<UserNotes>(resolve=>{finish=resolve;});});
  const options={queue:new SessionWriteQueue(),current:()=>current,saved:()=>saved,write,started:vi.fn(),acknowledge:(value:UserNotes)=>{saved=value.markdown;},failed:vi.fn()};
  const first=protectNotesSnapshot("A",options);await vi.waitFor(()=>expect(calls).toEqual(["A"]));current="B";
  const second=protectNotesSnapshot("B",options),obsolete=protectNotesSnapshot("A",options);finish({markdown:"A",updatedAt:"2026-11-01T00:00:00Z"});
  expect(await first).toBe("superseded");await vi.waitFor(()=>expect(calls).toEqual(["A","B"]));expect(current).toBe("B");
  finish({markdown:"B",updatedAt:"2026-11-01T00:00:01Z"});expect(await second).toBe("protected");expect(await obsolete).toBe("superseded");expect(saved).toBe("B");expect(current).toBe("B");
  expect(await protectNotesSnapshot("B",options)).toBe("protected");expect(write).toHaveBeenCalledTimes(2);
});
it("does not acknowledge mismatched content or a failed native response",async()=>{
  const acknowledge=vi.fn(),failed=vi.fn();const options={queue:new SessionWriteQueue(),current:()=>"B",saved:()=>"A",write:vi.fn().mockResolvedValue({markdown:"A",updatedAt:"now"}),started:vi.fn(),acknowledge,failed};
  expect(await protectNotesSnapshot("B",options)).toBe("failed");expect(acknowledge).not.toHaveBeenCalled();expect(failed).toHaveBeenCalledOnce();
});
