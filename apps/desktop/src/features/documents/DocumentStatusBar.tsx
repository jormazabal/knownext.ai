import { AlertCircle, CheckCircle2, FileCode2, Info, RefreshCw, RotateCcw } from "lucide-react";
import type { DocumentPostSaveSyncState, DocumentSyncStatus, RemoteAccessState } from "../../types/domain";

type DocumentStatusBarProps = {
  isDirty: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  wordCount?: number;
  kindLabel?: string;
  metricLabel?: string;
  gitEnabled: boolean;
  canSave: boolean;
  canDiscard?: boolean;
  documentSyncStatus?: DocumentSyncStatus | null;
  remoteAccess?: RemoteAccessState;
  remotePaused?: boolean;
  remoteReason?: string | null;
  isSyncing: boolean;
  postSaveSyncState?: DocumentPostSaveSyncState;
  pendingSaveHint?: string | null;
  onSave: () => void;
  onSynchronize: () => void;
  onUpdateFromRemote: () => void;
  onDiscardPendingChanges: () => void;
};

type FooterState = {
  tone: "ok" | "warning" | "danger";
  label?: string;
  detail?: string;
  showSave: boolean;
  showDiscard: boolean;
  showSync: boolean;
  showUpdate: boolean;
  busy: boolean;
};

export function DocumentStatusBar({
  isDirty,
  saveState,
  wordCount = 0,
  kindLabel = "Markdown",
  metricLabel,
  gitEnabled,
  canSave,
  canDiscard = true,
  documentSyncStatus,
  remoteAccess,
  remotePaused,
  remoteReason,
  isSyncing,
  postSaveSyncState = "idle",
  pendingSaveHint,
  onSave,
  onSynchronize,
  onUpdateFromRemote,
  onDiscardPendingChanges,
}: DocumentStatusBarProps) {
  const state = getFooterState({
    isDirty,
    saveState,
    gitEnabled,
    documentSyncStatus,
    remoteAccess,
    remotePaused,
    remoteReason,
    isSyncing,
    postSaveSyncState,
    canSave,
    canDiscard,
  });
  const StatusIcon = state.tone === "ok" ? CheckCircle2 : state.tone === "danger" ? AlertCircle : RefreshCw;

  return (
    <footer className="knownext-document-status-bar z-10 flex h-10 shrink-0 items-center justify-between gap-2 border-t border-line bg-white px-2 text-[11px] text-ink-secondary sm:gap-4 sm:px-3">
      <div className="hidden min-w-0 items-center gap-3 sm:flex">
        <span className="flex items-center gap-2">
          <FileCode2 size={15} />
          {kindLabel}
        </span>
        <span className="h-5 border-l border-line" />
        <span>{metricLabel ?? `${wordCount} palabras`}</span>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:shrink-0 sm:gap-2">
        {state.label ? (
          <span
            className={[
              "flex max-w-[min(46vw,180px)] min-w-0 items-center gap-2 rounded-full px-2.5 py-1 font-medium sm:max-w-none",
              state.tone === "ok" ? "bg-green-50 text-green-700" : "",
              state.tone === "warning" ? "bg-orange-50 text-brand-orange" : "",
              state.tone === "danger" ? "bg-red-50 text-red-700" : "",
            ].join(" ")}
            title={state.detail}
          >
            <StatusIcon size={14} className={state.busy ? "animate-spin" : ""} />
            <span className="truncate">{state.label}</span>
          </span>
        ) : null}

        {state.showDiscard ? (
          <button
            className="flex h-7 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-ink-secondary shadow-subtle hover:bg-panel hover:text-ink-primary sm:px-2.5"
            onClick={onDiscardPendingChanges}
            disabled={state.busy}
            aria-label="Deshacer cambios"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">Deshacer cambios</span>
          </button>
        ) : null}
        {state.showSave ? (
          <span className="flex items-center gap-1">
            {pendingSaveHint ? (
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md border border-orange-100 bg-orange-50 text-brand-orange"
                title={pendingSaveHint}
                aria-label={pendingSaveHint}
                role="img"
              >
                <Info size={13} />
              </span>
            ) : null}
            <button
              className="h-7 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white shadow-subtle hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
              onClick={onSave}
              disabled={saveState === "saving" || state.busy}
            >
              {saveState === "saving" ? "Guardando" : "Guardar"}
            </button>
          </span>
        ) : null}
        {state.showSync ? (
          <button
            className="h-7 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white shadow-subtle hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
            onClick={onSynchronize}
            disabled={state.busy}
          >
            {state.busy ? "Sincronizando" : "Sincronizar"}
          </button>
        ) : null}
        {state.showUpdate ? (
          <button
            className="h-7 rounded-md bg-red-600 px-3 text-[11px] font-semibold text-white shadow-subtle hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={onUpdateFromRemote}
            disabled={state.busy}
          >
            Revisar
          </button>
        ) : null}
      </div>
    </footer>
  );
}

