import { requestJson } from "./client";
import type { AiPromptRequest, AiPromptResponse } from "../../types/domain";

export async function promptAssistant(request: AiPromptRequest): Promise<AiPromptResponse> {
  if (request.documentId) {
    return requestJson<AiPromptResponse>(`/api/documents/${request.documentId}/ai/prompt`, {
      method: "POST",
      body: JSON.stringify({ prompt: request.prompt, markdown: request.markdown ?? "" }),
    });
  }

  if (request.projectId) {
    return requestJson<AiPromptResponse>(`/api/projects/${request.projectId}/ai/prompt`, {
      method: "POST",
      body: JSON.stringify({ prompt: request.prompt }),
    });
  }

  throw new Error("Crea o selecciona un proyecto antes de usar la asistencia.");
}
