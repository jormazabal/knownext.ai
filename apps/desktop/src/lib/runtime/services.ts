import { invoke } from "@tauri-apps/api/core";
import { expectedRuntimeProfile, requestJson, type RuntimeHealth } from "../api/client";
import { APP_VERSION } from "../appVersion";

export type RuntimeServiceState = "running" | "degraded" | "unavailable";

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
  managedBy?: string | null;
  instanceId?: string | null;
  startedAt?: string | null;
  lastError?: string | null;
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
    return invoke<RuntimeServicesStatus>("get_runtime_service_status");
  }

  return getBrowserRuntimeServiceStatus();
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
          managedBy: health.managedBy ?? null,
          instanceId: health.instanceId ?? null,
          startedAt: health.startedAt ?? null,
          lastError: isCompatible
            ? null
            : [
              `expectedVersion=${APP_VERSION}`,
              `actualVersion=${health.version ?? "unknown"}`,
              `expectedProfile=${expectedProfile}`,
              `actualProfile=${health.profile ?? "unknown"}`,
              `app=${health.app ?? "unknown"}`,
            ].join("\n"),
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
          managedBy: null,
          instanceId: null,
          startedAt: null,
          lastError: describeBrowserHealthError(error),
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
