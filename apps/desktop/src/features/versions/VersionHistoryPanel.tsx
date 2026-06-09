import { CheckCircle2, FileText, Loader2, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { getDocumentVersions, getVersionContent } from "../../lib/api/versions";
import type { VersionRecord } from "../../types/domain";

export type VersionPreviewMode = "diff" | "content";

export type VersionPreview = {
  documentId: string;
  version: VersionRecord;
  markdown: string;
  mode: VersionPreviewMode;
};

type VersionHistoryPanelProps = {
  documentId: string;
  documentName: string;
  activePreviewVersionId?: string | null;
  onPreviewChange: (preview: VersionPreview | null) => void;
  onClose: () => void;
};

const HISTORY_PAGE_SIZE = 20;

export function VersionHistoryPanel({
  documentId,
  documentName,
  activePreviewVersionId,
  onPreviewChange,
  onClose,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [contentByVersion, setContentByVersion] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingVersionId, setLoadingVersionId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const orderedVersions = useMemo(() => sortVersionsDescending(versions), [versions]);
  const visibleVersions = orderedVersions.slice(0, visibleCount);
  const hasMoreVersions = orderedVersions.length > visibleVersions.length;
  const selectedVersionId = loadingVersionId ?? activePreviewVersionId ?? orderedVersions.find((version) => version.current)?.id ?? orderedVersions[0]?.id ?? null;

  useEffect(() => {
    onPreviewChange(null);
    setContentByVersion({});
    setVisibleCount(HISTORY_PAGE_SIZE);
    void loadVersions();
  }, [documentId]);

  async function loadVersions() {
    setLoadingVersions(true);
    try {
      setMessage(null);
      const loadedVersions = await getDocumentVersions(documentId);
      setVersions(loadedVersions);
      setVisibleCount(HISTORY_PAGE_SIZE);
    } catch {
      setVersions([]);
      setMessage("No se pudo cargar el historial de este documento.");
    } finally {
      setLoadingVersions(false);
    }
  }

  async function handleSelectVersion(version: VersionRecord) {
    setMessage(null);
    if (version.current) {
      setLoadingVersionId(null);
      onPreviewChange(null);
      return;
    }

    const cached = contentByVersion[version.id];
    if (cached !== undefined) {
      setLoadingVersionId(null);
      onPreviewChange({ documentId, version, markdown: cached, mode: "diff" });
      return;
    }

    setLoadingVersionId(version.id);
    try {
      const response = await getVersionContent(documentId, version.id);
      setContentByVersion((currentContent) => ({ ...currentContent, [version.id]: response.markdown }));
      onPreviewChange({ documentId, version, markdown: response.markdown, mode: "diff" });
    } catch {
      setMessage("No se pudo cargar el contenido de esa versión.");
    } finally {
      setLoadingVersionId(null);
    }
  }

  const lastVersion = orderedVersions[0] ?? null;

  return (
    <aside className="flex w-full shrink-0 flex-col border-l border-line bg-white">
      <header className="shrink-0 border-b border-line px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink-primary">Historial</h2>
            <p className="mt-1 truncate text-[11px] text-ink-secondary">{documentName}</p>
            <p className="mt-1 text-[11px] text-ink-secondary">
              {orderedVersions.length > 0
                ? `${orderedVersions.length} ${orderedVersions.length === 1 ? "versión" : "versiones"} · última ${formatRelativeOrDate(lastVersion)}`
                : "Sin versiones guardadas"}
            </p>
          </div>
          <button className="grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-brand-hover" onClick={onClose} aria-label="Cerrar historial">
            <X size={17} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {message ? (
          <div className="mb-3 rounded-md border border-orange-200 bg-brand-hover px-3 py-2 text-[11px] leading-5 text-ink-secondary">
            {message}
          </div>
        ) : null}

        {loadingVersions ? (
          <PanelState icon={<Loader2 size={16} className="animate-spin" />} title="Cargando historial" />
        ) : orderedVersions.length === 0 ? (
          <PanelState
            icon={<FileText size={16} />}
            title="Este documento aún no tiene versiones"
            detail="Cuando guardes y sincronices el documento, las versiones aparecerán aquí."
          />
        ) : (
          <section className="space-y-2">
            {visibleVersions.map((version, index) => {
              const previousVersion = visibleVersions[index - 1] ?? null;
              const showDateSeparator = getVersionGroupKey(version) !== getVersionGroupKey(previousVersion);
              return (
                <Fragment key={version.id}>
                  {showDateSeparator ? <DateSeparator version={version} /> : null}
                  <VersionRow
                    version={version}
                    selected={version.id === selectedVersionId}
                    loading={version.id === loadingVersionId}
                    onSelect={() => void handleSelectVersion(version)}
                  />
                </Fragment>
              );
            })}
            {hasMoreVersions ? (
              <button
                className="mt-2 h-8 w-full rounded-md border border-line bg-white text-[11px] font-semibold text-ink-secondary hover:bg-panel hover:text-ink-primary"
                onClick={() => setVisibleCount((count) => count + HISTORY_PAGE_SIZE)}
              >
                Ver más
              </button>
            ) : null}
          </section>
        )}
      </div>
    </aside>
  );
}

function VersionRow({
  version,
  selected,
  loading,
  onSelect,
}: {
  version: VersionRecord;
  selected: boolean;
  loading: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={[
        "group grid h-9 w-full grid-cols-[1fr_auto] items-center gap-2 rounded-md border px-3 text-left transition",
        selected ? "border-brand-orange bg-brand-hover" : "border-transparent hover:border-line hover:bg-panel",
      ].join(" ")}
      onClick={onSelect}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[11px] font-semibold text-ink-primary">{formatVersionLongDateTime(version)}</span>
        {version.current ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-brand-orange">
            <CheckCircle2 size={10} />
            Actual
          </span>
        ) : null}
      </span>
      <span className="self-center font-mono text-[10px] text-ink-secondary">
        {loading ? <Loader2 size={12} className="animate-spin" /> : shortHash(version.hash)}
      </span>
    </button>
  );
}

function DateSeparator({ version }: { version: VersionRecord }) {
  return (
    <div className="sticky top-0 z-[1] flex items-center justify-center py-1">
      <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-semibold text-ink-secondary shadow-subtle">
        {formatVersionGroupLabel(version)}
      </span>
    </div>
  );
}

function PanelState({ icon, title, detail }: { icon: ReactNode; title: string; detail?: string }) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center text-ink-secondary">
      <div className="mb-2 grid h-8 w-8 place-items-center rounded-md bg-panel text-ink-secondary">{icon}</div>
      <div className="text-[12px] font-semibold text-ink-primary">{title}</div>
      {detail ? <p className="mt-1 max-w-[260px] text-[11px] leading-5">{detail}</p> : null}
    </div>
  );
}

