import { useEffect, useState } from "react";
import type { DocumentTreeNode } from "../../types/domain";

type MoveDocumentDialogProps = {
  open: boolean;
  node: DocumentTreeNode | null;
  folders: DocumentTreeNode[];
  onClose: () => void;
  onMove: (targetFolderId: string | null) => void;
};

export function MoveDocumentDialog({ open, node, folders, onClose, onMove }: MoveDocumentDialogProps) {
  const [targetFolderId, setTargetFolderId] = useState("");

  useEffect(() => {
    if (open) setTargetFolderId("");
  }, [open]);

  if (!open || !node) return null;

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[80] grid place-items-center bg-black/20">
      <section className="w-[420px] rounded-lg border border-line bg-white shadow-menu">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">Mover elemento</h2>
          <p className="mt-1 truncate text-[11px] text-ink-secondary">{node.name}</p>
        </header>
        <div className="px-5 py-5">
          <label className="block text-[11px] font-medium text-ink-secondary">
            Carpeta de destino
            <select
              className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
              value={targetFolderId}
              onChange={(event) => setTargetFolderId(event.target.value)}
            >
              <option value="">Raíz del proyecto</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.path || folder.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onClose}>
            Cancelar
          </button>
          <button className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={() => onMove(targetFolderId || null)}>
            Mover
          </button>
        </footer>
      </section>
    </div>
  );
}
