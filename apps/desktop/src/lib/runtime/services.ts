import { invoke } from "@tauri-apps/api/core";
import { API_BASE_URL, expectedBackendProfile, initializeApiBaseUrl, setApiBaseUrl, type BackendHealth } from "../api/client";
import { APP_VERSION } from "../appVersion";

export type RuntimeServiceState = "running" | "degraded" | "unavailable";
export type BackendPortMode = "automatic" | "fixed";

export type BackendPortConfig = {
  mode: BackendPortMode;
  port: number;
  autoPortStart: number;
  autoPortEnd: number;
};

export type RuntimeServiceStatus = {
  id: string;
  name: string;
  status: RuntimeServiceState;
  statusLabel: string;
  description: string;
  endpoint: string;
  expectedVersion: string;
  version?: string | null;
  expectedProfile: string;
  profile?: string | null;
  expectedAppDataDir: string;
  appDataDir?: string | null;
  port?: number | null;
  managedBy?: string | null;
  instanceId?: string | null;
  startedAt?: string | null;
  sidecarPath?: string | null;
  lastError?: string | null;
  canRestart: boolean;
  canConfigurePort: boolean;
  portConfig?: BackendPortConfig | null;
};

export type RuntimeServicesStatus = {
  services: RuntimeServiceStatus[];
  checkedAt: string;
};

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

const BROWSER_SERVICE_STATUS_TIMEOUT_MS = 2500;

export async function getRuntimeServiceStatus() {
  if (isTauriRuntime()) {
    const status = await invoke<RuntimeServicesStatus>("get_runtime_service_status");
    const backend = status.services.find((service) => service.id === "backend");
    if (backend?.endpoint) setApiBaseUrl(backend.endpoint.replace(/\/health$/, ""));
    return status;
  }

  return getBrowserRuntimeServiceStatus();
}

export async function restartBackendService() {
  if (isTauriRuntime()) {
    return invoke<RuntimeServicesStatus>("restart_backend_service");
  }

  throw new Error("El reinicio automático del backend solo está disponible en la aplicación de escritorio.");
}

export async function updateBackendPortConfig(config: BackendPortConfig) {
  if (isTauriRuntime()) {
    const status = await invoke<RuntimeServicesStatus>("update_backend_port_config", { config });
    const backend = status.services.find((service) => service.id === "backend");
    if (backend?.endpoint) setApiBaseUrl(backend.endpoint.replace(/\/health$/, ""));
    return status;
  }

  throw new Error("El puerto del backend solo puede cambiarse desde la aplicación de escritorio instalada.");
}

async function getBrowserRuntimeServiceStatus(): Promise<RuntimeServicesStatus> {
  await initializeApiBaseUrl();
  const endpoint = `${API_BASE_URL}/health`;
  const expectedProfile = expectedBackendProfile();
  try {
    const response = await fetchWithTimeout(endpoint, BROWSER_SERVICE_STATUS_TIMEOUT_MS);
    if (!response.ok) throw new Error(`/health devolvió ${response.status} ${response.statusText}`);
    const health = (await response.json()) as BackendHealth;
    const isHealthy = health.status === "ok";
    const isKnownext = health.app === "knownext";
    const versionMatches = health.version === APP_VERSION;
    const profileMatches = health.profile === expectedProfile;
    const isCompatible = isHealthy && isKnownext && versionMatches && profileMatches;
    return {
      checkedAt: new Date().toISOString(),
      services: [
        {
          id: "backend",
          name: "Backend local",
          status: isCompatible ? "running" : "degraded",
          statusLabel: isCompatible ? "Operativo" : "Incompatible",
          description: isCompatible
            ? "La API local responde al chequeo de salud."
            : "Hay una API local respondiendo, pero no coincide con esta versión, perfil o aplicación de KnowNext.ai.",
          endpoint,
          expectedVersion: APP_VERSION,
          version: health.version ?? null,
          expectedProfile,
          profile: health.profile ?? null,
          expectedAppDataDir: health.appDataDir ?? "",
          appDataDir: health.appDataDir ?? null,
          port: health.port ?? null,
          managedBy: health.managedBy ?? null,
          instanceId: health.instanceId ?? null,
          startedAt: health.startedAt ?? null,
          sidecarPath: null,
          lastError: isCompatible
            ? null
            : [
              `expectedVersion=${APP_VERSION}`,
              `actualVersion=${health.version ?? "unknown"}`,
              `expectedProfile=${expectedProfile}`,
              `actualProfile=${health.profile ?? "unknown"}`,
              `app=${health.app ?? "unknown"}`,
            ].join("\n"),
          canRestart: false,
          canConfigurePort: false,
          portConfig: null,
        },
      ],
    };
  } catch (error) {
    return {
      checkedAt: new Date().toISOString(),
      services: [
        {
          id: "backend",
          name: "Backend local",
          status: "unavailable",
          statusLabel: "No disponible",
          description: "La API local no responde al chequeo de salud.",
          endpoint,
          expectedVersion: "desarrollo",
          version: null,
          expectedProfile,
          profile: null,
          expectedAppDataDir: "",
          appDataDir: null,
          port: null,
          managedBy: null,
          instanceId: null,
          startedAt: null,
          sidecarPath: null,
          lastError: describeBrowserHealthError(error),
          canRestart: false,
          canConfigurePort: false,
          portConfig: null,
        },
      ],
    };
  }
}

function describeBrowserHealthError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return `El chequeo /health no respondió en ${BROWSER_SERVICE_STATUS_TIMEOUT_MS} ms.`;
  }
  if (error instanceof Error) return error.message;
  return "No se pudo consultar /health.";
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => window.clearTimeout(timeout));
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as TauriWindow);
}
