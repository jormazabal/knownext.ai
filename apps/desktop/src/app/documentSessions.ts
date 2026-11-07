import type { DocumentConflictStatus, DocumentFingerprint, DocumentRecord } from "../types/domain";
import type { MarkdownEditorChangeSource } from "../features/editor/editorTypes";

export type PendingSaveReason = "opened";

export function sameDocumentRevision(current: DocumentSession | undefined, expected: DocumentSession): boolean {
  return !!current && current.markdown === expected.markdown && current.savedMarkdown === expected.savedMarkdown
    && current.document === expected.document && current.loadVersion === expected.loadVersion;
}

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
  draftWriteRevision?: string | null;
  draftWriteConflict?: boolean;
  conflictStatus: DocumentConflictStatus;
  diskChanged: boolean;
  orphaned: boolean;
  hasRecoveredDraft: boolean;
  draftUpdatedAt?: string | null;
  pendingDraftDiscard: boolean;
  pendingSaveReason: PendingSaveReason | null;
  pendingLoad?: { requestId: number; markdown: string; savedMarkdown: string; document: DocumentRecord | null; nextVersion: number };
  loadError?: string;
};

export function beginDocumentLoad(session: DocumentSession | undefined, requestId: number, force: boolean): DocumentSession {
  const current = session ?? createEmptyDocumentSession(0);
  return { ...current, loadError: undefined, isLoading: true,
    pendingLoad: { requestId, markdown: current.markdown, savedMarkdown: current.savedMarkdown, document: current.document, nextVersion: current.loadVersion + (force ? 1 : 0) } };
}

/** A response belongs to one load and cannot replace edits, saves, or a removed session. */
export function settleDocumentLoad(session: DocumentSession | undefined, requestId: number, record?: DocumentRecord): DocumentSession | undefined {
  const pending = session?.pendingLoad;
  if (!session || pending?.requestId !== requestId) return session;
  const { pendingLoad: _pending, ...current } = session;
  const changed = session.markdown !== pending.markdown || session.savedMarkdown !== pending.savedMarkdown || session.document !== pending.document;
  if (record && !changed) return createLoadedDocumentSession(record, { ...current, loadVersion: pending.nextVersion });
  return { ...current, isLoading: false, loadError: record ? undefined : "No se pudo cargar el documento. El contenido abierto se conserva." };
}

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

/** Disk observations belong to one loaded base; typing alone does not invalidate them. */
export function acceptsDocumentSyncObservation(current:DocumentSession|undefined,reviewed:DocumentSession|undefined):boolean{
  return Boolean(current?.document&&reviewed?.document&&!current.isLoading&&current.document.id===reviewed.document.id&&current.loadVersion===reviewed.loadVersion&&current.savedMarkdown===reviewed.savedMarkdown&&current.baseFingerprint?.sha256===reviewed.baseFingerprint?.sha256&&current.baseFingerprint?.size===reviewed.baseFingerprint?.size);
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
    draftWriteRevision: record.draftWriteRevision ?? null,
    draftWriteConflict: Boolean(record.draftWriteConflict),
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

/** A save acknowledges its submitted revision; it must never replace newer typing. */
export function acknowledgeDocumentSave(session: DocumentSession, saved: DocumentRecord, submittedMarkdown: string): DocumentSession {
  const editedDuringSave = session.markdown !== submittedMarkdown;
  const markdown = editedDuringSave ? session.markdown : saved.markdown;
  const dirty = !markdownMatchesSaved(markdown, saved.markdown);
  return {
    ...session,
    document: { ...saved, wordCount: countWords(markdown) },
    markdown,
    savedMarkdown: saved.markdown,
    isDirty: dirty,
    saveState: dirty ? "idle" : "saved",
    baseFingerprint: saved.baseFingerprint,
    savedContentHash: saved.savedContentHash ?? saved.diskContentHash ?? null,
    draftContentHash: dirty ? session.draftContentHash : null,
    draftWriteRevision: saved.draftWriteConflict ? session.draftWriteRevision : saved.draftWriteRevision ?? null,
    draftWriteConflict: Boolean(saved.draftWriteConflict),
    lastDraftMarkdown: saved.markdown,
    conflictStatus: "none",
    diskChanged: false,
    orphaned: false,
    hasRecoveredDraft: dirty ? session.hasRecoveredDraft : false,
    draftUpdatedAt: dirty ? session.draftUpdatedAt : null,
    pendingDraftDiscard: false,
    pendingSaveReason: null,
  };
}

export function acknowledgeDocumentRestore(session: DocumentSession, saved: DocumentRecord, chosen: DocumentSession): DocumentSession {
  const restored = acknowledgeDocumentSave(session, saved, chosen.markdown);
  return { ...restored, loadVersion: session.loadVersion + (sameDocumentRevision(session, chosen) ? 1 : 0) };
}

export function shouldPersistDraft(session: DocumentSession, forceProtection = false) {
  return Boolean(
    session.document &&
    !session.isLoading &&
    session.isDirty &&
      (forceProtection || session.markdown !== session.lastDraftMarkdown),
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
  return markdown.replace(/<[^>\n]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

export function markdownMatchesSaved(markdown: string, savedMarkdown: string) {
  return normalizeMarkdownForDirtyCheck(markdown) === normalizeMarkdownForDirtyCheck(savedMarkdown);
}

function normalizeMarkdownForDirtyCheck(markdown: string) {
  return markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/g, "");
}
