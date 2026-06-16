import { requestFormData, requestJson } from "./client";
import type {
  AiContextAddToProjectResponse,
  AiContextSearchResult,
  AiContextSource,
  AiContextSourceListResponse,
  AiContextSourcePreviewResponse,
  AiConversationResponse,
  AiIndexStatusResponse,
  AiInteractionRequest,
  AiInteractionResponse,
  AiPendingIntent,
  AiResearchBrief,
  AiResearchBriefRequest,
  AiResearchActivityResponse,
  AiResearchCoverageResponse,
  AiResearchExportRequest,
  AiResearchExportResponse,
  AiResearchJob,
  AiResearchJobListResponse,
  AiResearchJobRequest,
  AiResearchPolicy,
  AiResearchQualityReport,
  AiResearchRevisionRequest,
  AiResearchSourcesResponse,
  AiUsageSummaryResponse,
  AiPromptRequest,
  AiPromptResponse,
  OpenAiKeyStatus,
} from "../../types/domain";

const AI_PROMPT_TIMEOUT_MS = 60_000;
const AI_INTERACTION_TIMEOUT_MS = 180_000;
const AI_INDEX_TIMEOUT_MS = 120_000;
const AI_CONTEXT_UPLOAD_TIMEOUT_MS = 120_000;
const AI_RESEARCH_TIMEOUT_MS = 300_000;

