import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";

export type WindowResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

type PersistedWindowState = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const WINDOW_STATE_STORAGE_KEY = "knownext.windowState.v1";
const MIN_RESTORED_WIDTH = 720;
const MIN_RESTORED_HEIGHT = 520;

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

export async function initializeWindowStatePersistence() {
  const appWindow = getTauriWindow();
  if (!appWindow) return false;

  let restoreInProgress = true;
  let saveTimer: ReturnType<typeof window.setTimeout> | null = null;

  const readStoredState = (): PersistedWindowState | null => {
    try {
      const rawState = window.localStorage.getItem(WINDOW_STATE_STORAGE_KEY);
      if (!rawState) return null;
      const state = JSON.parse(rawState) as Partial<PersistedWindowState>;
      const { x, y, width, height } = state;
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width === undefined ||
        height === undefined ||
        width < MIN_RESTORED_WIDTH ||
        height < MIN_RESTORED_HEIGHT ||
        x === undefined ||
        y === undefined
      ) {
        return null;
      }

      return {
        x,
        y,
        width,
        height,
      };
    } catch {
      return null;
    }
  };

  const writeCurrentState = async () => {
    try {
      if (await appWindow.isMaximized()) return;
      const [position, size] = await Promise.all([appWindow.outerPosition(), appWindow.outerSize()]);
      window.localStorage.setItem(WINDOW_STATE_STORAGE_KEY, JSON.stringify({
        x: Math.round(position.x),
        y: Math.round(position.y),
        width: Math.round(size.width),
        height: Math.round(size.height),
      }));
    } catch {
      // Window persistence is a convenience feature; failures should not affect app startup.
    }
  };

  const scheduleSave = () => {
    if (restoreInProgress) return;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void writeCurrentState();
    }, 250);
  };

  try {
    const storedState = readStoredState();
    if (storedState) {
      await appWindow.setSize(new PhysicalSize(storedState.width, storedState.height));
      await appWindow.setPosition(new PhysicalPosition(storedState.x, storedState.y));
    }

    await Promise.all([
      appWindow.onResized(scheduleSave),
      appWindow.onMoved(scheduleSave),
    ]);
    restoreInProgress = false;
    void writeCurrentState();
    return true;
  } catch {
    restoreInProgress = false;
    return false;
  }
}
