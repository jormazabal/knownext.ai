import { useEffect, useRef, useState } from "react";
import { HardDrive, RefreshCw } from "lucide-react";
import { getStorageUsage } from "../../lib/api/storageUsage";
import { getApiErrorMessage } from "../../lib/api/client";
import type { StorageCategory, StorageUsage } from "../../types/storageUsage";
import {PreviewCleanupPanel} from "./PreviewCleanupPanel";

const categoryCopy: Record<StorageCategory, [string, string]> = {
  projects: ["Documentos e historial de proyectos", "Project documents and history"],
  recovery: ["Borradores, papelera y recuperación", "Drafts, trash and recovery"],
  recordings: ["Grabaciones", "Recordings"],
  "ai-work": ["Conversaciones y trabajo IA", "Conversations and AI work"],
  templates: ["Plantillas", "Templates"],
  preparations: ["Transferencias en preparación", "Transfer preparations"],
  indexes: ["Índices y vistas previas", "Indexes and previews"],
  preferences: ["Preferencias, acceso y asociaciones", "Preferences, access and associations"],
  other: ["Otros datos locales", "Other local data"],
};
const warningCopy = {
  "project-registry-unavailable": ["No se pudo consultar el registro de proyectos. Las ubicaciones están incompletas; el registro se conserva.", "The project registry could not be read. Locations are incomplete; the registry is preserved."],
  "retired-catalog-unavailable": ["No se pudo consultar el catálogo de proyectos retirados. Se conserva sin cambios.", "The removed-project catalog could not be read. It is preserved unchanged."],
  "location-limit": ["La lista alcanza su límite de ubicaciones y puede no incluir todas las asociaciones.", "The location list reached its limit and may not include every association."],
};

function bytes(value: number, english: boolean): string {
  if (value < 1024) return `${value} B`;
  const unit = value >= 1024 ** 3 ? 3 : value >= 1024 ** 2 ? 2 : 1;
  return `${new Intl.NumberFormat(english ? "en-US" : "es-ES", {maximumFractionDigits: 1}).format(value / 1024 ** unit)} ${["B", "KiB", "MiB", "GiB"][unit]}`;
}