export async function promptAssistant(request: AiPromptRequest): Promise<AiPromptResponse> {
  if (request.documentId) {
    return requestJson<AiPromptResponse>(`/api/documents/${encodeURIComponent(request.documentId)}/ai/prompt`, {
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

export async function prepareAiResearchBrief(projectId: string, request: AiResearchBriefRequest): Promise<AiResearchBrief> {
  return requestJson<AiResearchBrief>(`/api/projects/${projectId}/ai/research/brief`, {
    method: "POST",
    body: JSON.stringify(request),
    timeoutMs: AI_INTERACTION_TIMEOUT_MS,
  });
}

export async function startAiResearchJob(projectId: string, request: AiResearchJobRequest): Promise<AiResearchJob> {
  return requestJson<AiResearchJob>(`/api/projects/${projectId}/ai/research/jobs`, {
    method: "POST",
    body: JSON.stringify(request),
    timeoutMs: AI_INTERACTION_TIMEOUT_MS,
  });
}

export async function listAiResearchJobs(projectId: string): Promise<AiResearchJobListResponse> {
  return requestJson<AiResearchJobListResponse>(`/api/projects/${projectId}/ai/research/jobs`);
}

export async function getAiResearchJob(projectId: string, jobId: string): Promise<AiResearchJob> {
  return requestJson<AiResearchJob>(`/api/projects/${projectId}/ai/research/jobs/${encodeURIComponent(jobId)}`);
}

export async function cancelAiResearchJob(projectId: string, jobId: string): Promise<AiResearchJob> {
  return requestJson<AiResearchJob>(`/api/projects/${projectId}/ai/research/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
  });
}

export async function retryAiResearchJob(projectId: string, jobId: string): Promise<AiResearchJob> {
  return requestJson<AiResearchJob>(`/api/projects/${projectId}/ai/research/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: "POST",
    timeoutMs: AI_INTERACTION_TIMEOUT_MS,
  });
}

export async function getAiResearchSources(projectId: string, jobId: string): Promise<AiResearchSourcesResponse> {
  return requestJson<AiResearchSourcesResponse>(`/api/projects/${projectId}/ai/research/jobs/${encodeURIComponent(jobId)}/sources`);
}

export async function getAiResearchQuality(projectId: string, jobId: string): Promise<AiResearchQualityReport> {
  return requestJson<AiResearchQualityReport>(`/api/projects/${projectId}/ai/research/jobs/${encodeURIComponent(jobId)}/quality`);
}

export async function getAiResearchActivity(projectId: string, jobId: string): Promise<AiResearchActivityResponse> {
  return requestJson<AiResearchActivityResponse>(`/api/projects/${projectId}/ai/research/jobs/${encodeURIComponent(jobId)}/activity`);
}

export async function getAiResearchCoverage(projectId: string, jobId: string): Promise<AiResearchCoverageResponse> {
  return requestJson<AiResearchCoverageResponse>(`/api/projects/${projectId}/ai/research/jobs/${encodeURIComponent(jobId)}/coverage`);
}

export async function refineAiResearchJob(projectId: string, jobId: string, request: AiResearchRevisionRequest): Promise<AiResearchJob> {
  return requestJson<AiResearchJob>(`/api/projects/${projectId}/ai/research/jobs/${encodeURIComponent(jobId)}/refine`, {
    method: "POST",
    body: JSON.stringify(request),
    timeoutMs: AI_INTERACTION_TIMEOUT_MS,
  });
}

export async function updateAiResearchSources(projectId: string, jobId: string): Promise<AiResearchJob> {
  return requestJson<AiResearchJob>(`/api/projects/${projectId}/ai/research/jobs/${encodeURIComponent(jobId)}/update-sources`, {
    method: "POST",
    timeoutMs: AI_INTERACTION_TIMEOUT_MS,
  });
}

export async function acceptAiResearchJob(projectId: string, jobId: string): Promise<AiResearchJob> {
  return requestJson<AiResearchJob>(`/api/projects/${projectId}/ai/research/jobs/${encodeURIComponent(jobId)}/accept`, {
    method: "POST",
  });
}

export async function reviewAiResearchJob(projectId: string, jobId: string, comments: string): Promise<AiResearchJob> {
  return requestJson<AiResearchJob>(`/api/projects/${projectId}/ai/research/jobs/${encodeURIComponent(jobId)}/review`, {
    method: "POST",
    body: JSON.stringify({ comments }),
  });
}

export async function exportAiResearchJob(projectId: string, jobId: string, request: AiResearchExportRequest): Promise<AiResearchExportResponse> {
  return requestJson<AiResearchExportResponse>(`/api/projects/${projectId}/ai/research/jobs/${encodeURIComponent(jobId)}/export`, {
    method: "POST",
    body: JSON.stringify(request),
    timeoutMs: AI_RESEARCH_TIMEOUT_MS,
  });
}

export async function getAiResearchPolicy(projectId: string): Promise<AiResearchPolicy> {
  return requestJson<AiResearchPolicy>(`/api/projects/${projectId}/ai/research/policy`);
}

export async function saveAiResearchPolicy(projectId: string, policy: AiResearchPolicy): Promise<AiResearchPolicy> {
  return requestJson<AiResearchPolicy>(`/api/projects/${projectId}/ai/research/policy`, {
    method: "PUT",
    body: JSON.stringify(policy),
  });
}

export async function searchAiContextDocuments(projectId: string, query: string): Promise<AiContextSearchResult[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  return requestJson<AiContextSearchResult[]>(`/api/projects/${projectId}/ai/context/search?${params.toString()}`);
}

export async function getAiContextSources(projectId: string): Promise<AiContextSourceListResponse> {
  return requestJson<AiContextSourceListResponse>(`/api/projects/${projectId}/ai/context/sources`);
}

export async function addProjectDocumentAiContextSource(projectId: string, documentId: string): Promise<AiContextSource> {
  return requestJson<AiContextSource>(`/api/projects/${projectId}/ai/context/project-documents`, {
    method: "POST",
    body: JSON.stringify({ documentId }),
  });
}

export async function addProjectImageAiContextSource(projectId: string, assetId: string): Promise<AiContextSource> {
  return requestJson<AiContextSource>(`/api/projects/${projectId}/ai/context/project-images`, {
    method: "POST",
    body: JSON.stringify({ assetId }),
  });
}

export async function addProjectAttachmentAiContextSource(projectId: string, attachmentId: string): Promise<AiContextSource> {
  return requestJson<AiContextSource>(`/api/projects/${projectId}/ai/context/project-attachments`, {
    method: "POST",
    body: JSON.stringify({ attachmentId }),
  });
}

export async function uploadAiContextFiles(projectId: string, files: File[]): Promise<AiContextSourceListResponse> {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);
  return requestFormData<AiContextSourceListResponse>(`/api/projects/${projectId}/ai/context/files`, formData, {
    timeoutMs: AI_CONTEXT_UPLOAD_TIMEOUT_MS,
  });
}

export async function uploadLocalAiContextFiles(projectId: string, filePaths: string[]): Promise<AiContextSourceListResponse> {
  return requestJson<AiContextSourceListResponse>(`/api/projects/${projectId}/ai/context/local-files`, {
    method: "POST",
    body: JSON.stringify({ paths: filePaths }),
    timeoutMs: AI_CONTEXT_UPLOAD_TIMEOUT_MS,
  });
}

export async function removeAiContextSource(projectId: string, sourceId: string): Promise<AiContextSourceListResponse> {
  return requestJson<AiContextSourceListResponse>(`/api/projects/${projectId}/ai/context/sources/${encodeURIComponent(sourceId)}`, {
    method: "DELETE",
  });
}

export async function extendAiContextSource(projectId: string, sourceId: string): Promise<AiContextSource> {
  return requestJson<AiContextSource>(`/api/projects/${projectId}/ai/context/sources/${encodeURIComponent(sourceId)}/extend`, {
    method: "POST",
  });
}

export async function previewAiContextSource(projectId: string, sourceId: string): Promise<AiContextSourcePreviewResponse> {
  return requestJson<AiContextSourcePreviewResponse>(`/api/projects/${projectId}/ai/context/sources/${encodeURIComponent(sourceId)}/preview`);
}

export async function addAiContextSourceToProject(projectId: string, sourceId: string, request: { name?: string | null; parentId?: string | null }): Promise<AiContextAddToProjectResponse> {
  return requestJson<AiContextAddToProjectResponse>(`/api/projects/${projectId}/ai/context/sources/${encodeURIComponent(sourceId)}/add-to-project`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function getAiConversation(projectId: string): Promise<AiConversationResponse> {
  return requestJson<AiConversationResponse>(`/api/projects/${projectId}/ai/conversation`);
}

export async function getAiPendingIntent(projectId: string): Promise<AiPendingIntent | null> {
  return requestJson<AiPendingIntent | null>(`/api/projects/${projectId}/ai/pending-intent`);
}

export async function getAiUsageSummary(month?: string): Promise<AiUsageSummaryResponse> {
  const params = new URLSearchParams();
  params.set("tzOffsetMinutes", String(-new Date().getTimezoneOffset()));
  if (month) params.set("month", month);
  return requestJson<AiUsageSummaryResponse>(`/api/ai/usage/summary?${params.toString()}`);
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
