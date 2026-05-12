import { describe, expect, it } from "vitest";
import {
  applyExternalMarkdownUpdate,
  createLoadedDocumentSession,
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
    expect(shouldPersistDraft(session)).toBe(false);
  });

  it("marks an edited session as needing draft persistence", () => {
    const session = createLoadedDocumentSession({ ...baseDocument, hasDraft: false, isDirty: false, diskMarkdown: null });
    const sessions: Record<string, DocumentSession> = { "doc-a": session };
    const nextSessions = updateSession(sessions, "doc-a", {
      markdown: "# Draft\n\nNew",
      isDirty: true,
    });

    expect(shouldPersistDraft(nextSessions["doc-a"])).toBe(true);
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
