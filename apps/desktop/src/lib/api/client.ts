type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export const API_BASE_URL = resolveApiBaseUrl();

function resolveApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as TauriWindow)) {
    return "http://127.0.0.1:8765";
  }
  return "http://127.0.0.1:8766";
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

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
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
  const attempts = options.attempts ?? 20;
  const intervalMs = options.intervalMs ?? 250;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/health`, {}, 2500);
      if (response.ok) return;
      lastError = new ApiError(response.status, response.statusText);
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }

  throw lastError;
}

async function requestJsonOnce<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: controller.signal,
    ...init,
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

