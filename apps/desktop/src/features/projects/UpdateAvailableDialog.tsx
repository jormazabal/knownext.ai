import type { AvailableUpdate, UpdateDownloadProgress } from "../../lib/runtime/updater";
import {useEffect,useRef} from "react";
import {ModalFrame} from "../../components/ui/ModalFrame";

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
  const busy = state === "downloading" || state === "installing";
  const heading=useRef<HTMLHeadingElement|null>(null);
  useEffect(()=>{if(busy&&!heading.current?.closest('[inert]'))heading.current?.focus({preventScroll:true});},[busy]);
  if (!update) return null;
  const percentage=progress?.percent;
  const boundedPercentage=typeof percentage==="number"&&Number.isFinite(percentage)?Math.max(0,Math.min(100,percentage)):undefined;
  const progressLabel = boundedPercentage !== undefined ? `${boundedPercentage}%` : "Preparando";
  const releaseDate = update.date ? formatDateTime(update.date) : null;
  const sizeLabel = update.sizeBytes ? formatBytes(update.sizeBytes) : null;
  const platformLabel = update.platform === "android-private" ? "APK Android privado" : "Actualizador de escritorio";

  return (
    <ModalFrame label="Actualización disponible" onClose={()=>{if(!busy)onClose();}} className="z-[95]">
      <section aria-busy={busy} className="flex max-h-[calc(100dvh-24px)] w-[min(480px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white shadow-menu">
        <header className="shrink-0 px-5 pt-4">
          <h2 ref={heading} tabIndex={-1} className="text-[15px] font-semibold outline-none">Actualización disponible</h2>
          <p className="mt-1 text-[11px] text-ink-secondary">
            KnowNext.ai v{update.version} está lista para instalar.
          </p>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4 text-xs leading-5 text-ink-secondary">
          <div className="flex items-baseline justify-between gap-3">
            <span>Versión instalada</span>
            <span className="font-mono text-[11px] text-ink-primary">v{update.currentVersion}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span>Nueva versión</span>
            <span className="font-mono text-sm font-semibold text-brand-dark">v{update.version}</span>
          </div>
          {releaseDate ? <p className="text-[11px]">Publicada el {releaseDate}.</p> : null}
          <div className="flex items-baseline justify-between gap-3">
            <span>Canal</span>
            <span className="font-medium text-ink-primary">{platformLabel}</span>
          </div>
          {sizeLabel ? (
            <div className="flex items-baseline justify-between gap-3">
              <span>Tamaño</span>
              <span className="font-mono text-[11px] text-ink-primary">{sizeLabel}</span>
            </div>
          ) : null}
          {update.mandatory ? <p className="text-[11px] text-red-700">Esta actualización está marcada como obligatoria.</p> : null}
          {update.notes ? (
            <section><h3 className="mb-1 font-medium text-ink-primary">Cambios de esta versión</h3><p className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words leading-5">{update.notes}</p></section>
          ) : null}
          {busy ? (
            <div>
              <div className="flex items-center justify-between text-[11px]">
                <span>{state === "installing" ? "Instalando" : "Descargando"}</span>
                <span>{progressLabel}</span>
              </div>
              <div role="progressbar" aria-label={state==="installing"?"Instalando actualización":"Descargando actualización"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={boundedPercentage} className="mt-2 h-2 overflow-hidden rounded-full bg-panel">
                <div className="h-full rounded-full bg-brand-orange transition-all" style={{ width: `${boundedPercentage ?? 20}%` }} />
              </div>
            </div>
          ) : null}
          {error ? <p role="alert" className="break-words text-xs text-red-700">{error}</p> : null}
        </div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-2 px-5 pb-4">
          <button type="button"
            className="min-h-11 rounded-md border border-line px-4 text-xs hover:bg-panel disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={onClose}
          >
            Más tarde
          </button>
          <button type="button"
            className="min-h-11 rounded-md bg-brand-orange px-4 text-xs font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={onInstall}
          >
            {busy ? "Actualizando" : "Actualizar"}
          </button>
        </footer>
      </section>
    </ModalFrame>
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
