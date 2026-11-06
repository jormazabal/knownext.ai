import { expect, it } from "vitest";
import { aiResponseContinuityIssue, bindAiProposalReview, buildAiReviewRecord, captureAiRequest, resolveAiProposalRecovery } from "./aiResponseContinuity";
import { createLoadedDocumentSession, applyLocalMarkdownEdit } from "./documentSessions";
import { createLoadedHandwrittenNoteSession, applyLocalHandwrittenNoteEdit } from "./handwrittenSessions";
import { createDefaultHandwrittenContent } from "../features/handwritten/handwrittenModel";
import type { AiInteractionResponse } from "../types/domain";

const project = { id: "project", name: "QA" };
const doc = createLoadedDocumentSession({ id: "project:doc.md", projectId: "project", name: "doc.md", path: "doc.md", markdown: "Original", diskMarkdown: "Original", wordCount: 1, updatedAt: "2026-10-31T00:00:00Z" });
const response = (patch: Partial<AiInteractionResponse> = {}): AiInteractionResponse => ({ interactionId: "result", status: "completed", display: "bubble", uiPlacement: "document_bubble", interactionType: "chat", confidence: "high", executionMode: "quick", reasoningDepth: "light", routeToAiTab: false, needsUserClarification: false, conversationEvents: [], operations: [], affectedDocuments: [], ...patch });
function fixture() {
  const documents = { [doc.document!.id]: doc };
  const current = { projectId: project.id, projectEpoch: 1, documents, handwritten: {}, notes: "Personal notes" };
  return { current, request: captureAiRequest(project, 1, doc.document!.id, documents, {}, current.notes) };
}
it("binds proposal base and recovery only to the request and native receipt", () => {
  const f=fixture(); const proposal={id:"p",projectId:project.id,interactionId:"result",status:"proposed" as const,title:"Edit",summary:"Edit",scope:"document" as const,createdAt:"now",updatedAt:"now",recovery:{stored:true},operations:[{id:"op",action:"replace_document" as const,documentId:doc.document!.id,summary:"Edit",confidence:"high" as const,markdown:"Output",expectedMarkdown:"Model base",documentLabel:"Model label"}]};
  const bound=bindAiProposalReview(response({editProposal:proposal}),f.request,false).editProposal!;
  expect(bound.recovery).toBeUndefined();expect(bound.requiresConfirmation).toBe(true);expect(bound.operations[0].expectedMarkdown).toBe("Original");expect(bound.operations[0].documentLabel).toBe("doc.md");
  const retained=buildAiReviewRecord({id:"result",receivedAt:"now",reason:"Manual",request:f.request,response:response({editProposal:proposal})});
  const failed=bindAiProposalReview(response({editProposal:proposal,requiresEditConfirmation:false,retainedResult:{stored:false,error:"Store full",result:retained}}),f.request,true).editProposal!;
  expect(failed.recovery).toEqual({resultId:retained.id,stored:false,error:"Store full"});expect(failed.requiresConfirmation).toBe(true);
  expect(resolveAiProposalRecovery(failed,[{result:{id:retained.id},stored:true}],false)?.recovery).toEqual({resultId:retained.id,stored:true});
  expect(resolveAiProposalRecovery(failed,[],true)?.recovery).toEqual({resultId:retained.id,stored:false,removed:true});
});
it("keeps unchanged edits applicable and does not bind a result to the visible tab", () => {
  const f = fixture();
  expect(aiResponseContinuityIssue(f.request, response({ updatedDocument: { documentId: doc.document!.id, markdown: "Proposal", summary: "Edit" } }), f.current)).toBeNull();
  expect(aiResponseContinuityIssue(f.request, response({ answer: "Read-only answer" }), { ...f.current, documents: {} })).toBeNull();
});
it("preserves newer typing, missing sessions and unresolved conflicts", () => {
  const f = fixture(), updated = response({ updatedDocument: { documentId: doc.document!.id, markdown: "Proposal", summary: "Edit" } });
  for (const documents of [{ [doc.document!.id]: applyLocalMarkdownEdit(doc, "New typing") }, {}, { [doc.document!.id]: { ...doc, orphaned: true } }]) {
    expect(aiResponseContinuityIssue(f.request, updated, { ...f.current, documents })).toBeTruthy();
  }
  expect(f.request.markdown[doc.document!.id]).toBe("Original");
});
it("defers another project and a project switched away and back", () => {
  const f = fixture();
  expect(aiResponseContinuityIssue(f.request, response(), { ...f.current, projectId: "different" })).toContain("proyecto");
  expect(aiResponseContinuityIssue(f.request, response(), { ...f.current, projectEpoch: 3 })).toContain("proyecto");
});
it("checks notes and every proposed document including unopened targets", () => {
  const f = fixture();
  expect(aiResponseContinuityIssue(f.request, response({ updatedDocument: { documentId: "user-notes", markdown: "Old notes result", summary: "Edit" } }), { ...f.current, notes: "New personal text" })).toBeTruthy();
  const proposal = { id: "p", projectId: "project", interactionId: "result", status: "proposed" as const, title: "Edit", summary: "Edit", scope: "project" as const, createdAt: "now", updatedAt: "now", operations: [{ id: "op", action: "replace_document" as const, documentId: "project:unopened.md", summary: "Edit", confidence: "high" as const, markdown: "Output" }] };
  expect(aiResponseContinuityIssue(f.request, response({ editProposal: proposal }), f.current)).toBeTruthy();
});
it("preserves new strokes even when the saved file has not changed", () => {
  const content = createDefaultHandwrittenContent("project:note.knote");
  const session = createLoadedHandwrittenNoteSession({ id: content.id, projectId: "project", name: "note.knote", path: "note.knote", content, pageCount: 1, updatedAt: content.updatedAt });
  const handwritten = { [content.id]: session };
  const request = captureAiRequest(project, 1, content.id, {}, handwritten, "");
  const updated = response({ updatedHandwrittenNote: { noteId: content.id, content: { ...content, title: "AI proposal" }, summary: "Drawing" } });
  expect(aiResponseContinuityIssue(request, updated, { projectId: project.id, projectEpoch: 1, documents: {}, handwritten, notes: "" })).toBeNull();
  expect(aiResponseContinuityIssue(request, updated, { projectId: project.id, projectEpoch: 1, documents: {}, handwritten: { [content.id]: applyLocalHandwrittenNoteEdit(session, { ...content, title: "New strokes" }) }, notes: "" })).toContain("trazos");
});
it("conserves outputs without copying the user conversation or request snapshots", () => {
  const f = fixture();
  const result = buildAiReviewRecord({ id: "result", receivedAt: "2026-10-31T10:00:00Z", reason: "New typing", request: f.request, response: response({ originProjectRootHash: "a".repeat(64), updatedDocument: { documentId: doc.document!.id, markdown: "Output", summary: "Generated edit" }, conversationEvents: [{ id: "user", projectId: "project", type: "user_message", role: "user", content: "PRIVATE PROMPT", createdAt: "now", paths: [] }], operations: [{ type: "document_created", status: "completed", message: "Created", path: "Created.md", paths: ["Created.md"], runtimeApplied: true }] }) });
  expect(result.outputs[0]).toMatchObject({ kind: "markdown", markdown: "Output" });
  expect(result.appliedPaths).toEqual(["Created.md"]); expect(result.originProjectRootHash).toBe("a".repeat(64));
  expect(JSON.stringify(result)).not.toContain("PRIVATE PROMPT"); expect(JSON.stringify(result)).not.toContain("Original");
});
