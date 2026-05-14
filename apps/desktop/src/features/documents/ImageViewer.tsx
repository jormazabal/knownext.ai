import { Copy, FileText, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AssetMetadata, AssetReference, AssetUsageResponse, Project } from "../../types/domain";
import { getProjectImageContentUrl, getProjectImageUsage } from "../../lib/api/projects";

type ImageViewerProps = {
  project: Project;
  assetId: string;
  name: string;
  path: string;
  zoomPercent: number;
  fitToWindow: boolean;
  onAddToAiContext?: (assetId: string) => void;
  onAssetMetadataChange?: (asset: AssetMetadata | null) => void;
  onOpenReference?: (documentId: string, documentName: string) => void;
};

export function ImageViewer({
  project,
  assetId,
  name,
  path,
  zoomPercent,
  fitToWindow,
  onAddToAiContext,
  onAssetMetadataChange,
  onOpenReference,
}: ImageViewerProps) {
  const [usage, setUsage] = useState<AssetUsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const imageUrl = useMemo(() => getProjectImageContentUrl(project.id, assetId), [assetId, project.id]);
  const asset = usage?.asset;
  const displayAsset = useMemo(() => {
    if (!asset) return null;
    if (!naturalSize) return asset;
    return {
      ...asset,
      width: asset.width ?? naturalSize.width,
      height: asset.height ?? naturalSize.height,
    };
  }, [asset, naturalSize]);
  const visibleReferences = usage?.references.slice(0, 3) ?? [];
  const hiddenReferenceCount = Math.max((usage?.references.length ?? 0) - visibleReferences.length, 0);

  useEffect(() => {
    let cancelled = false;
    setUsage(null);
    setError(null);
    setNaturalSize(null);
    onAssetMetadataChange?.(null);
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
  }, [assetId, onAssetMetadataChange, project.id]);

  useEffect(() => {
    onAssetMetadataChange?.(displayAsset);
  }, [displayAsset, onAssetMetadataChange]);

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
        <div className="min-h-0 flex-1 overflow-auto bg-panel/40 p-2">
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
                onLoad={(event) => {
                  const image = event.currentTarget;
                  setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
                }}
                style={
                  fitToWindow
                    ? { maxWidth: "100%", maxHeight: "calc(100vh - 210px)", width: "auto", height: "auto" }
                    : {
                        width: naturalSize?.width ? `${Math.round(naturalSize.width * (zoomPercent / 100))}px` : `${zoomPercent}%`,
                        maxWidth: "none",
                      }
                }
              />
            </div>
          )}
        </div>
      </div>
      <aside className="hidden w-[232px] shrink-0 border-l border-line bg-white/95 px-3 py-3 lg:block">
        <div className="flex h-full flex-col gap-3">
          <section className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">Imagen de proyecto</p>
            <dl className="mt-2 grid gap-1.5 text-[10px] text-ink-secondary">
              <MetadataRow label="Ruta" value={path} mono />
              <MetadataRow label="Tipo" value={asset?.mimeType ?? "Imagen"} />
              <MetadataRow label="Peso" value={formatSize(asset?.sizeBytes ?? 0)} />
              <MetadataRow label="Tamaño" value={formatDimensions(displayAsset)} />
              <MetadataRow label="Actualizada" value={asset?.updatedAt ? formatDate(asset.updatedAt) : "Cargando"} />
              <MetadataRow label="Indexacion" value={asset?.indexed ? "Indexada" : "No indexada"} />
            </dl>
          </section>
          <section className="grid gap-1">
            <button className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-line bg-white px-2 text-[10px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange" onClick={() => void copyReference()}>
              <Copy size={13} />
              {copyState === "copied" ? "Referencia copiada" : "Copiar referencia"}
            </button>
            <button className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-orange-200 bg-brand-hover px-2 text-[10px] font-semibold text-brand-orange hover:bg-white" onClick={() => onAddToAiContext?.(assetId)}>
              <Sparkles size={13} />
              Contexto IA
            </button>
          </section>
          <section className="min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">Uso en Markdown</p>
              <span className="rounded-full bg-panel px-1.5 py-0.5 text-[9px] font-semibold text-ink-secondary">{usage?.references.length ?? 0}</span>
            </div>
            <div className="mt-2 grid gap-0.5">
              {usage && usage.references.length === 0 ? (
                <p className="px-1 py-2 text-[10px] leading-4 text-ink-secondary">No esta enlazada desde ningun Markdown.</p>
              ) : null}
              {visibleReferences.map((reference) => (
                <ReferenceRow key={reference.id} reference={reference} onOpenReference={onOpenReference} />
              ))}
              {hiddenReferenceCount > 0 ? (
                <p className="truncate px-1 py-1.5 text-[10px] text-ink-secondary">+{hiddenReferenceCount} referencia(s) más</p>
              ) : null}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function MetadataRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[68px_minmax(0,1fr)] items-baseline gap-1.5">
      <dt className="truncate">{label}</dt>
      <dd className={["truncate text-right font-medium text-ink-primary", mono ? "font-mono" : ""].join(" ")}>{value}</dd>
    </div>
  );
}

function ReferenceRow({ reference, onOpenReference }: { reference: AssetReference; onOpenReference?: (documentId: string, documentName: string) => void }) {
  return (
    <button
      type="button"
      className="grid w-full grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[4px] px-1.5 py-1.5 text-left hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/40"
      onClick={() => onOpenReference?.(reference.documentId, reference.documentName)}
      aria-label={`Abrir ${reference.documentName}${reference.line ? ` en linea ${reference.line}` : ""}`}
    >
      <FileText size={12} className="text-ink-secondary" aria-hidden="true" />
      <span className="truncate text-[10px] font-normal text-ink-primary">{reference.documentName}</span>
      <span className="shrink-0 text-[9px] font-normal text-ink-secondary">{reference.line ? `linea ${reference.line}` : "sin linea"}</span>
    </button>
  );
}

function formatSize(bytes: number) {
  if (!bytes) return "Sin tamano";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDimensions(asset: AssetMetadata | null) {
  return asset?.width && asset.height ? `${asset.width} x ${asset.height} px` : "Pendiente";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" }).format(date);
}
