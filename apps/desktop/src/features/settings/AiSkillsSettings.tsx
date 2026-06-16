import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, FileText, ListFilter, Play, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { getAiSkill, listAiSkills, previewAiSkillSelection, validateAiSkill } from "../../lib/api/skills";
import type {
  AiSkillApplication,
  AiSkillDetail,
  AiSkillDiagnostic,
  AiSkillMode,
  AiSkillSelectionPreview,
  AiSkillSummary,
  AiSkillValidationResponse,
  MermaidDiagramType,
} from "../../types/domain";

type DetailTab = "summary" | "modes" | "instructions" | "manifest" | "examples" | "diagnostics";

export function AiSkillsSettings() {
  const [skills, setSkills] = useState<AiSkillSummary[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<AiSkillDetail | null>(null);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [runtime, setRuntime] = useState("all");
  const [detailTab, setDetailTab] = useState<DetailTab>("summary");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<AiSkillValidationResponse | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState("Crea una tabla Markdown comparando modo rapido y modo razonado.");
  const [previewAction, setPreviewAction] = useState("answer");
  const [preview, setPreview] = useState<AiSkillSelectionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAiSkills()
      .then((response) => {
        if (cancelled) return;
        setSkills(response.skills);
        setSelectedSkillId((current) => current ?? response.skills[0]?.id ?? null);
        setError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setError(error instanceof Error ? error.message : "No se pudieron cargar las skills de IA.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedSkillId) {
      setSelectedSkill(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setValidation(null);
    getAiSkill(selectedSkillId)
      .then((skill) => {
        if (cancelled) return;
        setSelectedSkill(skill);
        setDetailTab("summary");
        setError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setError(error instanceof Error ? error.message : "No se pudo abrir la skill seleccionada.");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSkillId]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    skills.forEach((skill) => skill.categories.forEach((item) => values.add(item)));
    return Array.from(values).sort((first, second) => first.localeCompare(second));
  }, [skills]);

  const filteredSkills = skills.filter((skill) => {
    if (category !== "all" && !skill.categories.includes(category)) return false;
    if (status !== "all" && skill.status !== status) return false;
    if (source !== "all" && skill.source !== source) return false;
    if (runtime === "enabled" && !skill.runtimeEnabled) return false;
    if (runtime === "visible" && skill.runtimeEnabled) return false;
    return true;
  });

  async function runValidation() {
    if (!selectedSkillId) return;
    const result = await validateAiSkill(selectedSkillId);
    setValidation(result);
    setSelectedSkill((skill) => skill ? { ...skill, diagnostics: result.diagnostics, status: result.status } : skill);
    setDetailTab("diagnostics");
  }

  async function runPreview() {
    setPreviewLoading(true);
    try {
      const result = await previewAiSkillSelection({
        prompt: previewPrompt,
        expectedAction: previewAction,
      });
      setPreview(result);
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <div className="grid min-h-[560px] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-hidden rounded-md border border-line bg-panel/40">
        <div className="border-b border-line bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-brand-orange" />
            <h3 className="text-[14px] font-semibold text-ink-primary">Skills de IA</h3>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-ink-secondary">Capacidades compactas incluidas con KnowNext.ai.</p>
          <p className="mt-2 rounded bg-panel px-2 py-1 text-[10px] font-semibold text-ink-secondary">Preparado para skills de usuario, sin importacion ni edicion activa.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 border-b border-line bg-white px-3 py-3">
          <FilterSelect label="Categoria" value={category} onChange={setCategory} options={[["all", "Todas"], ...categories.map((item) => [item, item] as [string, string])]} />
          <FilterSelect label="Estado" value={status} onChange={setStatus} options={[["all", "Todos"], ["valid", "Validas"], ["error", "Con errores"], ["draft", "Borrador"]]} />
          <FilterSelect label="Origen" value={source} onChange={setSource} options={[["all", "Todos"], ["base", "Base"], ["user", "Usuario"], ["imported", "Importada"]]} />
          <FilterSelect label="Runtime" value={runtime} onChange={setRuntime} options={[["all", "Todas"], ["enabled", "Activas"], ["visible", "Visibles"]]} />
        </div>
        <div className="max-h-[390px] overflow-y-auto p-2">
          {loading ? (
            <p className="px-2 py-4 text-[11px] text-ink-secondary">Cargando skills...</p>
          ) : filteredSkills.length ? (
            filteredSkills.map((skill) => (
              <button
                key={skill.id}
                type="button"
                className={[
                  "mb-1 w-full rounded-md border px-3 py-2 text-left transition last:mb-0",
                  selectedSkillId === skill.id ? "border-brand-orange bg-brand-hover" : "border-line bg-white hover:bg-panel",
                ].join(" ")}
                onClick={() => setSelectedSkillId(skill.id)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[11px] font-semibold text-ink-primary">{skill.name}</span>
                  <SkillBadge skill={skill} />
                </span>
                <span className="mt-1 block text-[10px] leading-4 text-ink-secondary">{skill.description}</span>
                <span className="mt-1 flex items-center justify-between text-[10px] text-ink-secondary">
                  <span>{skill.modes.length} modos</span>
                  <span>{skill.runtimeEnabled ? "Runtime activo" : "Visible"}</span>
                </span>
              </button>
            ))
          ) : (
            <p className="px-2 py-4 text-[11px] text-ink-secondary">No hay skills con estos filtros.</p>
          )}
        </div>
      </aside>

      <section className="min-h-0 overflow-hidden rounded-md border border-line bg-white">
        {error ? (
          <div className="m-4 rounded-md border border-orange-200 bg-brand-hover px-3 py-2 text-[11px] font-semibold text-brand-orange">{error}</div>
        ) : null}
        {selectedSkill ? (
          <div className="flex h-full min-h-0 flex-col">
            <header className="border-b border-line px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[16px] font-semibold text-ink-primary">{selectedSkill.name}</h3>
                    <SkillBadge skill={selectedSkill} />
                    <span className="rounded bg-panel px-1.5 py-0.5 text-[9px] font-semibold uppercase text-ink-secondary">Solo lectura</span>
                  </div>
                  <p className="mt-1 max-w-[760px] text-[11px] leading-5 text-ink-secondary">{selectedSkill.description}</p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange"
                  onClick={() => void runValidation()}
                >
                  <RefreshCw size={13} />
                  Validar skill
                </button>
              </div>
            </header>

            <nav className="flex h-9 shrink-0 border-b border-line bg-white" aria-label="Detalle de skill">
              {([
                ["summary", "Resumen"],
                ["modes", "Modos"],
                ["instructions", "Instrucciones"],
                ["manifest", "Manifest"],
                ["examples", "Ejemplos"],
                ["diagnostics", "Diagnostico"],
              ] as Array<[DetailTab, string]>).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={detailTab === id}
                  className={[
                    "relative border-r border-line px-3 text-[11px]",
                    detailTab === id ? "font-semibold text-ink-primary" : "text-ink-secondary hover:bg-panel hover:text-ink-primary",
                  ].join(" ")}
                  onClick={() => setDetailTab(id)}
                >
                  {label}
                  {detailTab === id ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-brand-orange" /> : null}
                </button>
              ))}
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {detailLoading ? (
                <p className="text-[11px] text-ink-secondary">Cargando detalle...</p>
              ) : detailTab === "summary" ? (
                <div className="space-y-4">
                  <SkillSummaryPanel skill={selectedSkill} />
                  <SelectionPreviewPanel
                    prompt={previewPrompt}
                    action={previewAction}
                    preview={preview}
                    loading={previewLoading}
                    onPromptChange={setPreviewPrompt}
                    onActionChange={setPreviewAction}
                    onRun={() => void runPreview()}
                  />
                </div>
              ) : detailTab === "modes" ? (
                <ModesPanel modes={selectedSkill.modes} mermaidCatalog={selectedSkill.mermaidCatalog} />
              ) : detailTab === "instructions" ? (
                <ReadonlyCodeBlock label="SKILL.md" value={selectedSkill.instructionsMarkdown} />
              ) : detailTab === "manifest" ? (
                <ReadonlyCodeBlock label="manifest.json" value={selectedSkill.manifestJson} />
              ) : detailTab === "examples" ? (
                <SkillExamples examples={selectedSkill.examples} />
              ) : (
                <DiagnosticsPanel diagnostics={validation?.diagnostics ?? selectedSkill.diagnostics} />
              )}
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-[420px] place-items-center text-center text-[11px] text-ink-secondary">
            <div>
              <ListFilter size={28} className="mx-auto mb-2 text-brand-orange" />
              Selecciona una skill para ver su contenido.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <label className="block text-[10px] font-semibold uppercase text-ink-secondary">
      {label}
      <select
        aria-label={`Filtrar por ${label.toLowerCase()}`}
        className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([id, text]) => (
          <option key={id} value={id}>{text}</option>
        ))}
      </select>
    </label>
  );
}

function SkillSummaryPanel({ skill }: { skill: AiSkillDetail }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <SummaryGroup title="Identidad" rows={[
        ["ID", skill.id],
        ["Version", skill.version],
        ["Origen", skill.source === "base" ? "Base incluida con KnowNext.ai" : skill.source],
        ["Visibilidad", skill.visibility === "readonly" ? "Solo lectura" : "Editable"],
        ["Runtime", skill.runtimeEnabled ? "Activo" : "Visible, no activo"],
      ]} />
      <SummaryGroup title="Capacidades" rows={[
        ["Categorias", skill.categories.join(", ")],
        ["Capacidades", skill.capabilities.join(", ")],
        ["Acciones", skill.outputActions.join(", ")],
        ["Modos", String(skill.modes.length)],
      ]} />
      {(skill.manifest.orchestratesSkills?.length || skill.manifest.auxiliarySkillCategories?.length || skill.manifest.requiredCapabilities?.length) ? (
        <SummaryGroup title="Coordinación" rows={[
          ["Skills auxiliares", skill.manifest.orchestratesSkills?.join(", ") || "No declaradas"],
          ["Categorías auxiliares", skill.manifest.auxiliarySkillCategories?.join(", ") || "No declaradas"],
          ["Capacidades requeridas", skill.manifest.requiredCapabilities?.join(", ") || "No declaradas"],
        ]} />
      ) : null}
      <section className="rounded-md border border-line bg-panel/40 px-3 py-3 lg:col-span-2">
        <div className="flex items-start gap-2">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand-orange" />
          <p className="text-[11px] leading-5 text-ink-secondary">
            Skill base incluida con KnowNext.ai. Define reglas e instrucciones, pero no concede permisos ni ejecuta acciones por si misma.
          </p>
        </div>
      </section>
    </div>
  );
}

function ModesPanel({ modes, mermaidCatalog }: { modes: AiSkillMode[]; mermaidCatalog: MermaidDiagramType[] }) {
  const families = useMemo(() => groupMermaidByFamily(mermaidCatalog), [mermaidCatalog]);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        {modes.map((mode) => (
          <section key={mode.id} className="rounded-md border border-line bg-white">
            <div className="border-b border-line px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[11px] font-semibold text-ink-primary">{mode.name}</h4>
                <span className="rounded bg-panel px-1.5 py-0.5 text-[9px] font-semibold uppercase text-ink-secondary">{mode.riskLevel}</span>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{mode.description}</p>
            </div>
            <div className="space-y-2 px-3 py-3 text-[10px] leading-4 text-ink-secondary">
              <ModeList title="Cuando usar" values={mode.whenToUse} />
              <ModeList title="Evitar" values={mode.whenNotToUse} />
              <p><span className="font-semibold text-ink-primary">Acciones:</span> {mode.supportedActions.join(", ")}</p>
              <p><span className="font-semibold text-ink-primary">Validadores:</span> {mode.validators.join(", ")}</p>
              <p><span className="font-semibold text-ink-primary">Capacidades:</span> {mode.requiresCapabilities.join(", ") || "No declaradas"}</p>
            </div>
          </section>
        ))}
      </div>
      {mermaidCatalog.length ? (
        <section className="rounded-md border border-line bg-panel/30 px-3 py-3">
          <h4 className="text-[11px] font-semibold text-ink-primary">Tipos Mermaid soportados</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {Object.entries(families).map(([family, types]) => (
              <div key={family} className="rounded-md border border-line bg-white px-3 py-2">
                <h5 className="text-[10px] font-semibold uppercase text-ink-secondary">{family}</h5>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {types.map((type) => (
                    <span key={type.id} className="rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] text-ink-secondary">
                      {type.id} · {type.maturity}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SelectionPreviewPanel({
  prompt,
  action,
  preview,
  loading,
  onPromptChange,
  onActionChange,
  onRun,
}: {
  prompt: string;
  action: string;
  preview: AiSkillSelectionPreview | null;
  loading: boolean;
  onPromptChange: (value: string) => void;
  onActionChange: (value: string) => void;
  onRun: () => void;
}) {
  return (
    <section className="rounded-md border border-line bg-white">
      <div className="border-b border-line px-3 py-2">
        <h4 className="text-[11px] font-semibold text-ink-primary">Probar seleccion</h4>
        <p className="mt-1 text-[10px] text-ink-secondary">Previsualiza candidatas, decision Rust y diagnostico sin ejecutar una respuesta IA.</p>
      </div>
      <div className="space-y-2 px-3 py-3">
        <textarea
          className="min-h-[72px] w-full rounded-md border border-line bg-white px-2 py-2 text-[11px] leading-5 text-ink-primary outline-none focus:border-brand-orange"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          aria-label="Prompt para probar seleccion"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-md border border-line bg-white px-2 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
            value={action}
            onChange={(event) => onActionChange(event.target.value)}
            aria-label="Accion esperada"
          >
            <option value="answer">answer</option>
            <option value="edit_document">edit_document</option>
            <option value="insert_diagram">insert_diagram</option>
            <option value="create_document">create_document</option>
          </select>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark"
            onClick={onRun}
            disabled={loading || !prompt.trim()}
          >
            <Play size={13} />
            {loading ? "Previsualizando..." : "Previsualizar seleccion"}
          </button>
        </div>
        {preview ? (
          <div className="grid gap-2 pt-2 text-[10px] leading-4 text-ink-secondary lg:grid-cols-3">
            <PreviewColumn title="Candidatas" values={preview.candidateSkills.map((skill) => skill.name)} />
            <PreviewColumn title="Aplicadas" values={preview.applications.map(applicationLabel)} />
            <PreviewColumn title="Diagnostico" values={preview.diagnostics.slice(0, 4).map((diagnostic) => `${diagnostic.title}${diagnostic.modeId ? ` · ${diagnostic.modeId}` : ""}`)} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PreviewColumn({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="rounded-md border border-line bg-panel/30 px-2 py-2">
      <h5 className="font-semibold text-ink-primary">{title}</h5>
      {values.length ? values.map((value) => <p key={value} className="mt-1">{value}</p>) : <p className="mt-1">Sin datos</p>}
    </div>
  );
}

function ModeList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <p className="font-semibold text-ink-primary">{title}</p>
      {values.length ? values.map((value) => <p key={value}>- {value}</p>) : <p>No declarado</p>}
    </div>
  );
}

function SummaryGroup({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <section className="rounded-md border border-line bg-white">
      <h4 className="border-b border-line px-3 py-2 text-[11px] font-semibold text-ink-primary">{title}</h4>
      <dl className="divide-y divide-line">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 px-3 py-2 text-[11px]">
            <dt className="font-semibold text-ink-secondary">{label}</dt>
            <dd className="min-w-0 break-words text-ink-primary">{value || "No declarado"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ReadonlyCodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-ink-secondary">
        <FileText size={14} className="text-brand-orange" />
        {label}
      </div>
      <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-panel/50 p-3 font-mono text-[11px] leading-5 text-ink-primary">
        {value}
      </pre>
    </section>
  );
}

function SkillExamples({ examples }: { examples: AiSkillDetail["examples"] }) {
  if (!examples.length) {
    return <p className="text-[11px] text-ink-secondary">Esta skill base no incluye ejemplos visibles.</p>;
  }
  return (
    <div className="space-y-3">
      {examples.map((example) => (
        <ReadonlyCodeBlock key={example.name} label={example.name} value={example.markdown} />
      ))}
    </div>
  );
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: AiSkillDiagnostic[] }) {
  if (!diagnostics.length) {
    return <p className="text-[11px] text-ink-secondary">Sin diagnostico disponible.</p>;
  }
  return (
    <div className="space-y-2">
      {diagnostics.map((diagnostic) => {
        const tone = diagnostic.severity === "error" || diagnostic.status === "error" ? "error" : diagnostic.severity === "warning" || diagnostic.status === "warning" || diagnostic.status === "rejected" ? "warning" : "success";
        return (
          <div
            key={`${diagnostic.skillId}-${diagnostic.status}-${diagnostic.title}-${diagnostic.modeId ?? ""}`}
            className={[
              "rounded-md border px-3 py-2 text-[11px] leading-5",
              tone === "error" ? "border-orange-200 bg-brand-hover text-brand-orange" : tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700",
            ].join(" ")}
          >
            <div className="flex items-center gap-2 font-semibold">
              {tone === "error" ? <AlertTriangle size={13} /> : <Check size={13} />}
              {diagnostic.title}
            </div>
            <p className="mt-1 font-mono text-[10px]">
              {diagnostic.skillId}{diagnostic.modeId ? ` / ${diagnostic.modeId}` : ""}{diagnostic.phase ? ` · ${diagnostic.phase}` : ""}
            </p>
            {diagnostic.validatorId ? <p className="mt-1">Validador: {diagnostic.validatorId}</p> : null}
            {(diagnostic.notes ?? []).map((note) => (
              <p key={note} className="mt-1">{note}</p>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SkillBadge({ skill }: { skill: Pick<AiSkillSummary, "source" | "status" | "runtimeEnabled"> }) {
  const statusClass = skill.status === "error" ? "bg-brand-hover text-brand-orange" : skill.runtimeEnabled ? "bg-emerald-50 text-emerald-700" : "bg-panel text-ink-secondary";
  return (
    <span className={["shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase", statusClass].join(" ")}>
      {skill.source === "base" ? "Base" : skill.source}
    </span>
  );
}

function groupMermaidByFamily(catalog: MermaidDiagramType[]) {
  return catalog.reduce<Record<string, MermaidDiagramType[]>>((acc, item) => {
    acc[item.family] = acc[item.family] ?? [];
    acc[item.family].push(item);
    return acc;
  }, {});
}

function applicationLabel(application: AiSkillApplication) {
  return `${application.skillId.replace(/^knownext\./, "")} / ${application.modeId}`;
}
