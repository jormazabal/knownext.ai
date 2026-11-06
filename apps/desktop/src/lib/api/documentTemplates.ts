import { requestJson } from "./client";
import type { FileOperationResult } from "../../types/domain";
import type { DocumentTemplate, DocumentTemplateInventory, DocumentTemplatePreview, TemplateRenderRequest,DocumentTemplateSource } from "../../types/documentTemplates";
import {isTauriRuntime} from "../runtime/platform";

const templatePath = (id: string) => `/api/document-templates/${encodeURIComponent(id)}`;
export function listDocumentTemplates(): Promise<DocumentTemplateInventory> {
  return requestJson("/api/document-templates");
}
export function getDocumentTemplate(id: string): Promise<DocumentTemplate> {
  return requestJson(templatePath(id));
}
export function saveDocumentTemplate(input: {name:string;description:string;markdown:string;resources?:import("../../types/documentTemplates").DocumentTemplateAttachment[];reviewedResources?:boolean}): Promise<DocumentTemplate> {
  return requestJson("/api/document-templates", { method: "POST", body: JSON.stringify(input) });
}
export function prepareDocumentTemplateSource(documentId:string,markdown:string):Promise<DocumentTemplateSource>{
  if(!isTauriRuntime())return Promise.reject(new Error("La preparación de recursos locales requiere la aplicación nativa. El documento se conserva."));
  return requestJson("/api/document-templates/source/prepare",{method:"POST",body:JSON.stringify({documentId,markdown})});
}
export function previewDocumentTemplate(id: string, input: TemplateRenderRequest): Promise<DocumentTemplatePreview> {
  const now = new Date();
  const localDate = input.localDate ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return requestJson(`${templatePath(id)}/preview`, { method: "POST", body: JSON.stringify({ ...input, localDate }) });
}
export function createDocumentFromTemplate(id: string, input: TemplateRenderRequest): Promise<FileOperationResult> {
  return requestJson(`${templatePath(id)}/create`, { method: "POST", body: JSON.stringify(input) });
}
export function retireDocumentTemplate(id: string, revision: string): Promise<{ id: string; retired: true; archived: true; completedAt: string }> {
  return requestJson(`${templatePath(id)}/retire`, { method: "POST", body: JSON.stringify({ revision }) });
}