/** Measurement and cleanup review are separate explicit user actions. */
export function StorageUsagePanel({english = false}: {english?: boolean}) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(20);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const language = english ? 1 : 0;

  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await getStorageUsage();
      if (mounted.current) setUsage(next);
    } catch (cause) {
      if (mounted.current) setError(getApiErrorMessage(cause, english ? "Storage could not be measured. The previous measurement is preserved." : "No se pudo medir el almacenamiento. Se conserva la medición anterior."));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <section aria-label={english ? "Local storage" : "Almacenamiento local"} className="rounded-md bg-panel p-4">
    <header className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
      <div className="min-w-0 flex-1">
        <h4 className="flex items-center gap-2 text-sm font-semibold"><HardDrive size={16}/>{english ? "Data on this device" : "Datos de este dispositivo"}</h4>
        <p className="mt-1 text-xs leading-5 text-ink-secondary">{english ? "View locations and the logical size of files in the app's store. External project folders are not scanned." : "Consulta ubicaciones y el tamaño lógico de los archivos del almacén. Las carpetas de proyectos externas no se recorren."}</p>
      </div>
      <button type="button" disabled={busy} onClick={() => void refresh()} className="flex min-h-11 shrink-0 items-center gap-2 rounded border border-line bg-white px-3 text-xs hover:bg-brand-hover disabled:opacity-50">
        <RefreshCw size={14} className={busy ? "animate-spin" : ""}/>{busy ? (english ? "Measuring…" : "Midiendo…") : usage ? (english ? "Update measurement" : "Actualizar medición") : (english ? "View local usage" : "Ver uso local")}
      </button>
    </header>
    {busy && <p role="status" className="mt-3 text-xs text-ink-secondary">{english ? "Reading file metadata; file content is preserved." : "Consultando metadatos; se conserva el contenido de los archivos."}</p>}
    {error && <p role="alert" className="mt-3 rounded bg-red-50 p-3 text-xs leading-5 text-red-800">{error}</p>}
    {usage && <div className="mt-4" aria-busy={busy}>
      <p className="text-xl font-semibold">{!usage.measurement.complete && (english ? "At least " : "Al menos ")}{bytes(usage.measurement.logicalBytes, english)}</p>
      <p className="mt-1 text-xs leading-5 text-ink-secondary">{usage.measurement.files} {english ? (usage.measurement.files === 1 ? "measured file" : "measured files") : (usage.measurement.files === 1 ? "archivo medido" : "archivos medidos")} · {english ? "logical sizes, not free disk capacity" : "tamaño lógico, no espacio libre del disco"}</p>
      <p className="mt-1 break-all font-mono text-[11px] leading-5 text-ink-secondary">{usage.appDataPath}</p>
      <p className="mt-1 text-[11px] text-ink-secondary">{english ? "Measured at " : "Medido el "}{new Date(usage.checkedAt).toLocaleString(english ? "en-US" : "es-ES")}</p>
      {!usage.measurement.complete && <div role="status" className="mt-3 rounded bg-brand-hover p-3 text-xs leading-5">
        <p className="font-medium">{english ? "Partial measurement" : "Medición parcial"}</p>
        <p>{usage.measurement.limited && (english ? "The query did not cover the whole store. " : "La consulta no recorrió todo el almacén. ")}{usage.measurement.skippedLinks} {english ? (usage.measurement.skippedLinks === 1 ? "link omitted" : "links omitted") : (usage.measurement.skippedLinks === 1 ? "enlace omitido" : "enlaces omitidos")} · {usage.measurement.unreadableEntries} {english ? (usage.measurement.unreadableEntries === 1 ? "unavailable item" : "unavailable items") : (usage.measurement.unreadableEntries === 1 ? "elemento no accesible" : "elementos no accesibles")}.</p>
        <p>{english ? "Unvisited data is not counted as empty." : "Los datos no recorridos no se consideran vacíos."}</p>
      </div>}
      <dl className="mt-4 space-y-2">{usage.measurement.groups.map(group => <div key={group.id} className="flex items-baseline justify-between gap-3 text-xs leading-5">
        <dt className="min-w-0">{categoryCopy[group.id][language]} <span className="text-ink-secondary">· {!usage.measurement.complete && "≥ "}{group.files}</span></dt>
        <dd className="shrink-0 tabular-nums">{!usage.measurement.complete && "≥ "}{bytes(group.logicalBytes, english)}</dd>
      </div>)}</dl>
      <p className="mt-3 text-xs leading-5 text-ink-secondary">{english ? "All categories are preserved. Indexes and previews require review before any cleanup; drafts, trash, audio and pending preparations are not disposable cache." : "Todas las categorías se conservan. Índices y vistas requieren revisión antes de limpiar; borradores, papelera, audio y preparaciones pendientes no son caché desechable."}</p>
      <details className="mt-4 rounded bg-white px-3 py-2">
        <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">{english ? "Project locations" : "Ubicaciones de proyectos"} · {usage.locations.length}{!usage.locationsComplete && (english ? " · incomplete" : " · incompletas")}</summary>
        <p className="mb-3 text-xs leading-5 text-ink-secondary">{english ? "Locations come from the registry and removed-project catalog. No individual project size or external-folder availability is inferred." : "Las ubicaciones proceden del registro y del catálogo de retirados. No se deduce el tamaño individual ni la disponibilidad de una carpeta externa."}</p>
        {usage.warnings.map(warning => <p key={warning} role="status" className="mb-3 text-xs leading-5 text-amber-900">{warningCopy[warning][language]}</p>)}
        {usage.locations.length === 0 && <p className="text-xs text-ink-secondary">{usage.locationsComplete ? (english ? "No project locations are registered." : "No hay ubicaciones de proyectos registradas.") : (english ? "Project locations could not be fully queried." : "No se pudieron consultar todas las ubicaciones.")}</p>}
        <ul className="space-y-3">{usage.locations.slice(0, visible).map(location => <li key={location.id}>
          <p className="break-words text-xs font-medium">{location.name} <span className="font-normal text-ink-secondary">· {location.state === "retired" ? (english ? "removed" : "retirado") : (english ? "registered" : "registrado")}</span></p>
          <p className="break-all font-mono text-[11px] leading-5 text-ink-secondary">{location.folderPath}</p>
        </li>)}</ul>
        {visible < usage.locations.length && <button type="button" onClick={() => setVisible(count => count + 20)} className="mt-3 min-h-11 text-xs underline">{english ? "Show more locations" : "Mostrar más ubicaciones"}</button>}
      </details>
      <p className="mt-3 text-[11px] leading-5 text-ink-secondary">{english ? "Sizes may change during the query. This view does not replace a backup. Linked folders and their targets are omitted." : "Los tamaños pueden cambiar durante la consulta. Esta vista no sustituye una copia de seguridad. Las carpetas enlazadas y sus destinos se omiten."}</p>
    </div>}
    <PreviewCleanupPanel english={english}/>
  </section>;
}
