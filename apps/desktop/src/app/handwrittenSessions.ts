import type { DocumentConflictStatus, HandwrittenNoteContent, HandwrittenNoteRecord } from "../types/domain";

export function sameHandwrittenRevision(current: HandwrittenNoteSession | undefined, expected: HandwrittenNoteSession): boolean {
  return !!current && current.content === expected.content && current.savedContent === expected.savedContent
    && current.note === expected.note && current.loadVersion === expected.loadVersion;
}

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
  draftWriteRevision?: string | null;
  draftWriteConflict?: boolean;
  conflictStatus: DocumentConflictStatus;
  diskChanged: boolean;
  orphaned: boolean;
  hasRecoveredDraft: boolean;
  draftUpdatedAt?: string | null;
  pendingDraftDiscard: boolean;
  pendingLoad?: { requestId: number; content: string; savedContent: string; note: HandwrittenNoteRecord | null; nextVersion: number };
  loadError?: string;
};

export function beginHandwrittenLoad(session: HandwrittenNoteSession | undefined, requestId: number, force: boolean): HandwrittenNoteSession {
  const current = session ?? createEmptyHandwrittenNoteSession(0);
  return { ...current, loadError: undefined, isLoading: true, pendingLoad: {
    requestId, note: current.note, nextVersion: current.loadVersion + (force ? 1 : 0), content: current.content ? stringifyHandwrittenContent(current.content) : "",
    savedContent: current.savedContent ? stringifyHandwrittenContent(current.savedContent) : "",
  } };
}

export function settleHandwrittenLoad(session: HandwrittenNoteSession | undefined, requestId: number, record?: HandwrittenNoteRecord): HandwrittenNoteSession | undefined {
  const pending = session?.pendingLoad;
  if (!session || pending?.requestId !== requestId) return session;
  const { pendingLoad: _pending, ...current } = session;
  const changed = session.note !== pending.note || (session.content ? stringifyHandwrittenContent(session.content) : "") !== pending.content
    || (session.savedContent ? stringifyHandwrittenContent(session.savedContent) : "") !== pending.savedContent;
  if (record && !changed) return createLoadedHandwrittenNoteSession(record, { ...current, loadVersion: pending.nextVersion });
  return { ...current, isLoading: false, loadError: record ? undefined : "No se pudo cargar la nota. Los trazos abiertos se conservan." };
}

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
    draftWriteRevision: record.draftWriteRevision ?? null,
    draftWriteConflict: Boolean(record.draftWriteConflict),
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

export function shouldPersistHandwrittenDraft(session: HandwrittenNoteSession, forceProtection = false) {
  if (!session.note || !session.content || session.isLoading || !session.isDirty) return false;
  return forceProtection || stringifyHandwrittenContent(session.content) !== session.lastDraftContentJson;
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

export function acknowledgeHandwrittenSave(session: HandwrittenNoteSession, saved: HandwrittenNoteRecord, submitted: HandwrittenNoteContent): HandwrittenNoteSession {
  const edited = Boolean(session.content && stringifyHandwrittenContent(session.content) !== stringifyHandwrittenContent(submitted));
  const content = edited ? session.content! : saved.content;
  const dirty = !handwrittenContentMatchesSaved(content, saved.content);
  return {
    ...session, note: saved, content, savedContent: saved.content,
    isDirty: dirty, saveState: dirty ? "idle" : "saved",
    lastDraftContentJson: stringifyHandwrittenContent(saved.content),
    baseFingerprint: saved.baseFingerprint,
    savedContentHash: saved.savedContentHash ?? saved.diskContentHash ?? null,
    draftContentHash: dirty ? session.draftContentHash : null,
    draftWriteRevision: saved.draftWriteConflict ? session.draftWriteRevision : saved.draftWriteRevision ?? null,
    draftWriteConflict: Boolean(saved.draftWriteConflict),
    conflictStatus: "none", diskChanged: false, orphaned: false,
    hasRecoveredDraft: dirty ? session.hasRecoveredDraft : false,
    draftUpdatedAt: dirty ? session.draftUpdatedAt : null, pendingDraftDiscard: false,
  };
}

export function stringifyHandwrittenContent(content: HandwrittenNoteContent) {
  const { toolPresets: _toolPresets, ...contentWithoutGlobalPresets } = content;
  return JSON.stringify(contentWithoutGlobalPresets);
}
