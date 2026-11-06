import {ExportBatchDialog} from "./ExportBatchDialog";
import { useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, X } from "lucide-react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import type { ProjectPackageManifest, ProjectTransferMode, ProjectTransferPhase } from "../../types/projectTransfer";
import { useProjectTransfer } from "./useProjectTransfer";
import "./ProjectTransferDialog.css";
import {ProjectArchiveDetails} from "./ProjectArchiveDetails";
import {SaveProjectTemplateDialog} from "./SaveProjectTemplateDialog";

const labels: Record<ProjectTransferPhase, string> = { awaiting_source: "Elegir paquete", preparing: "Preparando y verificando…", ready: "Listo para revisar", delivering: "Esperando destino…", committing: "Trasladando contenido…", pending_registration: "Contenido copiado · falta registrar", completed: "Completado", cancelled: "Cancelado", failed: "No se pudo preparar" };
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export function ProjectTransferDialog({ mode, onClose, onImported, onBeforeChange, onSettled, expectedTransferId }: { expectedTransferId?:string; mode: ProjectTransferMode; onClose: () => void; onImported: (id: string) => void | Promise<void>;onBeforeChange?:import("../../types/stateMigrations").StateTransitionAuthority["onBeforeChange"];onSettled?:import("../../types/stateMigrations").StateTransitionAuthority["onSettled"] }) {
  const transfer = useProjectTransfer(mode, onImported, expectedTransferId);
  const [batchOpen,setBatchOpen]=useState(false);
  const [includeArchive,setIncludeArchive]=useState(false);
  const [saveTemplate,setSaveTemplate]=useState(false);
  const [templateNotice,setTemplateNotice]=useState("");
  const { job, busy, error, notice, warnings, name, setName, cancelRequested } = transfer;
  const fromTemplate="templateId" in mode;
  const requestedKind=mode.kind==="import"||mode.kind==="template-import"?"import":"export";
  const kind = job?.kind ?? requestedKind;
  const selection=job?Boolean(job.selectedPaths?.length):mode.kind==="export"&&Boolean(mode.nodeIds?.length);
  const requestedPaths=mode.kind==="export"?(mode.nodeIds??[]).map(id=>id.slice(id.indexOf("::")+2)):[];
  const requestedRoots=[...new Set(requestedPaths)].filter(path=>!requestedPaths.some(parent=>path!==parent&&path.startsWith(parent+"/"))).sort();
  const differentScope=Boolean(job&&(job.kind!==requestedKind||(job.templateId??null)!==(fromTemplate?mode.templateId:null)))||(job?.kind==="export"&&mode.kind==="export"&&(job.projectId!==mode.projectId||JSON.stringify([...(job.selectedPaths??[])].sort())!==JSON.stringify(requestedRoots)));
  const title = kind === "import" ? fromTemplate?"Crear desde plantilla":"Importar proyecto" : fromTemplate?"Compartir plantilla":selection?"Exportar selección":"Exportar proyecto";
  const completed = job?.phase === "completed";
  const canConfirm = job && ["ready", "pending_registration", "committing"].includes(job.phase) && !cancelRequested;
  const canDiscard = job && !["committing", "pending_registration"].includes(job.phase) && (!["preparing", "delivering"].includes(job.phase) || job.interrupted);
  const close = () => transfer.leave(onClose);
  if(batchOpen&&mode.kind==="export")return <ExportBatchDialog projectId={mode.projectId} projectName={mode.projectName} onClose={()=>setBatchOpen(false)} onBeforeChange={onBeforeChange} onSettled={onSettled}/>;
  if(job?.templateCatalogue)return <ModalFrame label="Catálogo de plantillas conservado" onClose={()=>{if(!busy)onClose();}}><section className="w-full max-w-lg rounded-lg bg-white p-5 text-sm shadow-menu"><h2 className="font-semibold">Catálogo de plantillas conservado</h2><p className="mt-3 text-ink-secondary">Esta preparación contiene varias plantillas. Ábrela desde Plantillas de proyecto para revisar sus entradas y nombres. Aquí no se crea un proyecto ni se repite la incorporación.</p><button className="mt-4 min-h-11 rounded px-3 text-sm hover:bg-panel" disabled={busy} onClick={onClose}>Cerrar</button></section></ModalFrame>;
  return <ModalFrame label={title} onClose={close}>
    <section aria-busy={busy} className="flex max-h-[calc(100dvh-24px)] w-full max-w-[640px] flex-col overflow-hidden rounded-lg bg-white shadow-menu">
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 py-2"><h2 className="flex items-center gap-2 text-[15px] font-semibold">{kind === "import" ? <ArrowDownToLine size={18}/> : <ArrowUpFromLine size={18}/>} {title}</h2><button type="button" disabled={busy} aria-label="Cerrar transferencia de proyecto" onClick={close} className="grid min-h-11 min-w-11 place-items-center rounded hover:bg-panel"><X size={17}/></button></header>
      <div className="min-h-0 overflow-y-auto px-5 py-2 text-sm [overflow-wrap:anywhere]">
        {differentScope&&<p role="alert" className="mb-3 text-xs leading-5 text-brand-dark">La preparación conservada tiene otro alcance. Revisa su contenido o descártala antes de preparar la selección actual.</p>}
        {selection&&<p className="mb-3 text-xs leading-5">Paquete de los archivos guardados seleccionados, conservando su estructura de carpetas. No incorpora recursos ajenos a la selección; revisa los avisos de referencias.</p>}
        {!job&&mode.kind==="export"&&<button type="button" className="mb-3 min-h-11 rounded px-3 text-xs font-medium hover:bg-panel" onClick={()=>setBatchOpen(true)}>Exportar documentos con un perfil</button>}
        {!job && <>
          <p className="mb-3 text-lg font-medium">{"projectName" in mode ? mode.projectName : "Trae tu documentación a este dispositivo"}</p>
          <p className="text-xs leading-5 text-ink-secondary">Markdown, notas a mano, imágenes, recursos compatibles y carpetas vacías en un paquete .knownext-project.zip. Hasta 512 MiB de paquete, 1 GiB expandido, 64 MiB por archivo y 10.000 entradas.</p>
          <p className="mt-3 text-xs leading-5">{kind === "export" ? "Se incluyen los archivos guardados en disco. Guarda los cambios abiertos que quieras trasladar; puedes añadir abajo las copias de borradores ya persistidas." : "Revisarás el contenido antes de crear un proyecto nuevo. Podrás cambiar su nombre para conservar los proyectos que ya tienes."}</p>
        </>}
        {!job && kind === "export" && !selection && !fromTemplate && <label className="my-3 flex cursor-pointer items-start gap-2 rounded bg-panel p-3 text-xs leading-5"><input type="checkbox" className="mt-1 accent-[#F37021]" disabled={busy} checked={includeArchive} onChange={event=>setIncludeArchive(event.target.checked)}/><span><strong className="block font-medium">Añadir archivo privado del proyecto</strong>Borradores persistidos, historial alcanzable, audio detenido asociado, colecciones, hitos, favoritos, estilos/perfiles y preferencias visuales. Conversación, contexto, investigaciones y resultados se conservan como datos privados. Conserva también el archivo privado anterior, si lo hay. Se importan como copias consultables, sin activar procesos ni cambiar ajustes. Puede contener información confidencial.</span></label>}
        <p className="my-3 text-xs leading-5 text-ink-secondary">{job?.manifest || includeArchive ? "Revisa el contenido: tus documentos y adjuntos pueden incluir información personal." : "Quedan fuera el historial Git, las grabaciones, los borradores, las preferencias y las credenciales de la aplicación. Revisa tus documentos: el texto y los adjuntos pueden contener información personal que hayas escrito."}</p>
        {job && <div className="my-3 flex items-center gap-2 text-sm font-medium" role="status">{completed && <Check size={16} className="text-green-700"/>}{labels[job.phase]}</div>}
        {notice && <p role="status" className="my-3 text-xs text-ink-secondary">{notice}</p>}
        {job?.interrupted && <p role="alert" className="my-3 text-xs text-amber-800">La aplicación se cerró durante esta operación. {job.phase === "committing" ? "Puedes continuar el registro del proyecto; no se vuelven a copiar los archivos trasladados." : "La finalización no está confirmada. Revisa cualquier destino externo antes de descartar la preparación e iniciar otra."}</p>}
        {job?.manifest && <ProjectPackageReview manifest={job.manifest} bytes={job.archiveBytes} identity={kind === "import" && !completed ? <label className="my-3 block text-xs">Nombre del proyecto nuevo<input value={name} disabled={busy || job.phase === "committing"} maxLength={240} onChange={e => setName(e.target.value)} className="mt-1 min-h-11 w-full rounded border border-line px-3 text-sm"/></label> : null}/>}
        {job?.sourceName && <p className="my-2 text-xs text-ink-secondary">Origen: {job.sourceName}</p>}
        {job?.phase==="ready"&&!job.manifest?.supplement&&!cancelRequested&&<button disabled={busy} onClick={()=>setSaveTemplate(true)} className="my-2 min-h-11 rounded px-2 text-xs font-medium text-brand-orange hover:bg-brand-hover">Guardar como plantilla…</button>}
        {templateNotice&&<p role="status" className="my-2 text-xs text-ink-secondary">{templateNotice}</p>}
        {job?.phase === "pending_registration" && <p className="my-3 text-xs">El contenido ya está copiado en una carpeta nueva. Continuar registra esa misma carpeta y conserva cualquier edición posterior.</p>}
        {completed && <p className="my-3 text-sm">{kind === "import" ? "Proyecto disponible en el selector. Tu documento actual sigue abierto." : `Paquete guardado como «${job.deliveredName ?? "Proyecto KnowNext.knownext-project.zip"}».`}</p>}
        {cancelRequested && <p role="status" className="my-3 text-xs">Cancelación solicitada. Se aplicará cuando termine la lectura actual; los originales se conservan.</p>}
        {(error || job?.error) && <p role="alert" className="my-3 text-sm text-red-700">{error ?? job?.error}</p>}
        {warnings.map((warning, index) => <p key={index} role="alert" className="my-3 text-xs text-amber-800">{warning}</p>)}
        {job && !busy && !completed && <p className="mt-3 text-xs text-ink-secondary">Cerrar conserva esta preparación para continuar más tarde.</p>}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-5 py-3">
        {canDiscard && <button type="button" disabled={busy} onClick={() => void transfer.discard()} className="mr-auto min-h-11 rounded px-3 text-xs hover:bg-panel">{completed ? "Retirar preparación" : "Descartar preparación"}</button>}
        {busy && job && ["preparing", "awaiting_source"].includes(job.phase) && <button type="button" disabled={cancelRequested} onClick={() => void transfer.cancel()} className="mr-auto min-h-11 rounded px-3 text-xs hover:bg-panel disabled:opacity-60">{cancelRequested ? "Cancelación solicitada" : "Solicitar cancelación"}</button>}
        <button type="button" disabled={busy} onClick={close} className="min-h-11 rounded px-3 text-xs hover:bg-panel">{completed ? "Cerrar" : "Volver"}</button>
        {!job && !expectedTransferId && <button type="button" disabled={busy || warnings.length > 0 || Boolean(error)} onClick={() => void transfer.start(includeArchive)} className="min-h-11 rounded bg-brand-orange px-4 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{busy ? "Consultando…" : fromTemplate?"Preparar plantilla":kind === "import" ? "Elegir paquete…" : includeArchive ? "Preparar archivo privado" : "Preparar lo guardado"}</button>}
        {!busy && error && <button type="button" onClick={() => void transfer.refresh()} className="min-h-11 rounded px-3 text-xs hover:bg-panel">Actualizar estado</button>}
        {!busy && job && !job.interrupted && ["awaiting_source", "preparing"].includes(job.phase) && <button type="button" onClick={() => void transfer.resume()} className="min-h-11 rounded bg-brand-orange px-4 text-xs font-semibold text-white hover:bg-brand-dark">{job.phase === "awaiting_source" ? "Elegir paquete…" : "Consultar preparación"}</button>}
        {canConfirm && <button type="button" disabled={busy || (kind === "import" && !name.trim())} onClick={() => void transfer.confirm()} className="min-h-11 rounded bg-brand-orange px-4 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{busy ? "Procesando…" : kind === "export" ? "Elegir destino…" : job.phase === "ready" ? fromTemplate?"Crear proyecto":"Importar proyecto" : "Continuar registro"}</button>}
      </footer>
    </section>
    {saveTemplate&&job&&<SaveProjectTemplateDialog job={job} onClose={()=>setSaveTemplate(false)} onSaved={template=>{setSaveTemplate(false);setTemplateNotice(`Plantilla «${template.name}» guardada en el catálogo local.`);}}/>}
  </ModalFrame>;
}

function ProjectPackageReview({ manifest, bytes, identity }: { manifest: ProjectPackageManifest; bytes: number; identity?: ReactNode }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(manifest.files.length / 100));
  return <div className="project-transfer-review space-y-2 text-xs">
    <h3 className="text-base font-medium">{manifest.projectName}</h3>
    {manifest.templateDescription&&<p className="text-ink-secondary">{manifest.templateDescription}</p>}
    <p className="text-ink-secondary">{manifest.files.length} {manifest.files.length === 1 ? "archivo" : "archivos"} · {manifest.directories.length} {manifest.directories.length === 1 ? "carpeta" : "carpetas"} · paquete {size(bytes)}</p>
    {identity}
    {manifest.supplement && <ProjectArchiveDetails summary={manifest.supplement}/>}
    <details><summary className="flex min-h-11 cursor-pointer items-center text-ink-primary">Revisar archivos incluidos</summary>
      <ul aria-label="Archivos incluidos" className="space-y-1 py-2">{manifest.files.slice(page * 100, (page + 1) * 100).map(file => <li key={file.path} className="flex justify-between gap-3"><span>{file.path}</span><span className="shrink-0 text-ink-secondary">{size(file.size)}</span></li>)}</ul>
      {pages > 1 && <nav aria-label="Páginas de archivos" className="flex items-center justify-between gap-2"><button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="min-h-11 px-2 disabled:opacity-50">Anterior</button><span>{page + 1} / {pages}</span><button type="button" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)} className="min-h-11 px-2 disabled:opacity-50">Siguiente</button></nav>}
      {manifest.directories.length > 0 && <p className="my-2 text-ink-secondary">Se conservan también las carpetas vacías.</p>}
    </details>
    {manifest.directories.length > 0 && <details><summary className="flex min-h-11 cursor-pointer items-center">Revisar carpetas incluidas</summary><ReviewList label="Carpetas incluidas" count={manifest.directories.length} render={index => manifest.directories[index]}/></details>}
    {manifest.exclusions.length > 0 && <details><summary className="flex min-h-11 cursor-pointer items-center text-amber-800">{manifest.exclusions.length} {manifest.exclusions.length === 1 ? "entrada excluida" : "entradas excluidas"} · revisar</summary><ReviewList label="Entradas excluidas" count={manifest.exclusions.length} render={index => <><strong className="font-medium">{manifest.exclusions[index].path}</strong> · {manifest.exclusions[index].reason}</>}/></details>}
    {manifest.adjustments.length > 0 && <details><summary className="flex min-h-11 cursor-pointer items-center">{manifest.adjustments.length} {manifest.adjustments.length === 1 ? "documento con enlaces adaptados" : "documentos con enlaces adaptados"} a rutas portables</summary><ReviewList label="Enlaces adaptados" count={manifest.adjustments.length} render={index => <>{manifest.adjustments[index].path} · {manifest.adjustments[index].targetsUpdated} {manifest.adjustments[index].targetsUpdated === 1 ? "destino actualizado" : "destinos actualizados"}</>}/><p>Los archivos del proyecto original se conservan sin cambios.</p></details>}
    {manifest.referenceWarnings.length > 0 && <details><summary className="flex min-h-11 cursor-pointer items-center text-amber-800">{manifest.referenceWarnings.length} {manifest.referenceWarnings.length === 1 ? "aviso de referencias" : "avisos de referencias"} · revisar</summary><ReviewList label="Avisos de referencias" count={manifest.referenceWarnings.length} render={index => <>{manifest.referenceWarnings[index].path} · {manifest.referenceWarnings[index].message}</>}/></details>}
    <details><summary className="flex min-h-11 cursor-pointer items-center text-ink-secondary">Alcance del paquete</summary><p className="pb-3 leading-5 text-ink-secondary">Archivos guardados, imágenes y recursos compatibles, notas a mano y carpetas vacías. {manifest.supplement ? "Incluye también el archivo privado descrito arriba. No incluye credenciales de la aplicación, configuración Git ni trabajos ejecutables. Borradores, audio e historial se conservan como datos; no se activan automáticamente." : "Quedan fuera historial Git, grabaciones, borradores, preferencias y credenciales de la aplicación."} Las exclusiones del inventario pueden corresponder a carpetas completas y su contenido.</p></details>
  </div>;
}

function ReviewList({ label, count, render }: { label: string; count: number; render: (index: number) => ReactNode }) {
  const [page, setPage] = useState(0); const pages = Math.max(1, Math.ceil(count / 100));
  return <><ul aria-label={label} className="space-y-2 py-2">{Array.from({ length: Math.max(0, Math.min(100, count - page * 100)) }, (_, offset) => <li key={page * 100 + offset}>{render(page * 100 + offset)}</li>)}</ul>
    {pages > 1 && <nav aria-label={`Páginas: ${label}`} className="flex items-center justify-between gap-2"><button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="min-h-11 px-2 disabled:opacity-50">Anterior</button><span>{page + 1} / {pages}</span><button type="button" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)} className="min-h-11 px-2 disabled:opacity-50">Siguiente</button></nav>}</>;
}
