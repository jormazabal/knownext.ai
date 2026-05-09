import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export type AvailableUpdate = {
  currentVersion: string;
  version: string;
  date?: string;
  notes?: string;
};

export type UpdaterStatus = {
  supported: boolean;
  reason?: string;
};

export type UpdateCheckResult = {
  supported: boolean;
  update: AvailableUpdate | null;
};

export type UpdateDownloadProgress = {
  downloadedBytes: number;
  contentLength?: number;
  percent?: number;
};

let pendingUpdate: Update | null = null;

export function getUpdaterStatus(): UpdaterStatus {
  if (typeof window === "undefined") {
    return { supported: false, reason: "El actualizador solo está disponible dentro de Tauri." };
  }

  if (!("__TAURI_INTERNALS__" in (window as TauriWindow))) {
    return { supported: false, reason: "El actualizador no está disponible en el navegador de desarrollo." };
  }

  return { supported: true };
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const status = getUpdaterStatus();
  if (!status.supported) return { supported: false, update: null };

  const { check } = await import("@tauri-apps/plugin-updater");
  pendingUpdate = await check({ timeout: 10000 });

  return {
    supported: true,
    update: pendingUpdate ? toAvailableUpdate(pendingUpdate) : null,
  };
}

export async function installUpdate(onProgress?: (progress: UpdateDownloadProgress) => void) {
  if (!pendingUpdate) {
    throw new Error("No hay ninguna actualización preparada para instalar.");
  }

  let downloadedBytes = 0;
  let contentLength: number | undefined;
  await pendingUpdate.downloadAndInstall((event) => {
    if (event.event === "Started") contentLength = event.data.contentLength;
    const progress = mapDownloadProgress(event, downloadedBytes, contentLength);
    downloadedBytes = progress.downloadedBytes;
    onProgress?.(progress);
  });

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

function toAvailableUpdate(update: Update): AvailableUpdate {
  return {
    currentVersion: update.currentVersion,
    version: update.version,
    date: update.date,
    notes: update.body,
  };
}

function mapDownloadProgress(
  event: DownloadEvent,
  currentDownloadedBytes: number,
  contentLength?: number,
): UpdateDownloadProgress {
  if (event.event === "Started") {
    return {
      downloadedBytes: 0,
      contentLength,
      percent: contentLength ? 0 : undefined,
    };
  }

  if (event.event === "Progress") {
    const downloadedBytes = currentDownloadedBytes + event.data.chunkLength;
    return {
      downloadedBytes,
      contentLength,
      percent: contentLength ? Math.min(99, Math.round((downloadedBytes / contentLength) * 100)) : undefined,
    };
  }

  return {
    downloadedBytes: currentDownloadedBytes,
    contentLength,
    percent: 100,
  };
}
