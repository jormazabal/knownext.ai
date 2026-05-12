type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export type BackendHealth = {
  app?: string;
  schemaVersion?: number;
  status?: string;
  service?: string;
  version?: string;
  profile?: "desktop" | "web-dev" | string;
  host?: string;
  port?: number;
  endpoint?: string;
  instanceId?: string;
  startedAt?: string;
  managedBy?: "tauri" | "manual" | string;
  appDataDir?: string;
};

export let API_BASE_URL = resolveApiBaseUrl();
let apiBaseUrlInitialized = false;

function resolveApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as TauriWindow)) {
    return "http://127.0.0.1:8765";
  }
  return "http://127.0.0.1:8766";
}

export function setApiBaseUrl(url: string) {
  const normalized = url.replace(/\/+$/, "");
  if (normalized) {
    API_BASE_URL = normalized;
    apiBaseUrlInitialized = true;
  }
}

export async function initializeApiBaseUrl() {
  if (apiBaseUrlInitialized) return API_BASE_URL;
  if (isTauriRuntime()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      setApiBaseUrl(await invoke<string>("get_runtime_api_base_url"));
    } catch {
      apiBaseUrlInitialized = true;
    }
    return API_BASE_URL;
  }
  apiBaseUrlInitialized = true;
  return API_BASE_URL;
}

export function isBackendEnabled() {
  return true;
}

export class ApiError extends Error {
  status: number;
  detail?: unknown;

  constructor(status: number, statusText: string, detail?: unknown) {
    const detailMessage = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "";
    super(detailMessage ? `${status} ${statusText}: ${detailMessage}` : `${status} ${statusText}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 7000;
const BROWSER_BACKEND_DISCOVERY_PORTS = [8766, 8767, 8768, 8769, 8770];
const BROWSER_BACKEND_DISCOVERY_TIMEOUT_MS = 450;

export async function requestJson<T>(path: string, init?: ApiRequestInit): Promise<T> {
  await initializeApiBaseUrl();
  const method = (init?.method ?? "GET").toUpperCase();
  const attempts = method === "GET" ? 6 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestJsonOnce<T>(path, init);
    } catch (error) {
      lastError = error;
      if (!isApiConnectionError(error) || attempt === attempts - 1) break;
      await delay(250 * (attempt + 1));
    }
  }

  throw lastError;
}

export async function waitForApiReady(options: { attempts?: number; intervalMs?: number } = {}) {
  await initializeApiBaseUrl();
  if (!isTauriRuntime()) {
    await discoverCompatibleBrowserBackend();
  }
  const attempts = options.attempts ?? 20;
  const intervalMs = options.intervalMs ?? 250;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/health`, {}, 2500);
      if (response.ok) {
        const health = (await response.json()) as BackendHealth;
        validateBackendHealth(health);
        return;
      }
      lastError = new ApiError(response.status, response.statusText);
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }

  throw lastError;
}

async function discoverCompatibleBrowserBackend() {
  const candidates = buildBrowserBackendCandidates();
  for (const baseUrl of candidates) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/health`, {}, BROWSER_BACKEND_DISCOVERY_TIMEOUT_MS);
      if (!response.ok) continue;
      const health = (await response.json()) as BackendHealth;
      if (isCompatibleBackendHealth(health)) {
        setApiBaseUrl(baseUrl);
        return;
      }
    } catch {
      // Try the next development port.
    }
  }
}

function buildBrowserBackendCandidates() {
  const current = API_BASE_URL.replace(/\/+$/, "");
  const candidates = new Set<string>([current]);
  for (const port of BROWSER_BACKEND_DISCOVERY_PORTS) {
    candidates.add(`http://127.0.0.1:${port}`);
  }
  return Array.from(candidates);
}

function isCompatibleBackendHealth(health: BackendHealth) {
  return health.app === "knownext" && health.status === "ok" && health.profile === expectedBackendProfile();
}

async function requestJsonOnce<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), init?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  const { timeoutMs: _timeoutMs, ...requestInit } = init ?? {};

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(requestInit.headers ?? {}),
    },
    signal: controller.signal,
    ...requestInit,
  }).finally(() => window.clearTimeout(timeout));

  if (!response.ok) {
    let detail: unknown;

    try {
      const body = await response.json();
      if (body?.detail) {
        detail = body.detail;
      }
    } catch {
      // Some errors do not return a JSON body.
    }

    throw new ApiError(response.status, response.statusText, detail);
  }

  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    ...init,
    signal: controller.signal,
  }).finally(() => window.clearTimeout(timeout));
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return typeof error.detail === "string" ? error.detail : error.message;
  if (error instanceof DOMException && error.name === "AbortError") {
    return "La API local no respondió a tiempo. Comprueba que el backend esté en ejecución.";
  }
  if (error instanceof TypeError) {
    return `No se pudo conectar con la API local (${API_BASE_URL}). Comprueba que el backend correspondiente esté en ejecución.`;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export function isApiConnectionError(error: unknown) {
  return error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError");
}

export function expectedBackendProfile() {
  return isTauriRuntime() ? "desktop" : "web-dev";
}

export function validateBackendHealth(health: BackendHealth) {
  const expectedProfile = expectedBackendProfile();
  const problems: string[] = [];
  if (health.app !== "knownext") problems.push(`app=${health.app ?? "unknown"}`);
  if (health.status !== "ok") problems.push(`status=${health.status ?? "unknown"}`);
  if (health.profile !== expectedProfile) problems.push(`profile=${health.profile ?? "unknown"}`);
  if (problems.length > 0) {
    throw new ApiError(
      409,
      "Backend incompatible",
      `Backend local incompatible. Esperado profile=${expectedProfile}; detectado ${problems.join(", ")}.`,
    );
  }
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as TauriWindow);
}

