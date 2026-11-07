import {useEffect, useRef, useState} from "react";
import {Cloud, X} from "lucide-react";
import {ProtonDirectPanel} from "./ProtonDirectPanel";
import {ModalFrame} from "../../components/ui/ModalFrame";
import {getActiveProject} from "../../lib/api/projects";
import {applyCloudSync, cancelCloudSync, getCloudSyncCapabilities, getCloudSyncStatus, reviewCloudSync} from "../../lib/api/cloudSync";
import type {CloudSyncCapabilities, CloudSyncProvider, CloudSyncReceipt, CloudSyncReview, CloudSyncStatus} from "../../types/cloudSync";

type ProjectIdentity = {id: string; name: string};
type Loaded = {project: ProjectIdentity; capabilities: CloudSyncCapabilities; status: CloudSyncStatus};

export function CloudSyncDialog({onClose, fallbackFocus}: {onClose: () => void; fallbackFocus?: () => HTMLElement | null}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const pendingReview = useRef<CloudSyncReview | null>(null);
  const operationBusy = useRef(false);
  useEffect(() => {
    let current = true;
    setLoadError("");
    const capabilities = getCloudSyncCapabilities();
    void Promise.all([getActiveProject().then(async project => ({project, status: await getCloudSyncStatus(project.id)})), capabilities])
      .then(([{project, status}, providers]) => {if (current) {pendingReview.current = status.activeMigration ?? null; setLoaded({project, status, capabilities: providers});}})
      .catch(error => {if (current) setLoadError(message(error));});
    return () => {current = false;};
  }, [attempt]);
  async function closeSafely() {
    if (operationBusy.current) {setLoadError("Hay una operación en curso. Espera a que termine antes de cerrar."); return;}
    try {
      operationBusy.current = true;
      if (pendingReview.current && loaded) await cancelCloudSync(loaded.project.id, pendingReview.current);
      pendingReview.current = null;
      onClose();
    } catch (failure) {setLoadError(`No se pudo cancelar la preparación. Se conserva para revisión. ${message(failure)}`);}
    finally {operationBusy.current = false;}
  }
  return <ModalFrame label="Cambiar sincronización" onClose={() => void closeSafely()} fallbackFocus={fallbackFocus}>
    <section className="flex max-h-[calc(100dvh-24px)] w-[min(560px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white shadow-menu">
      <header className="flex shrink-0 items-center gap-3 px-5 pt-3">
        <Cloud size={18} className="text-brand-orange" aria-hidden="true"/>
        <h2 className="min-w-0 flex-1 font-semibold">Cambiar sincronización</h2>
        <button type="button" aria-label="Cerrar sincronización" onClick={() => void closeSafely()} className="grid min-h-11 min-w-11 place-items-center rounded hover:bg-panel"><X size={18}/></button>
      </header>
      {loaded && loadError && <p role="alert" className="px-5 pt-3 text-sm text-red-700">{loadError}</p>}
      {loaded ? <CloudSyncSteps {...loaded} onClose={() => void closeSafely()} onReviewChange={review => {pendingReview.current = review;}} onBusyChange={busy => {operationBusy.current = busy;}}/> : <div className="p-5 text-sm">
        {loadError ? <><p role="alert" className="text-red-700">{loadError}</p><button className="mt-3 min-h-11 rounded px-3 hover:bg-panel" onClick={() => setAttempt(value => value + 1)}>Reintentar consulta</button></> : <p role="status">Consultando proyecto y opciones de sincronización…</p>}
      </div>}
    </section>
  </ModalFrame>;
}

