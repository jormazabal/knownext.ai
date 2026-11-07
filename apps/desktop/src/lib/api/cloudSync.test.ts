import {afterEach, describe, expect, it, vi} from "vitest";
import * as client from "./client";
import {applyCloudSync, cancelCloudSync, getCloudSyncCapabilities, getCloudSyncStatus, reviewCloudSync} from "./cloudSync";

afterEach(() => vi.restoreAllMocks());
describe("cloud sync runtime boundary", () => {
  it("queries capabilities and status without issuing effects", async () => {
    const call=vi.spyOn(client,"requestJson").mockResolvedValue({});
    await getCloudSyncCapabilities(); await getCloudSyncStatus("project id");
    expect(call.mock.calls).toEqual([["/api/cloud-sync/capabilities"],["/api/projects/project%20id/cloud-sync"]]);
  });
  it("sends only provider intent then immutable review identity", async () => {
    const call=vi.spyOn(client,"requestJson").mockResolvedValue({});
    await reviewCloudSync("owned","google-drive");
    await applyCloudSync("owned",{id:"review",revision:"base"});
    await cancelCloudSync("owned",{id:"review",revision:"base"});
    expect(call.mock.calls).toEqual([
      ["/api/projects/owned/cloud-sync/review",{method:"POST",body:JSON.stringify({provider:"google-drive"})}],
      ["/api/projects/owned/cloud-sync/apply",{method:"POST",body:JSON.stringify({id:"review",revision:"base"})}],
      ["/api/projects/owned/cloud-sync/cancel",{method:"POST",body:JSON.stringify({id:"review",revision:"base"})}],
    ]);
  });
});
