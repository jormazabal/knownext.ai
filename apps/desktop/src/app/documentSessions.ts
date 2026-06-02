import type { DocumentConflictStatus, DocumentFingerprint, DocumentRecord } from "../types/domain";

export type DocumentSession = {
  document: DocumentRecord | null;
  markdown: string;
  savedMarkdown: string;
  isDirty: boolean;
  isLoading: boolean;
  saveState: "idle" | "saving" | "saved";
  loadVersion: number;
  lastDraftMarkdown: string;
  baseFingerprint?: DocumentFingerprint | null;
  conflictStatus: DocumentConflictStatus;
  diskChanged: boolean;
  orphaned: boolean;
  hasRecoveredDraft: boolean;
  draftUpdatedAt?: string | null;
};

export function createEmptyDocumentSession(loadVersion: number): DocumentSession {
  return {
    document: null,
    markdown: "",
    savedMarkdown: "",
    isDirty: false,
    isLoading: false,
    saveState: "idle",
    loadVersion,
    lastDraftMarkdown: "",
    baseFingerprint: null,
    conflictStatus: "none",
    diskChanged: false,
    orphaned: false,
    hasRecoveredDraft: false,
    draftUpdatedAt: null,
  };
}

export function createLoadedDocumentSession(record: DocumentRecord, currentSession?: DocumentSession): DocumentSession {
  const hasRecoveredDraft = Boolean(record.hasDraft || record.isDirty);
  const savedMarkdown = record.diskMarkdown ?? record.markdown;
  const dirtyMarkdown = !markdownMatchesSaved(record.markdown, savedMarkdown);

  return {
    document: record,
    markdown: record.markdown,
    savedMarkdown,
    isDirty: dirtyMarkdown || hasRecoveredDraft,
    isLoading: false,
    saveState: "idle",
    loadVersion: currentSession?.loadVersion ?? 0,
    lastDraftMarkdown: hasRecoveredDraft ? record.markdown : "",
    baseFingerprint: record.baseFingerprint,
    conflictStatus: record.conflictStatus ?? (record.diskChanged ? "disk-changed" : "none"),
    diskChanged: Boolean(record.diskChanged),
    orphaned: Boolean(record.orphaned),
    hasRecoveredDraft,
    draftUpdatedAt: record.draftUpdatedAt,
  };
}

export function updateSession(
  sessions: Record<string, DocumentSession>,
  documentId: string,
  patch: Partial<DocumentSession>,
): Record<string, DocumentSession> {
  const session = sessions[documentId];
  if (!session) return sessions;
  return {
    ...sessions,
    [documentId]: {
      ...session,
      ...patch,
    },
  };
}

export function applyExternalMarkdownUpdate(session: DocumentSession, markdown: string): DocumentSession {
  return {
    ...session,
    markdown,
    isDirty: !markdownMatchesSaved(markdown, session.savedMarkdown),
    saveState: "idle",
    loadVersion: session.loadVersion + 1,
    document: session.document ? { ...session.document, wordCount: countWords(markdown) } : session.document,
  };
}

export function applyLocalMarkdownEdit(session: DocumentSession, markdown: string): DocumentSession {
  return {
    ...session,
    markdown,
    isDirty: !markdownMatchesSaved(markdown, session.savedMarkdown),
    saveState: "idle",
    document: session.document ? { ...session.document, wordCount: countWords(markdown) } : session.document,
  };
}

export function shouldPersistDraft(session: DocumentSession) {
  return Boolean(
    session.document &&
    !session.isLoading &&
    session.isDirty &&
    session.markdown !== session.lastDraftMarkdown,
  );
}

export function countWords(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

function markdownMatchesSaved(markdown: string, savedMarkdown: string) {
  return normalizeMarkdownForDirtyCheck(markdown) === normalizeMarkdownForDirtyCheck(savedMarkdown);
}

function normalizeMarkdownForDirtyCheck(markdown: string) {
  return markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/g, "");
}
