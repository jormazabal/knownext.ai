import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  File,
  FileImage,
  FileText,
  FolderOpen,
  GitBranch,
  Github,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  ExternalChangeDecision,
  ExternalChangeSet,
  Project,
  ProjectFileSyncItem,
  ProjectFileSyncOverview,
  ProjectFileSyncPhaseState,
  ProjectFileSyncPhaseStatus,
  ProjectSyncState,
  ProjectSyncStatus,
} from "../../types/domain";

export type OpenDocumentDraftState = {
  documentId: string;
  path: string;
  name: string;
  isDirty: boolean;
  hasRecoveredDraft: boolean;
  draftUpdatedAt?: string | null;
};

type ExternalChangesDrawerProps = {
  open: boolean;
  project: Project | null;
  overview: ProjectFileSyncOverview | null;
  overviewError?: string | null;
  openDrafts: OpenDocumentDraftState[];
  changeSet: ExternalChangeSet | null;
  decisions: Record<string, ExternalChangeDecision>;
  syncStatus?: ProjectSyncStatus | null;
  syncState: ProjectSyncState;
  acknowledged: boolean;
  busy: boolean;
  message?: string | null;
  onDecisionChange: (itemId: string, decision: ExternalChangeDecision) => void;
  onImport: () => void;
  onOmitAll: () => void;
  onPushGithub: () => void;
  onPullGithub: () => void;
  onResolveGithubConflict: (resolution: "keep-local" | "take-remote") => void;
  onOpenGithubRepository: () => void;
  onOpenDocument: (documentId: string, name: string) => void;
  onSaveDocument: (documentId: string) => void | Promise<boolean>;
  onDiscardDocumentDraft: (documentId: string) => void | Promise<boolean>;
  onRefresh: () => void;
  onClose: () => void;
};

type FileSyncFilterPhase = "local" | "history" | "github";

type FileSyncFilterState = Record<FileSyncFilterPhase, ProjectFileSyncPhaseState[]>;

type FileSyncFilterOption = {
  state: ProjectFileSyncPhaseState;
  label: string;
  count: number;
};

type DisplayFileSyncItem = ProjectFileSyncItem & {
  draft?: OpenDocumentDraftState | null;
};

const emptyFilterState: FileSyncFilterState = {
  local: [],
  history: [],
  github: [],
};

const filterPhases: Array<{ id: FileSyncFilterPhase; label: string }> = [
  { id: "local", label: "Local" },
  { id: "history", label: "Historial local" },
  { id: "github", label: "GitHub" },
];

