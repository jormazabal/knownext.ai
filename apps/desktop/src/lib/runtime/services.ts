import { invoke } from "@tauri-apps/api/core";
import { expectedRuntimeProfile, requestJson, setApiBaseUrl, type RuntimeHealth } from "../api/client";
import { APP_VERSION } from "../appVersion";

export type RuntimeServiceState = "running" | "degraded" | "unavailable";
export type RuntimePortMode = "local" | "automatic" | "fixed";

export type RuntimePortConfig = {
  mode: RuntimePortMode;
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
  externalExecutablePath?: string | null;
  lastError?: string | null;
  canRestart: boolean;
  canConfigurePort: boolean;
  portConfig?: RuntimePortConfig | null;
};

export type RuntimeServicesStatus = {
  services: RuntimeServiceStatus[];
  checkedAt: string;
};

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

const BROWSER_SERVICE_STATUS_TIMEOUT_MS = 5000;
export async function getRuntimeServiceStatus() {
  if (isTauriRuntime()) {
    const status = await invoke<RuntimeServicesStatus>("get_runtime_service_status");
    const runtime = status.services[0];
    if (runtime?.endpoint) setApiBaseUrl(runtime.endpoint.replace(/\/health$/, ""));
    return status;
  }

  return getBrowserRuntimeServiceStatus();
}

export async function restartLocalRuntime() {
  if (isTauriRuntime()) {
    return invoke<RuntimeServicesStatus>("restart_local_runtime");
  }

  throw new Error("El runtime local Rust no usa procesos externos reiniciables.");
}

export async function updateRuntimePortConfig(config: RuntimePortConfig) {
  if (isTauriRuntime()) {
    const status = await invoke<RuntimeServicesStatus>("update_runtime_port_config", { config });
    const runtime = status.services[0];
    if (runtime?.endpoint) setApiBaseUrl(runtime.endpoint.replace(/\/health$/, ""));
    return status;
  }

  throw new Error("KnowNext.ai 2.0.0 no usa un puerto de API configurable.");
}

async function getBrowserRuntimeServiceStatus(): Promise<RuntimeServicesStatus> {
  const endpoint = "tauri://local-api/health";
  const expectedProfile = expectedRuntimeProfile();
  try {
    const health = await requestJson<RuntimeHealth>("/health");
    const isHealthy = health.status === "ok";
    const isKnownext = health.app === "knownext";
    const versionMatches = health.version === APP_VERSION;
    const profileMatches = health.profile === expectedProfile;
    const isCompatible = isHealthy && isKnownext && versionMatches && profileMatches;
    return {
      checkedAt: new Date().toISOString(),
      services: [
        {
          id: "local-runtime",
          name: "Runtime local Rust",
          status: isCompatible ? "running" : "degraded",
          statusLabel: isCompatible ? "Operativo" : "Incompatible",
          description: isCompatible
            ? "El runtime local Rust responde al chequeo de salud."
            : "El runtime local responde, pero no coincide con esta versión, perfil o aplicación de KnowNext.ai.",
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
          externalExecutablePath: null,
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
          id: "local-runtime",
          name: "Runtime local Rust",
          status: "unavailable",
          statusLabel: "No disponible",
          description: "El runtime local no responde al chequeo de salud.",
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
          externalExecutablePath: null,
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

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as TauriWindow);
}
