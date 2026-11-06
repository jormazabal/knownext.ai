type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export async function openExternalUrl(url: string) {
  let parsed: URL;
  try {parsed=new URL(url);} catch {throw new Error("El enlace no es válido.");}
  if(!["https:","http:"].includes(parsed.protocol)||parsed.username||parsed.password||/[\u0000-\u001f\u007f]/.test(url))throw new Error("Solo se permiten enlaces web sin credenciales.");
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as TauriWindow)) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
