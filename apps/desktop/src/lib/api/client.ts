import { APP_VERSION } from "../appVersion";
import { isTauriMobileRuntime, isTauriRuntime } from "../runtime/platform";

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

const MOBILE_UNCONFIGURED_API_BASE_URL = "https://knownext-mobile-api-not-configured.invalid";
const MOBILE_API_BASE_URL_STORAGE_KEY = "knownext.mobileApiBaseUrl";

export let API_BASE_URL = resolveApiBaseUrl();
let apiBaseUrlInitialized = false;

function resolveApiBaseUrl() {
  if (isTauriMobileRuntime() && storedMobileApiBaseUrl()) return storedMobileApiBaseUrl();
  if (configuredApiBaseUrl()) return configuredApiBaseUrl();
  if (isTauriMobileRuntime()) return MOBILE_UNCONFIGURED_API_BASE_URL;
  if (isTauriRuntime()) {
    return "http://127.0.0.1:8765";
  }
  return "http://127.0.0.1:8766";
}

export function setApiBaseUrl(url: string) {
  const normalized = normalizeApiBaseUrl(url);
  if (normalized) {
    API_BASE_URL = normalized;
    apiBaseUrlInitialized = true;
  }
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function setPersistentMobileApiBaseUrl(url: string) {
  const normalized = normalizeApiBaseUrl(url);
  if (!normalized) throw new Error("Introduce la URL del backend móvil.");
  localStorage.setItem(MOBILE_API_BASE_URL_STORAGE_KEY, normalized);
  setApiBaseUrl(normalized);
}

export function clearPersistentMobileApiBaseUrl() {
  localStorage.removeItem(MOBILE_API_BASE_URL_STORAGE_KEY);
  API_BASE_URL = configuredApiBaseUrl() || MOBILE_UNCONFIGURED_API_BASE_URL;
  apiBaseUrlInitialized = true;
}

export function isMobileApiBaseUrlConfigured() {
  return Boolean(storedMobileApiBaseUrl() || configuredApiBaseUrl());
}

export async function initializeApiBaseUrl() {
  if (apiBaseUrlInitialized) return API_BASE_URL;
  if (isTauriMobileRuntime() && storedMobileApiBaseUrl()) {
    setApiBaseUrl(storedMobileApiBaseUrl());
    return API_BASE_URL;
  }
  if (configuredApiBaseUrl()) {
    apiBaseUrlInitialized = true;
    return API_BASE_URL;
  }
  if (isTauriRuntime() && !isTauriMobileRuntime()) {
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

export async function getApiWebSocketUrl(path: string) {
  await initializeApiBaseUrl();
  const baseUrl = new URL(API_BASE_URL);
  baseUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, "")}${path}`;
  baseUrl.search = "";
  return baseUrl.toString();
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
const BROWSER_BACKEND_DISCOVERY_PORTS = Array.from({ length: 34 }, (_, index) => 8766 + index);
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

export async function requestFormData<T>(path: string, formData: FormData, init?: ApiRequestInit): Promise<T> {
  await initializeApiBaseUrl();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), init?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  const { timeoutMs: _timeoutMs, headers: _headers, body: _body, ...requestInit } = init ?? {};

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    method: requestInit.method ?? "POST",
    body: formData,
    signal: controller.signal,
  }).finally(() => window.clearTimeout(timeout));

  if (!response.ok) {
    let detail: unknown;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // Some errors do not return a JSON body.
    }
    throw new ApiError(response.status, response.statusText, detail);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
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
  return health.app === "knownext" && health.status === "ok" && health.profile === expectedBackendProfile() && health.version === APP_VERSION;
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
    if (isTauriMobileRuntime()) {
      return `La API de KnowNext.ai para Android no respondió a tiempo (${API_BASE_URL}). Comprueba el endpoint del backend móvil.`;
    }
    return "La API local no respondió a tiempo. Comprueba que el backend esté en ejecución.";
  }
  if (error instanceof TypeError) {
    if (isTauriMobileRuntime()) {
      return `No se pudo conectar con la API de KnowNext.ai para Android (${API_BASE_URL}). Revisa el endpoint del backend móvil y que el teléfono esté en la misma red.`;
    }
    return `No se pudo conectar con la API local (${API_BASE_URL}). Comprueba que el backend correspondiente esté en ejecución.`;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export function isApiConnectionError(error: unknown) {
  return error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError");
}

export function expectedBackendProfile() {
  if (configuredBackendProfile()) return configuredBackendProfile();
  if (isTauriMobileRuntime()) return "mobile";
  return isTauriRuntime() ? "desktop" : "web-dev";
}

export function validateBackendHealth(health: BackendHealth) {
  const expectedProfile = expectedBackendProfile();
  const problems: string[] = [];
  if (health.app !== "knownext") problems.push(`app=${health.app ?? "unknown"}`);
  if (health.status !== "ok") problems.push(`status=${health.status ?? "unknown"}`);
  if (health.version !== APP_VERSION) problems.push(`version=${health.version ?? "unknown"}`);
  if (health.profile !== expectedProfile) problems.push(`profile=${health.profile ?? "unknown"}`);
  if (problems.length > 0) {
    throw new ApiError(
      409,
      "Backend incompatible",
      `Backend local incompatible. Esperado version=${APP_VERSION}, profile=${expectedProfile}; detectado ${problems.join(", ")}.`,
    );
  }
}

function configuredApiBaseUrl() {
  const value = import.meta.env.VITE_API_BASE_URL?.trim();
  return value ? normalizeApiBaseUrl(value) : "";
}

function configuredBackendProfile() {
  return import.meta.env.VITE_EXPECTED_BACKEND_PROFILE?.trim() || "";
}

function storedMobileApiBaseUrl() {
  if (typeof localStorage === "undefined") return "";
  return normalizeApiBaseUrl(localStorage.getItem(MOBILE_API_BASE_URL_STORAGE_KEY) ?? "");
}

function normalizeApiBaseUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("El endpoint debe ser una URL completa, por ejemplo http://192.168.1.20:8775.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("El endpoint debe empezar por http:// o https://.");
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