function getFooterState({
  isDirty,
  saveState,
  gitEnabled,
  documentSyncStatus,
  remoteAccess,
  remotePaused,
  remoteReason,
  isSyncing,
  postSaveSyncState,
  canSave,
  canDiscard,
}: {
  isDirty: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  gitEnabled: boolean;
  documentSyncStatus?: DocumentSyncStatus | null;
  remoteAccess?: RemoteAccessState;
  remotePaused?: boolean;
  remoteReason?: string | null;
  isSyncing: boolean;
  postSaveSyncState: DocumentPostSaveSyncState;
  canSave: boolean;
  canDiscard: boolean;
}): FooterState {
  const postSaveSyncing = postSaveSyncState === "syncing-local" || postSaveSyncState === "syncing-remote";
  const busy = isSyncing || saveState === "saving" || postSaveSyncing;
  const versionState = documentSyncStatus?.versionState ?? (gitEnabled ? "ok" : "unversioned");
  const incomingAvailable = versionState === "remote-ahead" || versionState === "diverged";
  const localAhead = Boolean(gitEnabled && (documentSyncStatus?.localChanged || versionState === "local-ahead"));
  const githubPaused = Boolean(remotePaused || (remoteAccess && remoteAccess !== "available" && remoteAccess !== "not-configured"));
  const githubPausedLabel = remoteAccess === "unauthorized"
    ? "Sin permiso GitHub"
    : remoteAccess === "offline"
      ? "GitHub sin conexión"
      : remoteAccess === "unauthenticated"
        ? "Sin acceso a GitHub"
        : remoteReason ?? "GitHub pausado";
  const syncAvailable = gitEnabled && localAhead && !githubPaused;

  if (saveState === "error") {
    return {
      tone: "danger",
      label: "No se pudo guardar",
      detail: "Reintenta el guardado antes de cerrar el documento.",
      showSave: canSave,
      showDiscard: isDirty && canSave && canDiscard,
      showSync: false,
      showUpdate: false,
      busy,
    };
  }

  if (isDirty) {
    return {
      tone: "warning",
      label: canSave ? undefined : "Cambios sin guardar",
      detail: canSave ? undefined : "Guarda el documento o descarta los cambios pendientes.",
      showSave: canSave,
      showDiscard: canSave && canDiscard,
      showSync: false,
      showUpdate: false,
      busy,
    };
  }

  if (postSaveSyncing) {
    return {
      tone: "warning",
      label: "Sincronizando",
      detail: postSaveSyncState === "syncing-remote"
        ? "Subiendo la versión guardada a GitHub."
        : "Guardando la versión local en el historial.",
      showSave: false,
      showDiscard: false,
      showSync: false,
      showUpdate: false,
      busy,
    };
  }

  if (postSaveSyncState === "error") {
    return {
      tone: "danger",
      label: "No se pudo sincronizar",
      detail: "El documento está guardado localmente, pero la sincronización necesita reintentarse.",
      showSave: false,
      showDiscard: false,
      showSync: gitEnabled,
      showUpdate: false,
      busy: false,
    };
  }

  if (incomingAvailable && !githubPaused) {
    const hasConflict = versionState === "diverged";
    return {
      tone: "danger",
      label: hasConflict ? "Conflicto de versiones" : "Versión disponible",
      detail: hasConflict
        ? "Este documento cambió en local y en GitHub. Revisa antes de actualizar."
        : "Hay una versión posterior disponible para este documento.",
      showSave: false,
      showDiscard: false,
      showSync: false,
      showUpdate: true,
      busy,
    };
  }

  if (syncAvailable) {
    return {
      tone: "warning",
      label: "Pendiente de sincronizar",
      detail: "La última versión guardada local todavía no se ha sincronizado.",
      showSave: false,
      showDiscard: false,
      showSync: true,
      showUpdate: false,
      busy,
    };
  }

  if (gitEnabled && githubPaused) {
    return {
      tone: "warning",
      label: localAhead ? `Guardado local · ${githubPausedLabel}` : `OK · Guardado local · ${githubPausedLabel}`,
      detail: localAhead
        ? "Hay cambios locales guardados. La sincronización remota queda pausada hasta recuperar acceso a GitHub."
        : "El documento está guardado localmente. La sincronización con GitHub está pausada.",
      showSave: false,
      showDiscard: false,
      showSync: false,
      showUpdate: false,
      busy,
    };
  }

  return {
    tone: "ok",
    label: gitEnabled ? "OK · Última versión" : "OK · Guardado",
    showSave: false,
    showDiscard: false,
    showSync: false,
    showUpdate: false,
    busy,
  };
}
