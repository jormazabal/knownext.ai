import {afterEach, expect, it, vi} from "vitest";
import {requestJson} from "./client";
import {deliverMixedRetirement} from "./mixedRetirementDelivery";
import {reviewMixedRetirement, retireMixedPayloads} from "./mixedRetirement";
import type {MixedRetirement} from "../../types/mixedRetirement";
vi.mock("./client", () => ({requestJson: vi.fn()}));
vi.mock("./mixedRetirementDelivery", () => ({deliverMixedRetirement: vi.fn()}));
afterEach(() => vi.resetAllMocks());
const review: MixedRetirement = {schemaVersion:1, projectId:"p", planId:"mixed-"+"1".repeat(32), revision:"a".repeat(64), phase:"available", archiveSha256:"b".repeat(64), archiveBytes:2000, remainingCount:4, totalCount:4, remainingBytes:1000, canRetire:true, receiptsPreserved:true, identitiesPreserved:true, projectFilesUnchanged:true, checkedAt:"2026-11-02T12:00:00Z"};
it("observes a lost native acknowledgement once without replaying deletion", async () => {
  const partial = {...review, phase:"partial", remainingCount:1, remainingBytes:100};
  vi.mocked(deliverMixedRetirement).mockRejectedValueOnce(Error("Lost ack"));
  vi.mocked(requestJson).mockResolvedValue(partial);
  expect(await retireMixedPayloads(review)).toEqual({review:partial, observed:true, cancelled:false});
  expect(deliverMixedRetirement).toHaveBeenCalledOnce(); expect(requestJson).toHaveBeenCalledOnce();
});
it("binds finished receipts and preserves future/foreign state", async () => {
  for (const data of [{...review, schemaVersion:2}, {...review, projectId:"other"}, {...review, remainingCount:8}, {...review, identitiesPreserved:false}]) {
    vi.mocked(requestJson).mockResolvedValue(data);
    await expect(reviewMixedRetirement("p", review.planId)).rejects.toThrow();
  }
  const retired: MixedRetirement = {...review, revision:"c".repeat(64), phase:"retired", remainingCount:0, remainingBytes:0, canRetire:false};
  vi.mocked(deliverMixedRetirement).mockResolvedValue({schemaVersion:1, projectId:"p", planId:review.planId, requestRevision:review.revision, status:"completed", review:retired, requestId:"owned", completedAt:review.checkedAt});
  expect((await retireMixedPayloads(review)).review).toEqual(retired);
  await expect(retireMixedPayloads(retired)).rejects.toThrow("Revisa"); expect(deliverMixedRetirement).toHaveBeenCalledOnce();
});
