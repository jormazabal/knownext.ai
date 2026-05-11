import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { API_BASE_URL } from "../api/client";

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
    const response = await fetch(`${API_BASE_URL}/api/runtime/select-folder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ currentPath }),
    });

    if (!response.ok) return null;

    const payload = await response.json() as { folderPath?: string | null };
    return payload.folderPath ?? null;
  } catch {
    return null;
  }
}
