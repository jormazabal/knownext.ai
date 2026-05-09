import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { API_BASE_URL } from "../api/client";

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<{ name: string }>;
};

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
    return (await selectFolderThroughLocalApi(currentPath)) ?? selectBrowserDirectory();
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

async function selectBrowserDirectory() {
  const browserPicker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!browserPicker) return null;

  const directory = await browserPicker.call(window);
  return directory.name;
}