export function ExternalChangesDrawer({
  open,
  project,
  overview,
  overviewError,
  openDrafts,
  changeSet,
  decisions,
  syncStatus,
  syncState,
  acknowledged,
  busy,
  message,
  onDecisionChange,
  onImport,
  onOmitAll,
  onPushGithub,
  onPullGithub,
  onResolveGithubConflict,
  onOpenGithubRepository,
  onOpenDocument,
  onSaveDocument,
  onDiscardDocumentDraft,
  onRefresh,
  onClose,
}: ExternalChangesDrawerProps) {
  const [filters, setFilters] = useState<FileSyncFilterState>(emptyFilterState);
  const [pendingConflictResolution, setPendingConflictResolution] = useState<"keep-local" | "take-remote" | null>(null);
  const files = useMemo(() => buildDisplayFiles(project, overview, openDrafts, syncStatus), [project, overview, openDrafts, syncStatus]);
  const filterOptions = useMemo(() => buildPhaseFilterOptions(files), [files]);
  const visibleFiles = useMemo(() => files.filter((file) => fileMatchesPhaseFilters(file, filters)), [files, filters]);
  const includedChanges = files.filter((file) => isIncludeDecision(file, decisions)).length;
  const omittedCount = files.filter(isOmittedFile).length;
  const canUseGithub = hasGithub(project) && !syncStatus?.remotePaused;
  const canPushGithub = canUseGithub && Boolean(syncStatus?.pendingPush || syncStatus?.state === "local-pending") && includedChanges === 0;
  const canPullGithub = canUseGithub && Boolean(syncStatus?.pendingPull || syncStatus?.state === "remote-available");
  const summary = getHeaderSummary(files, overviewError, busy, syncStatus, syncState, message);

  if (!open) return null;

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/20 px-4 py-8" onMouseDown={onClose}>
      <section
        className="relative flex max-h-[min(820px,calc(100dvh-56px))] w-[min(1080px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-sync-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <FileSyncToolbar
          projectName={project?.name ?? "Proyecto"}
          summary={summary}
          busy={busy}
          onRefresh={onRefresh}
          onClose={onClose}
        />
        <FileSyncFilters
          filters={filters}
          options={filterOptions}
          onToggle={(phase, state) => setFilters((current) => togglePhaseFilter(current, phase, state))}
          onClear={(phase) => setFilters((current) => ({ ...current, [phase]: [] }))}
          onClearAll={() => setFilters(emptyFilterState)}
        />
        <BulkActionBar
          includedChanges={includedChanges}
          omittedCount={omittedCount}
          acknowledged={acknowledged}
          canPushGithub={canPushGithub}
          canPullGithub={canPullGithub}
          busy={busy}
          onImport={onImport}
          onOmitAll={onOmitAll}
          onPushGithub={onPushGithub}
          onPullGithub={onPullGithub}
        />

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {overviewError ? (
            <section className="mb-3 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-[12px] text-red-900">
              <div className="flex items-start gap-3">
                <AlertTriangle size={17} className="mt-0.5 shrink-0 text-red-700" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">No se pudo cargar el estado de archivos</p>
                  <p className="mt-1 leading-5">{overviewError}</p>
                </div>
                <button className="h-8 rounded-md border border-red-200 bg-white px-3 text-[11px] font-semibold hover:bg-red-50" onClick={onRefresh}>
                  Comprobar de nuevo
                </button>
              </div>
            </section>
          ) : null}
          <FileSyncTable
            files={visibleFiles}
            decisions={decisions}
            acknowledged={acknowledged}
            busy={busy}
            syncStatus={syncStatus}
            canUseGithub={canUseGithub}
            onDecisionChange={onDecisionChange}
            onOmitAll={onOmitAll}
            onPushGithub={onPushGithub}
            onPullGithub={onPullGithub}
            onOpenGithubRepository={onOpenGithubRepository}
            onOpenDocument={(documentId, name) => {
              onOpenDocument(documentId, name);
              onClose();
            }}
            onRequestResolveGithubConflict={setPendingConflictResolution}
            onSaveDocument={onSaveDocument}
            onDiscardDocumentDraft={onDiscardDocumentDraft}
            onRefresh={onRefresh}
          />
          {!overviewError && visibleFiles.length === 0 ? (
            <section className="rounded-md border border-dashed border-line bg-white px-4 py-10 text-center">
              <CheckCircle2 size={24} className="mx-auto text-green-600" />
              <p className="mt-2 text-[12px] font-semibold text-ink-primary">No hay archivos con estos filtros</p>
              <p className="mt-1 text-[11px] text-ink-secondary">
                Ajusta los estados seleccionados o comprueba de nuevo para actualizar el estado del proyecto.
              </p>
            </section>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-4">
          <div className="min-w-0 truncate text-[11px] text-ink-secondary">
            {summary.footer}
          </div>
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-[11px] font-medium hover:bg-panel" disabled={busy} onClick={onRefresh}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Comprobar de nuevo
          </button>
        </footer>

        {pendingConflictResolution ? (
          <GithubConflictConfirmationDialog
            resolution={pendingConflictResolution}
            busy={busy}
            onCancel={() => setPendingConflictResolution(null)}
            onConfirm={() => {
              onResolveGithubConflict(pendingConflictResolution);
              setPendingConflictResolution(null);
            }}
          />
        ) : null}
      </section>
    </div>
  );
}

function FileSyncToolbar({
  projectName,
  summary,
  busy,
  onRefresh,
  onClose,
}: {
  projectName: string;
  summary: ReturnType<typeof getHeaderSummary>;
  busy: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const Icon = summary.icon;
  return (
    <header className="shrink-0 border-b border-line px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={["grid h-9 w-9 shrink-0 place-items-center rounded-md", summary.iconClass].join(" ")}>
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <h2 id="file-sync-title" className="truncate text-[16px] font-semibold text-ink-primary">Guardado y sincronización</h2>
            <p className="mt-1 truncate text-[11px] text-ink-secondary">
              {projectName} · {summary.detail}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-50"
            data-tooltip="Comprobar de nuevo"
            aria-label="Comprobar guardado y sincronización de nuevo"
            disabled={busy}
            onClick={onRefresh}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
          <button
            className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
            data-tooltip="Cerrar"
            aria-label="Cerrar guardado y sincronización"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

function FileSyncFilters({
  filters,
  options,
  onToggle,
  onClear,
  onClearAll,
}: {
  filters: FileSyncFilterState;
  options: Record<FileSyncFilterPhase, FileSyncFilterOption[]>;
  onToggle: (phase: FileSyncFilterPhase, state: ProjectFileSyncPhaseState) => void;
  onClear: (phase: FileSyncFilterPhase) => void;
  onClearAll: () => void;
}) {
  const [openPhase, setOpenPhase] = useState<FileSyncFilterPhase | null>(null);
  const selectedCount = filterPhases.reduce((total, phase) => total + filters[phase.id].length, 0);
  return (
    <nav className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-5 py-2" aria-label="Filtros de guardado y sincronización">
      <span className="mr-1 text-[10px] font-semibold uppercase text-ink-secondary">Filtros</span>
      {filterPhases.map((phase) => (
        <PhaseFilterDropdown
          key={phase.id}
          phase={phase.id}
          label={phase.label}
          selected={filters[phase.id]}
          options={options[phase.id]}
          open={openPhase === phase.id}
          onOpenChange={(open) => setOpenPhase(open ? phase.id : null)}
          onToggle={onToggle}
          onClear={onClear}
        />
      ))}
      {selectedCount > 0 ? (
        <button
          type="button"
          className="ml-auto h-8 rounded-md px-2.5 text-[11px] font-semibold text-ink-secondary hover:bg-panel hover:text-ink-primary"
          onClick={onClearAll}
        >
          Limpiar filtros ({selectedCount})
        </button>
      ) : null}
    </nav>
  );
}

function PhaseFilterDropdown({
  phase,
  label,
  selected,
  options,
  open,
  onOpenChange,
  onToggle,
  onClear,
}: {
  phase: FileSyncFilterPhase;
  label: string;
  selected: ProjectFileSyncPhaseState[];
  options: FileSyncFilterOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (phase: FileSyncFilterPhase, state: ProjectFileSyncPhaseState) => void;
  onClear: (phase: FileSyncFilterPhase) => void;
}) {
  const active = selected.length > 0;
  const buttonLabel = active ? `${label}: ${selected.length}` : `${label}: Todos`;
  return (
    <div className="relative">
      <button
        type="button"
        className={[
          "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-[11px] font-semibold transition",
          active ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-line bg-white text-ink-secondary hover:bg-panel hover:text-ink-primary",
        ].join(" ")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => onOpenChange(!open)}
      >
        {buttonLabel}
        <ChevronDown size={13} className={open ? "rotate-180 transition" : "transition"} />
      </button>
      {open ? (
        <div
          className="absolute left-0 top-9 z-30 w-56 rounded-md border border-line bg-white p-2 shadow-menu"
          role="menu"
          aria-label={`Filtrar por estado ${label}`}
        >
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            <span className="text-[10px] font-semibold uppercase text-ink-secondary">{label}</span>
            {active ? (
              <button type="button" className="text-[10px] font-semibold text-brand-orange hover:text-brand-dark" onClick={() => onClear(phase)}>
                Todos
              </button>
            ) : null}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {options.map((option) => {
              const checked = selected.includes(option.state);
              return (
                <label
                  key={option.state}
                  className="flex h-8 cursor-default items-center gap-2 rounded px-2 text-[11px] text-ink-primary hover:bg-panel"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 cursor-default accent-brand-orange"
                    checked={checked}
                    onChange={() => onToggle(phase, option.state)}
                  />
                  <span className={["h-1.5 w-1.5 shrink-0 rounded-full", statusDotClass(option.state)].join(" ")} />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <span className="rounded bg-panel px-1.5 py-0.5 text-[10px] text-ink-secondary">{option.count}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BulkActionBar({
  includedChanges,
  omittedCount,
  acknowledged,
  canPushGithub,
  canPullGithub,
  busy,
  onImport,
  onOmitAll,
  onPushGithub,
  onPullGithub,
}: {
  includedChanges: number;
  omittedCount: number;
  acknowledged: boolean;
  canPushGithub: boolean;
  canPullGithub: boolean;
  busy: boolean;
  onImport: () => void;
  onOmitAll: () => void;
  onPushGithub: () => void;
  onPullGithub: () => void;
}) {
  const hasAction = includedChanges > 0 || (omittedCount > 0 && !acknowledged) || canPushGithub || canPullGithub;
  return (
    <section className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-5 py-3">
      <p className="min-w-0 text-[11px] text-ink-secondary">
        {hasAction ? "Resuelve los archivos pendientes desde la lista o ejecuta una acción de lote." : "No hay acciones de lote disponibles ahora."}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {includedChanges > 0 ? (
          <button className="inline-flex h-8 items-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50" disabled={busy} onClick={onImport}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
            Guardar seleccionados en historial ({includedChanges})
          </button>
        ) : null}
        {omittedCount > 0 && !acknowledged ? (
          <button className="inline-flex h-8 items-center gap-2 rounded-md border border-orange-200 bg-white px-3 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover disabled:opacity-50" disabled={busy} onClick={onOmitAll}>
            <ShieldAlert size={14} />
            Aceptar omitidos ({omittedCount})
          </button>
        ) : null}
        {canPushGithub ? (
          <button className="inline-flex h-8 items-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50" disabled={busy} onClick={onPushGithub}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Subir a GitHub
          </button>
        ) : null}
        {canPullGithub ? (
          <button className="inline-flex h-8 items-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50" disabled={busy} onClick={onPullGithub}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Actualizar desde GitHub
          </button>
        ) : null}
      </div>
    </section>
  );
}

function FileSyncTable({
  files,
  decisions,
  acknowledged,
  busy,
  syncStatus,
  canUseGithub,
  onDecisionChange,
  onOmitAll,
  onPushGithub,
  onPullGithub,
  onOpenGithubRepository,
  onOpenDocument,
  onRequestResolveGithubConflict,
  onSaveDocument,
  onDiscardDocumentDraft,
  onRefresh,
}: {
  files: DisplayFileSyncItem[];
  decisions: Record<string, ExternalChangeDecision>;
  acknowledged: boolean;
  busy: boolean;
  syncStatus?: ProjectSyncStatus | null;
  canUseGithub: boolean;
  onDecisionChange: (itemId: string, decision: ExternalChangeDecision) => void;
  onOmitAll: () => void;
  onPushGithub: () => void;
  onPullGithub: () => void;
  onOpenGithubRepository: () => void;
  onOpenDocument: (documentId: string, name: string) => void;
  onRequestResolveGithubConflict: (resolution: "keep-local" | "take-remote") => void;
  onSaveDocument: (documentId: string) => void | Promise<boolean>;
  onDiscardDocumentDraft: (documentId: string) => void | Promise<boolean>;
  onRefresh: () => void;
}) {
  if (files.length === 0) return null;
  return (
    <section className="rounded-md border border-line bg-white">
      <div className="sticky top-0 z-10 grid min-h-9 min-w-[900px] grid-cols-[minmax(260px,1.8fr)_100px_120px_140px_140px_132px] items-center gap-3 border-b border-line bg-panel px-3 text-[10px] font-semibold uppercase text-ink-secondary">
        <span>Archivo</span>
        <span>Modificado</span>
        <span>Local</span>
        <span>Historial local</span>
        <span>GitHub</span>
        <span className="text-right">Acciones</span>
      </div>
      <div className="min-w-[900px] divide-y divide-line/70">
        {files.map((file) => (
          <FileSyncRow
            key={file.id}
            file={file}
            decision={file.change ? decisions[file.change.itemId] ?? file.change.decision : null}
            acknowledged={acknowledged}
            busy={busy}
            syncStatus={syncStatus}
            canUseGithub={canUseGithub}
            onDecisionChange={onDecisionChange}
            onOmitAll={onOmitAll}
            onPushGithub={onPushGithub}
            onPullGithub={onPullGithub}
            onOpenGithubRepository={onOpenGithubRepository}
            onOpenDocument={onOpenDocument}
            onRequestResolveGithubConflict={onRequestResolveGithubConflict}
            onSaveDocument={onSaveDocument}
            onDiscardDocumentDraft={onDiscardDocumentDraft}
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </section>
  );
}

function FileSyncRow({
  file,
  decision,
  acknowledged,
  busy,
  syncStatus,
  canUseGithub,
  onDecisionChange,
  onOmitAll,
  onPushGithub,
  onPullGithub,
  onOpenGithubRepository,
  onOpenDocument,
  onRequestResolveGithubConflict,
  onSaveDocument,
  onDiscardDocumentDraft,
  onRefresh,
}: {
  file: DisplayFileSyncItem;
  decision: ExternalChangeDecision | null;
  acknowledged: boolean;
  busy: boolean;
  syncStatus?: ProjectSyncStatus | null;
  canUseGithub: boolean;
  onDecisionChange: (itemId: string, decision: ExternalChangeDecision) => void;
  onOmitAll: () => void;
  onPushGithub: () => void;
  onPullGithub: () => void;
  onOpenGithubRepository: () => void;
  onOpenDocument: (documentId: string, name: string) => void;
  onRequestResolveGithubConflict: (resolution: "keep-local" | "take-remote") => void;
  onSaveDocument: (documentId: string) => void | Promise<boolean>;
  onDiscardDocumentDraft: (documentId: string) => void | Promise<boolean>;
  onRefresh: () => void;
}) {
  const Icon = getFileIcon(file.kind);
  return (
    <article className="grid min-h-[58px] grid-cols-[minmax(260px,1.8fr)_100px_120px_140px_140px_132px] items-center gap-3 px-3 py-2 text-[11px] hover:bg-panel/70">
      <div className="flex min-w-0 items-center gap-2">
        <Icon size={16} className="shrink-0 text-ink-secondary" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-primary">{file.name}</p>
          <p className="mt-0.5 truncate text-[10px] leading-4 text-ink-secondary">{formatParentPath(file.path)}</p>
        </div>
      </div>
      <span className="text-ink-secondary">{formatDate(file.modifiedAt ?? file.draft?.draftUpdatedAt)}</span>
      <SyncStatusBadge status={file.localStatus} />
      <SyncStatusBadge status={file.historyStatus} />
      <SyncStatusBadge status={file.githubStatus} />
      <FileRowActions
        file={file}
        decision={decision}
        acknowledged={acknowledged}
        busy={busy}
        syncStatus={syncStatus}
        canUseGithub={canUseGithub}
        onDecisionChange={onDecisionChange}
        onOmitAll={onOmitAll}
        onPushGithub={onPushGithub}
        onPullGithub={onPullGithub}
        onOpenGithubRepository={onOpenGithubRepository}
        onOpenDocument={onOpenDocument}
        onRequestResolveGithubConflict={onRequestResolveGithubConflict}
        onSaveDocument={onSaveDocument}
        onDiscardDocumentDraft={onDiscardDocumentDraft}
        onRefresh={onRefresh}
      />
    </article>
  );
}

function SyncStatusBadge({ status }: { status: ProjectFileSyncPhaseStatus }) {
  return (
    <span
      className={[
        "inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold",
        statusBadgeClass(status.state),
      ].join(" ")}
      title={status.detail ?? status.label}
      aria-label={`${status.label}${status.detail ? `: ${status.detail}` : ""}`}
    >
      <span className={["h-1.5 w-1.5 shrink-0 rounded-full", statusDotClass(status.state)].join(" ")} />
      <span className="truncate">{status.label}</span>
    </span>
  );
}

function FileRowActions({
  file,
  decision,
  acknowledged,
  busy,
  syncStatus,
  canUseGithub,
  onDecisionChange,
  onOmitAll,
  onPushGithub,
  onPullGithub,
  onOpenGithubRepository,
  onOpenDocument,
  onRequestResolveGithubConflict,
  onSaveDocument,
  onDiscardDocumentDraft,
  onRefresh,
}: {
  file: DisplayFileSyncItem;
  decision: ExternalChangeDecision | null;
  acknowledged: boolean;
  busy: boolean;
  syncStatus?: ProjectSyncStatus | null;
  canUseGithub: boolean;
  onDecisionChange: (itemId: string, decision: ExternalChangeDecision) => void;
  onOmitAll: () => void;
  onPushGithub: () => void;
  onPullGithub: () => void;
  onOpenGithubRepository: () => void;
  onOpenDocument: (documentId: string, name: string) => void;
  onRequestResolveGithubConflict: (resolution: "keep-local" | "take-remote") => void;
  onSaveDocument: (documentId: string) => void | Promise<boolean>;
  onDiscardDocumentDraft: (documentId: string) => void | Promise<boolean>;
  onRefresh: () => void;
}) {
  const openDocumentButton = file.kind === "document" ? (
    <ActionIconButton
      label={`Abrir ${file.name}`}
      disabled={busy}
      onClick={() => onOpenDocument(file.id, file.name)}
    >
      <Eye size={14} />
    </ActionIconButton>
  ) : null;

  if (file.draft) {
    return (
      <div className="flex justify-end gap-1">
        {openDocumentButton}
        <ActionIconButton label={`Guardar ${file.name}`} tone="primary" disabled={busy} onClick={() => onSaveDocument(file.draft!.documentId)}>
          <CheckCircle2 size={14} />
        </ActionIconButton>
        <ActionIconButton label={`Descartar borrador de ${file.name}`} tone="danger" disabled={busy} onClick={() => onDiscardDocumentDraft(file.draft!.documentId)}>
          <Trash2 size={14} />
        </ActionIconButton>
      </div>
    );
  }

  if (file.change?.risk === "blocked") {
    return (
      <div className="flex justify-end gap-1">
        {openDocumentButton}
        <ActionIconButton label={acknowledged ? `${file.name} omitido aceptado` : `Aceptar omitido ${file.name}`} disabled={busy || acknowledged} onClick={onOmitAll}>
          <ShieldAlert size={14} />
        </ActionIconButton>
      </div>
    );
  }

  if (file.change) {
    return (
      <div className="flex justify-end gap-1">
        {openDocumentButton}
        <ActionIconButton label={`Incluir ${file.name} en historial`} tone={decision === "include" ? "primary" : "default"} disabled={busy} onClick={() => onDecisionChange(file.change!.itemId, "include")}>
          <GitBranch size={14} />
        </ActionIconButton>
        <ActionIconButton label={`Omitir ${file.name}`} tone={decision === "omit" ? "active" : "default"} disabled={busy} onClick={() => onDecisionChange(file.change!.itemId, "omit")}>
          <Ban size={14} />
        </ActionIconButton>
      </div>
    );
  }

  if (file.githubStatus.state === "conflict") {
    return (
      <div className="flex justify-end gap-1">
        {openDocumentButton}
        <ActionIconButton label={`Usar este equipo para ${file.name}`} tone="primary" disabled={busy} onClick={() => onRequestResolveGithubConflict("keep-local")}>
          <Upload size={14} />
        </ActionIconButton>
        <ActionIconButton label={`Usar GitHub para ${file.name}`} tone="danger" disabled={busy} onClick={() => onRequestResolveGithubConflict("take-remote")}>
          <Download size={14} />
        </ActionIconButton>
      </div>
    );
  }

  if (canUseGithub && file.githubStatus.state === "pending" && syncStatus?.pendingPush) {
    return (
      <div className="flex justify-end gap-1">
        {openDocumentButton}
        <ActionIconButton label={`Subir ${file.name} a GitHub`} tone="primary" disabled={busy} onClick={onPushGithub}>
          <Upload size={14} />
        </ActionIconButton>
      </div>
    );
  }

  if (canUseGithub && file.githubStatus.state === "pending" && syncStatus?.pendingPull) {
    return (
      <div className="flex justify-end gap-1">
        {openDocumentButton}
        <ActionIconButton label={`Actualizar ${file.name} desde GitHub`} tone="primary" disabled={busy} onClick={onPullGithub}>
          <Download size={14} />
        </ActionIconButton>
      </div>
    );
  }

  if (file.githubStatus.state === "error") {
    return (
      <div className="flex justify-end gap-1">
        {openDocumentButton}
        <ActionIconButton label={`Reintentar ${file.name}`} disabled={busy} onClick={onRefresh}>
          <RefreshCw size={14} />
        </ActionIconButton>
      </div>
    );
  }

  if (canUseGithub && file.githubStatus.state === "ok") {
    return (
      <div className="flex justify-end gap-1">
        {openDocumentButton}
        <ActionIconButton label={`Abrir GitHub para ${file.name}`} disabled={busy} onClick={onOpenGithubRepository}>
          <Github size={14} />
        </ActionIconButton>
      </div>
    );
  }

  return <div className="flex justify-end gap-1">{openDocumentButton}</div>;
}

function ActionIconButton({
  label,
  tone = "default",
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone?: "default" | "primary" | "danger" | "active";
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const className = {
    default: "border-line text-ink-secondary hover:bg-panel hover:text-ink-primary",
    primary: "border-brand-orange bg-brand-orange text-white hover:bg-brand-dark",
    danger: "border-red-200 text-red-700 hover:bg-red-50",
    active: "border-line bg-panel text-ink-primary",
  }[tone];
  return (
    <button
      type="button"
      className={["grid h-8 w-8 place-items-center rounded-md border disabled:cursor-not-allowed disabled:opacity-50", className].join(" ")}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function GithubConflictConfirmationDialog({
  resolution,
  busy,
  onCancel,
  onConfirm,
}: {
  resolution: "keep-local" | "take-remote";
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const keepLocal = resolution === "keep-local";
  return (
    <div className="knownext-modal-overlay absolute inset-0 z-10 grid place-items-center bg-black/25 px-4" onMouseDown={onCancel}>
      <section className="w-[min(480px,calc(100vw-56px))] rounded-lg border border-line bg-white p-5 shadow-menu" role="dialog" aria-modal="true" aria-labelledby="github-conflict-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-red-50 text-red-700">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h3 id="github-conflict-confirm-title" className="text-[15px] font-semibold text-ink-primary">
              {keepLocal ? "Usar la versión de este equipo" : "Usar la versión de GitHub"}
            </h3>
            <p className="mt-2 text-[12px] leading-5 text-ink-secondary">
              {keepLocal
                ? "KnowNext.ai subirá el historial local y GitHub quedará alineado con esta copia."
                : "KnowNext.ai descargará la versión de GitHub y esta copia local quedará alineada con el repositorio remoto."}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="h-9 rounded-md border border-line px-4 text-[12px] font-medium hover:bg-panel" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
          <button className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-orange px-4 text-[12px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50" disabled={busy} onClick={onConfirm}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : keepLocal ? <Upload size={14} /> : <Download size={14} />}
            Confirmar
          </button>
        </div>
      </section>
    </div>
  );
}

function buildDisplayFiles(
  project: Project | null,
  overview: ProjectFileSyncOverview | null,
  drafts: OpenDocumentDraftState[],
  syncStatus?: ProjectSyncStatus | null,
) {
  const draftByPath = new Map(drafts.map((draft) => [normalizePath(draft.path), draft]));
  const files: DisplayFileSyncItem[] = (overview?.files ?? []).map((file) => {
    const draft = draftByPath.get(normalizePath(file.path)) ?? null;
    if (!draft) return file;
    return {
      ...file,
      draft,
      localStatus: {
        state: "draft",
        label: "Borrador",
        detail: "Hay cambios abiertos pendientes de guardar en disco.",
      },
      historyStatus: {
        state: "waiting",
        label: "Esperando local",
        detail: "Guarda el borrador antes de crear historial.",
      },
      githubStatus: hasGithub(project)
        ? {
            state: "waiting",
            label: "Esperando local",
            detail: "GitHub esperará hasta guardar el borrador.",
          }
        : file.githubStatus,
    };
  });

  for (const draft of drafts) {
    if (files.some((file) => normalizePath(file.path) === normalizePath(draft.path))) continue;
    files.push({
      id: draft.documentId,
      projectId: project?.id ?? "",
      path: draft.path,
      name: draft.name,
      kind: "document",
      modifiedAt: draft.draftUpdatedAt ?? null,
      sizeBytes: null,
      localStatus: { state: "draft", label: "Borrador", detail: "Hay cambios abiertos pendientes de guardar en disco." },
      historyStatus: { state: "waiting", label: "Esperando local", detail: "Guarda el borrador antes de crear historial." },
      githubStatus: hasGithub(project)
        ? { state: "waiting", label: "Esperando local", detail: "GitHub esperará hasta guardar el borrador." }
        : { state: "unavailable", label: "No conectado", detail: "Este proyecto no usa GitHub." },
      change: null,
      conflictId: null,
      draft,
    });
  }

  return files.sort((left, right) => {
    const leftDate = left.modifiedAt ?? left.draft?.draftUpdatedAt ?? "";
    const rightDate = right.modifiedAt ?? right.draft?.draftUpdatedAt ?? "";
    return rightDate.localeCompare(leftDate) || left.path.localeCompare(right.path);
  });
}

function buildPhaseFilterOptions(files: DisplayFileSyncItem[]): Record<FileSyncFilterPhase, FileSyncFilterOption[]> {
  return {
    local: buildPhaseOptions(files, "local"),
    history: buildPhaseOptions(files, "history"),
    github: buildPhaseOptions(files, "github"),
  };
}

function buildPhaseOptions(files: DisplayFileSyncItem[], phase: FileSyncFilterPhase): FileSyncFilterOption[] {
  const options = new Map<ProjectFileSyncPhaseState, FileSyncFilterOption>();
  for (const file of files) {
    const status = getPhaseStatus(file, phase);
    const current = options.get(status.state);
    options.set(status.state, {
      state: status.state,
      label: status.label,
      count: (current?.count ?? 0) + 1,
    });
  }
  return Array.from(options.values()).sort((left, right) => statusSortWeight(left.state) - statusSortWeight(right.state) || left.label.localeCompare(right.label));
}

function fileMatchesPhaseFilters(file: DisplayFileSyncItem, filters: FileSyncFilterState) {
  return filterPhases.every((phase) => {
    const selected = filters[phase.id];
    return selected.length === 0 || selected.includes(getPhaseStatus(file, phase.id).state);
  });
}

function togglePhaseFilter(filters: FileSyncFilterState, phase: FileSyncFilterPhase, state: ProjectFileSyncPhaseState): FileSyncFilterState {
  const selected = filters[phase];
  const nextSelected = selected.includes(state)
    ? selected.filter((value) => value !== state)
    : [...selected, state];
  return { ...filters, [phase]: nextSelected };
}

function getPhaseStatus(file: DisplayFileSyncItem, phase: FileSyncFilterPhase) {
  if (phase === "local") return file.localStatus;
  if (phase === "history") return file.historyStatus;
  return file.githubStatus;
}

function statusSortWeight(state: ProjectFileSyncPhaseState) {
  if (state === "conflict" || state === "error" || state === "blocked") return 0;
  if (state === "draft" || state === "pending" || state === "waiting" || state === "omitted") return 1;
  if (state === "ok") return 2;
  return 3;
}

function hasAttention(file: DisplayFileSyncItem) {
  return [file.localStatus.state, file.historyStatus.state, file.githubStatus.state].some((state) =>
    ["draft", "pending", "waiting", "conflict", "blocked", "omitted", "error"].includes(state),
  );
}

function hasConflict(file: DisplayFileSyncItem) {
  return [file.localStatus.state, file.historyStatus.state, file.githubStatus.state].some((state) => state === "conflict" || state === "error");
}

function isOmittedFile(file: DisplayFileSyncItem) {
  return file.historyStatus.state === "omitted" || file.change?.risk === "blocked";
}

function isIncludeDecision(file: DisplayFileSyncItem, decisions: Record<string, ExternalChangeDecision>) {
  if (!file.change || file.change.risk === "blocked") return false;
  return (decisions[file.change.itemId] ?? file.change.decision) === "include";
}

function getHeaderSummary(
  files: DisplayFileSyncItem[],
  overviewError: string | null | undefined,
  busy: boolean,
  syncStatus: ProjectSyncStatus | null | undefined,
  syncState: ProjectSyncState,
  message?: string | null,
) {
  const attention = files.filter(hasAttention).length;
  const conflicts = files.filter(hasConflict).length;
  const drafts = files.filter((file) => file.localStatus.state === "draft").length;
  const detail = message || syncStatus?.detail || "Revisa el estado local, historial y GitHub por archivo.";
  if (overviewError) {
    return {
      icon: AlertTriangle,
      iconClass: "bg-red-50 text-red-700",
      detail: "No se pudo cargar la lista de archivos.",
      footer: "No se pudo cargar el estado de archivos.",
    };
  }
  if (busy) {
    return {
      icon: RefreshCw,
      iconClass: "bg-brand-hover text-brand-orange",
      detail: "Comprobando archivos, historial y GitHub.",
      footer: "Comprobando el estado del proyecto.",
    };
  }
  if (conflicts > 0 || syncState === "conflict" || syncStatus?.hasConflicts) {
    return {
      icon: AlertTriangle,
      iconClass: "bg-red-50 text-red-700",
      detail: `${conflicts || 1} conflicto(s) requieren decisión.`,
      footer: "Hay conflictos que requieren elegir una versión.",
    };
  }
  if (drafts > 0) {
    return {
      icon: HardDrive,
      iconClass: "bg-brand-hover text-brand-orange",
      detail: `${drafts} borrador(es) pendientes de guardar.`,
      footer: "Guarda o descarta los borradores antes de sincronizar.",
    };
  }
  if (attention > 0) {
    return {
      icon: GitBranch,
      iconClass: "bg-brand-hover text-brand-orange",
      detail: `${attention} archivo(s) necesitan atención.`,
      footer: detail,
    };
  }
  return {
    icon: CheckCircle2,
    iconClass: "bg-green-50 text-green-700",
    detail: "Todos los archivos están al día.",
    footer: "No hay acciones pendientes.",
  };
}

function hasGithub(project: Project | null) {
  return Boolean(project?.githubRepository || project?.syncMode === "manual-github" || project?.syncMode === "auto-github");
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function getFileIcon(kind: ProjectFileSyncItem["kind"]) {
  if (kind === "folder") return FolderOpen;
  if (kind === "document") return FileText;
  if (kind === "image") return FileImage;
  if (kind === "private" || kind === "ignored") return ShieldAlert;
  return File;
}

function statusBadgeClass(state: ProjectFileSyncPhaseState) {
  if (state === "ok") return "bg-green-50 text-green-700";
  if (state === "conflict" || state === "error" || state === "blocked") return "bg-red-50 text-red-700";
  if (state === "unavailable") return "bg-panel text-ink-secondary";
  return "bg-brand-hover text-brand-orange";
}

function statusDotClass(state: ProjectFileSyncPhaseState) {
  if (state === "ok") return "bg-green-600";
  if (state === "conflict" || state === "error" || state === "blocked") return "bg-red-600";
  if (state === "unavailable") return "bg-ink-secondary";
  return "bg-brand-orange";
}

function formatParentPath(path: string) {
  const normalized = normalizePath(path);
  const parent = normalized.split("/").slice(0, -1).join(" / ");
  return parent ? `/${parent}` : "/Raíz";
}

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}
