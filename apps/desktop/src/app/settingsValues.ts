import type { AiConfig, AiConfigStatus, ExportTemplateConfig, ExportTemplateUpdate } from "../types/domain";

export function aiSettingsPayload(value: AiConfigStatus): AiConfig {
  const {provider, model, permissions, rag, vision, imageGeneration, agentic, transcription, diagrams, handwrittenDrawing} = value;
  return {provider, model, permissions, rag, vision, imageGeneration, agentic, transcription, diagrams, handwrittenDrawing};
}

export function mergeExportSettings(current: ExportTemplateConfig, patch: ExportTemplateUpdate): ExportTemplateConfig {
  return {...current, ...patch,
    page: patch.page ?? current.page, normal: patch.normal ?? current.normal,
    headings: patch.headings ? {...current.headings, ...patch.headings} : current.headings,
    code: patch.code ?? current.code, paragraph: patch.paragraph ?? current.paragraph,
    document: patch.document ?? current.document, headingFontFamily: patch.headingFontFamily ?? current.headingFontFamily,
  };
}

export function reconcileAiSettingsRefresh(current: AiConfigStatus, incoming: AiConfigStatus, keepPreferences: boolean, keepCredentials: boolean): AiConfigStatus {
  const result = keepPreferences ? {...incoming, ...aiSettingsPayload(current)} : {...incoming};
  return keepCredentials ? {...result, openaiKeyConfigured: current.openaiKeyConfigured, openaiKeyPreview: current.openaiKeyPreview, credentialStorageError: current.credentialStorageError, credentialProtection: current.credentialProtection} : result;
}

export function acceptsAiRefresh(scope: {request: number; latest: number; projectAtStart?: string; currentProject?: string; requestedProject?: string}) {
  return scope.request === scope.latest && (scope.currentProject === scope.projectAtStart || scope.currentProject === scope.requestedProject);
}
