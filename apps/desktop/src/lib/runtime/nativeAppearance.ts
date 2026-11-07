import type { ResolvedThemeMode } from "../theme/appearance";

declare global {
  interface Window { KnownextAppearance?: { setTheme(dark: boolean): void } }
}

/** Older hosts and browser previews keep their normal CSS appearance. */
export function applyNativeAppearance(theme: ResolvedThemeMode) {
  if (typeof window === "undefined") return;
  try { window.KnownextAppearance?.setTheme(theme === "dark"); }
  catch { /* A native appearance failure must not interrupt document startup. */ }
}
