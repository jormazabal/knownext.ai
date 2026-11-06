import type { ExternalChangeSet, ProjectFileSyncItem, ProjectFileSyncOverview } from "../../types/domain";

/** Only the separately reviewed cohort may supply actionable change identities. */
export function reviewedExternalFiles(projectId: string | undefined, overview: ProjectFileSyncOverview | null, review: ExternalChangeSet | null): ProjectFileSyncItem[] {
  const files = overview && overview.projectId === projectId ? overview.files : [];
  if (!review || review.projectId !== projectId || !review.revision) return files.map(file => ({ ...file, change: null }));
  const byPath = new Map(review.items.map(item => [item.path, item]));
  const apply = (file: ProjectFileSyncItem): ProjectFileSyncItem => {
    const item = byPath.get(file.path);
    if (!item) return { ...file, change: null };
    byPath.delete(file.path);
    return { ...file, kind: item.kind, sizeBytes: item.sizeBytes, change: { itemId: item.id, changeType: item.changeType, risk: item.risk, decision: item.decision },
      historyStatus: item.risk === "blocked" ? { state: item.kind === "private" || item.kind === "ignored" ? "omitted" : "blocked", label: item.kind === "private" || item.kind === "ignored" ? "Omitido" : "Revisión necesaria", detail: item.reason || "Esta ruta se conserva fuera de la selección." } : file.historyStatus };
  };
  const result = files.map(apply);
  for (const item of byPath.values()) result.push(apply({ id: item.id, projectId: review.projectId, path: item.path, name: item.name, kind: item.kind, modifiedAt: review.detectedAt,
    localStatus: { state: "ok", label: item.changeType === "deleted" ? "Baja guardada" : "Guardado local" },
    historyStatus: { state: "pending", label: "Pendiente de historial" }, githubStatus: { state: "waiting", label: "Esperando historial" } }));
  return result;
}
