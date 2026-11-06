import {expect,it} from "vitest";
import {buildConflictMerge,composeConflictMerge} from "./conflictMerge";

it("keeps all unchanged context, requires every choice and preserves exact whole-version bytes",()=>{
  const common=Array.from({length:30},(_,i)=>`Unchanged ${i}\r\n`).join("");const local=`${common}Local\r\nShared\r\nTail local`,disk=`${common}Disk\nShared\nTail disk`;
  const model=buildConflictMerge(local,disk);expect(model.status).toBe("ready");if(model.status!=="ready")throw new Error("Expected bounded comparison");expect(model.changes).toBe(2);
  expect(composeConflictMerge(model,{})).toBeNull();expect(composeConflictMerge(model,{"change-1":"local"})).toBeNull();expect(composeConflictMerge(model,{"change-1":"local","change-2":"local"})).toBe(local);expect(composeConflictMerge(model,{"change-1":"disk","change-2":"disk"})).toBe(disk);
  expect(composeConflictMerge(model,{"change-1":"local","change-2":"disk"})).toBe(`${common}Local\r\nShared\r\nTail disk`);
  expect(composeConflictMerge(buildConflictMerge("Local","Disk"),{"change-1":"both"})).toBe("Local\nDisk");
});
it("offers explicit whole versions when the diff budget is exceeded, without treating a partial diff as complete",()=>{
  const local=Array.from({length:1500},(_,i)=>`A${i}`).join("\n"),disk=Array.from({length:1500},(_,i)=>`B${i}`).join("\n");const model=buildConflictMerge(local,disk);expect(model.status).toBe("limited");expect(composeConflictMerge(model,{})).toBeNull();expect(composeConflictMerge(model,{},"disk")).toBe(disk);expect(composeConflictMerge(buildConflictMerge("same","same"),{})).toBe("same");
});
