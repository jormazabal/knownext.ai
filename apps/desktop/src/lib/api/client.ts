import {ApiError} from "./errors";
import {runLocalOperation} from "../runtime/localOperations";
import { invoke } from "@tauri-apps/api/core";
import { APP_VERSION } from "../appVersion";
import { isTauriMobileRuntime, isTauriRuntime } from "../runtime/platform";
import { handleWebDevLocalApiRequest } from "./webDevLocalApi";

export type RuntimeHealth = {
  app?: string;
  schemaVersion?: number;
  status?: string;
  service?: string;
  version?: string;
  profile?: "desktop" | "mobile" | "web-dev" | string;
  host?: string;
  port?: number | null;
  endpoint?: string;
  instanceId?: string;
  startedAt?: string;
  managedBy?: "tauri" | "manual" | string;
  appDataDir?: string;
};

async function initializeApiBaseUrl() {
  return "tauri://local-api";
}

export function isRuntimeApiEnabled() {
  return true;
}

export {ApiError} from "./errors";

export type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
};

type LocalApiResponse<T> = {
  status: number;
  body: T;
};

type LocalApiContentResponse = {
  status: number;
  contentType: string;
  filename?: string | null;
  dataBase64: string;
};

type LocalApiFile = {
  fieldName: string;
  name: string;
  mimeType?: string | null;
  dataBase64: string;
};

export async function requestJson<T>(path: string, init?: ApiRequestInit): Promise<T> {
  await initializeApiBaseUrl();
  const native=isTauriRuntime();
  return runLocalOperation(async operationId=>{
    const response=native
      ?await invoke<LocalApiResponse<T>>("local_api_request", {request:{method:init?.method??"GET",path,body:parseBody(init?.body)},operationId})
      :await handleWebDevLocalApiRequest<T>(init?.method??"GET",path,parseBody(init?.body));
    validateResponse(response, native?operationId:undefined);
    if(response.status>=400)throw apiErrorFromResponse(response.status,response.body);
    return response.body;
  },{native,label:operationLabel(init?.method??"GET"),timeoutMs:init?.timeoutMs,signal:init?.signal});
}

export async function requestFormData<T>(path: string, formData: FormData, init?: ApiRequestInit): Promise<T> {
  await initializeApiBaseUrl();
  if (!isTauriRuntime()) {
    throw new ApiError(503, "Runtime unavailable", `KnowNext.ai ${APP_VERSION} requiere el runtime Tauri local.`);
  }

  const files: LocalApiFile[] = [];
  for (const [fieldName, value] of formData.entries()) {
    if (value instanceof File) {
      files.push({
        fieldName,
        name: value.name,
        mimeType: value.type || null,
        dataBase64: await fileToBase64(value),
      });
    }
  }

  return runLocalOperation(async operationId=>{
    const response=await invoke<LocalApiResponse<T>>("local_api_request",{request:{method:init?.method??"POST",path,body:parseBody(init?.body),files},operationId});
    validateResponse(response,operationId);
    if(response.status>=400)throw apiErrorFromResponse(response.status,response.body);
    return response.body;
  },{native:true,label:"Importación",timeoutMs:init?.timeoutMs,signal:init?.signal});
}

export async function requestBinary(path: string, init?: ApiRequestInit): Promise<Blob> {
  await initializeApiBaseUrl();
  const native=isTauriRuntime();
  return runLocalOperation(async operationId=>{
    const response=native
      ?await invoke<LocalApiContentResponse>("local_api_content",{request:{method:init?.method??"GET",path,body:parseBody(init?.body)},operationId})
      :await (async()=>{const response=await handleWebDevLocalApiRequest<LocalApiContentResponse>(init?.method??"GET",path,parseBody(init?.body));validateResponse(response);if(response.status>=400)throw apiErrorFromResponse(response.status,response.body);return response.body;})();
    validateResponse(response,native?operationId:undefined);
    if(response.status>=400)throw new ApiError(response.status,"Local API error");
    if(typeof response.contentType!=="string"||typeof response.dataBase64!=="string")throw new ApiError(502,"Respuesta incompatible","El runtime no devolvió un contenido válido.","unknown","invalid-runtime-response");
    return base64ToBlob(response.dataBase64,response.contentType);
  },{native,label:"Preparación de archivo",timeoutMs:init?.timeoutMs,signal:init?.signal});
}

