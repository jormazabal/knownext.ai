import { describe, expect, it } from "vitest";
import {
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
