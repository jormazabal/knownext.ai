import {expect,it,vi} from "vitest";
import {protectWorkspaceExit} from "./useWorkspaceExit";
it("exits only after the last document acknowledgement and never turns a protection failure into a forced exit",async()=>{
 for(const protectedWork of [true,false]){const events:string[]=[];const confirm=vi.fn(async()=>{events.push("exit");}),abort=vi.fn(async()=>{events.push("abort");});
 await protectWorkspaceExit({freeze:()=>{events.push("freeze");},unfreeze:()=>{events.push("unfreeze");},hasPendingSettings:()=>false,protect:async()=>{events.push("protect");return protectedWork;},failed:()=>{events.push("notice");}},confirm,abort);
 expect(events).toEqual(protectedWork?["freeze","protect","exit"]:["freeze","protect","abort","unfreeze","notice"]);expect(confirm).toHaveBeenCalledTimes(protectedWork?1:0);}
});
it("keeps the workspace available when settings or native exit acknowledgement fail",async()=>{
 const unfreeze=vi.fn(),failed=vi.fn(),protect=vi.fn(async()=>true),confirm=vi.fn(async()=>{throw Error("audio checkpoint unavailable");}),abort=vi.fn(async()=>{});
 await protectWorkspaceExit({freeze:vi.fn(),unfreeze,failed,hasPendingSettings:()=>true,protect},confirm,abort);expect(protect).not.toHaveBeenCalled();expect(confirm).not.toHaveBeenCalled();
 await protectWorkspaceExit({freeze:vi.fn(),unfreeze,failed,hasPendingSettings:()=>false,protect},confirm,abort);expect(unfreeze).toHaveBeenCalledTimes(2);expect(failed).toHaveBeenCalledTimes(2);
});
