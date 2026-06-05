import type { GithubDeviceStartResponse } from "../../types/domain";

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
    <div className="knownext-modal-overlay fixed inset-0 z-[95] grid place-items-center bg-black/20">
      <section className="w-[460px] rounded-lg border border-line bg-white shadow-menu">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">Conectar GitHub</h2>
          <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
            La cuenta GitHub activa el historial versionado, la sincronización manual y los proyectos conectados a repositorios.
          </p>
        </header>
        <div className="space-y-4 px-5 py-5 text-[11px] text-ink-secondary">
          {localGithubFallback ? (
            <>
              <div className="rounded-md border border-orange-200 bg-brand-hover px-3 py-3">
                <p className="text-[11px] font-semibold text-ink-primary">GitHub remoto no configurado</p>
                <p className="mt-1 leading-5">
                  Esta instalación mantiene el historial local activo y pausa la sincronización remota hasta que la conexión GitHub esté disponible.
                </p>
              </div>
              <p>Puedes seguir editando y guardando documentos. Los proyectos configurados con GitHub mostrarán el acceso remoto como pausado.</p>
            </>
          ) : device ? (
            <>
              <div className="rounded-md border border-line bg-panel px-3 py-3">
                <div className="text-[10px] uppercase text-ink-secondary">Código de verificación</div>
                <div className="mt-1 font-mono text-[22px] font-semibold tracking-normal text-ink-primary">{device.userCode}</div>
              </div>
              <p>Abre GitHub, introduce el código y vuelve aquí para confirmar la conexión.</p>
              <p>KnowNext.ai comprobará la autorización automáticamente cada {Math.max(device.interval, 1)} s.</p>
            </>
          ) : (
            <p>Inicia el flujo de dispositivo para autorizar KnowNext.ai desde GitHub.</p>
          )}
          {error ? <p className="text-red-700">{error}</p> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onClose}>
            Cerrar
          </button>
          {!device ? (
            <button
              className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              disabled={busy}
              onClick={onStart}
            >
              {busy ? "Preparando" : "Iniciar login"}
            </button>
          ) : localGithubFallback ? (
            <button
              className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              disabled={busy}
              onClick={onStart}
            >
              {busy ? "Preparando" : "Reintentar login"}
            </button>
          ) : (
            <>
              <button className="h-9 rounded-md border border-brand-orange px-4 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover" onClick={onOpenGithub}>
                Abrir GitHub
              </button>
              <button
                className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
                disabled={polling}
                onClick={onPoll}
              >
                {polling ? "Comprobando" : "Ya autoricé"}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
