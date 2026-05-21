import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Cloud,
  Download,
  File,
  FileImage,
  FileText,
  Folder,
  GitBranch,
  Github,
  HardDrive,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  ActivityEvent,
  ExternalChangeDecision,
  ExternalChangeItem,
  ExternalChangeKind,
  ExternalChangeSet,
  Project,
  ProjectSyncState,
  ProjectSyncStatus,
} from "../../types/domain";

type ExternalChangesDrawerProps = {
  open: boolean;
  project: Project | null;
  changeSet: ExternalChangeSet | null;
  decisions: Record<string, ExternalChangeDecision>;
  activityEvents: ActivityEvent[];
  syncStatus?: ProjectSyncStatus | null;
  syncState: ProjectSyncState;
  acknowledged: boolean;
  busy: boolean;
  message?: string | null;
  onDecisionChange: (itemId: string, decision: ExternalChangeDecision) => void;
  onImport: () => void;
  onImportSafe: () => void;
  onOmitAll: () => void;
  onPushGithub: () => void;
  onPullGithub: () => void;
  onRefresh: () => void;
  onClose: () => void;
};

type ProtectionTab = "summary" | "local" | "github" | "omitted" | "activity" | "details";
type ProtectionPrimaryAction =
  | "refresh"
  | "save-recommended"
  | "save-selected"
  | "accept-omitted"
  | "push-github"
  | "pull-github"
  | "review-github"
  | "none";

const saveableGroupOrder: Array<{ key: ExternalChangeKind; title: string }> = [
  { key: "folder", title: "Carpetas" },
  { key: "document", title: "Documentos" },
  { key: "image", title: "Imágenes" },
  { key: "attachment", title: "Archivos de apoyo" },
];

const omittedGroupOrder: Array<{ key: ExternalChangeKind; title: string }> = [
  { key: "private", title: "Omitidos por seguridad" },
  { key: "ignored", title: "Omitidos automáticamente" },
  { key: "unsupported", title: "No compatibles" },
];

