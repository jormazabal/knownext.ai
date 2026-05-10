import { invoke } from "@tauri-apps/api/core";
import { API_BASE_URL } from "../api/client";

export type TraceLogStatus = {
  enabled: boolean;
  folderPath: string;
  filePath: string;
};

type TraceLogPayload = {
  level?: "error" | "info";
  source: string;
  message: string;
  detail?: string | null;
};

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export async function getTraceLogStatus() {
  return requestRuntimeJson<TraceLogStatus>("/api/runtime/logging");
}

export async function recordTraceLog(payload: TraceLogPayload) {
  try {
    await requestRuntimeJson<TraceLogStatus>("/api/runtime/logging", {
      method: "POST",
      body: JSON.stringify({
        level: payload.level ?? "error",
        source: payload.source,
        message: payload.message,
        detail: payload.detail ?? null,
      }),
    });
  } catch {
    // Logging must never create a second user-visible error.
  }
}

export async function openTraceLogFolder(folderPath: string) {
  if (isTauriRuntime()) {
    await invoke("open_folder", { folderPath });
    return;
  }

  await requestRuntimeJson<{ opened: boolean }>("/api/runtime/open-folder", {
    method: "POST",
    body: JSON.stringify({ folderPath }),
  });
}

async function requestRuntimeJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) throw new Error(response.statusText);
  return response.json() as Promise<T>;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as TauriWindow);
}
