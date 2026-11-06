import {expect,it,vi} from "vitest";
import {protectUpdateInstallation} from "./updateProtection";
it("freezes edits before checkpoint and acquires native authority only after acknowledgement",async()=>{
 const order:string[]=[];const token=await protectUpdateInstallation({freeze:()=>{order.push("freeze");},unfreeze:()=>{order.push("unfreeze");},hasPendingSettings:()=>false,protect:async()=>{order.push("protect latest");return true;},reserve:async()=>{order.push("reserve runtime");return "token";}});
 expect(token).toBe("token");expect(order).toEqual(["freeze","protect latest","reserve runtime"]);
});
it("returns the workspace on uncertain writes, changed settings or active native work",async()=>{
 for(const reason of ["checkpoint","settings","runtime"]){const unfreeze=vi.fn(),reserve=vi.fn(async()=>{if(reason==="runtime")throw Error("audio active");return "token";});let checked=0;
 await expect(protectUpdateInstallation({freeze:vi.fn(),unfreeze,hasPendingSettings:()=>reason==="settings"&&++checked>1,protect:async()=>reason!=="checkpoint",reserve})).rejects.toBeInstanceOf(Error);expect(unfreeze).toHaveBeenCalledOnce();if(reason!=="runtime")expect(reserve).not.toHaveBeenCalled();}
});
