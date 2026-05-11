import { invoke } from "@tauri-apps/api/core";
import { API_BASE_URL } from "../api/client";

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
  expectedAppDataDir: string;
  appDataDir?: string | null;
  sidecarPath?: string | null;
  lastError?: string | null;
  canRestart: boolean;
};

export type RuntimeServicesStatus = {
  services: RuntimeServiceStatus[];
  checkedAt: string;
};

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export async function getRuntimeServiceStatus() {
  if (isTauriRuntime()) {
    return invoke<RuntimeServicesStatus>("get_runtime_service_status");
  }

  return getBrowserRuntimeServiceStatus();
}

export async function restartBackendService() {
  if (isTauriRuntime()) {
    return invoke<RuntimeServicesStatus>("restart_backend_service");
  }

  throw new Error("El reinicio automático del backend solo está disponible en la aplicación de escritorio.");
}

async function getBrowserRuntimeServiceStatus(): Promise<RuntimeServicesStatus> {
  const endpoint = `${API_BASE_URL}/health`;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`/health devolvió ${response.status} ${response.statusText}`);
    const health = (await response.json()) as { version?: string; appDataDir?: string; status?: string };
    return {
      checkedAt: new Date().toISOString(),
      services: [
        {
          id: "backend",
          name: "Backend local",
          status: health.status === "ok" ? "running" : "degraded",
          statusLabel: health.status === "ok" ? "Operativo" : "Incompatible",
          description: "La API local responde al chequeo de salud.",
          endpoint,
          expectedVersion: health.version ?? "desarrollo",
          version: health.version ?? null,
          expectedAppDataDir: health.appDataDir ?? "",
          appDataDir: health.appDataDir ?? null,
          sidecarPath: null,
          lastError: null,
          canRestart: false,
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
          expectedAppDataDir: "",
          appDataDir: null,
          sidecarPath: null,
          lastError: error instanceof Error ? error.message : "No se pudo consultar /health.",
          canRestart: false,
        },
      ],
    };
  }
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as TauriWindow);
}
