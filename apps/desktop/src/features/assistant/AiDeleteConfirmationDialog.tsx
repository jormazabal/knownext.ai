import type { AiPendingDelete } from "../../types/domain";

type AiDeleteConfirmationDialogProps = {
  pendingDelete: AiPendingDelete | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AiDeleteConfirmationDialog({ pendingDelete, onCancel, onConfirm }: AiDeleteConfirmationDialogProps) {
  if (!pendingDelete) return null;

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[96] grid place-items-center bg-black/20">
      <section className="w-[min(520px,calc(100vw-32px))] rounded-lg border border-line bg-white shadow-menu">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink-primary">La IA quiere eliminar elementos</h2>
          <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
            Revisa la lista antes de confirmar. Esta acción modifica el árbol del proyecto.
          </p>
        </header>
        <div className="max-h-64 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {pendingDelete.paths.map((path) => (
              <div key={path} className="rounded-md border border-line bg-panel px-3 py-2 font-mono text-[10px] text-ink-primary">
                {path}
              </div>
            ))}
          </div>
          {pendingDelete.documentCount > 1 ? (
            <p className="mt-3 text-[11px] text-ink-secondary">Se verán afectados {pendingDelete.documentCount} documentos.</p>
          ) : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onCancel}>
            Cancelar
          </button>
          <button className="h-9 rounded-md bg-red-600 px-4 text-[11px] font-semibold text-white hover:bg-red-700" onClick={onConfirm}>
            Eliminar
          </button>
        </footer>
      </section>
    </div>
  );
}
