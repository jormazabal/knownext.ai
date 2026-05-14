import type { AiTranscriptionLanguage } from "../../types/domain";
import { getApiWebSocketUrl } from "./client";

export type RealtimeTranscriptionEvent =
  | { type: "started" }
  | { type: "delta"; itemId?: string | null; delta: string }
  | { type: "completed"; itemId?: string | null; transcript: string }
  | { type: "stopping" }
  | { type: "stopped" }
  | { type: "error"; code: string; message: string };

export async function createRealtimeTranscriptionSocket(language: AiTranscriptionLanguage) {
  const socket = new WebSocket(await getApiWebSocketUrl("/api/transcription/realtime"));
  socket.binaryType = "arraybuffer";
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("No se pudo conectar con la transcripción local.")), { once: true });
  });
  socket.send(JSON.stringify({ type: "start", language }));
  return socket;
}

export function parseRealtimeTranscriptionEvent(rawEvent: MessageEvent): RealtimeTranscriptionEvent | null {
  if (typeof rawEvent.data !== "string") return null;
  try {
    const event = JSON.parse(rawEvent.data) as Partial<RealtimeTranscriptionEvent>;
    if (!event || typeof event.type !== "string") return null;
    switch (event.type) {
      case "started":
      case "stopping":
      case "stopped":
        return { type: event.type };
      case "delta":
        return { type: "delta", itemId: "itemId" in event ? event.itemId : null, delta: String(event.delta ?? "") };
      case "completed":
        return { type: "completed", itemId: "itemId" in event ? event.itemId : null, transcript: String(event.transcript ?? "") };
      case "error":
        return { type: "error", code: String(event.code ?? "transcription_error"), message: String(event.message ?? "No se pudo transcribir el audio.") };
      default:
        return null;
    }
  } catch {
    return null;
  }
}
