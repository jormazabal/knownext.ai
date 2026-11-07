import { useEffect,useRef, useState } from "react";
import { X } from "lucide-react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { getApiErrorMessage } from "../../lib/api/client";
import { prepareDocumentTemplateSource,saveDocumentTemplate } from "../../lib/api/documentTemplates";
import type {DocumentTemplateSource} from "../../types/documentTemplates";
import { ReadonlyMarkdownViewer } from "../editor/ReadonlyMarkdownViewer";

export function SaveDocumentTemplateDialog({ source, onClose, onSaved }: {
  source: { name: string; markdown: string;documentId?:string };
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(source.name.replace(/\.md$/i, ""));
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [resourcesReviewed,setResourcesReviewed]=useState(false);
  const [prepared,setPrepared]=useState<DocumentTemplateSource|null>(null);
  const [preparing,setPreparing]=useState(false);
  const submitting = useRef(false);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function prepare(){
    if(submitting.current||!source.documentId)return;
    submitting.current=true;setBusy(true);setPreparing(true);setError(null);
    try{const snapshot=await prepareDocumentTemplateSource(source.documentId,source.markdown);if(alive.current){setPrepared(snapshot);setResourcesReviewed(false);setReviewOpen(true);}}
    catch(cause){if(alive.current)setError(getApiErrorMessage(cause,"No se pudieron preparar los recursos. Se conserva la última copia revisada y el documento original."));}
    finally{submitting.current=false;if(alive.current){setBusy(false);setPreparing(false);}}
  }
  async function save() {
    if (submitting.current) return;
    if(prepared?.attachments?.length&&!resourcesReviewed){setError("Revisa los adjuntos y confirma su contenido antes de guardar");return;}
    submitting.current = true; setBusy(true); setError(null);
    try {
      const result = await saveDocumentTemplate({ name, description, markdown: prepared?.markdown??source.markdown,...(prepared?.attachments?.length?{resources:prepared.attachments,reviewedResources:true}:{}) });
      onSaved(result.name);
    } catch (error) {
      setError(getApiErrorMessage(error, "No se pudo guardar la plantilla. El documento original se conserva."));
    } finally { submitting.current = false; setBusy(false); }
  }
  return <ModalFrame label="Guardar como plantilla" onClose={() => { if (!submitting.current||preparing) onClose(); }}>
    <form className="flex max-h-[calc(100dvh-24px)] w-full max-w-[700px] flex-col overflow-hidden rounded-lg bg-white shadow-menu" aria-busy={busy} onSubmit={event => { event.preventDefault(); void save(); }}>
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 py-3"><h2 className="text-base font-semibold">Guardar como plantilla</h2><button type="button" aria-label="Cerrar plantilla" disabled={busy&&!preparing} onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded hover:bg-brand-hover"><X size={18}/></button></header>
      <div className="min-h-0 min-w-0 overflow-y-auto px-5 pb-5"><fieldset disabled={busy} className="min-w-0 space-y-4">
        <p className="text-sm text-ink-secondary">Reutiliza este contenido en otros documentos. Revisa que incluya solo la información que quieras conservar en la plantilla.</p>
        <label className="block text-sm">Nombre<input data-autofocus required maxLength={240} value={name} onChange={event => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded border border-line bg-white px-3"/></label>
        <label className="block text-sm">Descripción <span className="text-ink-secondary">(opcional)</span><input maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} className="mt-1 min-h-11 w-full rounded border border-line bg-white px-3"/></label>
        <p className="text-xs text-ink-secondary">Los campos como <code>{"{{cliente}}"}</code> se completan al crear cada documento. Nombre, fecha y proyecto se pueden incorporar con <code>{"{{titulo}}, {{fecha}}, {{proyecto}}"}</code>. Se admiten texto, enlaces web, imágenes embebidas y copias de adjuntos locales preparados.</p>
        {source.documentId&&<div className="space-y-2"><button type="button" disabled={busy} onClick={()=>void prepare()} className="min-h-11 rounded px-3 text-xs text-brand-dark hover:bg-brand-hover">{preparing?"Preparando recursos…":prepared?"Actualizar copia de recursos":"Preparar recursos locales"}</button><p className="text-xs leading-5 text-ink-secondary">Copia PNG, JPEG y WebP dentro de la plantilla; no descarga imágenes remotas. Hasta 512 KiB por imagen y 1 MiB con el texto. También copia hasta 8 adjuntos PDF, DOCX, XLSX, TXT o CSV de 1 MiB cada uno. Otros enlaces locales se rechazan; no se incluyen archivos implícitos, configuración o credenciales.</p>{prepared&&<p role="status" className="text-xs">{[prepared.resources.length?`${prepared.resources.length} ${prepared.resources.length===1?"imagen local incluida":"imágenes locales incluidas"}`:"",prepared.attachments?.length?`${prepared.attachments.length} adjuntos incluidos`:""].filter(Boolean).join(" · ")||"Sin recursos locales para copiar"}. Revisa la copia antes de guardar.</p>}{!!prepared?.attachments?.length&&<div className="rounded bg-panel p-3 text-xs leading-5"><h3 className="font-medium">Adjuntos que se conservarán</h3><ul className="my-2 space-y-1">{prepared.attachments.map(resource=><li className="break-all" key={resource.path}>{resource.name} · {(resource.byteLength/1024).toFixed(1)} KiB · {resource.name.split(".").pop()?.toUpperCase()}</li>)}</ul><p>Se guardan copias completas y se crearán archivos relativos en cada documento nuevo. Pueden contener información confidencial; no se comprueba automáticamente su contenido.</p><label className="mt-2 flex min-h-11 items-start gap-2"><input type="checkbox" className="mt-1 accent-[#F37021]" checked={resourcesReviewed} onChange={event=>setResourcesReviewed(event.target.checked)}/><span>He revisado los adjuntos y autorizo conservar y reutilizar su contenido</span></label></div>}</div>}
        <details open={reviewOpen} onToggle={event => setReviewOpen(event.currentTarget.open)}><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand-orange">Revisar contenido que se guardará</summary>{reviewOpen && <div className="pt-3"><ReadonlyMarkdownViewer markdown={prepared?.markdown??source.markdown} ariaLabel="Contenido de la plantilla" emptyMessage="Plantilla vacía"/></div>}</details>
      </fieldset></div>
      {error && <p role="alert" className="max-h-[20dvh] shrink-0 overflow-y-auto break-words px-5 py-2 text-sm text-red-700">{error}</p>}
      <footer className="flex shrink-0 justify-end gap-2 px-5 py-3"><button disabled={busy&&!preparing} type="button" onClick={onClose} className="min-h-11 rounded px-4 hover:bg-panel">Cancelar</button><button disabled={busy || !name.trim() || !!prepared?.attachments?.length&&!resourcesReviewed} className="min-h-11 rounded bg-brand-orange px-4 text-sm font-semibold text-white disabled:opacity-50">{preparing?"Preparando…":busy ? "Guardando…" : "Guardar plantilla"}</button></footer>
    </form>
  </ModalFrame>;
}
