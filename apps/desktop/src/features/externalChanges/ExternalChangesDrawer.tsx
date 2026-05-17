import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  File,
  FileImage,
  FileText,
  Folder,
  Loader2,
  ShieldAlert,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ExternalChangeDecision, ExternalChangeItem, ExternalChangeKind, ExternalChangeSet, ProjectSyncState } from "../../types/domain";

type ExternalChangesDrawerProps = {
  open: boolean;
  changeSet: ExternalChangeSet | null;
  decisions: Record<string, ExternalChangeDecision>;
  syncState: ProjectSyncState;
  busy: boolean;
  message?: string | null;
  onDecisionChange: (itemId: string, decision: ExternalChangeDecision) => void;
  onImport: () => void;
  onImportSafe: () => void;
  onOmitAll: () => void;
  onRefresh: () => void;
  onClose: () => void;
};

const groupOrder: Array<{ key: ExternalChangeKind; title: string }> = [
  { key: "folder", title: "Carpetas nuevas" },
  { key: "document", title: "Documentos Markdown" },
  { key: "image", title: "Imágenes" },
  { key: "attachment", title: "Archivos" },
  { key: "private", title: "Privados" },
  { key: "ignored", title: "Omitidos automáticamente" },
  { key: "unsupported", title: "No compatibles" },
];

