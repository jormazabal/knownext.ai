import { invoke } from "@tauri-apps/api/core";
export async function checkModelAccess(
  model: string,
): Promise<{ accountVisible: boolean; message: string; httpStatus: number }> {
  return invoke("openai_model_access", { model });
}
import { isTauriRuntime } from "../runtime/platform";
import type { RecordingSnapshot } from "../../types/recording";
export async function recordingRequest<T = RecordingSnapshot>(
  action: string,
  payload: unknown = {},
): Promise<T> {
  if (!isTauriRuntime())
    throw new Error(
      "La grabación requiere la aplicación nativa de KnowNext.ai.",
    );
  return invoke<T>("recording_request", { action, payload });
}
export async function recordingAudio(
  id: string,
  start: number,
  samples: number,
) {
  return invoke<string>("recording_audio", { id, start, samples });
}
export async function dictationLease(acquire: boolean, owner: string) {
  if (isTauriRuntime())
    await recordingRequest(acquire ? "dictation-acquire" : "dictation-release", {owner});
}