export function CloudSyncSteps({project, capabilities, status, onClose, onReviewChange, onBusyChange}: Loaded & {onClose: () => void; onReviewChange?: (review: CloudSyncReview | null) => void; onBusyChange?: (busy: boolean) => void}) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [protonOpen,setProtonOpen]=useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(status.activeMigration ? 2 : 1);
  const [provider, setProvider] = useState<CloudSyncProvider>(status.activeMigration?.provider ?? (status.provider === "github" ? "none" : status.provider));
  const [review, setReview] = useState<CloudSyncReview | null>(status.activeMigration ?? null);
  const [result, setResult] = useState<CloudSyncReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stepFocus = useRef<HTMLParagraphElement>(null);
  useEffect(() => {stepFocus.current?.focus();}, [step]);
  useEffect(() => {onReviewChange?.(review);}, [review, onReviewChange]);
  useEffect(() => {if(!protonOpen)onBusyChange?.(busy);}, [busy, onBusyChange,protonOpen]);
  const selected = capabilities.providers.find(item => item.id === provider);
  const protonSelected = provider === "proton-drive";
  const legacyProton = currentStatus.provider === "proton-drive" && currentStatus.state === "proton-folder";
  const protonReason = "Configura la conexión directa con Proton. La sesión se recuerda en este dispositivo y no requiere instalar Proton Drive.";
  const unavailable = provider !== "none" && (protonSelected || selected?.available !== true);
  async function inspect() {
    if (protonSelected) {setProtonOpen(true);return;}
    setBusy(true); setError("");
    try {setReview(await reviewCloudSync(project.id, provider)); setStep(2);}
    catch (failure) {setError(message(failure));}
    finally {setBusy(false);}
  }
  async function apply() {
    if (!review?.canApply || review.blockers.length || review.provider === "proton-drive") return;
    setBusy(true); setError("");
    try {setResult(await applyCloudSync(project.id, review)); setReview(null); setStep(3);}
    catch (failure) {setError(message(failure));}
    finally {setBusy(false);}
  }
  async function back() {
    if (!review) return;
    setBusy(true); setError("");
    try {await cancelCloudSync(project.id, review); setReview(null); setStep(1);}
    catch (failure) {setError(`No se pudo cancelar la preparación. ${message(failure)}`);}
    finally {setBusy(false);}
  }
  async function refreshLegacyStatus() {
    setBusy(true); setError("");
    try {setCurrentStatus(await getCloudSyncStatus(project.id));}
    catch (failure) {setError(message(failure));}
    finally {setBusy(false);}
  }
  if(protonOpen)return <ProtonDirectPanel key={project.id} projectId={project.id} onBack={()=>setProtonOpen(false)} onBusyChange={onBusyChange}/>;
  return <>
    <div className="min-h-0 overflow-y-auto px-5 py-4 text-sm leading-5" aria-busy={busy}>
      <p ref={stepFocus} tabIndex={-1} className="truncate font-medium outline-none">{project.name}</p>
      <ol className="my-3 flex flex-wrap gap-3 text-xs text-ink-secondary" aria-label="Pasos del cambio">
        {["Destino", "Comprobación", "Cambio"].map((name, index) => <li key={name} aria-current={step === index + 1 ? "step" : undefined} className={step === index + 1 ? "font-semibold text-ink-primary" : ""}>{index + 1}. {name}</li>)}
      </ol>
      <p className="text-ink-secondary">{legacyProton ? "Asociación Proton anterior pendiente de recuperación. Los documentos y las operaciones pendientes se conservan." : currentStatus.label + ". " + currentStatus.detail}</p>
      {legacyProton && <button type="button" disabled={busy} className="mt-2 min-h-11 rounded px-3 hover:bg-panel" onClick={() => void refreshLegacyStatus()}>Consultar estado anterior</button>}
      {step === 1 && <fieldset className="mt-4" disabled={busy}>
        <legend className="mb-2 font-medium">Destino de sincronización</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-2 hover:bg-panel"><input style={{accentColor:"rgb(var(--accent))"}} type="radio" name="cloud-provider" value="none" checked={provider === "none"} onChange={() => {setProvider("none"); setError("");}}/>Sólo en este dispositivo</label>
        {capabilities.providers.filter(item => item.id !== "none").map(item => <label key={item.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded px-2 py-2 hover:bg-panel">
          <input style={{accentColor:"rgb(var(--accent))"}} className="mt-1" type="radio" name="cloud-provider" value={item.id} checked={provider === item.id} onChange={() => {setProvider(item.id); setError("");}}/>
          <span><span className="font-medium">{item.label}</span>{!item.available && <span className="ml-2 text-xs text-ink-secondary">No disponible</span>}<span className="block text-xs text-ink-secondary">{item.id === "proton-drive" ? protonReason : item.reason}</span></span>
        </label>)}
        {unavailable && <p role="status" className="mt-3 rounded bg-panel p-3 text-xs">{protonSelected ? protonReason : (selected?.reason || "Este proveedor todavía no dispone de una conexión operativa en este dispositivo.") + " Puedes comprobar el alcance; no se activará una conexión sin verificar."}</p>}
        <p className="mt-3 text-xs text-ink-secondary">La comprobación no cambia tu proyecto ni envía documentos.</p>
      </fieldset>}
      {step === 2 && review && <div className="mt-4">
        <h3 className="font-medium">Revisión del cambio</h3>
        {review.provider === "proton-drive" && <p role="status" className="mt-2 text-xs">{protonReason} Esta preparación anterior no se puede activar.</p>}
        {status.activeMigration?.id === review.id && <p className="mt-2 text-xs text-ink-secondary">{review.provider === "proton-drive" ? "Se ha recuperado una preparación Proton anterior. Consérvala para revisión o cancela la preparación para volver a los destinos." : "Se ha recuperado una preparación pendiente. Puedes continuar con esta revisión o cancelarla para elegir otro destino."}</p>}
        <dl className="mt-2 grid grid-cols-2 gap-2 rounded bg-panel p-3 text-xs"><dt>Documentos</dt><dd>{review.summary.documents}</dd><dt>Recursos</dt><dd>{review.summary.resources}</dd><dt>Contenido revisado</dt><dd>{new Intl.NumberFormat("es-ES", {maximumFractionDigits: 1}).format(review.summary.bytes / 1024)} KiB</dd><dt>Historial</dt><dd>{review.summary.history === "local-only" ? "Se conserva en este dispositivo" : "Sin historial local"}</dd></dl>
        {review.warnings.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-ink-secondary">{review.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
        {review.blockers.length > 0 && <div className="mt-3 rounded bg-panel p-3"><p className="font-medium">Antes de poder cambiar</p><ul className="mt-1 list-disc space-y-1 pl-4 text-xs">{review.blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul></div>}
        <p className="mt-3 text-xs text-ink-secondary">Se conservarán los documentos y las copias anteriores. La revisión se comprobará otra vez antes de aplicar.</p>
      </div>}
      {step === 3 && result && <div className="mt-4" role="status"><h3 className="font-medium">{result.status === "active-local" ? "Configuración local confirmada" : "Preparación cancelada"}</h3><p className="mt-2 text-ink-secondary">{result.documentsPreserved ? "Se conservan los documentos y el historial local." : "Consulta el estado del proyecto antes de continuar."} {result.remoteConfirmed ? "El runtime confirmó la entrega remota." : "Esta operación no confirma una transferencia a la nube."}</p></div>}
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    </div>
    <footer className="flex shrink-0 flex-wrap justify-end gap-2 px-5 pb-4">
      {step === 1 && <><button onClick={onClose} className="min-h-11 rounded px-3 hover:bg-panel">Cerrar</button><button disabled={busy} onClick={() => void inspect()} className="min-h-11 rounded bg-brand-orange px-3 font-medium text-white disabled:opacity-50">{busy ? "Comprobando…" : protonSelected ? "Configurar conexión directa" : "Comprobar alcance"}</button></>}
      {step === 2 && <><button disabled={busy} onClick={() => void back()} className="min-h-11 rounded px-3 hover:bg-panel">Cancelar preparación y volver</button><button disabled={busy || review?.provider === "proton-drive" || !review?.canApply || Boolean(review.blockers.length)} onClick={() => void apply()} className="min-h-11 rounded bg-brand-orange px-3 font-medium text-white disabled:opacity-50">{busy ? "Procesando…" : provider === "none" ? "Usar sólo este dispositivo" : "Activar sincronización"}</button></>}
      {step === 3 && <button onClick={onClose} className="min-h-11 rounded bg-brand-orange px-3 font-medium text-white">Terminar</button>}
    </footer>
  </>;
}

function message(error: unknown) {return error instanceof Error ? error.message : "No se pudo completar la operación. El proyecto se conserva.";}
