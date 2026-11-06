import {requestJson} from "./client";
import {deliverMixedRetirement} from "./mixedRetirementDelivery";
import type {MixedRetirement} from "../../types/mixedRetirement";
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/i.test(v);
const size = (v: unknown, max: number) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
function validate(value: MixedRetirement, project: string, plan: string) {
  if (!value || value.schemaVersion !== 1 || value.projectId !== project || value.planId !== plan || !hash(value.revision) || !hash(value.archiveSha256) || !size(value.archiveBytes, 40*1024*1024) || !value.archiveBytes || !["available", "partial", "retired"].includes(value.phase) || !size(value.totalCount, 1024) || !value.totalCount || !size(value.remainingCount, value.totalCount) || !size(value.remainingBytes, 128*1024*1024) || value.canRetire !== (value.remainingCount > 0) || (value.phase === "retired") !== (value.remainingCount === 0) || value.phase === "available" && value.remainingCount !== value.totalCount || value.remainingCount === 0 && value.remainingBytes !== 0 || value.receiptsPreserved !== true || value.identitiesPreserved !== true || value.projectFilesUnchanged !== true || !Number.isFinite(Date.parse(value.checkedAt))) {
    throw Error("La respuesta no identifica la retirada de estas copias. Consulta sin repetir.");
  }
  return value;
}
export async function reviewMixedRetirement(project: string, plan: string) {
  return validate(await requestJson<MixedRetirement>(`/api/projects/${encodeURIComponent(project)}/sync/mixed-selections/${encodeURIComponent(plan)}/application/retirement`), project, plan);
}
export async function retireMixedPayloads(review: MixedRetirement) {
  if (!review.canRetire || !hash(review.revision)) throw Error("Revisa las copias pendientes antes de retirar.");
  try {
    const value = await deliverMixedRetirement(review.projectId, review.planId, review.revision) as {schemaVersion: number; projectId: string; planId: string; requestRevision: string; status: string; review?: MixedRetirement; requestId: string; completedAt: string};
    if (!value || value.schemaVersion !== 1 || value.projectId !== review.projectId || value.planId !== review.planId || value.requestRevision !== review.revision || !value.requestId || !Number.isFinite(Date.parse(value.completedAt)) || !["cancelled", "completed"].includes(value.status)) throw Error("No se confirmó esta retirada.");
    if (value.status === "cancelled") return {review, observed: false, cancelled: true};
    const next = validate(value.review!, review.projectId, review.planId);
    if (next.phase !== "retired" || next.archiveSha256 !== review.archiveSha256 || next.totalCount !== review.totalCount) throw Error("No se confirmó el conjunto retirado.");
    return {review: next, observed: false, cancelled: false};
  } catch (error) {
    // Native picker failures can follow partial deletion: observe once, never replay.
    try { return {review: await reviewMixedRetirement(review.projectId, review.planId), observed: true, cancelled: false}; }
    catch { throw error; }
  }
}
