import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
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
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
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
  syncStatus?: ProjectSyncStatus | null;
  syncState: ProjectSyncState;
  acknowledged: boolean;
  busy: boolean;
  message?: string | null;
  onDecisionChange: (itemId: string, decision: ExternalChangeDecision) => void;
  onImport: () => void;
  onImportSafe: () => void;
  onOmitAll: () => void;
  onRefresh: () => void;
  onClose: () => void;
};

type ProtectionTab = "summary" | "changes" | "omitted" | "details";

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
  syncStatus,
  syncState,
  acknowledged,
  busy,
  message,
  onDecisionChange,
  onImport,
  onImportSafe,
  onOmitAll,
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
            <TabButton active={activeTab === "changes"} label="Cambios para guardar" count={saveableItems.length} onClick={() => setActiveTab("changes")} />
            <TabButton active={activeTab === "omitted"} label="Omitidos" count={omittedItems.length} onClick={() => setActiveTab("omitted")} />
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
              onTabChange={setActiveTab}
            />
          ) : null}

          {activeTab === "changes" ? (
            <FilesTab
              title="Cambios para guardar en el historial"
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
            <button
              className="h-9 rounded-md border border-line px-3 text-[11px] font-medium text-ink-primary hover:bg-panel disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || !canAcceptOmitted}
              onClick={onOmitAll}
            >
              {acknowledged ? "Omitidos aceptados" : "Aceptar omitidos"}
            </button>
            <button
              className="h-9 rounded-md border border-brand-orange px-3 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || !canSaveRecommended}
              onClick={onImportSafe}
            >
              Guardar recomendados
            </button>
            <button
              className="flex h-9 items-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || selectedCount === 0}
              onClick={onImport}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Guardar seleccionados
            </button>
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
        <SummaryCard icon={RefreshCw} label="Última versión" value={summary.lastActivity} />
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <div className="flex items-start gap-3">
          <Info size={17} className="mt-0.5 shrink-0 text-ink-secondary" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-semibold text-ink-primary">Qué significa</h3>
            <p className="mt-1 text-[12px] leading-5 text-ink-secondary">{summary.userExplanation}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="h-8 rounded-md border border-line px-3 text-[11px] font-medium hover:bg-panel" onClick={() => onTabChange("changes")}>
                Ver cambios para guardar ({saveableCount})
              </button>
              <button className="h-8 rounded-md border border-line px-3 text-[11px] font-medium hover:bg-panel" onClick={() => onTabChange("omitted")}>
                Ver omitidos ({omittedCount})
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-line bg-panel p-4">
        <h3 className="text-[13px] font-semibold text-ink-primary">Acción recomendada</h3>
        <p className="mt-1 text-[12px] leading-5 text-ink-secondary">{summary.actionDetail}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {canSaveRecommended ? (
            <button className="h-9 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50" disabled={busy} onClick={onImportSafe}>
              Guardar recomendados
            </button>
          ) : null}
          {selectedCount > 0 ? (
            <button className="h-9 rounded-md border border-brand-orange px-3 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover disabled:opacity-50" disabled={busy} onClick={onImport}>
              Guardar seleccionados
            </button>
          ) : null}
          {canAcceptOmitted ? (
            <button className="h-9 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50" disabled={busy} onClick={onOmitAll}>
              Aceptar omitidos
            </button>
          ) : null}
          {!canSaveRecommended && !canAcceptOmitted && selectedCount === 0 ? (
            <button className="h-9 rounded-md border border-line px-3 text-[11px] font-medium hover:bg-white" disabled={busy} onClick={onRefresh}>
              Comprobar de nuevo
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
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
        <DetailItem label="Revisión de omitidos" value={acknowledged ? "Aceptada" : changeSet?.summary.blocked ? "Pendiente" : "Sin omitidos"} />
        <DetailItem label="Cambios detectados" value={String(changeSet?.summary.total ?? 0)} />
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
  const state = syncStatus?.state ?? syncState;
  const hasGithub = Boolean(project?.githubRepository) || project?.syncMode === "manual-github" || project?.syncMode === "auto-github";
  const hasLocalGit = hasGithub || project?.versioningMode === "local-git" || project?.isGitRepository || project?.syncMode === "manual-local" || project?.syncMode === "auto-local";
  const protection = hasGithub ? "Historial local + GitHub" : hasLocalGit ? "Historial local" : "Solo archivos locales";
  const syncMode = project?.syncMode?.startsWith("auto") ? "Automático" : project?.syncMode && project.syncMode !== "none" ? "Manual" : "Sin sincronización remota";
  const needsAttention = busy || state === "conflict" || state === "error" || state === "offline" || review > 0 || blocked > 0 || Boolean(changeSet?.requiresReview);
  const hasPending = total > 0 || syncStatus?.pendingPush || syncStatus?.pendingPull || state === "local-pending" || state === "remote-available" || state === "pending";
  const common = {
    protectionIcon: hasGithub ? Github : hasLocalGit ? GitBranch : HardDrive,
    syncIcon: hasGithub ? Cloud : GitBranch,
    protection,
    syncMode,
    lastActivity: formatDate(syncStatus?.lastSyncAt),
  };

  if (acknowledged) {
    return {
      ...common,
      icon: ShieldCheck,
      iconClass: "bg-green-50 text-green-700",
      statusIcon: ShieldCheck,
      status: "Todo correcto",
      tone: "ok" as const,
      calloutClass: "border-green-100 bg-green-50",
      needsAttention: false,
      footerText: "Los omitidos aceptados siguen visibles para consulta.",
      recommendationTitle: "Archivos omitidos aceptados",
      recommendationDetail: "Los archivos omitidos siguen fuera del historial y no generarán aviso mientras no cambie la revisión detectada.",
      userExplanation: "KnowNext.ai ha detectado archivos que no conviene guardar en el historial, como credenciales o configuración privada. Ya has aceptado que se mantengan fuera.",
      actionDetail: "No tienes que hacer nada ahora. Puedes revisar la pestaña Omitidos si quieres ver qué archivos han quedado fuera.",
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
      footerText: "Comprobando la carpeta y el historial.",
      recommendationTitle: "Comprobando protección e historial",
      recommendationDetail: "KnowNext.ai está revisando la carpeta local, el historial y la conexión remota.",
      userExplanation: "La aplicación está verificando si hay cambios fuera de KnowNext.ai y si el historial está al día.",
      actionDetail: "Espera a que termine la comprobación.",
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
      footerText: "Hay conflictos que requieren decisión.",
      recommendationTitle: "Hay cambios incompatibles que resolver",
      recommendationDetail: "Revisa los archivos afectados antes de continuar guardando o sincronizando.",
      userExplanation: "Hay diferencias entre la carpeta local y el historial remoto que KnowNext.ai no puede resolver automáticamente sin riesgo de perder información.",
      actionDetail: "Revisa el detalle y resuelve el conflicto antes de continuar.",
    };
  }

  if (review > 0 || changeSet?.requiresReview) {
    return {
      ...common,
      icon: AlertTriangle,
      iconClass: "bg-brand-hover text-brand-orange",
      statusIcon: AlertTriangle,
      status: "Revisión necesaria",
      tone: "warning" as const,
      calloutClass: "border-orange-200 bg-brand-hover",
      needsAttention,
      footerText: "Hay cambios que requieren una decisión.",
      recommendationTitle: "Revisa qué cambios quieres guardar",
      recommendationDetail: "Hay cambios detectados fuera de KnowNext.ai. Decide cuáles deben guardarse en el historial y cuáles deben quedar fuera.",
      userExplanation: "Puede que alguien haya añadido archivos directamente en la carpeta del proyecto, o que existan archivos técnicos que KnowNext.ai no debe guardar.",
      actionDetail: safe > 0 ? "Guarda los recomendados si son cambios esperados. Acepta los omitidos si solo son archivos privados o técnicos." : "Acepta los omitidos si esperabas que esos archivos quedaran fuera del historial.",
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
      footerText: "Hay archivos omitidos pendientes de aceptar.",
      recommendationTitle: "Acepta los archivos omitidos si son esperados",
      recommendationDetail: "KnowNext.ai ha detectado archivos privados o técnicos. No se guardarán en el historial ni se subirán a GitHub.",
      userExplanation: "Estos archivos existen en la carpeta, pero no forman parte de la documentación que conviene versionar. Aceptarlos evita que sigan apareciendo como aviso.",
      actionDetail: "Pulsa Aceptar omitidos para confirmar que deben quedarse fuera del historial.",
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
      footerText: "Hay cambios listos para guardar en el historial.",
      recommendationTitle: "Guarda los cambios en el historial",
      recommendationDetail: "Se han detectado cambios que pueden incorporarse al historial de documentación.",
      userExplanation: "Guardar estos cambios crea una versión local del proyecto y, si corresponde, la deja lista para sincronizar con GitHub.",
      actionDetail: "Usa Guardar recomendados o selecciona solo los archivos que quieras guardar.",
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
    footerText: "No hay acciones pendientes.",
    recommendationTitle: "Tu documentación está al día",
    recommendationDetail: syncStatus?.detail || "No hay cambios pendientes ni avisos de protección.",
    userExplanation: "La carpeta del proyecto no tiene cambios externos pendientes y el historial no requiere ninguna acción.",
    actionDetail: "Puedes seguir editando. Usa Comprobar de nuevo si quieres revisar la carpeta manualmente.",
  };
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
