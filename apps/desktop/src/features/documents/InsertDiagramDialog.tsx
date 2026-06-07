import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, Clipboard, Copy, GalleryVerticalEnd, Info, Layers3, PanelTop, PencilLine, Search, ShieldCheck, Sparkles, Trash2, Workflow, X } from "lucide-react";
import { defaultAiConfig } from "../../lib/api/config";
import type { AiDiagramConfig } from "../../types/domain";
import {
  diagramIconExamples,
  diagramProfileLabel,
  mermaidDiagramTemplates,
  templateAllowedByConfig,
  validateMermaidPolicy,
  type MermaidDiagramCategory,
  type MermaidDiagramTemplate,
} from "../editor/mermaidCatalog";
import { buildMermaidMarkdown, defaultMermaidCode, renderMermaidSvg, validateMermaidCode } from "../editor/mermaidDiagrams";

type InsertDiagramDialogProps = {
  variant?: "insert" | "edit";
  initialCode?: string;
  initialCaption?: string | null;
  diagramConfig?: AiDiagramConfig | null;
  onClose: () => void;
  onInsert: (markdown: string) => void;
  onDelete?: () => void;
};

const categories: Array<{ id: MermaidDiagramCategory | "all"; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "core", label: "Base" },
  { id: "business", label: "Producto" },
  { id: "technical", label: "Tecnico" },
  { id: "data", label: "Datos" },
  { id: "experimental", label: "Beta" },
];

