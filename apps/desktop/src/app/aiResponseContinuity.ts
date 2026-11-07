import type { AiEditProposal, AiInteractionResponse } from "../types/domain";
import type { AiReviewOutput, AiReviewRecord } from "../types/aiResults";
import type { DocumentSession } from "./documentSessions";
import type { HandwrittenNoteSession } from "./handwrittenSessions";

/** Bind review to the submitted base and to native preservation acknowledgements only. */
export function bindAiProposalReview(response: AiInteractionResponse, request: AiRequestSnapshot, confirmBeforeApplying: boolean): AiInteractionResponse {
  if (!response.editProposal) return response;
  return { ...response, editProposal: { ...response.editProposal,
    requiresConfirmation: response.requiresEditConfirmation !== false || confirmBeforeApplying,
    recovery: response.retainedResult ? { resultId: response.retainedResult.result.id, stored: response.retainedResult.stored, ...(response.retainedResult.error ? { error: response.retainedResult.error } : {}) } : undefined,
    operations: response.editProposal.operations.map(operation => ({ ...operation, expectedMarkdown: request.markdown[operation.documentId], documentLabel: request.documentLabels[operation.documentId] ?? "Documento de destino" })),
  } };
}
/** Reflect a later preservation retry or explicit removal without changing edit authority. */
export function resolveAiProposalRecovery(proposal: AiEditProposal | null, entries: ReadonlyArray<{ result: { id: string }; stored: boolean; error?: string }>, removed: boolean): AiEditProposal | null {
  const id = proposal?.recovery?.resultId;
  if (!proposal || !id) return proposal;
  if (removed) return { ...proposal, recovery: { resultId: id, stored: false, removed: true } };
  const entry = entries.find(entry => entry.result.id === id);
  return entry ? { ...proposal, recovery: { resultId: id, stored: entry.stored, ...(entry.error ? { error: entry.error } : {}) } } : proposal;
}

export type AiRequestSnapshot = {
  projectId: string; projectName: string; projectEpoch: number; targetId: string | null;
  markdown: Record<string, string>; handwritten: Record<string, string>;
  documentLabels: Record<string, string>;
};
export type AiDeferredResponse = {
  id: string; receivedAt: string; reason: string; request: AiRequestSnapshot; response: AiInteractionResponse;
};

export function captureAiRequest(
  project: { id: string; name: string }, projectEpoch: number, targetId: string | null,
  documents: Record<string, DocumentSession>, handwritten: Record<string, HandwrittenNoteSession>, notes: string,
): AiRequestSnapshot {
  return {
    projectId: project.id, projectName: project.name, projectEpoch, targetId,
    documentLabels: { ...Object.fromEntries(Object.entries(documents).map(([id, session]) => [id, session.document?.path ?? session.document?.name ?? "Documento de destino"])), "user-notes": "Notas personales" },
    markdown: { ...Object.fromEntries(Object.entries(documents).map(([id, session]) => [id, session.markdown])), "user-notes": notes },
    handwritten: Object.fromEntries(Object.entries(handwritten).filter(([, session]) => session.content)
      .map(([id, session]) => [id, JSON.stringify(session.content)])),
  };
}

export function aiResponseContinuityIssue(
  request: AiRequestSnapshot, response: AiInteractionResponse,
  current: { projectId?: string; projectEpoch: number; documents: Record<string, DocumentSession>; handwritten: Record<string, HandwrittenNoteSession>; notes: string },
): string | null {
  if (request.projectId !== current.projectId || request.projectEpoch !== current.projectEpoch) {
    return "Cambiaste de proyecto mientras la IA trabajaba. El resultado pertenece al proyecto de origen.";
  }
  const targets = new Set([
    response.updatedDocument?.documentId, response.updatedHandwrittenNote?.noteId,
    ...(response.editProposal?.operations.map(operation => operation.documentId) ?? []),
  ].filter((id): id is string => Boolean(id)));
  for (const id of targets) {
    if (response.updatedHandwrittenNote?.noteId === id) {
      if (!Object.prototype.hasOwnProperty.call(request.handwritten, id) || request.handwritten[id] !== JSON.stringify(current.handwritten[id]?.content)) {
        return "La nota a mano cambió mientras la IA trabajaba. Se conservan tus trazos actuales.";
      }
      const session = current.handwritten[id];
      if (session.orphaned || session.conflictStatus === "disk-changed" || session.conflictStatus === "missing") return "La nota necesita resolver un conflicto antes de aplicar el resultado.";
    } else {
      const markdown = id === "user-notes" ? current.notes : current.documents[id]?.markdown;
      if (!Object.prototype.hasOwnProperty.call(request.markdown, id) || request.markdown[id] !== markdown) {
        return "El documento cambió mientras la IA trabajaba. Se conserva tu texto actual y el resultado queda para revisión.";
      }
      const session = current.documents[id];
      if (session?.orphaned || session?.conflictStatus === "disk-changed" || session?.conflictStatus === "missing") return "El documento necesita resolver un conflicto antes de aplicar el resultado.";
    }
  }
  return null;
}

export function buildAiReviewRecord(deferred: AiDeferredResponse): AiReviewRecord {
  return {
    id: `${deferred.request.projectId}:${deferred.id}`, projectId: deferred.request.projectId,
    projectName: deferred.request.projectName, receivedAt: deferred.receivedAt, reason: deferred.reason,
    answer: deferred.response.answer ?? "", outputs: aiResponseReviewOutputs(deferred.response),
    originProjectRootHash: deferred.response.originProjectRootHash,
    appliedPaths: deferred.response.operations.filter(operation => operation.runtimeApplied).flatMap(operation => operation.paths ?? (operation.path ? [operation.path] : [])),
  };
}
/** Output-only copies: never apply old offsets or replace a newer live session. */
export function aiResponseReviewOutputs(response: AiInteractionResponse): AiReviewOutput[] {
  const outputs: AiReviewOutput[] = [];
  if (response.updatedDocument) outputs.push({ id: "document", name: "Documento propuesto", summary: response.updatedDocument.summary, kind: "markdown", markdown: response.updatedDocument.markdown });
  if (response.updatedHandwrittenNote) outputs.push({ id: "handwritten", name: "Nota a mano propuesta", summary: response.updatedHandwrittenNote.summary, kind: "handwritten", content: response.updatedHandwrittenNote.content });
  for (const [index, operation] of (response.editProposal?.operations ?? []).entries()) {
    const markdown = operation.markdown ?? operation.replacementMarkdown ?? operation.diagramCode;
    if (typeof markdown === "string") outputs.push({ id: `operation-${index}-${operation.id}`, name: operation.action === "replace_document" ? "Documento propuesto" : "Fragmento propuesto", summary: operation.summary, kind: "markdown", markdown: operation.diagramCode && !operation.markdown && !operation.replacementMarkdown ? `\`\`\`mermaid\n${markdown}\n\`\`\`` : markdown });
  }
  for (const [index, image] of (response.generatedImages ?? []).entries()) {
    if (image.asset?.path) outputs.push({ id: `image-${index}`, name: "Imagen generada", summary: image.altText, kind: "markdown", markdown: `![${image.altText.replace(/[\[\]\\\r\n]/g, " ")}](${encodeURI(image.asset.path).replace(/[()]/g, char => char === "(" ? "%28" : "%29")})` });
  }
  return outputs;
}
