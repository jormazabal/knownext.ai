import type { AvailableUpdate, UpdateDownloadProgress } from "../../lib/runtime/updater";

export type UpdateDialogState = "idle" | "checking" | "available" | "not-available" | "unsupported" | "downloading" | "installing" | "error";

type UpdateAvailableDialogProps = {
  update: AvailableUpdate | null;
  state: UpdateDialogState;
  progress: UpdateDownloadProgress | null;
  error: string | null;
  onClose: () => void;
  onInstall: () => void;
};

export function UpdateAvailableDialog({
  update,
  state,
  progress,
  error,
  onClose,
  onInstall,
}: UpdateAvailableDialogProps) {
  if (!update) return null;

  const busy = state === "downloading" || state === "installing";
  const progressLabel = progress?.percent !== undefined ? `${progress.percent}%` : "Preparando";
  const releaseDate = update.date ? formatDateTime(update.date) : null;
  const sizeLabel = update.sizeBytes ? formatBytes(update.sizeBytes) : null;
  const platformLabel = update.platform === "android-private" ? "APK Android privado" : "Actualizador de escritorio";

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[95] grid place-items-center bg-black/20">
      <section className="w-[460px] rounded-lg border border-line bg-white shadow-menu">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">Actualización disponible</h2>
          <p className="mt-1 text-[11px] text-ink-secondary">
            KnowNext.ai v{update.version} está lista para instalar.
          </p>
        </header>
        <div className="space-y-4 px-5 py-5 text-[11px] text-ink-secondary">
          <div className="flex items-center justify-between rounded-md border border-line bg-panel px-3 py-2">
            <span>Versión instalada</span>
            <span className="font-mono text-[11px] text-ink-primary">v{update.currentVersion}</span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-orange-200 bg-brand-hover px-3 py-2">
            <span>Nueva versión</span>
            <span className="font-mono text-[11px] font-semibold text-brand-orange">v{update.version}</span>
          </div>
          {releaseDate ? <p className="text-[11px]">Publicada el {releaseDate}.</p> : null}
          <div className="flex items-center justify-between rounded-md border border-line bg-white px-3 py-2">
            <span>Canal</span>
            <span className="font-medium text-ink-primary">{platformLabel}</span>
          </div>
          {sizeLabel ? (
            <div className="flex items-center justify-between rounded-md border border-line bg-white px-3 py-2">
              <span>Tamaño</span>
              <span className="font-mono text-[11px] text-ink-primary">{sizeLabel}</span>
            </div>
          ) : null}
          {update.mandatory ? <p className="text-[11px] text-red-700">Esta actualización está marcada como obligatoria.</p> : null}
          {update.notes ? (
            <div className="max-h-28 overflow-y-auto rounded-md border border-line bg-white px-3 py-2 text-[11px] leading-5">
              {update.notes}
            </div>
          ) : null}
          {busy ? (
            <div>
              <div className="flex items-center justify-between text-[11px]">
                <span>{state === "installing" ? "Instalando" : "Descargando"}</span>
                <span>{progressLabel}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel">
                <div className="h-full rounded-full bg-brand-orange transition-all" style={{ width: `${progress?.percent ?? 20}%` }} />
              </div>
            </div>
          ) : null}
          {error ? <p className="text-[11px] text-red-700">{error}</p> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button
            className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={onClose}
          >
            Más tarde
          </button>
          <button
            className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={onInstall}
          >
            {busy ? "Actualizando" : "Actualizar"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("es", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}
