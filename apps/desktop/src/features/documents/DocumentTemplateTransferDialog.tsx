import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { ReadonlyMarkdownViewer } from "../editor/ReadonlyMarkdownViewer";
import { deliverTemplateTransfer, importTemplateTransfer, inspectTemplateTransfer, pickTemplateTransfer, prepareTemplateTransfer } from "../../lib/api/documentTemplateTransfer";
import { getApiErrorMessage } from "../../lib/api/client";
import type { DocumentTemplate, DocumentTemplateSummary, DocumentTemplateTransferReview } from "../../types/documentTemplates";
import {DocumentTemplateCatalogTransferDialog} from "./DocumentTemplateCatalogTransferDialog";

export type TemplateTransferMode = { kind: "import" } | { kind: "export"; template: DocumentTemplateSummary } | {kind:"export-catalog";templates:DocumentTemplateSummary[]};
export function DocumentTemplateTransferDialog({ mode, onClose, onImported }: { mode: TemplateTransferMode; onClose: () => void; onImported: (template: DocumentTemplate) => void | Promise<void> }) {
  return mode.kind==="export-catalog"?<DocumentTemplateCatalogTransferDialog mode={mode} onClose={onClose} onImported={onImported}/>:<SingleDocumentTemplateTransferDialog mode={mode} onClose={onClose} onImported={onImported}/>;
}
function SingleDocumentTemplateTransferDialog({ mode, onClose, onImported }: { mode: Exclude<TemplateTransferMode,{kind:"export-catalog"}>; onClose: () => void; onImported: (template: DocumentTemplate) => void | Promise<void> }) {
  const [review, setReview] = useState<DocumentTemplateTransferReview | null>(null);
  const [file, setFile] = useState<{ fileName: string; content: string } | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const[resourcesReviewed,setResourcesReviewed]=useState(false);
  const [delivered, setDelivered] = useState(false);
  const running = useRef(false);
  const alive = useRef(true);
  const isImport = mode.kind === "import";
  const title = isImport ? "Importar plantilla" : "Exportar plantilla";
  const[catalog,setCatalog]=useState<{file:{fileName:string;content:string};review:DocumentTemplateTransferReview}|null>(null);

  async function prepare() {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const selected = mode.kind === "import" ? await pickTemplateTransfer() : { status: "selected" as const, ...await prepareTemplateTransfer(mode.template.id, mode.template.revision) };
      if (!alive.current) return;
      if (selected.status === "cancelled") { setNotice("Selección cancelada. Los datos se conservan."); return; }
      setReview(null); setFile(null); setName("");setResourcesReviewed(false);
      const inspected = await inspectTemplateTransfer(selected.content);
      if (!alive.current) return;
      if(inspected.catalog){setCatalog({file:selected,review:inspected});return;}
      setReview(inspected); setFile(selected); setName(inspected.name);
    } catch (error) { if (alive.current) setError(getApiErrorMessage(error, "No se pudo revisar la plantilla. El archivo original se conserva.")); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => {
    alive.current = true;
    if (mode.kind === "export") void prepare();
    return () => { alive.current = false; };
  }, []);

  async function confirm() {
    if (running.current || !review || !file || !!review.resources?.length&&!resourcesReviewed) return;
    running.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      if (mode.kind === "import") {
        const imported = await (review.resources?.length?importTemplateTransfer(file.content,review.digest,name.trim(),resourcesReviewed):importTemplateTransfer(file.content,review.digest,name.trim()));
        if (!alive.current) return;
        await onImported(imported); onClose();
      } else {
        const result = await deliverTemplateTransfer(mode.template.id, mode.template.revision);
        if (!alive.current) return;
        if (result.status === "cancelled") setNotice("Exportación cancelada. La plantilla se conserva.");
        else { setDelivered(true); setNotice(result.status === "saved" ? `Plantilla guardada como «${result.fileName}».` : "Descarga solicitada. Comprueba el archivo en las descargas del navegador."); }
      }
    } catch (error) { if (alive.current) setError(getApiErrorMessage(error, "No se pudo completar. Revisa el aviso; tus datos se conservan.")); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  if(catalog)return <DocumentTemplateCatalogTransferDialog mode={{kind:"import-catalog",...catalog}} onClose={onClose} onImported={onImported}/>;
  return <ModalFrame label={title} onClose={() => { if (!running.current) onClose(); }}>
    <section aria-busy={busy} className="flex max-h-[calc(100dvh-24px)] w-full max-w-[620px] flex-col overflow-hidden rounded-lg bg-white shadow-menu">
      <header className="flex shrink-0 items-center justify-between px-5 py-3"><h2 className="text-[15px] font-semibold">{title}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Cerrar transferencia de plantilla" className="grid min-h-11 min-w-11 place-items-center rounded hover:bg-panel"><X size={17}/></button></header>
      <div className="min-h-0 overflow-y-auto px-5 py-3 text-sm">
        <p className="text-xs text-ink-secondary">Se traslada el nombre, la descripción y el contenido de la plantilla. Revisa texto y adjuntos: pueden incluir información personal. Las copias de recursos se trasladan completas, sin analizarlas ni ejecutarlas. La aplicación no adjunta su configuración ni sus credenciales, ni los valores introducidos al crear otros documentos.</p>
        {isImport && <button type="button" disabled={busy} onClick={() => void prepare()} className="my-3 min-h-11 rounded px-3 text-brand-orange hover:bg-brand-hover">{file ? "Elegir otro archivo…" : "Elegir archivo de plantilla…"}</button>}
        {busy && !review && <p role="status" className="py-3 text-xs">Preparando revisión…</p>}
        {!isImport && !review && !busy && <button type="button" onClick={() => void prepare()} className="min-h-11 text-brand-orange underline">Reintentar revisión</button>}
        {file && <p className="mb-3 break-words text-xs text-ink-secondary">Archivo: {file.fileName}</p>}
        {review && <div className="space-y-3">
          {isImport ? <label className="block text-xs">Nombre en tu catálogo<input value={name} maxLength={240} disabled={busy} onChange={e => { setName(e.target.value); setError(null); }} className="mt-1 min-h-11 w-full rounded border border-line px-3 text-sm"/></label> : <h3 className="font-semibold">{review.name}</h3>}
          {review.description && <p className="text-xs text-ink-secondary">{review.description}</p>}
          <p className="text-xs text-ink-secondary">{review.variables.length ? `Campos: ${review.variables.map(key => `{{${key}}}`).join(", ")}` : "Sin campos variables"} · {review.byteLength.toLocaleString()} bytes</p>
          {isImport && <p className="text-xs text-ink-secondary">Se crea una plantilla nueva. Si el nombre ya existe, podrás cambiarlo para conservar ambas.</p>}
          {!!review.resources?.length&&<div className="rounded bg-panel p-3 text-xs leading-5"><h3 className="font-medium">Adjuntos incluidos ({review.resources.length})</h3><ul className="my-2 space-y-1">{review.resources.map(resource=><li className="break-all" key={resource.path}>{resource.name} · {(resource.bytes/1024).toFixed(1)} KiB</li>)}</ul><label className="flex min-h-11 items-start gap-2"><input type="checkbox" className="mt-1 accent-[#F37021]" checked={resourcesReviewed} disabled={busy} onChange={event=>setResourcesReviewed(event.target.checked)}/><span>He revisado los adjuntos y autorizo trasladar su contenido</span></label></div>}
          <ReadonlyMarkdownViewer markdown={review.markdown} ariaLabel="Contenido de la plantilla para trasladar" emptyMessage="Plantilla en blanco"/>
          <details><summary className="flex min-h-11 cursor-pointer items-center text-xs text-ink-secondary">Revisar el archivo completo</summary><pre className="whitespace-pre-wrap break-words text-xs [overflow-wrap:anywhere]">{file?.content}</pre></details>
        </div>}
      </div>
      {error && <p role="alert" className="shrink-0 px-5 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="shrink-0 px-5 py-2 text-xs text-ink-secondary">{notice}</p>}
      <footer className="flex shrink-0 justify-end gap-2 px-5 py-3"><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded px-4 text-xs hover:bg-panel">{delivered ? "Volver" : "Cancelar"}</button>
        {!delivered && <button type="button" disabled={busy || !review || (isImport && !name.trim()) || !!review?.resources?.length&&!resourcesReviewed} onClick={() => void confirm()} className="min-h-11 rounded bg-brand-orange px-4 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{busy ? "Preparando…" : isImport ? "Importar plantilla" : "Elegir destino…"}</button>}
      </footer>
    </section>
  </ModalFrame>;
}
