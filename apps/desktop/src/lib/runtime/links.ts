type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export async function openExternalUrl(url: string) {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as TauriWindow)) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
