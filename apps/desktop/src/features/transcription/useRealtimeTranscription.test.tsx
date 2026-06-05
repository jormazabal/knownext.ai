import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { transcribePcmAudio } from "../../lib/api/transcription";
import { startPcmAudioCapture } from "./audioCapture";
import { useRealtimeTranscription } from "./useRealtimeTranscription";

vi.mock("../../lib/api/transcription", () => ({
  transcribePcmAudio: vi.fn(),
}));

vi.mock("./audioCapture", () => ({
  startPcmAudioCapture: vi.fn(),
}));

describe("useRealtimeTranscription", () => {
  beforeEach(() => {
    vi.mocked(transcribePcmAudio).mockReset();
    vi.mocked(startPcmAudioCapture).mockReset();
  });

  it("captures local audio, sends it to the Rust transcription contract and emits the completed transcript", async () => {
    const stopCapture = vi.fn(async () => undefined);
    const captured: { pushAudioChunk?: (chunk: ArrayBuffer) => void } = {};
    vi.mocked(startPcmAudioCapture).mockImplementation(async (onChunk) => {
      captured.pushAudioChunk = onChunk;
      return { stop: stopCapture };
    });
    vi.mocked(transcribePcmAudio).mockResolvedValue({
      status: "completed",
      transcript: "Texto dictado para el documento",
    });
    const handlers = {
      onDelta: vi.fn(),
      onCompleted: vi.fn(),
      onStopped: vi.fn(),
      onError: vi.fn(),
    };

    const { result } = renderHook(() => useRealtimeTranscription());

    await act(async () => {
      await result.current.start({ target: "document", language: "es", handlers });
    });

    expect(result.current.status).toBe("listening");
    expect(result.current.activeTarget).toBe("document");
    expect(captured.pushAudioChunk).toBeDefined();

    const chunk = new Uint8Array([1, 2, 3, 4]).buffer;
    captured.pushAudioChunk?.(chunk);

    await act(async () => {
      await result.current.stop();
    });

    expect(stopCapture).toHaveBeenCalledTimes(1);
    expect(transcribePcmAudio).toHaveBeenCalledWith([chunk], "es");
    expect(handlers.onCompleted).toHaveBeenCalledWith({
      itemId: "dictation",
      transcript: "Texto dictado para el documento",
    });
    expect(handlers.onStopped).toHaveBeenCalledTimes(1);
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(result.current.activeTarget).toBeNull();
  });

  it("reports a controlled error when the microphone starts but no audio is captured", async () => {
    const stopCapture = vi.fn(async () => undefined);
    vi.mocked(startPcmAudioCapture).mockResolvedValue({ stop: stopCapture });
    const handlers = {
      onDelta: vi.fn(),
      onCompleted: vi.fn(),
      onError: vi.fn(),
    };

    const { result } = renderHook(() => useRealtimeTranscription());

    await act(async () => {
      await result.current.start({ target: "prompt", language: "auto", handlers });
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(transcribePcmAudio).not.toHaveBeenCalled();
    expect(handlers.onCompleted).not.toHaveBeenCalled();
    expect(handlers.onError).toHaveBeenCalledWith("No se ha capturado audio para transcribir.");
    expect(result.current.status).toBe("error");
    expect(result.current.activeTarget).toBeNull();

    act(() => {
      result.current.resetError();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });
});
