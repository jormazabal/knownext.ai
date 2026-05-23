import { API_BASE_URL, initializeApiBaseUrl, requestJson } from "./client";
import type {
  DocumentPreview,
  DocumentPreviewMode,
  DocumentPreviewTextResponse,
  SpreadsheetSheetResponse,
  SpreadsheetSheetsResponse,
} from "../../types/domain";

export async function createDocumentPreview(
  projectId: string,
  payload: { path: string; preferredMode?: DocumentPreviewMode },
): Promise<DocumentPreview> {
  return requestJson<DocumentPreview>(`/api/projects/${encodeURIComponent(projectId)}/previews`, {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: 60000,
  });
}

export async function getDocumentPreview(projectId: string, previewId: string): Promise<DocumentPreview> {
  return requestJson<DocumentPreview>(`/api/projects/${encodeURIComponent(projectId)}/previews/${encodeURIComponent(previewId)}`);
}

export async function refreshDocumentPreview(projectId: string, previewId: string): Promise<DocumentPreview> {
  return requestJson<DocumentPreview>(`/api/projects/${encodeURIComponent(projectId)}/previews/${encodeURIComponent(previewId)}/refresh`, {
    method: "POST",
    timeoutMs: 60000,
  });
}

export async function getDocumentPreviewText(projectId: string, previewId: string): Promise<DocumentPreviewTextResponse> {
  return requestJson<DocumentPreviewTextResponse>(`/api/projects/${encodeURIComponent(projectId)}/previews/${encodeURIComponent(previewId)}/text`);
}

export async function getSpreadsheetSheets(projectId: string, previewId: string): Promise<SpreadsheetSheetsResponse> {
  return requestJson<SpreadsheetSheetsResponse>(`/api/projects/${encodeURIComponent(projectId)}/previews/${encodeURIComponent(previewId)}/sheets`);
}

export async function getSpreadsheetSheet(projectId: string, previewId: string, sheetId: string): Promise<SpreadsheetSheetResponse> {
  return requestJson<SpreadsheetSheetResponse>(`/api/projects/${encodeURIComponent(projectId)}/previews/${encodeURIComponent(previewId)}/sheets/${encodeURIComponent(sheetId)}`);
}

export async function openDocumentPreviewExternal(projectId: string, previewId: string): Promise<void> {
  await requestJson<void>(`/api/projects/${encodeURIComponent(projectId)}/previews/${encodeURIComponent(previewId)}/open-external`, {
    method: "POST",
  });
}

export async function getDocumentPreviewPdfUrl(projectId: string, previewId: string): Promise<string> {
  await initializeApiBaseUrl();
  return `${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/previews/${encodeURIComponent(previewId)}/pdf`;
}
