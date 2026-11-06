import { requestJson } from "./client";
import type { LocalStateEntry, LocalStateInventory, LocalStateReset } from "../../types/localState";

export function getLocalStateInventory() {
  return requestJson<LocalStateInventory>("/api/recovery/state");
}
export function resetReviewedLocalState(entry: LocalStateEntry) {
  return requestJson<LocalStateReset>(`/api/recovery/state/${encodeURIComponent(entry.id)}/reset`, {
    method: "POST", body: JSON.stringify({ fingerprint: entry.fingerprint }),
  });
}
