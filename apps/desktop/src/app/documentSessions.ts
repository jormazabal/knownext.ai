import type { DocumentConflictStatus, DocumentFingerprint, DocumentRecord } from "../types/domain";
import type { MarkdownEditorChangeSource } from "../features/editor/editorTypes";

export type PendingSaveReason = "opened";

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
  savedContentHash?: string | null;
  draftContentHash?: string | null;
  conflictStatus: DocumentConflictStatus;
  diskChanged: boolean;
  orphaned: boolean;
  hasRecoveredDraft: boolean;
  draftUpdatedAt?: string | null;
  pendingDraftDiscard: boolean;
  pendingSaveReason: PendingSaveReason | null;
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
    savedContentHash: null,
    draftContentHash: null,
    conflictStatus: "none",
    diskChanged: false,
    orphaned: false,
    hasRecoveredDraft: false,
    draftUpdatedAt: null,
    pendingDraftDiscard: false,
    pendingSaveReason: null,
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
    savedContentHash: record.savedContentHash ?? record.diskContentHash ?? null,
    draftContentHash: hasRecoveredDraft ? record.draftContentHash ?? null : null,
    conflictStatus: record.conflictStatus ?? (record.diskChanged ? "disk-changed" : "none"),
    diskChanged: Boolean(record.diskChanged),
    orphaned: Boolean(record.orphaned),
    hasRecoveredDraft,
    draftUpdatedAt: record.draftUpdatedAt,
    pendingDraftDiscard: false,
    pendingSaveReason: hasRecoveredDraft ? "opened" : null,
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
  const isDirty = !markdownMatchesSaved(markdown, session.savedMarkdown);
  const hadPersistedDraft = Boolean(session.hasRecoveredDraft || session.draftUpdatedAt || session.draftContentHash || session.lastDraftMarkdown);
  return {
    ...session,
    markdown,
    isDirty,
    saveState: "idle",
    loadVersion: session.loadVersion + 1,
    lastDraftMarkdown: isDirty ? session.lastDraftMarkdown : "",
    hasRecoveredDraft: isDirty ? session.hasRecoveredDraft : false,
    draftUpdatedAt: isDirty ? session.draftUpdatedAt : null,
    draftContentHash: isDirty ? session.draftContentHash : null,
    pendingDraftDiscard: isDirty ? false : hadPersistedDraft,
    pendingSaveReason: null,
    document: session.document ? { ...session.document, wordCount: countWords(markdown) } : session.document,
  };
}

export function applyLocalMarkdownEdit(session: DocumentSession, markdown: string, source: MarkdownEditorChangeSource = "user"): DocumentSession {
  const isDirty = !markdownMatchesSaved(markdown, session.savedMarkdown);
  const hadPersistedDraft = Boolean(session.hasRecoveredDraft || session.draftUpdatedAt || session.draftContentHash || session.lastDraftMarkdown);
  const pendingSaveReason = isDirty && source === "initial-normalization" ? "opened" : null;
  return {
    ...session,
    markdown,
    isDirty,
    saveState: "idle",
    lastDraftMarkdown: isDirty ? session.lastDraftMarkdown : "",
    hasRecoveredDraft: isDirty ? session.hasRecoveredDraft : false,
    draftUpdatedAt: isDirty ? session.draftUpdatedAt : null,
    draftContentHash: isDirty ? session.draftContentHash : null,
    pendingDraftDiscard: isDirty ? false : hadPersistedDraft,
    pendingSaveReason,
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

export function shouldDiscardPersistedDraft(session: DocumentSession) {
  return Boolean(
    session.document &&
    !session.isLoading &&
    !session.isDirty &&
    (session.pendingDraftDiscard || session.hasRecoveredDraft || session.draftUpdatedAt || session.draftContentHash || session.lastDraftMarkdown),
  );
}

export function countWords(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

export function markdownMatchesSaved(markdown: string, savedMarkdown: string) {
  return normalizeMarkdownForDirtyCheck(markdown) === normalizeMarkdownForDirtyCheck(savedMarkdown);
}

function normalizeMarkdownForDirtyCheck(markdown: string) {
  return markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/g, "");
}
