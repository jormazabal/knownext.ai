import type { GithubDeviceStartResponse } from "../../types/domain";
import {ModalFrame} from "../../components/ui/ModalFrame";

export type GithubLoginState = "idle" | "starting" | "waiting" | "authenticated" | "error";

type GithubLoginDialogProps = {
  open: boolean;
  state: GithubLoginState;
  device: GithubDeviceStartResponse | null;
  error: string | null;
  polling: boolean;
  onClose: () => void;
  onStart: () => void;
  onOpenGithub: () => void;
  onPoll: () => void;
  devRuntime?: boolean;
};

export function GithubLoginDialog({
  open,
  state,
  device,
  error,
  polling,
  onClose,
  onStart,
  onOpenGithub,
  onPoll,
}: GithubLoginDialogProps) {
  if (!open) return null;

  const busy = state === "starting";
  const localGithubFallback = Boolean(device?.mock || (device?.status === "error" && device.error === "github_remote_not_configured"));
  return (
    <ModalFrame label="Conectar GitHub" onClose={onClose} className="z-[95]">
      <section className="flex max-h-[calc(100dvh-24px)] w-[min(480px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white shadow-menu">
        <header className="shrink-0 px-5 pt-4">
          <h2 className="text-[15px] font-semibold">Conectar GitHub</h2>
          <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
            GitHub es opcional para trabajar con archivos locales. Conecta una cuenta para los proyectos que necesitan sincronización con sus repositorios.
          </p>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4 text-xs leading-5 text-ink-secondary">
          {localGithubFallback ? (
            <>
              <div className="rounded-md border border-orange-200 bg-brand-hover px-3 py-3">
                <p className="text-[11px] font-semibold text-ink-primary">GitHub remoto no configurado</p>
                <p className="mt-1 leading-5">
                  La sincronización remota no está disponible. Puedes continuar trabajando con tus archivos locales; el historial depende de la capacidad de tu dispositivo y de los ajustes del proyecto.
                </p>
              </div>
              <p>Puedes seguir editando y guardando documentos. Los proyectos configurados con GitHub mostrarán el acceso remoto como pausado.</p>
            </>
          ) : device ? (
            <>
              <div className="rounded-md border border-line bg-panel px-3 py-3">
                <div className="text-[10px] uppercase text-ink-secondary">Código de verificación</div>
                <div className="mt-1 break-all font-mono text-[22px] font-semibold tracking-normal text-ink-primary">{device.userCode}</div>
              </div>
              <p>Abre GitHub, introduce el código y vuelve aquí para confirmar la conexión.</p>
              <p>KnowNext.ai comprobará la autorización automáticamente cada {Math.max(device.interval, 1)} s.</p>
            </>
          ) : (
            <p>Inicia el flujo de dispositivo para autorizar KnowNext.ai desde GitHub.</p>
          )}
          {error ? <p role="alert" className="break-words text-red-700">{error}</p> : null}
        </div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-2 px-5 pb-4">
          <button type="button" className="min-h-11 rounded-md px-4 text-xs hover:bg-panel" onClick={onClose}>
            Cerrar
          </button>
          {!device ? (
            <button type="button"
              className="min-h-11 rounded-md bg-brand-orange px-4 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              disabled={busy}
              onClick={onStart}
            >
              {busy ? "Preparando" : "Iniciar login"}
            </button>
          ) : localGithubFallback ? (
            <button type="button"
              className="min-h-11 rounded-md bg-brand-orange px-4 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              disabled={busy}
              onClick={onStart}
            >
              {busy ? "Preparando" : "Reintentar login"}
            </button>
          ) : (
            <>
              <button type="button"
                className="min-h-11 rounded-md px-4 text-xs font-medium text-ink-primary hover:bg-panel disabled:cursor-not-allowed disabled:opacity-60"
                disabled={polling}
                onClick={onPoll}
              >
                {polling ? "Comprobando" : "Comprobar"}
              </button>
              <button type="button" className="min-h-11 rounded-md bg-brand-dark px-4 text-xs font-semibold text-white" onClick={onOpenGithub}>Abrir GitHub</button>
            </>
          )}
        </footer>
      </section>
    </ModalFrame>
  );
}
