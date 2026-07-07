import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Image as ImageIcon, Link, NotebookPen, Search, Trash2, Upload, X } from "lucide-react";
import { getProjectImageContentUrl } from "../../lib/api/projects";
import type { AssetImportResponse, DocumentTreeNode, HandwrittenNoteInsertMarkdownResponse, InsertImageReferenceResponse } from "../../types/domain";

type InsertImageDialogProps = {
  variant?: "insert" | "edit";
  activeProjectId: string;
  activeDocumentId: string;
  activeDocumentPath: string | null;
  tree: DocumentTreeNode[];
  initialAltText?: string;
  initialUrl?: string;
  onClose: () => void;
  onImportImage: (parentId: string | null, file: File) => Promise<AssetImportResponse>;
  onBuildReference: (documentId: string, assetId: string, altText?: string | null) => Promise<InsertImageReferenceResponse>;
  onBuildHandwrittenReference?: (documentId: string, noteId: string, altText?: string | null) => Promise<HandwrittenNoteInsertMarkdownResponse>;
  onInsert: (markdown: string) => void;
  onDelete?: () => void;
};

export function InsertImageDialog({
  variant = "insert",
  activeProjectId,
  activeDocumentId,
  activeDocumentPath,
  tree,
  initialAltText = "",
  initialUrl = "https://",
  onClose,
  onImportImage,
  onBuildReference,
  onBuildHandwrittenReference,
  onInsert,
  onDelete,
}: InsertImageDialogProps) {
  const isEditMode = variant === "edit";
  const projectVisuals = useMemo(() => collectProjectVisuals(tree), [tree]);
  const uploadParentId = useMemo(() => resolveDocumentParentFolderId(tree, activeDocumentPath), [tree, activeDocumentPath]);
  const initialProjectAsset = useMemo(() => findImageByInitialUrl(projectVisuals, activeProjectId, initialUrl), [activeProjectId, projectVisuals, initialUrl]);
  const [tabMode, setTabMode] = useState<"project" | "upload" | "url">(() => (initialProjectAsset ? "project" : isEditMode && isEditModeUrl(initialUrl) ? "url" : "project"));
  const [query, setQuery] = useState("");
  const [altText, setAltText] = useState(initialAltText);
  const [url, setUrl] = useState(initialUrl || "https://");
  const [busy, setBusy] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState(initialProjectAsset?.id ?? projectVisuals[0]?.id ?? "");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedAsset = projectVisuals.find((visual) => visual.id === selectedAssetId) ?? null;
  const previewSource = tabMode === "project" && selectedAsset?.type === "image"
    ? getProjectImageContentUrl(activeProjectId, selectedAsset.id)
    : tabMode === "url" && isPreviewableUrl(url)
      ? url.trim()
      : isPreviewableUrl(initialUrl)
        ? initialUrl.trim()
        : null;
  const visibleImages = projectVisuals.filter((visual) => {
    const value = `${visual.name} ${visual.path ?? ""}`.toLowerCase();
    return value.includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    if (!selectedAssetId && visibleImages[0]) setSelectedAssetId(visibleImages[0].id);
  }, [selectedAssetId, visibleImages]);

  async function insertSelectedAsset(assetId = selectedAssetId) {
    if (!assetId) return;
    setBusy(true);
    try {
      const visual = projectVisuals.find((item) => item.id === assetId);
      if (!visual) return;
      const reference = visual.type === "handwritten-note"
        ? await onBuildHandwrittenReference?.(activeDocumentId, visual.id, altText || visual.name.replace(/\.knote$/i, ""))
        : await onBuildReference(activeDocumentId, visual.id, altText || null);
      if (!reference) return;
      onInsert(reference.markdown);
    } finally {
      setBusy(false);
    }
  }

  async function uploadAndInsert(file: File) {
    setBusy(true);
    try {
      const imported = await onImportImage(uploadParentId, file);
      const reference = await onBuildReference(activeDocumentId, imported.asset.id, altText || imported.asset.name.replace(/\.[^.]+$/, ""));
      onInsert(reference.markdown);
    } finally {
      setBusy(false);
    }
  }

  function insertUrl() {
    if (!url.trim()) return;
    const alt = altText.trim() || "Imagen";
    onInsert(buildImageMarkup(alt, url.trim()));
  }

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[98] grid place-items-center bg-black/20 px-4">
      <section className="flex max-h-[min(760px,calc(100dvh-48px))] w-[min(920px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-primary">{isEditMode ? "Editar imagen" : "Insertar imagen"}</h2>
            <p className="mt-1 text-[11px] text-ink-secondary">
              {isEditMode ? "Cambia la imagen, actualiza el texto alternativo o elimina la referencia." : "Usa una imagen o nota a mano del proyecto, sube una nueva o enlaza una URL externa."}
            </p>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </header>
        <div className="flex border-b border-line px-5 pt-3">
          {[
            ["project", "Proyecto"],
            ["upload", "Subir"],
            ["url", "URL"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={["h-8 border-b-2 px-3 text-[11px] font-semibold", tabMode === value ? "border-brand-orange text-brand-orange" : "border-transparent text-ink-secondary hover:text-ink-primary"].join(" ")}
              onClick={() => setTabMode(value as typeof tabMode)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] overflow-hidden max-[820px]:grid-cols-1">
          <div className="min-h-0 overflow-y-auto px-5 py-4">
            <label className="block text-[11px] font-semibold text-ink-secondary">
              Texto alternativo
              <input
                className="mt-1 h-9 w-full rounded-md border border-line px-3 text-[12px] text-ink-primary outline-none focus:border-brand-orange"
                value={altText}
                onChange={(event) => setAltText(event.target.value)}
                placeholder="Descripcion breve de la imagen"
              />
            </label>
            {tabMode === "project" ? (
              <div className="mt-4">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-secondary" size={14} />
                  <input
                    className="h-9 w-full rounded-md border border-line pl-9 pr-3 text-[12px] outline-none focus:border-brand-orange"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar imagen o nota"
                  />
                </label>
                <div className="mt-3 grid max-h-72 grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2 overflow-y-auto pr-1">
                  {visibleImages.length === 0 ? (
                    <p className="col-span-full rounded-md border border-line bg-panel px-3 py-4 text-center text-[11px] text-ink-secondary">No hay recursos visuales que coincidan.</p>
                  ) : (
                    visibleImages.map((image) => (
                      <button
                        key={image.id}
                        className={["group relative overflow-hidden rounded-md border bg-white text-left", selectedAssetId === image.id ? "border-orange-200 shadow-subtle" : "border-line hover:border-orange-100 hover:bg-panel"].join(" ")}
                        onClick={() => setSelectedAssetId(image.id)}
                        onDoubleClick={() => void insertSelectedAsset(image.id)}
                        aria-label={image.name}
                      >
                        <span className="grid aspect-[4/3] place-items-center bg-panel">
                          {image.type === "image" ? (
                            <img className="max-h-full max-w-full object-contain" src={getProjectImageContentUrl(activeProjectId, image.id)} alt="" loading="lazy" />
                          ) : (
                            <span className="grid h-12 w-12 place-items-center rounded-md border border-orange-100 bg-white text-brand-orange">
                              <NotebookPen size={22} />
                            </span>
                          )}
                        </span>
                        <span className="block min-w-0 px-2 py-2">
                          <span className="block truncate text-[11px] font-semibold text-ink-primary">{image.name}</span>
                          <span className="mt-0.5 block truncate text-[9px] text-ink-secondary">{formatVisualMeta(image)}</span>
                        </span>
                        {selectedAssetId === image.id ? (
                          <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-brand-orange text-white">
                            <Check size={12} />
                          </span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : tabMode === "upload" ? (
              <div className="mt-4 rounded-md border border-dashed border-line bg-panel px-4 py-8 text-center">
                <Upload size={22} className="mx-auto text-brand-orange" />
                <p className="mt-2 text-[12px] font-semibold text-ink-primary">Subir imagen al proyecto</p>
                <p className="mt-1 text-[11px] text-ink-secondary">Se copiara al proyecto y se insertara una referencia relativa.</p>
                <button className="mt-4 h-8 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={() => fileInputRef.current?.click()}>
                  Seleccionar imagen
                </button>
                <input
                  ref={fileInputRef}
                  className="hidden"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void uploadAndInsert(file);
                  }}
                />
              </div>
            ) : (
              <label className="mt-4 block text-[11px] font-semibold text-ink-secondary">
                URL de la imagen
                <span className="mt-1 flex h-9 items-center gap-2 rounded-md border border-line px-3 focus-within:border-brand-orange">
                  <Link size={14} className="text-ink-secondary" />
                  <input className="min-w-0 flex-1 text-[12px] outline-none" value={url} onChange={(event) => setUrl(event.target.value)} />
                </span>
              </label>
            )}
          </div>
          <aside className="border-l border-line bg-panel/40 px-4 py-4 max-[820px]:hidden">
            <p className="text-[11px] font-semibold text-ink-secondary">Vista previa</p>
            <div className="mt-2 grid aspect-[4/3] place-items-center overflow-hidden rounded-md border border-line bg-white">
              {previewSource ? (
                <img className="max-h-full max-w-full object-contain" src={previewSource} alt={altText || selectedAsset?.name || "Vista previa"} />
              ) : selectedAsset?.type === "handwritten-note" ? (
                <div className="text-center text-[11px] text-ink-secondary">
                  <NotebookPen size={24} className="mx-auto mb-2 text-brand-orange" />
                  Nota a mano
                </div>
              ) : (
                <div className="text-center text-[11px] text-ink-secondary">
                  <ImageIcon size={22} className="mx-auto mb-2 text-brand-orange" />
                  Selecciona una imagen o nota
                </div>
              )}
            </div>
            <dl className="mt-3 space-y-2 text-[11px]">
              <div>
                <dt className="font-semibold text-ink-secondary">Archivo</dt>
                <dd className="mt-0.5 truncate text-ink-primary">{selectedAsset?.name ?? (tabMode === "url" ? "URL externa" : "Sin seleccionar")}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink-secondary">Origen</dt>
                <dd className="mt-0.5 break-words text-ink-primary">{selectedAsset?.path ?? (tabMode === "url" ? url : "Proyecto")}</dd>
              </div>
              {selectedAsset?.width && selectedAsset.height ? (
                <div>
                  <dt className="font-semibold text-ink-secondary">Dimensiones originales</dt>
                  <dd className="mt-0.5 text-ink-primary">{selectedAsset.width} x {selectedAsset.height} px</dd>
                </div>
              ) : null}
            </dl>
          </aside>
        </div>
        <footer className="flex justify-between gap-2 border-t border-line px-5 py-4">
          {isEditMode && onDelete ? (
            <button className="flex h-9 items-center gap-2 rounded-md border border-red-200 px-4 text-[11px] font-semibold text-red-600 hover:bg-red-50" onClick={onDelete}>
              <Trash2 size={14} />
              Eliminar
            </button>
          ) : (
            <span />
          )}
          <div className="flex justify-end gap-2">
          <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onClose}>Cancelar</button>
          <button
            className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || (tabMode === "project" && !selectedAssetId)}
            onClick={() => {
              if (tabMode === "project") void insertSelectedAsset();
              if (tabMode === "upload") fileInputRef.current?.click();
              if (tabMode === "url") insertUrl();
            }}
          >
            {busy ? (isEditMode ? "Guardando" : "Insertando") : isEditMode ? "Guardar cambios" : "Insertar"}
          </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function collectProjectVisuals(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.flatMap((node) => {
    if (node.type === "image" || node.type === "handwritten-note") return [node];
    return node.children ? collectProjectVisuals(node.children) : [];
  });
}

function findImageByInitialUrl(images: DocumentTreeNode[], projectId: string, initialUrl: string) {
  if (!projectId || !initialUrl) return null;
  return images.find((image) => image.type === "image" && (initialUrl === getProjectImageContentUrl(projectId, image.id) || initialUrl.endsWith(encodeURIComponent(image.id)) || initialUrl.endsWith(image.path ?? ""))) ?? null;
}

function buildImageMarkup(alt: string, source: string) {
  return `![${alt}](${source})`;
}

function isPreviewableUrl(value: string) {
  return /^https?:\/\/.+/i.test(value.trim()) || /^data:image\//i.test(value.trim()) || /^knownext-asset:\/\//i.test(value.trim());
}

function isEditModeUrl(value: string) {
  return /^https?:\/\/.+/i.test(value.trim()) || /^(data:image|knownext-asset:)/i.test(value.trim());
}

function formatVisualMeta(image: DocumentTreeNode) {
  if (image.type === "handwritten-note") {
    return ["Nota a mano", image.path].filter(Boolean).join(" · ");
  }
  const dimensions = image.width && image.height ? `${image.width} x ${image.height}px` : null;
  const size = image.sizeBytes ? formatBytes(image.sizeBytes) : null;
  return [dimensions, size, image.path].filter(Boolean).join(" · ");
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveDocumentParentFolderId(nodes: DocumentTreeNode[], documentPath: string | null): string | null {
  if (!documentPath || !documentPath.includes("/")) return null;
  const parentPath = documentPath.split("/").slice(0, -1).join("/");
  return findFolderByPath(nodes, parentPath)?.id ?? null;
}

function findFolderByPath(nodes: DocumentTreeNode[], path: string): DocumentTreeNode | null {
  for (const node of nodes) {
    if (node.type === "folder" && node.path === path) return node;
    if (node.children) {
      const found = findFolderByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}
