import { requestBinary, requestJson } from "./client";
import type {
  FileOperationResult,
  HandwrittenNoteDraftResponse,
  HandwrittenNoteExportPayload,
  HandwrittenNoteInsertMarkdownPayload,
  HandwrittenNoteInsertMarkdownResponse,
  HandwrittenNoteRecord,
  HandwrittenNoteRenderResponse,
  SaveHandwrittenNoteDraftPayload,
  SaveHandwrittenNotePayload,
} from "../../types/domain";

export async function createHandwrittenNote(projectId: string, parentId: string | null, name: string, background = "blank"): Promise<FileOperationResult> {
  return requestJson<FileOperationResult>(`/api/projects/${projectId}/handwritten-notes`, {
    method: "POST",
    body: JSON.stringify({ parentId, name, background }),
  });
}

export async function getHandwrittenNote(noteId: string): Promise<HandwrittenNoteRecord> {
  return requestJson<HandwrittenNoteRecord>(`/api/handwritten-notes/${encodeURIComponent(noteId)}`);
}

export async function saveHandwrittenNote(noteId: string, payload: SaveHandwrittenNotePayload): Promise<HandwrittenNoteRecord> {
  return requestJson<HandwrittenNoteRecord>(`/api/handwritten-notes/${encodeURIComponent(noteId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function saveHandwrittenNoteDraft(noteId: string, payload: SaveHandwrittenNoteDraftPayload): Promise<HandwrittenNoteDraftResponse> {
  return requestJson<HandwrittenNoteDraftResponse>(`/api/handwritten-notes/${encodeURIComponent(noteId)}/draft`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function discardHandwrittenNoteDraft(noteId: string): Promise<void> {
  await requestJson<void>(`/api/handwritten-notes/${encodeURIComponent(noteId)}/draft`, {
    method: "DELETE",
  });
}

export async function exportHandwrittenNote(noteId: string, payload: HandwrittenNoteExportPayload) {
  return requestJson<{ noteId: string; format: string; outputPath: string; exportedAt: string }>(`/api/handwritten-notes/${encodeURIComponent(noteId)}/export`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function exportHandwrittenNoteContent(noteId: string, payload: Omit<HandwrittenNoteExportPayload, "outputPath">): Promise<Blob> {
  return requestBinary(`/api/handwritten-notes/${encodeURIComponent(noteId)}/export/content`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function renderHandwrittenNotePage(noteId: string, pageId: string, format: "png" | "svg" = "png"): Promise<HandwrittenNoteRenderResponse> {
  const params = new URLSearchParams({ format });
  return requestJson<HandwrittenNoteRenderResponse>(`/api/handwritten-notes/${encodeURIComponent(noteId)}/pages/${encodeURIComponent(pageId)}/render?${params.toString()}`);
}

export async function insertHandwrittenPageIntoMarkdown(noteId: string, payload: HandwrittenNoteInsertMarkdownPayload): Promise<HandwrittenNoteInsertMarkdownResponse> {
  return requestJson<HandwrittenNoteInsertMarkdownResponse>(`/api/handwritten-notes/${encodeURIComponent(noteId)}/pages/${encodeURIComponent(payload.pageId)}/insert-markdown`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
