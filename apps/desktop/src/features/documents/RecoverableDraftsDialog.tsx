import {RecoveryInventorySection} from "./RecoveryInventorySection";
import {ProjectRecoverySection} from "./ProjectRecoverySection";
import {StorageUsagePanel} from "../settings/StorageUsagePanel";
import {StateMigrationPanel} from "../settings/StateMigrationPanel";
import {ConflictAttemptsSection} from "./ConflictAttemptsSection";
import type {RecoveryCopy} from "../../types/recovery";
import type {StateTransitionAuthority} from "../../types/stateMigrations";
import {SystemRecoverySection} from "./SystemRecoverySection";
import { ArchiveRestore, FileWarning, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { LocalStateReview } from "../settings/LocalStateReview";
import { getApiErrorMessage } from "../../lib/api/client";
import type { OrphanDraft, Project } from "../../types/domain";

type ActionResult = void | boolean | Promise<void | boolean>;
type Props = StateTransitionAuthority & { projects?:Project[];activeProjectId?:string;open: boolean; initialCategory?:"review"|"archive"; drafts: OrphanDraft[]; limited?:boolean; coverageWarnings?:string[]; onClose: () => void; onRefresh: () => ActionResult;
  onRestore: (draft: OrphanDraft) => ActionResult; onDiscard: (draft: OrphanDraft) => ActionResult; review?: (archived: boolean,copies?:RecoveryCopy[]) => ReactNode };

export function RecoverableDraftsDialog({ projects=[],activeProjectId,open,initialCategory="review", drafts,limited=false,coverageWarnings=[], onClose, onRefresh, onRestore, onDiscard, review, onBeforeChange, onSettled }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discard, setDiscard] = useState<OrphanDraft | null>(null);
  const [migrationRecoveryId,setMigrationRecoveryId]=useState<string|undefined>();
  const [category, setCategory] = useState<"missing" | "review" | "archive" | "attempts" | "state" | "system" | "compatibility" | "projects" | "storage" | "inventory">("review");
  const [attemptCopies,setAttemptCopies]=useState<RecoveryCopy[]>([]);
  const submitting = useRef(false);
  const [staleKeys,setStaleKeys]=useState<Set<string>>(new Set());
  useEffect(()=>{if(open){setError(null);setDiscard(null);setCategory(initialCategory);setAttemptCopies([]);}},[open,initialCategory]);
  const categories=[['missing', `Ausentes (${drafts.length})`, `Archivos desaparecidos (${drafts.length})`], ['review', 'Revisar', 'Revisar copias'], ['archive', 'Apartadas', 'Copias apartadas'], ['attempts','Combinaciones','Intentos de combinación'], ['projects','Proyectos','Preparaciones y traslado'], ['storage','Espacio','Uso y limpieza segura de espacio'], ['inventory','Copias y límites','Inventario y presupuesto de recuperación'], ['state', 'Estado local', 'Revisar estado local'], ['system','Copias de sistema','Copias de sistema'], ['compatibility','Compatibilidad','Compatibilidad y recuperación de datos']] as const;
  if (!open) return null;
  async function run(draft: OrphanDraft, action: "restore" | "discard") {
    if (submitting.current||staleKeys.has(draft.draftKey)||!reviewed(draft)) return;
    submitting.current=true;setBusy(`${action}:${draft.draftKey}`);setError(null);
    try {
      const result = await (action === "restore" ? onRestore(draft) : onDiscard(draft));
      if (result === false){setStaleKeys(keys=>new Set(keys).add(draft.draftKey));setError("No se ha confirmado la operación. Actualiza la lista antes de otra acción sobre esta copia.");}
      else setDiscard(null);
    } catch (error) { setStaleKeys(keys=>new Set(keys).add(draft.draftKey));setError(getApiErrorMessage(error,"No se ha confirmado la operación. Actualiza la lista antes de otra acción.")); }
    finally {submitting.current=false;setBusy(null);}
  }
  async function refresh(){if(submitting.current)return;submitting.current=true;setBusy("refresh");setError(null);try{if(await onRefresh()!==false){setStaleKeys(new Set());setDiscard(null);}else setError("No se confirmó una revisión nueva. Las acciones anteriores siguen bloqueadas.");}catch(cause){setError(getApiErrorMessage(cause,"No se pudo actualizar. Se conserva la revisión anterior."));}finally{submitting.current=false;setBusy(null);}}
  return <ModalFrame label={review ? "Recuperación" : "Borradores recuperables"} className="z-[90]" onClose={()=>{if(!submitting.current)onClose();}}>
    <section aria-busy={!!busy} className={`flex max-h-[min(620px,calc(100dvh-24px))] w-full max-w-[660px] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu ${review ? "h-[min(620px,calc(100dvh-24px))]" : ""}`}>
      <header className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 gap-3"><ArchiveRestore className="mt-1 shrink-0 text-brand-orange" size={20}/><div><h2 className="text-lg font-semibold">{review ? "Recuperación" : "Borradores recuperables"}</h2><p className="mt-1 text-sm leading-5 text-ink-secondary">{review ? "Revisa y recupera copias locales." : "Recrea archivos desde su copia local. Los archivos existentes se conservan."}</p></div></div>
        <button disabled={!!busy} aria-label="Cerrar borradores recuperables" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-md hover:bg-panel"><X size={18}/></button>
      </header>
      {review && <><div role="group" aria-label="Categorías de recuperación" className="hidden shrink-0 flex-wrap gap-1 px-4 pb-2 sm:flex">{categories.map(([id,label,accessible]) => <button key={id} disabled={!!busy} aria-label={accessible} aria-pressed={category === id} onClick={() => setCategory(id)} className={`min-h-11 rounded-md px-3 text-sm ${category === id ? "bg-panel font-semibold" : "text-ink-secondary hover:bg-panel"}`}>{label}</button>)}</div><label className="block shrink-0 px-5 pb-2 text-xs sm:hidden"><span className="sr-only">Ver en Recuperación</span><select aria-label="Categorías de recuperación" value={category} disabled={!!busy} onChange={event=>setCategory(event.target.value as typeof category)} className="mt-1 min-h-11 w-full min-w-0 rounded border border-line bg-white px-2">{categories.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></>}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
        {(!review || category === "missing") && <>
        {limited&&<p className="mb-3 text-xs leading-5 text-brand-orange">Revisión parcial: puede haber más archivos ausentes. Las copias no revisadas se conservan.</p>}
        {!!coverageWarnings.length&&<details className="mb-2 text-xs text-ink-secondary"><summary className="min-h-11 cursor-pointer py-3">Avisos de esta revisión ({coverageWarnings.length})</summary><ul className="list-disc space-y-2 pb-2 pl-4">{coverageWarnings.map((warning,index)=><li key={index} className="break-words">{warning}</li>)}</ul></details>}
        {error && !discard && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
        {!drafts.length ? <div className="py-5 text-center text-sm text-ink-secondary"><FileWarning className="mx-auto mb-3" size={24}/><p className="font-semibold text-ink-primary">{limited?"No se encontraron archivos ausentes en la parte revisada":"No hay archivos desaparecidos pendientes de recrear"}</p><p className="mt-2">Puedes actualizar para volver a comprobar el estado del disco.</p></div> : drafts.map(draft=><article key={draft.draftKey} className="mb-3 rounded-md bg-panel px-4 py-3">
          <div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{draft.name}</p><p className="mt-1 break-words text-xs text-ink-secondary">{draft.projectName ?? "Proyecto de origen"}</p>{draft.path!==draft.name && <p className="mt-1 break-words text-xs text-ink-secondary">{draft.path}</p>}<p className="mt-2 text-xs text-ink-secondary">{draft.kind === "handwritten-note" ? `${draft.pageCount ?? 0} ${(draft.pageCount ?? 0)===1?"página":"páginas"}` : `${draft.wordCount} ${draft.wordCount===1?"palabra":"palabras"}`} · {formatDate(draft.draftUpdatedAt)}</p>{!reviewed(draft)&&<p className="mt-2 text-xs leading-5 text-ink-secondary">Actualiza la lista para revisar esta copia y su ubicación antes de modificarla.</p>}{staleKeys.has(draft.draftKey)&&<p className="mt-2 text-xs leading-5 text-brand-orange">Actualiza antes de otra acción; la solicitud anterior no se repetirá.</p>}{!draft.recoverable && draft.reason && <p className="mt-2 text-sm text-red-700">{draft.reason}</p>}</div>
            <div className="flex w-full shrink-0 justify-end gap-2 sm:w-auto"><button disabled={!!busy||staleKeys.has(draft.draftKey)||!reviewed(draft)} className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50" onClick={()=>{setError(null);setDiscard(draft);}}><Trash2 size={16}/>Descartar</button><button disabled={!!busy||staleKeys.has(draft.draftKey)||!reviewed(draft)} className="flex min-h-11 items-center gap-2 rounded-md bg-brand-orange px-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50" onClick={()=>{void run(draft,"restore");}}><ArchiveRestore size={16}/>{busy===`restore:${draft.draftKey}`?"Recreando…":"Recrear archivo"}</button></div>
          </div>
        </article>)}
        </>}
        {review && category === "inventory" && <RecoveryInventorySection/>}
        {review && category === "projects" && <ProjectRecoverySection projects={projects} activeProjectId={activeProjectId} onBeforeChange={onBeforeChange} onSettled={onSettled} onPortableCopy={copy=>{setAttemptCopies([copy]);setCategory("archive");}}/>}
        {review && category === "storage" && <StorageUsagePanel english={false}/>}
        {review && category === "state" && <LocalStateReview/>}
        {review && category === "attempts" && <ConflictAttemptsSection onReviewCopies={copies=>{setAttemptCopies(copies);setCategory("archive");}}/>}
        {review && category === "system" && <SystemRecoverySection onReviewCohort={id=>{setMigrationRecoveryId(id);setCategory("compatibility");}}/>}
        {review && category === "compatibility" && <StateMigrationPanel initialRecoveryId={migrationRecoveryId} onBeforeChange={onBeforeChange} onSettled={onSettled}/>}
        {review && category !== "missing" && category !== "attempts" && category !== "state" && category !== "system" && category !== "compatibility" && category !== "projects" && category !== "storage" && category !== "inventory" && review(category === "archive",attemptCopies)}
      </div>
      <footer className="flex shrink-0 justify-end gap-2 px-5 py-3"><button disabled={!!busy} className="min-h-11 rounded-md px-4 text-sm hover:bg-panel" onClick={onClose}>Cerrar</button>{(!review || category === "missing") && <button disabled={!!busy} className="flex min-h-11 items-center gap-2 rounded-md px-4 text-sm hover:bg-panel" onClick={()=>void refresh()}><RefreshCw size={16}/>Actualizar</button>}</footer>
    </section>
    {discard && <ModalFrame role="alertdialog" label="Descartar borrador definitivamente" className="z-[100]" onClose={()=>{if(!submitting.current){setDiscard(null);setError(null);}}}>
      <section aria-busy={!!busy} className="w-full max-w-md rounded-lg bg-white p-5 shadow-menu"><h3 className="text-lg font-semibold">Descartar borrador</h3><p className="mt-3 break-words text-sm leading-6">Se eliminará la copia de recuperación de <strong>{discard.name}</strong>. Esta acción no puede deshacerse.</p><p className="mt-2 break-words text-xs text-ink-secondary">{discard.path}</p>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<footer className="mt-5 flex justify-end gap-2"><button disabled={!!busy} className="min-h-11 rounded-md px-4 text-sm hover:bg-panel" onClick={()=>{setDiscard(null);setError(null);}}>Conservar borrador</button><button disabled={!!busy||staleKeys.has(discard.draftKey)||!reviewed(discard)} className="min-h-11 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50" onClick={()=>{void run(discard,"discard");}}>{busy?"Descartando…":"Descartar definitivamente"}</button></footer></section>
    </ModalFrame>}
  </ModalFrame>;
}

function formatDate(value: string|null|undefined) { if(!value)return "Fecha no disponible";const date=new Date(value);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(date); }

function reviewed(draft:OrphanDraft){return draft.recoverable&&!!draft.fingerprint&&!!draft.locationRevision&&[draft.fingerprint,draft.locationRevision].every(hash=>hash.length===64&&/^[a-fA-F0-9]+$/.test(hash));}
