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
    const webViewFetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    vi.stubGlobal("fetch", webViewFetch);

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
    expect(webViewFetch).not.toHaveBeenCalled();
  });

  it("returns no Android update when the installed version is current", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 Android", configurable: true });
    window.KnownextAndroidUpdater = createAndroidBridge({
      packageInfo: {
        applicationId: "ai.knownext.mobile",
        versionName: "2.4.1",
        versionCode: 2004001,
        supportedAbis: "arm64-v8a,x86_64",
      },
      manifest: createAndroidManifest({ versionName: "2.4.1", versionCode: 2004001 }),
    });

    await expect(checkForUpdate()).resolves.toEqual({
      supported: true,
      update: null,
    });
  });

  it("surfaces native Android manifest fetch errors", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 Android", configurable: true });
    window.KnownextAndroidUpdater = createAndroidBridge({
      fetchResponse: {
        ok: false,
        message: "No se pudo conectar para buscar actualizaciones. Revisa la conexión a Internet.",
      },
    });

    await expect(checkForUpdate()).rejects.toThrow("No se pudo conectar para buscar actualizaciones");
  });

  it("asks Android for install permission before downloading a private APK", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 Android", configurable: true });
    const bridge = createAndroidBridge({ canInstall: false });
    window.KnownextAndroidUpdater = bridge;

    await checkForUpdate();
    await expect(installUpdate()).rejects.toThrow("permiso");
    expect(bridge.openInstallPermissionSettings).toHaveBeenCalled();
    expect(bridge.downloadAndInstall).not.toHaveBeenCalled();
  });
});

function createAndroidBridge(options: {
  canInstall?: boolean;
  packageInfo?: {
    applicationId: string;
    versionName: string;
    versionCode: number;
    supportedAbis: string;
  };
  manifest?: ReturnType<typeof createAndroidManifest>;
  fetchResponse?: {
    ok: boolean;
    body?: string;
    message?: string;
  };
} = {}) {
  const packageInfo = options.packageInfo ?? {
    applicationId: "ai.knownext.mobile",
    versionName: "0.21.0",
    versionCode: 21000,
    supportedAbis: "arm64-v8a,x86_64",
  };
  const fetchResponse = options.fetchResponse ?? {
    ok: true,
    body: JSON.stringify(options.manifest ?? createAndroidManifest()),
  };
  return {
    getPackageInfo: vi.fn(() => JSON.stringify(packageInfo)),
    fetchUpdateManifest: vi.fn(() => JSON.stringify(fetchResponse)),
    canRequestPackageInstalls: vi.fn(() => options.canInstall ?? true),
    openInstallPermissionSettings: vi.fn(),
    downloadAndInstall: vi.fn(),
  };
}

function createAndroidManifest(overrides: Partial<{
  versionName: string;
  versionCode: number;
}> = {}) {
  return {
    schemaVersion: 1,
    channel: "private-stable",
    applicationId: "ai.knownext.mobile",
    versionName: overrides.versionName ?? "1.0.0",
    versionCode: overrides.versionCode ?? 1000000,
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
