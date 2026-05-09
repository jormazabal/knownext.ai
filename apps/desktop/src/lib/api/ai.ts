import { mockDelay, requestJson } from "./client";
import type { AiPromptRequest, AiPromptResponse } from "../../types/domain";

const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === "true";

export async function promptAssistant(request: AiPromptRequest): Promise<AiPromptResponse> {
  if (USE_BACKEND && request.documentId) {
    try {
      return await requestJson<AiPromptResponse>(`/api/documents/${request.documentId}/ai/prompt`, {
        method: "POST",
        body: JSON.stringify({ prompt: request.prompt, markdown: request.markdown ?? "" }),
      });
    } catch {
      // Fall through to the local mock assistant below.
    }
  }

  if (USE_BACKEND && request.projectId) {
    try {
      return await requestJson<AiPromptResponse>(`/api/projects/${request.projectId}/ai/prompt`, {
        method: "POST",
        body: JSON.stringify({ prompt: request.prompt }),
      });
    } catch {
      // Fall through to the local mock assistant below.
    }
  }

  return mockDelay({
    answer: request.documentId
      ? "Respuesta simulada: el documento contiene acuerdos, asistentes y tareas pendientes del proyecto."
      : "Respuesta simulada: consulta recibida para la documentación completa del proyecto.",
    suggestedActions: request.documentId
      ? ["Resumir documento", "Extraer acuerdos", "Crear lista de tareas"]
      : ["Buscar en el proyecto", "Resumir documentación", "Detectar tareas pendientes"],
  });
}