export function ExternalChangesDrawer({
  open,
  changeSet,
  decisions,
  syncState,
  busy,
  message,
  onDecisionChange,
  onImport,
  onImportSafe,
  onOmitAll,
  onRefresh,
  onClose,
}: ExternalChangesDrawerProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<ExternalChangeKind>>(new Set(["ignored", "unsupported"]));
  const groupedItems = useMemo(() => groupItems(changeSet?.items ?? []), [changeSet?.items]);
  const selectedCount = (changeSet?.items ?? []).filter((item) => item.risk !== "blocked" && (decisions[item.id] ?? item.decision) === "include").length;

  if (!open) return null;

  return (
    <>
      <button className="fixed inset-0 z-[75] bg-black/10 lg:hidden" aria-label="Cerrar cambios externos" onClick={onClose} />
      <aside
        className="fixed bottom-0 right-0 top-9 z-[80] flex w-[min(520px,calc(100vw-28px))] flex-col border-l border-line bg-white shadow-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-changes-title"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id="external-changes-title" className="text-[15px] font-semibold text-ink-primary">Cambios externos</h2>
            <p className="mt-1 truncate text-[11px] text-ink-secondary">{changeSet?.title ?? "Sin cambios externos pendientes"}</p>
          </div>
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
            data-tooltip="Cerrar"
            aria-label="Cerrar cambios externos"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <SummaryStrip changeSet={changeSet} syncState={syncState} busy={busy} message={message} />
          {changeSet?.summary.total ? (
            <div className="mt-4 space-y-2">
              {groupOrder.map((group) => {
                const items = groupedItems[group.key] ?? [];
                if (items.length === 0) return null;
                const collapsed = collapsedGroups.has(group.key);
                return (
                  <section key={group.key} className="border-t border-line pt-2">
                    <button
                      className="flex h-8 w-full items-center gap-2 text-left text-[11px] font-semibold text-ink-primary"
                      onClick={() => {
                        setCollapsedGroups((current) => {
                          const next = new Set(current);
                          if (next.has(group.key)) next.delete(group.key);
                          else next.add(group.key);
                          return next;
                        });
                      }}
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
                          />
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-line bg-panel px-4 py-8 text-center">
              <Check size={22} className="mx-auto text-green-600" />
              <p className="mt-2 text-[12px] font-semibold text-ink-primary">No hay cambios externos pendientes</p>
              <p className="mt-1 text-[11px] text-ink-secondary">El proyecto local está limpio para esta revisión.</p>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-4">
          <p className="text-[11px] text-ink-secondary">{selectedCount} seleccionados</p>
          <div className="flex gap-2">
            <button
              className="h-9 rounded-md border border-line px-3 text-[11px] font-medium hover:bg-panel disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || !changeSet?.summary.total}
              onClick={onOmitAll}
            >
              Omitir todo
            </button>
            <button className="h-9 rounded-md border border-line px-3 text-[11px] font-medium hover:bg-panel" disabled={busy} onClick={onRefresh}>
              Actualizar
            </button>
            <button
              className="h-9 rounded-md border border-brand-orange px-3 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || !changeSet?.summary.safe}
              onClick={onImportSafe}
            >
              Importar seguros
            </button>
            <button
              className="flex h-9 items-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || selectedCount === 0}
              onClick={onImport}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Importar seleccionados
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}

function SummaryStrip({ changeSet, syncState, busy, message }: { changeSet: ExternalChangeSet | null; syncState: ProjectSyncState; busy: boolean; message?: string | null }) {
  const summary = changeSet?.summary;
  const statusText = busy ? "Procesando" : syncState === "pending" ? "Pendiente de GitHub" : changeSet?.requiresReview ? "Revisión necesaria" : "Listo para importar";
  return (
    <div className="rounded-md border border-line bg-panel px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold text-ink-primary">{statusText}</p>
        {changeSet?.requiresReview ? <AlertTriangle size={16} className="text-brand-orange" /> : <Check size={16} className="text-green-600" />}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <Metric label="Total" value={summary?.total ?? 0} />
        <Metric label="Seguros" value={summary?.safe ?? 0} />
        <Metric label="Revisar" value={summary?.review ?? 0} />
        <Metric label="Omitidos" value={summary?.blocked ?? 0} />
      </div>
      <p className="mt-3 text-[11px] leading-5 text-ink-secondary">{message || changeSet?.message || "Los cambios importados se guardan primero como versión local."}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-md border border-line bg-white px-2 py-2">
      <span className="block text-[14px] font-semibold text-ink-primary">{value}</span>
      <span className="block text-[10px] text-ink-secondary">{label}</span>
    </span>
  );
}

function ChangeItemRow({ item, decision, onDecisionChange }: { item: ExternalChangeItem; decision: ExternalChangeDecision; onDecisionChange: (itemId: string, decision: ExternalChangeDecision) => void }) {
  const Icon = getItemIcon(item.kind);
  const blocked = item.risk === "blocked";
  return (
    <div className="group flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 hover:bg-brand-hover">
      <button
        className={[
          "grid h-5 w-5 shrink-0 place-items-center rounded border text-[10px]",
          decision === "include" ? "border-brand-orange bg-brand-orange text-white" : "border-line bg-white text-ink-secondary",
          blocked ? "cursor-not-allowed opacity-45" : "",
        ].join(" ")}
        aria-label={decision === "include" ? `Omitir ${item.name}` : `Incluir ${item.name}`}
        disabled={blocked}
        onClick={() => onDecisionChange(item.id, decision === "include" ? "omit" : "include")}
      >
        {decision === "include" ? <Check size={13} /> : null}
      </button>
      <Icon size={15} className={blocked ? "text-ink-secondary" : item.risk === "review" ? "text-brand-orange" : "text-ink-secondary"} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-medium text-ink-primary">{item.name}</span>
        <span className="block truncate text-[10px] text-ink-secondary">{item.path}</span>
        {item.reason ? <span className="mt-0.5 block truncate text-[10px] text-ink-secondary">{item.reason}</span> : null}
      </span>
      <span className={["shrink-0 rounded px-1.5 py-0.5 text-[10px]", item.risk === "safe" ? "bg-white text-ink-secondary" : "bg-brand-hover text-brand-orange"].join(" ")}>
        {getRiskLabel(item)}
      </span>
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

function getRiskLabel(item: ExternalChangeItem) {
  if (item.risk === "blocked") return "Omitido";
  if (item.risk === "review") return "Revisar";
  if (item.changeType === "modified") return "Modificado";
  if (item.changeType === "deleted") return "Eliminado";
  return "Nuevo";
}
