import {expect,it,vi} from "vitest";
import {protectForCriticalTransition} from "./criticalStateTransition";
it("does not pause or mutate critical stores while settings or documents lack protection",async()=>{
  const pause=vi.fn(),protectDocuments=vi.fn().mockResolvedValue(false);
  await expect(protectForCriticalTransition({hasPendingSettings:()=>true,protectDocuments,pause})).rejects.toThrow("ajustes pendientes");expect(protectDocuments).not.toHaveBeenCalled();expect(pause).not.toHaveBeenCalled();
  await expect(protectForCriticalTransition({hasPendingSettings:()=>false,protectDocuments,pause})).rejects.toThrow("proteger todos los documentos");expect(pause).not.toHaveBeenCalled();
});
it("rechecks settings changed during protection before pausing the workspace",async()=>{
  const pause=vi.fn(),hasPendingSettings=vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
  await expect(protectForCriticalTransition({hasPendingSettings,protectDocuments:async()=>true,pause})).rejects.toThrow("cambiaron durante la protección");expect(pause).not.toHaveBeenCalled();
  const events:string[]=[];await protectForCriticalTransition({hasPendingSettings:()=>false,protectDocuments:async()=>{events.push("protected");return true;},pause:()=>events.push("paused")});expect(events).toEqual(["protected","paused"]);
});