export function InsertDiagramDialog({
  variant = "insert",
  initialCode = defaultMermaidCode,
  initialCaption = "",
  diagramConfig = defaultAiConfig.diagrams,
  onClose,
  onInsert,
  onDelete,
}: InsertDiagramDialogProps) {
  const config = diagramConfig ?? defaultAiConfig.diagrams;
  const isEditMode = variant === "edit";
  const initialTemplate = findTemplateForCode(initialCode);
  const [code, setCode] = useState(initialCode.trim() || initialTemplate?.code || defaultMermaidCode);
  const [caption, setCaption] = useState(initialCaption ?? "");
  const [activeTemplateId, setActiveTemplateId] = useState(initialTemplate?.id ?? mermaidDiagramTemplates[0].id);
  const [category, setCategory] = useState<MermaidDiagramCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [validation, setValidation] = useState<{ status: "idle" | "validating" | "valid" | "invalid"; message: string | null; warnings: string[] }>({
    status: "idle",
    message: null,
    warnings: [],
  });
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const activeTemplate = mermaidDiagramTemplates.find((template) => template.id === activeTemplateId) ?? mermaidDiagramTemplates[0];
  const exactTemplate = useMemo(() => mermaidDiagramTemplates.find((template) => template.code.trim() === code.trim()) ?? null, [code]);
  const lineNumbers = useMemo(() => code.split("\n").map((_, index) => index + 1), [code]);
  const validationText = buildValidationText(validation);
  const canAccept = validation.status === "valid" && code.trim().length > 0;

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return mermaidDiagramTemplates.filter((template) => {
      if (category !== "all" && template.category !== category && !(category === "experimental" && template.maturity === "beta")) return false;
      if (!normalizedQuery) return true;
      return [
        template.label,
        template.diagramType,
        template.description,
        template.useWhen,
        template.avoidWhen,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [category, query]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void validateAndPreview({ passive: true });
    }, 450);
    return () => window.clearTimeout(handle);
  }, [code, config.enabled, config.visualProfile, config.iconSet, config.imagePolicy, config.betaPolicy]);

  function selectTemplate(template: MermaidDiagramTemplate) {
    if (isEditMode && template.id !== activeTemplateId) {
      const confirmed = window.confirm("Cambiar el tipo de diagrama reemplazara el codigo actual por el ejemplo del nuevo tipo. ¿Continuar?");
      if (!confirmed) {
        setSelectorOpen(false);
        return;
      }
    }

    setActiveTemplateId(template.id);
    setCode(template.code);
    setValidation({ status: "idle", message: null, warnings: [] });
    setPreviewSvg(null);
    setSelectorOpen(false);
    if (!caption.trim()) setCaption(template.label);
  }

  async function validateAndPreview(options: { passive?: boolean } = {}) {
    const passive = options.passive === true;
    if (!passive) setValidation({ status: "validating", message: null, warnings: [] });

    const policy = validateMermaidPolicy(code, config);
    if (!policy.valid) {
      setValidation({ status: "invalid", message: policy.error, warnings: policy.warnings });
      setPreviewSvg(null);
      return false;
    }

    const result = await validateMermaidCode(code);
    if (!result.valid) {
      setValidation({ status: "invalid", message: result.error, warnings: policy.warnings });
      setPreviewSvg(null);
      return false;
    }

    setValidation({ status: "valid", message: "Diagrama valido.", warnings: policy.warnings });
    setPreviewBusy(true);
    try {
      const svg = await renderMermaidSvg(code, "knownext-dialog-diagram");
      setPreviewSvg(svg);
    } catch (error) {
      setValidation({ status: "invalid", message: error instanceof Error ? error.message : "No se pudo renderizar el diagrama.", warnings: policy.warnings });
      setPreviewSvg(null);
      return false;
    } finally {
      setPreviewBusy(false);
    }
    return true;
  }

  async function accept() {
    const valid = await validateAndPreview();
    if (!valid) return;
    onInsert(buildMermaidMarkdown({ code, caption }));
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard?.writeText(value);
    } catch {
      // Copy is best effort in the desktop webview.
    }
  }

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[98] grid place-items-center bg-black/20 px-4">
      <section className="flex max-h-[min(900px,calc(100dvh-40px))] w-[min(1500px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-primary">{isEditMode ? "Editar diagrama" : "Insertar diagrama"}</h2>
            <p className="mt-1 text-[11px] text-ink-secondary">
              Elige un tipo, valida Mermaid y revisa la vista previa. El documento guardara codigo editable y exportara el diagrama como imagen.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
              onClick={() => setInfoOpen(true)}
              aria-label="Mas informacion sobre diagramas"
              title="Mas informacion"
            >
              <Info size={16} />
            </button>
            <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" onClick={onClose} aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_360px] overflow-hidden max-[1100px]:grid-cols-1">
          <aside className="min-h-0 overflow-y-auto border-r border-line bg-panel/40 px-4 py-4">
            <div className="relative">
              <label className="block text-[10px] font-semibold uppercase text-ink-secondary">Tipo de diagrama</label>
              <button
                type="button"
                className="mt-1 flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-line bg-white px-3 py-2 text-left hover:border-brand-orange"
                aria-expanded={selectorOpen}
                onClick={() => setSelectorOpen((open) => !open)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold text-ink-primary">{activeTemplate.label}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-ink-secondary">{activeTemplate.diagramType} · {maturityLabel(activeTemplate)}</span>
                </span>
                <ChevronDown size={15} className={["shrink-0 text-ink-secondary transition", selectorOpen ? "rotate-180" : ""].join(" ")} />
              </button>

              {selectorOpen ? (
                <div className="absolute left-0 right-0 top-[64px] z-[3] overflow-hidden rounded-md border border-line bg-white shadow-menu">
                  <div className="border-b border-line p-3">
                    <div className="flex items-center gap-2 rounded-md border border-line bg-white px-2">
                      <Search size={14} className="text-ink-secondary" />
                      <input
                        className="h-8 min-w-0 flex-1 bg-transparent text-[11px] font-medium text-ink-primary outline-none placeholder:text-ink-secondary"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Buscar por uso, tipo o nombre"
                        autoFocus
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {categories.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={[
                            "h-7 rounded-md border px-2 text-[10px] font-semibold",
                            category === item.id ? "border-brand-orange bg-brand-hover text-brand-orange" : "border-line bg-white text-ink-secondary hover:text-ink-primary",
                          ].join(" ")}
                          onClick={() => setCategory(item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="max-h-[340px] overflow-y-auto p-2">
                    {filteredTemplates.map((template) => (
                      <DiagramOption
                        key={template.id}
                        template={template}
                        selected={template.id === activeTemplateId}
                        allowed={templateAllowedByConfig(template, config)}
                        onSelect={() => selectTemplate(template)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <label className="mt-4 block text-[11px] font-semibold text-ink-secondary">
              Pie opcional
              <input
                className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-[12px] text-ink-primary outline-none focus:border-brand-orange"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Ej. Arquitectura de sincronizacion local"
              />
            </label>

            <section className="mt-4 rounded-md border border-line bg-white px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-semibold text-ink-primary">Validacion</h3>
                {validationText ? (
                  <button
                    type="button"
                    className="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
                    aria-label="Copiar mensaje de validacion"
                    onClick={() => void copyText(validationText)}
                  >
                    <Copy size={13} />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="mb-3 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-white text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange"
                onClick={() => void validateAndPreview()}
              >
                <Workflow size={14} />
                Validar
              </button>
              <ValidationState state={validation} />
              {validation.warnings.map((warning) => (
                <ValidationMessage key={warning} tone="warning" message={warning} />
              ))}
            </section>
          </aside>

          <main className="min-h-0 overflow-hidden">
            <section className="h-full min-h-0 overflow-hidden px-5 py-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[11px] font-semibold uppercase text-ink-secondary">Codigo Mermaid</h3>
                  <p className="mt-0.5 truncate text-[10px] text-ink-secondary">
                    {exactTemplate ? exactTemplate.label : activeTemplate.label} · {activeTemplate.diagramType}
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-[10px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange"
                  onClick={() => void copyText(code)}
                >
                  <Clipboard size={13} />
                  Copiar codigo
                </button>
              </div>
              <div className="knownext-mermaid-code-editor">
                <div ref={gutterRef} className="knownext-mermaid-code-gutter" aria-hidden="true">
                  {lineNumbers.map((lineNumber) => (
                    <div key={lineNumber}>{lineNumber}</div>
                  ))}
                </div>
                <textarea
                  className="knownext-mermaid-code-textarea"
                  aria-label="Codigo Mermaid"
                  spellCheck={false}
                  value={code}
                  onScroll={(event) => {
                    if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
                  }}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setValidation({ status: "idle", message: null, warnings: [] });
                    setPreviewSvg(null);
                  }}
                />
              </div>
            </section>
          </main>

          <aside className="min-h-0 overflow-hidden border-l border-line bg-panel/40 px-4 py-4">
            <section className="flex h-full min-h-0 flex-col">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-secondary">
                  <PanelTop size={13} />
                  Vista previa
                </p>
                <span className="max-w-[180px] truncate text-[10px] text-ink-secondary">{caption.trim() || activeTemplate.label}</span>
              </div>
              <div className="grid min-h-0 flex-1 place-items-center overflow-auto rounded-md border border-line bg-white p-4">
                {previewBusy ? (
                  <p className="text-[11px] font-medium text-ink-secondary">Renderizando...</p>
                ) : previewSvg ? (
                  <div className="knownext-mermaid-dialog-preview" dangerouslySetInnerHTML={{ __html: previewSvg }} />
                ) : (
                  <div className="text-center text-[11px] text-ink-secondary">
                    <Workflow size={24} className="mx-auto mb-2 text-brand-orange" />
                    Valida el codigo para ver el diagrama.
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>

        <footer className="flex justify-between gap-2 border-t border-line px-5 py-4">
          {isEditMode && onDelete ? (
            <button className="flex h-9 items-center gap-2 rounded-md border border-red-200 px-4 text-[11px] font-semibold text-red-600 hover:bg-red-50" onClick={onDelete}>
              <Trash2 size={14} />
              Eliminar
            </button>
          ) : (
            <span />
          )}
          <div className="flex justify-end gap-2">
            <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onClose}>Cancelar</button>
            <button
              className="flex h-9 items-center gap-2 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canAccept}
              onClick={() => void accept()}
            >
              {isEditMode ? <PencilLine size={14} /> : <Workflow size={14} />}
              {isEditMode ? "Guardar cambios" : "Insertar"}
            </button>
          </div>
        </footer>
      </section>
      {infoOpen ? (
        <DiagramInfoDialog
          config={config}
          activeTemplate={activeTemplate}
          onClose={() => setInfoOpen(false)}
          onCopy={(value) => void copyText(value)}
        />
      ) : null}
    </div>
  );
}

function DiagramInfoDialog({
  config,
  activeTemplate,
  onClose,
  onCopy,
}: {
  config: AiDiagramConfig;
  activeTemplate: MermaidDiagramTemplate;
  onClose: () => void;
  onCopy: (value: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[99] grid place-items-center bg-black/20 px-4">
      <section className="flex max-h-[min(720px,calc(100dvh-56px))] w-[min(760px,calc(100vw-40px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-[14px] font-semibold text-ink-primary">Informacion de diagramas</h3>
            <p className="mt-1 text-[11px] leading-4 text-ink-secondary">
              Configuracion visual activa, capacidades permitidas y recursos locales disponibles para construir diagramas Mermaid.
            </p>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" onClick={onClose} aria-label="Cerrar informacion">
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <section className="rounded-md border border-line bg-panel/40 px-3 py-3">
            <div className="grid grid-cols-3 gap-2 max-[640px]:grid-cols-1">
              <InfoPill icon={<ShieldCheck size={13} />} label="Perfil" value={diagramProfileLabel(config.visualProfile)} />
              <InfoPill icon={<Sparkles size={13} />} label="Iconos" value={config.iconSet === "lucide" ? "Lucide" : "No"} />
              <InfoPill icon={<Layers3 size={13} />} label="Beta" value={config.betaPolicy === "enabled" ? "Si" : config.betaPolicy === "ask" ? "Aviso" : "No"} />
            </div>
            <p className="mt-3 text-[11px] leading-5 text-ink-secondary">{profileHelp(config)}</p>
          </section>

          <section className="mt-3 rounded-md border border-line bg-white px-3 py-3">
            <div className="mb-2 flex items-center gap-2">
              <Workflow size={14} className="text-brand-orange" />
              <h4 className="text-[12px] font-semibold text-ink-primary">Tipo seleccionado</h4>
            </div>
            <dl className="grid gap-2 text-[11px] leading-5 text-ink-secondary">
              <div>
                <dt className="font-semibold text-ink-primary">{activeTemplate.label}</dt>
                <dd>{activeTemplate.description}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink-primary">Cuándo usarlo</dt>
                <dd>{activeTemplate.useWhen}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink-primary">Cuándo evitarlo</dt>
                <dd>{activeTemplate.avoidWhen}</dd>
              </div>
            </dl>
          </section>

          {config.iconSet === "lucide" ? (
            <section className="mt-3 rounded-md border border-line bg-white px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-ink-primary">
                  <GalleryVerticalEnd size={14} className="text-brand-orange" />
                  <span className="truncate">Iconos locales disponibles para diagramas</span>
                </div>
                <span className="text-[9px] font-semibold uppercase text-ink-secondary">Click copia</span>
              </div>
              <p className="mb-3 text-[11px] leading-5 text-ink-secondary">
                Usa estos identificadores en nodos compatibles, por ejemplo <code className="rounded bg-panel px-1 font-mono text-[10px]">lucide:user</code>.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {diagramIconExamples.map((icon) => (
                  <button
                    key={icon.id}
                    type="button"
                    className="rounded border border-line bg-panel px-2 py-1 font-mono text-[10px] text-ink-secondary hover:border-brand-orange hover:bg-brand-hover hover:text-brand-orange"
                    title={icon.label}
                    onClick={() => onCopy(icon.id)}
                  >
                    {icon.id}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="mt-3 rounded-md border border-line bg-white px-3 py-3">
              <div className="flex items-start gap-2 text-[11px] leading-5 text-ink-secondary">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-brand-orange" />
                <p>Los iconos locales estan desactivados en la configuracion actual. Los diagramas se validaran sin recursos visuales enriquecidos.</p>
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

function DiagramOption({
  template,
  selected,
  allowed,
  onSelect,
}: {
  template: MermaidDiagramTemplate;
  selected: boolean;
  allowed: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "mb-1 w-full rounded-md border px-3 py-2 text-left transition last:mb-0",
        selected ? "border-brand-orange bg-brand-hover" : "border-line bg-white hover:bg-panel",
        allowed ? "" : "opacity-60",
      ].join(" ")}
      onClick={onSelect}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-semibold text-ink-primary">{template.label}</span>
        <span className={["shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold", template.maturity === "beta" ? "bg-amber-50 text-amber-700" : template.maturity === "advanced" ? "bg-brand-hover text-brand-orange" : "bg-panel text-ink-secondary"].join(" ")}>
          {maturityLabel(template)}
        </span>
      </span>
      <span className="mt-1 block text-[10px] leading-4 text-ink-secondary">{template.description}</span>
      <span className="mt-1 block text-[10px] leading-4 text-ink-secondary"><strong>Uso:</strong> {template.useWhen}</span>
      <span className="mt-1 block text-[10px] leading-4 text-ink-secondary"><strong>Evitar:</strong> {template.avoidWhen}</span>
      {allowed ? null : <span className="mt-1 block text-[10px] font-semibold text-brand-orange">Requiere ajustar el perfil en configuracion.</span>}
    </button>
  );
}

function InfoPill({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-panel px-2 py-2">
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase text-ink-secondary">
        <span className="text-brand-orange">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 truncate text-[11px] font-semibold text-ink-primary">{value}</p>
    </div>
  );
}

function ValidationState({ state }: { state: { status: "idle" | "validating" | "valid" | "invalid"; message: string | null } }) {
  if (state.status === "valid") return <ValidationMessage tone="success" message={state.message ?? "Diagrama valido."} />;
  if (state.status === "invalid") return <ValidationMessage tone="error" message={state.message ?? "No se pudo validar el diagrama."} />;
  if (state.status === "validating") return <p className="text-[11px] font-medium text-ink-secondary">Validando Mermaid...</p>;
  return <p className="text-[11px] leading-4 text-ink-secondary">La validacion se actualiza automaticamente al editar, pero valida manualmente antes de guardar.</p>;
}

function ValidationMessage({ tone, message }: { tone: "success" | "error" | "warning"; message: string }) {
  const className = tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-orange-200 bg-brand-hover text-brand-orange";
  const Icon = tone === "success" ? Check : AlertTriangle;
  return (
    <div className={["mt-2 flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold leading-4", className].join(" ")}>
      <Icon size={13} className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}

function findTemplateForCode(code: string | undefined) {
  const normalizedCode = (code ?? "").trim();
  if (!normalizedCode) return mermaidDiagramTemplates[0];
  const exact = mermaidDiagramTemplates.find((template) => template.code.trim() === normalizedCode);
  if (exact) return exact;
  const firstMeaningfulLine = normalizedCode
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("%%"));
  if (!firstMeaningfulLine) return mermaidDiagramTemplates[0];
  const normalizedType = firstMeaningfulLine.split(/\s+/)[0].toLowerCase();
  return mermaidDiagramTemplates.find((template) => template.diagramType.toLowerCase() === normalizedType)
    ?? mermaidDiagramTemplates.find((template) => template.code.trim().toLowerCase().startsWith(normalizedType))
    ?? mermaidDiagramTemplates[0];
}

function maturityLabel(template: MermaidDiagramTemplate) {
  if (template.maturity === "beta") return "Beta";
  if (template.maturity === "advanced") return "Avanzado";
  return "Estable";
}

function profileHelp(config: AiDiagramConfig) {
  if (config.visualProfile === "compatible") return "Modo conservador: evita iconos, imagenes y sintaxis beta para maximizar compatibilidad.";
  if (config.visualProfile === "advanced") return "Modo avanzado: permite recursos visuales locales y tipos beta con validacion previa.";
  return "Modo recomendado: iconos locales y diagramas visuales sin depender de CDN ni recursos remotos.";
}

function buildValidationText(validation: { status: "idle" | "validating" | "valid" | "invalid"; message: string | null; warnings: string[] }) {
  const parts = [validation.message, ...validation.warnings].filter((part): part is string => Boolean(part));
  return parts.join("\n");
}
