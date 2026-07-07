import { FileText, NotebookPen, X } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useState } from "react";

export type CreateDocumentRequest = {
  kind: "document" | "handwritten-note";
  name: string;
  template: string;
  background: string;
};

type CreateDocumentDialogProps = {
  open: boolean;
  initialKind?: CreateDocumentRequest["kind"];
  onClose: () => void;
  onCreate: (request: CreateDocumentRequest) => void;
};

const templates = [
  { id: "blank", label: "Documento en blanco" },
  { id: "meeting", label: "Acta de reunión" },
  { id: "requirements", label: "Requisitos" },
  { id: "decision", label: "Decisión técnica" },
];

export function CreateDocumentDialog({ open, initialKind = "document", onClose, onCreate }: CreateDocumentDialogProps) {
  const [kind, setKind] = useState<CreateDocumentRequest["kind"]>(initialKind);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("blank");
  const [background, setBackground] = useState("blank");

  useEffect(() => {
    if (open) setKind(initialKind);
  }, [initialKind, open]);

  if (!open) return null;

  function handleCreate() {
    const trimmedName = name.trim() || (kind === "handwritten-note" ? "nueva-nota" : "nuevo-documento");
    const normalizedName = kind === "handwritten-note"
      ? trimmedName.toLowerCase().endsWith(".knote") ? trimmedName : `${trimmedName}.knote`
      : trimmedName.toLowerCase().endsWith(".md") ? trimmedName : `${trimmedName}.md`;
    onCreate({ kind, name: normalizedName, template, background });
    setName("");
    setKind("document");
    setTemplate("blank");
    setBackground("blank");
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

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[80] grid place-items-center bg-black/20">
      <form className="w-[420px] rounded-lg border border-line bg-white shadow-menu" onSubmit={handleSubmit}>
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            {kind === "handwritten-note" ? <NotebookPen size={18} className="text-brand-orange" /> : <FileText size={18} className="text-brand-orange" />}
            <h2 className="text-[15px] font-semibold">Crear documento</h2>
          </div>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-md hover:bg-brand-hover" onClick={onClose} aria-label="Cerrar">
            <X size={17} />
          </button>
        </header>
        <div className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={["flex h-10 items-center justify-center gap-2 rounded-md border text-[11px] font-semibold", kind === "document" ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-line hover:bg-panel"].join(" ")}
              onClick={() => setKind("document")}
            >
              <FileText size={15} />
              Markdown
            </button>
            <button
              type="button"
              className={["flex h-10 items-center justify-center gap-2 rounded-md border text-[11px] font-semibold", kind === "handwritten-note" ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-line hover:bg-panel"].join(" ")}
              onClick={() => setKind("handwritten-note")}
            >
              <NotebookPen size={15} />
              Nota a mano
            </button>
          </div>
          <label className="block text-[11px] font-medium text-ink-secondary">
            {kind === "handwritten-note" ? "Nombre de la nota" : "Nombre del documento"}
            <input
              className="mt-2 h-10 w-full rounded-md border border-line px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={handleNameKeyDown}
              placeholder={kind === "handwritten-note" ? "ej. pizarra-reunion.knote" : "ej. decisiones-arquitectura.md"}
              autoFocus
            />
          </label>
          {kind === "document" ? (
            <label className="block text-[11px] font-medium text-ink-secondary">
              Plantilla
              <select
                className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
              >
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-[11px] font-medium text-ink-secondary">
              Fondo inicial
              <select
                className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
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
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button type="button" className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark">
            {kind === "handwritten-note" ? "Crear nota" : "Crear documento"}
          </button>
        </footer>
      </form>
    </div>
  );
}

