import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Activity, Brain, Check, ChevronDown, Copy, Eye, FolderOpen, Gauge, Globe2, Image as ImageIcon, KeyRound, Languages, ListChecks, Mic, Monitor, Moon, Paintbrush, RefreshCw, RotateCcw, Server, ShieldCheck, Sun, Trash2, Underline, X } from "lucide-react";
import { defaultAiConfig } from "../../lib/api/config";
import { accentPalettes } from "../../lib/theme/appearance";
import type { AiConfigStatus, AiIndexStatusResponse, AiModelId, AiTranscriptionLanguage, AiVisionModelId, AppearanceAccentColor, AppearanceConfig, AppearanceThemeMode, DiagnosticsConfig } from "../../types/domain";
import type { TraceLogStatus } from "../../lib/runtime/logging";
import type { BackendPortConfig, RuntimeServicesStatus } from "../../lib/runtime/services";

type AppSettingsSection = "services" | "appearance" | "ai" | "diagnostics";

type AppSettingsDialogProps = {
  open: boolean;
  appearance: AppearanceConfig;
  diagnostics: DiagnosticsConfig;
  ai: AiConfigStatus;
  aiIndexStatus: AiIndexStatusResponse | null;
  traceLogStatus: TraceLogStatus | null;
  runtimeServicesStatus: RuntimeServicesStatus | null;
  runtimeServicesRefreshing: boolean;
  onClose: () => void;
  onAppearanceChange: (appearance: Partial<AppearanceConfig>) => void;
  onDiagnosticsChange: (diagnostics: Partial<DiagnosticsConfig>) => void;
  onAiChange: (ai: AiConfigStatus) => void;
  onSaveOpenAiKey: (apiKey: string) => void;
  onDeleteOpenAiKey: () => void;
  onRebuildAiIndex: () => void;
  onReindexImages: () => void;
  onDeleteAiIndex: () => void;
  onOpenTraceLogFolder: () => void;
  onRefreshRuntimeServices: () => void;
  onRestartBackendService: () => void;
  onUpdateBackendPortConfig: (config: BackendPortConfig) => void;
};

const aiModelIds: AiModelId[] = ["gpt-5.4-mini", "gpt-5.4", "gpt-5.5", "gpt-5.4-nano"];
const aiVisionModelIds: AiVisionModelId[] = ["gpt-5.4-mini", "gpt-5.4", "gpt-5.5"];
const transcriptionLanguages: AiTranscriptionLanguage[] = ["auto", "es", "en", "fr", "de", "it", "pt", "ca", "eu", "gl"];

const aiModelMeter: Record<AiModelId, { intelligence: number; cost: number }> = {
  "gpt-5.5": { intelligence: 4, cost: 4 },
  "gpt-5.4": { intelligence: 3, cost: 3 },
  "gpt-5.4-mini": { intelligence: 3, cost: 2 },
  "gpt-5.4-nano": { intelligence: 2, cost: 1 },
};

