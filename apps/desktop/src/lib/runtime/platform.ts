type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

const mobileUserAgentPattern = /Android|iPhone|iPad|iPod/i;

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as TauriWindow);
}

export function isMobileDeviceRuntime() {
  return typeof navigator !== "undefined" && mobileUserAgentPattern.test(navigator.userAgent);
}

export function isTauriMobileRuntime() {
  return isTauriRuntime() && isMobileDeviceRuntime();
}

export function isPhoneAppShell() {
  return isMobileDeviceRuntime() && typeof window !== "undefined" && Boolean(window.matchMedia?.("(max-width: 767px)").matches);
}
