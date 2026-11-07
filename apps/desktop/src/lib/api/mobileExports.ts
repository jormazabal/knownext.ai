import {invokeManagedNative as invoke} from "./nativeClient";
import type { ExportDocumentPayload, HandwrittenNoteExportPayload } from "../../types/domain";
import type { MobileExportReceipt } from "../../types/exports";

export function exportMarkdownToMobile(id: string, payload: Omit<ExportDocumentPayload,"outputPath">): Promise<MobileExportReceipt> {
  return invoke("export_document_mobile",{request:{method:"POST",path:`/api/documents/${encodeURIComponent(id)}/export/content`,body:payload}});
}
export function exportHandwrittenToMobile(id: string, payload: Omit<HandwrittenNoteExportPayload,"outputPath">): Promise<MobileExportReceipt> {
  return invoke("export_document_mobile",{request:{method:"POST",path:`/api/handwritten-notes/${encodeURIComponent(id)}/export/content`,body:payload}});
}
export function openMobileExport(exportId: string): Promise<{ opened: boolean; exportId: string; completedAt: string }> {
  return invoke("open_mobile_export",{exportId});
}
