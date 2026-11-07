import {requestJson} from "./client";
import type {RecoveryQuotaInventory} from "../../types/recoveryQuotas";
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const families = new Set(["scheduled-backups", "conflict-attempts", "mixed-reviews", "mixed-applications", "graph-joins", "project-templates", "project-transfers", "export-batches", "history-restores", "ai-changes","project-template-catalogues","handwritten-ocr","meeting-minutes", "document-replacements"]);
export async function getRecoveryQuotas(): Promise<RecoveryQuotaInventory> {
  const value = await requestJson<RecoveryQuotaInventory>("/api/recovery/storage/quotas");
  if (!value || value.schemaVersion !== 1 || value.scope !== "known-admission-scopes-metadata" || value.cleanupAvailable !== false || !Number.isFinite(Date.parse(value.checkedAt)) || ![value.complete, value.limited, value.projectMappingComplete].every(v => typeof v === "boolean") || !value.limits || ![value.limits.entries,value.limits.scopes,value.limits.milliseconds].every(v => count(v) && v > 0) || value.limits.scopes > 200 || !Array.isArray(value.items) || value.items.length > value.limits.scopes || new Set(value.items.map(row => row?.id)).size !== value.items.length || value.items.some(row => {
    if (!row || !/^[a-f0-9]{64}$/.test(row.id) || !families.has(row.family) || ![row.entries,row.bytes,row.maxEntries,row.maxBytes].every(count) || !row.maxEntries || !row.maxBytes || typeof row.complete !== "boolean" || row.contentsVerified !== false || typeof row.idsRetainedOnPayloadRetirement !== "boolean") return true;
    const grouped = ["scheduled-backups","mixed-reviews","mixed-applications","graph-joins","history-restores","document-replacements","meeting-minutes"].includes(row.family);
    if (row.scope !== (grouped ? "project" : "profile") || (row.projectId === null) !== (row.projectName === null) || row.projectId !== null && (typeof row.projectId !== "string" || !row.projectId || typeof row.projectName !== "string" || !row.projectName) || !grouped && row.projectId !== null) return true;
    const full = row.entries >= row.maxEntries || row.bytes >= row.maxBytes;
    return row.status !== (full ? "full" : row.complete ? "observed" : "partial");
  }) || value.complete && (value.limited || value.items.some(row => !row.complete))) throw Error("Los cupos no confirman su cobertura. Consulta otra vez; los registros se conservan.");
  return value;
}
