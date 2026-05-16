import { AlertTriangle, CheckCircle2, FolderInput, Loader2 } from "lucide-react";
import type { ExternalChangeSet, ProjectSyncState } from "../../types/domain";

type ExternalChangesBannerProps = {
  changeSet: ExternalChangeSet | null;
  syncState: ProjectSyncState;
  busy: boolean;
  onReview: () => void;
  onImportSafe: () => void;
};

export function ExternalChangesBanner({ changeSet, syncState, busy, onReview, onImportSafe }: ExternalChangesBannerProps) {
  if (!changeSet || changeSet.summary.total === 0) return null;

  const needsReview = changeSet.requiresReview || changeSet.status === "needs-review" || changeSet.status === "blocked";
  const Icon = needsReview ? AlertTriangle : busy ? Loader2 : FolderInput;
  const title = needsReview ? "Cambios externos requieren revisión" : "Cambios externos detectados";
  const detail = formatChangeSummary(changeSet);

  return (
    <div
      className={[
        "mb-3 flex items-center gap-3 rounded-md border px-3 py-2 text-[11px] shadow-subtle",
        needsReview ? "border-orange-200 bg-brand-hover text-ink-primary" : "border-line bg-white text-ink-primary",
      ].join(" ")}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-hover text-brand-orange">
        <Icon size={16} className={busy ? "animate-spin" : ""} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 truncate text-ink-secondary">{detail}</p>
      </div>
      {syncState === "synced" && !needsReview ? (
        <span className="hidden items-center gap-1.5 text-[11px] text-ink-secondary sm:inline-flex">
          <CheckCircle2 size={14} className="text-green-600" />
          Listo
        </span>
      ) : null}
      <button
        className="h-7 rounded-md border border-line bg-white px-2.5 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        disabled={busy}
        onClick={onReview}
      >
        Revisar
      </button>
      {!needsReview ? (
        <button
          className="h-7 rounded-md bg-brand-orange px-2.5 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy}
          onClick={onImportSafe}
        >
          Importar seguros
        </button>
      ) : null}
    </div>
  );
}

function formatChangeSummary(changeSet: ExternalChangeSet) {
  const parts = [
    changeSet.summary.added ? `${changeSet.summary.added} nuevos` : null,
    changeSet.summary.modified ? `${changeSet.summary.modified} modificados` : null,
    changeSet.summary.deleted ? `${changeSet.summary.deleted} eliminados` : null,
    changeSet.summary.blocked ? `${changeSet.summary.blocked} omitidos` : null,
  ].filter(Boolean);
  return `${parts.join(" · ") || `${changeSet.summary.total} cambios`} · ${changeSet.title}`;
}
