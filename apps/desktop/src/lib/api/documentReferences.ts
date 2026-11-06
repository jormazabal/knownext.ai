import {requestJson} from "./client";
import type {DocumentReferencesResponse} from "../../types/documentReferences";

export function getDocumentReferences(id:string) {
  return requestJson<DocumentReferencesResponse>(`/api/documents/${encodeURIComponent(id)}/links`);
}