function operationLabel(method:string){return method==="GET"?"Consulta":method==="PUT"?"Guardado":method==="DELETE"?"Eliminación":"Operación";}
function validateResponse(value:unknown,operationId?:string):asserts value is {status:number}{
  if(operationId&&(!value||typeof value!=="object"||!("protocolVersion" in value)||value.protocolVersion!==1||!("operationId" in value)||value.operationId!==operationId||!("completedAt" in value)||typeof value.completedAt!=="string"||!Number.isFinite(Date.parse(value.completedAt))))throw new ApiError(502,"Respuesta incompatible","La respuesta no confirma la petición ni su versión. Consulta antes de repetir.","unknown","invalid-runtime-response",operationId);
  if(!value||typeof value!=="object"||!("status" in value)||!Number.isInteger(value.status)||Number(value.status)<100||Number(value.status)>599)throw new ApiError(502,"Respuesta incompatible","No se pudo confirmar la respuesta del runtime. Comprueba el resultado antes de repetir la operación.","unknown","invalid-runtime-response");
}

export async function requestDataUrl(path: string, init?: ApiRequestInit): Promise<string> {
  const blob = await requestBinary(path, init);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function waitForApiReady(_options: { attempts?: number; intervalMs?: number } = {}) {
  const health = await requestJson<RuntimeHealth>("/health");
  validateRuntimeHealth(health);
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error.slice(0, 2000);
  if (error instanceof ApiError) return typeof error.detail === "string" ? error.detail : error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function isApiConnectionError(error: unknown) {
  return error instanceof ApiError && error.status === 503;
}

export function expectedRuntimeProfile() {
  if (isTauriMobileRuntime()) return "mobile";
  return isTauriRuntime() ? "desktop" : "web-dev";
}

export function validateRuntimeHealth(health: RuntimeHealth) {
  const expectedProfile = expectedRuntimeProfile();
  const problems: string[] = [];
  if (health.app !== "knownext") problems.push(`app=${health.app ?? "unknown"}`);
  if (health.status !== "ok") problems.push(`status=${health.status ?? "unknown"}`);
  if (health.version !== APP_VERSION) problems.push(`version=${health.version ?? "unknown"}`);
  if (health.profile !== expectedProfile) problems.push(`profile=${health.profile ?? "unknown"}`);
  if (problems.length > 0) {
    throw new ApiError(
      409,
      "Runtime incompatible",
      `Runtime local incompatible. Esperado version=${APP_VERSION}, profile=${expectedProfile}; detectado ${problems.join(", ")}.`,
    );
  }
}

function parseBody(body: BodyInit | null | undefined) {
  if (!body) return null;
  if (typeof body === "string") {try{return JSON.parse(body);}catch{throw new ApiError(400,"Petición inválida","El contenido de la petición no es JSON válido.","not-started","invalid-request-body");}}
  throw new ApiError(400,"Petición inválida","Este tipo de contenido necesita el contrato de importación.","not-started","invalid-request-body");
}

function apiErrorFromResponse(status: number, body: unknown) {
  const detail = typeof body === "object" && body && "detail" in body ? (body as { detail?: unknown }).detail : body;
  const outcome = typeof body === "object" && body && "operationOutcome" in body && body.operationOutcome === "not-started" ? "not-started" : undefined;
  const code = typeof body === "object" && body && "code" in body && typeof body.code === "string" ? body.code.slice(0,128) : undefined;
  return new ApiError(status, "Local API error", detail, outcome,code);
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBlob(base64: string, contentType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: contentType });
}
