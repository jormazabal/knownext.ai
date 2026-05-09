import { getCurrentWindow } from "@tauri-apps/api/window";

export type WindowResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

function getTauriWindow() {
  if (typeof window === "undefined") return null;
  if (!("__TAURI_INTERNALS__" in (window as TauriWindow))) return null;
  return getCurrentWindow();
}

async function runWindowAction(action: (appWindow: ReturnType<typeof getCurrentWindow>) => Promise<void>) {
  const appWindow = getTauriWindow();
  if (!appWindow) return false;

  try {
    await action(appWindow);
    return true;
  } catch {
    return false;
  }
}

export function minimizeWindow() {
  return runWindowAction((appWindow) => appWindow.minimize());
}

export function toggleMaximizeWindow() {
  return runWindowAction((appWindow) => appWindow.toggleMaximize());
}

export function closeWindow() {
  return runWindowAction((appWindow) => appWindow.close());
}

export function startWindowDrag() {
  return runWindowAction((appWindow) => appWindow.startDragging());
}

export function startWindowResize(direction: WindowResizeDirection) {
  return runWindowAction((appWindow) => appWindow.startResizeDragging(direction));
}
