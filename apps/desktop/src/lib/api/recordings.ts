import {invokeManagedNative} from "./nativeClient";
import { invoke } from "@tauri-apps/api/core";
export async function checkModelAccess(
  model: string,
): Promise<{ accountVisible: boolean; message: string; httpStatus: number }> {
  return invokeManagedNative("openai_model_access", { model });
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

export async function recordingTranscript(id:string){
 const value=await recordingRequest<import("../../types/recording").RecordingTranscript>("transcript",{id});
 if(!value||value.schemaVersion!==1||value.sessionId!==id||value.sampleRate!==24000||!Number.isSafeInteger(value.samples)||value.samples<0||!/^[a-f0-9]{64}$/.test(value.sourceRevision)||value.readOnly!==true||value.startsProvider!==false||value.wordTimingAvailable!==false||value.diarizationAvailable!==false||typeof value.audioAvailable!=="boolean"||!Array.isArray(value.segments)||value.segments.length>2048||!Number.isSafeInteger(value.unconfirmedCount)||value.unconfirmedCount<0)throw Error("La transcripción no confirma la misma fuente; se conserva sin enviar ni reproducir");
 let end=0,bytes=0;const ids=new Set<string>();for(const segment of value.segments){if(typeof segment.text!=="string")throw Error("Texto de transcripción no compatible");bytes+=new TextEncoder().encode(segment.text).length;if(ids.has(segment.id)||!segment.id||!Number.isSafeInteger(segment.start)||!Number.isSafeInteger(segment.samples)||segment.samples<=0||segment.start<end||segment.start+segment.samples>value.samples||typeof segment.text!=="string"||segment.speaker!==null||segment.timing!=="fragment"||bytes>2*1024*1024)throw Error("Intervalos de transcripción no verificables; no se reproducen fuentes distintas");ids.add(segment.id);end=segment.start+segment.samples;}
 return value;
}