export function ExternalChangesDrawer({
  open,
  project,
  changeSet,
  decisions,
  activityEvents,
  syncStatus,
  syncState,
  acknowledged,
  busy,
  message,
  onDecisionChange,
  onImport,
  onImportSafe,
  onOmitAll,
  onPushGithub,
  onPullGithub,
  onRefresh,
  onClose,
}: ExternalChangesDrawerProps) {
  const [activeTab, setActiveTab] = useState<ProtectionTab>("summary");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<ExternalChangeKind>>(new Set(["ignored", "unsupported"]));
  const items = changeSet?.items ?? [];
  const saveableItems = useMemo(() => items.filter((item) => item.risk !== "blocked"), [items]);
  const omittedItems = useMemo(() => items.filter((item) => item.risk === "blocked"), [items]);
  const groupedSaveableItems = useMemo(() => groupItems(saveableItems), [saveableItems]);
  const groupedOmittedItems = useMemo(() => groupItems(omittedItems), [omittedItems]);
  const selectedCount = saveableItems.filter((item) => (decisions[item.id] ?? item.decision) === "include").length;
  const summary = getProtectionSummary(project, changeSet, syncStatus, syncState, busy, acknowledged);
  const githubAttentionCount = summary.githubAttention ? 1 : 0;
  const canSaveRecommended = Boolean(changeSet?.summary.safe);
  const canAcceptOmitted = omittedItems.length > 0 && !acknowledged;

  if (!open) return null;

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/20 px-4 py-8" onMouseDown={onClose}>
      <section
        className="flex max-h-[min(820px,calc(100vh-56px))] w-[min(920px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="protection-history-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="border-b border-line">
          <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className={["grid h-9 w-9 shrink-0 place-items-center rounded-md", summary.iconClass].join(" ")}>
                <summary.icon size={18} />
              </span>
              <div className="min-w-0">
                <h2 id="protection-history-title" className="truncate text-[16px] font-semibold text-ink-primary">
                  Protección e historial
                </h2>
                <p className="mt-1 truncate text-[11px] text-ink-secondary">
                  {project?.name ?? "Proyecto"} · Revisa cómo se guarda, versiona y sincroniza tu documentación.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-50"
                data-tooltip="Comprobar de nuevo"
                aria-label="Comprobar protección e historial de nuevo"
                disabled={busy}
                onClick={onRefresh}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              </button>
              <button
                className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
                data-tooltip="Cerrar"
                aria-label="Cerrar protección e historial"
                onClick={onClose}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <nav className="flex gap-1 px-5" aria-label="Secciones de protección e historial">
            <TabButton active={activeTab === "summary"} label="Resumen" onClick={() => setActiveTab("summary")} />
            <TabButton active={activeTab === "local"} label="Historial local" count={saveableItems.length} onClick={() => setActiveTab("local")} />
            <TabButton active={activeTab === "github"} label="GitHub" count={githubAttentionCount || undefined} onClick={() => setActiveTab("github")} />
            <TabButton active={activeTab === "omitted"} label="Omitidos" count={omittedItems.length} onClick={() => setActiveTab("omitted")} />
            <TabButton active={activeTab === "activity"} label="Actividad" count={activityEvents.length || undefined} onClick={() => setActiveTab("activity")} />
            <TabButton active={activeTab === "details"} label="Detalles" onClick={() => setActiveTab("details")} />
          </nav>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {activeTab === "summary" ? (
            <SummaryTab
              summary={summary}
              acknowledged={acknowledged}
              message={message}
              changeSet={changeSet}
              saveableCount={saveableItems.length}
              omittedCount={omittedItems.length}
              selectedCount={selectedCount}
              canSaveRecommended={canSaveRecommended}
              canAcceptOmitted={canAcceptOmitted}
              busy={busy}
              onRefresh={onRefresh}
              onImportSafe={onImportSafe}
              onImport={onImport}
              onOmitAll={onOmitAll}
              onPushGithub={onPushGithub}
              onPullGithub={onPullGithub}
              onTabChange={setActiveTab}
            />
          ) : null}

          {activeTab === "local" ? (
            <FilesTab
              title="Cambios locales para guardar en el historial"
              description="Estos cambios existen en la carpeta del proyecto, pero todavía no forman parte del historial de KnowNext.ai."
              emptyTitle="No hay cambios pendientes de guardar"
              emptyDetail="La documentación visible ya está recogida en el historial."
              groupOrder={saveableGroupOrder}
              groupedItems={groupedSaveableItems}
              collapsedGroups={collapsedGroups}
              decisions={decisions}
              onToggleGroup={toggleGroup}
              onDecisionChange={onDecisionChange}
            />
          ) : null}

          {activeTab === "github" ? (
            <GithubTab
              project={project}
              summary={summary}
              syncStatus={syncStatus}
              busy={busy}
              onPushGithub={onPushGithub}
              onPullGithub={onPullGithub}
              onRefresh={onRefresh}
            />
          ) : null}

          {activeTab === "omitted" ? (
            <FilesTab
              title="Archivos omitidos"
              description="Estos archivos se mantienen en tu carpeta, pero KnowNext.ai no los guarda en el historial ni los sube a GitHub."
              emptyTitle="No hay archivos omitidos"
              emptyDetail="No se han detectado archivos privados, técnicos o no compatibles."
              groupOrder={omittedGroupOrder}
              groupedItems={groupedOmittedItems}
              collapsedGroups={collapsedGroups}
              decisions={decisions}
              onToggleGroup={toggleGroup}
              onDecisionChange={onDecisionChange}
              acknowledged={acknowledged}
            />
          ) : null}

          {activeTab === "activity" ? (
            <ActivityTab events={activityEvents} />
          ) : null}

          {activeTab === "details" ? (
            <DetailsTab project={project} syncStatus={syncStatus} syncState={syncState} changeSet={changeSet} acknowledged={acknowledged} />
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-4">
          <div className="min-w-0 text-[11px] text-ink-secondary">
            {summary.footerText}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="h-9 rounded-md border border-line px-3 text-[11px] font-medium hover:bg-panel" disabled={busy} onClick={onRefresh}>
              Comprobar de nuevo
            </button>
            {summary.primaryAction !== "none" ? (
              <PrimarySummaryAction
                action={summary.primaryAction}
                busy={busy}
                canSaveRecommended={canSaveRecommended}
                canAcceptOmitted={canAcceptOmitted}
                selectedCount={selectedCount}
                onImportSafe={onImportSafe}
                onImport={onImport}
                onOmitAll={onOmitAll}
                onPushGithub={onPushGithub}
                onPullGithub={onPullGithub}
                onRefresh={onRefresh}
                onTabChange={setActiveTab}
              />
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  );

  function toggleGroup(group: ExternalChangeKind) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }
}

function TabButton({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button
      className={[
        "flex h-10 items-center gap-2 border-b-2 px-3 text-[12px] font-semibold transition",
        active ? "border-brand-orange text-brand-orange" : "border-transparent text-ink-secondary hover:text-ink-primary",
      ].join(" ")}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {label}
      {typeof count === "number" ? (
        <span className={["rounded px-1.5 py-0.5 text-[10px]", active ? "bg-brand-hover text-brand-orange" : "bg-panel text-ink-secondary"].join(" ")}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

function SummaryTab({
  summary,
  acknowledged,
  message,
  changeSet,
  saveableCount,
  omittedCount,
  selectedCount,
  canSaveRecommended,
  canAcceptOmitted,
  busy,
  onRefresh,
  onImportSafe,
  onImport,
  onOmitAll,
  onPushGithub,
  onPullGithub,
  onTabChange,
}: {
  summary: ProtectionSummary;
  acknowledged: boolean;
  message?: string | null;
  changeSet: ExternalChangeSet | null;
  saveableCount: number;
  omittedCount: number;
  selectedCount: number;
  canSaveRecommended: boolean;
  canAcceptOmitted: boolean;
  busy: boolean;
  onRefresh: () => void;
  onImportSafe: () => void;
  onImport: () => void;
  onOmitAll: () => void;
  onPushGithub: () => void;
  onPullGithub: () => void;
  onTabChange: (tab: ProtectionTab) => void;
}) {
  const explanation = acknowledged ? summary.recommendationDetail : message || changeSet?.message || summary.recommendationDetail;
  return (
    <div className="space-y-4">
      <section className={["rounded-md border px-4 py-4", summary.calloutClass].join(" ")}>
        <div className="flex items-start gap-3">
          <span className={["grid h-9 w-9 shrink-0 place-items-center rounded-md", summary.iconClass].join(" ")}>
            <summary.icon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink-primary">{summary.recommendationTitle}</p>
            <p className="mt-1 text-[12px] leading-5 text-ink-secondary">{explanation}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-2 md:grid-cols-4">
        <SummaryCard icon={summary.protectionIcon} label="Protección" value={summary.protection} />
        <SummaryCard icon={summary.syncIcon} label="Modo" value={summary.syncMode} />
        <SummaryCard icon={summary.statusIcon} label="Situación" value={summary.status} tone={summary.tone} />
        <SummaryCard icon={RefreshCw} label="Última sincronización" value={summary.lastActivity} />
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <div className="flex items-start gap-3">
          <Info size={17} className="mt-0.5 shrink-0 text-ink-secondary" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-semibold text-ink-primary">Qué significa</h3>
            <p className="mt-1 text-[12px] leading-5 text-ink-secondary">{summary.userExplanation}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="h-8 rounded-md border border-line px-3 text-[11px] font-medium hover:bg-panel" onClick={() => onTabChange("local")}>
                Ver historial local ({saveableCount})
              </button>
              <button className="h-8 rounded-md border border-line px-3 text-[11px] font-medium hover:bg-panel" onClick={() => onTabChange("github")}>
                Ver GitHub
              </button>
              <button className="h-8 rounded-md border border-line px-3 text-[11px] font-medium hover:bg-panel" onClick={() => onTabChange("omitted")}>
                Ver omitidos ({omittedCount})
              </button>
              <button className="h-8 rounded-md border border-line px-3 text-[11px] font-medium hover:bg-panel" onClick={() => onTabChange("activity")}>
                Ver actividad
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-line bg-panel p-4">
        <h3 className="text-[13px] font-semibold text-ink-primary">Acción recomendada</h3>
        <p className="mt-1 text-[12px] leading-5 text-ink-secondary">{summary.actionDetail}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <PrimarySummaryAction
            action={summary.primaryAction}
            busy={busy}
            canSaveRecommended={canSaveRecommended}
            canAcceptOmitted={canAcceptOmitted}
            selectedCount={selectedCount}
            onImportSafe={onImportSafe}
            onImport={onImport}
            onOmitAll={onOmitAll}
            onPushGithub={onPushGithub}
            onPullGithub={onPullGithub}
            onRefresh={onRefresh}
            onTabChange={onTabChange}
          />
        </div>
      </section>
    </div>
  );
}

function PrimarySummaryAction({
  action,
  busy,
  canSaveRecommended,
  canAcceptOmitted,
  selectedCount,
  onImportSafe,
  onImport,
  onOmitAll,
  onPushGithub,
  onPullGithub,
  onRefresh,
  onTabChange,
}: {
  action: ProtectionPrimaryAction;
  busy: boolean;
  canSaveRecommended: boolean;
  canAcceptOmitted: boolean;
  selectedCount: number;
  onImportSafe: () => void;
  onImport: () => void;
  onOmitAll: () => void;
  onPushGithub: () => void;
  onPullGithub: () => void;
  onRefresh: () => void;
  onTabChange: (tab: ProtectionTab) => void;
}) {
  if (action === "push-github") {
    return (
      <button className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50" disabled={busy} onClick={onPushGithub}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        Subir historial a GitHub
      </button>
    );
  }
  if (action === "pull-github") {
    return (
      <button className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50" disabled={busy} onClick={onPullGithub}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        Actualizar desde GitHub
      </button>
    );
  }
  if (action === "review-github") {
    return (
      <button className="h-9 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={() => onTabChange("github")}>
        Ver diferencias en GitHub
      </button>
    );
  }
  if (action === "save-recommended" && canSaveRecommended) {
    return (
      <button className="h-9 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50" disabled={busy} onClick={onImportSafe}>
        Guardar en historial
      </button>
    );
  }
  if (action === "save-selected" && selectedCount > 0) {
    return (
      <button className="h-9 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50" disabled={busy} onClick={onImport}>
        Guardar seleccionados
      </button>
    );
  }
  if (action === "accept-omitted" && canAcceptOmitted) {
    return (
      <button className="h-9 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50" disabled={busy} onClick={onOmitAll}>
        Aceptar omitidos
      </button>
    );
  }
  if (action === "none") {
    return <span className="text-[11px] font-medium text-green-700">No hay acciones pendientes.</span>;
  }
  return (
    <button className="h-9 rounded-md border border-line px-3 text-[11px] font-medium hover:bg-white" disabled={busy} onClick={onRefresh}>
      Comprobar de nuevo
    </button>
  );
}

function GithubTab({
  project,
  summary,
  syncStatus,
  busy,
  onPushGithub,
  onPullGithub,
  onRefresh,
}: {
  project: Project | null;
  summary: ProtectionSummary;
  syncStatus?: ProjectSyncStatus | null;
  busy: boolean;
  onPushGithub: () => void;
  onPullGithub: () => void;
  onRefresh: () => void;
}) {
  const repository = project?.githubRepository ? `${project.githubRepository.owner}/${project.githubRepository.repo}` : "No conectado";
  return (
    <section className="space-y-3">
      <div className={["rounded-md border px-4 py-4", summary.calloutClass].join(" ")}>
        <div className="flex items-start gap-3">
          <span className={["grid h-9 w-9 shrink-0 place-items-center rounded-md", summary.iconClass].join(" ")}>
            <summary.statusIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold text-ink-primary">{summary.githubTitle}</h3>
            <p className="mt-1 text-[12px] leading-5 text-ink-secondary">{summary.githubDetail}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimarySummaryAction
                action={summary.primaryAction}
                busy={busy}
                canSaveRecommended={false}
                canAcceptOmitted={false}
                selectedCount={0}
                onImportSafe={() => undefined}
                onImport={() => undefined}
                onOmitAll={() => undefined}
                onPushGithub={onPushGithub}
                onPullGithub={onPullGithub}
                onRefresh={onRefresh}
                onTabChange={() => undefined}
              />
              {summary.primaryAction !== "refresh" ? (
                <button className="h-9 rounded-md border border-line px-3 text-[11px] font-medium hover:bg-panel" disabled={busy} onClick={onRefresh}>
                  Comprobar de nuevo
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <dl className="grid gap-2 text-[11px] md:grid-cols-2">
        <DetailItem label="Repositorio" value={repository} />
        <DetailItem label="Modo" value={summary.syncMode} />
        <DetailItem label="Estado" value={summary.status} />
        <DetailItem label="Última sincronización" value={summary.lastActivity} />
        <DetailItem label="Versión local" value={syncStatus?.lastLocalVersionHash?.slice(0, 7) ?? "No disponible"} />
        <DetailItem label="Versión en GitHub" value={syncStatus?.lastRemoteHash?.slice(0, 7) ?? "No disponible"} />
      </dl>
    </section>
  );
}

function ActivityTab({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <section className="rounded-md border border-line bg-white px-4 py-8 text-center">
        <Clock3 size={24} className="mx-auto text-ink-secondary" />
        <p className="mt-2 text-[12px] font-semibold text-ink-primary">Todavía no hay actividad registrada</p>
        <p className="mt-1 text-[11px] text-ink-secondary">
          Las próximas acciones de historial, GitHub y seguridad aparecerán aquí.
        </p>
      </section>
    );
  }

  const grouped = groupActivityEvents(events);
  return (
    <section className="rounded-md border border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-[13px] font-semibold text-ink-primary">Actividad reciente</h3>
        <p className="mt-0.5 text-[11px] leading-5 text-ink-secondary">
          Consulta las últimas acciones relevantes de historial, GitHub y archivos omitidos.
        </p>
      </div>
      <div className="divide-y divide-line/70">
        {grouped.map((group) => (
          <section key={group.label} className="px-4 py-3">
            <h4 className="mb-2 text-[10px] font-semibold uppercase text-ink-secondary">{group.label}</h4>
            <div className="space-y-2">
              {group.events.map((event) => (
                <ActivityEventRow key={event.id} event={event} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function ActivityEventRow({ event }: { event: ActivityEvent }) {
  const Icon = activityIcon(event);
  return (
    <article className="flex min-h-12 gap-3 rounded-md px-2 py-2 hover:bg-panel">
      <span className={["mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md", activityIconClass(event.tone)].join(" ")}>
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h5 className="truncate text-[12px] font-semibold text-ink-primary">{event.title}</h5>
          <span className={["shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold", activityBadgeClass(event.tone)].join(" ")}>
            {activityToneLabel(event.tone)}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] leading-5 text-ink-secondary">{event.message}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-secondary">
          <span>{formatActivityTime(event.createdAt)}</span>
          {event.documentPath ? <span>{formatItemPath(event.documentPath)}</span> : null}
          {event.repository ? <span>{event.repository}</span> : null}
        </div>
      </div>
    </article>
  );
}

function groupActivityEvents(events: ActivityEvent[]) {
  const groups: Array<{ label: string; events: ActivityEvent[] }> = [];
  for (const event of events) {
    const label = activityDayLabel(event.createdAt);
    const group = groups.find((candidate) => candidate.label === label);
    if (group) group.events.push(event);
    else groups.push({ label, events: [event] });
  }
  return groups;
}

function activityIcon(event: ActivityEvent) {
  if (event.scope === "github") return event.type.includes("pull") ? Download : event.type.includes("push") ? Upload : Github;
  if (event.scope === "security") return ShieldCheck;
  if (event.scope === "history") return GitBranch;
  if (event.scope === "document") return FileText;
  return Clock3;
}

function activityIconClass(tone: ActivityEvent["tone"]) {
  if (tone === "success") return "bg-green-50 text-green-700";
  if (tone === "warning") return "bg-brand-hover text-brand-orange";
  if (tone === "danger") return "bg-red-50 text-red-700";
  return "bg-panel text-ink-secondary";
}

function activityBadgeClass(tone: ActivityEvent["tone"]) {
  if (tone === "success") return "bg-green-50 text-green-700";
  if (tone === "warning") return "bg-brand-hover text-brand-orange";
  if (tone === "danger") return "bg-red-50 text-red-700";
  return "bg-panel text-ink-secondary";
}

function activityToneLabel(tone: ActivityEvent["tone"]) {
  if (tone === "success") return "Completado";
  if (tone === "warning") return "Pendiente";
  if (tone === "danger") return "Error";
  return "Info";
}

function FilesTab({
  title,
  description,
  emptyTitle,
  emptyDetail,
  groupOrder,
  groupedItems,
  collapsedGroups,
  decisions,
  onToggleGroup,
  onDecisionChange,
  acknowledged = false,
}: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDetail: string;
  groupOrder: Array<{ key: ExternalChangeKind; title: string }>;
  groupedItems: Partial<Record<ExternalChangeKind, ExternalChangeItem[]>>;
  collapsedGroups: Set<ExternalChangeKind>;
  decisions: Record<string, ExternalChangeDecision>;
  onToggleGroup: (group: ExternalChangeKind) => void;
  onDecisionChange: (itemId: string, decision: ExternalChangeDecision) => void;
  acknowledged?: boolean;
}) {
  const total = Object.values(groupedItems).reduce((count, items) => count + (items?.length ?? 0), 0);
  return (
    <section className="rounded-md border border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-[13px] font-semibold text-ink-primary">{title}</h3>
        <p className="mt-0.5 text-[11px] leading-5 text-ink-secondary">{description}</p>
      </div>
      {total > 0 ? (
        <div className="p-2">
          {groupOrder.map((group) => {
            const items = groupedItems[group.key] ?? [];
            if (items.length === 0) return null;
            const collapsed = collapsedGroups.has(group.key);
            return (
              <section key={group.key} className="border-b border-line/70 last:border-b-0">
                <button
                  className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] font-semibold text-ink-primary hover:bg-panel"
                  onClick={() => onToggleGroup(group.key)}
                >
                  {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span className="flex-1">{group.title}</span>
                  <span className="font-normal text-ink-secondary">{items.length}</span>
                </button>
                {!collapsed ? (
                  <div className="space-y-1 pb-2">
                    {items.map((item) => (
                      <ChangeItemRow
                        key={item.id}
                        item={item}
                        decision={decisions[item.id] ?? item.decision}
                        onDecisionChange={onDecisionChange}
                        acknowledged={acknowledged}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-8 text-center">
          <ShieldCheck size={24} className="mx-auto text-green-600" />
          <p className="mt-2 text-[12px] font-semibold text-ink-primary">{emptyTitle}</p>
          <p className="mt-1 text-[11px] text-ink-secondary">{emptyDetail}</p>
        </div>
      )}
    </section>
  );
}

function DetailsTab({
  project,
  syncStatus,
  syncState,
  changeSet,
  acknowledged,
}: {
  project: Project | null;
  syncStatus?: ProjectSyncStatus | null;
  syncState: ProjectSyncState;
  changeSet: ExternalChangeSet | null;
  acknowledged: boolean;
}) {
  return (
    <section className="rounded-md border border-line bg-panel px-4 py-3">
      <h3 className="text-[13px] font-semibold text-ink-primary">Detalles técnicos</h3>
      <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
        Información de soporte para entender la carpeta local, Git y GitHub. No hace falta revisarla para editar documentación.
      </p>
      <dl className="mt-3 grid gap-2 text-[11px] md:grid-cols-2">
        <DetailItem label="Carpeta local" value={project?.folderPath ?? "No disponible"} />
        <DetailItem label="Repositorio GitHub" value={project?.githubRepository ? `${project.githubRepository.owner}/${project.githubRepository.repo}` : "No conectado"} />
        <DetailItem label="Estado técnico" value={syncStatus?.state ?? syncState} />
        <DetailItem label="Última versión local" value={syncStatus?.lastLocalVersionHash?.slice(0, 7) ?? "No disponible"} />
        <DetailItem label="Última versión GitHub" value={syncStatus?.lastRemoteHash?.slice(0, 7) ?? "No disponible"} />
        <DetailItem label="Revisión de omitidos" value={acknowledged ? "Aceptada" : changeSet?.summary.blocked ? "Pendiente" : "Sin omitidos"} />
        <DetailItem label="Cambios detectados" value={String(changeSet?.summary.total ?? 0)} />
        <DetailItem label="Último aviso" value={syncStatus?.detail ?? "Sin avisos técnicos"} />
      </dl>
    </section>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof HardDrive;
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warning" | "danger";
}) {
  const toneClass =
    tone === "ok"
      ? "text-green-700"
      : tone === "warning"
        ? "text-brand-orange"
        : tone === "danger"
          ? "text-red-700"
          : "text-ink-secondary";
  return (
    <div className="flex min-h-[68px] items-center gap-3 rounded-md border border-line bg-white px-3 py-2">
      <Icon size={16} className={["shrink-0", toneClass].join(" ")} />
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase text-ink-secondary">{label}</span>
        <span className="mt-0.5 block truncate text-[12px] font-semibold text-ink-primary">{value}</span>
      </span>
    </div>
  );
}

function ChangeItemRow({
  item,
  decision,
  acknowledged = false,
  onDecisionChange,
}: {
  item: ExternalChangeItem;
  decision: ExternalChangeDecision;
  acknowledged?: boolean;
  onDecisionChange: (itemId: string, decision: ExternalChangeDecision) => void;
}) {
  const Icon = getItemIcon(item.kind);
  const blocked = item.risk === "blocked";
  return (
    <div className="group flex min-h-12 items-center gap-3 rounded-md px-2 py-1.5 hover:bg-brand-hover">
      <button
        className={[
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px]",
          decision === "include" ? "border-brand-orange bg-brand-orange text-white" : "border-line bg-white text-ink-secondary",
          blocked ? "cursor-not-allowed opacity-45" : "",
        ].join(" ")}
        aria-label={blocked ? `${item.name} no se puede guardar automáticamente` : decision === "include" ? `No guardar ${item.name}` : `Guardar ${item.name}`}
        disabled={blocked}
        onClick={() => onDecisionChange(item.id, decision === "include" ? "omit" : "include")}
      >
        {decision === "include" ? <Check size={13} /> : null}
      </button>
      <Icon size={15} className={blocked ? "text-ink-secondary" : item.risk === "review" ? "text-brand-orange" : "text-ink-secondary"} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold text-ink-primary">{item.name}</span>
        <span className="block truncate text-[10px] text-ink-secondary">{formatItemPath(item.path)}</span>
        {item.reason ? <span className="mt-0.5 block truncate text-[10px] text-ink-secondary">{formatItemReason(item.reason)}</span> : null}
      </span>
      <span className={["shrink-0 rounded px-2 py-1 text-[10px] font-semibold", getRiskClass(item, acknowledged)].join(" ")}>
        {getRiskLabel(item, acknowledged)}
      </span>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-line bg-white px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase text-ink-secondary">{label}</dt>
      <dd className="mt-0.5 truncate text-[11px] text-ink-primary">{value}</dd>
    </div>
  );
}

function groupItems(items: ExternalChangeItem[]) {
  return items.reduce<Partial<Record<ExternalChangeKind, ExternalChangeItem[]>>>((groups, item) => {
    groups[item.kind] = [...(groups[item.kind] ?? []), item];
    return groups;
  }, {});
}

function getItemIcon(kind: ExternalChangeKind) {
  if (kind === "folder") return Folder;
  if (kind === "document") return FileText;
  if (kind === "image") return FileImage;
  if (kind === "private") return ShieldAlert;
  return File;
}

function getRiskLabel(item: ExternalChangeItem, acknowledged = false) {
  if (item.risk === "blocked") return acknowledged ? "Omitido aceptado" : item.kind === "private" ? "Omitido por seguridad" : "Omitido";
  if (item.risk === "review") return "Requiere revisión";
  if (item.changeType === "modified") return "Modificado";
  if (item.changeType === "deleted") return "Eliminado";
  return "Recomendado";
}

function getRiskClass(item: ExternalChangeItem, acknowledged = false) {
  if (item.risk === "blocked") return acknowledged ? "bg-green-50 text-green-700" : "bg-brand-hover text-brand-orange";
  if (item.risk === "review") return "bg-orange-50 text-brand-orange";
  return "bg-green-50 text-green-700";
}

type ProtectionSummary = ReturnType<typeof getProtectionSummary>;

function getProtectionSummary(
  project: Project | null,
  changeSet: ExternalChangeSet | null,
  syncStatus: ProjectSyncStatus | null | undefined,
  syncState: ProjectSyncState,
  busy: boolean,
  acknowledged: boolean,
) {
  const total = changeSet?.summary.total ?? 0;
  const blocked = changeSet?.summary.blocked ?? 0;
  const safe = changeSet?.summary.safe ?? 0;
  const review = changeSet?.summary.review ?? 0;
  const localWork = safe + review;
  const state = syncStatus?.state ?? syncState;
  const hasGithub = Boolean(project?.githubRepository) || project?.syncMode === "manual-github" || project?.syncMode === "auto-github";
  const hasLocalGit = hasGithub || project?.versioningMode === "local-git" || project?.isGitRepository || project?.syncMode === "manual-local" || project?.syncMode === "auto-local";
  const protection = hasGithub ? "Historial local + GitHub" : hasLocalGit ? "Historial local" : "Solo archivos locales";
  const syncMode = project?.syncMode?.startsWith("auto") ? "Automático" : project?.syncMode && project.syncMode !== "none" ? "Manual" : "Sin sincronización remota";
  const pendingGithubUpload = Boolean(hasGithub && (syncStatus?.pendingPush || state === "local-pending"));
  const pendingGithubDownload = Boolean(hasGithub && (syncStatus?.pendingPull || state === "remote-available"));
  const needsAttention = busy || state === "conflict" || state === "error" || state === "offline" || review > 0 || blocked > 0 || Boolean(changeSet?.requiresReview);
  const hasPending = total > 0 || syncStatus?.pendingPush || syncStatus?.pendingPull || state === "local-pending" || state === "remote-available" || state === "pending";
  const common = {
    protectionIcon: hasGithub ? Github : hasLocalGit ? GitBranch : HardDrive,
    syncIcon: hasGithub ? Cloud : GitBranch,
    protection,
    syncMode,
    lastActivity: formatDate(syncStatus?.lastSyncAt),
    githubAttention: Boolean(hasGithub && (pendingGithubUpload || pendingGithubDownload || state === "conflict" || syncStatus?.hasConflicts || state === "error" || state === "offline")),
  };

  if (acknowledged && !pendingGithubUpload && !pendingGithubDownload && localWork === 0 && state !== "conflict" && !syncStatus?.hasConflicts && state !== "error" && state !== "offline") {
    return {
      ...common,
      icon: ShieldCheck,
      iconClass: "bg-green-50 text-green-700",
      statusIcon: ShieldCheck,
      status: "Todo correcto",
      tone: "ok" as const,
      calloutClass: "border-green-100 bg-green-50",
      needsAttention: false,
      primaryAction: "none" as ProtectionPrimaryAction,
      footerText: "Los omitidos aceptados siguen visibles para consulta.",
      recommendationTitle: "Archivos omitidos aceptados",
      recommendationDetail: "Los archivos omitidos siguen fuera del historial y no generarán aviso mientras no cambie la revisión detectada.",
      userExplanation: "KnowNext.ai ha detectado archivos que no conviene guardar en el historial, como credenciales o configuración privada. Ya has aceptado que se mantengan fuera.",
      actionDetail: "No tienes que hacer nada ahora. Puedes revisar la pestaña Omitidos si quieres ver qué archivos han quedado fuera.",
      githubTitle: "GitHub no requiere acciones",
      githubDetail: hasGithub ? "La conexión con GitHub no tiene avisos pendientes." : "Este proyecto no tiene GitHub conectado.",
    };
  }

  if (busy) {
    return {
      ...common,
      icon: RefreshCw,
      iconClass: "bg-brand-hover text-brand-orange",
      statusIcon: RefreshCw,
      status: "Comprobando",
      tone: "warning" as const,
      calloutClass: "border-orange-200 bg-brand-hover",
      needsAttention: true,
      primaryAction: "refresh" as ProtectionPrimaryAction,
      footerText: "Comprobando la carpeta y el historial.",
      recommendationTitle: "Comprobando protección e historial",
      recommendationDetail: "KnowNext.ai está revisando la carpeta local, el historial y la conexión remota.",
      userExplanation: "La aplicación está verificando si hay cambios fuera de KnowNext.ai y si el historial está al día.",
      actionDetail: "Espera a que termine la comprobación.",
      githubTitle: "Comprobando GitHub",
      githubDetail: "KnowNext.ai está revisando la conexión y el estado del repositorio.",
    };
  }

  if (state === "error" || state === "offline") {
    return {
      ...common,
      icon: AlertTriangle,
      iconClass: "bg-red-50 text-red-700",
      statusIcon: AlertTriangle,
      status: state === "offline" ? "Sin conexión" : "Error de conexión",
      tone: "danger" as const,
      calloutClass: "border-red-100 bg-red-50",
      needsAttention: true,
      primaryAction: "refresh" as ProtectionPrimaryAction,
      footerText: "No se pudo comprobar GitHub.",
      recommendationTitle: "No se puede comprobar GitHub",
      recommendationDetail: syncStatus?.detail || "Revisa la conexión o vuelve a conectar la cuenta de GitHub desde la configuración del proyecto.",
      userExplanation: "KnowNext.ai no puede confirmar si el historial local y GitHub están sincronizados. La documentación local no se modifica.",
      actionDetail: "Comprueba de nuevo. Si sigue fallando, revisa la cuenta de GitHub en la configuración del proyecto.",
      githubTitle: "GitHub no responde correctamente",
      githubDetail: syncStatus?.detail || "No se pudo validar el repositorio remoto con la conexión actual.",
    };
  }

  if (state === "conflict" || syncStatus?.hasConflicts) {
    return {
      ...common,
      icon: AlertTriangle,
      iconClass: "bg-red-50 text-red-700",
      statusIcon: AlertTriangle,
      status: "Conflicto",
      tone: "danger" as const,
      calloutClass: "border-red-100 bg-red-50",
      needsAttention: true,
      primaryAction: "review-github" as ProtectionPrimaryAction,
      footerText: "Hay conflictos que requieren decisión.",
      recommendationTitle: "Hay cambios incompatibles que resolver",
      recommendationDetail: "Revisa los archivos afectados antes de continuar guardando o sincronizando.",
      userExplanation: "Hay diferencias entre la carpeta local y el historial remoto que KnowNext.ai no puede resolver automáticamente sin riesgo de perder información.",
      actionDetail: "Revisa el detalle y resuelve el conflicto antes de continuar.",
      githubTitle: "Hay diferencias entre este equipo y GitHub",
      githubDetail: "El historial local y GitHub han avanzado por separado. KnowNext.ai necesita que revises la situación antes de subir o descargar cambios.",
    };
  }

  if (pendingGithubDownload) {
    return {
      ...common,
      icon: Download,
      iconClass: "bg-brand-hover text-brand-orange",
      statusIcon: Download,
      status: "GitHub tiene cambios",
      tone: "warning" as const,
      calloutClass: "border-orange-200 bg-brand-hover",
      needsAttention: true,
      primaryAction: "pull-github" as ProtectionPrimaryAction,
      footerText: "Hay una versión en GitHub pendiente de traer.",
      recommendationTitle: "GitHub tiene cambios disponibles",
      recommendationDetail: "Hay cambios en GitHub que todavía no están en este equipo. Actualiza desde GitHub cuando no tengas documentos abiertos con cambios pendientes.",
      userExplanation: "El repositorio remoto contiene una versión más reciente. KnowNext.ai puede traerla para dejar este equipo al día.",
      actionDetail: "Pulsa Actualizar desde GitHub para descargar la última versión del historial.",
      githubTitle: "GitHub tiene una versión más reciente",
      githubDetail: "Puedes descargar los cambios remotos para actualizar la copia local del proyecto.",
    };
  }

  if (localWork > 0 || changeSet?.requiresReview) {
    return {
      ...common,
      icon: AlertTriangle,
      iconClass: "bg-brand-hover text-brand-orange",
      statusIcon: AlertTriangle,
      status: "Revisión necesaria",
      tone: "warning" as const,
      calloutClass: "border-orange-200 bg-brand-hover",
      needsAttention,
      primaryAction: canUseRecommendedAction(safe) ? "save-recommended" as ProtectionPrimaryAction : "save-selected" as ProtectionPrimaryAction,
      footerText: "Hay cambios que requieren una decisión.",
      recommendationTitle: "Hay cambios locales sin guardar en el historial",
      recommendationDetail: "Hay cambios detectados fuera de KnowNext.ai. Decide cuáles deben guardarse en el historial y cuáles deben quedar fuera.",
      userExplanation: "Puede que alguien haya añadido archivos directamente en la carpeta del proyecto, o que existan archivos técnicos que KnowNext.ai no debe guardar.",
      actionDetail: safe > 0 ? "Guarda los cambios en el historial local. Después, si usas GitHub, podrás subir ese historial." : "Revisa la pestaña Historial local y selecciona qué cambios deben guardarse.",
      githubTitle: pendingGithubUpload ? "GitHub queda pendiente hasta guardar los cambios locales" : "GitHub no requiere acciones ahora",
      githubDetail: pendingGithubUpload ? "Primero guarda los cambios locales en el historial. Después podrás subir el historial completo a GitHub." : "No hay una acción de GitHub prioritaria mientras existan cambios locales sin guardar.",
    };
  }

  if (pendingGithubUpload) {
    return {
      ...common,
      icon: Upload,
      iconClass: "bg-brand-hover text-brand-orange",
      statusIcon: Upload,
      status: "Pendiente de subir",
      tone: "warning" as const,
      calloutClass: "border-orange-200 bg-brand-hover",
      needsAttention: true,
      primaryAction: "push-github" as ProtectionPrimaryAction,
      footerText: "Hay historial local pendiente de subir a GitHub.",
      recommendationTitle: "Falta subir el historial local a GitHub",
      recommendationDetail: "Este proyecto ya tiene versiones guardadas en este equipo. GitHub está conectado, pero todavía no tiene esa copia.",
      userExplanation: "La documentación está protegida en el historial local. Para completar el respaldo en GitHub, sube ahora ese historial al repositorio conectado.",
      actionDetail: "Pulsa Subir historial a GitHub. KnowNext.ai enviará las versiones locales y dejará el proyecto sincronizado.",
      githubTitle: "GitHub está conectado, pero falta la primera subida",
      githubDetail: "El repositorio remoto todavía no contiene la copia completa del historial local de este proyecto.",
    };
  }

  if (blocked > 0 && safe === 0) {
    return {
      ...common,
      icon: ShieldAlert,
      iconClass: "bg-brand-hover text-brand-orange",
      statusIcon: ShieldAlert,
      status: "Omitidos pendientes",
      tone: "warning" as const,
      calloutClass: "border-orange-200 bg-brand-hover",
      needsAttention: true,
      primaryAction: "accept-omitted" as ProtectionPrimaryAction,
      footerText: "Hay archivos omitidos pendientes de aceptar.",
      recommendationTitle: "Acepta los archivos omitidos si son esperados",
      recommendationDetail: "KnowNext.ai ha detectado archivos privados o técnicos. No se guardarán en el historial ni se subirán a GitHub.",
      userExplanation: "Estos archivos existen en la carpeta, pero no forman parte de la documentación que conviene versionar. Aceptarlos evita que sigan apareciendo como aviso.",
      actionDetail: "Pulsa Aceptar omitidos para confirmar que deben quedarse fuera del historial.",
      githubTitle: "GitHub no subirá los archivos omitidos",
      githubDetail: "Los archivos privados o técnicos se quedan fuera del historial y no se envían al repositorio remoto.",
    };
  }

  if (safe > 0 || hasPending) {
    return {
      ...common,
      icon: GitBranch,
      iconClass: "bg-brand-hover text-brand-orange",
      statusIcon: GitBranch,
      status: "Cambios pendientes",
      tone: "warning" as const,
      calloutClass: "border-orange-200 bg-brand-hover",
      needsAttention,
      primaryAction: "save-recommended" as ProtectionPrimaryAction,
      footerText: "Hay cambios listos para guardar en el historial.",
      recommendationTitle: "Guarda los cambios en el historial",
      recommendationDetail: "Se han detectado cambios que pueden incorporarse al historial de documentación.",
      userExplanation: "Guardar estos cambios crea una versión local del proyecto y, si corresponde, la deja lista para sincronizar con GitHub.",
      actionDetail: "Guarda los cambios en el historial para que formen parte de las versiones del proyecto.",
      githubTitle: "GitHub esperará al historial local",
      githubDetail: "Primero se guardan los cambios en el historial local. Después se sincronizan con GitHub si el proyecto lo tiene conectado.",
    };
  }

  return {
    ...common,
    icon: ShieldCheck,
    iconClass: "bg-green-50 text-green-700",
    statusIcon: ShieldCheck,
    status: "Todo correcto",
    tone: "ok" as const,
    calloutClass: "border-green-100 bg-green-50",
    needsAttention: false,
    primaryAction: "none" as ProtectionPrimaryAction,
    footerText: "No hay acciones pendientes.",
    recommendationTitle: "Tu documentación está al día",
    recommendationDetail: syncStatus?.detail || "No hay cambios pendientes ni avisos de protección.",
    userExplanation: "La carpeta del proyecto no tiene cambios externos pendientes y el historial no requiere ninguna acción.",
    actionDetail: "Puedes seguir editando. Usa Comprobar de nuevo si quieres revisar la carpeta manualmente.",
    githubTitle: hasGithub ? "GitHub está al día" : "GitHub no está conectado",
    githubDetail: hasGithub ? "El historial local y GitHub están sincronizados." : "Este proyecto se guarda sin copia remota en GitHub.",
  };
}

function canUseRecommendedAction(safe: number) {
  return safe > 0;
}

function formatItemPath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized.includes("/")) return `Raíz del proyecto / ${normalized}`;
  return normalized.split("/").join(" / ");
}

function formatItemReason(reason: string) {
  return reason.replace("No se importa automáticamente", "No se guarda automáticamente");
}

function formatDate(value?: string | null) {
  if (!value) return "No disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No disponible";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatActivityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function activityDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameLocalDate(date, today)) return "Hoy";
  if (sameLocalDate(date, yesterday)) return "Ayer";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(date);
}

function sameLocalDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}
