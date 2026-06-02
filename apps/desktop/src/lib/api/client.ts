import { invoke } from "@tauri-apps/api/core";
import { APP_VERSION } from "../appVersion";
import { isTauriMobileRuntime, isTauriRuntime } from "../runtime/platform";

export type RuntimeHealth = {
  app?: string;
  schemaVersion?: number;
  status?: string;
  service?: string;
  version?: string;
  profile?: "desktop" | "mobile" | "web-dev" | string;
  host?: string;
  port?: number | null;
  endpoint?: string;
  instanceId?: string;
  startedAt?: string;
  managedBy?: "tauri" | "manual" | string;
  appDataDir?: string;
};

export let API_BASE_URL = "tauri://local-api";

export function setApiBaseUrl(url: string) {
  API_BASE_URL = url || "tauri://local-api";
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function setPersistentMobileApiBaseUrl(_url: string) {
  API_BASE_URL = "tauri://local-api";
}

export function clearPersistentMobileApiBaseUrl() {
  API_BASE_URL = "tauri://local-api";
}

export function isMobileApiBaseUrlConfigured() {
  return true;
}

export async function initializeApiBaseUrl() {
  API_BASE_URL = "tauri://local-api";
  return API_BASE_URL;
}

export async function getApiWebSocketUrl(_path: string): Promise<string> {
  throw new Error("La transcripción en tiempo real por WebSocket no está disponible en el runtime local-first 2.0.0.");
}

export function isRuntimeApiEnabled() {
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

type LocalApiResponse<T> = {
  status: number;
  body: T;
};

type LocalApiContentResponse = {
  status: number;
  contentType: string;
  filename?: string | null;
  dataBase64: string;
};

type LocalApiFile = {
  fieldName: string;
  name: string;
  mimeType?: string | null;
  dataBase64: string;
};

export async function requestJson<T>(path: string, init?: ApiRequestInit): Promise<T> {
  await initializeApiBaseUrl();
  if (!isTauriRuntime()) {
    throw new ApiError(503, "Runtime unavailable", "KnowNext.ai 2.0.0 requiere el runtime Tauri local.");
  }

  const response = await invoke<LocalApiResponse<T>>("local_api_request", {
    request: {
      method: init?.method ?? "GET",
      path,
      body: parseBody(init?.body),
    },
  });

  if (response.status >= 400) throw apiErrorFromResponse(response.status, response.body);
  return response.body;
}

export async function requestFormData<T>(path: string, formData: FormData, init?: ApiRequestInit): Promise<T> {
  await initializeApiBaseUrl();
  if (!isTauriRuntime()) {
    throw new ApiError(503, "Runtime unavailable", "KnowNext.ai 2.0.0 requiere el runtime Tauri local.");
  }

  const files: LocalApiFile[] = [];
  for (const [fieldName, value] of formData.entries()) {
    if (value instanceof File) {
      files.push({
        fieldName,
        name: value.name,
        mimeType: value.type || null,
        dataBase64: await fileToBase64(value),
      });
    }
  }

  const response = await invoke<LocalApiResponse<T>>("local_api_request", {
    request: {
      method: init?.method ?? "POST",
      path,
      body: parseBody(init?.body),
      files,
    },
  });

  if (response.status >= 400) throw apiErrorFromResponse(response.status, response.body);
  return response.body;
}

export async function requestBinary(path: string, init?: ApiRequestInit): Promise<Blob> {
  await initializeApiBaseUrl();
  if (!isTauriRuntime()) {
    throw new ApiError(503, "Runtime unavailable", "KnowNext.ai 2.0.0 requiere el runtime Tauri local.");
  }

  const response = await invoke<LocalApiContentResponse>("local_api_content", {
    request: {
      method: init?.method ?? "GET",
      path,
      body: parseBody(init?.body),
    },
  });

  if (response.status >= 400) throw new ApiError(response.status, "Local API error");
  return base64ToBlob(response.dataBase64, response.contentType);
}

export async function requestDataUrl(path: string, init?: ApiRequestInit): Promise<string> {
  const blob = await requestBinary(path, init);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function waitForApiReady(_options: { attempts?: number; intervalMs?: number } = {}) {
  const health = await requestJson<RuntimeHealth>("/health");
  validateRuntimeHealth(health);
}

export async function discoverMobileApiBaseUrl(_options: unknown = {}) {
  API_BASE_URL = "tauri://local-api";
  return API_BASE_URL;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return typeof error.detail === "string" ? error.detail : error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function isApiConnectionError(error: unknown) {
  return error instanceof ApiError && error.status === 503;
}

export function expectedRuntimeProfile() {
  if (isTauriMobileRuntime()) return "mobile";
  return isTauriRuntime() ? "desktop" : "web-dev";
}

export function validateRuntimeHealth(health: RuntimeHealth) {
  const expectedProfile = expectedRuntimeProfile();
  const problems: string[] = [];
  if (health.app !== "knownext") problems.push(`app=${health.app ?? "unknown"}`);
  if (health.status !== "ok") problems.push(`status=${health.status ?? "unknown"}`);
  if (health.version !== APP_VERSION) problems.push(`version=${health.version ?? "unknown"}`);
  if (health.profile !== expectedProfile) problems.push(`profile=${health.profile ?? "unknown"}`);
  if (problems.length > 0) {
    throw new ApiError(
      409,
      "Runtime incompatible",
      `Runtime local incompatible. Esperado version=${APP_VERSION}, profile=${expectedProfile}; detectado ${problems.join(", ")}.`,
    );
  }
}

function parseBody(body: BodyInit | null | undefined) {
  if (!body) return null;
  if (typeof body === "string") return JSON.parse(body);
  return null;
}

function apiErrorFromResponse(status: number, body: unknown) {
  const detail = typeof body === "object" && body && "detail" in body ? (body as { detail?: unknown }).detail : body;
  return new ApiError(status, "Local API error", detail);
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBlob(base64: string, contentType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: contentType });
}
