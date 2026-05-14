import { useCallback, useEffect, useRef, useState } from "react";
import type { AiTranscriptionLanguage, AiTranscriptionTarget } from "../../types/domain";
import { createRealtimeTranscriptionSocket, parseRealtimeTranscriptionEvent } from "../../lib/api/transcription";
import { startPcmAudioCapture, type PcmAudioCapture } from "./audioCapture";

export type RealtimeTranscriptionStatus = "idle" | "connecting" | "listening" | "stopping" | "error";

export type RealtimeTranscriptionHandlers = {
  onDelta: (event: { itemId?: string | null; delta: string }) => void;
  onCompleted: (event: { itemId?: string | null; transcript: string }) => void;
  onStopped?: () => void;
  onError?: (message: string) => void;
};

export type StartRealtimeTranscriptionOptions = {
  target: AiTranscriptionTarget;
  language: AiTranscriptionLanguage;
  handlers: RealtimeTranscriptionHandlers;
};

export function useRealtimeTranscription() {
  const [status, setStatus] = useState<RealtimeTranscriptionStatus>("idle");
  const [activeTarget, setActiveTarget] = useState<AiTranscriptionTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<PcmAudioCapture | null>(null);
  const handlersRef = useRef<RealtimeTranscriptionHandlers | null>(null);
  const statusRef = useRef<RealtimeTranscriptionStatus>("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const cleanup = useCallback(async () => {
    const capture = captureRef.current;
    captureRef.current = null;
    if (capture) await capture.stop().catch(() => undefined);

    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
    setActiveTarget(null);
  }, []);

  const stop = useCallback(async () => {
    if (status === "idle") return;
    setStatus("stopping");
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "stop" }));
    } else {
      await cleanup();
      setStatus("idle");
      handlersRef.current?.onStopped?.();
    }
  }, [cleanup, status]);

  const start = useCallback(async ({ target, language, handlers }: StartRealtimeTranscriptionOptions) => {
    if (status !== "idle" && status !== "error") return;
    setStatus("connecting");
    setError(null);
    setActiveTarget(target);
    handlersRef.current = handlers;

    try {
      const socket = await createRealtimeTranscriptionSocket(language);
      socketRef.current = socket;

      socket.addEventListener("message", (rawEvent) => {
        const event = parseRealtimeTranscriptionEvent(rawEvent);
        if (!event) return;
        if (event.type === "started") {
          setStatus("listening");
          return;
        }
        if (event.type === "stopping") {
          setStatus("stopping");
          return;
        }
        if (event.type === "stopped") {
          statusRef.current = "idle";
          setStatus("idle");
          void cleanup().then(() => {
            handlersRef.current?.onStopped?.();
          });
          return;
        }
        if (event.type === "delta") {
          handlersRef.current?.onDelta({ itemId: event.itemId, delta: event.delta });
          return;
        }
        if (event.type === "completed") {
          handlersRef.current?.onCompleted({ itemId: event.itemId, transcript: event.transcript });
          return;
        }
        if (event.type === "error") {
          setError(event.message);
          statusRef.current = "error";
          setStatus("error");
          handlersRef.current?.onError?.(event.message);
          void cleanup();
        }
      });

      socket.addEventListener("close", () => {
        if (statusRef.current === "idle") return;
        void cleanup().then(() => {
          setStatus("idle");
          handlersRef.current?.onStopped?.();
        });
      });

      const capture = await startPcmAudioCapture((chunk) => {
        const currentSocket = socketRef.current;
        if (currentSocket?.readyState === WebSocket.OPEN) {
          currentSocket.send(chunk);
        }
      });
      captureRef.current = capture;
    } catch (startError) {
      const message = describeTranscriptionStartError(startError);
      setError(message);
      setStatus("error");
      handlers.onError?.(message);
      await cleanup();
    }
  }, [cleanup, status]);

  return {
    status,
    activeTarget,
    error,
    start,
    stop,
    resetError: () => {
      if (status === "error") setStatus("idle");
      setError(null);
    },
  };
}

function describeTranscriptionStartError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Permite el acceso al micrófono en el sistema para dictar.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No se detectó ningún micrófono disponible.";
  }
  if (error instanceof Error) return error.message;
  return "No se pudo iniciar la transcripción.";
}
