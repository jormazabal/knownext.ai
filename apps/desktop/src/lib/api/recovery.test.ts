import { beforeEach, expect, it, vi } from "vitest";
import { requestJson } from "./client";
import { archiveRecoveryCopy, getRecoveryInventory, previewRecoveryCopy, recoverAsCopy } from "./recovery";
import type { RecoveryCopy } from "../../types/recovery";
vi.mock("./client",()=>({requestJson:vi.fn()}));
beforeEach(()=>vi.mocked(requestJson).mockReset());
it("keeps recovery identity, origin and reviewed fingerprint in the native contracts",async()=>{
  const copy={key:"recovery-123",fingerprint:"a".repeat(64),source:"archive"} as RecoveryCopy;
  await getRecoveryInventory();expect(requestJson).toHaveBeenLastCalledWith("/api/recovery/drafts");
  await getRecoveryInventory(true);expect(requestJson).toHaveBeenLastCalledWith("/api/recovery/archives");
  await previewRecoveryCopy(copy);expect(requestJson).toHaveBeenLastCalledWith("/api/recovery/drafts/recovery-123/preview",{method:"POST",body:JSON.stringify({fingerprint:copy.fingerprint,source:"archive"})});
  const payload={fingerprint:copy.fingerprint!,source:"archive" as const,projectId:"p",name:"Recovered.md"};
  await recoverAsCopy(copy,payload);expect(requestJson).toHaveBeenLastCalledWith("/api/recovery/drafts/recovery-123/copy",{method:"POST",body:JSON.stringify(payload)});
  await archiveRecoveryCopy({...copy,source:"active"});expect(requestJson).toHaveBeenLastCalledWith("/api/recovery/drafts/recovery-123/archive",{method:"POST",body:JSON.stringify({fingerprint:copy.fingerprint,source:"active"})});
});
