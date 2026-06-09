import { ArchiveRestore, FileWarning, RefreshCw, Trash2, X } from "lucide-react";
import type { OrphanDraft } from "../../types/domain";

export type DocumentFooterDialogAction =
  | "discard-draft"
  | "update-remote"
  | "update-remote-discard-draft"
  | "sync-saved-while-draft";

type CloseDirtyDocumentDialogProps = {
  open: boolean;
  documentName: string;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
};

export function CloseDirtyDocumentDialog({ open, documentName, onCancel, onDiscard, onSave }: CloseDirtyDocumentDialogProps) {
  if (!open) return null;

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[90] grid place-items-center bg-black/20">
      <section className="w-[430px] rounded-lg border border-line bg-white shadow-menu">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">Cerrar documento con cambios</h2>
          <p className="mt-1 truncate text-[11px] text-ink-secondary">{documentName}</p>
        </header>
        <div className="px-5 py-5 text-[11px] leading-5 text-ink-secondary">
          El documento tiene cambios pendientes de guardar en disco. Puedes guardarlos, descartar el borrador interno o cancelar el cierre.
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onCancel}>
            Cancelar
          </button>
          <button className="h-9 rounded-md border border-line px-4 text-[11px] text-red-700 hover:bg-red-50" onClick={onDiscard}>
            Descartar
          </button>
          <button className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={onSave}>
            Guardar
          </button>
        </footer>
      </section>
    </div>
  );
}

type DocumentFooterActionDialogProps = {
  open: boolean;
  action: DocumentFooterDialogAction | null;
  documentName: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DocumentFooterActionDialog({ open, action, documentName, onCancel, onConfirm }: DocumentFooterActionDialogProps) {
  if (!open || !action) return null;
  const copy = getDocumentFooterActionCopy(action, documentName);

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[90] grid place-items-center bg-black/20">
      <section className="w-[440px] rounded-lg border border-line bg-white shadow-menu" role="dialog" aria-modal="true" aria-labelledby="document-footer-action-title">
        <header className="border-b border-line px-5 py-4">
          <h2 id="document-footer-action-title" className="text-[15px] font-semibold text-ink-primary">{copy.title}</h2>
          <p className="mt-1 truncate text-[11px] text-ink-secondary">{documentName}</p>
        </header>
        <div className="px-5 py-5">
          <p className="text-[12px] leading-5 text-ink-secondary">{copy.description}</p>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className="h-9 rounded-md border border-line px-3 text-[11px] font-medium text-ink-primary hover:bg-panel" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            className={[
              "h-9 rounded-md px-3 text-[11px] font-semibold text-white shadow-subtle",
              copy.danger ? "bg-red-600 hover:bg-red-700" : "bg-brand-orange hover:bg-brand-dark",
            ].join(" ")}
            type="button"
            onClick={onConfirm}
          >
            {copy.confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function getDocumentFooterActionCopy(action: DocumentFooterDialogAction, documentName: string) {
  if (action === "discard-draft") {
    return {
      title: "Descartar cambios pendientes",
      description: `Se volverá a la última versión guardada de ${documentName}. Los cambios no guardados se perderán.`,
      confirmLabel: "Descartar cambios",
      danger: true,
    };
  }
  if (action === "update-remote-discard-draft") {
    return {
      title: "Actualizar y perder cambios pendientes",
      description: "Existe una versión más reciente en Git/GitHub. Si continúas, se descargará esa versión y se perderán los cambios pendientes que todavía no has guardado.",
      confirmLabel: "Actualizar y descartar",
      danger: true,
    };
  }
  if (action === "sync-saved-while-draft") {
    return {
      title: "Sincronizar versión guardada",
      description: "Se sincronizará la última versión guardada del documento. Los cambios pendientes seguirán abiertos como borrador hasta que los guardes.",
      confirmLabel: "Sincronizar versión guardada",
      danger: false,
    };
  }
  return {
    title: "Revisar versión disponible",
    description: "Existe una versión más reciente en Git/GitHub. Si continúas, se descargará y se mostrará la última versión del documento.",
    confirmLabel: "Actualizar",
    danger: false,
  };
}

type RecoverableDraftsDialogProps = {
  open: boolean;
  drafts: OrphanDraft[];
  onClose: () => void;
  onRefresh: () => void;
  onRestore: (draft: OrphanDraft) => void;
  onDiscard: (draftKey: string) => void;
};

export function RecoverableDraftsDialog({ open, drafts, onClose, onRefresh, onRestore, onDiscard }: RecoverableDraftsDialogProps) {
  if (!open) return null;

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[90] grid place-items-center bg-black/20">
      <section
        className="flex max-h-[min(620px,calc(100dvh-48px))] w-[min(660px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recoverable-drafts-title"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex min-w-0 gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-hover text-brand-orange">
              <ArchiveRestore size={18} />
            </span>
            <div className="min-w-0">
              <h2 id="recoverable-drafts-title" className="text-[15px] font-semibold text-ink-primary">Borradores recuperables</h2>
              <p className="mt-1 max-w-[500px] text-[11px] leading-5 text-ink-secondary">
                Son copias locales de cambios sin guardar cuyo archivo original ya no está disponible. Puedes recrear el archivo desde el borrador o descartarlo si ya no lo necesitas.
              </p>
            </div>
          </div>
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
            data-tooltip="Cerrar"
            aria-label="Cerrar borradores recuperables"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 rounded-md border border-line bg-panel px-4 py-3 text-[11px] leading-5 text-ink-secondary">
            <p className="font-semibold text-ink-primary">Cuándo aparece un borrador aquí</p>
            <p className="mt-1">
              Si editas un documento, quedan cambios pendientes y después el archivo se elimina, se mueve fuera del proyecto o deja de poder localizarse, KnowNext.ai conserva el contenido para evitar perder trabajo.
            </p>
          </div>
          {drafts.length === 0 ? (
            <div className="grid place-items-center rounded-md border border-dashed border-line bg-white px-4 py-8 text-center">
              <FileWarning size={24} className="text-ink-secondary" />
              <p className="mt-3 text-[12px] font-semibold text-ink-primary">No hay borradores pendientes</p>
              <p className="mt-1 max-w-[420px] text-[11px] leading-5 text-ink-secondary">
                Todos los borradores locales siguen asociados a sus archivos o ya se han resuelto. Puedes actualizar para volver a comprobar el estado del disco.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {drafts.map((draft) => (
                <article key={draft.draftKey} className="rounded-md border border-line bg-white px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-ink-primary">{draft.name}</p>
                      <p className="mt-1 truncate text-[11px] text-ink-secondary">{draft.path}</p>
                      <p className="mt-2 text-[11px] text-ink-secondary">
                        {draft.wordCount} palabras · {formatDateTime(draft.draftUpdatedAt)}
                        {!draft.recoverable && draft.reason ? ` · ${draft.reason}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        className="flex h-8 items-center gap-2 rounded-md border border-line px-3 text-[11px] font-medium text-red-700 hover:bg-red-50"
                        onClick={() => onDiscard(draft.draftKey)}
                      >
                        <Trash2 size={14} />
                        Descartar
                      </button>
                      <button
                        className="flex h-8 items-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!draft.recoverable}
                        onClick={() => onRestore(draft)}
                      >
                        <ArchiveRestore size={14} />
                        Recrear archivo
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onClose}>
            Cerrar
          </button>
          <button className="flex h-9 items-center gap-2 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={onRefresh}>
            <RefreshCw size={14} />
            Actualizar
          </button>
        </footer>
      </section>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}
