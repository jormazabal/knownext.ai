import { useEffect } from "react";
import { isTauriMobileRuntime, isTauriRuntime } from "./platform";

export async function openRecordingWorkspace(view: "settings" | "recordings") {
  if (!isTauriRuntime()) return;
  const { emit } = await import("@tauri-apps/api/event");
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  await emit("recording-open-workspace", { view });
  const main = await WebviewWindow.getByLabel("main");
  await main?.show();
  await main?.setFocus();
}

/** Window geometry is runtime integration, independent of recording state. */
export function useCompactRecordingWindow(compact: boolean, expanded: boolean) {
  useEffect(() => {
    if (!compact || !isTauriRuntime() || isTauriMobileRuntime()) return;
    let cancelled = false;
    void (async () => {
      const { getCurrentWindow, currentMonitor } = await import("@tauri-apps/api/window");
      const { LogicalSize, PhysicalPosition } = await import("@tauri-apps/api/dpi");
      const window = getCurrentWindow();
      if (window.label !== "recordings") return;
      const monitor = await currentMonitor();
      const size = await window.innerSize();
      const scale = await window.scaleFactor();
      if (cancelled) return;
      const availableHeight = monitor ? monitor.workArea.size.height / scale - 40 : 520;
      await window.setSize(new LogicalSize(Math.max(360, size.width / scale), Math.max(240, Math.min(availableHeight, expanded ? 480 : 260))));
      if (cancelled || !monitor) return;
      const position = await window.outerPosition();
      const outer = await window.outerSize();
      const area = monitor.workArea;
      await window.setPosition(new PhysicalPosition(
        Math.max(area.position.x, Math.min(position.x, area.position.x + area.size.width - outer.width)),
        Math.max(area.position.y, Math.min(position.y, area.position.y + area.size.height - outer.height)),
      ));
    })().catch(() => { /* A denied resize leaves a manually resizable, usable window. */ });
    return () => { cancelled = true; };
  }, [compact, expanded]);
}
