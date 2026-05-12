import { requestJson } from "./client";
import type {
  AiConversationResponse,
  AiIndexStatusResponse,
  AiInteractionRequest,
  AiInteractionResponse,
  AiPromptRequest,
  AiPromptResponse,
  OpenAiKeyStatus,
} from "../../types/domain";

const AI_PROMPT_TIMEOUT_MS = 60_000;
const AI_INTERACTION_TIMEOUT_MS = 120_000;
const AI_INDEX_TIMEOUT_MS = 120_000;

export async function promptAssistant(request: AiPromptRequest): Promise<AiPromptResponse> {
  if (request.documentId) {
    return requestJson<AiPromptResponse>(`/api/documents/${request.documentId}/ai/prompt`, {
      method: "POST",
      body: JSON.stringify({ prompt: request.prompt, markdown: request.markdown ?? "" }),
      timeoutMs: AI_PROMPT_TIMEOUT_MS,
    });
  }

  if (request.projectId) {
    return requestJson<AiPromptResponse>(`/api/projects/${request.projectId}/ai/prompt`, {
      method: "POST",
      body: JSON.stringify({ prompt: request.prompt }),
      timeoutMs: AI_PROMPT_TIMEOUT_MS,
    });
  }

  throw new Error("Crea o selecciona un proyecto antes de usar la asistencia.");
}

export async function sendAiInteraction(request: AiInteractionRequest): Promise<AiInteractionResponse> {
  return requestJson<AiInteractionResponse>(`/api/projects/${request.projectId}/ai/interactions`, {
    method: "POST",
    body: JSON.stringify(request),
    timeoutMs: AI_INTERACTION_TIMEOUT_MS,
  });
}

export async function getAiConversation(projectId: string): Promise<AiConversationResponse> {
  return requestJson<AiConversationResponse>(`/api/projects/${projectId}/ai/conversation`);
}

export async function clearAiConversation(projectId: string): Promise<AiConversationResponse> {
  return requestJson<AiConversationResponse>(`/api/projects/${projectId}/ai/conversation`, {
    method: "DELETE",
  });
}

export type AiConfirmDeleteRequest = {
  confirmationId: string;
};

export async function confirmAiDelete(projectId: string, request: AiConfirmDeleteRequest): Promise<AiInteractionResponse> {
  return requestJson<AiInteractionResponse>(`/api/projects/${projectId}/ai/confirm-delete`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function getOpenAiKeyStatus(): Promise<OpenAiKeyStatus> {
  return requestJson<OpenAiKeyStatus>("/api/credentials/openai-key");
}

export async function saveOpenAiKey(apiKey: string): Promise<OpenAiKeyStatus> {
  return requestJson<OpenAiKeyStatus>("/api/credentials/openai-key", {
    method: "PUT",
    body: JSON.stringify({ apiKey }),
  });
}

export async function deleteOpenAiKey(): Promise<void> {
  await requestJson<void>("/api/credentials/openai-key", {
    method: "DELETE",
  });
}

export async function getAiIndexStatus(projectId: string): Promise<AiIndexStatusResponse> {
  return requestJson<AiIndexStatusResponse>(`/api/projects/${projectId}/ai/index/status`);
}

export async function rebuildAiIndex(projectId: string): Promise<AiIndexStatusResponse> {
  return requestJson<AiIndexStatusResponse>(`/api/projects/${projectId}/ai/index/rebuild`, {
    method: "POST",
    timeoutMs: AI_INDEX_TIMEOUT_MS,
  });
}

export async function deleteAiIndex(projectId: string): Promise<AiIndexStatusResponse> {
  return requestJson<AiIndexStatusResponse>(`/api/projects/${projectId}/ai/index`, {
    method: "DELETE",
  });
}
