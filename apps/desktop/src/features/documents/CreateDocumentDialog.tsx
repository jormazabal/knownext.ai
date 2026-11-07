import { FileText, NotebookPen, X } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { getApiErrorMessage } from "../../lib/api/client";
import { retireDocumentTemplate } from "../../lib/api/documentTemplates";
import { ReadonlyMarkdownViewer } from "../editor/ReadonlyMarkdownViewer";
import { useDocumentTemplates, useDocumentTemplatePreview } from "./useDocumentTemplates";
import { DocumentTemplateTransferDialog, type TemplateTransferMode } from "./DocumentTemplateTransferDialog";

export type CreateDocumentRequest = {
  kind: "document" | "handwritten-note";
  name: string;
  template: string;
  background: string;
  templateRevision?: string;
  templateValues?: Record<string, string>;
  templateProjectRootHash?: string;
};

type CreateDocumentDialogProps = {
  open: boolean;
  initialKind?: CreateDocumentRequest["kind"];
  projectId?: string;
  destinationLabel?: string;
  onClose: () => void;
  onCreate: (request: CreateDocumentRequest) => void | boolean | Promise<void | boolean>;
};

const automaticFields = new Set(["titulo", "fecha", "proyecto"]);
function variableLabel(key: string) {
  if (key === "titulo") return "Título";
  return key[0].toUpperCase() + key.slice(1).replace(/_/g, " ");
}

