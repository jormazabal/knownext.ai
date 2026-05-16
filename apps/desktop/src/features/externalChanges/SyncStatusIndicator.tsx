import { AlertCircle, CheckCircle2, Cloud, Clock3, Loader2, RefreshCw } from "lucide-react";
import type { ExternalChangeSet, ProjectSyncState } from "../../types/domain";

type SyncStatusIndicatorProps = {
  changeSet: ExternalChangeSet | null;
  syncState: ProjectSyncState;
  busy: boolean;
  onOpen: () => void;
};

export function SyncStatusIndicator({ changeSet, syncState, busy, onOpen }: SyncStatusIndicatorProps) {
  const view = getStatusView(changeSet, syncState, busy);
  const Icon = view.icon;

  return (
    <button
      className={[
        "ml-auto hidden h-8 shrink-0 items-center gap-2 border-l border-line px-3 text-[11px] transition sm:flex",
        view.tone === "orange" ? "text-brand-orange hover:bg-brand-hover" : "",
        view.tone === "red" ? "text-red-700 hover:bg-red-50" : "",
        view.tone === "muted" ? "text-ink-secondary hover:bg-panel hover:text-ink-primary" : "",
      ].join(" ")}
      data-tooltip={view.detail}
      data-tooltip-placement="bottom"
      onClick={onOpen}
    >
      <Icon size={14} className={view.spinning ? "animate-spin" : ""} />
      <span className="max-w-[190px] truncate">{view.label}</span>
    </button>
  );
}

function getStatusView(changeSet: ExternalChangeSet | null, syncState: ProjectSyncState, busy: boolean) {
  if (busy || syncState === "saving" || syncState === "syncing") {
    return { label: syncState === "syncing" ? "Sincronizando con GitHub" : "Guardando versión", detail: "KnowNext.ai está procesando cambios externos.", icon: Loader2, tone: "orange" as const, spinning: true };
  }
  if (changeSet?.summary.total) {
    if (changeSet.requiresReview) {
      return { label: "Revisión necesaria", detail: "Hay cambios externos que requieren revisión antes de incorporarse.", icon: AlertCircle, tone: "orange" as const, spinning: false };
    }
    return { label: "Cambios externos detectados", detail: "Hay cambios seguros listos para importar.", icon: FolderInputIcon, tone: "orange" as const, spinning: false };
  }
  if (syncState === "pending") {
    return { label: "Pendiente de sincronizar", detail: "La versión está guardada localmente y queda pendiente de GitHub.", icon: Clock3, tone: "orange" as const, spinning: false };
  }
  if (syncState === "error") {
    return { label: "Error de sincronización", detail: "No se pudo completar la sincronización.", icon: AlertCircle, tone: "red" as const, spinning: false };
  }
  if (syncState === "unsupported") {
    return { label: "Detección no disponible", detail: "Este modo de proyecto no puede detectar cambios externos automáticamente.", icon: RefreshCw, tone: "muted" as const, spinning: false };
  }
  return { label: "Sincronizado", detail: "No hay cambios externos pendientes.", icon: CheckCircle2, tone: "muted" as const, spinning: false };
}

function FolderInputIcon({ size, className }: { size?: number; className?: string }) {
  return <Cloud size={size} className={className} />;
}
