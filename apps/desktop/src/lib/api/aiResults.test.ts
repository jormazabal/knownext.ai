import { beforeEach, expect, it, vi } from "vitest";
import { requestJson } from "./client";
import { copyAiResult, listAiResults, preserveAiResult, removeAiResult } from "./aiResults";
import { handleWebDevLocalApiRequest } from "./webDevLocalApi";
import type { AiReviewRecord } from "../../types/aiResults";
vi.mock("./client", () => ({ requestJson: vi.fn().mockResolvedValue({}) }));
const result: AiReviewRecord = { id: "project:result with spaces", projectId: "project", projectName: "QA", receivedAt: "2026-10-31T10:00:00Z", reason: "Changed", answer: "Output", outputs: [{ id: "out", kind: "markdown", name: "Proposal", summary: "Generated", markdown: "Output" }], appliedPaths: [] };
beforeEach(() => { vi.clearAllMocks(); localStorage.removeItem("knownext.web-dev.local-api"); });
it("uses typed output storage and encoded record identities through the API layer", async () => {
  await listAiResults(); await preserveAiResult(result); await copyAiResult(result.id, "out"); await removeAiResult(result.id);
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/ai/results");
  expect(requestJson).toHaveBeenNthCalledWith(2, "/api/ai/results", { method: "POST", body: JSON.stringify(result) });
  expect(requestJson).toHaveBeenNthCalledWith(3, "/api/ai/results/project%3Aresult%20with%20spaces/copy", { method: "POST", body: JSON.stringify({ outputId: "out" }) });
  expect(requestJson).toHaveBeenNthCalledWith(4, "/api/ai/results/project%3Aresult%20with%20spaces", { method: "DELETE" });
});
it("keeps browser development results across adapter reads and explicit removal", async () => {
  expect((await handleWebDevLocalApiRequest("POST", "/api/ai/results", result)).status).toBe(200);
  const loaded = await handleWebDevLocalApiRequest<{ results: AiReviewRecord[] }>("GET", "/api/ai/results", null);
  expect(loaded.body.results).toEqual([result]);
  await handleWebDevLocalApiRequest("DELETE", `/api/ai/results/${encodeURIComponent(result.id)}`, null);
  expect((await handleWebDevLocalApiRequest<{ results: AiReviewRecord[] }>("GET", "/api/ai/results", null)).body.results).toEqual([]);
});
