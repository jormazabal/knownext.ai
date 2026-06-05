import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Upload, X } from "lucide-react";
import type { AssetImportResponse, DocumentTreeNode, InsertImageReferenceResponse } from "../../types/domain";

type InsertImageDialogProps = {
  activeDocumentId: string;
  activeDocumentPath: string | null;
  tree: DocumentTreeNode[];
  onClose: () => void;
  onImportImage: (parentId: string | null, file: File) => Promise<AssetImportResponse>;
  onBuildReference: (documentId: string, assetId: string, altText?: string | null) => Promise<InsertImageReferenceResponse>;
  onInsert: (markdown: string) => void;
};

export function InsertImageDialog({
  activeDocumentId,
  activeDocumentPath,
  tree,
  onClose,
  onImportImage,
  onBuildReference,
  onInsert,
}: InsertImageDialogProps) {
  const images = useMemo(() => collectImages(tree), [tree]);
  const uploadParentId = useMemo(() => resolveDocumentParentFolderId(tree, activeDocumentPath), [tree, activeDocumentPath]);
  const [mode, setMode] = useState<"project" | "upload" | "url">("project");
  const [query, setQuery] = useState("");
  const [altText, setAltText] = useState("");
  const [url, setUrl] = useState("https://");
  const [busy, setBusy] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState(images[0]?.id ?? "");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const visibleImages = images.filter((image) => {
    const value = `${image.name} ${image.path ?? ""}`.toLowerCase();
    return value.includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    if (!selectedAssetId && visibleImages[0]) setSelectedAssetId(visibleImages[0].id);
  }, [selectedAssetId, visibleImages]);

  async function insertSelectedAsset(assetId = selectedAssetId) {
    if (!assetId) return;
    setBusy(true);
    try {
      const reference = await onBuildReference(activeDocumentId, assetId, altText || null);
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
    onInsert(`![${alt}](${url.trim()})`);
  }

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[98] grid place-items-center bg-black/20 px-4">
      <section className="flex max-h-[min(620px,calc(100dvh-48px))] w-[min(640px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-primary">Insertar imagen</h2>
            <p className="mt-1 text-[11px] text-ink-secondary">Usa una imagen del proyecto, sube una nueva o enlaza una URL externa.</p>
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
              className={["h-8 border-b-2 px-3 text-[11px] font-semibold", mode === value ? "border-brand-orange text-brand-orange" : "border-transparent text-ink-secondary hover:text-ink-primary"].join(" ")}
              onClick={() => setMode(value as typeof mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label className="block text-[11px] font-semibold text-ink-secondary">
            Texto alternativo
            <input
              className="mt-1 h-9 w-full rounded-md border border-line px-3 text-[12px] text-ink-primary outline-none focus:border-brand-orange"
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              placeholder="Descripcion breve de la imagen"
            />
          </label>
          {mode === "project" ? (
            <div className="mt-4">
              <input
                className="h-9 w-full rounded-md border border-line px-3 text-[12px] outline-none focus:border-brand-orange"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar imagen del proyecto"
              />
              <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                {visibleImages.length === 0 ? (
                  <p className="rounded-md border border-line bg-panel px-3 py-4 text-center text-[11px] text-ink-secondary">No hay imágenes que coincidan.</p>
                ) : (
                  visibleImages.map((image) => (
                    <button
                      key={image.id}
                      className={["flex h-12 w-full items-center gap-3 rounded-md border px-3 text-left", selectedAssetId === image.id ? "border-orange-200 bg-brand-hover" : "border-line hover:bg-panel"].join(" ")}
                      onClick={() => setSelectedAssetId(image.id)}
                      onDoubleClick={() => void insertSelectedAsset(image.id)}
                    >
                      <ImageIcon size={15} className="text-brand-orange" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold text-ink-primary">{image.name}</span>
                        <span className="block truncate text-[10px] text-ink-secondary">{image.path}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : mode === "upload" ? (
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
              <input className="mt-1 h-9 w-full rounded-md border border-line px-3 text-[12px] outline-none focus:border-brand-orange" value={url} onChange={(event) => setUrl(event.target.value)} />
            </label>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onClose}>Cancelar</button>
          <button
            className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || (mode === "project" && !selectedAssetId)}
            onClick={() => {
              if (mode === "project") void insertSelectedAsset();
              if (mode === "upload") fileInputRef.current?.click();
              if (mode === "url") insertUrl();
            }}
          >
            {busy ? "Insertando" : "Insertar"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function collectImages(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.flatMap((node) => {
    if (node.type === "image") return [node];
    return node.children ? collectImages(node.children) : [];
  });
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
