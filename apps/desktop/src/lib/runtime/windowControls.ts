import { availableMonitors, getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";

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

type WindowWorkArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const WINDOW_STATE_STORAGE_KEY = "knownext.windowState.v1";
const MIN_RESTORED_WIDTH = 360;
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

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function getIntersectionArea(windowState: PersistedWindowState, workArea: WindowWorkArea) {
  const left = Math.max(windowState.x, workArea.x);
  const top = Math.max(windowState.y, workArea.y);
  const right = Math.min(windowState.x + windowState.width, workArea.x + workArea.width);
  const bottom = Math.min(windowState.y + windowState.height, workArea.y + workArea.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function getCenterDistance(windowState: PersistedWindowState, workArea: WindowWorkArea) {
  const windowCenterX = windowState.x + windowState.width / 2;
  const windowCenterY = windowState.y + windowState.height / 2;
  const workAreaCenterX = workArea.x + workArea.width / 2;
  const workAreaCenterY = workArea.y + workArea.height / 2;
  return Math.hypot(windowCenterX - workAreaCenterX, windowCenterY - workAreaCenterY);
}

function getBestWorkArea(windowState: PersistedWindowState, workAreas: WindowWorkArea[]) {
  if (workAreas.length === 0) return null;

  return workAreas.reduce((best, workArea) => {
    const bestIntersectionArea = getIntersectionArea(windowState, best);
    const intersectionArea = getIntersectionArea(windowState, workArea);
    if (intersectionArea !== bestIntersectionArea) return intersectionArea > bestIntersectionArea ? workArea : best;

    const bestDistance = getCenterDistance(windowState, best);
    const distance = getCenterDistance(windowState, workArea);
    return distance < bestDistance ? workArea : best;
  });
}

export function resolveVisibleWindowState(windowState: PersistedWindowState, workAreas: WindowWorkArea[]): PersistedWindowState {
  const workArea = getBestWorkArea(windowState, workAreas);
  if (!workArea) return windowState;

  const width = Math.min(Math.max(Math.round(windowState.width), MIN_RESTORED_WIDTH), Math.round(workArea.width));
  const height = Math.min(Math.max(Math.round(windowState.height), MIN_RESTORED_HEIGHT), Math.round(workArea.height));
  const x = clamp(Math.round(windowState.x), Math.round(workArea.x), Math.round(workArea.x + workArea.width - width));
  const y = clamp(Math.round(windowState.y), Math.round(workArea.y), Math.round(workArea.y + workArea.height - height));

  return { x, y, width, height };
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

  const readAvailableWorkAreas = async (): Promise<WindowWorkArea[]> => {
    const monitors = await availableMonitors();
    return monitors.map((monitor) => ({
      x: monitor.workArea.position.x,
      y: monitor.workArea.position.y,
      width: monitor.workArea.size.width,
      height: monitor.workArea.size.height,
    }));
  };

  const readCurrentWindowState = async (): Promise<PersistedWindowState> => {
    const [position, size] = await Promise.all([appWindow.outerPosition(), appWindow.outerSize()]);
    return {
      x: Math.round(position.x),
      y: Math.round(position.y),
      width: Math.round(size.width),
      height: Math.round(size.height),
    };
  };

  const applyWindowState = async (windowState: PersistedWindowState) => {
    await appWindow.setSize(new PhysicalSize(windowState.width, windowState.height));
    await appWindow.setPosition(new PhysicalPosition(windowState.x, windowState.y));
  };

  try {
    const workAreas = await readAvailableWorkAreas();
    const storedState = readStoredState();
    const restoredState = resolveVisibleWindowState(storedState ?? (await readCurrentWindowState()), workAreas);
    await applyWindowState(restoredState);

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
