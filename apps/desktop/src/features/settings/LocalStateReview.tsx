import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileWarning, RefreshCw } from "lucide-react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { getApiErrorMessage } from "../../lib/api/client";
import { getLocalStateInventory, resetReviewedLocalState } from "../../lib/api/localState";
import type { LocalStateEntry, LocalStateInventory } from "../../types/localState";

export function LocalStateReview({ allowReset = false }: { allowReset?: boolean }) {
  const [inventory, setInventory] = useState<LocalStateInventory | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState<LocalStateEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const submitting = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError("");
    try { const value = await getLocalStateInventory(); if (request === sequence.current) setInventory(value); }
    catch (error) { if (request === sequence.current) setError(getApiErrorMessage(error, "No se pudo revisar el estado local. No se ha modificado ningún archivo.")); }
    finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); return () => { sequence.current += 1; }; }, [refresh]);
  async function reset() {
    if (!review || submitting.current) return;
    submitting.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await resetReviewedLocalState(review);
      setReview(null);
      setNotice(`Estado restablecido. Original conservado en ${result.archivePath}. La copia se mantiene hasta que decidas retirarla. Puedes reintentar el inicio.`);
      await refresh();
    } catch (error) { setError(getApiErrorMessage(error, "No se ha restablecido el estado. Actualiza la revisión antes de reintentar.")); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section aria-label="Revisión del estado local" aria-busy={loading || busy} className="text-sm">
    <header className="flex items-center justify-between gap-3"><h2 className="font-semibold">Estado local</h2><button disabled={loading || busy} onClick={() => { setNotice(""); void refresh(); }} className="flex min-h-11 items-center gap-2 rounded-md px-3 hover:bg-panel disabled:opacity-50"><RefreshCw size={15}/>Actualizar revisión</button></header>
    <p className="mb-3 text-xs leading-5 text-ink-secondary">Los archivos originales se conservan. Esta revisión no muestra claves ni contenido de conversaciones.</p>
    {loading && <p role="status" className="py-3 text-ink-secondary">Revisando archivos locales…</p>}
    {inventory?.entries.map(entry => <article key={entry.id} className="mb-2 rounded-md bg-panel p-3">
      <div className="flex items-start gap-2">{entry.status === "healthy" || entry.status === "missing" ? <Check size={16} className="mt-0.5 shrink-0"/> : <FileWarning size={16} className="mt-0.5 shrink-0 text-brand-dark"/>}<div className="min-w-0 flex-1"><h3 className="font-semibold">{entry.name}</h3><p className="mt-1 break-words text-xs text-ink-secondary">{entry.filename} · {({healthy:"Lectura correcta",missing:"Sin archivo; valores iniciales",invalid:"Requiere revisión",unavailable:"No se puede leer"})[entry.status]}</p></div></div>
      {entry.message && <p className="mt-2 text-xs leading-5">{entry.message}</p>}
      {entry.status === "invalid" && entry.id === "projects" && <p className="mt-2 text-xs leading-5">Las carpetas de documentos permanecen en disco. Corrige o recupera el registro original y vuelve a comprobarlo; aquí no se vacía la lista.</p>}
      {entry.canReset && (allowReset ? <button disabled={busy || loading} onClick={() => { setError(""); setReview(entry); }} className="mt-2 min-h-11 rounded-md px-3 text-left font-semibold text-brand-dark hover:bg-orange-50">Revisar restablecimiento</button> : <p className="mt-2 text-xs leading-5">Guarda tus documentos y vuelve a iniciar la aplicación para revisar un restablecimiento con copia del original.</p>)}
    </article>)}
    {notice && <p role="status" className="my-3 break-words rounded-md bg-panel p-3 text-xs leading-5">{notice}</p>}
    {error && !review && <p role="alert" className="my-3 break-words text-xs leading-5 text-red-700">{error}</p>}
    {review && <ModalFrame role="alertdialog" label="Restablecer estado conservando el original" className="z-[150]" onClose={() => { if (!submitting.current) { setReview(null); setError(""); } }}>
      <section aria-busy={busy} className="w-full max-w-md rounded-lg bg-white p-5 shadow-menu"><h2 className="text-lg font-semibold">Restablecer {review.id === "config" ? "preferencias e IA" : "plantilla de exportación"}</h2><p className="mt-3 text-sm leading-6">Se guardará una copia exacta y verificada de <strong>{review.filename}</strong> antes de sustituirlo por los valores iniciales.</p><p className="mt-2 text-sm leading-6">{review.id === "config" ? "Se reiniciarán preferencias, permisos de IA y pestañas recordadas. No se borran documentos, borradores, proyectos ni credenciales." : "Se reiniciará el formato de las exportaciones. No se modificarán documentos ni archivos exportados."}</p><p className="mt-2 text-xs leading-5 text-ink-secondary">La copia queda en el almacén privado local, sin caducidad automática. No se envía a ningún proveedor.</p>{error && <p role="alert" className="mt-3 break-words text-sm text-red-700">{error}</p>}<footer className="mt-5 flex flex-wrap justify-end gap-2"><button disabled={busy} className="min-h-11 rounded-md px-3 hover:bg-panel" onClick={() => { setReview(null); setError(""); }}>Conservar sin cambios</button><button disabled={busy} className="min-h-11 rounded-md bg-brand-orange px-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-50" onClick={() => { void reset(); }}>{busy ? "Conservando original…" : "Conservar y restablecer"}</button></footer></section>
    </ModalFrame>}
  </section>;
}
