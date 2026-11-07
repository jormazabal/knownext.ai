import {useEffect, useRef, useState} from "react";
import {ModalFrame} from "../../components/ui/ModalFrame";
import {reviewMixedRetirement, retireMixedPayloads} from "../../lib/api/mixedRetirement";
import {getApiErrorMessage} from "../../lib/api/client";
import type {MixedRetirement} from "../../types/mixedRetirement";

export function MixedRetirementDialog({projectId, planId, projectName, onClose}: {projectId: string; planId: string; projectName?: string; onClose: () => void}) {
  const [review, setReview] = useState<MixedRetirement | null>(null);
  const [busy, setBusy] = useState(false), [ack, setAck] = useState(false), [fresh, setFresh] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const epoch = useRef(0), flight = useRef<object | null>(null), body = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if ((notice || error) && body.current) body.current.scrollTop = 0; }, [notice, error]);
  async function run(work: (owns: () => boolean) => Promise<void>) {
    if (flight.current) return;
    const token = {}; flight.current = token;
    const turn = epoch.current, owns = () => turn === epoch.current;
    setBusy(true); setError("");
    try { await work(owns); }
    catch (reason) { if (owns()) { setError(getApiErrorMessage(reason, "No se confirmó la retirada. Consulta sin repetir.")); setFresh(false); } }
    finally { if (flight.current === token) flight.current = null; if (owns()) setBusy(false); }
  }
  async function consult() {
    await run(async owns => {
      setAck(false); setFresh(false); setNotice("");
      const value = await reviewMixedRetirement(projectId, planId);
      if (owns()) { setReview(value); setFresh(true); }
    });
  }
  useEffect(() => {
    setReview(null); setAck(false); setFresh(false); setNotice(""); setError("");
    const timer = setTimeout(() => void consult(), 0);
    return () => { clearTimeout(timer); epoch.current++; flight.current = null; };
  }, [projectId, planId]);
  async function retire() {
    if (!review || !fresh || !ack || !review.canRetire) return;
    await run(async owns => {
      setAck(false); setFresh(false);
      const result = await retireMixedPayloads(review);
      if (!owns()) return;
      setReview(result.review);
      setNotice(result.cancelled ? "Selección cancelada. No se ha iniciado la retirada." : result.observed ? "Acuse no confirmado. Se muestra una consulta del estado; no se ha repetido la retirada. Revisa de nuevo antes de continuar." : "Copias locales retiradas. Conserva el respaldo externo para recuperar los contenidos; recibos e identidades permanecen.");
    });
  }
  return <ModalFrame label="Retirada de copias locales" className="!z-[180]" onClose={onClose}>
    <section className="flex max-h-[calc(100dvh-24px)] w-full max-w-xl flex-col rounded-xl bg-white p-4 shadow-menu sm:p-5">
      <header className="shrink-0"><h2 className="text-base font-semibold">Retirar copias locales</h2>{projectName && <p className="mt-1 break-words text-xs font-medium text-ink-secondary">{projectName}</p>}</header>
      <div ref={body} className="mt-3 min-h-0 flex-1 overflow-y-auto text-xs leading-6">
        {busy && <p role="status" className="mb-3">Comprobando el respaldo y las copias…</p>}
        {error && <p role="alert" className="mb-3 break-words text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mb-3 rounded-lg bg-panel p-3">{notice}</p>}
        {review && <>
          <p className="text-sm font-semibold">{review.phase === "retired" ? "Retirada terminada" : review.phase === "partial" ? "Retirada interrumpida" : "Copias disponibles"}</p>
          <p className="mt-1">{review.remainingCount} de {review.totalCount} archivos de copia pendientes · {(review.remainingBytes / 1024).toFixed(1)} KB</p>
          {review.canRetire && <div className="mt-3 space-y-2"><p>{review.phase === "partial" ? "La retirada es permanente. Vuelve a elegir el respaldo completo que conservaste al iniciar; se comprobará otra vez antes de retirar las copias restantes." : "La retirada es permanente. Guarda primero todas las variantes con «Respaldar variantes». Ahora tendrás que elegir ese ZIP completo para comprobarlo otra vez antes de retirar."}</p><p>Se retiran solo las copias anteriores y elegidas de esta preparación. Los documentos actuales, su historial, los recibos y el respaldo elegido permanecen. La identidad se conserva y no se libera su cuota.</p><p>Si hay un corte, consultar no continúa. Para retirar lo que quede debes revisar de nuevo y volver a elegir el respaldo.</p></div>}
          <p className="mt-3 text-ink-secondary">Para recuperar los contenidos, descomprime el respaldo en una carpeta nueva y ábrela como otro proyecto. Conserva ese archivo en un lugar fiable; esta comprobación no garantiza la duración del soporte.</p>
          <details className="mt-2 text-ink-secondary"><summary className="min-h-11 cursor-pointer py-2">Identificar el respaldo completo</summary><p className="break-all">SHA256 · {review.archiveSha256}</p><p>{(review.archiveBytes/1024).toFixed(1)} KB · ZIP de datos</p></details>
        </>}
      </div>
      <footer className="mt-3 shrink-0">
        {fresh && review?.canRetire && <label className="mb-2 flex min-h-11 items-start gap-2 text-xs leading-5"><input type="checkbox" checked={ack} disabled={busy} onChange={event => setAck(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-brand-orange"/><span>Conservaré el respaldo completo. Quiero retirar permanentemente estas copias locales, manteniendo sus recibos.</span></label>}
        <div className="flex flex-wrap justify-end gap-2"><button disabled={busy} onClick={() => void consult()} className="min-h-11 rounded px-3 text-xs hover:bg-panel disabled:opacity-50">Revisar retirada</button>{fresh && review?.canRetire && <button disabled={busy || !ack} onClick={() => void retire()} className="min-h-11 rounded bg-red-700 px-3 text-xs font-semibold text-white disabled:opacity-50">Elegir respaldo y retirar copias</button>}<button onClick={onClose} className="min-h-11 rounded px-3 text-xs font-medium hover:bg-panel">Volver a la preparación</button></div>
      </footer>
    </section>
  </ModalFrame>;
}
