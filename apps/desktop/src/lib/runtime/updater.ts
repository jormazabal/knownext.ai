import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { isMobileDeviceRuntime, isTauriRuntime } from "./platform";

const DEFAULT_ANDROID_UPDATE_MANIFEST_URL =
  "https://github.com/jormazabal/knownext.ai/releases/latest/download/android-latest.json";

const androidUpdateManifestUrl =
  (import.meta.env.VITE_ANDROID_UPDATE_MANIFEST_URL as string | undefined)?.trim() ||
  DEFAULT_ANDROID_UPDATE_MANIFEST_URL;

export type AvailableUpdate = {
  currentVersion: string;
  version: string;
  date?: string;
  notes?: string;
  platform?: "desktop" | "android-private";
  sizeBytes?: number;
  mandatory?: boolean;
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

type AndroidUpdaterBridge = {
  getPackageInfo: () => string;
  canRequestPackageInstalls: () => boolean;
  openInstallPermissionSettings: () => void;
  downloadAndInstall: (requestJson: string) => string;
};

type AndroidPackageInfo = {
  applicationId: string;
  versionName: string;
  versionCode: number;
  supportedAbis: string[];
};

type AndroidUpdateArtifact = {
  abi: string;
  url: string;
  sha256: string;
  size: number;
  fileName?: string;
};

type AndroidUpdateManifest = {
  schemaVersion: number;
  channel: string;
  applicationId: string;
  versionName: string;
  versionCode: number;
  minSupportedVersionCode?: number;
  publishedAt?: string;
  mandatory?: boolean;
  notes?: string;
  notesUrl?: string;
  artifacts: AndroidUpdateArtifact[];
};

type PendingAndroidUpdate = {
  manifest: AndroidUpdateManifest;
  artifact: AndroidUpdateArtifact;
  packageInfo: AndroidPackageInfo;
};

type AndroidUpdaterEvent = CustomEvent<{
  requestId: string;
  event: "download-started" | "download-progress" | "installing" | "installer-opened" | "permission-required" | "error";
  data?: {
    downloadedBytes?: number;
    contentLength?: number | null;
    percent?: number | null;
    message?: string;
  };
}>;

declare global {
  interface Window {
    KnownextAndroidUpdater?: AndroidUpdaterBridge;
  }
}

let pendingDesktopUpdate: Update | null = null;
let pendingAndroidUpdate: PendingAndroidUpdate | null = null;

export function getUpdaterStatus(): UpdaterStatus {
  if (typeof window === "undefined") {
    return { supported: false, reason: "El actualizador solo está disponible dentro de Tauri." };
  }

  if (!isTauriRuntime()) {
    return { supported: false, reason: "El actualizador no está disponible en el navegador de desarrollo." };
  }

  if (isMobileDeviceRuntime()) {
    return getAndroidUpdaterBridge()
      ? { supported: true }
      : { supported: false, reason: "El actualizador Android solo está disponible dentro de la APK nativa." };
  }

  return { supported: true };
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const status = getUpdaterStatus();
  if (!status.supported) return { supported: false, update: null };

  if (isMobileDeviceRuntime()) {
    return checkForAndroidUpdate();
  }

  const { check } = await import("@tauri-apps/plugin-updater");
  pendingDesktopUpdate = await check({ timeout: 10000 });

  return {
    supported: true,
    update: pendingDesktopUpdate ? toAvailableUpdate(pendingDesktopUpdate) : null,
  };
}

export async function installUpdate(onProgress?: (progress: UpdateDownloadProgress) => void) {
  if (pendingAndroidUpdate) {
    await installAndroidUpdate(pendingAndroidUpdate, onProgress);
    pendingAndroidUpdate = null;
    return;
  }

  if (!pendingDesktopUpdate) {
    throw new Error("No hay ninguna actualización preparada para instalar.");
  }

  let downloadedBytes = 0;
  let contentLength: number | undefined;
  await pendingDesktopUpdate.downloadAndInstall((event) => {
    if (event.event === "Started") contentLength = event.data.contentLength;
    const progress = mapDownloadProgress(event, downloadedBytes, contentLength);
    downloadedBytes = progress.downloadedBytes;
    onProgress?.(progress);
  });

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

async function checkForAndroidUpdate(): Promise<UpdateCheckResult> {
  const bridge = requireAndroidUpdaterBridge();
  const packageInfo = readAndroidPackageInfo(bridge);
  const manifest = await fetchAndroidManifest();
  validateAndroidManifest(manifest, packageInfo);
  const artifact = selectAndroidArtifact(manifest, packageInfo);

  if (manifest.versionCode <= packageInfo.versionCode) {
    pendingAndroidUpdate = null;
    return { supported: true, update: null };
  }

  pendingAndroidUpdate = { manifest, artifact, packageInfo };
  return {
    supported: true,
    update: {
      platform: "android-private",
      currentVersion: packageInfo.versionName,
      version: manifest.versionName,
      date: manifest.publishedAt,
      notes: manifest.notes ?? manifest.notesUrl,
      sizeBytes: artifact.size,
      mandatory: manifest.mandatory,
    },
  };
}

async function fetchAndroidManifest(): Promise<AndroidUpdateManifest> {
  const response = await fetch(androidUpdateManifestUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`No se pudo leer el manifiesto Android (${response.status}).`);
  }
  return parseAndroidManifest(await response.json());
}

function parseAndroidManifest(value: unknown): AndroidUpdateManifest {
  if (!value || typeof value !== "object") throw new Error("El manifiesto Android no es JSON válido.");
  const manifest = value as Partial<AndroidUpdateManifest>;
  if (manifest.schemaVersion !== 1) throw new Error("El manifiesto Android usa una versión de esquema no soportada.");
  if (!manifest.applicationId || !manifest.versionName || typeof manifest.versionCode !== "number") {
    throw new Error("El manifiesto Android no declara aplicación y versión.");
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    throw new Error("El manifiesto Android no incluye APKs instalables.");
  }
  return {
    schemaVersion: 1,
    channel: manifest.channel ?? "private-stable",
    applicationId: manifest.applicationId,
    versionName: manifest.versionName,
    versionCode: manifest.versionCode,
    minSupportedVersionCode: manifest.minSupportedVersionCode,
    publishedAt: manifest.publishedAt,
    mandatory: Boolean(manifest.mandatory),
    notes: manifest.notes,
    notesUrl: manifest.notesUrl,
    artifacts: manifest.artifacts.map(parseAndroidArtifact),
  };
}

function parseAndroidArtifact(value: unknown): AndroidUpdateArtifact {
  const artifact = value as Partial<AndroidUpdateArtifact>;
  if (!artifact?.abi || !artifact.url || !artifact.sha256 || typeof artifact.size !== "number") {
    throw new Error("El manifiesto Android contiene un APK incompleto.");
  }
  if (!/^https:\/\//i.test(artifact.url)) {
    throw new Error("Las actualizaciones Android privadas deben descargarse por HTTPS.");
  }
  return {
    abi: artifact.abi,
    url: artifact.url,
    sha256: artifact.sha256,
    size: artifact.size,
    fileName: artifact.fileName,
  };
}

function validateAndroidManifest(manifest: AndroidUpdateManifest, packageInfo: AndroidPackageInfo) {
  if (manifest.applicationId !== packageInfo.applicationId) {
    throw new Error("El manifiesto Android no corresponde con esta aplicación.");
  }
  if (manifest.minSupportedVersionCode && packageInfo.versionCode < manifest.minSupportedVersionCode) {
    throw new Error("Esta instalación es demasiado antigua para actualizarse automáticamente. Instala manualmente la última APK.");
  }
}

function selectAndroidArtifact(manifest: AndroidUpdateManifest, packageInfo: AndroidPackageInfo): AndroidUpdateArtifact {
  const supported = new Set(packageInfo.supportedAbis);
  const exact = manifest.artifacts.find((artifact) => supported.has(artifact.abi));
  const universal = manifest.artifacts.find((artifact) => artifact.abi === "universal");
  const artifact = exact ?? universal;
  if (!artifact) {
    throw new Error(`No hay APK compatible con este dispositivo (${packageInfo.supportedAbis.join(", ")}).`);
  }
  return artifact;
}

function readAndroidPackageInfo(bridge: AndroidUpdaterBridge): AndroidPackageInfo {
  const raw = JSON.parse(bridge.getPackageInfo()) as {
    applicationId?: string;
    versionName?: string;
    versionCode?: number;
    supportedAbis?: string;
  };
  if (!raw.applicationId || !raw.versionName || typeof raw.versionCode !== "number") {
    throw new Error("No se pudo leer la versión Android instalada.");
  }
  return {
    applicationId: raw.applicationId,
    versionName: raw.versionName,
    versionCode: raw.versionCode,
    supportedAbis: raw.supportedAbis?.split(",").filter(Boolean) ?? ["universal"],
  };
}

async function installAndroidUpdate(update: PendingAndroidUpdate, onProgress?: (progress: UpdateDownloadProgress) => void) {
  const bridge = requireAndroidUpdaterBridge();
  if (!bridge.canRequestPackageInstalls()) {
    bridge.openInstallPermissionSettings();
    throw new Error("Android necesita permiso para instalar actualizaciones desde KnowNext.ai. Actívalo y vuelve a pulsar Actualizar.");
  }

  const requestId = `android-update-${Date.now()}`;
  const payload = {
    requestId,
    applicationId: update.manifest.applicationId,
    versionCode: update.manifest.versionCode,
    url: update.artifact.url,
    sha256: update.artifact.sha256,
    fileName: update.artifact.fileName ?? `KnowNext.ai-android-${update.artifact.abi}-v${update.manifest.versionName}.apk`,
  };

  await new Promise<void>((resolve, reject) => {
    const onEvent = (event: Event) => {
      const detail = (event as AndroidUpdaterEvent).detail;
      if (!detail || detail.requestId !== requestId) return;
      if (detail.event === "download-progress") {
        onProgress?.({
          downloadedBytes: detail.data?.downloadedBytes ?? 0,
          contentLength: detail.data?.contentLength ?? undefined,
          percent: detail.data?.percent ?? undefined,
        });
        return;
      }
      if (detail.event === "installing") {
        onProgress?.({
          downloadedBytes: update.artifact.size,
          contentLength: update.artifact.size,
          percent: 100,
        });
        return;
      }
      if (detail.event === "permission-required") {
        cleanup();
        bridge.openInstallPermissionSettings();
        reject(new Error(detail.data?.message ?? "Android requiere permiso para instalar la APK."));
        return;
      }
      if (detail.event === "installer-opened") {
        cleanup();
        resolve();
        return;
      }
      if (detail.event === "error") {
        cleanup();
        reject(new Error(detail.data?.message ?? "No se pudo instalar la actualización Android."));
      }
    };
    const cleanup = () => window.removeEventListener("knownext-android-updater", onEvent);
    window.addEventListener("knownext-android-updater", onEvent);
    bridge.downloadAndInstall(JSON.stringify(payload));
  });
}

function getAndroidUpdaterBridge(): AndroidUpdaterBridge | null {
  return typeof window !== "undefined" ? window.KnownextAndroidUpdater ?? null : null;
}

function requireAndroidUpdaterBridge(): AndroidUpdaterBridge {
  const bridge = getAndroidUpdaterBridge();
  if (!bridge) throw new Error("El actualizador Android no está disponible en este runtime.");
  return bridge;
}

function toAvailableUpdate(update: Update): AvailableUpdate {
  return {
    platform: "desktop",
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
