import { useCallback, useEffect, useRef, useState } from "react";
import type { AiTranscriptionLanguage, AiTranscriptionTarget } from "../../types/domain";
import { transcribePcmAudio } from "../../lib/api/transcription";
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
  const captureRef = useRef<PcmAudioCapture | null>(null);
  const handlersRef = useRef<RealtimeTranscriptionHandlers | null>(null);
  const chunksRef = useRef<ArrayBuffer[]>([]);
  const languageRef = useRef<AiTranscriptionLanguage>("auto");
  const statusRef = useRef<RealtimeTranscriptionStatus>("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const cleanup = useCallback(async () => {
    const capture = captureRef.current;
    captureRef.current = null;
    if (capture) await capture.stop().catch(() => undefined);
    setActiveTarget(null);
  }, []);

  const stop = useCallback(async () => {
    if (statusRef.current !== "listening" && statusRef.current !== "connecting") return;
    setStatus("stopping");
    const capture = captureRef.current;
    captureRef.current = null;
    if (capture) await capture.stop().catch(() => undefined);

    const chunks = chunksRef.current;
    chunksRef.current = [];
    try {
      if (chunks.length === 0) {
        throw new Error("No se ha capturado audio para transcribir.");
      }
      const response = await transcribePcmAudio(chunks, languageRef.current);
      if (response.status !== "completed") {
        throw new Error(response.message || "No se pudo transcribir el audio.");
      }
      handlersRef.current?.onCompleted({ itemId: "dictation", transcript: response.transcript });
      setError(null);
      statusRef.current = "idle";
      setStatus("idle");
      setActiveTarget(null);
      handlersRef.current?.onStopped?.();
    } catch (stopError) {
      const message = stopError instanceof Error ? stopError.message : "No se pudo transcribir el audio.";
      setError(message);
      statusRef.current = "error";
      setStatus("error");
      setActiveTarget(null);
      handlersRef.current?.onError?.(message);
      await cleanup();
    }
  }, [cleanup]);

  const start = useCallback(async ({ target, language, handlers }: StartRealtimeTranscriptionOptions) => {
    if (statusRef.current !== "idle" && statusRef.current !== "error") return;
    setStatus("connecting");
    statusRef.current = "connecting";
    setError(null);
    setActiveTarget(target);
    handlersRef.current = handlers;
    languageRef.current = language;
    chunksRef.current = [];

    try {
      const capture = await startPcmAudioCapture((chunk) => {
        chunksRef.current.push(chunk.slice(0));
      });
      captureRef.current = capture;
      statusRef.current = "listening";
      setStatus("listening");
    } catch (startError) {
      const message = describeTranscriptionStartError(startError);
      setError(message);
      statusRef.current = "error";
      setStatus("error");
      handlers.onError?.(message);
      await cleanup();
    }
  }, [cleanup]);

  return {
    status,
    activeTarget,
    error,
    start,
    stop,
    resetError: () => {
      if (statusRef.current === "error") {
        statusRef.current = "idle";
        setStatus("idle");
      }
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
