import { useEffect, useState } from "react";
import { Brain, Eye, FolderOpen, KeyRound, Languages, ListChecks, Trash2, X } from "lucide-react";
import type { AiConfigStatus, AiIndexStatusResponse, AppearanceConfig, DiagnosticsConfig } from "../../types/domain";
import type { TraceLogStatus } from "../../lib/runtime/logging";

type AppSettingsSection = "appearance" | "ai" | "diagnostics";

type AppSettingsDialogProps = {
  open: boolean;
  appearance: AppearanceConfig;
  diagnostics: DiagnosticsConfig;
  ai: AiConfigStatus;
  aiIndexStatus: AiIndexStatusResponse | null;
  traceLogStatus: TraceLogStatus | null;
  onClose: () => void;
  onAppearanceChange: (appearance: Partial<AppearanceConfig>) => void;
  onDiagnosticsChange: (diagnostics: Partial<DiagnosticsConfig>) => void;
  onAiChange: (ai: AiConfigStatus) => void;
  onSaveOpenAiKey: (apiKey: string) => void;
  onDeleteOpenAiKey: () => void;
  onRebuildAiIndex: () => void;
  onDeleteAiIndex: () => void;
  onOpenTraceLogFolder: () => void;
};

export function AppSettingsDialog({
  open,
  appearance,
  diagnostics,
  ai,
  aiIndexStatus,
  traceLogStatus,
  onClose,
  onAppearanceChange,
  onDiagnosticsChange,
  onAiChange,
  onSaveOpenAiKey,
  onDeleteOpenAiKey,
  onRebuildAiIndex,
  onDeleteAiIndex,
  onOpenTraceLogFolder,
}: AppSettingsDialogProps) {
  const [activeSection, setActiveSection] = useStableSection(open);
  const text = settingsCopy[appearance.language];
  const sections: Array<{ id: AppSettingsSection; label: string; description: string; icon: typeof Eye }> = [
    { id: "appearance", label: text.appearanceNav, description: text.appearanceNavDescription, icon: Eye },
    { id: "ai", label: text.aiNav, description: text.aiNavDescription, icon: Brain },
    { id: "diagnostics", label: text.diagnosticsNav, description: text.diagnosticsNavDescription, icon: ListChecks },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/20 px-4 py-6">
      <section
        className="flex max-h-[min(680px,calc(100vh-48px))] w-[min(760px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-settings-title"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id="app-settings-title" className="text-[15px] font-semibold text-ink-primary">{text.title}</h2>
            <p className="mt-1 text-[11px] text-ink-secondary">{text.subtitle}</p>
          </div>
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
            data-tooltip={text.close}
            aria-label={text.closeSettings}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[210px_minmax(0,1fr)]">
          <nav className="border-r border-line bg-panel p-2" aria-label={text.sectionsLabel}>
            {sections.map((section) => (
              <button
                key={section.id}
                className={[
                  "flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition",
                  activeSection === section.id ? "bg-brand-hover text-brand-orange" : "text-ink-primary hover:bg-white",
                ].join(" ")}
                onClick={() => setActiveSection(section.id)}
              >
                <section.icon size={15} className="mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold">{section.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-ink-secondary">{section.description}</span>
                </span>
              </button>
            ))}
          </nav>

          <div className="min-h-0 overflow-y-auto px-6 py-5">
            {activeSection === "appearance" ? (
              <AppearanceSettings appearance={appearance} text={text} onAppearanceChange={onAppearanceChange} />
            ) : activeSection === "ai" ? (
              <AiSettings
                ai={ai}
                aiIndexStatus={aiIndexStatus}
                text={text}
                onAiChange={onAiChange}
                onSaveOpenAiKey={onSaveOpenAiKey}
                onDeleteOpenAiKey={onDeleteOpenAiKey}
                onRebuildAiIndex={onRebuildAiIndex}
                onDeleteAiIndex={onDeleteAiIndex}
              />
            ) : (
              <DiagnosticsSettings
                diagnostics={diagnostics}
                traceLogStatus={traceLogStatus}
                text={text}
                onDiagnosticsChange={onDiagnosticsChange}
                onOpenTraceLogFolder={onOpenTraceLogFolder}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function AppearanceSettings({
  appearance,
  text,
  onAppearanceChange,
}: {
  appearance: AppearanceConfig;
  text: SettingsCopy;
  onAppearanceChange: (appearance: Partial<AppearanceConfig>) => void;
}) {
  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center gap-2">
          <Languages size={16} className="text-brand-orange" />
          <h3 className="text-[13px] font-semibold text-ink-primary">{text.appearanceHeading}</h3>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
          {text.appearanceDescription}
        </p>
      </section>

      <label className="block">
        <span className="text-[11px] font-medium text-ink-secondary">{text.languageLabel}</span>
        <select
          className="mt-2 h-9 w-full rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
          value={appearance.language}
          onChange={(event) => onAppearanceChange({ language: event.target.value as AppearanceConfig["language"] })}
        >
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </label>

      <div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="app-zoom" className="text-[11px] font-medium text-ink-secondary">
            {text.zoomLabel}
          </label>
          <span className="rounded border border-line bg-panel px-2 py-1 font-mono text-[10px] text-ink-secondary">
            {appearance.zoomPercent}%
          </span>
        </div>
        <input
          id="app-zoom"
          className="mt-3 w-full cursor-default accent-brand-orange"
          type="range"
          min={85}
          max={125}
          step={5}
          value={appearance.zoomPercent}
          onChange={(event) => onAppearanceChange({ zoomPercent: Number(event.target.value) })}
        />
        <div className="mt-1 flex justify-between text-[10px] text-ink-secondary">
          <span>{text.zoomReduce}</span>
          <span>{text.zoomNormal}</span>
          <span>{text.zoomIncrease}</span>
        </div>
      </div>
    </div>
  );
}

function AiSettings({
  ai,
  aiIndexStatus,
  text,
  onAiChange,
  onSaveOpenAiKey,
  onDeleteOpenAiKey,
  onRebuildAiIndex,
  onDeleteAiIndex,
}: {
  ai: AiConfigStatus;
  aiIndexStatus: AiIndexStatusResponse | null;
  text: SettingsCopy;
  onAiChange: (ai: AiConfigStatus) => void;
  onSaveOpenAiKey: (apiKey: string) => void;
  onDeleteOpenAiKey: () => void;
  onRebuildAiIndex: () => void;
  onDeleteAiIndex: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const statusLabel = ai.openaiKeyConfigured ? text.aiConfigured : text.aiMissingKey;
  const indexStatus = aiIndexStatus?.status ?? ai.rag.status;

  function updatePermissions(nextPermissions: Partial<AiConfigStatus["permissions"]>) {
    onAiChange({
      ...ai,
      permissions: {
        ...ai.permissions,
        ...nextPermissions,
      },
    });
  }

  function updateRag(enabled: boolean) {
    onAiChange({
      ...ai,
      rag: {
        ...ai.rag,
        enabled,
      },
    });
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-brand-orange" />
          <h3 className="text-[13px] font-semibold text-ink-primary">{text.aiHeading}</h3>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.aiDescription}</p>
      </section>

      <div className="rounded-md border border-line px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-ink-primary">OpenAI</p>
            <p className="mt-1 text-[11px] text-ink-secondary">{statusLabel}{ai.openaiKeyPreview ? ` · ${ai.openaiKeyPreview}` : ""}</p>
          </div>
          <span className={["rounded px-2 py-1 text-[10px] font-semibold", ai.openaiKeyConfigured ? "bg-brand-hover text-brand-orange" : "bg-panel text-ink-secondary"].join(" ")}>
            {ai.openaiKeyConfigured ? text.enabled : text.disabled}
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="h-9 min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-[11px] outline-none focus:border-brand-orange"
            type="password"
            value={apiKey}
            placeholder={text.openAiKeyPlaceholder}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            disabled={!apiKey.trim()}
            onClick={() => {
              onSaveOpenAiKey(apiKey);
              setApiKey("");
            }}
          >
            <KeyRound size={14} />
            {text.saveKey}
          </button>
          <button
            className="grid h-9 w-9 place-items-center rounded-md border border-line text-ink-secondary hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            disabled={!ai.openaiKeyConfigured}
            data-tooltip={text.deleteKey}
            aria-label={text.deleteKey}
            onClick={onDeleteOpenAiKey}
          >
            <Trash2 size={14} />
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-ink-secondary">{text.aiKeyPrivacy}</p>
      </div>

      <section className="space-y-2">
        <p className="text-[11px] font-semibold text-ink-primary">{text.aiPermissionsHeading}</p>
        <ToggleRow label={text.createFolders} enabled={ai.permissions.createFolders} onToggle={() => updatePermissions({ createFolders: !ai.permissions.createFolders })} />
        <ToggleRow label={text.createDocuments} enabled={ai.permissions.createDocuments} onToggle={() => updatePermissions({ createDocuments: !ai.permissions.createDocuments })} />
        <ToggleRow
          label={text.deleteDocuments}
          enabled={ai.permissions.deleteDocumentsAndFolders}
          onToggle={() => updatePermissions({ deleteDocumentsAndFolders: !ai.permissions.deleteDocumentsAndFolders })}
        />
      </section>

      <section className="rounded-md border border-line px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-ink-primary">{text.ragHeading}</p>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.ragDescription}</p>
            <p className="mt-2 text-[10px] text-ink-secondary">{text.ragStatus}: {describeIndexStatus(indexStatus)}</p>
          </div>
          <Switch enabled={ai.rag.enabled} label={text.ragHeading} onToggle={() => updateRag(!ai.rag.enabled)} />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            className="h-8 rounded-md border border-brand-orange px-3 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover disabled:opacity-50"
            disabled={!ai.rag.enabled || !ai.openaiKeyConfigured}
            onClick={onRebuildAiIndex}
          >
            {text.rebuildIndex}
          </button>
          <button
            className="h-8 rounded-md border border-line px-3 text-[11px] text-ink-secondary hover:bg-panel disabled:opacity-50"
            disabled={!ai.rag.vectorStoreId && !aiIndexStatus?.vectorStoreId}
            onClick={onDeleteAiIndex}
          >
            {text.deleteIndex}
          </button>
        </div>
      </section>
    </div>
  );
}

function DiagnosticsSettings({
  diagnostics,
  traceLogStatus,
  text,
  onDiagnosticsChange,
  onOpenTraceLogFolder,
}: {
  diagnostics: DiagnosticsConfig;
  traceLogStatus: TraceLogStatus | null;
  text: SettingsCopy;
  onDiagnosticsChange: (diagnostics: Partial<DiagnosticsConfig>) => void;
  onOpenTraceLogFolder: () => void;
}) {
  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center gap-2">
          <ListChecks size={16} className="text-brand-orange" />
          <h3 className="text-[13px] font-semibold text-ink-primary">{text.diagnosticsHeading}</h3>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
          {text.diagnosticsDescription}
        </p>
      </section>

      <div className="flex items-center justify-between gap-4 rounded-md border border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-ink-primary">{text.traceToggleLabel}</p>
          <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
            {text.traceToggleDescription}
          </p>
        </div>
        <button
          className={[
            "relative h-6 w-11 shrink-0 rounded-full transition",
            diagnostics.traceLoggingEnabled ? "bg-brand-orange" : "bg-line",
          ].join(" ")}
          role="switch"
          aria-checked={diagnostics.traceLoggingEnabled}
          aria-label={text.traceToggleAria}
          onClick={() => onDiagnosticsChange({ traceLoggingEnabled: !diagnostics.traceLoggingEnabled })}
        >
          <span
            className={[
              "absolute top-1 h-4 w-4 rounded-full bg-white shadow-subtle transition",
              diagnostics.traceLoggingEnabled ? "left-6" : "left-1",
            ].join(" ")}
          />
        </button>
      </div>

      {diagnostics.traceLoggingEnabled ? (
        <div className="rounded-md border border-orange-200 bg-brand-hover px-4 py-3">
          <p className="text-[11px] font-semibold text-ink-primary">{text.logFolderLabel}</p>
          <p className="mt-1 break-all font-mono text-[10px] leading-5 text-ink-secondary">
            {traceLogStatus?.folderPath ?? text.preparingLogFolder}
          </p>
          <button
            className="mt-3 inline-flex h-8 items-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!traceLogStatus?.folderPath}
            onClick={onOpenTraceLogFolder}
          >
            <FolderOpen size={14} />
            {text.openLogFolder}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ToggleRow({ label, enabled, onToggle }: { label: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-line px-4 py-3">
      <span className="text-[11px] font-medium text-ink-primary">{label}</span>
      <Switch enabled={enabled} label={label} onToggle={onToggle} />
    </div>
  );
}

function Switch({ label, enabled, onToggle }: { label: string; enabled: boolean; onToggle: () => void }) {
  return (
    <button
      className={["relative h-6 w-11 shrink-0 rounded-full transition", enabled ? "bg-brand-orange" : "bg-line"].join(" ")}
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onToggle}
    >
      <span
        className={[
          "absolute top-1 h-4 w-4 rounded-full bg-white shadow-subtle transition",
          enabled ? "left-6" : "left-1",
        ].join(" ")}
      />
    </button>
  );
}

function describeIndexStatus(status: AiIndexStatusResponse["status"]) {
  if (status === "indexing") return "Indexando";
  if (status === "updated") return "Actualizado";
  if (status === "error") return "Error";
  return "No indexado";
}

type SettingsCopy = typeof settingsCopy.es;

const settingsCopy = {
  es: {
    title: "Configuración de la app",
    subtitle: "Ajustes locales de interfaz y diagnóstico.",
    close: "Cerrar",
    closeSettings: "Cerrar configuración",
    sectionsLabel: "Apartados de configuración",
    appearanceNav: "Apariencia",
    appearanceNavDescription: "Idioma y escala visual",
    aiNav: "IA",
    aiNavDescription: "OpenAI y permisos",
    diagnosticsNav: "Trazas",
    diagnosticsNavDescription: "Registro local de errores",
    appearanceHeading: "Apariencia",
    appearanceDescription: "Ajusta cómo se presenta la interfaz en este equipo.",
    languageLabel: "Idioma",
    zoomLabel: "Zoom de la interfaz",
    zoomReduce: "Reducir",
    zoomNormal: "Normal",
    zoomIncrease: "Ampliar",
    aiHeading: "IA documental",
    aiDescription: "Configura OpenAI, permisos de acciones y consulta semántica del proyecto.",
    aiConfigured: "Clave configurada",
    aiMissingKey: "Sin clave OpenAI",
    enabled: "Activo",
    disabled: "Inactivo",
    openAiKeyPlaceholder: "sk-...",
    saveKey: "Guardar",
    deleteKey: "Eliminar clave",
    aiKeyPrivacy: "La clave se guarda localmente y no se escribe en proyectos, logs ni trazas.",
    aiPermissionsHeading: "Permisos de acciones",
    createFolders: "Crear carpetas",
    createDocuments: "Crear documentos",
    deleteDocuments: "Eliminar documentos y carpetas",
    ragHeading: "Indexar documentación del proyecto",
    ragDescription: "Permite consultar el proyecto completo con búsqueda semántica. El contenido Markdown se enviará a OpenAI para indexación.",
    ragStatus: "Estado",
    rebuildIndex: "Reindexar ahora",
    deleteIndex: "Eliminar índice",
    diagnosticsHeading: "Trazas",
    diagnosticsDescription: "Registra errores de la aplicación en un archivo local dedicado para revisar incidencias.",
    traceToggleLabel: "Registro de trazas",
    traceToggleDescription: "Los errores se registran siempre. Actívalo para conservar también trazas informativas de diagnóstico.",
    traceToggleAria: "Activar registro de trazas",
    logFolderLabel: "Carpeta de logs",
    preparingLogFolder: "Preparando carpeta de logs",
    openLogFolder: "Abrir carpeta en el explorador",
  },
  en: {
    title: "App settings",
    subtitle: "Local interface and diagnostics settings.",
    close: "Close",
    closeSettings: "Close settings",
    sectionsLabel: "Settings sections",
    appearanceNav: "Appearance",
    appearanceNavDescription: "Language and visual scale",
    aiNav: "AI",
    aiNavDescription: "OpenAI and permissions",
    diagnosticsNav: "Traces",
    diagnosticsNavDescription: "Local error logging",
    appearanceHeading: "Appearance",
    appearanceDescription: "Adjust how the interface is presented on this computer.",
    languageLabel: "Language",
    zoomLabel: "Interface zoom",
    zoomReduce: "Reduce",
    zoomNormal: "Normal",
    zoomIncrease: "Increase",
    aiHeading: "Documentation AI",
    aiDescription: "Configure OpenAI, action permissions, and semantic project search.",
    aiConfigured: "Key configured",
    aiMissingKey: "No OpenAI key",
    enabled: "Enabled",
    disabled: "Disabled",
    openAiKeyPlaceholder: "sk-...",
    saveKey: "Save",
    deleteKey: "Delete key",
    aiKeyPrivacy: "The key is stored locally and is not written to projects, logs, or traces.",
    aiPermissionsHeading: "Action permissions",
    createFolders: "Create folders",
    createDocuments: "Create documents",
    deleteDocuments: "Delete documents and folders",
    ragHeading: "Index project documentation",
    ragDescription: "Allows project-wide semantic search. Markdown content will be sent to OpenAI for indexing.",
    ragStatus: "Status",
    rebuildIndex: "Reindex now",
    deleteIndex: "Delete index",
    diagnosticsHeading: "Traces",
    diagnosticsDescription: "Record application errors in a dedicated local file for troubleshooting.",
    traceToggleLabel: "Trace logging",
    traceToggleDescription: "Errors are always logged. Enable this to also keep informational diagnostic traces.",
    traceToggleAria: "Enable trace logging",
    logFolderLabel: "Log folder",
    preparingLogFolder: "Preparing log folder",
    openLogFolder: "Open folder in Explorer",
  },
};

function useStableSection(open: boolean): [AppSettingsSection, (section: AppSettingsSection) => void] {
  const [activeSection, setActiveSection] = useState<AppSettingsSection>("appearance");

  useEffect(() => {
    if (open) setActiveSection("appearance");
  }, [open]);

  return [activeSection, setActiveSection];
}
