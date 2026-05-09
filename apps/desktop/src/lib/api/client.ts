export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8765";
const VITE_USE_BACKEND = import.meta.env.VITE_USE_BACKEND;

export function isBackendEnabled() {
  if (VITE_USE_BACKEND === "true") return true;
  if (VITE_USE_BACKEND === "false") return false;
  return import.meta.env.DEV;
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

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return typeof error.detail === "string" ? error.detail : error.message;
  if (error instanceof DOMException && error.name === "AbortError") {
    return "La API local no respondió a tiempo. Comprueba que el backend esté en ejecución.";
  }
  if (error instanceof TypeError) {
    return "No se pudo conectar con la API local. Comprueba que el backend esté en ejecución.";
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export function mockDelay<T>(value: T, delayMs = 80): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), delayMs));
}