export function AppSettingsDialog({
  open,
  appearance,
  diagnostics,
  ai,
  aiIndexStatus,
  traceLogStatus,
  runtimeServicesStatus,
  runtimeServicesRefreshing,
  onClose,
  onAppearanceChange,
  onDiagnosticsChange,
  onAiChange,
  onSaveOpenAiKey,
  onDeleteOpenAiKey,
  onRebuildAiIndex,
  onReindexImages,
  onDeleteAiIndex,
  onOpenTraceLogFolder,
  onRefreshRuntimeServices,
  onRestartBackendService,
  onUpdateBackendPortConfig,
}: AppSettingsDialogProps) {
  const [activeSection, setActiveSection] = useStableSection(open);
  const text = settingsCopy[appearance.language];
  const sections: Array<{ id: AppSettingsSection; label: string; description: string; icon: typeof Eye }> = [
    { id: "services", label: text.servicesNav, description: text.servicesNavDescription, icon: Activity },
    { id: "appearance", label: text.appearanceNav, description: text.appearanceNavDescription, icon: Eye },
    { id: "ai", label: text.aiNav, description: text.aiNavDescription, icon: Brain },
    { id: "diagnostics", label: text.diagnosticsNav, description: text.diagnosticsNavDescription, icon: ListChecks },
  ];

  if (!open) return null;

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[95] grid place-items-center bg-black/20 px-4 py-6">
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

        <div className="flex min-h-0 flex-1 flex-col">
          <nav
            className="shrink-0 border-b border-line bg-panel px-4 py-2"
            aria-label={text.sectionsLabel}
            role="tablist"
          >
            <div className="flex gap-1 overflow-x-auto">
              {sections.map((section) => (
                <button
                  key={section.id}
                  id={`app-settings-tab-${section.id}`}
                  className={[
                    "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-[11px] font-semibold transition",
                    activeSection === section.id
                      ? "border-line bg-white text-brand-orange shadow-subtle"
                      : "border-transparent text-ink-secondary hover:bg-white hover:text-ink-primary",
                  ].join(" ")}
                  role="tab"
                  aria-selected={activeSection === section.id}
                  aria-controls={`app-settings-panel-${section.id}`}
                  data-tooltip={section.description}
                  data-tooltip-placement="bottom"
                  onClick={() => setActiveSection(section.id)}
                >
                  <section.icon size={14} className="shrink-0" />
                  <span>{section.label}</span>
                </button>
              ))}
            </div>
          </nav>

          <div
            id={`app-settings-panel-${activeSection}`}
            className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
            role="tabpanel"
            aria-labelledby={`app-settings-tab-${activeSection}`}
          >
            {activeSection === "services" ? (
              <ServicesSettings
                runtimeServicesStatus={runtimeServicesStatus}
                refreshing={runtimeServicesRefreshing}
                text={text}
                onRefresh={onRefreshRuntimeServices}
                onRestartBackendService={onRestartBackendService}
                onUpdateBackendPortConfig={onUpdateBackendPortConfig}
              />
            ) : activeSection === "appearance" ? (
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
                onReindexImages={onReindexImages}
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

function normalizeAiStatus(ai: Partial<AiConfigStatus> | null | undefined): AiConfigStatus {
  const permissions = ai?.permissions as Partial<AiConfigStatus["permissions"]> | undefined;
  const rag = ai?.rag as Partial<AiConfigStatus["rag"]> | undefined;
  const vision = ai?.vision as Partial<AiConfigStatus["vision"]> | undefined;
  const agentic = ai?.agentic as Partial<AiConfigStatus["agentic"]> | undefined;
  const transcription = ai?.transcription as Partial<AiConfigStatus["transcription"]> | undefined;

  return {
    provider: "openai",
    model: normalizeAiModel(ai?.model),
    permissions: {
      editDocuments: permissions?.editDocuments ?? defaultAiConfig.permissions.editDocuments,
      createFolders: permissions?.createFolders ?? defaultAiConfig.permissions.createFolders,
      createDocuments: permissions?.createDocuments ?? defaultAiConfig.permissions.createDocuments,
      deleteDocumentsAndFolders: permissions?.deleteDocumentsAndFolders ?? defaultAiConfig.permissions.deleteDocumentsAndFolders,
    },
    rag: {
      enabled: rag?.enabled ?? defaultAiConfig.rag.enabled,
      vectorStoreId: rag?.vectorStoreId ?? defaultAiConfig.rag.vectorStoreId,
      lastIndexedAt: rag?.lastIndexedAt ?? defaultAiConfig.rag.lastIndexedAt,
      status: normalizeRagStatus(rag?.status),
      error: rag?.error ?? defaultAiConfig.rag.error,
    },
    vision: {
      enabled: vision?.enabled ?? defaultAiConfig.vision.enabled,
      model: normalizeAiVisionModel(vision?.model),
      imageIndexingEnabled: vision?.imageIndexingEnabled ?? defaultAiConfig.vision.imageIndexingEnabled,
      maxImagesPerPrompt: clampSettingsNumber(vision?.maxImagesPerPrompt, 1, 12, defaultAiConfig.vision.maxImagesPerPrompt),
      maxImageSizeMb: clampSettingsNumber(vision?.maxImageSizeMb, 1, 50, defaultAiConfig.vision.maxImageSizeMb),
      detail: normalizeVisionDetail(vision?.detail),
      storeVisualDescriptions: vision?.storeVisualDescriptions ?? defaultAiConfig.vision.storeVisualDescriptions,
    },
    agentic: {
      depth: normalizeAgenticDepth(agentic?.depth),
      webResearchEnabled: agentic?.webResearchEnabled ?? defaultAiConfig.agentic.webResearchEnabled,
      confirmBeforeApplying: agentic?.confirmBeforeApplying ?? defaultAiConfig.agentic.confirmBeforeApplying,
      maxSteps: clampSettingsNumber(agentic?.maxSteps, 1, 12, defaultAiConfig.agentic.maxSteps),
      maxDocuments: clampSettingsNumber(agentic?.maxDocuments, 1, 30, defaultAiConfig.agentic.maxDocuments),
      maxEstimatedCostEur: clampSettingsNumber(agentic?.maxEstimatedCostEur, 0.1, 25, defaultAiConfig.agentic.maxEstimatedCostEur),
      maxSources: clampSettingsNumber(agentic?.maxSources, 1, 20, defaultAiConfig.agentic.maxSources),
    },
    transcription: normalizeTranscription(transcription),
    openaiKeyConfigured: Boolean(ai?.openaiKeyConfigured),
    openaiKeyPreview: ai?.openaiKeyPreview ?? null,
  };
}

function normalizeAiModel(model: unknown): AiModelId {
  return aiModelIds.includes(model as AiModelId) ? model as AiModelId : defaultAiConfig.model;
}

function normalizeAiVisionModel(model: unknown): AiVisionModelId {
  return aiVisionModelIds.includes(model as AiVisionModelId) ? model as AiVisionModelId : defaultAiConfig.vision.model;
}

function normalizeRagStatus(status: unknown): AiConfigStatus["rag"]["status"] {
  return ["not-indexed", "indexing", "updated", "error"].includes(String(status))
    ? status as AiConfigStatus["rag"]["status"]
    : defaultAiConfig.rag.status;
}

function normalizeVisionDetail(detail: unknown): AiConfigStatus["vision"]["detail"] {
  return ["auto", "low", "high"].includes(String(detail))
    ? detail as AiConfigStatus["vision"]["detail"]
    : defaultAiConfig.vision.detail;
}

function normalizeAgenticDepth(depth: unknown): AiConfigStatus["agentic"]["depth"] {
  return ["quick", "guided", "deep", "bounded_autonomous"].includes(String(depth))
    ? depth as AiConfigStatus["agentic"]["depth"]
    : defaultAiConfig.agentic.depth;
}

function normalizeTranscription(transcription: Partial<AiConfigStatus["transcription"]> | undefined): AiConfigStatus["transcription"] {
  const favorites = Array.isArray(transcription?.favoriteLanguages)
    ? transcription.favoriteLanguages.filter(isTranscriptionLanguage)
    : defaultAiConfig.transcription.favoriteLanguages;
  const uniqueFavorites = Array.from(new Set(favorites.length ? favorites : defaultAiConfig.transcription.favoriteLanguages));
  return {
    enabled: transcription?.enabled ?? defaultAiConfig.transcription.enabled,
    model: transcription?.model === "gpt-realtime-whisper" ? transcription.model : defaultAiConfig.transcription.model,
    defaultTarget: transcription?.defaultTarget === "document" ? "document" : "prompt",
    defaultLanguage: isTranscriptionLanguage(transcription?.defaultLanguage) ? transcription.defaultLanguage : defaultAiConfig.transcription.defaultLanguage,
    favoriteLanguages: uniqueFavorites.slice(0, 6),
  };
}

function isTranscriptionLanguage(language: unknown): language is AiTranscriptionLanguage {
  return transcriptionLanguages.includes(language as AiTranscriptionLanguage);
}

function clampSettingsNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function ServicesSettings({
  runtimeServicesStatus,
  refreshing,
  text,
  onRefresh,
  onRestartBackendService,
  onUpdateBackendPortConfig,
}: {
  runtimeServicesStatus: RuntimeServicesStatus | null;
  refreshing: boolean;
  text: SettingsCopy;
  onRefresh: () => void;
  onRestartBackendService: () => void;
  onUpdateBackendPortConfig: (config: BackendPortConfig) => void;
}) {
  const services = runtimeServicesStatus?.services ?? [];
  const backend = services.find((service) => service.id === "backend");

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-brand-orange" />
          <h3 className="text-[13px] font-semibold text-ink-primary">{text.servicesHeading}</h3>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.servicesDescription}</p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-panel px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold text-ink-primary">{text.servicesSummary}</p>
          <p className="mt-1 text-[10px] text-ink-secondary">
            {runtimeServicesStatus?.checkedAt ? `${text.lastChecked}: ${formatDateTime(runtimeServicesStatus.checkedAt)}` : text.servicesPending}
          </p>
        </div>
        <button
          className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {text.refreshServices}
        </button>
      </div>

      {backend ? (
        <ServiceCard
          service={backend}
          text={text}
          refreshing={refreshing}
          onRestartBackendService={onRestartBackendService}
          onUpdateBackendPortConfig={onUpdateBackendPortConfig}
        />
      ) : (
        <div className="rounded-md border border-line px-4 py-3 text-[11px] text-ink-secondary">{text.servicesPending}</div>
      )}
    </div>
  );
}

function ServiceCard({
  service,
  text,
  refreshing,
  onRestartBackendService,
  onUpdateBackendPortConfig,
}: {
  service: RuntimeServicesStatus["services"][number];
  text: SettingsCopy;
  refreshing: boolean;
  onRestartBackendService: () => void;
  onUpdateBackendPortConfig: (config: BackendPortConfig) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [portMode, setPortMode] = useState<BackendPortConfig["mode"]>(service.portConfig?.mode ?? "automatic");
  const [fixedPort, setFixedPort] = useState(service.portConfig?.port ?? service.port ?? 8765);
  const [autoStart, setAutoStart] = useState(service.portConfig?.autoPortStart ?? 8765);
  const [autoEnd, setAutoEnd] = useState(service.portConfig?.autoPortEnd ?? 8799);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const diagnostic = buildServiceDiagnostic(service);

  useEffect(() => {
    setPortMode(service.portConfig?.mode ?? "automatic");
    setFixedPort(service.portConfig?.port ?? service.port ?? 8765);
    setAutoStart(service.portConfig?.autoPortStart ?? 8765);
    setAutoEnd(service.portConfig?.autoPortEnd ?? 8799);
    setCopyStatus("idle");
  }, [service.portConfig, service.port]);

  async function handleCopyDiagnostic() {
    const copied = await copyText(diagnostic);
    setCopyStatus(copied ? "copied" : "failed");
    window.setTimeout(() => setCopyStatus("idle"), 1800);
  }
  const stateClass =
    service.status === "running"
      ? "bg-emerald-50 text-emerald-700"
      : service.status === "degraded"
        ? "bg-amber-50 text-amber-700"
        : "bg-red-50 text-red-700";
  const dotClass =
    service.status === "running" ? "bg-emerald-500" : service.status === "degraded" ? "bg-amber-500" : "bg-red-500";

  return (
    <section className="rounded-md border border-line px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-hover text-brand-orange">
            <Server size={16} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[12px] font-semibold text-ink-primary">{service.name}</p>
              <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold ${stateClass}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                {service.statusLabel}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{service.description}</p>
          </div>
        </div>
        <button
          className="inline-flex h-8 items-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!service.canRestart || refreshing}
          onClick={onRestartBackendService}
        >
          <RotateCcw size={14} />
          {text.restartBackend}
        </button>
      </div>
      {!service.canRestart ? (
        <p className="mt-2 text-[10px] leading-4 text-ink-secondary">{text.restartUnavailable}</p>
      ) : null}

      <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ServiceField label={text.endpointLabel} value={service.endpoint} mono />
        <ServiceField label={text.profileLabel} value={service.profile ?? text.unavailableValue} />
        <ServiceField label={text.expectedProfileLabel} value={service.expectedProfile} />
        <ServiceField label={text.portLabel} value={String(service.port ?? text.unavailableValue)} />
        <ServiceField label={text.managedByLabel} value={service.managedBy ?? text.unavailableValue} />
        <ServiceField label={text.versionLabel} value={service.version ?? text.unavailableValue} />
        <ServiceField label={text.expectedVersionLabel} value={service.expectedVersion} />
        <ServiceField label={text.restartAvailableLabel} value={service.canRestart ? text.yes : text.no} />
        {service.instanceId ? <ServiceField label={text.instanceLabel} value={service.instanceId} mono /> : null}
        {service.startedAt ? <ServiceField label={text.startedAtLabel} value={formatDateTime(service.startedAt)} /> : null}
        <ServiceField label={text.appDataDirLabel} value={service.appDataDir ?? text.unavailableValue} mono wide />
        <ServiceField label={text.expectedAppDataDirLabel} value={service.expectedAppDataDir || text.unavailableValue} mono wide />
        {service.sidecarPath ? <ServiceField label={text.sidecarPathLabel} value={service.sidecarPath} mono wide /> : null}
      </dl>

      {service.lastError ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-[10px] font-semibold text-red-700">{text.lastErrorLabel}</p>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-red-700">{service.lastError}</pre>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange"
          onClick={() => void handleCopyDiagnostic()}
        >
          <Copy size={14} />
          {copyStatus === "copied" ? text.copyDiagnosticCopied : copyStatus === "failed" ? text.copyDiagnosticFailed : text.copyDiagnostic}
        </button>
        <button
          className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange"
          onClick={() => setAdvancedOpen((isOpen) => !isOpen)}
        >
          <ChevronDown size={14} className={advancedOpen ? "rotate-180 transition" : "transition"} />
          {text.advancedBackend}
        </button>
      </div>

      {advancedOpen ? (
        <div className="mt-3 rounded-md border border-line bg-panel px-3 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[150px] flex-1">
              <span className="text-[10px] font-semibold text-ink-secondary">{text.portModeLabel}</span>
              <select
                className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
                value={portMode}
                disabled={!service.canConfigurePort || refreshing}
                onChange={(event) => setPortMode(event.target.value as BackendPortConfig["mode"])}
              >
                <option value="automatic">{text.portModeAutomatic}</option>
                <option value="fixed">{text.portModeFixed}</option>
              </select>
            </label>
            <NumberField label={text.fixedPortLabel} value={fixedPort} disabled={!service.canConfigurePort || refreshing} onChange={setFixedPort} />
            <NumberField label={text.autoStartLabel} value={autoStart} disabled={!service.canConfigurePort || refreshing || portMode !== "automatic"} onChange={setAutoStart} />
            <NumberField label={text.autoEndLabel} value={autoEnd} disabled={!service.canConfigurePort || refreshing || portMode !== "automatic"} onChange={setAutoEnd} />
            <button
              className="h-8 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!service.canConfigurePort || refreshing || !isValidPortConfig(portMode, fixedPort, autoStart, autoEnd)}
              onClick={() => onUpdateBackendPortConfig({
                mode: portMode,
                port: fixedPort,
                autoPortStart: autoStart,
                autoPortEnd: autoEnd,
              })}
            >
              {text.applyAndRestart}
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-ink-secondary">
            {service.canConfigurePort ? text.portAdvancedDescription : text.portAdvancedUnavailable}
          </p>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {copyStatus === "copied" ? text.copyDiagnosticCopied : copyStatus === "failed" ? text.copyDiagnosticFailed : ""}
      </p>
    </section>
  );
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy copy path.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

function NumberField({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (value: number) => void }) {
  return (
    <label className="w-[112px]">
      <span className="text-[10px] font-semibold text-ink-secondary">{label}</span>
      <input
        className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 font-mono text-[11px] text-ink-primary outline-none focus:border-brand-orange disabled:bg-line/40"
        type="number"
        min={1024}
        max={65535}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function isValidPortConfig(mode: BackendPortConfig["mode"], port: number, autoStart: number, autoEnd: number) {
  const validPort = Number.isInteger(port) && port >= 1024 && port <= 65535;
  const validRange = Number.isInteger(autoStart) && Number.isInteger(autoEnd) && autoStart >= 1024 && autoEnd <= 65535 && autoStart <= autoEnd;
  return mode === "fixed" ? validPort : validPort && validRange;
}

function buildServiceDiagnostic(service: RuntimeServicesStatus["services"][number]) {
  return [
    `status=${service.status}`,
    `endpoint=${service.endpoint}`,
    `expectedProfile=${service.expectedProfile}`,
    `profile=${service.profile ?? "unknown"}`,
    `expectedVersion=${service.expectedVersion}`,
    `version=${service.version ?? "unknown"}`,
    `port=${service.port ?? "unknown"}`,
    `managedBy=${service.managedBy ?? "unknown"}`,
    `appDataDir=${service.appDataDir ?? "unknown"}`,
    `expectedAppDataDir=${service.expectedAppDataDir}`,
    service.lastError ? `lastError=${service.lastError}` : null,
  ].filter(Boolean).join("\n");
}

function ServiceField({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={["rounded-md border border-line bg-panel px-3 py-2", wide ? "sm:col-span-2" : ""].join(" ")}>
      <dt className="text-[10px] font-semibold text-ink-secondary">{label}</dt>
      <dd className={["mt-1 break-all text-[11px] text-ink-primary", mono ? "font-mono" : ""].join(" ")}>{value}</dd>
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
  const themeOptions: Array<{ value: AppearanceThemeMode; label: string; icon: typeof Monitor }> = [
    { value: "system", label: text.themeSystem, icon: Monitor },
    { value: "light", label: text.themeLight, icon: Sun },
    { value: "dark", label: text.themeDark, icon: Moon },
  ];

  function resetAppearance() {
    onAppearanceChange({
      themeMode: "system",
      primaryColor: "orange",
      zoomPercent: 100,
    });
  }

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

      <section className="rounded-md border border-line px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Monitor size={14} className="text-brand-orange" />
              <p className="text-[11px] font-semibold text-ink-primary">{text.themeHeading}</p>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.themeDescription}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-md border border-line bg-panel p-1">
          {themeOptions.map((option) => {
            const Icon = option.icon;
            const selected = appearance.themeMode === option.value;
            return (
              <button
                key={option.value}
                className={[
                  "inline-flex h-8 items-center justify-center gap-2 rounded border px-2 text-[11px] font-semibold transition",
                  selected ? "border-brand-orange bg-white text-brand-orange shadow-subtle" : "border-transparent text-ink-secondary hover:bg-white hover:text-ink-primary",
                ].join(" ")}
                type="button"
                aria-pressed={selected}
                onClick={() => onAppearanceChange({ themeMode: option.value })}
              >
                <Icon size={14} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-md border border-line px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Paintbrush size={14} className="text-brand-orange" />
              <p className="text-[11px] font-semibold text-ink-primary">{text.primaryColorHeading}</p>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.primaryColorDescription}</p>
          </div>
          <span className="shrink-0 rounded bg-brand-hover px-2 py-1 text-[10px] font-semibold text-brand-orange">
            {accentPalettes.find((palette) => palette.id === appearance.primaryColor)?.label ?? text.primaryColorDefault}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={text.primaryColorHeading}>
          {accentPalettes.map((palette) => {
            const selected = palette.id === appearance.primaryColor;
            return (
              <button
                key={palette.id}
                className={[
                  "grid h-8 w-8 place-items-center rounded-full border transition",
                  selected ? "border-ink-primary bg-white shadow-subtle" : "border-line bg-white hover:border-brand-orange",
                ].join(" ")}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${text.primaryColorOption} ${palette.label}`}
                data-tooltip={palette.label}
                data-tooltip-placement="bottom"
                onClick={() => onAppearanceChange({ primaryColor: palette.id as AppearanceAccentColor })}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full" style={{ backgroundColor: palette.projectColor }}>
                  {selected ? <Check size={12} className="text-white drop-shadow" strokeWidth={3} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-md border border-line px-4 py-3">
        <div className="mb-3 flex items-center gap-2">
          <Eye size={14} className="text-brand-orange" />
          <p className="text-[11px] font-semibold text-ink-primary">{text.previewHeading}</p>
        </div>
        <div className="grid gap-3 rounded-md border border-line bg-panel p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button className="h-8 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white shadow-subtle" type="button">
              {text.previewPrimaryButton}
            </button>
            <button className="h-8 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary" type="button">
              {text.previewSecondaryButton}
            </button>
            <span className="rounded border border-brand-orange bg-brand-hover px-2 py-1 text-[10px] font-semibold text-brand-orange">
              {text.previewActiveState}
            </span>
          </div>
          <div className="grid gap-1.5">
            <div className="flex h-8 items-center gap-2 rounded-md border border-brand-orange bg-white px-2 text-[11px] text-ink-primary shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.18)]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-brand-orange" />
              <span className="min-w-0 flex-1 truncate">{text.previewDocumentName}</span>
              <span className="text-[10px] text-ink-secondary">{text.previewStatus}</span>
            </div>
            <div className="rounded-md border border-line bg-white px-3 py-2">
              <p className="text-[11px] font-semibold text-ink-primary">{text.previewTextTitle}</p>
              <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{text.previewTextDescription}</p>
            </div>
          </div>
        </div>
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

      <div className="rounded-md border border-line px-4 py-3">
        <div className="mb-3 flex items-center gap-2">
          <Underline size={14} className="text-brand-orange" />
          <p className="text-[11px] font-semibold text-ink-primary">{text.markdownCompatibilityHeading}</p>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-ink-primary">{text.underlineToggleLabel}</p>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
              {text.underlineToggleDescription}
            </p>
          </div>
          <Switch
            enabled={appearance.markdownExtendedUnderlineEnabled}
            label={text.underlineToggleAria}
            onToggle={() => onAppearanceChange({ markdownExtendedUnderlineEnabled: !appearance.markdownExtendedUnderlineEnabled })}
          />
        </div>
        <div className="mt-3 rounded bg-panel px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange" />
            <p className="text-[10px] leading-4 text-ink-secondary">{text.markdownCompatibilityNote}</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end border-t border-line pt-4">
        <button
          className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
          type="button"
          onClick={resetAppearance}
        >
          <RotateCcw size={14} />
          {text.resetAppearance}
        </button>
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
  onReindexImages,
  onDeleteAiIndex,
}: {
  ai: AiConfigStatus;
  aiIndexStatus: AiIndexStatusResponse | null;
  text: SettingsCopy;
  onAiChange: (ai: AiConfigStatus) => void;
  onSaveOpenAiKey: (apiKey: string) => void;
  onDeleteOpenAiKey: () => void;
  onRebuildAiIndex: () => void;
  onReindexImages: () => void;
  onDeleteAiIndex: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [localAi, setLocalAi] = useState<AiConfigStatus>(() => normalizeAiStatus(ai));
  const localAiRef = useRef<AiConfigStatus>(normalizeAiStatus(ai));
  const settingsAi = localAi;
  const indexStatus = aiIndexStatus?.status ?? settingsAi.rag.status;
  const indexedCount = aiIndexStatus?.indexedDocumentCount ?? 0;
  const documentCount = aiIndexStatus?.documentCount ?? 0;
  const failedCount = aiIndexStatus?.failedDocumentCount ?? 0;
  const openAiKeySuffix = settingsAi.openaiKeyPreview?.slice(-4) ?? "";
  const openAiKeyPlaceholder = settingsAi.openaiKeyConfigured
    ? openAiKeySuffix
      ? `${text.openAiKeyConfiguredPlaceholder} ${openAiKeySuffix}`
      : text.openAiKeyConfiguredGenericPlaceholder
    : text.openAiKeyMissingPlaceholder;

  useEffect(() => {
    const normalizedAi = normalizeAiStatus(ai);
    localAiRef.current = normalizedAi;
    setLocalAi(normalizedAi);
  }, [ai]);

  function commitAi(nextAi: AiConfigStatus) {
    const normalizedAi = normalizeAiStatus(nextAi);
    localAiRef.current = normalizedAi;
    setLocalAi(normalizedAi);
    onAiChange(normalizedAi);
  }

  function updatePermissions(nextPermissions: Partial<AiConfigStatus["permissions"]>) {
    const currentAi = localAiRef.current;
    commitAi({
      ...currentAi,
      permissions: {
        ...currentAi.permissions,
        ...nextPermissions,
      },
    });
  }

  function updateModel(model: AiModelId) {
    const currentAi = localAiRef.current;
    commitAi({
      ...currentAi,
      model,
    });
  }

  function updateRag(enabled: boolean) {
    const currentAi = localAiRef.current;
    commitAi({
      ...currentAi,
      rag: {
        ...currentAi.rag,
        enabled,
      },
    });
  }

  function updateVision(nextVision: Partial<AiConfigStatus["vision"]>) {
    const currentAi = localAiRef.current;
    commitAi({
      ...currentAi,
      vision: {
        ...currentAi.vision,
        ...nextVision,
      },
    });
  }

  function updateAgentic(nextAgentic: Partial<AiConfigStatus["agentic"]>) {
    const currentAi = localAiRef.current;
    const nextAi = {
      ...currentAi,
      agentic: {
        ...currentAi.agentic,
        ...nextAgentic,
      },
    };
    commitAi(nextAi);
  }

  function updateTranscription(nextTranscription: Partial<AiConfigStatus["transcription"]>) {
    const currentAi = localAiRef.current;
    commitAi({
      ...currentAi,
      transcription: normalizeTranscription({
        ...currentAi.transcription,
        ...nextTranscription,
      }),
    });
  }

  function toggleFavoriteLanguage(language: AiTranscriptionLanguage) {
    const currentFavorites = settingsAi.transcription.favoriteLanguages;
    const nextFavorites = currentFavorites.includes(language)
      ? currentFavorites.filter((favoriteLanguage) => favoriteLanguage !== language)
      : [...currentFavorites, language];
    updateTranscription({ favoriteLanguages: nextFavorites.filter((favoriteLanguage) => favoriteLanguage !== "auto") });
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

      <div className="rounded-md border border-line px-3 py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-ink-primary">OpenAI</p>
            <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{text.aiKeyPrivacy}</p>
          </div>
          <span className={["rounded px-2 py-1 text-[10px] font-semibold", settingsAi.openaiKeyConfigured ? "bg-brand-hover text-brand-orange" : "bg-panel text-ink-secondary"].join(" ")}>
            {settingsAi.openaiKeyConfigured ? text.enabled : text.disabled}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
          <input
            className="h-9 min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-[11px] outline-none focus:border-brand-orange"
            type="password"
            value={apiKey}
            placeholder={openAiKeyPlaceholder}
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
            disabled={!settingsAi.openaiKeyConfigured}
            data-tooltip={text.deleteKey}
            aria-label={text.deleteKey}
            onClick={onDeleteOpenAiKey}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <section className="rounded-md border border-line px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-ink-primary">{text.aiModelHeading}</p>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.aiModelDescription}</p>
          </div>
          <span className="rounded bg-panel px-2 py-1 font-mono text-[10px] font-semibold text-ink-secondary">{settingsAi.model}</span>
        </div>

        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2" role="radiogroup" aria-label={text.aiModelHeading}>
          {aiModelIds.map((modelId) => {
            const model = text.aiModels[modelId];
            const meter = aiModelMeter[modelId];
            const selected = settingsAi.model === modelId;
            return (
              <button
                key={modelId}
                type="button"
                role="radio"
                aria-checked={selected}
                className={[
                  "min-w-0 rounded-lg border px-3 py-3 text-left transition",
                  selected ? "border-brand-orange bg-brand-hover shadow-subtle" : "border-line bg-white hover:border-orange-200 hover:bg-panel",
                ].join(" ")}
                onClick={() => updateModel(modelId)}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold text-ink-primary">{model.name}</span>
                    <span className="mt-0.5 block break-words font-mono text-[9px] text-ink-secondary">{modelId}</span>
                  </span>
                  {model.recommended ? (
                    <span className="shrink-0 rounded bg-white px-2 py-1 text-[9px] font-semibold text-brand-orange">{text.recommendedModel}</span>
                  ) : null}
                </span>
                <span className="mt-2 block text-[10px] leading-4 text-ink-secondary">{model.description}</span>
                <span className="mt-3 grid gap-2">
                  <ModelMeter label={text.intelligenceLabel} value={meter.intelligence} valueLabel={model.intelligence} />
                  <ModelMeter label={text.costLabel} value={meter.cost} valueLabel={model.cost} />
                </span>
                <span className="mt-2 block text-[9px] leading-4 text-ink-secondary">{model.price}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-md border border-line px-3 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ImageIcon size={15} className="text-brand-orange" />
              <p className="text-[11px] font-semibold text-ink-primary">{text.visionHeading}</p>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.visionDescription}</p>
          </div>
          <Switch enabled={settingsAi.vision.enabled} label={text.visionHeading} onToggle={() => updateVision({ enabled: !settingsAi.vision.enabled })} />
        </div>

        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(135px,1fr))] gap-2">
          <label className="block min-w-0">
            <span className="block text-[9px] font-semibold uppercase text-ink-secondary">{text.visionModelHeading}</span>
            <select
              className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
              value={settingsAi.vision.model}
              onChange={(event) => updateVision({ model: event.target.value as AiVisionModelId })}
            >
              {aiVisionModelIds.map((modelId) => (
                <option key={modelId} value={modelId}>{modelId}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="block text-[9px] font-semibold uppercase text-ink-secondary">{text.visionDetailHeading}</span>
            <select
              className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
              value={settingsAi.vision.detail}
              onChange={(event) => updateVision({ detail: event.target.value as AiConfigStatus["vision"]["detail"] })}
            >
              <option value="auto">{text.visionDetailAuto}</option>
              <option value="low">{text.visionDetailLow}</option>
              <option value="high">{text.visionDetailHigh}</option>
            </select>
          </label>
          <LimitField label={text.visionMaxImages} value={settingsAi.vision.maxImagesPerPrompt} min={1} max={12} step={1} onChange={(maxImagesPerPrompt) => updateVision({ maxImagesPerPrompt })} />
          <LimitField label={text.visionMaxSize} value={settingsAi.vision.maxImageSizeMb} min={1} max={50} step={1} suffix="MB" onChange={(maxImageSizeMb) => updateVision({ maxImageSizeMb })} />
        </div>

        <div className="mt-3 grid gap-x-6 border-t border-line md:grid-cols-2">
          <CompactToggle
            label={text.visionIndexHeading}
            description={text.visionIndexDescription}
            enabled={settingsAi.vision.imageIndexingEnabled}
            onToggle={() => updateVision({ imageIndexingEnabled: !settingsAi.vision.imageIndexingEnabled })}
          />
          <CompactToggle
            label={text.visionStoreHeading}
            description={text.visionStoreDescription}
            enabled={settingsAi.vision.storeVisualDescriptions}
            onToggle={() => updateVision({ storeVisualDescriptions: !settingsAi.vision.storeVisualDescriptions })}
          />
        </div>

        <div className="mt-3 flex justify-end">
          <button
            className="h-8 rounded-md border border-brand-orange px-3 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover disabled:opacity-50"
            disabled={!settingsAi.vision.enabled || !settingsAi.vision.imageIndexingEnabled || !settingsAi.openaiKeyConfigured}
            onClick={onReindexImages}
          >
            {text.reindexImages}
          </button>
        </div>
      </section>

      <section className="rounded-md border border-line px-3 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Mic size={15} className="text-brand-orange" />
              <p className="text-[11px] font-semibold text-ink-primary">{text.transcriptionHeading}</p>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.transcriptionDescription}</p>
          </div>
          <Switch enabled={settingsAi.transcription.enabled} label={text.transcriptionHeading} onToggle={() => updateTranscription({ enabled: !settingsAi.transcription.enabled })} />
        </div>

        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
          <label className="block min-w-0">
            <span className="block text-[9px] font-semibold uppercase text-ink-secondary">{text.transcriptionModelHeading}</span>
            <select
              className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
              value={settingsAi.transcription.model}
              onChange={(event) => updateTranscription({ model: event.target.value as AiConfigStatus["transcription"]["model"] })}
            >
              <option value="gpt-realtime-whisper">gpt-realtime-whisper</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className="block text-[9px] font-semibold uppercase text-ink-secondary">{text.transcriptionDefaultTarget}</span>
            <select
              className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
              value={settingsAi.transcription.defaultTarget}
              onChange={(event) => updateTranscription({ defaultTarget: event.target.value as AiConfigStatus["transcription"]["defaultTarget"] })}
            >
              <option value="prompt">{text.transcriptionTargetPrompt}</option>
              <option value="document">{text.transcriptionTargetDocument}</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className="block text-[9px] font-semibold uppercase text-ink-secondary">{text.transcriptionDefaultLanguage}</span>
            <select
              className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
              value={settingsAi.transcription.defaultLanguage}
              onChange={(event) => updateTranscription({ defaultLanguage: event.target.value as AiTranscriptionLanguage })}
            >
              {transcriptionLanguages.map((language) => (
                <option key={language} value={language}>{text.transcriptionLanguages[language]}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[9px] font-semibold uppercase text-ink-secondary">{text.transcriptionFavoriteLanguages}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {transcriptionLanguages.filter((language) => language !== "auto").map((language) => {
              const selected = settingsAi.transcription.favoriteLanguages.includes(language);
              return (
                <button
                  key={language}
                  type="button"
                  className={[
                    "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold transition",
                    selected ? "border-brand-orange bg-brand-hover text-brand-orange" : "border-line text-ink-secondary hover:bg-panel hover:text-ink-primary",
                  ].join(" ")}
                  onClick={() => toggleFavoriteLanguage(language)}
                >
                  {selected ? <Check size={12} /> : null}
                  {text.transcriptionLanguages[language]}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-line px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold text-ink-primary">{text.aiPermissionsHeading}</p>
          <span className="rounded bg-panel px-2 py-1 text-[10px] font-semibold text-ink-secondary">{text.aiPermissionsScope}</span>
        </div>
        <div className="mt-2 grid gap-x-6 border-t border-line md:grid-cols-2">
          <PermissionToggle label={text.editDocuments} enabled={settingsAi.permissions.editDocuments} onToggle={() => updatePermissions({ editDocuments: !settingsAi.permissions.editDocuments })} />
          <PermissionToggle label={text.createFolders} enabled={settingsAi.permissions.createFolders} onToggle={() => updatePermissions({ createFolders: !settingsAi.permissions.createFolders })} />
          <PermissionToggle label={text.createDocuments} enabled={settingsAi.permissions.createDocuments} onToggle={() => updatePermissions({ createDocuments: !settingsAi.permissions.createDocuments })} />
          <PermissionToggle
            label={text.deleteDocuments}
            enabled={settingsAi.permissions.deleteDocumentsAndFolders}
            onToggle={() => updatePermissions({ deleteDocumentsAndFolders: !settingsAi.permissions.deleteDocumentsAndFolders })}
          />
        </div>
      </section>

      <section className="rounded-md border border-line px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Gauge size={15} className="text-brand-orange" />
              <p className="text-[11px] font-semibold text-ink-primary">{text.agenticHeading}</p>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.agenticDescription}</p>
          </div>
          <span className="rounded bg-panel px-2 py-1 text-[10px] font-semibold text-ink-secondary">{text.agenticModeHint}</span>
        </div>

        <div className="mt-3 grid gap-x-6 border-y border-line md:grid-cols-2">
          <CompactToggle
            icon={<Globe2 size={14} />}
            label={text.webResearchHeading}
            description={text.webResearchDescription}
            enabled={settingsAi.agentic.webResearchEnabled}
            onToggle={() => updateAgentic({ webResearchEnabled: !settingsAi.agentic.webResearchEnabled })}
          />
          <CompactToggle
            icon={<ShieldCheck size={14} />}
            label={text.agenticConfirmHeading}
            description={text.agenticConfirmDescription}
            enabled={settingsAi.agentic.confirmBeforeApplying}
            onToggle={() => updateAgentic({ confirmBeforeApplying: !settingsAi.agentic.confirmBeforeApplying })}
          />
        </div>

        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
          <LimitField label={text.agenticMaxSteps} value={settingsAi.agentic.maxSteps} min={1} max={12} step={1} onChange={(maxSteps) => updateAgentic({ maxSteps })} />
          <LimitField label={text.agenticMaxDocuments} value={settingsAi.agentic.maxDocuments} min={1} max={30} step={1} onChange={(maxDocuments) => updateAgentic({ maxDocuments })} />
          <LimitField label={text.agenticMaxSources} value={settingsAi.agentic.maxSources} min={1} max={20} step={1} onChange={(maxSources) => updateAgentic({ maxSources })} />
          <LimitField label={text.agenticMaxCost} value={settingsAi.agentic.maxEstimatedCostEur} min={0.1} max={25} step={0.1} suffix="€" onChange={(maxEstimatedCostEur) => updateAgentic({ maxEstimatedCostEur })} />
        </div>
      </section>

      <section className="rounded-md border border-line px-3 py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-ink-primary">{text.ragHeading}</p>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.ragDescription}</p>
          </div>
          <Switch enabled={settingsAi.rag.enabled} label={text.ragHeading} onToggle={() => updateRag(!settingsAi.rag.enabled)} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <StatusPill label={text.ragStatus} value={describeIndexStatus(indexStatus)} />
          <StatusPill label={text.ragDocuments} value={`${indexedCount}/${documentCount}`} />
          {failedCount > 0 ? <StatusPill label={text.ragFailed} value={String(failedCount)} tone="danger" /> : null}
          {aiIndexStatus?.localExactReady ? <StatusPill label={text.ragExactReady} value={text.enabled} tone="success" /> : null}
        </div>
        {aiIndexStatus?.error ? <p className="mt-2 text-[10px] leading-4 text-red-700">{aiIndexStatus.error}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="h-8 rounded-md border border-brand-orange px-3 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover disabled:opacity-50"
            disabled={!settingsAi.rag.enabled || !settingsAi.openaiKeyConfigured}
            onClick={onRebuildAiIndex}
          >
            {text.rebuildIndex}
          </button>
          <button
            className="h-8 rounded-md border border-line px-3 text-[11px] text-ink-secondary hover:bg-panel disabled:opacity-50"
            disabled={!settingsAi.rag.vectorStoreId && !aiIndexStatus?.vectorStoreId}
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

function ModelMeter({ label, value, valueLabel }: { label: string; value: number; valueLabel: string }) {
  return (
    <span className="block min-w-0 text-[9px] leading-4">
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="font-semibold text-ink-secondary">{label}</span>
        <span className="truncate text-right font-semibold text-ink-primary">{valueLabel}</span>
      </span>
      <span className="mt-1 grid grid-cols-4 gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={["h-1.5 rounded-full", step <= value ? "bg-brand-orange" : "bg-line"].join(" ")}
          />
        ))}
      </span>
    </span>
  );
}

function CompactToggle({
  label,
  description,
  enabled,
  onToggle,
  icon,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon ? <span className="shrink-0 text-brand-orange">{icon}</span> : null}
          <p className="text-[11px] font-semibold text-ink-primary">{label}</p>
        </div>
        <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{description}</p>
      </div>
      <Switch enabled={enabled} label={label} onToggle={onToggle} />
    </div>
  );
}

function PermissionToggle({ label, enabled, onToggle }: { label: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-2.5">
      <span className="min-w-0 text-[11px] font-medium text-ink-primary">{label}</span>
      <Switch enabled={enabled} label={label} onToggle={onToggle} />
    </div>
  );
}

function StatusPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : tone === "danger"
        ? "border-red-100 bg-red-50 text-red-700"
        : "border-line bg-panel text-ink-secondary";

  return (
    <span className={["inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium", toneClass].join(" ")}>
      <span>{label}</span>
      <span className="font-semibold text-ink-primary">{value}</span>
    </span>
  );
}

function LimitField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[9px] font-semibold uppercase text-ink-secondary">{label}</span>
      <span className="mt-1 flex h-8 items-center gap-1 rounded-md border border-line bg-white px-2 focus-within:border-brand-orange">
        <input
          className="h-7 min-w-0 flex-1 border-0 bg-transparent text-[11px] font-semibold text-ink-primary outline-none"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            if (Number.isFinite(nextValue)) onChange(Math.min(Math.max(nextValue, min), max));
          }}
        />
        {suffix ? <span className="text-[10px] font-semibold text-ink-secondary">{suffix}</span> : null}
      </span>
    </label>
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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

type SettingsCopy = typeof settingsCopy.es;

const settingsCopy = {
  es: {
    title: "Configuración de la app",
    subtitle: "Ajustes locales de interfaz y diagnóstico.",
    close: "Cerrar",
    closeSettings: "Cerrar configuración",
    sectionsLabel: "Apartados de configuración",
    servicesNav: "Servicios",
    servicesNavDescription: "Backend local y salud",
    appearanceNav: "Apariencia",
    appearanceNavDescription: "Idioma y escala visual",
    aiNav: "IA",
    aiNavDescription: "OpenAI y permisos",
    diagnosticsNav: "Trazas",
    diagnosticsNavDescription: "Registro local de errores",
    servicesHeading: "Estado de servicios",
    servicesDescription: "Revisa si los procesos locales necesarios para trabajar están activos. Si el backend cae, KnowNext.ai intenta recuperarlo automáticamente y deja el detalle en el log.",
    servicesSummary: "Supervisión local",
    servicesPending: "Consultando estado de servicios",
    lastChecked: "Última comprobación",
    refreshServices: "Comprobar",
    restartBackend: "Reiniciar backend",
    restartUnavailable: "El reinicio desde la interfaz solo está disponible en la aplicación instalada. En modo web/desarrollo, arranca o reinicia el backend local fuera de la interfaz y vuelve a comprobar.",
    endpointLabel: "Endpoint",
    profileLabel: "Perfil activo",
    expectedProfileLabel: "Perfil esperado",
    portLabel: "Puerto activo",
    managedByLabel: "Gestionado por",
    instanceLabel: "Instancia",
    startedAtLabel: "Arrancado",
    versionLabel: "Versión activa",
    expectedVersionLabel: "Versión esperada",
    restartAvailableLabel: "Reinicio automático",
    appDataDirLabel: "Datos usados por el backend",
    expectedAppDataDirLabel: "Datos esperados por la app",
    sidecarPathLabel: "Ejecutable sidecar",
    lastErrorLabel: "Último problema detectado",
    copyDiagnostic: "Copiar diagnóstico",
    copyDiagnosticCopied: "Diagnóstico copiado",
    copyDiagnosticFailed: "No se pudo copiar",
    advancedBackend: "Avanzado",
    portModeLabel: "Modo de puerto",
    portModeAutomatic: "Automático",
    portModeFixed: "Fijo",
    fixedPortLabel: "Puerto",
    autoStartLabel: "Rango inicio",
    autoEndLabel: "Rango fin",
    applyAndRestart: "Aplicar y reiniciar",
    portAdvancedDescription: "En automático, la app usa el puerto preferido si está libre y cambia a otro del rango si detecta conflicto. Usa fijo solo cuando necesites reservar un puerto concreto.",
    portAdvancedUnavailable: "En modo web/desarrollo la interfaz puede diagnosticar el endpoint, pero no puede cambiar ni reiniciar el backend local.",
    unavailableValue: "No disponible",
    yes: "Sí",
    no: "No",
    appearanceHeading: "Apariencia",
    appearanceDescription: "Ajusta cómo se presenta la interfaz en este equipo.",
    themeHeading: "Tema",
    themeDescription: "Elige un modo claro, oscuro o sincronizado con el sistema.",
    themeSystem: "Sistema",
    themeLight: "Claro",
    themeDark: "Oscuro",
    primaryColorHeading: "Color principal",
    primaryColorDescription: "Usa la misma gama visual que los proyectos para acentos, estados activos y acciones principales.",
    primaryColorDefault: "Naranja",
    primaryColorOption: "Color",
    previewHeading: "Vista previa",
    previewPrimaryButton: "Guardar",
    previewSecondaryButton: "Cancelar",
    previewActiveState: "Activo",
    previewDocumentName: "documentacion-producto.md",
    previewStatus: "Editando",
    previewTextTitle: "Superficie de trabajo",
    previewTextDescription: "La navegación, acciones y selección usan el color principal sin cambiar los colores semánticos.",
    resetAppearance: "Restablecer apariencia",
    languageLabel: "Idioma",
    zoomLabel: "Zoom de la interfaz",
    zoomReduce: "Reducir",
    zoomNormal: "Normal",
    zoomIncrease: "Ampliar",
    markdownCompatibilityHeading: "Compatibilidad Markdown",
    markdownCompatibilityNote: "Mantén esta opción activa si el equipo acepta HTML inline en sus documentos Markdown. Desactívala si quieres limitar el editor a controles de Markdown estándar.",
    underlineToggleLabel: "Mostrar subrayado en el editor",
    underlineToggleDescription: "El subrayado no forma parte de Markdown estándar y se guardará como HTML inline con <u>texto</u>.",
    underlineToggleAria: "Activar subrayado extendido",
    aiHeading: "IA documental",
    aiDescription: "Configura OpenAI, permisos de acciones y consulta semántica del proyecto.",
    aiConfigured: "Clave configurada",
    aiMissingKey: "Sin clave OpenAI",
    enabled: "Activo",
    disabled: "Inactivo",
    openAiKeyPlaceholder: "sk-...",
    openAiKeyConfiguredPlaceholder: "Clave configurada. Últimos 4 caracteres:",
    openAiKeyConfiguredGenericPlaceholder: "Clave OpenAI configurada. Escribe una nueva para sustituirla.",
    openAiKeyMissingPlaceholder: "Configura la API key de OpenAI para activar IA real",
    saveKey: "Guardar",
    deleteKey: "Eliminar clave",
    aiKeyPrivacy: "La clave se guarda localmente y no se escribe en proyectos, logs ni trazas.",
    aiModelHeading: "Modelo de respuesta",
    aiModelDescription: "Elige el equilibrio entre inteligencia, velocidad y coste para las respuestas documentales.",
    recommendedModel: "Recomendado",
    intelligenceLabel: "Inteligencia",
    costLabel: "Coste",
    visionHeading: "Visión de imágenes",
    visionDescription: "Controla cómo se usan las imágenes del proyecto como contexto IA y cuándo se indexan sus descripciones visuales.",
    visionModelHeading: "Modelo visión",
    visionDetailHeading: "Detalle",
    visionDetailAuto: "Automático",
    visionDetailLow: "Bajo",
    visionDetailHigh: "Alto",
    visionMaxImages: "Imágenes por prompt",
    visionMaxSize: "Tamaño máx.",
    visionIndexHeading: "Indexar imágenes en RAG",
    visionIndexDescription: "Permite que el índice del proyecto incluya descripciones visuales generadas desde las imágenes.",
    visionStoreHeading: "Guardar descripciones visuales",
    visionStoreDescription: "Conserva metadatos locales para reutilizar contexto sin volver a analizar cada imagen.",
    reindexImages: "Reindexar imágenes",
    transcriptionHeading: "Audio y transcripción",
    transcriptionDescription: "Controla el dictado realtime usado por el micrófono del prompt. React captura el audio, pero OpenAI se invoca solo desde el backend local.",
    transcriptionModelHeading: "Modelo",
    transcriptionDefaultTarget: "Destino por defecto",
    transcriptionDefaultLanguage: "Idioma por defecto",
    transcriptionFavoriteLanguages: "Idiomas favoritos del micrófono",
    transcriptionTargetPrompt: "Prompt",
    transcriptionTargetDocument: "Documento",
    transcriptionLanguages: {
      auto: "Automático",
      es: "Español",
      en: "Inglés",
      fr: "Francés",
      de: "Alemán",
      it: "Italiano",
      pt: "Portugués",
      ca: "Catalán",
      eu: "Euskera",
      gl: "Gallego",
    },
    aiModels: {
      "gpt-5.4-mini": {
        name: "Equilibrado",
        description: "Buen criterio documental con coste bajo para uso diario.",
        intelligence: "Alta",
        cost: "Bajo",
        price: "$0.75 entrada / $4.50 salida por 1M tokens",
        recommended: true,
      },
      "gpt-5.4": {
        name: "Avanzado",
        description: "Más precisión para razonamiento y documentos complejos.",
        intelligence: "Muy alta",
        cost: "Medio",
        price: "$2.50 entrada / $15 salida por 1M tokens",
        recommended: false,
      },
      "gpt-5.5": {
        name: "Máxima inteligencia",
        description: "Elige esta opción cuando la calidad pesa más que el coste.",
        intelligence: "Máxima",
        cost: "Alto",
        price: "$5 entrada / $30 salida por 1M tokens",
        recommended: false,
      },
      "gpt-5.4-nano": {
        name: "Económico",
        description: "Respuestas rápidas y baratas para tareas simples.",
        intelligence: "Media",
        cost: "Muy bajo",
        price: "$0.20 entrada / $1.25 salida por 1M tokens",
        recommended: false,
      },
    },
    aiPermissionsHeading: "Permisos de acciones",
    aiPermissionsScope: "Límites de ejecución",
    editDocuments: "Editar documentos",
    createFolders: "Crear y mover carpetas",
    createDocuments: "Crear, duplicar y mover documentos",
    deleteDocuments: "Eliminar documentos y carpetas",
    agenticHeading: "Tareas agénticas",
    agenticDescription: "Define límites y permisos máximos. La profundidad se elige en el prompt con el modo Razonar para no gastar tokens por defecto.",
    agenticModeHint: "Control desde el prompt",
    webResearchHeading: "Investigación web",
    webResearchDescription: "Permite planificar tareas que consulten fuentes externas y muestren las fuentes usadas. Las acciones siguen pasando por confirmación.",
    agenticConfirmHeading: "Confirmar antes de aplicar",
    agenticConfirmDescription: "Las tareas pueden preparar cambios, pero no crear ni modificar documentos sin un checkpoint visible.",
    agenticMaxSteps: "Pasos",
    agenticMaxDocuments: "Documentos",
    agenticMaxSources: "Fuentes",
    agenticMaxCost: "Coste máx.",
    ragHeading: "Indexar documentación del proyecto",
    ragDescription: "Permite consultar el proyecto completo con búsqueda semántica. El contenido Markdown se enviará a OpenAI para indexación.",
    ragStatus: "Estado",
    ragDocuments: "Documentos indexados",
    ragFailed: "fallidos",
    ragExactReady: "búsqueda exacta local lista",
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
    servicesNav: "Services",
    servicesNavDescription: "Local backend health",
    appearanceNav: "Appearance",
    appearanceNavDescription: "Language and visual scale",
    aiNav: "AI",
    aiNavDescription: "OpenAI and permissions",
    diagnosticsNav: "Traces",
    diagnosticsNavDescription: "Local error logging",
    servicesHeading: "Service status",
    servicesDescription: "Check whether the local processes required by the workspace are available. If the backend stops, KnowNext.ai tries to recover it automatically and records the detail in the log.",
    servicesSummary: "Local supervision",
    servicesPending: "Checking service status",
    lastChecked: "Last checked",
    refreshServices: "Check",
    restartBackend: "Restart backend",
    restartUnavailable: "Restart from the interface is only available in the installed desktop app. In web/development mode, start or restart the local backend outside the interface and check again.",
    endpointLabel: "Endpoint",
    profileLabel: "Active profile",
    expectedProfileLabel: "Expected profile",
    portLabel: "Active port",
    managedByLabel: "Managed by",
    instanceLabel: "Instance",
    startedAtLabel: "Started",
    versionLabel: "Active version",
    expectedVersionLabel: "Expected version",
    restartAvailableLabel: "Automatic restart",
    appDataDirLabel: "Data used by backend",
    expectedAppDataDirLabel: "Data expected by app",
    sidecarPathLabel: "Sidecar executable",
    lastErrorLabel: "Last detected problem",
    copyDiagnostic: "Copy diagnostic",
    copyDiagnosticCopied: "Diagnostic copied",
    copyDiagnosticFailed: "Could not copy",
    advancedBackend: "Advanced",
    portModeLabel: "Port mode",
    portModeAutomatic: "Automatic",
    portModeFixed: "Fixed",
    fixedPortLabel: "Port",
    autoStartLabel: "Range start",
    autoEndLabel: "Range end",
    applyAndRestart: "Apply and restart",
    portAdvancedDescription: "In automatic mode, the app uses the preferred port when available and moves to another port in the range when it detects a conflict. Use fixed only when you need a specific reserved port.",
    portAdvancedUnavailable: "In web/development mode the interface can diagnose the endpoint, but it cannot change or restart the local backend.",
    unavailableValue: "Unavailable",
    yes: "Yes",
    no: "No",
    appearanceHeading: "Appearance",
    appearanceDescription: "Adjust how the interface is presented on this computer.",
    themeHeading: "Theme",
    themeDescription: "Choose a light, dark, or system-synced mode.",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    primaryColorHeading: "Primary color",
    primaryColorDescription: "Use the same visual range as projects for accents, active states, and primary actions.",
    primaryColorDefault: "Orange",
    primaryColorOption: "Color",
    previewHeading: "Preview",
    previewPrimaryButton: "Save",
    previewSecondaryButton: "Cancel",
    previewActiveState: "Active",
    previewDocumentName: "product-documentation.md",
    previewStatus: "Editing",
    previewTextTitle: "Workspace surface",
    previewTextDescription: "Navigation, actions, and selection use the primary color without changing semantic colors.",
    resetAppearance: "Reset appearance",
    languageLabel: "Language",
    zoomLabel: "Interface zoom",
    zoomReduce: "Reduce",
    zoomNormal: "Normal",
    zoomIncrease: "Increase",
    markdownCompatibilityHeading: "Markdown compatibility",
    markdownCompatibilityNote: "Keep this option enabled if the team accepts inline HTML in Markdown documents. Disable it to keep the editor limited to standard Markdown controls.",
    underlineToggleLabel: "Show underline in the editor",
    underlineToggleDescription: "Underline is not part of standard Markdown and will be saved as inline HTML with <u>text</u>.",
    underlineToggleAria: "Enable extended underline",
    aiHeading: "Documentation AI",
    aiDescription: "Configure OpenAI, action permissions, and semantic project search.",
    aiConfigured: "Key configured",
    aiMissingKey: "No OpenAI key",
    enabled: "Enabled",
    disabled: "Disabled",
    openAiKeyPlaceholder: "sk-...",
    openAiKeyConfiguredPlaceholder: "Key configured. Last 4 characters:",
    openAiKeyConfiguredGenericPlaceholder: "OpenAI key configured. Type a new one to replace it.",
    openAiKeyMissingPlaceholder: "Configure the OpenAI API key to enable real AI",
    saveKey: "Save",
    deleteKey: "Delete key",
    aiKeyPrivacy: "The key is stored locally and is not written to projects, logs, or traces.",
    aiModelHeading: "Response model",
    aiModelDescription: "Choose the balance between intelligence, speed, and cost for documentation answers.",
    recommendedModel: "Recommended",
    intelligenceLabel: "Intelligence",
    costLabel: "Cost",
    visionHeading: "Image vision",
    visionDescription: "Control how project images are used as AI context and when visual descriptions are indexed.",
    visionModelHeading: "Vision model",
    visionDetailHeading: "Detail",
    visionDetailAuto: "Automatic",
    visionDetailLow: "Low",
    visionDetailHigh: "High",
    visionMaxImages: "Images per prompt",
    visionMaxSize: "Max size",
    visionIndexHeading: "Index images in RAG",
    visionIndexDescription: "Allow the project index to include visual descriptions generated from images.",
    visionStoreHeading: "Store visual descriptions",
    visionStoreDescription: "Keep local metadata to reuse context without analyzing each image again.",
    reindexImages: "Reindex images",
    transcriptionHeading: "Audio and transcription",
    transcriptionDescription: "Controls realtime dictation from the prompt microphone. React captures audio, but OpenAI is invoked only by the local backend.",
    transcriptionModelHeading: "Model",
    transcriptionDefaultTarget: "Default target",
    transcriptionDefaultLanguage: "Default language",
    transcriptionFavoriteLanguages: "Microphone favorite languages",
    transcriptionTargetPrompt: "Prompt",
    transcriptionTargetDocument: "Document",
    transcriptionLanguages: {
      auto: "Automatic",
      es: "Spanish",
      en: "English",
      fr: "French",
      de: "German",
      it: "Italian",
      pt: "Portuguese",
      ca: "Catalan",
      eu: "Basque",
      gl: "Galician",
    },
    aiModels: {
      "gpt-5.4-mini": {
        name: "Balanced",
        description: "Strong documentation judgment with low cost for daily work.",
        intelligence: "High",
        cost: "Low",
        price: "$0.75 input / $4.50 output per 1M tokens",
        recommended: true,
      },
      "gpt-5.4": {
        name: "Advanced",
        description: "More precision for reasoning and complex documents.",
        intelligence: "Very high",
        cost: "Medium",
        price: "$2.50 input / $15 output per 1M tokens",
        recommended: false,
      },
      "gpt-5.5": {
        name: "Max intelligence",
        description: "Use when answer quality matters more than cost.",
        intelligence: "Maximum",
        cost: "High",
        price: "$5 input / $30 output per 1M tokens",
        recommended: false,
      },
      "gpt-5.4-nano": {
        name: "Economy",
        description: "Fast, inexpensive answers for simple tasks.",
        intelligence: "Medium",
        cost: "Very low",
        price: "$0.20 input / $1.25 output per 1M tokens",
        recommended: false,
      },
    },
    aiPermissionsHeading: "Action permissions",
    aiPermissionsScope: "Execution limits",
    editDocuments: "Edit documents",
    createFolders: "Create and move folders",
    createDocuments: "Create, duplicate, and move documents",
    deleteDocuments: "Delete documents and folders",
    agenticHeading: "Agentic tasks",
    agenticDescription: "Set maximum limits and permissions. Depth is chosen in the prompt with Reasoning mode so tokens are not spent by default.",
    agenticModeHint: "Controlled from prompt",
    webResearchHeading: "Web research",
    webResearchDescription: "Allows tasks that consult external sources and show the sources used. Actions still go through confirmation.",
    agenticConfirmHeading: "Confirm before applying",
    agenticConfirmDescription: "Tasks can prepare changes, but cannot create or modify documents without a visible checkpoint.",
    agenticMaxSteps: "Steps",
    agenticMaxDocuments: "Documents",
    agenticMaxSources: "Sources",
    agenticMaxCost: "Max cost",
    ragHeading: "Index project documentation",
    ragDescription: "Allows project-wide semantic search. Markdown content will be sent to OpenAI for indexing.",
    ragStatus: "Status",
    ragDocuments: "Indexed documents",
    ragFailed: "failed",
    ragExactReady: "local exact search ready",
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
  const [activeSection, setActiveSection] = useState<AppSettingsSection>("services");

  useEffect(() => {
    if (open) setActiveSection("services");
  }, [open]);

  return [activeSection, setActiveSection];
}
