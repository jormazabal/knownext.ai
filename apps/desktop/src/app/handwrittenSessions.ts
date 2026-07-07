import type { DocumentConflictStatus, HandwrittenNoteContent, HandwrittenNoteRecord } from "../types/domain";

export type HandwrittenNoteSession = {
  note: HandwrittenNoteRecord | null;
  content: HandwrittenNoteContent | null;
  savedContent: HandwrittenNoteContent | null;
  isDirty: boolean;
  isLoading: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  loadVersion: number;
  lastDraftContentJson: string;
  baseFingerprint?: HandwrittenNoteRecord["baseFingerprint"] | null;
  savedContentHash?: string | null;
  draftContentHash?: string | null;
  conflictStatus: DocumentConflictStatus;
  diskChanged: boolean;
  orphaned: boolean;
  hasRecoveredDraft: boolean;
  draftUpdatedAt?: string | null;
  pendingDraftDiscard: boolean;
};

export function createEmptyHandwrittenNoteSession(loadVersion: number): HandwrittenNoteSession {
  return {
    note: null,
    content: null,
    savedContent: null,
    isDirty: false,
    isLoading: false,
    saveState: "idle",
    loadVersion,
    lastDraftContentJson: "",
    baseFingerprint: null,
    savedContentHash: null,
    draftContentHash: null,
    conflictStatus: "none",
    diskChanged: false,
    orphaned: false,
    hasRecoveredDraft: false,
    draftUpdatedAt: null,
    pendingDraftDiscard: false,
  };
}

export function createLoadedHandwrittenNoteSession(record: HandwrittenNoteRecord, currentSession?: HandwrittenNoteSession): HandwrittenNoteSession {
  const savedContent = record.diskContent ?? record.content;
  const hasRecoveredDraft = Boolean(record.hasDraft || record.isDirty);
  const dirtyContent = !handwrittenContentMatchesSaved(record.content, savedContent);

  return {
    note: record,
    content: record.content,
    savedContent,
    isDirty: dirtyContent || hasRecoveredDraft,
    isLoading: false,
    saveState: "idle",
    loadVersion: currentSession?.loadVersion ?? 0,
    lastDraftContentJson: hasRecoveredDraft ? stringifyHandwrittenContent(record.content) : "",
    baseFingerprint: record.baseFingerprint,
    savedContentHash: record.savedContentHash ?? record.diskContentHash ?? null,
    draftContentHash: hasRecoveredDraft ? record.draftContentHash ?? null : null,
    conflictStatus: record.conflictStatus ?? (record.diskChanged ? "disk-changed" : "none"),
    diskChanged: Boolean(record.diskChanged),
    orphaned: Boolean(record.orphaned),
    hasRecoveredDraft,
    draftUpdatedAt: record.draftUpdatedAt,
    pendingDraftDiscard: false,
  };
}

export function updateHandwrittenNoteSession(
  sessions: Record<string, HandwrittenNoteSession>,
  noteId: string,
  patch: Partial<HandwrittenNoteSession>,
): Record<string, HandwrittenNoteSession> {
  const session = sessions[noteId];
  if (!session) return sessions;
  return {
    ...sessions,
    [noteId]: {
      ...session,
      ...patch,
    },
  };
}

export function applyLocalHandwrittenNoteEdit(session: HandwrittenNoteSession, content: HandwrittenNoteContent): HandwrittenNoteSession {
  const savedContent = session.savedContent ?? content;
  const isDirty = !handwrittenContentMatchesSaved(content, savedContent);
  const hadPersistedDraft = Boolean(session.hasRecoveredDraft || session.draftUpdatedAt || session.draftContentHash || session.lastDraftContentJson);
  return {
    ...session,
    content,
    isDirty,
    saveState: "idle",
    lastDraftContentJson: isDirty ? session.lastDraftContentJson : "",
    hasRecoveredDraft: isDirty ? session.hasRecoveredDraft : false,
    draftUpdatedAt: isDirty ? session.draftUpdatedAt : null,
    draftContentHash: isDirty ? session.draftContentHash : null,
    pendingDraftDiscard: isDirty ? false : hadPersistedDraft,
    note: session.note ? { ...session.note, content, pageCount: content.pages.length } : session.note,
  };
}

export function shouldPersistHandwrittenDraft(session: HandwrittenNoteSession) {
  if (!session.note || !session.content || session.isLoading || !session.isDirty) return false;
  return stringifyHandwrittenContent(session.content) !== session.lastDraftContentJson;
}

export function shouldDiscardPersistedHandwrittenDraft(session: HandwrittenNoteSession) {
  return Boolean(
    session.note &&
    !session.isLoading &&
    !session.isDirty &&
    (session.pendingDraftDiscard || session.hasRecoveredDraft || session.draftUpdatedAt || session.draftContentHash || session.lastDraftContentJson),
  );
}

export function handwrittenContentMatchesSaved(content: HandwrittenNoteContent, savedContent: HandwrittenNoteContent) {
  return stringifyHandwrittenContent(content) === stringifyHandwrittenContent(savedContent);
}

export function stringifyHandwrittenContent(content: HandwrittenNoteContent) {
  const { toolPresets: _toolPresets, ...contentWithoutGlobalPresets } = content;
  return JSON.stringify(contentWithoutGlobalPresets);
}
