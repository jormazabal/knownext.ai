import { afterEach, expect, it, vi } from "vitest";
import { requestJson } from "./client";
import { isTauriRuntime } from "../runtime/platform";
import { getStorageUsage } from "./storageUsage";

vi.mock("./client", () => ({requestJson: vi.fn()}));
vi.mock("../runtime/platform", () => ({isTauriRuntime: vi.fn()}));
afterEach(() => vi.resetAllMocks());

it("requests only the native read route without arbitrary folder input", async () => {
  vi.mocked(isTauriRuntime).mockReturnValue(true);
  vi.mocked(requestJson).mockResolvedValue({id: "local-storage-usage"});
  await getStorageUsage();
  expect(requestJson).toHaveBeenCalledTimes(1);
  expect(requestJson).toHaveBeenCalledWith("/api/storage/usage");
});

it("does not invent a browser measurement", () => {
  vi.mocked(isTauriRuntime).mockReturnValue(false);
  expect(() => getStorageUsage()).toThrow(/aplicación nativa/);
  expect(requestJson).not.toHaveBeenCalled();
});
