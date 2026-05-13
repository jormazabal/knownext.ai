import { Clock3, Copy, FileImage, Image as ImageIcon, Plus, Search, Sparkles, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AssetMetadata, AssetReference, AssetUsageResponse, Project } from "../../types/domain";
import { getProjectImageContentUrl, getProjectImageUsage } from "../../lib/api/projects";

type ImageViewerProps = {
  project: Project;
  assetId: string;
  name: string;
  path: string;
  activeDocumentId?: string;
  onInsertIntoDocument?: (assetId: string) => void;
  onAddToAiContext?: (assetId: string) => void;
};

export function ImageViewer({
  project,
  assetId,
  name,
  path,
  activeDocumentId,
  onInsertIntoDocument,
  onAddToAiContext,
}: ImageViewerProps) {
  const [usage, setUsage] = useState<AssetUsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const imageUrl = useMemo(() => getProjectImageContentUrl(project.id, assetId), [assetId, project.id]);
  const asset = usage?.asset;

  useEffect(() => {
    let cancelled = false;
    getProjectImageUsage(project.id, assetId)
      .then((response) => {
        if (!cancelled) setUsage(response);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "No se pudo cargar la imagen.");
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, project.id]);

  async function copyReference() {
    const reference = `![${name.replace(/\.[^.]+$/, "")}](${path})`;
    try {
      await navigator.clipboard.writeText(reference);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1400);
    } catch {
      setCopyState("idle");
    }
  }

  return (
    <div className="flex h-full min-h-0 bg-white">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
          <div className="flex min-w-0 items-center gap-2">
            <ImageIcon size={15} className="text-brand-orange" />
            <span className="truncate text-[12px] font-semibold text-ink-primary">{name}</span>
            <span className="hidden truncate text-[11px] text-ink-secondary sm:block">{path}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button className="toolbar-button" data-tooltip="Reducir" onClick={() => setZoom((value) => Math.max(25, value - 25))}>
              <ZoomOut size={14} />
            </button>
            <button className="h-6 rounded-md border border-line px-2 text-[10px] font-semibold text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" onClick={() => setZoom(100)}>
              {zoom}%
            </button>
            <button className="toolbar-button" data-tooltip="Ampliar" onClick={() => setZoom((value) => Math.min(300, value + 25))}>
              <ZoomIn size={14} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-panel/40 p-6">
          {error ? (
            <div className="grid h-full place-items-center text-center text-[11px] text-ink-secondary">
              <p>{error}</p>
            </div>
          ) : (
            <div className="grid min-h-full place-items-center">
              <img
                src={imageUrl}
                alt={name}
                className="max-h-none rounded-md border border-line bg-white"
                style={{ width: `${zoom}%`, maxWidth: zoom <= 100 ? "100%" : "none" }}
              />
            </div>
          )}
        </div>
      </div>
      <aside className="hidden w-[290px] shrink-0 border-l border-line bg-panel/60 p-4 lg:block">
        <div className="space-y-4">
          <section>
            <p className="text-[11px] font-semibold text-ink-primary">Imagen de proyecto</p>
            <dl className="mt-2 space-y-1 text-[10px] text-ink-secondary">
              <MetadataRow label="Ruta" value={path} mono />
              <MetadataRow label="Tipo" value={asset?.mimeType ?? "Imagen"} />
              <MetadataRow label="Peso" value={formatSize(asset?.sizeBytes ?? 0)} />
              <MetadataRow label="Actualizada" value={asset?.updatedAt ? formatDate(asset.updatedAt) : "Cargando"} />
              <MetadataRow label="Indexacion" value={asset?.indexed ? "Indexada" : "No indexada"} />
            </dl>
          </section>
          <section className="grid gap-1.5">
            <button className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange" onClick={() => void copyReference()}>
              <Copy size={13} />
              {copyState === "copied" ? "Referencia copiada" : "Copiar referencia"}
            </button>
            <button
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!activeDocumentId}
              onClick={() => onInsertIntoDocument?.(assetId)}
            >
              <FileImage size={13} />
              Insertar en documento
            </button>
            <button className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-orange-200 bg-brand-hover px-3 text-[11px] font-semibold text-brand-orange hover:bg-white" onClick={() => onAddToAiContext?.(assetId)}>
              <Sparkles size={13} />
              Usar como contexto IA
            </button>
          </section>
          <section>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-ink-primary">Uso en Markdown</p>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-ink-secondary">{usage?.references.length ?? 0}</span>
            </div>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {usage && usage.references.length === 0 ? (
                <p className="rounded-md border border-line bg-white px-3 py-2 text-[10px] leading-4 text-ink-secondary">No esta enlazada desde ningun Markdown.</p>
              ) : null}
              {usage?.references.map((reference) => <ReferenceRow key={reference.id} reference={reference} />)}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function MetadataRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2">
      <dt>{label}</dt>
      <dd className={["truncate text-ink-primary", mono ? "font-mono" : ""].join(" ")}>{value}</dd>
    </div>
  );
}

function ReferenceRow({ reference }: { reference: AssetReference }) {
  return (
    <div className="rounded-md border border-line bg-white px-3 py-2">
      <p className="truncate text-[10px] font-semibold text-ink-primary">{reference.documentName}</p>
      <p className="mt-0.5 truncate font-mono text-[10px] text-ink-secondary">{reference.documentPath}</p>
      {reference.line ? (
        <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-ink-secondary">
          <Clock3 size={10} />
          linea {reference.line}
        </p>
      ) : null}
    </div>
  );
}

function formatSize(bytes: number) {
  if (!bytes) return "Sin tamano";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" }).format(date);
}
