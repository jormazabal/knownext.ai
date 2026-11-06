import { RefreshCw } from "lucide-react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { LocalStateReview } from "./LocalStateReview";

export function StartupRecovery({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return <ModalFrame label="Recuperación del inicio" onClose={() => {}} className="z-[130] !block !bg-white !p-0">
    <div className="min-h-full px-5 py-6"><div className="mx-auto max-w-[580px] py-4"><p className="text-xs font-semibold text-brand-dark">KnowNext.ai · Recuperación</p><h1 data-autofocus tabIndex={-1} className="mt-3 text-2xl font-semibold outline-none">Revisemos el inicio</h1><p className="mb-4 mt-3 text-sm leading-6 text-ink-secondary">No se ha podido cargar el espacio de trabajo. Comprueba el estado local antes de reintentar.</p>
      {error && <details className="mb-4 rounded-md bg-panel p-3 text-xs leading-5"><summary className="cursor-pointer font-semibold">Detalle del inicio</summary><p className="mt-2 break-words">{error}</p></details>}
      <LocalStateReview allowReset/>
      <button disabled={error === null} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-orange px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50" onClick={onRetry}><RefreshCw size={16}/>{error === null ? "Iniciando…" : "Reintentar inicio"}</button>
    </div></div>
  </ModalFrame>;
}
