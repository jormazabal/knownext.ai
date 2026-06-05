import type { AiTranscriptionLanguage } from "../../types/domain";
import { requestFormData } from "./client";

export type TranscriptionResponse = {
  status: "completed" | "error";
  transcript: string;
  error?: string;
  message?: string;
};

export async function transcribePcmAudio(chunks: ArrayBuffer[], language: AiTranscriptionLanguage): Promise<TranscriptionResponse> {
  const formData = new FormData();
  formData.append("file", pcmChunksToWavFile(chunks));
  return requestFormData<TranscriptionResponse>("/api/transcription", formData, {
    method: "POST",
    body: JSON.stringify({ language }),
    timeoutMs: 120_000,
  });
}

function pcmChunksToWavFile(chunks: ArrayBuffer[]) {
  const sampleRate = 24_000;
  const bytes = concatChunks(chunks);
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + bytes.byteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, bytes.byteLength, true);
  return new File([header, bytes], "knownext-dictation.wav", { type: "audio/wav" });
}

function concatChunks(chunks: ArrayBuffer[]) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return output;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
