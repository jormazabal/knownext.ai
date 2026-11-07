import {invokeManagedNative as invoke} from "./nativeClient";
import { requestJson } from "./client";
import { isTauriRuntime } from "../runtime/platform";
import type { DocumentTemplate, DocumentTemplateTransferFile, DocumentTemplateTransferReceipt, DocumentTemplateTransferReview,TemplateCatalogExportSelection,TemplateCatalogSelection,TemplateCatalogResult } from "../../types/documentTemplates";

export function inspectTemplateTransfer(content: string): Promise<DocumentTemplateTransferReview> {
  return requestJson("/api/document-templates/transfer/inspect", { method: "POST", body: JSON.stringify({ content }) });
}
export function importTemplateTransfer(content: string, digest: string, name: string, reviewedResources=false): Promise<DocumentTemplate> {
  return requestJson("/api/document-templates/transfer/import", { method: "POST", body: JSON.stringify({ content, digest, name,...(reviewedResources?{reviewedResources:true}:{}) }) });
}
export function prepareTemplateTransfer(id: string, revision: string): Promise<DocumentTemplateTransferFile> {
  return requestJson(`/api/document-templates/${encodeURIComponent(id)}/transfer`, { method: "POST", body: JSON.stringify({ revision }) });
}
type Picked = { status: "cancelled" } | { status: "selected"; fileName: string; content: string };
export async function pickTemplateTransfer(): Promise<Picked> {
  if (isTauriRuntime()) return invoke("pick_document_template");
  // Browser development adapter only. Native apps always read through Rust/ContentResolver.
  return new Promise((resolve, reject) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".json,application/json";
    input.oncancel = () => resolve({ status: "cancelled" });
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) { resolve({ status: "cancelled" }); return; }
      if (file.size > 16 * 1024 * 1024) { reject(new Error("El archivo de plantilla supera 16 MiB")); return; }
      void file.arrayBuffer().then(buffer => resolve({ status: "selected", fileName: file.name, content: new TextDecoder("utf-8", { fatal: true }).decode(buffer) })).catch(reject);
    };
    input.click();
  });
}
export async function deliverTemplateTransfer(id: string, revision: string): Promise<DocumentTemplateTransferReceipt> {
  if (isTauriRuntime()) return invoke("export_document_template", { id, revision });
  const file = await prepareTemplateTransfer(id, revision);
  return downloadTemplateFile(file);
}
function downloadTemplateFile(file:DocumentTemplateTransferFile):DocumentTemplateTransferReceipt{
  const url = URL.createObjectURL(new Blob([file.content], { type: "application/json;charset=utf-8" }));
  try { const link = document.createElement("a"); link.href = url; link.download = file.fileName; link.click(); }
  finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return { status: "download-requested", fileName: file.fileName, byteLength: file.byteLength };
}
export function prepareTemplateCatalog(entries:TemplateCatalogExportSelection):Promise<DocumentTemplateTransferFile>{
  if(!isTauriRuntime())return Promise.reject(new Error("Compartir catálogos requiere la aplicación nativa. Las plantillas se conservan."));
  return requestJson("/api/document-templates/transfer/catalog/export",{method:"POST",body:JSON.stringify({entries})});
}
export async function deliverTemplateCatalog(entries:TemplateCatalogExportSelection):Promise<DocumentTemplateTransferReceipt>{
  if(!isTauriRuntime())throw new Error("La entrega de catálogos requiere la aplicación nativa.");
  return invoke("export_document_template_catalog",{entries});
}
export function reviewTemplateCatalog(content:string,digest:string,entries:TemplateCatalogSelection):Promise<TemplateCatalogResult>{
  if(!isTauriRuntime())return Promise.reject(new Error("La revisión de catálogos requiere la aplicación nativa."));
  return requestJson("/api/document-templates/transfer/catalog/review",{method:"POST",body:JSON.stringify({content,digest,entries})});
}
export function importTemplateCatalog(content:string,digest:string,entries:TemplateCatalogSelection,reviewedResources=false):Promise<TemplateCatalogResult>{
  if(!isTauriRuntime())return Promise.reject(new Error("La importación de catálogos requiere la aplicación nativa."));
  return requestJson("/api/document-templates/transfer/catalog/import",{method:"POST",body:JSON.stringify({content,digest,entries,...(reviewedResources?{reviewedResources:true}:{})})});
}
