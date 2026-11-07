import { invoke } from "@tauri-apps/api/core";
import { requestJson } from "../api/client";

export type TraceLogStatus = {
  enabled: boolean;
  folderPath: string;
  filePath: string;
  directoryExists?: boolean;
  eventId?: string;
  recorded?: boolean;
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
  if (isTauriRuntime()) {
    return invoke<TraceLogStatus>("get_trace_log_status");
  }

  return requestRuntimeJson<TraceLogStatus>("/api/runtime/logging");
}

export async function recordTraceLog(payload: TraceLogPayload) {
  try {
    // Free-form error text stays in the UI. The diagnostic bridge receives metadata only.
    const metadata={level:payload.level??"error",source:diagnosticOperation(payload.source)};
    if (isTauriRuntime()) {
      const receipt=await invoke<TraceLogStatus>("record_trace_log",metadata);
      return receipt?.recorded ? receipt.eventId : undefined;
    }

    const receipt=await requestRuntimeJson<TraceLogStatus>("/api/runtime/logging", {
      method: "POST",
      body: JSON.stringify(metadata),
    });
    return receipt?.recorded ? receipt.eventId : undefined;
  } catch {
    // Logging must never create a second user-visible error.
  }
}

function diagnosticOperation(source:string) {
  const category=source.split('.')[1]??source;
  if(["startup","project","ai","settings","runtime"].includes(category))return category;
  if(["document","save","autosave","editor"].includes(category))return "document";
  if(category==="config")return "settings";
  if(category==="projects")return "project";
  return "application";
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
  return requestJson<T>(path, init);
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as TauriWindow);
}
