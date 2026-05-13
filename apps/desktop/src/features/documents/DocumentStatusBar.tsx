import { CheckCircle2, FileCode2, GitCommitHorizontal } from "lucide-react";

type DocumentStatusBarProps = {
  statusLabel: string;
  statusTone: "success" | "warning";
  isDirty: boolean;
  saveState: "idle" | "saving" | "saved";
  wordCount: number;
  gitEnabled: boolean;
  versioningLabel: string;
  lastVersionHash?: string | null;
  lastVersionRelativeTime?: string | null;
  canSave: boolean;
  onSave: () => void;
};

export function DocumentStatusBar({
  statusLabel,
  statusTone,
  isDirty,
  saveState,
  wordCount,
  gitEnabled,
  versioningLabel,
  lastVersionHash,
  lastVersionRelativeTime,
  canSave,
  onSave,
}: DocumentStatusBarProps) {
  const showSaveButton = canSave && (isDirty || saveState === "saving");

  return (
    <footer className="z-10 flex h-9 shrink-0 items-center justify-between gap-4 border-t border-line bg-white px-3 text-[11px] text-ink-secondary">
      <div className="flex min-w-0 items-center gap-3">
        <span>{wordCount} palabras</span>
        <span className="h-5 border-l border-line" />
        <span>Línea 1, Columna 1</span>
        <span className="h-5 border-l border-line" />
        <span className="flex items-center gap-2">
          <FileCode2 size={15} />
          Markdown
        </span>
      </div>

      <div className="flex min-w-0 shrink-0 items-center justify-end gap-3">
        <span className="flex items-center gap-2">
          <CheckCircle2 size={16} className={statusTone === "warning" || isDirty ? "text-brand-orange" : "text-green-600"} />
          {statusLabel}
        </span>
        <span className="h-5 border-l border-line" />
        <span className="flex items-center gap-2">
          <GitCommitHorizontal size={15} />
          {versioningLabel}
        </span>
        <span className="h-5 border-l border-line" />
        {gitEnabled && lastVersionHash ? (
          <span>
            Última versión: <strong className="ml-2 text-ink-primary">{lastVersionHash}</strong>
            {lastVersionRelativeTime ? <span className="ml-3">{lastVersionRelativeTime}</span> : null}
          </span>
        ) : (
          <span>{gitEnabled ? "Sin versiones todavía" : "Historial no disponible"}</span>
        )}
        {showSaveButton ? (
          <button
            className="h-7 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white shadow-subtle hover:bg-brand-dark disabled:opacity-70"
            onClick={onSave}
            disabled={saveState === "saving"}
          >
            {saveState === "saving" ? "Guardando" : "Guardar"}
          </button>
        ) : null}
      </div>
    </footer>
  );
}
