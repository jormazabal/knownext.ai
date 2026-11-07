import { requestJson } from "./client";
import { isTauriRuntime } from "../runtime/platform";
import type { StorageUsage } from "../../types/storageUsage";

export function getStorageUsage(): Promise<StorageUsage> {
  if (!isTauriRuntime()) throw new Error("La consulta del almacenamiento requiere la aplicación nativa de Windows o Android.");
  return requestJson("/api/storage/usage");
}
