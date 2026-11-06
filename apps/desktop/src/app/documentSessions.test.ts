import { describe, expect, it } from "vitest";
import {
  acknowledgeDocumentSave,
  sameDocumentRevision,
  acknowledgeDocumentRestore,
  beginDocumentLoad,
  settleDocumentLoad,
  applyExternalMarkdownUpdate,
  applyLocalMarkdownEdit,
  createLoadedDocumentSession,
  shouldDiscardPersistedDraft,
  shouldPersistDraft,
  updateSession,
  type DocumentSession,
} from "./documentSessions";
import type { DocumentRecord } from "../types/domain";

const baseDocument: DocumentRecord = {
  id: "doc-a",
  name: "doc-a.md",
  path: "doc-a.md",
  projectId: "project-a",
  markdown: "# Draft",
  diskMarkdown: "# Disk",
  wordCount: 2,
  updatedAt: "2026-05-09T00:00:00Z",
  hasDraft: true,
  isDirty: true,
  conflictStatus: "draft",
  baseFingerprint: { mtimeNs: 1, size: 6, sha256: "abc" },
};

describe("documentSessions", () => {
  it("reprotects an acknowledged empty draft after uncertain deletion without persisting clean or loading sessions",()=>{
    const dirty=createLoadedDocumentSession({...baseDocument,markdown:"",hasDraft:true,isDirty:true});
    expect(shouldPersistDraft(dirty)).toBe(false);expect(shouldPersistDraft(dirty,true)).toBe(true);
    expect(shouldPersistDraft({...dirty,isDirty:false},true)).toBe(false);
    expect(shouldPersistDraft({...dirty,isLoading:true},true)).toBe(false);
  });
  it("restores the chosen saved content while retaining typing made during restoration", () => {
    const chosen = createLoadedDocumentSession(baseDocument);
    const saved = { ...baseDocument,markdown:"# Historical version",diskMarkdown:"# Historical version",hasDraft:false,isDirty:false };
    const clean = acknowledgeDocumentRestore(chosen,saved,chosen);
    expect(clean.markdown).toBe("# Historical version");
    expect(clean.isDirty).toBe(false);expect(clean.loadVersion).toBe(chosen.loadVersion+1);
    const typing = applyLocalMarkdownEdit(chosen,"New typing during restore");
    const result = acknowledgeDocumentRestore(typing,saved,chosen);
    expect(result.markdown).toBe("New typing during restore");
    expect(result.savedMarkdown).toBe("# Historical version");
    expect(result.isDirty).toBe(true);expect(result.loadVersion).toBe(typing.loadVersion);
    expect(shouldPersistDraft(result)).toBe(true);
  });
  it("requires a new discard decision when edits or a save arrive while waiting", () => {
    const chosen = createLoadedDocumentSession(baseDocument);
    expect(sameDocumentRevision({ ...chosen, saveState: "saving" }, chosen)).toBe(true);
    expect(sameDocumentRevision(applyLocalMarkdownEdit(chosen, "New typing"), chosen)).toBe(false);
    expect(sameDocumentRevision(acknowledgeDocumentSave(chosen, { ...baseDocument, markdown: "Saved later" }, "Saved later"), chosen)).toBe(false);
    expect(sameDocumentRevision(undefined, chosen)).toBe(false);
    expect(sameDocumentRevision({ ...chosen, loadVersion: chosen.loadVersion + 1 }, chosen)).toBe(false);
  });
  it("rejects a late load after typing, saving, closing or superseding the request", () => {
    const loading = beginDocumentLoad(createLoadedDocumentSession(baseDocument), 1, true);
    expect(loading.loadVersion).toBe(0); // Do not remount a live editor before the response.
    expect(settleDocumentLoad(loading, 1, baseDocument)?.loadVersion).toBe(1);
    const typed = applyLocalMarkdownEdit(loading, "Newer typing");
    expect(settleDocumentLoad(typed, 1, baseDocument)?.markdown).toBe("Newer typing");
    expect(settleDocumentLoad(typed, 1, baseDocument)?.isLoading).toBe(false);
    expect(settleDocumentLoad(typed, 1, baseDocument)?.loadVersion).toBe(0);
    const saved = acknowledgeDocumentSave(loading, { ...baseDocument, markdown: "Newer saved", diskMarkdown: "Newer saved" }, loading.markdown);
    expect(settleDocumentLoad(saved, 1, baseDocument)?.savedMarkdown).toBe("Newer saved");
    expect(settleDocumentLoad(undefined, 1, baseDocument)).toBeUndefined();
    const newer = beginDocumentLoad(loading, 2, true);
    expect(settleDocumentLoad(newer, 1, baseDocument)).toBe(newer);
    expect(settleDocumentLoad(newer, 1)).toBe(newer);
    expect(settleDocumentLoad(newer, 2, baseDocument)?.pendingLoad).toBeUndefined();
  });
  it("keeps existing content and a retryable failure instead of repeatedly loading an empty session", () => {
    const loading = beginDocumentLoad(createLoadedDocumentSession(baseDocument), 3, true);
    expect(settleDocumentLoad(loading, 3)?.markdown).toBe(baseDocument.markdown);
    expect(settleDocumentLoad(loading, 3)?.isLoading).toBe(false);
    expect(settleDocumentLoad(beginDocumentLoad(undefined, 4, false), 4)?.loadError).toBeTruthy();
    expect(beginDocumentLoad(settleDocumentLoad(loading, 3), 5, true).loadError).toBeUndefined();
  });
  it("preserves typing that happened while a save was in flight", () => {
    const original = createLoadedDocumentSession({ ...baseDocument, markdown: "submitted", diskMarkdown: "old", hasDraft: false, isDirty: false });
    const current = applyLocalMarkdownEdit(original, "submitted plus new typing");
    const saved = { ...baseDocument, markdown: "submitted", savedContentHash: "saved-revision" };
    const acknowledged = acknowledgeDocumentSave(current, saved, "submitted");
    expect(acknowledged.markdown).toBe("submitted plus new typing");
    expect(acknowledged.savedMarkdown).toBe("submitted");
    expect(acknowledged.isDirty).toBe(true);
    expect(acknowledged.saveState).toBe("idle");
    expect(shouldPersistDraft(acknowledged)).toBe(true);
  });
  it("acknowledges an unchanged submitted revision as saved", () => {
    const session = createLoadedDocumentSession(baseDocument);
    const acknowledged = acknowledgeDocumentSave(session, { ...baseDocument, markdown: session.markdown }, session.markdown);
    expect(acknowledged.isDirty).toBe(false);
    expect(acknowledged.saveState).toBe("saved");
    expect(acknowledged.draftContentHash).toBeNull();
  });
  it("keeps disk markdown as the saved baseline when loading a recovered draft", () => {
    const session = createLoadedDocumentSession(baseDocument);

    expect(session.markdown).toBe("# Draft");
    expect(session.savedMarkdown).toBe("# Disk");
    expect(session.isDirty).toBe(true);
    expect(session.hasRecoveredDraft).toBe(true);
    expect(session.pendingSaveReason).toBe("opened");
    expect(shouldPersistDraft(session)).toBe(false);
  });

  it("marks an edited session as needing draft persistence", () => {
    const session = createLoadedDocumentSession({ ...baseDocument, hasDraft: false, isDirty: false, diskMarkdown: null });
    const sessions: Record<string, DocumentSession> = { "doc-a": session };
    const nextSessions = updateSession(sessions, "doc-a", applyLocalMarkdownEdit(session, "# Draft\n\nNew"));

    expect(shouldPersistDraft(nextSessions["doc-a"])).toBe(true);
  });

  it("does not mark a clean document dirty when the editor only normalizes final newlines", () => {
    const session = createLoadedDocumentSession({
      ...baseDocument,
      markdown: "# Clean\r\n\r\nBody\r\n",
      diskMarkdown: "# Clean\n\nBody\n\n",
      hasDraft: false,
      isDirty: false,
    });
    const updated = applyLocalMarkdownEdit(session, "# Clean\n\nBody");

    expect(session.isDirty).toBe(false);
    expect(updated.isDirty).toBe(false);
    expect(shouldPersistDraft(updated)).toBe(false);
  });

  it("marks an initial editor normalization as a pending save opened from the document", () => {
    const session = createLoadedDocumentSession({ ...baseDocument, hasDraft: false, isDirty: false, diskMarkdown: null });
    const normalized = applyLocalMarkdownEdit(session, "# Draft\n\n***", "initial-normalization");

    expect(normalized.isDirty).toBe(true);
    expect(normalized.pendingSaveReason).toBe("opened");

    const userEdited = applyLocalMarkdownEdit(normalized, "# Draft\n\n***\n\nUser text");

    expect(userEdited.isDirty).toBe(true);
    expect(userEdited.pendingSaveReason).toBeNull();
  });

  it("marks a persisted draft for discard when edits return to the saved markdown", () => {
    const session = createLoadedDocumentSession({ ...baseDocument, hasDraft: false, isDirty: false, diskMarkdown: null });
    const edited = {
      ...applyLocalMarkdownEdit(session, "# Draft\n\n**Body**"),
      hasRecoveredDraft: true,
      draftUpdatedAt: "2026-06-08T20:00:00.000Z",
      draftContentHash: "draft-hash",
      lastDraftMarkdown: "# Draft\n\n**Body**",
    };

    const reverted = applyLocalMarkdownEdit(edited, "# Draft");

    expect(reverted.isDirty).toBe(false);
    expect(reverted.pendingSaveReason).toBeNull();
    expect(reverted.hasRecoveredDraft).toBe(false);
    expect(reverted.draftUpdatedAt).toBeNull();
    expect(shouldPersistDraft(reverted)).toBe(false);
    expect(shouldDiscardPersistedDraft(reverted)).toBe(true);
  });

  it("treats AI edits on an open document like local edits without remounting the editor", () => {
    const session = createLoadedDocumentSession({ ...baseDocument, hasDraft: false, isDirty: false, diskMarkdown: null });
    const updated = applyLocalMarkdownEdit(session, "# AI update\n\nVisible in editor");

    expect(updated.markdown).toBe("# AI update\n\nVisible in editor");
    expect(updated.loadVersion).toBe(session.loadVersion);
    expect(updated.isDirty).toBe(true);
    expect(updated.document?.wordCount).toBe(6);
    expect(shouldPersistDraft(updated)).toBe(true);
  });

  it("bumps the load version when markdown is replaced by an external source", () => {
    const session = createLoadedDocumentSession({ ...baseDocument, hasDraft: false, isDirty: false, diskMarkdown: null });
    const updated = applyExternalMarkdownUpdate(session, "# AI update\n\nVisible in editor");

    expect(updated.markdown).toBe("# AI update\n\nVisible in editor");
    expect(updated.loadVersion).toBe(session.loadVersion + 1);
    expect(updated.isDirty).toBe(true);
    expect(updated.document?.wordCount).toBe(6);
  });
});
