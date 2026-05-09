import { CheckCircle2, FileCode2, GitCommitHorizontal } from "lucide-react";

type DocumentStatusBarProps = {
  statusLabel: string;
  statusTone: "success" | "warning";
  isDirty: boolean;
  saveState: "idle" | "saving" | "saved";
  wordCount: number;
  gitEnabled: boolean;
  canSave: boolean;
  onSave: () => void;
};

export function DocumentStatusBar({ statusLabel, statusTone, isDirty, saveState, wordCount, gitEnabled, canSave, onSave }: DocumentStatusBarProps) {
  return (
    <footer className="z-10 flex h-12 shrink-0 items-center gap-6 border-t border-line bg-white px-5 text-[12px] text-ink-secondary">
      <span className="flex items-center gap-2">
        <CheckCircle2 size={16} className={statusTone === "warning" || isDirty ? "text-brand-orange" : "text-green-600"} />
        {statusLabel}
      </span>
      <span className="h-5 border-l border-line" />
      <span className="flex items-center gap-2">
        <GitCommitHorizontal size={15} />
        Git: {gitEnabled ? "limpio" : "sin repositorio"}
      </span>
      <span className="h-5 border-l border-line" />
      {gitEnabled ? (
        <span>
          Último commit: <strong className="ml-2 text-ink-primary">a1b2c3d</strong> <span className="ml-3">hace 2 horas</span>
        </span>
      ) : (
        <span>Historial no disponible</span>
      )}
      <span className="ml-auto">{wordCount} palabras</span>
      <span className="h-5 border-l border-line" />
      <span>Línea 1, Columna 1</span>
      <span className="h-5 border-l border-line" />
      <span className="flex items-center gap-2">
        <FileCode2 size={15} />
        Markdown
      </span>
      <button
        className="ml-2 h-8 rounded-md bg-brand-orange px-5 text-[12px] font-semibold text-white shadow-subtle hover:bg-brand-dark disabled:opacity-70"
        onClick={onSave}
        disabled={saveState === "saving" || !canSave}
      >
        {saveState === "saving" ? "Guardando" : saveState === "saved" ? "Guardado" : "Guardar"}
      </button>
    </footer>
  );
}
