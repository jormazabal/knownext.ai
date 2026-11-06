import {requestJson} from "./client";
import type {PreviewCleanupEntry,PreviewCleanupInventory,PreviewCleanupResult} from "../../types/previewCleanup";
export function getPreviewCleanupInventory(){return requestJson<PreviewCleanupInventory>("/api/storage/preview-cleanup");}
export function cleanupPreviewReceipts(entries:Array<Pick<PreviewCleanupEntry,"id"|"revision">>){
  return requestJson<PreviewCleanupResult>("/api/storage/preview-cleanup",{method:"POST",body:JSON.stringify({entries})});
}
