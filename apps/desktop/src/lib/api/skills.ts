import { requestJson } from "./client";
import type {
  AiSkillDetail,
  AiSkillListResponse,
  AiSkillSelectionPreview,
  AiSkillSelectionPreviewRequest,
  AiSkillValidationResponse,
} from "../../types/domain";

export async function listAiSkills(): Promise<AiSkillListResponse> {
  return requestJson<AiSkillListResponse>("/api/ai/skills");
}

export async function getAiSkill(skillId: string): Promise<AiSkillDetail> {
  return requestJson<AiSkillDetail>(`/api/ai/skills/${encodeURIComponent(skillId)}`);
}

export async function validateAiSkill(skillId: string): Promise<AiSkillValidationResponse> {
  return requestJson<AiSkillValidationResponse>(`/api/ai/skills/${encodeURIComponent(skillId)}/validate`, {
    method: "POST",
  });
}

export async function previewAiSkillSelection(request: AiSkillSelectionPreviewRequest): Promise<AiSkillSelectionPreview> {
  return requestJson<AiSkillSelectionPreview>("/api/ai/skills/selection-preview", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