export function CreateDocumentDialog({ open, initialKind = "document", projectId = "", destinationLabel, onClose, onCreate }: CreateDocumentDialogProps) {
  const [kind, setKind] = useState<CreateDocumentRequest["kind"]>(initialKind);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("blank");
  const [background, setBackground] = useState("blank");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [valuesByTemplate, setValuesByTemplate] = useState<Record<string, Record<string, string>>>({});
  const [retireReview, setRetireReview] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [retiredName, setRetiredName] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<TemplateTransferMode | null>(null);
  const catalog = useDocumentTemplates(open);
  const selectedTemplate = catalog.inventory?.templates.find(item => item.id === template);
  const values = valuesByTemplate[template] ?? {};
  const suppliedValues = Object.fromEntries(Object.entries(values).filter(([key,value]) => !automaticFields.has(key) || value.trim()));
  const defaultName = name.trim() || "nuevo-documento";
  const markdownName = defaultName.toLowerCase().endsWith(".md") ? defaultName : `${defaultName}.md`;
  const missingFields = selectedTemplate?.variables.filter(key => !automaticFields.has(key) && !values[key]?.trim()) ?? [];
  const needsPreview = kind === "document" && selectedTemplate && !selectedTemplate.builtIn;
  const preview = useDocumentTemplatePreview(Boolean(open && needsPreview), template,
    needsPreview && projectId && !missingFields.length ? { projectId, name: markdownName, revision: selectedTemplate.revision, values: suppliedValues } : null);
  const submitting = useRef(false);

  useEffect(() => {
    if (open) { setKind(initialKind); setRetireReview(false); setRetiredName(null); }
  }, [initialKind, open]);

  if (!open) return null;

  async function handleCreate() {
    if (submitting.current) return;
    if (kind === "document" && (!selectedTemplate || catalog.loading || catalog.error || (needsPreview && !preview.preview))) return;
    submitting.current = true;
    setRetiredName(null);
    setBusy(true);
    setError(null);
    const trimmedName = name.trim() || (kind === "handwritten-note" ? "nueva-nota" : "nuevo-documento");
    const normalizedName = kind === "handwritten-note"
      ? trimmedName.toLowerCase().endsWith(".knote") ? trimmedName : `${trimmedName}.knote`
      : trimmedName.toLowerCase().endsWith(".md") ? trimmedName : `${trimmedName}.md`;
    try {
      const result = await onCreate({ kind, name: normalizedName, template, background,
        ...(kind === "document" ? { templateRevision: selectedTemplate!.revision, templateValues: preview.preview?.values ?? suppliedValues,
          ...(preview.preview ? { templateProjectRootHash: preview.preview.projectRootHash } : {}) } : {}) });
      if (result === false) { setError("No se pudo crear. Revisa el aviso y vuelve a intentarlo; tus datos se conservan."); return; }
      setName(""); setKind("document"); setTemplate("blank"); setBackground("blank"); setValuesByTemplate({});
    } catch (error) { setError(getApiErrorMessage(error, "No se pudo crear el documento. Tus datos se conservan.")); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function retire() {
    if (submitting.current || !selectedTemplate || selectedTemplate.builtIn) return;
    submitting.current = true; setBusy(true); setRetiring(true); setError(null);
    try {
      await retireDocumentTemplate(selectedTemplate.id, selectedTemplate.revision);
      setRetiredName(selectedTemplate.name);
      setTemplate("blank"); setRetireReview(false); await catalog.reload();
    } catch (error) { setError(getApiErrorMessage(error, "No se pudo retirar la plantilla. Se conserva sin cambios.")); }
    finally { submitting.current = false; setBusy(false); setRetiring(false); }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleCreate();
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;

    event.preventDefault();
    handleCreate();
  }

  function variableField(key: string) {
    return <label key={key} className="block text-xs">{variableLabel(key)}<input value={values[key] ?? ""} required={!automaticFields.has(key)} maxLength={16384} placeholder={key === "titulo" ? "Nombre del documento" : key === "fecha" ? "Fecha de hoy" : key === "proyecto" ? "Proyecto actual" : "Completar"} onChange={event => setValuesByTemplate(current => ({ ...current, [template]: { ...current[template], [key]: event.target.value } }))} className="mt-1 min-h-11 w-full rounded border border-line bg-white px-3 text-sm"/></label>;
  }

  return (
    <ModalFrame label="Crear documento" onClose={()=>{if(!submitting.current)onClose();}}>
      <form aria-busy={busy} className={`flex max-h-[calc(100dvh-24px)] w-full ${needsPreview ? "max-w-[640px]" : "max-w-[420px]"} flex-col overflow-hidden rounded-lg bg-white shadow-menu`} onSubmit={handleSubmit}>
        <header className="flex shrink-0 items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            {kind === "handwritten-note" ? <NotebookPen size={18} className="text-brand-orange" /> : <FileText size={18} className="text-brand-orange" />}
            <div className="min-w-0"><h2 className="text-[15px] font-semibold">Crear documento</h2>{destinationLabel && <p className="mt-1 truncate text-xs text-ink-secondary" title={destinationLabel}>En {destinationLabel}</p>}</div>
          </div>
          <button disabled={busy} type="button" className="grid min-h-11 min-w-11 place-items-center rounded-md hover:bg-brand-hover" onClick={onClose} aria-label="Cerrar">
            <X size={17} />
          </button>
        </header>
        <div className="min-h-0 min-w-0 overflow-y-auto px-5 py-4"><fieldset disabled={busy} className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={["flex min-h-11 items-center justify-center gap-2 rounded-md border text-[11px] font-semibold", kind === "document" ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-line hover:bg-panel"].join(" ")}
              onClick={() => setKind("document")}
            >
              <FileText size={15} />
              Markdown
            </button>
            <button
              type="button"
              className={["flex min-h-11 items-center justify-center gap-2 rounded-md border text-[11px] font-semibold", kind === "handwritten-note" ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-line hover:bg-panel"].join(" ")}
              onClick={() => setKind("handwritten-note")}
            >
              <NotebookPen size={15} />
              Nota a mano
            </button>
          </div>
          <label className="block text-[11px] font-medium text-ink-secondary">
            {kind === "handwritten-note" ? "Nombre de la nota" : "Nombre del documento"}
            <input
              className="mt-2 min-h-11 w-full rounded-md border border-line px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={handleNameKeyDown}
              placeholder={kind === "handwritten-note" ? "ej. pizarra-reunion.knote" : "ej. decisiones-arquitectura.md"}
              data-autofocus
            />
          </label>
          {kind === "document" ? (
            <div className="space-y-3"><label className="block text-[11px] font-medium text-ink-secondary">
              Plantilla
              <select
                aria-label="Plantilla"
                className="mt-2 min-h-11 w-full rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
                value={template}
                onChange={(event) => { setTemplate(event.target.value); setRetireReview(false); setRetiredName(null); }}
                disabled={catalog.loading || Boolean(catalog.error)}
              >
                {!catalog.inventory && <option value="blank">Cargando plantillas…</option>}
                {catalog.inventory?.templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.builtIn ? "" : " · Personal"}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-x-4"><button type="button" className="min-h-11 text-xs text-ink-secondary underline" onClick={() => setTransfer({ kind: "import" })}>Importar plantilla o catálogo…</button>{selectedTemplate && <button type="button" className="min-h-11 text-xs text-ink-secondary underline" onClick={() => setTransfer({ kind: "export", template: selectedTemplate })}>Exportar esta plantilla…</button>}{catalog.inventory&&<button type="button" className="min-h-11 text-xs text-ink-secondary underline" onClick={()=>setTransfer({kind:"export-catalog",templates:catalog.inventory!.templates})}>Compartir varias…</button>}</div>
            {catalog.error && <div role="alert" className="text-sm text-red-700">{catalog.error}<button type="button" onClick={() => void catalog.reload()} className="ml-2 min-h-11 underline">Reintentar</button></div>}
            {catalog.inventory?.warnings.map((warning,index) => <p key={index} className="text-xs text-ink-secondary">{warning.message}</p>)}
            {retiredName && <p role="status" className="text-xs text-ink-secondary">«{retiredName}» se ha retirado del catálogo. Los documentos creados se mantienen.</p>}
            {needsPreview && <>
              {selectedTemplate.description && <p className="text-xs text-ink-secondary">{selectedTemplate.description}</p>}
              {selectedTemplate.variables.filter(key => !automaticFields.has(key)).map(variableField)}
              {selectedTemplate.variables.some(key => automaticFields.has(key)) && <details><summary className="flex min-h-11 cursor-pointer items-center text-xs text-brand-orange">Personalizar título, fecha o proyecto</summary><div className="space-y-3 pt-2">{selectedTemplate.variables.filter(key => automaticFields.has(key)).map(variableField)}</div></details>}
              <div className="space-y-2 pt-2"><h3 className="text-xs font-semibold">Vista previa</h3>
                {missingFields.length > 0 ? <p className="text-xs text-ink-secondary">Completa los campos para ver el documento.</p> : preview.loading ? <p role="status" className="text-xs text-ink-secondary">Preparando vista previa…</p> : preview.error ? <div role="alert" className="text-sm text-red-700">{preview.error}<button type="button" onClick={preview.retry} className="ml-2 min-h-11 underline">Reintentar vista previa</button></div> : preview.preview && <ReadonlyMarkdownViewer markdown={preview.preview.markdown} ariaLabel="Vista previa del documento" emptyMessage="Documento en blanco"/>}
              </div>
              {!preview.loading&&!preview.error&&preview.preview?.resources?.length? <details open className="rounded bg-panel p-3 text-xs leading-5"><summary className="min-h-11 cursor-pointer font-medium">Adjuntos que se crearán ({preview.preview.resources.length})</summary><p>Se crearán copias con enlaces relativos. Los originales se conservan.</p><ul className="mt-2 [overflow-wrap:anywhere]">{preview.preview.resources.map(resource=><li key={resource.path}>{resource.name} · {(resource.bytes/1024).toFixed(1)} KiB</li>)}</ul></details>:null}
              {retireReview ? <div className="space-y-2 text-sm"><p>¿Retirar «{selectedTemplate.name}» del catálogo? Se conservará una copia local. Los documentos creados se mantienen.</p><div className="flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded px-3 text-red-700 hover:bg-panel" onClick={() => void retire()}>Retirar plantilla</button><button type="button" className="min-h-11 rounded px-3 hover:bg-panel" onClick={() => setRetireReview(false)}>Conservar plantilla</button></div></div> : <button type="button" className="min-h-11 text-xs text-ink-secondary underline" onClick={() => setRetireReview(true)}>Retirar esta plantilla…</button>}
            </>}
            </div>
          ) : (
            <label className="block text-[11px] font-medium text-ink-secondary">
              Fondo inicial
              <select
                aria-label="Fondo inicial"
                className="mt-2 min-h-11 w-full rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
              >
                <option value="blank">Blanco</option>
                <option value="ruled">Rayado</option>
                <option value="grid">Cuadrícula</option>
                <option value="dots">Puntos</option>
                <option value="cornell">Cornell</option>
              </select>
            </label>
          )}
        </fieldset></div>
        {error && <p role="alert" className="px-5 pb-4 text-sm text-red-700">{error}</p>}
        <footer className="flex shrink-0 justify-end gap-2 px-5 py-3">
          <button disabled={busy} type="button" className="min-h-11 rounded-md px-4 text-[11px] hover:bg-panel" onClick={onClose}>
            Cancelar
          </button>
          <button disabled={busy || (kind === "document" && (!selectedTemplate || catalog.loading || Boolean(catalog.error) || Boolean(needsPreview && !preview.preview)))} type="submit" className="min-h-11 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {busy ? retiring ? "Retirando plantilla…" : "Creando…" : kind === "handwritten-note" ? "Crear nota" : "Crear documento"}
          </button>
        </footer>
      </form>
      {transfer && <DocumentTemplateTransferDialog mode={transfer} onClose={() => setTransfer(null)} onImported={async imported => { await catalog.reload(); setTemplate(imported.id); setRetireReview(false); setRetiredName(null); }}/>}</ModalFrame>
  );
}