function formatRelativeOrDate(version: VersionRecord | null) {
  if (!version) return "";
  return version.relativeTime || formatShortDate(version);
}

export function formatVersionShortDate(version: VersionRecord) {
  return formatShortDate(version);
}

export function formatVersionFullDate(version: VersionRecord) {
  return formatFullDate(version);
}

function formatShortDate(version: VersionRecord) {
  const date = parseVersionDate(version);
  if (!date) return version.relativeTime || "Sin fecha";
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatVersionLongDateTime(version: VersionRecord) {
  const date = parseVersionDate(version);
  if (!date) return version.relativeTime || "Sin fecha";
  const fullDate = new Intl.DateTimeFormat("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${fullDate} · ${time}`;
}

function formatVersionGroupLabel(version: VersionRecord) {
  const date = parseVersionDate(version);
  if (!date) return "Sin fecha";
  const today = startOfLocalDay(new Date());
  const versionDay = startOfLocalDay(date);
  const diffDays = Math.round((today.getTime() - versionDay.getTime()) / 86_400_000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  const currentWeekStart = startOfLocalWeek(today);
  const previousWeekStart = addDays(currentWeekStart, -7);
  if (versionDay >= currentWeekStart) return "Esta semana";
  if (versionDay >= previousWeekStart && versionDay < currentWeekStart) return "Semana pasada";
  return formatVersionMonth(date);
}

function formatFullDate(version: VersionRecord) {
  const date = parseVersionDate(version);
  if (!date) return version.relativeTime || "fecha no disponible";
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function parseVersionDate(version: VersionRecord) {
  if (!version.createdAt) return null;
  const date = new Date(version.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getVersionGroupKey(version: VersionRecord | null) {
  const date = version ? parseVersionDate(version) : null;
  if (!date) return "unknown";
  const today = startOfLocalDay(new Date());
  const versionDay = startOfLocalDay(date);
  const diffDays = Math.round((today.getTime() - versionDay.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  const currentWeekStart = startOfLocalWeek(today);
  const previousWeekStart = addDays(currentWeekStart, -7);
  if (versionDay >= currentWeekStart) return "this-week";
  if (versionDay >= previousWeekStart && versionDay < currentWeekStart) return "last-week";
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function sortVersionsDescending(versions: VersionRecord[]) {
  return [...versions].sort((left, right) => {
    const rightTime = parseVersionDate(right)?.getTime() ?? 0;
    const leftTime = parseVersionDate(left)?.getTime() ?? 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    if (right.current !== left.current) return right.current ? 1 : -1;
    return right.id.localeCompare(left.id);
  });
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfLocalWeek(date: Date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(startOfLocalDay(date), mondayOffset);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(date.getDate() + days);
  return nextDate;
}

function formatVersionMonth(date: Date) {
  const month = new Intl.DateTimeFormat("es", { month: "long" }).format(date);
  return `${month} ${date.getFullYear()}`;
}

function shortHash(hash: string) {
  return hash.length > 8 ? hash.slice(0, 8) : hash;
}
