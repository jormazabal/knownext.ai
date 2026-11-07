import type { HistoryPoints, WorkspaceReview, ExportProfile, ExportProfiles, ExportBatch } from "../../types/portabilityWorkspace";
export type { HistoryPoints, WorkspaceReview, ExportProfile, ExportProfiles, ExportBatch } from "../../types/portabilityWorkspace";
import { requestJson } from "./client";
import { invokeManagedNative } from "./nativeClient";
const hash = (s: string) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
const commit = (s: string) => typeof s === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(s);
const stamp = (v: {
    schemaVersion: number;
    checkedAt: string;
}) => v?.schemaVersion === 1 && Number.isFinite(Date.parse(v.checkedAt));
function points(v: HistoryPoints, id: string) { if (!stamp(v) || v.projectId !== id || !hash(v.revision) || v.preservesFiles !== true || !Array.isArray(v.points) || v.points.length > 50 || v.points.some(p => !commit(p.id) || !Number.isFinite(Date.parse(p.date)) || typeof p.title !== "string" || typeof p.author !== "string") || typeof v.hasMore !== "boolean" || !Number.isSafeInteger(v.offset) || v.offset < 0 || v.offset > 100000 || v.selectedTip !== null && !commit(v.selectedTip))
    throw Error("Puntos de consulta no verificables."); return v; }
export async function getHistoryPoints(id: string, offset = 0) { return points(await requestJson<HistoryPoints>(`/api/projects/${encodeURIComponent(id)}/history-points?offset=${offset}`), id); }
export async function selectHistoryPoint(value: HistoryPoints, tip: string | null) { if (tip !== null && !commit(tip))
    throw Error("Punto de consulta no válido."); return points(await requestJson<HistoryPoints>(`/api/projects/${encodeURIComponent(value.projectId)}/history-points`, { method: "POST", body: JSON.stringify({ revision: value.revision, tip, acknowledge: true }) }), value.projectId); }
export const workspaceFamilies = ["groups", "milestones", "favorites", "exportStyle", "exportProfiles"] as const;
export async function reviewWorkspace(id: string, families: string[]) { const v = await requestJson<WorkspaceReview>(`/api/projects/${encodeURIComponent(id)}/portable-workspace/review`, { method: "POST", body: JSON.stringify({ families }) }); if (!stamp(v) || v.projectId !== id || !hash(v.revision) || v.preservesFiles !== true || v.startsAi !== false || v.personalDataIsArchivedOnly !== true || JSON.stringify(v.families) !== JSON.stringify(families) || !Array.isArray(v.items) || v.items.some(x => !workspaceFamilies.includes(x.id as never) || typeof x.changed !== "boolean" || !Number.isSafeInteger(x.currentBytes) || !Number.isSafeInteger(x.resultBytes)))
    throw Error("El estado del trabajo requiere otra revisión."); return v; }
export async function applyWorkspace(v: WorkspaceReview) { const r = await requestJson<{
    schemaVersion: 1;
    projectId: string;
    revision: string;
    status: string;
    families: string[];
    checkedAt: string;
    preservesFiles: true;
    startsAi: false;
}>(`/api/projects/${encodeURIComponent(v.projectId)}/portable-workspace/apply`, { method: "POST", body: JSON.stringify({ families: v.families, revision: v.revision, acknowledge: true }) }); if (!stamp(r) || r.projectId !== v.projectId || r.revision !== v.revision || r.status !== "applied" || r.preservesFiles !== true || r.startsAi !== false)
    throw Error("El resultado no está confirmado. Consulta sin repetir."); return r; }
export async function getExportProfiles() { const v = await requestJson<ExportProfiles>("/api/export-profiles"); if (!stamp(v) || v.revision !== null && !hash(v.revision) || !Array.isArray(v.profiles) || v.profiles.length > 32 || v.profiles.some(p => !p.id.startsWith("export-profile-") || !p.name || typeof p.cover !== "boolean" || typeof p.contents !== "boolean"))
    throw Error("Perfiles no compatibles."); return v; }
export async function changeExportProfiles(v: ExportProfiles, body: {
    action: "capture" | "remove";
    id: string;
    name?: string;
    cover?: boolean;
    contents?: boolean;
}) { await requestJson("/api/export-profiles", { method: "POST", body: JSON.stringify({ revision: v.revision, ...body }) }); return getExportProfiles(); }
function batch(v: ExportBatch, projectId?: string, id?: string) { if (projectId && v.projectId !== projectId || id && v.id !== id || !stamp(v) || !v.id.startsWith("export-batch-") || !hash(v.revision) || !hash(v.archiveSha256) || !Number.isSafeInteger(v.archiveBytes) || v.archiveBytes < 0 || v.archiveBytes > 512 * 1024 ** 2 || v.frozen !== true || v.includesConfirmedDrafts !== true || !Array.isArray(v.documents) || v.documents.length < 1 || v.documents.length > 32 || v.documents.some(d => !hash(d.sha256) || !d.filename || !Number.isSafeInteger(d.bytes) || d.bytes < 0) || !["prepared", "picking", "saved", "cancelled", "uncertain", "discarded"].includes(v.phase))
    throw Error("El lote requiere una revisión nueva."); return v; }
export async function prepareExportBatch(id: string, documents: Array<{
    id: string;
    diagramAssets?: unknown;
    markdown?: string;
}>, format: string, profileId: string | null) { return batch(await requestJson<ExportBatch>(`/api/projects/${encodeURIComponent(id)}/export-batches`, { method: "POST", body: JSON.stringify({ documents, format, profileId }) }), id); }
export async function getExportBatches(id: string) { const v = await requestJson<{
    schemaVersion: 1;
    projectId: string;
    items: ExportBatch[];
    checkedAt: string;
}>(`/api/projects/${encodeURIComponent(id)}/export-batches`); if (!stamp(v) || v.projectId !== id || !Array.isArray(v.items) || v.items.length > 2048)
    throw Error("No se pueden verificar los lotes conservados."); return v.items.map(item => batch(item, id)); }
export async function getExportBatch(id: string) { return batch(await requestJson<ExportBatch>(`/api/export-batches/${encodeURIComponent(id)}`), undefined, id); }
export async function deliverExportBatch(v: ExportBatch) { const next = batch(await invokeManagedNative<ExportBatch>("export_document_batch", { id: v.id, revision: v.revision }), v.projectId, v.id); if (next.revision !== v.revision)
    throw Error("El lote cambió; consulta antes de repetir."); return next; }
export async function discardExportBatch(v: ExportBatch) { const next = batch(await requestJson<ExportBatch>(`/api/export-batches/${encodeURIComponent(v.id)}`, { method: "DELETE", body: JSON.stringify({ revision: v.revision, acknowledge: true }) }), v.projectId, v.id); if (next.revision !== v.revision)
    throw Error("El lote cambió; consulta antes de repetir."); return next; }
