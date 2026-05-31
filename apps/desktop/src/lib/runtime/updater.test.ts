import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, getUpdaterStatus, installUpdate } from "./updater";

describe("runtime updater", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    Reflect.deleteProperty(window, "KnownextAndroidUpdater");
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0", configurable: true });
  });

  it("enables the private APK updater in Android Tauri", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 Android", configurable: true });
    window.KnownextAndroidUpdater = createAndroidBridge();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => createAndroidManifest(),
    }));

    expect(getUpdaterStatus()).toEqual({ supported: true });
    await expect(checkForUpdate()).resolves.toMatchObject({
      supported: true,
      update: {
        currentVersion: "0.21.0",
        version: "1.0.0",
        platform: "android-private",
        sizeBytes: 1234,
      },
    });
  });

  it("asks Android for install permission before downloading a private APK", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 Android", configurable: true });
    const bridge = createAndroidBridge({ canInstall: false });
    window.KnownextAndroidUpdater = bridge;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => createAndroidManifest(),
    }));

    await checkForUpdate();
    await expect(installUpdate()).rejects.toThrow("permiso");
    expect(bridge.openInstallPermissionSettings).toHaveBeenCalled();
    expect(bridge.downloadAndInstall).not.toHaveBeenCalled();
  });
});

function createAndroidBridge(options: { canInstall?: boolean } = {}) {
  return {
    getPackageInfo: vi.fn(() => JSON.stringify({
      applicationId: "ai.knownext.mobile",
      versionName: "0.21.0",
      versionCode: 21000,
      supportedAbis: "arm64-v8a,x86_64",
    })),
    canRequestPackageInstalls: vi.fn(() => options.canInstall ?? true),
    openInstallPermissionSettings: vi.fn(),
    downloadAndInstall: vi.fn(),
  };
}

function createAndroidManifest() {
  return {
    schemaVersion: 1,
    channel: "private-stable",
    applicationId: "ai.knownext.mobile",
    versionName: "1.0.0",
    versionCode: 1000000,
    publishedAt: "2026-06-01T10:00:00Z",
    artifacts: [
      {
        abi: "arm64-v8a",
        url: "https://github.com/jormazabal/knownext.ai/releases/download/v1.0.0/KnowNext.ai-android-arm64-v1.0.0.apk",
        sha256: "a".repeat(64),
        size: 1234,
      },
    ],
  };
}
