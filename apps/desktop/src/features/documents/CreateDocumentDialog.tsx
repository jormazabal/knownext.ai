import { FileText, X } from "lucide-react";
import { useState } from "react";

type CreateDocumentDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, template: string) => void;
};

const templates = [
  { id: "blank", label: "Documento en blanco" },
  { id: "meeting", label: "Acta de reunión" },
  { id: "requirements", label: "Requisitos" },
  { id: "decision", label: "Decisión técnica" },
];

export function CreateDocumentDialog({ open, onClose, onCreate }: CreateDocumentDialogProps) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("blank");

  if (!open) return null;

  function handleCreate() {
    const normalizedName = name.trim().endsWith(".md") ? name.trim() : `${name.trim() || "nuevo-documento"}.md`;
    onCreate(normalizedName, template);
    setName("");
    setTemplate("blank");
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/20">
      <section className="w-[420px] rounded-lg border border-line bg-white shadow-menu">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <FileText size={18} className="text-brand-orange" />
            <h2 className="text-[15px] font-semibold">Crear documento</h2>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-brand-hover" onClick={onClose} aria-label="Cerrar">
            <X size={17} />
          </button>
        </header>
        <div className="space-y-4 px-5 py-5">
          <label className="block text-[12px] font-medium text-ink-secondary">
            Nombre del documento
            <input
              className="mt-2 h-10 w-full rounded-md border border-line px-3 text-[13px] text-ink-primary outline-none focus:border-brand-orange"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="ej. decisiones-arquitectura.md"
              autoFocus
            />
          </label>
          <label className="block text-[12px] font-medium text-ink-secondary">
            Plantilla
            <select
              className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-[13px] text-ink-primary outline-none focus:border-brand-orange"
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
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button className="h-9 rounded-md border border-line px-4 text-[13px] hover:bg-panel" onClick={onClose}>
            Cancelar
          </button>
          <button className="h-9 rounded-md bg-brand-orange px-4 text-[13px] font-semibold text-white hover:bg-brand-dark" onClick={handleCreate}>
            Crear documento
          </button>
        </footer>
      </section>
    </div>
  );
}

