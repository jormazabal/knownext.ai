import { AlertCircle, CheckCircle2, FileCode2, RefreshCw, RotateCcw } from "lucide-react";
import type { DocumentSyncStatus } from "../../types/domain";

type DocumentStatusBarProps = {
  isDirty: boolean;
  saveState: "idle" | "saving" | "saved";
  wordCount: number;
  gitEnabled: boolean;
  canSave: boolean;
  documentSyncStatus?: DocumentSyncStatus | null;
  isSyncing: boolean;
  onSave: () => void;
  onSynchronize: () => void;
  onUpdateFromRemote: () => void;
  onDiscardPendingChanges: () => void;
};

type FooterState = {
  tone: "ok" | "warning" | "danger";
  label: string;
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
  wordCount,
  gitEnabled,
  canSave,
  documentSyncStatus,
  isSyncing,
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
    isSyncing,
    canSave,
  });
  const StatusIcon = state.tone === "ok" ? CheckCircle2 : state.tone === "danger" ? AlertCircle : RefreshCw;

  return (
    <footer className="z-10 flex h-10 shrink-0 items-center justify-between gap-4 border-t border-line bg-white px-3 text-[11px] text-ink-secondary">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex items-center gap-2">
          <FileCode2 size={15} />
          Markdown
        </span>
        <span className="h-5 border-l border-line" />
        <span>{wordCount} palabras</span>
      </div>

      <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
        <span
          className={[
            "flex min-w-0 items-center gap-2 rounded-full px-2.5 py-1 font-medium",
            state.tone === "ok" ? "bg-green-50 text-green-700" : "",
            state.tone === "warning" ? "bg-orange-50 text-brand-orange" : "",
            state.tone === "danger" ? "bg-red-50 text-red-700" : "",
          ].join(" ")}
          title={state.detail}
        >
          <StatusIcon size={14} className={state.busy ? "animate-spin" : ""} />
          <span className="truncate">{state.label}</span>
        </span>

        {state.showDiscard ? (
          <button
            className="flex h-7 items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-[11px] font-semibold text-ink-secondary shadow-subtle hover:bg-panel hover:text-ink-primary"
            onClick={onDiscardPendingChanges}
            disabled={state.busy}
          >
            <RotateCcw size={13} />
            Deshacer cambios
          </button>
        ) : null}
        {state.showSave ? (
          <button
            className="h-7 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white shadow-subtle hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
            onClick={onSave}
            disabled={saveState === "saving" || state.busy}
          >
            {saveState === "saving" ? "Guardando" : "Guardar"}
          </button>
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
            Actualizar
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
  isSyncing,
  canSave,
}: {
  isDirty: boolean;
  saveState: "idle" | "saving" | "saved";
  gitEnabled: boolean;
  documentSyncStatus?: DocumentSyncStatus | null;
  isSyncing: boolean;
  canSave: boolean;
}): FooterState {
  const busy = isSyncing || saveState === "saving";
  const versionState = documentSyncStatus?.versionState ?? (gitEnabled ? "ok" : "unversioned");
  const incomingAvailable = versionState === "remote-ahead" || versionState === "diverged";
  const localAhead = Boolean(gitEnabled && (documentSyncStatus?.localChanged || versionState === "local-ahead"));
  const syncAvailable = gitEnabled && localAhead;

  if (incomingAvailable) {
    const hasConflict = versionState === "diverged";
    return {
      tone: "danger",
      label: isDirty
        ? "Cambios pendientes · versión posterior disponible"
        : hasConflict
          ? "Conflicto de versiones"
          : "Versión desactualizada",
      detail: isDirty
        ? "Hay una versión posterior de este documento. Actualizar puede descartar cambios pendientes."
        : hasConflict
          ? "Este documento cambió en local y en GitHub. Revisa antes de actualizar."
          : "Hay una versión posterior disponible para este documento.",
      showSave: canSave && isDirty,
      showDiscard: canSave && isDirty,
      showSync: false,
      showUpdate: true,
      busy,
    };
  }

  if (isDirty) {
    return {
      tone: "warning",
      label: syncAvailable ? "Cambios pendientes · sincronización disponible" : "Cambios pendientes",
      detail: syncAvailable
        ? "Puedes guardar el borrador o sincronizar la última versión guardada."
        : "Guarda el documento para convertir el borrador en la versión local.",
      showSave: canSave,
      showDiscard: canSave,
      showSync: syncAvailable,
      showUpdate: false,
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
