import { useEffect, useRef, useState } from "react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { getApiErrorMessage } from "../../lib/api/client";
import type { DocumentTreeNode } from "../../types/domain";

type MoveDocumentDialogProps = {
  open: boolean;
  node: DocumentTreeNode | null;
  folders: DocumentTreeNode[];
  onClose: () => void;
  onMove: (targetFolderId: string | null) => void | Promise<void>;
};

export function MoveDocumentDialog({ open, node, folders, onClose, onMove }: MoveDocumentDialogProps) {
  const [targetFolderId, setTargetFolderId] = useState("");
  const [moving, setMoving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function move() {
    if (pending.current) return;
    pending.current = true; setMoving(true); setError(null);
    try { await onMove(targetFolderId || null); }
    catch (failure) { setError(getApiErrorMessage(failure,"No se ha podido mover el elemento.")); }
    finally { pending.current = false; setMoving(false); }
  }

  useEffect(() => {
    if (open) setTargetFolderId("");
  }, [open]);

  if (!open || !node) return null;

  return (
    <ModalFrame label="Mover elemento" onClose={() => { if (!pending.current) onClose(); }}>
      <section className="max-h-[calc(100dvh-24px)] w-full max-w-[420px] overflow-y-auto rounded-lg border border-line bg-white shadow-menu">
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
              disabled={moving}
              data-autofocus
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
        {error && <p role="alert" className="px-5 text-sm">{error}</p>}
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button disabled={moving} className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onClose}>
            Cancelar
          </button>
          <button disabled={moving} className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={() => void move()}>
            {moving ? "Moviendo…" : "Mover"}
          </button>
        </footer>
      </section>
    </ModalFrame>
  );
}
