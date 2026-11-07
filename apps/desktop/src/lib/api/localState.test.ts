import { expect, it, vi } from "vitest";
import { requestJson } from "./client";
import { getLocalStateInventory, resetReviewedLocalState } from "./localState";
import type { LocalStateEntry } from "../../types/localState";
vi.mock("./client",()=>({requestJson:vi.fn()}));
it("passes reviewed fingerprint through Rust without exposing original content", async () => {
  await getLocalStateInventory();expect(requestJson).toHaveBeenLastCalledWith("/api/recovery/state");
  await resetReviewedLocalState({id:"config",fingerprint:"a".repeat(64)} as LocalStateEntry);
  expect(requestJson).toHaveBeenLastCalledWith("/api/recovery/state/config/reset",{method:"POST",body:JSON.stringify({fingerprint:"a".repeat(64)})});
});
