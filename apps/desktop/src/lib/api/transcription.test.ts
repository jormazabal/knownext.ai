import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestFormData } from "./client";
import { transcribePcmAudio } from "./transcription";

vi.mock("./client", () => ({
  requestFormData: vi.fn(),
}));

describe("transcription API contract", () => {
  beforeEach(() => {
    vi.mocked(requestFormData).mockReset();
    vi.mocked(requestFormData).mockResolvedValue({ status: "completed", transcript: "nota dictada" });
  });

  it("sends PCM audio as a local WAV file through the Tauri form-data contract", async () => {
    const first = new Uint8Array([1, 2, 3, 4]).buffer;
    const second = new Uint8Array([5, 6]).buffer;

    await transcribePcmAudio([first, second], "es");

    expect(requestFormData).toHaveBeenCalledWith("/api/transcription", expect.any(FormData), {
      method: "POST",
      body: JSON.stringify({ language: "es" }),
      timeoutMs: 120_000,
    });

    const formData = vi.mocked(requestFormData).mock.calls[0]?.[1];
    const file = formData?.get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("knownext-dictation.wav");
    expect((file as File).type).toBe("audio/wav");

    const bytes = new Uint8Array(await readFileAsArrayBuffer(file as File));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
    expect(String.fromCharCode(...bytes.slice(36, 40))).toBe("data");
    expect(Array.from(bytes.slice(44))).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

function readFileAsArrayBuffer(file: File) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
