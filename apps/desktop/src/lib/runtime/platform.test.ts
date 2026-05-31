import { afterEach, describe, expect, it, vi } from "vitest";
import { isMobileDeviceRuntime, isPhoneAppShell, isTauriMobileRuntime, isTauriRuntime } from "./platform";

describe("runtime platform detection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0", configurable: true });
    Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
  });

  it("does not classify a narrow desktop window as a mobile device", () => {
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 Windows NT", configurable: true });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });

    expect(isMobileDeviceRuntime()).toBe(false);
    expect(isPhoneAppShell()).toBe(false);
  });

  it("detects Android Tauri as a mobile runtime", () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 Android", configurable: true });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });

    expect(isTauriRuntime()).toBe(true);
    expect(isMobileDeviceRuntime()).toBe(true);
    expect(isTauriMobileRuntime()).toBe(true);
    expect(isPhoneAppShell()).toBe(true);
  });
});
