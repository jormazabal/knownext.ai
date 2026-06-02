import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { requestJson } from "../api/client";

export async function selectProjectFolder(currentPath: string) {
  try {
    const selectedPath = await openDialog({
      directory: true,
      multiple: false,
      title: "Seleccionar carpeta del proyecto",
      defaultPath: currentPath || undefined,
    });

    if (typeof selectedPath === "string") return selectedPath;
    return null;
  } catch {
    return selectFolderThroughLocalApi(currentPath);
  }
}

async function selectFolderThroughLocalApi(currentPath: string) {
  try {
    const payload = await requestJson<{ folderPath?: string | null }>("/api/runtime/select-folder", {
      method: "POST",
      body: JSON.stringify({ currentPath }),
    });
    return payload.folderPath ?? null;
  } catch {
    return null;
  }
}
