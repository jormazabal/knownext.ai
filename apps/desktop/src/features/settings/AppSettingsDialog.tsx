import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Activity, ArrowRight, Brain, Check, ChevronDown, Copy, Eye, FolderOpen, Gauge, Globe2, Grid2X2, Image as ImageIcon, KeyRound, Languages, ListChecks, Mic, Monitor, Moon, Paintbrush, RefreshCw, RotateCcw, Server, Settings, ShieldCheck, Sun, Trash2, Underline, Wrench, X } from "lucide-react";
import { AiModelSelector, type AiModelSelectorOption, type AiModelSelectorTone } from "../../components/ai/AiModelSelector";
import { defaultAiConfig } from "../../lib/api/config";
import { accentPalettes } from "../../lib/theme/appearance";
import type { AiConfigStatus, AiImageGenerationModelId, AiIndexStatusResponse, AiModelId, AiTranscriptionLanguage, AiVisionModelId, AppearanceAccentColor, AppearanceConfig, AppearanceThemeMode, DiagnosticsConfig } from "../../types/domain";
import type { TraceLogStatus } from "../../lib/runtime/logging";
import type { BackendPortConfig, RuntimeServicesStatus } from "../../lib/runtime/services";

type AppSettingsSection = "summary" | "interface" | "ai" | "capabilities" | "system";

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
const aiImageGenerationModelIds: AiImageGenerationModelId[] = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1-mini", "gpt-image-1"];
const transcriptionLanguages: AiTranscriptionLanguage[] = ["auto", "es", "en", "fr", "de", "it", "pt", "ca", "eu", "gl"];

const aiModelMeter: Record<AiModelId, { intelligence: number; cost: number }> = {
  "gpt-5.5": { intelligence: 6, cost: 5 },
  "gpt-5.4": { intelligence: 5, cost: 3 },
  "gpt-5.4-mini": { intelligence: 4, cost: 2 },
  "gpt-5.4-nano": { intelligence: 2, cost: 1 },
};

const aiModelPriceParts: Record<AiModelId, { input: string; output: string }> = {
  "gpt-5.5": { input: "$5.00", output: "$30.00" },
  "gpt-5.4": { input: "$2.50", output: "$15.00" },
  "gpt-5.4-mini": { input: "$0.75", output: "$4.50" },
  "gpt-5.4-nano": { input: "$0.20", output: "$1.25" },
};

const aiModelTagTone: Record<AiModelId, AiModelSelectorTone> = {
  "gpt-5.5": "maximum",
  "gpt-5.4": "advanced",
  "gpt-5.4-mini": "recommended",
  "gpt-5.4-nano": "economy",
};

type PermissionModeId = "conservative" | "assisted" | "productive" | "custom";

const permissionModePresets: Record<Exclude<PermissionModeId, "custom">, AiConfigStatus["permissions"]> = {
  conservative: {
    editDocuments: false,
    createFolders: false,
    createDocuments: false,
    deleteDocumentsAndFolders: false,
    generateImages: false,
    createImageAssets: false,
    insertImagesIntoDocuments: false,
    useDocumentContextForImageGeneration: false,
  },
  assisted: {
    editDocuments: true,
    createFolders: false,
    createDocuments: false,
    deleteDocumentsAndFolders: false,
    generateImages: true,
    createImageAssets: false,
    insertImagesIntoDocuments: false,
    useDocumentContextForImageGeneration: true,
  },
  productive: {
    editDocuments: true,
    createFolders: true,
    createDocuments: true,
    deleteDocumentsAndFolders: true,
    generateImages: true,
    createImageAssets: true,
    insertImagesIntoDocuments: true,
    useDocumentContextForImageGeneration: true,
  },
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
    { id: "summary", label: text.summaryNav, description: text.summaryNavDescription, icon: Grid2X2 },
    { id: "interface", label: text.interfaceNav, description: text.interfaceNavDescription, icon: Monitor },
    { id: "ai", label: text.aiNav, description: text.aiNavDescription, icon: Brain },
    { id: "capabilities", label: text.capabilitiesNav, description: text.capabilitiesNavDescription, icon: Wrench },
    { id: "system", label: text.systemNav, description: text.systemNavDescription, icon: Settings },
  ];

  if (!open) return null;

  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[95] grid place-items-center bg-black/20 px-4 py-6">
      <section
        className="flex max-h-[min(760px,calc(100vh-48px))] w-[min(780px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-settings-title"
      >
        <header className="flex items-start justify-between gap-4 px-5 py-4">
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
            className="knownext-document-tabs flex h-9 shrink-0 items-end overflow-y-hidden border-b border-line bg-white"
            aria-label={text.sectionsLabel}
            role="tablist"
          >
            <div className="flex h-full min-w-0 flex-1 items-end overflow-x-auto overflow-y-hidden">
              {sections.map((section, index) => (
                <button
                  key={section.id}
                  id={`app-settings-tab-${section.id}`}
                  className={[
                    "knownext-document-tab group relative flex h-full shrink-0 items-center gap-1.5 border-r border-t border-line px-3 text-[11px] transition",
                    index === 0 ? "border-l" : "",
                    activeSection === section.id
                      ? "knownext-document-tab-active bg-white font-semibold text-ink-primary"
                      : "text-ink-primary hover:bg-panel",
                  ].join(" ")}
                  role="tab"
                  aria-selected={activeSection === section.id}
                  aria-controls={`app-settings-panel-${section.id}`}
                  data-tooltip={section.description}
                  data-tooltip-placement="bottom"
                  onClick={() => setActiveSection(section.id)}
                >
                  <section.icon size={14} className={["shrink-0", activeSection === section.id ? "text-brand-orange" : "text-ink-secondary"].join(" ")} />
                  <span>{section.label}</span>
                  {activeSection === section.id ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-brand-orange" /> : null}
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
            {activeSection === "summary" ? (
              <SummarySettings
                appearance={appearance}
                diagnostics={diagnostics}
                ai={ai}
                aiIndexStatus={aiIndexStatus}
                runtimeServicesStatus={runtimeServicesStatus}
                text={text}
                onSelectSection={setActiveSection}
              />
            ) : activeSection === "interface" ? (
              <AppearanceSettings appearance={appearance} text={text} onAppearanceChange={onAppearanceChange} />
            ) : activeSection === "ai" ? (
              <AiDocumentalSettings
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
            ) : activeSection === "capabilities" ? (
              <CapabilitiesSettings ai={ai} text={text} onAiChange={onAiChange} onReindexImages={onReindexImages} />
            ) : (
              <SystemSettings
                diagnostics={diagnostics}
                traceLogStatus={traceLogStatus}
                runtimeServicesStatus={runtimeServicesStatus}
                refreshing={runtimeServicesRefreshing}
                text={text}
                onDiagnosticsChange={onDiagnosticsChange}
                onOpenTraceLogFolder={onOpenTraceLogFolder}
                onRefresh={onRefreshRuntimeServices}
                onRestartBackendService={onRestartBackendService}
                onUpdateBackendPortConfig={onUpdateBackendPortConfig}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SummarySettings({
  appearance,
  diagnostics,
  ai,
  aiIndexStatus,
  runtimeServicesStatus,
  text,
  onSelectSection,
}: {
  appearance: AppearanceConfig;
  diagnostics: DiagnosticsConfig;
  ai: AiConfigStatus;
  aiIndexStatus: AiIndexStatusResponse | null;
  runtimeServicesStatus: RuntimeServicesStatus | null;
  text: SettingsCopy;
  onSelectSection: (section: AppSettingsSection) => void;
}) {
  const settingsAi = normalizeAiStatus(ai);
  const backend = runtimeServicesStatus?.services.find((service) => service.id === "backend") ?? null;
  const model = text.aiModels[settingsAi.model];
  const modelMeter = aiModelMeter[settingsAi.model];
  const modelPrice = aiModelPriceParts[settingsAi.model];
  const accentPalette = accentPalettes.find((palette) => palette.id === appearance.primaryColor) ?? accentPalettes[0];
  const indexedCount = aiIndexStatus?.indexedDocumentCount ?? 0;
  const documentCount = aiIndexStatus?.documentCount ?? 0;

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-brand-hover text-brand-orange">
            <Grid2X2 size={24} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[18px] font-semibold text-ink-primary">{text.summaryHeading}</h3>
            <p className="mt-2 max-w-[640px] text-[11px] leading-5 text-ink-secondary">{text.summaryDescription}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard
          icon={<Monitor size={20} />}
          title={text.interfaceNav}
          description={text.summaryInterfaceDescription}
          actionLabel={text.goToInterface}
          actionIcon={<Monitor size={14} />}
          onAction={() => onSelectSection("interface")}
        >
          <div className="overflow-hidden rounded-md border border-line">
            <SummaryRow icon={<Sun size={13} />} label={text.themeHeading} value={describeThemeMode(appearance.themeMode, text)} />
            <SummaryRow icon={<Languages size={13} />} label={text.languageLabel} value={describeLanguage(appearance.language)} />
            <SummaryRow
              icon={<Paintbrush size={13} />}
              label={text.primaryColorHeading}
              value={accentPalette.label ?? text.primaryColorDefault}
              valuePrefix={<ColorDot color={accentPalette.projectColor} />}
            />
            <SummaryRow icon={<Gauge size={13} />} label={text.zoomLabel} value={`${appearance.zoomPercent}%`} />
            <SummaryRow icon={<Underline size={13} />} label={text.underlineToggleLabel} value={appearance.markdownExtendedUnderlineEnabled ? text.enabled : text.disabled} />
          </div>
        </SummaryCard>

        <SummaryCard
          icon={<Brain size={20} />}
          title={text.aiNav}
          description={text.summaryAiDescription}
          actionLabel={text.goToAi}
          actionIcon={<Brain size={14} />}
          onAction={() => onSelectSection("ai")}
        >
          <div className="overflow-hidden rounded-md border border-line">
            <SummaryRow
              icon={<Server size={13} />}
              label={text.summaryProviderLabel}
              value={(
                <span className="inline-flex items-center gap-2">
                  <span>OpenAI</span>
                  <StatusPill label="" value={settingsAi.openaiKeyConfigured ? text.enabled : text.disabled} tone={settingsAi.openaiKeyConfigured ? "success" : "neutral"} />
                </span>
              )}
            />
            <SummaryRow
              icon={<Brain size={13} />}
              label={text.summaryModelLabel}
              value={(
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className="truncate">{settingsAi.model}</span>
                  <span className="shrink-0 rounded bg-brand-hover px-2 py-0.5 text-[9px] font-semibold text-brand-orange">{model.recommended ? text.recommendedModel : model.name}</span>
                </span>
              )}
            />
            <SummaryRow icon={<Gauge size={13} />} label={text.summaryCapabilityMetric} value={<SummaryMeter value={modelMeter.intelligence} />} />
            <SummaryRow
              icon={<Activity size={13} />}
              label={text.summaryCostMetric}
              value={(
                <span className="inline-flex min-w-0 items-center gap-3">
                  <span className="shrink-0">{modelPrice.input} / {modelPrice.output}</span>
                  <SummaryMeter value={modelMeter.cost} color="green" />
                </span>
              )}
            />
            <SummaryRow icon={<FolderOpen size={13} />} label={text.ragDocuments} value={`${indexedCount}/${documentCount}`} />
            <SummaryRow icon={<Eye size={13} />} label={text.summarySearch} value={aiIndexStatus?.localExactReady ? text.ragExactReady : describeIndexStatus(aiIndexStatus?.status ?? settingsAi.rag.status)} />
            <SummaryRow icon={<Server size={13} />} label={text.summaryVectorStore} value={settingsAi.rag.vectorStoreId || aiIndexStatus?.vectorStoreId ? text.enabled : text.summaryNone} />
          </div>
        </SummaryCard>

        <SummaryCard
          icon={<Wrench size={20} />}
          title={text.capabilitiesNav}
          description={text.summaryCapabilitiesDescription}
          actionLabel={text.goToCapabilities}
          actionIcon={<Wrench size={14} />}
          onAction={() => onSelectSection("capabilities")}
        >
          <div className="overflow-hidden rounded-md border border-line">
            <SummaryRow icon={<ImageIcon size={13} />} label={text.summaryImages} value={settingsAi.imageGeneration.model} valueTone="brand" />
            <SummaryRow icon={<Mic size={13} />} label={text.transcriptionHeading} value={settingsAi.transcription.model} valueTone="brand" />
            <SummaryRow icon={<ShieldCheck size={13} />} label={text.aiPermissionsHeading} value={text.summaryProductive} valueTone="brand" />
            <SummaryRow icon={<Gauge size={13} />} label={text.agenticHeading} value={settingsAi.agentic.webResearchEnabled ? text.enabled : text.disabled} valueTone={settingsAi.agentic.webResearchEnabled ? "success" : "neutral"} />
          </div>
        </SummaryCard>

        <SummaryCard
          icon={<Settings size={20} />}
          title={text.systemNav}
          description={text.summarySystemDescription}
          actionLabel={text.goToSystem}
          actionIcon={<Settings size={14} />}
          onAction={() => onSelectSection("system")}
        >
          <div className="overflow-hidden rounded-md border border-line">
            <SummaryRow icon={<Server size={13} />} label={text.versionLabel} value={backend?.version ?? text.unavailableValue} />
            <SummaryRow icon={<Settings size={13} />} label={text.profileLabel} value={backend?.profile ?? text.unavailableValue} />
            <SummaryRow icon={<Activity size={13} />} label={text.portLabel} value={backend?.port ? String(backend.port) : text.unavailableValue} />
            <SummaryRow icon={<ListChecks size={13} />} label={text.traceToggleLabel} value={diagnostics.traceLoggingEnabled ? text.enabled : text.disabled} />
            <SummaryRow icon={<Check size={13} />} label={text.servicesNav} value={backend?.statusLabel ?? text.servicesPending} success={backend?.status === "running"} />
          </div>
        </SummaryCard>
      </div>

      <section className="rounded-md border border-line px-4 py-3">
        <div className="mb-3">
          <h3 className="text-[13px] font-semibold text-ink-primary">{text.summaryModelsHeading}</h3>
          <p className="mt-1 text-[11px] text-ink-secondary">{text.summaryModelsDescription}</p>
        </div>
        <div className="overflow-hidden rounded-md border border-line">
          <SummaryModelRow label={text.summaryMainAi} description={text.aiModelHeading} modelId={settingsAi.model} capability={modelMeter.intelligence} cost={modelMeter.cost} price={`${modelPrice.input} / ${modelPrice.output}`} tag={model.recommended ? text.recommendedModel : null} capabilityLabel={text.summaryCapabilityMetric} costLabel={text.summaryCostMetric} />
          <SummaryModelRow label={text.summaryImageAi} description={text.imageGenerationHeading} modelId={settingsAi.imageGeneration.model} capability={4} cost={3} price={text.summaryImagePricing} tag={text.recommendedModel} capabilityLabel={text.summaryCapabilityMetric} costLabel={text.summaryCostMetric} />
          <SummaryModelRow label={text.summaryAudioAi} description={text.transcriptionHeading} modelId={settingsAi.transcription.model} capability={2} cost={1} price={text.summaryAudioPricing} tag={text.summaryEconomy} capabilityLabel={text.summaryCapabilityMetric} costLabel={text.summaryCostMetric} />
        </div>
      </section>

    </div>
  );
}

function CapabilitiesSettings({
  ai,
  text,
  onAiChange,
  onReindexImages,
}: {
  ai: AiConfigStatus;
  text: SettingsCopy;
  onAiChange: (ai: AiConfigStatus) => void;
  onReindexImages: () => void;
}) {
  const [localAi, setLocalAi] = useState<AiConfigStatus>(() => normalizeAiStatus(ai));
  const localAiRef = useRef<AiConfigStatus>(normalizeAiStatus(ai));
  const settingsAi = localAi;
  const imageModelOptions = buildImageGenerationModelOptions(text);
  const visionModelOptions = buildVisionModelOptions(text);

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

  function updateImageGeneration(nextImageGeneration: Partial<AiConfigStatus["imageGeneration"]>) {
    const currentAi = localAiRef.current;
    commitAi({
      ...currentAi,
      imageGeneration: {
        ...currentAi.imageGeneration,
        ...nextImageGeneration,
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

  function applyPermissionMode(mode: Exclude<PermissionModeId, "custom">) {
    const currentAi = localAiRef.current;
    commitAi({
      ...currentAi,
      permissions: { ...permissionModePresets[mode] },
    });
  }

  function updateAgentic(nextAgentic: Partial<AiConfigStatus["agentic"]>) {
    const currentAi = localAiRef.current;
    commitAi({
      ...currentAi,
      agentic: {
        ...currentAi.agentic,
        ...nextAgentic,
      },
    });
  }

  function toggleFavoriteLanguage(language: AiTranscriptionLanguage) {
    const currentFavorites = settingsAi.transcription.favoriteLanguages;
    const nextFavorites = currentFavorites.includes(language)
      ? currentFavorites.filter((favoriteLanguage) => favoriteLanguage !== language)
      : [...currentFavorites, language];
    updateTranscription({ favoriteLanguages: nextFavorites.filter((favoriteLanguage) => favoriteLanguage !== "auto") });
  }

  const permissionMode = getPermissionMode(settingsAi.permissions);

  return (
    <div className="space-y-5">
      <section className="flex items-start gap-3">
        <Wrench size={24} className="mt-1 shrink-0 text-brand-orange" />
        <div className="min-w-0">
          <h3 className="text-[20px] font-semibold text-ink-primary">{text.capabilitiesNav}</h3>
          <p className="mt-2 text-[12px] leading-5 text-ink-secondary">{text.capabilitiesDescription}</p>
        </div>
      </section>

      <CapabilitySection icon={<ImageIcon size={22} />} title={text.capabilityImagesTitle} description={text.capabilityImagesDescription}>
        <div className="grid gap-4 xl:grid-cols-2">
          <CapabilityPanel
            icon={<ImageIcon size={15} />}
            title={text.capabilityGenerateImagesTitle}
            description={text.capabilityGenerateImagesDescription}
            enabled={settingsAi.imageGeneration.enabled}
            onToggle={() => updateImageGeneration({ enabled: !settingsAi.imageGeneration.enabled })}
          >
            <CapabilityField label={text.imageGenerationModelHeading}>
              <AiModelSelector
                value={settingsAi.imageGeneration.model}
                options={imageModelOptions}
                onChange={(model) => updateImageGeneration({ model })}
                variant="compact"
                title={text.aiModelSelectorTitle}
                recommendedOnlyLabel={text.aiModelRecommendedOnly}
                guideLabel={text.aiModelGuide}
                guideDescription={text.aiModelGuideDescription}
              />
            </CapabilityField>

            <div className="grid gap-3 md:grid-cols-3">
              <CapabilitySelect label={text.imageGenerationSize} value={settingsAi.imageGeneration.size} onChange={(value) => updateImageGeneration({ size: value as AiConfigStatus["imageGeneration"]["size"] })}>
                <option value="auto">Auto</option>
                <option value="1024x1024">1024 x 1024</option>
                <option value="1536x1024">1536 x 1024</option>
                <option value="1024x1536">1024 x 1536</option>
              </CapabilitySelect>
              <CapabilitySelect label={text.imageGenerationQuality} value={settingsAi.imageGeneration.quality} onChange={(value) => updateImageGeneration({ quality: value as AiConfigStatus["imageGeneration"]["quality"] })}>
                <option value="auto">Auto</option>
                <option value="low">{text.qualityLow}</option>
                <option value="medium">{text.qualityMedium}</option>
                <option value="high">{text.qualityHigh}</option>
              </CapabilitySelect>
              <CapabilitySelect label={text.imageGenerationFormat} value={settingsAi.imageGeneration.outputFormat} onChange={(value) => updateImageGeneration({ outputFormat: value as AiConfigStatus["imageGeneration"]["outputFormat"] })}>
                <option value="png">PNG</option>
                <option value="webp">WEBP</option>
                <option value="jpeg">JPEG</option>
              </CapabilitySelect>
            </div>

            <div className="rounded-md border border-orange-200 bg-orange-50/45 p-3">
              <p className="text-[11px] leading-5 text-ink-secondary">{text.imageGenerationFolderExplanation}</p>
              <div className="mt-3 grid gap-3">
                <CapabilitySelect
                  label={text.imageGenerationFolder}
                  value={settingsAi.imageGeneration.defaultFolder}
                  help={text.imageGenerationFolderHelp}
                  onChange={(value) => updateImageGeneration({ defaultFolder: value as AiConfigStatus["imageGeneration"]["defaultFolder"] })}
                >
                  <option value="document_folder">{text.imageGenerationFolderDocument}</option>
                  <option value="generated_assets">{text.imageGenerationFolderAssets}</option>
                  <option value="custom_folder">{text.imageGenerationFolderCustom}</option>
                </CapabilitySelect>
                {settingsAi.imageGeneration.defaultFolder === "custom_folder" ? (
                  <CapabilityField label={text.imageGenerationCustomFolder} help={text.imageGenerationCustomFolderHelp}>
                    <input
                      className="h-9 w-full rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
                      value={settingsAi.imageGeneration.customFolderPath}
                      placeholder={text.imageGenerationCustomFolderPlaceholder}
                      onChange={(event) => updateImageGeneration({ customFolderPath: event.target.value })}
                    />
                  </CapabilityField>
                ) : null}
              </div>
            </div>

            <div className="divide-y divide-line border-t border-line pt-2">
              <CapabilityToggleRow icon={<SaveIcon />} label={text.imageGenerationStorePrompt} description={text.imageGenerationStorePromptDescription} enabled={settingsAi.imageGeneration.storePromptMetadata} onToggle={() => updateImageGeneration({ storePromptMetadata: !settingsAi.imageGeneration.storePromptMetadata })} />
              <CapabilityToggleRow icon={<Check size={14} />} label={text.imageGenerationConfirmInsert} description={text.imageGenerationConfirmInsertDescription} enabled={settingsAi.imageGeneration.confirmBeforeDocumentInsert} onToggle={() => updateImageGeneration({ confirmBeforeDocumentInsert: !settingsAi.imageGeneration.confirmBeforeDocumentInsert })} />
              <CapabilityToggleRow icon={<LinkIcon />} label={text.imageGenerationConfirmSources} description={text.imageGenerationConfirmSourcesDescription} enabled={settingsAi.imageGeneration.confirmBeforeUsingMultipleSources} onToggle={() => updateImageGeneration({ confirmBeforeUsingMultipleSources: !settingsAi.imageGeneration.confirmBeforeUsingMultipleSources })} />
            </div>
          </CapabilityPanel>

          <CapabilityPanel
            icon={<Eye size={15} />}
            title={text.capabilityUnderstandImagesTitle}
            description={text.capabilityUnderstandImagesDescription}
            enabled={settingsAi.vision.enabled}
            onToggle={() => updateVision({ enabled: !settingsAi.vision.enabled })}
          >
            <CapabilityField label={text.visionModelHeading}>
              <AiModelSelector
                value={settingsAi.vision.model}
                options={visionModelOptions}
                onChange={(model) => updateVision({ model })}
                variant="compact"
                title={text.aiModelSelectorTitle}
                recommendedOnlyLabel={text.aiModelRecommendedOnly}
                guideLabel={text.aiModelGuide}
                guideDescription={text.aiModelGuideDescription}
              />
            </CapabilityField>

            <div className="grid gap-3 md:grid-cols-1">
              <CapabilitySelect label={text.visionDetailLabel} value={settingsAi.vision.detail} onChange={(value) => updateVision({ detail: value as AiConfigStatus["vision"]["detail"] })}>
                <option value="auto">{text.visionDetailAuto}</option>
                <option value="low">{text.visionDetailLow}</option>
                <option value="high">{text.visionDetailHigh}</option>
              </CapabilitySelect>
            </div>

            <CapabilitySelect label={text.visionMaxImageSize} value={String(settingsAi.vision.maxImageSizeMb)} onChange={(value) => updateVision({ maxImageSizeMb: Number(value) })}>
              <option value="6">6 MB</option>
              <option value="12">12 MB</option>
              <option value="25">25 MB</option>
              <option value="50">50 MB</option>
            </CapabilitySelect>

            <div className="divide-y divide-line border-t border-line pt-2">
              <CapabilityToggleRow icon={<FolderOpen size={14} />} label={text.visionIndexHeading} description={text.visionIndexDescription} enabled={settingsAi.vision.imageIndexingEnabled} onToggle={() => updateVision({ imageIndexingEnabled: !settingsAi.vision.imageIndexingEnabled })} />
              <CapabilityToggleRow icon={<Server size={14} />} label={text.visionStoreHeading} description={text.visionStoreDescription} enabled={settingsAi.vision.storeVisualDescriptions} onToggle={() => updateVision({ storeVisualDescriptions: !settingsAi.vision.storeVisualDescriptions })} />
            </div>

            <div className="flex justify-end">
              <button className="inline-flex h-8 items-center gap-2 rounded-md border border-brand-orange bg-white px-3 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover" type="button" onClick={onReindexImages}>
                <RefreshCw size={13} />
                {text.reindexImages}
              </button>
            </div>
          </CapabilityPanel>
        </div>
      </CapabilitySection>

      <CapabilitySection icon={<Mic size={22} />} title={text.capabilityAudioTitle} description={text.capabilityAudioDescription} enabled={settingsAi.transcription.enabled} onToggle={() => updateTranscription({ enabled: !settingsAi.transcription.enabled })}>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.3fr)]">
          <CapabilityModelCard modelId={settingsAi.transcription.model} name={text.transcriptionModelName} description={text.transcriptionModelDescription} capability={5} cost={4} inputPrice="$0.006" outputPrice="$0.018" tag={text.recommendedModel} />
          <div className="grid gap-3 md:grid-cols-2">
            <CapabilitySelect label={text.transcriptionDefaultLanguage} value={settingsAi.transcription.defaultLanguage} help={text.transcriptionDefaultLanguageHelp} onChange={(value) => updateTranscription({ defaultLanguage: value as AiTranscriptionLanguage })}>
              {transcriptionLanguages.map((language) => (
                <option key={language} value={language}>{text.transcriptionLanguages[language]}</option>
              ))}
            </CapabilitySelect>
            <CapabilityField label={text.transcriptionFavoriteLanguages} help={text.transcriptionFavoriteLanguagesHelp}>
              <LanguageCheckSelect
                languages={transcriptionLanguages.filter((language) => language !== "auto")}
                selectedLanguages={settingsAi.transcription.favoriteLanguages}
                labels={text.transcriptionLanguages}
                placeholder={text.transcriptionFavoriteLanguagesPlaceholder}
                onToggle={toggleFavoriteLanguage}
              />
            </CapabilityField>
          </div>
        </div>
      </CapabilitySection>

      <CapabilitySection icon={<ShieldCheck size={22} />} title={text.capabilityPermissionsTitle} description={text.capabilityPermissionsDescription}>
        <div className="grid gap-3 md:grid-cols-4">
          <PermissionModeCard selected={permissionMode === "conservative"} icon={<ShieldCheck size={20} />} title={text.permissionModeConservative} description={text.permissionModeConservativeDescription} onSelect={() => applyPermissionMode("conservative")} />
          <PermissionModeCard selected={permissionMode === "assisted"} icon={<Brain size={20} />} title={text.permissionModeAssisted} description={text.permissionModeAssistedDescription} onSelect={() => applyPermissionMode("assisted")} />
          <PermissionModeCard selected={permissionMode === "productive"} icon={<Activity size={20} />} title={text.permissionModeProductive} description={text.permissionModeProductiveDescription} onSelect={() => applyPermissionMode("productive")} />
          <PermissionModeCard selected={permissionMode === "custom"} icon={<Settings size={20} />} title={text.permissionModeCustom} description={text.permissionModeCustomDescription} />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="overflow-hidden rounded-md border border-line">
            <CapabilityPermissionRow icon={<ImageIcon size={14} />} label={text.editDocuments} description={text.editDocumentsDescription} enabled={settingsAi.permissions.editDocuments} onToggle={() => updatePermissions({ editDocuments: !settingsAi.permissions.editDocuments })} />
            <CapabilityPermissionRow icon={<FolderOpen size={14} />} label={text.createFolders} description={text.createFoldersDescription} enabled={settingsAi.permissions.createFolders} onToggle={() => updatePermissions({ createFolders: !settingsAi.permissions.createFolders })} />
            <CapabilityPermissionRow icon={<FileIcon />} label={text.createDocuments} description={text.createDocumentsDescription} enabled={settingsAi.permissions.createDocuments} onToggle={() => updatePermissions({ createDocuments: !settingsAi.permissions.createDocuments })} />
            <CapabilityPermissionRow icon={<Trash2 size={14} />} label={text.deleteDocuments} description={text.deleteDocumentsDescription} enabled={settingsAi.permissions.deleteDocumentsAndFolders} onToggle={() => updatePermissions({ deleteDocumentsAndFolders: !settingsAi.permissions.deleteDocumentsAndFolders })} />
          </div>
          <div className="overflow-hidden rounded-md border border-line">
            <CapabilityPermissionRow icon={<ImageIcon size={14} />} label={text.generateImages} description={text.generateImagesDescription} enabled={settingsAi.permissions.generateImages} onToggle={() => updatePermissions({ generateImages: !settingsAi.permissions.generateImages })} />
            <CapabilityPermissionRow icon={<FolderOpen size={14} />} label={text.createImageAssets} description={text.createImageAssetsDescription} enabled={settingsAi.permissions.createImageAssets} onToggle={() => updatePermissions({ createImageAssets: !settingsAi.permissions.createImageAssets })} />
            <CapabilityPermissionRow icon={<ImageIcon size={14} />} label={text.insertImagesIntoDocuments} description={text.insertImagesIntoDocumentsDescription} enabled={settingsAi.permissions.insertImagesIntoDocuments} onToggle={() => updatePermissions({ insertImagesIntoDocuments: !settingsAi.permissions.insertImagesIntoDocuments })} />
            <CapabilityPermissionRow icon={<Server size={14} />} label={text.useDocumentContextForImages} description={text.useDocumentContextForImagesDescription} enabled={settingsAi.permissions.useDocumentContextForImageGeneration} onToggle={() => updatePermissions({ useDocumentContextForImageGeneration: !settingsAi.permissions.useDocumentContextForImageGeneration })} />
          </div>
        </div>
        <p className="mt-3 rounded-md border border-orange-100 bg-brand-hover px-3 py-2 text-[11px] font-semibold text-brand-orange">{text.permissionScopeNotice}</p>
      </CapabilitySection>

      <CapabilitySection icon={<Gauge size={22} />} title={text.capabilityAgenticTitle} description={text.capabilityAgenticDescription} enabled={settingsAi.agentic.webResearchEnabled || settingsAi.agentic.confirmBeforeApplying} onToggle={() => updateAgentic({ webResearchEnabled: !settingsAi.agentic.webResearchEnabled })}>
        <div className="grid gap-3 md:grid-cols-2">
          <CapabilityToggleRow icon={<Globe2 size={15} />} label={text.agenticWebResearchHeading} description={text.agenticWebResearchDescription} enabled={settingsAi.agentic.webResearchEnabled} onToggle={() => updateAgentic({ webResearchEnabled: !settingsAi.agentic.webResearchEnabled })} bordered />
          <CapabilityToggleRow icon={<Check size={15} />} label={text.agenticConfirmHeading} description={text.agenticConfirmDescription} enabled={settingsAi.agentic.confirmBeforeApplying} onToggle={() => updateAgentic({ confirmBeforeApplying: !settingsAi.agentic.confirmBeforeApplying })} bordered />
        </div>
        <div className="mt-4">
          <p className="text-[11px] font-semibold text-ink-primary">{text.agenticLimitsHeading}</p>
          <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{text.agenticLimitsDescription}</p>
          <p className="mt-3 rounded-md border border-line bg-panel px-3 py-3 text-[10px] leading-4 text-ink-secondary">{text.agenticLimitsImpact}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <LimitField label={text.agenticMaxSteps} value={settingsAi.agentic.maxSteps} min={1} max={12} step={1} onChange={(maxSteps) => updateAgentic({ maxSteps })} />
            <LimitField label={text.agenticMaxDocuments} value={settingsAi.agentic.maxDocuments} min={1} max={30} step={1} onChange={(maxDocuments) => updateAgentic({ maxDocuments })} />
            <LimitField label={text.agenticMaxSources} value={settingsAi.agentic.maxSources} min={1} max={20} step={1} onChange={(maxSources) => updateAgentic({ maxSources })} />
            <LimitField label={text.agenticMaxCost} value={settingsAi.agentic.maxEstimatedCostEur} min={0.1} max={25} step={0.1} suffix="€" onChange={(maxEstimatedCostEur) => updateAgentic({ maxEstimatedCostEur })} />
          </div>
        </div>
      </CapabilitySection>
    </div>
  );
}

function CapabilitySection({
  icon,
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  enabled?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-white px-4 py-4">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-hover text-brand-orange">{icon}</span>
          <div className="min-w-0">
            <h4 className="text-[15px] font-semibold text-ink-primary">{title}</h4>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{description}</p>
          </div>
        </div>
        {typeof enabled === "boolean" && onToggle ? <Switch enabled={enabled} label={title} onToggle={onToggle} /> : null}
      </header>
      {children}
    </section>
  );
}

function getPermissionMode(permissions: AiConfigStatus["permissions"]): PermissionModeId {
  const mode = (Object.keys(permissionModePresets) as Array<Exclude<PermissionModeId, "custom">>).find((presetMode) => permissionsMatch(permissions, permissionModePresets[presetMode]));
  return mode ?? "custom";
}

function permissionsMatch(left: AiConfigStatus["permissions"], right: AiConfigStatus["permissions"]) {
  return (
    left.editDocuments === right.editDocuments &&
    left.createFolders === right.createFolders &&
    left.createDocuments === right.createDocuments &&
    left.deleteDocumentsAndFolders === right.deleteDocumentsAndFolders &&
    left.generateImages === right.generateImages &&
    left.createImageAssets === right.createImageAssets &&
    left.insertImagesIntoDocuments === right.insertImagesIntoDocuments &&
    left.useDocumentContextForImageGeneration === right.useDocumentContextForImageGeneration
  );
}

function CapabilityPanel({
  icon,
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-slate-50/35 px-4 py-4">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 shrink-0 text-brand-orange">{icon}</span>
          <div className="min-w-0">
            <h5 className="text-[12px] font-semibold text-ink-primary">{title}</h5>
            <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{description}</p>
          </div>
        </div>
        <Switch enabled={enabled} label={title} onToggle={onToggle} />
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function CapabilityField({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[9px] font-semibold uppercase text-ink-secondary">{label}</span>
      <span className="mt-1 block">{children}</span>
      {help ? <span className="mt-1 block text-[10px] leading-4 text-ink-secondary">{help}</span> : null}
    </label>
  );
}

function CapabilitySelect({ label, value, help, onChange, children }: { label: string; value: string; help?: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <CapabilityField label={label} help={help}>
      <select
        className="h-9 w-full rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </CapabilityField>
  );
}

function LanguageCheckSelect({
  languages,
  selectedLanguages,
  labels,
  placeholder,
  onToggle,
}: {
  languages: AiTranscriptionLanguage[];
  selectedLanguages: AiTranscriptionLanguage[];
  labels: Record<AiTranscriptionLanguage, string>;
  placeholder: string;
  onToggle: (language: AiTranscriptionLanguage) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabels = languages
    .filter((language) => selectedLanguages.includes(language))
    .map((language) => labels[language]);

  return (
    <div className="relative">
      <button
        type="button"
        className={[
          "flex h-9 w-full min-w-0 items-center justify-between gap-2 border bg-white px-3 text-left text-[11px] font-semibold text-ink-primary outline-none transition",
          open ? "rounded-t-md rounded-b-none border-brand-orange" : "rounded-md border-line hover:border-orange-200",
        ].join(" ")}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="truncate">{selectedLabels.length ? selectedLabels.join(", ") : placeholder}</span>
        <ChevronDown size={14} className={["shrink-0 text-ink-secondary transition", open ? "rotate-180" : ""].join(" ")} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-[115] -mt-px max-h-52 overflow-y-auto rounded-b-md border border-brand-orange bg-white shadow-menu" role="listbox" aria-multiselectable="true">
          {languages.map((language) => {
            const selected = selectedLanguages.includes(language);
            return (
              <button
                key={language}
                type="button"
                role="option"
                aria-selected={selected}
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-[11px] font-semibold text-ink-primary hover:bg-brand-hover"
                onClick={() => onToggle(language)}
              >
                <span className={["grid h-4 w-4 shrink-0 place-items-center rounded border", selected ? "border-brand-orange bg-brand-orange text-white" : "border-line text-transparent"].join(" ")}>
                  <Check size={11} strokeWidth={3} />
                </span>
                <span>{labels[language]}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CapabilityToggleRow({
  icon,
  label,
  description,
  enabled,
  onToggle,
  bordered,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  bordered?: boolean;
}) {
  return (
    <div className={["flex min-w-0 items-center justify-between gap-3 py-3", bordered ? "rounded-md border border-line bg-white px-3" : ""].join(" ")}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 shrink-0 text-ink-secondary">{icon}</span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-ink-primary">{label}</p>
          <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{description}</p>
        </div>
      </div>
      <Switch enabled={enabled} label={label} onToggle={onToggle} />
    </div>
  );
}

function PermissionModeCard({ icon, title, description, selected, onSelect }: { icon: ReactNode; title: string; description: string; selected?: boolean; onSelect?: () => void }) {
  return (
    <button
      type="button"
      className={["relative rounded-md border px-4 py-4 text-left transition", selected ? "border-brand-orange bg-brand-hover" : "border-line bg-white hover:border-orange-200 hover:bg-panel", onSelect ? "" : "cursor-default"].join(" ")}
      disabled={!onSelect}
      onClick={onSelect}
    >
      {selected ? <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-brand-orange text-white"><Check size={13} strokeWidth={3} /></span> : null}
      <span className={selected ? "text-brand-orange" : "text-ink-secondary"}>{icon}</span>
      <p className={["mt-3 text-[12px] font-semibold", selected ? "text-brand-orange" : "text-ink-primary"].join(" ")}>{title}</p>
      <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{description}</p>
    </button>
  );
}

function CapabilityPermissionRow({ icon, label, description, enabled, onToggle }: { icon: ReactNode; label: string; description: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-line px-3 py-3 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 shrink-0 text-ink-secondary">{icon}</span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-ink-primary">{label}</p>
          <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{description}</p>
        </div>
      </div>
      <Switch enabled={enabled} label={label} onToggle={onToggle} />
    </div>
  );
}

function CapabilityModelCard({ modelId, name, description, capability, cost, inputPrice, outputPrice, tag }: { modelId: string; name: string; description: string; capability: number; cost: number; inputPrice: string; outputPrice: string; tag: string }) {
  return (
    <div className="rounded-md border border-brand-orange bg-brand-hover/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Brain size={16} className="shrink-0 text-ink-secondary" />
            <p className="truncate text-[12px] font-semibold text-ink-primary">{modelId}</p>
            <span className="rounded bg-white px-2 py-0.5 text-[9px] font-semibold text-brand-orange">{tag}</span>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{name} · {description}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-semibold text-ink-primary">{inputPrice} / {outputPrice}</p>
          <p className="mt-1 text-[10px] text-ink-secondary">por 1M tokens</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <SummaryMetric label="Capacidad" value={capability} />
        <SummaryMetric label="Coste" value={cost} color="green" />
      </div>
    </div>
  );
}

function buildVisionModelOptions(text: SettingsCopy): Array<AiModelSelectorOption<AiVisionModelId>> {
  return aiVisionModelIds.map((modelId) => {
    const model = text.aiModels[modelId];
    const meter = aiModelMeter[modelId];
    const price = aiModelPriceParts[modelId];
    return {
      id: modelId,
      name: model.name,
      description: model.description,
      capability: meter.intelligence,
      cost: meter.cost,
      inputPrice: price.input,
      outputPrice: price.output,
      recommended: model.recommended,
      tag: {
        label: model.recommended ? text.recommendedModel : model.name,
        tone: aiModelTagTone[modelId],
      },
    };
  });
}

function buildImageGenerationModelOptions(text: SettingsCopy): Array<AiModelSelectorOption<AiImageGenerationModelId>> {
  return [
    { id: "gpt-image-2", name: text.imageModelGptImage2Name, description: text.imageModelGptImage2Description, capability: 6, cost: 4, inputPrice: "$0.005-$0.211", outputPrice: "", priceUnit: text.priceUnitPerImage, recommended: true, tag: { label: text.recommendedModel, tone: "recommended" } },
    { id: "gpt-image-1.5", name: text.imageModelGptImage15Name, description: text.imageModelGptImage15Description, capability: 5, cost: 3, inputPrice: "$0.009-$0.200", outputPrice: "", priceUnit: text.priceUnitPerImage, tag: { label: text.aiModels["gpt-5.4"].name, tone: "advanced" } },
    { id: "gpt-image-1-mini", name: text.imageModelGptImageMiniName, description: text.imageModelGptImageMiniDescription, capability: 3, cost: 1, inputPrice: "$0.005-$0.052", outputPrice: "", priceUnit: text.priceUnitPerImage, tag: { label: text.summaryEconomy, tone: "economy" } },
    { id: "gpt-image-1", name: text.imageModelGptImage1Name, description: text.imageModelGptImage1Description, capability: 4, cost: 4, inputPrice: "$0.011-$0.250", outputPrice: "", priceUnit: text.priceUnitPerImage, tag: { label: text.aiModels["gpt-5.5"].name, tone: "maximum" } },
  ];
}

function SaveIcon() {
  return (
    <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h8.1L20 7.4v11.1a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 5 18.5v-13Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3v6h7V3M8.5 21v-6h7v6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9.5 14.5 14.5 9.5M10.5 7.5l1.2-1.2a4 4 0 1 1 5.7 5.7l-1.2 1.2M13.5 16.5l-1.2 1.2a4 4 0 1 1-5.7-5.7l1.2-1.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3.5h6.5L18 8v12.5H7V3.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M13.5 3.5V8H18" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function SummaryCard({ icon, title, description, actionLabel, actionIcon, onAction, children }: { icon: ReactNode; title: string; description: string; actionLabel: string; actionIcon: ReactNode; onAction: () => void; children: ReactNode }) {
  return (
    <section className="flex min-h-[270px] flex-col rounded-md border border-line bg-slate-50/40 px-4 py-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 text-brand-orange">{icon}</span>
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold text-ink-primary">{title}</h4>
          <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{description}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      <div className="mt-4 flex justify-end">
        <button className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange" onClick={onAction}>
          {actionIcon}
          {actionLabel}
          <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  success,
  valuePrefix,
  valueTone = "neutral",
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  success?: boolean;
  valuePrefix?: ReactNode;
  valueTone?: "neutral" | "brand" | "success";
}) {
  const valueClass =
    success || valueTone === "success"
      ? "text-emerald-700"
      : valueTone === "brand"
        ? "text-brand-orange"
        : "text-ink-primary";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0">
      <span className="flex min-w-0 items-center gap-2">
        {icon ? <span className="shrink-0 text-ink-secondary">{icon}</span> : null}
        <span className="truncate text-[11px] font-medium text-ink-secondary">{label}</span>
      </span>
      <span className={["flex min-w-0 items-center justify-end gap-2 truncate text-right text-[11px] font-semibold", valueClass].join(" ")}>
        {valuePrefix}
        {typeof value === "string" ? <span className="truncate">{value}</span> : value}
      </span>
    </div>
  );
}

function SummaryCapability({ icon, title, description, value, tone }: { icon: ReactNode; title: string; description: string; value: string; tone: "brand" | "success" | "neutral" }) {
  const valueClass = tone === "success" ? "text-emerald-700" : tone === "brand" ? "text-brand-orange" : "text-ink-secondary";
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line px-3 py-3">
      <span className="text-ink-secondary">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-ink-primary">{title}</p>
        <p className="mt-1 truncate text-[10px] text-ink-secondary">{description}</p>
      </div>
      <span className={["max-w-[150px] truncate text-right text-[11px] font-semibold", valueClass].join(" ")}>{value}</span>
    </div>
  );
}

function SummaryModelRow({ label, description, modelId, capability, cost, price, tag, capabilityLabel, costLabel }: { label: string; description: string; modelId: string; capability: number; cost: number; price: string; tag?: string | null; capabilityLabel: string; costLabel: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(120px,0.8fr)_minmax(90px,0.7fr)_minmax(90px,0.7fr)_auto] items-center gap-3 border-b border-line px-3 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-ink-primary">{label}</p>
        <p className="mt-1 truncate text-[10px] text-ink-secondary">{description}</p>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-mono text-[11px] font-semibold text-ink-primary">{modelId}</span>
        {tag ? <span className="rounded bg-brand-hover px-2 py-0.5 text-[9px] font-semibold text-brand-orange">{tag}</span> : null}
      </div>
      <SummaryMetric label={capabilityLabel} value={capability} />
      <SummaryMetric label={costLabel} value={cost} color="green" />
      <div className="text-right">
        <p className="text-[11px] font-semibold text-ink-primary">{price}</p>
        <p className="mt-1 text-[10px] text-ink-secondary">por 1M tokens</p>
      </div>
    </div>
  );
}

function SummaryMetric({ label, value, color = "orange" }: { label: string; value: number; color?: "orange" | "green" }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] font-semibold text-ink-secondary">{label}</p>
      <SummaryMeter value={value} color={color} className="mt-1" />
    </div>
  );
}

function SummaryMeter({ value, color = "orange", className = "" }: { value: number; color?: "orange" | "green"; className?: string }) {
  return (
    <span className={["grid w-[118px] grid-cols-6 gap-1", className].join(" ")} aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <span
          key={index}
          className={[
            "h-1.5 rounded-full",
            index < value ? (color === "green" ? "bg-emerald-500" : "bg-brand-orange") : "bg-slate-200",
          ].join(" ")}
        />
      ))}
    </span>
  );
}

function ColorDot({ color }: { color: string }) {
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full border border-white ring-1 ring-slate-300"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

function describeThemeMode(themeMode: AppearanceThemeMode, text: SettingsCopy) {
  if (themeMode === "light") return text.themeLight;
  if (themeMode === "dark") return text.themeDark;
  return text.themeSystem;
}

function describeLanguage(language: AppearanceConfig["language"]) {
  return language === "en" ? "English" : "Español";
}

function normalizeAiStatus(ai: Partial<AiConfigStatus> | null | undefined): AiConfigStatus {
  const permissions = ai?.permissions as Partial<AiConfigStatus["permissions"]> | undefined;
  const rag = ai?.rag as Partial<AiConfigStatus["rag"]> | undefined;
  const vision = ai?.vision as Partial<AiConfigStatus["vision"]> | undefined;
  const imageGeneration = ai?.imageGeneration as Partial<AiConfigStatus["imageGeneration"]> | undefined;
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
      generateImages: permissions?.generateImages ?? defaultAiConfig.permissions.generateImages,
      createImageAssets: permissions?.createImageAssets ?? defaultAiConfig.permissions.createImageAssets,
      insertImagesIntoDocuments: permissions?.insertImagesIntoDocuments ?? defaultAiConfig.permissions.insertImagesIntoDocuments,
      useDocumentContextForImageGeneration: permissions?.useDocumentContextForImageGeneration ?? defaultAiConfig.permissions.useDocumentContextForImageGeneration,
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
    imageGeneration: {
      enabled: imageGeneration?.enabled ?? defaultAiConfig.imageGeneration.enabled,
      model: normalizeImageGenerationModel(imageGeneration?.model),
      size: normalizeImageGenerationSize(imageGeneration?.size),
      quality: normalizeImageGenerationQuality(imageGeneration?.quality),
      outputFormat: normalizeImageGenerationFormat(imageGeneration?.outputFormat),
      defaultFolder: normalizeImageGenerationFolder(imageGeneration?.defaultFolder),
      customFolderPath: normalizeProjectRelativeFolderPath(imageGeneration?.customFolderPath, defaultAiConfig.imageGeneration.customFolderPath),
      maxImagesPerPrompt: clampSettingsNumber(imageGeneration?.maxImagesPerPrompt, 1, 4, defaultAiConfig.imageGeneration.maxImagesPerPrompt),
      confirmBeforeDocumentInsert: imageGeneration?.confirmBeforeDocumentInsert ?? defaultAiConfig.imageGeneration.confirmBeforeDocumentInsert,
      confirmBeforeUsingMultipleSources: imageGeneration?.confirmBeforeUsingMultipleSources ?? defaultAiConfig.imageGeneration.confirmBeforeUsingMultipleSources,
      storePromptMetadata: imageGeneration?.storePromptMetadata ?? defaultAiConfig.imageGeneration.storePromptMetadata,
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

function normalizeImageGenerationModel(model: unknown): AiImageGenerationModelId {
  return aiImageGenerationModelIds.includes(model as AiImageGenerationModelId) ? model as AiImageGenerationModelId : defaultAiConfig.imageGeneration.model;
}

function normalizeImageGenerationSize(size: unknown): AiConfigStatus["imageGeneration"]["size"] {
  return ["auto", "1024x1024", "1536x1024", "1024x1536"].includes(String(size))
    ? size as AiConfigStatus["imageGeneration"]["size"]
    : defaultAiConfig.imageGeneration.size;
}

function normalizeImageGenerationQuality(quality: unknown): AiConfigStatus["imageGeneration"]["quality"] {
  return ["auto", "low", "medium", "high"].includes(String(quality))
    ? quality as AiConfigStatus["imageGeneration"]["quality"]
    : defaultAiConfig.imageGeneration.quality;
}

function normalizeImageGenerationFormat(format: unknown): AiConfigStatus["imageGeneration"]["outputFormat"] {
  return ["png", "webp", "jpeg"].includes(String(format))
    ? format as AiConfigStatus["imageGeneration"]["outputFormat"]
    : defaultAiConfig.imageGeneration.outputFormat;
}

function normalizeImageGenerationFolder(folder: unknown): AiConfigStatus["imageGeneration"]["defaultFolder"] {
  return ["document_folder", "generated_assets", "custom_folder"].includes(String(folder))
    ? folder as AiConfigStatus["imageGeneration"]["defaultFolder"]
    : defaultAiConfig.imageGeneration.defaultFolder;
}

function normalizeProjectRelativeFolderPath(path: unknown, fallback: string): string {
  const normalized = String(path ?? "").trim().replace(/\\/g, "/");
  const parts = normalized.split("/").map((part) => part.trim()).filter(Boolean);
  if (
    normalized.startsWith("/") ||
    normalized.includes(":") ||
    parts.length === 0 ||
    parts.some((part) => part === "." || part === "..")
  ) {
    return fallback;
  }
  return parts.join("/").slice(0, 160);
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

function AiDocumentalSettings({
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
  onReindexImages: () => void;
  onDeleteAiIndex: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [keyEditorOpen, setKeyEditorOpen] = useState(false);
  const [localAi, setLocalAi] = useState<AiConfigStatus>(() => normalizeAiStatus(ai));
  const localAiRef = useRef<AiConfigStatus>(normalizeAiStatus(ai));
  const settingsAi = localAi;
  const indexStatus = aiIndexStatus?.status ?? settingsAi.rag.status;
  const indexedCount = aiIndexStatus?.indexedDocumentCount ?? 0;
  const documentCount = aiIndexStatus?.documentCount ?? 0;
  const failedCount = aiIndexStatus?.failedDocumentCount ?? 0;
  const vectorStore = aiIndexStatus?.vectorStoreId ?? settingsAi.rag.vectorStoreId;
  const openAiKeySuffix = settingsAi.openaiKeyPreview?.slice(-4) ?? "";
  const modelOptions: Array<AiModelSelectorOption<AiModelId>> = aiModelIds.map((modelId) => {
    const model = text.aiModels[modelId];
    const meter = aiModelMeter[modelId];
    const price = aiModelPriceParts[modelId];
    return {
      id: modelId,
      name: model.name,
      description: model.description,
      capability: meter.intelligence,
      cost: meter.cost,
      inputPrice: price.input,
      outputPrice: price.output,
      recommended: model.recommended,
      tag: {
        label: model.recommended ? text.recommendedModel : model.name,
        tone: aiModelTagTone[modelId],
      },
    };
  });

  useEffect(() => {
    const normalizedAi = normalizeAiStatus(ai);
    localAiRef.current = normalizedAi;
    setLocalAi(normalizedAi);
    if (!normalizedAi.openaiKeyConfigured) setKeyEditorOpen(true);
  }, [ai]);

  function commitAi(nextAi: AiConfigStatus) {
    const normalizedAi = normalizeAiStatus(nextAi);
    localAiRef.current = normalizedAi;
    setLocalAi(normalizedAi);
    onAiChange(normalizedAi);
  }

  function updateModel(model: AiModelId) {
    commitAi({
      ...localAiRef.current,
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

  function saveApiKey() {
    const nextKey = apiKey.trim();
    if (!nextKey) return;
    onSaveOpenAiKey(nextKey);
    setApiKey("");
    setKeyEditorOpen(false);
  }

  return (
    <div className="space-y-5">
      <SettingsSectionIntro icon={<Brain size={24} />} title={text.aiHeading} description={text.aiDescription} />

      <SettingsPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-[15px] font-semibold text-ink-primary">{text.aiProviderHeading}</h4>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.aiProviderDescription}</p>
          </div>
          <StatusPill label="" value={settingsAi.openaiKeyConfigured ? text.enabled : text.disabled} tone={settingsAi.openaiKeyConfigured ? "success" : "neutral"} />
        </div>

        <div className="mt-4 rounded-md border border-line bg-white px-4 py-3">
          <div className="grid gap-4 md:grid-cols-[minmax(170px,0.75fr)_minmax(0,1fr)_auto] md:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-panel text-ink-primary">
                <Brain size={22} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-ink-primary">OpenAI</p>
                <p className="mt-1 text-[11px] text-ink-secondary">{settingsAi.openaiKeyConfigured ? text.openAiProviderActive : text.openAiProviderMissing}</p>
              </div>
            </div>
            <div className="min-w-0 border-line md:border-l md:pl-4">
              <p className="text-[11px] font-semibold text-ink-primary">{settingsAi.openaiKeyConfigured ? text.aiConfigured : text.aiMissingKey}</p>
              <p className="mt-1 break-all text-[11px] text-ink-secondary">
                {settingsAi.openaiKeyConfigured
                  ? `${text.openAiKeyLastChars}: ${openAiKeySuffix ? `•••• ${openAiKeySuffix}` : text.openAiKeyConfiguredGenericPlaceholder}`
                  : text.openAiKeyMissingPlaceholder}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {settingsAi.openaiKeyConfigured ? (
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange"
                  onClick={() => setKeyEditorOpen((isOpen) => !isOpen)}
                >
                  <KeyRound size={14} />
                  {text.updateKey}
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 bg-white px-3 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!settingsAi.openaiKeyConfigured}
                onClick={onDeleteOpenAiKey}
              >
                <Trash2 size={14} />
                {text.deleteKey}
              </button>
            </div>
          </div>

          {keyEditorOpen ? (
            <div className="mt-3 grid gap-2 border-t border-line pt-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <input
                className="h-9 min-w-0 rounded-md border border-line bg-white px-3 text-[11px] outline-none focus:border-brand-orange"
                type="password"
                value={apiKey}
                placeholder={text.openAiKeyPlaceholder}
                onChange={(event) => setApiKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveApiKey();
                }}
              />
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                disabled={!apiKey.trim()}
                onClick={saveApiKey}
              >
                <KeyRound size={14} />
                {text.saveKey}
              </button>
              {settingsAi.openaiKeyConfigured ? (
                <button
                  className="h-9 rounded-md border border-line px-3 text-[11px] font-semibold text-ink-primary hover:bg-panel"
                  onClick={() => {
                    setApiKey("");
                    setKeyEditorOpen(false);
                  }}
                >
                  {text.cancelKeyEdit}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-ink-secondary">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ink-secondary" />
          {text.aiKeyPrivacy}
        </p>
      </SettingsPanel>

      <SettingsPanel>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-[15px] font-semibold text-ink-primary">{text.aiModelHeading}</h4>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.aiModelDescription}</p>
          </div>
          <span className="rounded bg-panel px-3 py-1.5 text-[11px] font-semibold text-ink-secondary">
            {text.currentModelLabel}: <span className="font-mono text-ink-primary">{settingsAi.model}</span>
          </span>
        </div>
        <AiModelSelector
          value={settingsAi.model}
          options={modelOptions}
          onChange={updateModel}
          title={text.aiModelSelectorTitle}
          recommendedOnlyLabel={text.aiModelRecommendedOnly}
          guideLabel={text.aiModelGuide}
          guideDescription={text.aiModelGuideDescription}
        />
      </SettingsPanel>

      <SettingsPanel>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h4 className="text-[15px] font-semibold text-ink-primary">{text.ragContextHeading}</h4>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.ragDescription}</p>
          </div>
          <Switch enabled={settingsAi.rag.enabled} label={text.ragContextHeading} onToggle={() => updateRag(!settingsAi.rag.enabled)} />
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-line bg-white">
          <div className="grid gap-0 md:grid-cols-[minmax(0,1.25fr)_minmax(240px,0.75fr)]">
            <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
              <RagMetric label={text.ragStatus} value={describeIndexStatus(indexStatus)} tone={indexStatus === "updated" ? "success" : "warning"} />
              <RagMetric label={text.ragDocuments} value={`${indexedCount} / ${documentCount}`} />
              <RagMetric label={text.summaryVectorStore} value={vectorStore ? text.enabled : text.summaryNone} />
              <RagMetric label={text.ragExactReady} value={aiIndexStatus?.localExactReady ? text.enabled : text.disabled} tone={aiIndexStatus?.localExactReady ? "success" : "neutral"} />
            </div>
            <div className="border-t border-line bg-panel px-4 py-3 md:border-l md:border-t-0">
              <p className="text-[11px] leading-5 text-ink-secondary">{text.ragContextHelp}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-ink-secondary">{text.lastStatusLabel}</p>
              <p className={["mt-1 text-[11px] leading-5", aiIndexStatus?.error ? "text-red-700" : "text-ink-secondary"].join(" ")}>
                {aiIndexStatus?.error ?? (settingsAi.rag.lastIndexedAt ? formatDateTime(settingsAi.rag.lastIndexedAt) : text.noIndexGenerated)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-brand-orange bg-white px-3 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!settingsAi.rag.enabled || !settingsAi.openaiKeyConfigured}
                onClick={onRebuildAiIndex}
              >
                <RefreshCw size={14} />
                {text.rebuildIndex}
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-secondary hover:bg-panel disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!vectorStore}
                onClick={onDeleteAiIndex}
              >
                <Trash2 size={14} />
                {text.deleteIndex}
              </button>
            </div>
          </div>
        </div>
        {failedCount > 0 ? <p className="mt-2 text-[10px] leading-4 text-red-700">{text.ragFailed}: {failedCount}</p> : null}
      </SettingsPanel>
    </div>
  );
}

function SystemSettings({
  diagnostics,
  traceLogStatus,
  runtimeServicesStatus,
  refreshing,
  text,
  onDiagnosticsChange,
  onOpenTraceLogFolder,
  onRefresh,
  onRestartBackendService,
  onUpdateBackendPortConfig,
}: {
  diagnostics: DiagnosticsConfig;
  traceLogStatus: TraceLogStatus | null;
  runtimeServicesStatus: RuntimeServicesStatus | null;
  refreshing: boolean;
  text: SettingsCopy;
  onDiagnosticsChange: (diagnostics: Partial<DiagnosticsConfig>) => void;
  onOpenTraceLogFolder: () => void;
  onRefresh: () => void;
  onRestartBackendService: () => void;
  onUpdateBackendPortConfig: (config: BackendPortConfig) => void;
}) {
  const services = runtimeServicesStatus?.services ?? [];
  const backend = services.find((service) => service.id === "backend") ?? null;

  return (
    <div className="space-y-5">
      <SettingsSectionIntro icon={<Settings size={24} />} title={text.systemNav} description={text.systemDescription} />

      <SettingsPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-[15px] font-semibold text-ink-primary">{text.servicesHeading}</h4>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.servicesDescription}</p>
          </div>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {text.refreshServices}
          </button>
        </div>
        {runtimeServicesStatus?.checkedAt ? (
          <p className="mt-2 text-[10px] text-ink-secondary">{text.lastChecked}: {formatDateTime(runtimeServicesStatus.checkedAt)}</p>
        ) : null}

        {backend ? (
          <SystemServiceCard
            service={backend}
            text={text}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onRestartBackendService={onRestartBackendService}
            onUpdateBackendPortConfig={onUpdateBackendPortConfig}
          />
        ) : (
          <div className="mt-4 rounded-md border border-line bg-panel px-4 py-3 text-[11px] text-ink-secondary">{text.servicesPending}</div>
        )}
      </SettingsPanel>

      <SettingsPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-[15px] font-semibold text-ink-primary">{text.storageHeading}</h4>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.storageDescription}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SystemInfoRow icon={<FolderOpen size={14} />} label={text.appDataDirLabel} value={backend?.appDataDir ?? text.unavailableValue} mono />
          <SystemInfoRow icon={<FolderOpen size={14} />} label={text.expectedAppDataDirLabel} value={backend?.expectedAppDataDir || text.unavailableValue} mono />
          <SystemInfoRow icon={<Server size={14} />} label={text.endpointLabel} value={backend?.endpoint ?? text.unavailableValue} mono />
          <SystemInfoRow icon={<Activity size={14} />} label={text.profileLabel} value={backend?.profile ?? text.unavailableValue} />
        </div>
      </SettingsPanel>

      <SettingsPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-[15px] font-semibold text-ink-primary">{text.diagnosticsHeading}</h4>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.diagnosticsDescription}</p>
          </div>
          <Switch enabled={diagnostics.traceLoggingEnabled} label={text.traceToggleAria} onToggle={() => onDiagnosticsChange({ traceLoggingEnabled: !diagnostics.traceLoggingEnabled })} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <CompactToggle
            icon={<ListChecks size={14} />}
            label={text.traceToggleLabel}
            description={text.traceToggleDescription}
            enabled={diagnostics.traceLoggingEnabled}
            onToggle={() => onDiagnosticsChange({ traceLoggingEnabled: !diagnostics.traceLoggingEnabled })}
          />
          <SystemInfoRow icon={<FolderOpen size={14} />} label={text.logFolderLabel} value={traceLogStatus?.folderPath ?? text.preparingLogFolder} mono />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-orange-100 bg-brand-hover px-3 py-2">
          <p className="text-[11px] leading-5 text-ink-secondary">{text.logsSensitiveNotice}</p>
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!traceLogStatus?.folderPath}
            onClick={onOpenTraceLogFolder}
          >
            <FolderOpen size={14} />
            {text.openLogFolder}
          </button>
        </div>
      </SettingsPanel>

      <SettingsPanel>
        <h4 className="text-[15px] font-semibold text-ink-primary">{text.diagnosticToolsHeading}</h4>
        <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.diagnosticToolsDescription}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <DiagnosticAction icon={<RefreshCw size={16} />} title={text.refreshServicesTool} description={text.refreshServicesDescription} onClick={onRefresh} disabled={refreshing} />
          <DiagnosticAction icon={<Copy size={16} />} title={text.copyDiagnosticTool} description={text.copyDiagnosticDescription} onClick={() => backend ? void copyText(buildServiceDiagnostic(backend)) : undefined} disabled={!backend} />
          <DiagnosticAction icon={<RotateCcw size={16} />} title={text.restartBackendTool} description={text.restartBackendDescription} onClick={onRestartBackendService} disabled={!backend?.canRestart || refreshing} danger />
        </div>
      </SettingsPanel>
    </div>
  );
}

function SettingsSectionIntro({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <section className="flex items-start gap-3">
      <span className="mt-1 shrink-0 text-brand-orange">{icon}</span>
      <div className="min-w-0">
        <h3 className="text-[20px] font-semibold text-ink-primary">{title}</h3>
        <p className="mt-2 text-[12px] leading-5 text-ink-secondary">{description}</p>
      </div>
    </section>
  );
}

function SettingsPanel({ children }: { children: ReactNode }) {
  return <section className="rounded-md border border-line bg-white px-4 py-4">{children}</section>;
}

function RagMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "warning" }) {
  const valueClass = tone === "success" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-ink-primary";
  return (
    <div className="border-b border-line px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-[10px] font-semibold text-ink-secondary">{label}</p>
      <p className={["mt-2 text-[13px] font-semibold", valueClass].join(" ")}>{value}</p>
    </div>
  );
}

function SystemServiceCard({
  service,
  text,
  refreshing,
  onRefresh,
  onRestartBackendService,
  onUpdateBackendPortConfig,
}: {
  service: RuntimeServicesStatus["services"][number];
  text: SettingsCopy;
  refreshing: boolean;
  onRefresh: () => void;
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
  const stateTone = service.status === "running" ? "success" : service.status === "degraded" ? "warning" : "danger";

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

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-line bg-white">
      <div className="grid items-center gap-3 border-b border-line px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[12px] font-semibold text-ink-primary">{service.name}</p>
            <ServiceStatusBadge value={service.statusLabel} tone={stateTone} />
          </div>
          <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{service.description}</p>
        </div>
        <p className="text-[10px] text-ink-secondary">{service.startedAt ? `${text.startedAtLabel}: ${formatDateTime(service.startedAt)}` : ""}</p>
        <button
          className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {text.checkConnection}
        </button>
        <button
          className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-panel"
          onClick={() => setAdvancedOpen((isOpen) => !isOpen)}
        >
          {text.viewDetails}
          <ChevronDown size={14} className={advancedOpen ? "rotate-180 transition" : "transition"} />
        </button>
      </div>

      <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
        <RagMetric label={text.versionLabel} value={service.version ?? text.unavailableValue} tone={service.version === service.expectedVersion ? "success" : "warning"} />
        <RagMetric label={text.profileLabel} value={service.profile ?? text.unavailableValue} tone={service.profile === service.expectedProfile ? "success" : "warning"} />
        <RagMetric label={text.portLabel} value={String(service.port ?? text.unavailableValue)} />
        <RagMetric label={text.managedByLabel} value={service.managedBy ?? text.unavailableValue} />
      </div>

      {service.lastError ? (
        <div className="border-t border-line bg-red-50 px-4 py-3">
          <p className="text-[10px] font-semibold text-red-700">{text.lastErrorLabel}</p>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-red-700">{service.lastError}</pre>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange"
            onClick={() => void handleCopyDiagnostic()}
          >
            <Copy size={14} />
            {copyStatus === "copied" ? text.copyDiagnosticCopied : copyStatus === "failed" ? text.copyDiagnosticFailed : text.copyDiagnostic}
          </button>
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-brand-orange bg-white px-3 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!service.canRestart || refreshing}
            onClick={onRestartBackendService}
          >
            <RotateCcw size={14} />
            {text.restartBackend}
          </button>
        </div>
        {!service.canRestart ? <p className="text-[10px] text-ink-secondary">{text.restartUnavailable}</p> : null}
      </div>

      {advancedOpen ? (
        <div className="border-t border-line bg-panel px-4 py-3">
          <div className="grid gap-3 md:grid-cols-2">
            <SystemInfoRow icon={<Server size={14} />} label={text.expectedVersionLabel} value={service.expectedVersion} />
            <SystemInfoRow icon={<Activity size={14} />} label={text.expectedProfileLabel} value={service.expectedProfile} />
            {service.instanceId ? <SystemInfoRow icon={<Settings size={14} />} label={text.instanceLabel} value={service.instanceId} mono /> : null}
            {service.sidecarPath ? <SystemInfoRow icon={<FolderOpen size={14} />} label={text.sidecarPathLabel} value={service.sidecarPath} mono /> : null}
          </div>
          <div className="mt-3 rounded-md border border-line bg-white px-3 py-3">
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
        </div>
      ) : null}
    </div>
  );
}

function ServiceStatusBadge({ value, tone }: { value: string; tone: "success" | "warning" | "danger" }) {
  const toneClass = tone === "success"
    ? "bg-emerald-50 text-emerald-700"
    : tone === "warning"
      ? "bg-amber-50 text-amber-700"
      : "bg-red-50 text-red-700";
  const dotClass = tone === "success" ? "bg-emerald-500" : tone === "warning" ? "bg-amber-500" : "bg-red-500";
  return (
    <span className={["inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold", toneClass].join(" ")}>
      <span className={["h-1.5 w-1.5 rounded-full", dotClass].join(" ")} />
      {value}
    </span>
  );
}

function SystemInfoRow({ icon, label, value, mono }: { icon: ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-md border border-line bg-panel px-3 py-3">
      <span className="mt-0.5 shrink-0 text-ink-secondary">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-ink-secondary">{label}</p>
        <p className={["mt-1 break-all text-[11px] font-semibold text-ink-primary", mono ? "font-mono" : ""].join(" ")}>{value}</p>
      </div>
    </div>
  );
}

function DiagnosticAction({ icon, title, description, onClick, disabled, danger }: { icon: ReactNode; title: string; description: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      className={[
        "flex min-h-[72px] items-start gap-3 rounded-md border bg-white px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
        danger ? "border-red-200 hover:bg-red-50" : "border-line hover:border-orange-200 hover:bg-brand-hover",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={["mt-0.5 shrink-0", danger ? "text-red-600" : "text-ink-secondary"].join(" ")}>{icon}</span>
      <span className="min-w-0">
        <span className={["block text-[11px] font-semibold", danger ? "text-red-600" : "text-ink-primary"].join(" ")}>{title}</span>
        <span className="mt-1 block text-[10px] leading-4 text-ink-secondary">{description}</span>
      </span>
    </button>
  );
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
  const themeOptions: Array<{ value: AppearanceThemeMode; label: string; description: string; icon: typeof Monitor }> = [
    { value: "system", label: text.themeSystem, description: text.themeSystemDescription, icon: Monitor },
    { value: "light", label: text.themeLight, description: text.themeLightDescription, icon: Sun },
    { value: "dark", label: text.themeDark, description: text.themeDarkDescription, icon: Moon },
  ];
  const selectedPalette = accentPalettes.find((palette) => palette.id === appearance.primaryColor) ?? accentPalettes[0];

  function resetAppearance() {
    onAppearanceChange({
      themeMode: "system",
      primaryColor: "orange",
      zoomPercent: 100,
    });
  }

  return (
    <div className="space-y-5">
      <section className="flex items-start gap-3">
        <Monitor size={24} className="mt-1 shrink-0 text-brand-orange" />
        <div className="min-w-0">
          <h3 className="text-[20px] font-semibold text-ink-primary">{text.interfaceNav}</h3>
          <p className="mt-2 text-[12px] leading-5 text-ink-secondary">{text.appearanceDescription}</p>
        </div>
      </section>

      <div className="grid items-start gap-4 min-[680px]:grid-cols-2">
        <AppearancePanel title={text.themeHeading} description={text.themeDescription}>
          <div className="grid gap-2 min-[640px]:grid-cols-3">
            {themeOptions.map((option) => {
              const selected = appearance.themeMode === option.value;
              return (
                <ThemeChoice
                  key={option.value}
                  option={option}
                  selected={selected}
                  onSelect={() => onAppearanceChange({ themeMode: option.value })}
                />
              );
            })}
          </div>
        </AppearancePanel>

        <div className="grid gap-4">
          <AppearancePanel
            title={text.languageLabel}
            description={text.languageDescription}
            action={(
              <select
                className="h-9 min-w-[160px] rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
                value={appearance.language}
                onChange={(event) => onAppearanceChange({ language: event.target.value as AppearanceConfig["language"] })}
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            )}
          />

          <AppearancePanel
            title={text.primaryColorHeading}
            description={text.primaryColorDescription}
            action={(
              <span className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary">
                <ColorDot color={selectedPalette.projectColor} />
                {selectedPalette.label ?? text.primaryColorDefault}
                <ChevronDown size={13} className="text-ink-secondary" />
              </span>
            )}
          >
            <div className="flex flex-wrap justify-center gap-3" role="radiogroup" aria-label={text.primaryColorHeading}>
              {accentPalettes.map((palette) => {
                const selected = palette.id === appearance.primaryColor;
                return (
                  <button
                    key={palette.id}
                    className={[
                      "grid h-10 w-10 place-items-center rounded-full border bg-white transition",
                      selected ? "border-ink-primary shadow-subtle ring-2 ring-ink-primary/10" : "border-line hover:border-brand-orange",
                    ].join(" ")}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${text.primaryColorOption} ${palette.label}`}
                    data-tooltip={palette.label}
                    data-tooltip-placement="bottom"
                    onClick={() => onAppearanceChange({ primaryColor: palette.id as AppearanceAccentColor })}
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-full" style={{ backgroundColor: palette.projectColor }}>
                      {selected ? <Check size={14} className="text-white drop-shadow" strokeWidth={3} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </AppearancePanel>
        </div>

        <AppearancePanel className="min-[680px]:col-span-2" title={text.previewHeading} description={text.previewDescription}>
          <AppearancePreview text={text} />
        </AppearancePanel>

        <AppearancePanel title={text.zoomLabel} description={text.zoomDescription}>
          <div className="flex items-center justify-end">
            <span className="rounded-md border border-line bg-white px-3 py-2 font-mono text-[11px] font-semibold text-ink-primary">
              {appearance.zoomPercent}%
            </span>
          </div>
          <input
            id="app-zoom"
            className="mt-5 w-full cursor-default accent-brand-orange"
            type="range"
            min={85}
            max={125}
            step={5}
            value={appearance.zoomPercent}
            onChange={(event) => onAppearanceChange({ zoomPercent: Number(event.target.value) })}
          />
          <div className="relative mt-2 h-8 text-[11px] text-ink-secondary">
            <span className="absolute left-0 top-4">{text.zoomReduce}</span>
            <span className="absolute right-0 top-4">{text.zoomIncrease}</span>
            <span className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1 font-semibold text-brand-orange" style={{ left: "37.5%" }}>
              <span className="h-2 w-px bg-brand-orange" aria-hidden="true" />
              <span>100%</span>
            </span>
          </div>
        </AppearancePanel>

        <AppearancePanel title={text.markdownCompatibilityHeading} description={text.markdownCompatibilityDescription}>
          <div className="flex items-center justify-between gap-4 rounded-md border border-line bg-white px-3 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-ink-primary">{text.underlineToggleLabel}</p>
              <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.underlineToggleDescription}</p>
            </div>
            <Switch
              enabled={appearance.markdownExtendedUnderlineEnabled}
              label={text.underlineToggleAria}
              onToggle={() => onAppearanceChange({ markdownExtendedUnderlineEnabled: !appearance.markdownExtendedUnderlineEnabled })}
            />
          </div>
          <p className="mt-3 text-[10px] leading-4 text-ink-secondary">{text.markdownCompatibilityNote}</p>
        </AppearancePanel>
      </div>

      <div className="flex justify-end border-t border-line pt-4">
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md border border-brand-orange bg-white px-4 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover"
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

function AppearancePanel({ title, description, action, className = "", children }: { title: string; description: string; action?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <section className={["rounded-md border border-line bg-white px-4 py-4", className].join(" ")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold text-ink-primary">{title}</h4>
          <p className="mt-2 text-[11px] leading-5 text-ink-secondary">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

function ThemeChoice({ option, selected, onSelect }: { option: { value: AppearanceThemeMode; label: string; description: string; icon: typeof Monitor }; selected: boolean; onSelect: () => void }) {
  const Icon = option.icon;

  return (
    <button
      className={[
        "flex min-h-[74px] w-full items-center gap-4 rounded-md border px-4 py-3 text-left transition min-[640px]:min-h-[126px] min-[640px]:flex-col min-[640px]:justify-center min-[640px]:gap-3 min-[640px]:text-center",
        selected ? "border-brand-orange bg-brand-hover text-brand-orange shadow-subtle" : "border-line bg-white text-ink-secondary hover:border-orange-200 hover:bg-panel",
      ].join(" ")}
      type="button"
      aria-label={option.label}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={["grid h-5 w-5 shrink-0 place-items-center rounded-full border", selected ? "border-brand-orange bg-white" : "border-line bg-white"].join(" ")}>
        {selected ? <span className="h-2.5 w-2.5 rounded-full bg-brand-orange" /> : null}
      </span>
      <Icon size={24} className="shrink-0" />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">{option.label}</span>
        <span className="mt-1 block text-[11px] leading-5 text-ink-secondary">{option.description}</span>
      </span>
    </button>
  );
}

function AppearancePreview({ text }: { text: SettingsCopy }) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-white">
      <div className="grid min-h-[190px] md:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="border-b border-line bg-panel p-3 md:border-b-0 md:border-r">
          <PreviewNavItem active icon={<Grid2X2 size={15} />} label={text.previewDocuments} />
          <PreviewNavItem icon={<Eye size={15} />} label={text.previewSearch} />
          <PreviewNavItem icon={<Activity size={15} />} label={text.previewRecent} />
          <PreviewNavItem icon={<StarIcon />} label={text.previewFavorites} />
          <PreviewNavItem icon={<Trash2 size={15} />} label={text.previewTrash} />
        </aside>
        <main className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button className="h-8 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white shadow-subtle" type="button">
              {text.previewPrimaryButton}
            </button>
            <button className="h-8 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary" type="button">
              {text.previewSecondaryButton}
            </button>
            <span className="ml-auto rounded bg-brand-hover px-2 py-1 text-[10px] font-semibold text-brand-orange">
              {text.previewActiveState}
            </span>
          </div>
          <div className="mt-4 flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary">
            <span className="h-2 w-2 shrink-0 rounded-full bg-brand-orange" />
            <span className="min-w-0 flex-1 truncate">{text.previewDocumentName}</span>
            <span className="text-[10px] text-ink-secondary">{text.previewStatus}</span>
          </div>
          <div className="mt-3 rounded-md border border-line bg-white px-4 py-4">
            <p className="text-[13px] font-semibold text-ink-primary">{text.previewTextTitle}</p>
            <p className="mt-2 text-[11px] leading-5 text-ink-secondary">{text.previewTextDescription}</p>
          </div>
        </main>
      </div>
    </div>
  );
}

function PreviewNavItem({ icon, label, active }: { icon: ReactNode; label: string; active?: boolean }) {
  return (
    <div className={["flex h-9 items-center gap-2 rounded-md px-3 text-[11px] font-semibold", active ? "bg-brand-hover text-brand-orange" : "text-ink-secondary"].join(" ")}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

function StarIcon() {
  return (
    <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
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
  const modelOptions: Array<AiModelSelectorOption<AiModelId>> = aiModelIds.map((modelId) => {
    const model = text.aiModels[modelId];
    const meter = aiModelMeter[modelId];
    const price = aiModelPriceParts[modelId];
    return {
      id: modelId,
      name: model.name,
      description: model.description,
      capability: meter.intelligence,
      cost: meter.cost,
      inputPrice: price.input,
      outputPrice: price.output,
      recommended: model.recommended,
      tag: {
        label: model.recommended ? text.recommendedModel : model.name,
        tone: aiModelTagTone[modelId],
      },
    };
  });

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

  function updateImageGeneration(nextImageGeneration: Partial<AiConfigStatus["imageGeneration"]>) {
    const currentAi = localAiRef.current;
    commitAi({
      ...currentAi,
      imageGeneration: {
        ...currentAi.imageGeneration,
        ...nextImageGeneration,
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

        <div className="mt-3">
          <AiModelSelector
            value={settingsAi.model}
            options={modelOptions}
            onChange={updateModel}
            title={text.aiModelSelectorTitle}
            recommendedOnlyLabel={text.aiModelRecommendedOnly}
            guideLabel={text.aiModelGuide}
            guideDescription={text.aiModelGuideDescription}
          />
        </div>
      </section>

      <section className="rounded-md border border-line px-3 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ImageIcon size={15} className="text-brand-orange" />
              <p className="text-[11px] font-semibold text-ink-primary">{text.imageGenerationHeading}</p>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.imageGenerationDescription}</p>
          </div>
          <Switch enabled={settingsAi.imageGeneration.enabled} label={text.imageGenerationHeading} onToggle={() => updateImageGeneration({ enabled: !settingsAi.imageGeneration.enabled })} />
        </div>

        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(135px,1fr))] gap-2">
          <label className="block min-w-0">
            <span className="block text-[9px] font-semibold uppercase text-ink-secondary">{text.imageGenerationModelHeading}</span>
            <select
              className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
              value={settingsAi.imageGeneration.model}
              onChange={(event) => updateImageGeneration({ model: event.target.value as AiImageGenerationModelId })}
            >
              {aiImageGenerationModelIds.map((modelId) => (
                <option key={modelId} value={modelId}>{modelId}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="block text-[9px] font-semibold uppercase text-ink-secondary">{text.imageGenerationSize}</span>
            <select
              className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
              value={settingsAi.imageGeneration.size}
              onChange={(event) => updateImageGeneration({ size: event.target.value as AiConfigStatus["imageGeneration"]["size"] })}
            >
              <option value="auto">auto</option>
              <option value="1024x1024">1024x1024</option>
              <option value="1536x1024">1536x1024</option>
              <option value="1024x1536">1024x1536</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className="block text-[9px] font-semibold uppercase text-ink-secondary">{text.imageGenerationQuality}</span>
            <select
              className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
              value={settingsAi.imageGeneration.quality}
              onChange={(event) => updateImageGeneration({ quality: event.target.value as AiConfigStatus["imageGeneration"]["quality"] })}
            >
              <option value="auto">auto</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className="block text-[9px] font-semibold uppercase text-ink-secondary">{text.imageGenerationFormat}</span>
            <select
              className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
              value={settingsAi.imageGeneration.outputFormat}
              onChange={(event) => updateImageGeneration({ outputFormat: event.target.value as AiConfigStatus["imageGeneration"]["outputFormat"] })}
            >
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
              <option value="jpeg">JPEG</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className="block text-[9px] font-semibold uppercase text-ink-secondary">{text.imageGenerationFolder}</span>
            <select
              className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
              value={settingsAi.imageGeneration.defaultFolder}
              onChange={(event) => updateImageGeneration({ defaultFolder: event.target.value as AiConfigStatus["imageGeneration"]["defaultFolder"] })}
            >
              <option value="document_folder">{text.imageGenerationFolderDocument}</option>
              <option value="generated_assets">{text.imageGenerationFolderAssets}</option>
              <option value="custom_folder">{text.imageGenerationFolderCustom}</option>
            </select>
          </label>
          {settingsAi.imageGeneration.defaultFolder === "custom_folder" ? (
            <label className="block min-w-0">
              <span className="block text-[9px] font-semibold uppercase text-ink-secondary">{text.imageGenerationCustomFolder}</span>
              <input
                className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
                value={settingsAi.imageGeneration.customFolderPath}
                placeholder={text.imageGenerationCustomFolderPlaceholder}
                onChange={(event) => updateImageGeneration({ customFolderPath: event.target.value })}
              />
            </label>
          ) : null}
          <LimitField label={text.imageGenerationMaxImages} value={settingsAi.imageGeneration.maxImagesPerPrompt} min={1} max={4} step={1} onChange={(maxImagesPerPrompt) => updateImageGeneration({ maxImagesPerPrompt })} />
        </div>

        <div className="mt-3 grid gap-x-6 border-t border-line md:grid-cols-2">
          <CompactToggle
            label={text.imageGenerationStorePrompt}
            description={text.imageGenerationStorePromptDescription}
            enabled={settingsAi.imageGeneration.storePromptMetadata}
            onToggle={() => updateImageGeneration({ storePromptMetadata: !settingsAi.imageGeneration.storePromptMetadata })}
          />
          <CompactToggle
            label={text.imageGenerationConfirmInsert}
            description={text.imageGenerationConfirmInsertDescription}
            enabled={settingsAi.imageGeneration.confirmBeforeDocumentInsert}
            onToggle={() => updateImageGeneration({ confirmBeforeDocumentInsert: !settingsAi.imageGeneration.confirmBeforeDocumentInsert })}
          />
          <CompactToggle
            label={text.imageGenerationConfirmSources}
            description={text.imageGenerationConfirmSourcesDescription}
            enabled={settingsAi.imageGeneration.confirmBeforeUsingMultipleSources}
            onToggle={() => updateImageGeneration({ confirmBeforeUsingMultipleSources: !settingsAi.imageGeneration.confirmBeforeUsingMultipleSources })}
          />
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
          <PermissionToggle label={text.generateImages} enabled={settingsAi.permissions.generateImages} onToggle={() => updatePermissions({ generateImages: !settingsAi.permissions.generateImages })} />
          <PermissionToggle label={text.createImageAssets} enabled={settingsAi.permissions.createImageAssets} onToggle={() => updatePermissions({ createImageAssets: !settingsAi.permissions.createImageAssets })} />
          <PermissionToggle label={text.insertImagesIntoDocuments} enabled={settingsAi.permissions.insertImagesIntoDocuments} onToggle={() => updatePermissions({ insertImagesIntoDocuments: !settingsAi.permissions.insertImagesIntoDocuments })} />
          <PermissionToggle label={text.useDocumentContextForImages} enabled={settingsAi.permissions.useDocumentContextForImageGeneration} onToggle={() => updatePermissions({ useDocumentContextForImageGeneration: !settingsAi.permissions.useDocumentContextForImageGeneration })} />
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
      {label ? <span>{label}</span> : null}
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
    summaryNav: "Resumen",
    summaryNavDescription: "Vista general de configuración",
    interfaceNav: "Interfaz",
    interfaceNavDescription: "Apariencia y comportamiento",
    capabilitiesNav: "Capacidades",
    capabilitiesNavDescription: "Funciones avanzadas de IA",
    systemNav: "Sistema y diagnóstico",
    systemNavDescription: "Servicios locales y trazas",
    servicesNav: "Servicios",
    servicesNavDescription: "Backend local y salud",
    appearanceNav: "Apariencia",
    appearanceNavDescription: "Idioma y escala visual",
    aiNav: "IA documental",
    aiNavDescription: "OpenAI y contexto documental",
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
    copyDiagnosticTool: "Informe del sistema",
    copyDiagnosticDescription: "Copia un resumen técnico del backend local.",
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
    checkConnection: "Probar conexión",
    viewDetails: "Ver detalles",
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
    themeSystemDescription: "Usa la configuración del sistema operativo",
    themeLightDescription: "Interfaz clara y luminosa",
    themeDarkDescription: "Interfaz oscura para baja luz",
    primaryColorHeading: "Color principal",
    primaryColorDescription: "Usa la misma gama visual que los proyectos para acentos, estados activos y acciones principales.",
    primaryColorDefault: "Naranja",
    primaryColorOption: "Color",
    previewHeading: "Vista previa",
    previewDescription: "Así se verá la interfaz con la configuración actual.",
    previewPrimaryButton: "Nuevo documento",
    previewSecondaryButton: "Importar",
    previewActiveState: "Activo",
    previewDocumentName: "documentacion-producto.md",
    previewStatus: "Editando",
    previewTextTitle: "Superficie de trabajo",
    previewTextDescription: "La navegación, acciones y selección usan el color principal sin cambiar los colores semánticos.",
    previewDocuments: "Documentos",
    previewSearch: "Búsqueda",
    previewRecent: "Recientes",
    previewFavorites: "Favoritos",
    previewTrash: "Papelera",
    resetAppearance: "Restablecer apariencia",
    languageLabel: "Idioma",
    languageDescription: "Selecciona el idioma para la interfaz.",
    zoomLabel: "Zoom de la interfaz",
    zoomDescription: "Ajusta el tamaño de los elementos de la interfaz.",
    zoomReduce: "Reducir",
    zoomNormal: "Normal",
    zoomIncrease: "Ampliar",
    markdownCompatibilityHeading: "Compatibilidad Markdown",
    markdownCompatibilityDescription: "Opciones para mejorar la compatibilidad con distintos editores y visores.",
    markdownCompatibilityNote: "Mantén esta opción activa si el equipo acepta HTML inline en sus documentos Markdown. Desactívala si quieres limitar el editor a controles de Markdown estándar.",
    underlineToggleLabel: "Mostrar subrayado en el editor",
    underlineToggleDescription: "El subrayado no forma parte de Markdown estándar y se guardará como HTML inline con <u>texto</u>.",
    underlineToggleAria: "Activar subrayado extendido",
    aiHeading: "IA documental",
    aiDescription: "Configura los modelos de IA y el contexto documental que usa la aplicación para responder.",
    aiConfigured: "Clave configurada",
    aiMissingKey: "Sin clave OpenAI",
    enabled: "Activo",
    disabled: "Inactivo",
    openAiKeyPlaceholder: "sk-...",
    openAiKeyConfiguredPlaceholder: "Clave configurada. Últimos 4 caracteres:",
    openAiKeyConfiguredGenericPlaceholder: "Clave OpenAI configurada. Escribe una nueva para sustituirla.",
    openAiKeyMissingPlaceholder: "Configura la API key de OpenAI para activar IA real",
    saveKey: "Guardar",
    updateKey: "Actualizar clave",
    cancelKeyEdit: "Cancelar",
    deleteKey: "Eliminar clave",
    openAiKeyLastChars: "Últimos caracteres",
    openAiProviderActive: "Proveedor activo",
    openAiProviderMissing: "Pendiente de clave",
    aiKeyPrivacy: "La clave se guarda localmente y no se escribe en proyectos, logs ni trazas.",
    aiProviderHeading: "Proveedor de IA",
    aiProviderDescription: "Conecta la aplicación con el servicio que utilizará para generar respuestas.",
    aiModelHeading: "Modelo de respuesta",
    aiModelDescription: "Elige el equilibrio entre inteligencia, velocidad y coste para las respuestas documentales.",
    aiModelSelectorTitle: "Elige el modelo que mejor se adapte a tu tarea.",
    aiModelRecommendedOnly: "Solo mostrar recomendados",
    aiModelGuide: "Ver guía de modelos",
    aiModelGuideDescription: "Equilibrado es la mejor opción para la mayoría de tareas de documentación.",
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
    imageGenerationHeading: "Generación de imágenes",
    imageGenerationDescription: "Crea assets visuales desde el prompt IA usando el documento activo, selección y fuentes añadidas al contexto.",
    imageGenerationModelHeading: "Modelo imagen",
    imageGenerationSize: "Tamaño",
    imageGenerationQuality: "Calidad",
    imageGenerationFormat: "Formato",
    imageGenerationFolder: "Carpeta por defecto",
    imageGenerationFolderDocument: "Junto al documento",
    imageGenerationFolderAssets: "assets/generated",
    imageGenerationFolderCustom: "Personalizada",
    imageGenerationFolderExplanation: "Define dónde se guardan las imágenes generadas antes de abrirlas o insertarlas. Puedes mantenerlas junto al documento, centralizarlas en assets/generated o indicar una carpeta propia visible dentro del árbol del proyecto.",
    imageGenerationFolderHelp: "La carpeta se crea automáticamente dentro del proyecto si todavía no existe.",
    imageGenerationCustomFolder: "Ruta personalizada",
    imageGenerationCustomFolderPlaceholder: "assets/infografias",
    imageGenerationCustomFolderHelp: "Usa una ruta relativa al proyecto, por ejemplo assets/infografias o media/imagenes. No uses rutas absolutas ni segmentos ..",
    imageGenerationMaxImages: "Imágenes",
    imageGenerationStorePrompt: "Guardar prompt visual",
    imageGenerationStorePromptDescription: "Conserva metadata local para trazabilidad del asset generado.",
    imageGenerationConfirmInsert: "Confirmar inserción",
    imageGenerationConfirmInsertDescription: "Pide confirmación antes de modificar documentos con una imagen generada.",
    imageGenerationConfirmSources: "Confirmar múltiples fuentes",
    imageGenerationConfirmSourcesDescription: "Evita usar varios documentos o fuentes como contexto visual sin revisión previa.",
    transcriptionHeading: "Audio y transcripción",
    transcriptionDescription: "Controla el dictado realtime usado por el micrófono del prompt. React captura el audio, pero OpenAI se invoca solo desde el backend local.",
    transcriptionModelHeading: "Modelo",
    transcriptionDefaultTarget: "Destino por defecto",
    transcriptionDefaultLanguage: "Idioma por defecto",
    transcriptionFavoriteLanguages: "Idiomas favoritos del micrófono",
    transcriptionFavoriteLanguagesPlaceholder: "Selecciona idiomas",
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
    generateImages: "Generar imágenes",
    createImageAssets: "Crear archivos de imagen",
    insertImagesIntoDocuments: "Insertar imágenes en documentos",
    useDocumentContextForImages: "Usar contexto documental en imágenes",
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
    ragContextHeading: "Contexto documental (RAG)",
    ragContextHelp: "Cuando está activo, la aplicación prepara los documentos del proyecto para que la IA pueda encontrarlos y citarlos como contexto.",
    ragStatus: "Estado",
    ragDocuments: "Documentos indexados",
    ragFailed: "fallidos",
    ragExactReady: "búsqueda exacta local lista",
    rebuildIndex: "Reindexar ahora",
    deleteIndex: "Eliminar índice",
    currentModelLabel: "Modelo actual",
    lastStatusLabel: "Último estado",
    noIndexGenerated: "Aún no se ha generado el índice.",
    diagnosticsHeading: "Trazas",
    diagnosticsDescription: "Registra errores de la aplicación en un archivo local dedicado para revisar incidencias.",
    traceToggleLabel: "Registro de trazas",
    traceToggleDescription: "Los errores se registran siempre. Actívalo para conservar también trazas informativas de diagnóstico.",
    traceToggleAria: "Activar registro de trazas",
    logFolderLabel: "Carpeta de logs",
    preparingLogFolder: "Preparando carpeta de logs",
    openLogFolder: "Abrir carpeta en el explorador",
    systemDescription: "Configura servicios locales, almacenamiento y herramientas de diagnóstico.",
    storageHeading: "Datos locales y almacenamiento",
    storageDescription: "Ubicaciones que usa la aplicación para guardar datos locales, configuración e índices.",
    logsSensitiveNotice: "Los logs pueden contener información sensible. Úsalos solo para diagnóstico.",
    diagnosticToolsHeading: "Herramientas de diagnóstico",
    diagnosticToolsDescription: "Acciones disponibles para comprobar el estado local y resolver incidencias.",
    refreshServicesTool: "Actualizar estado",
    refreshServicesDescription: "Vuelve a consultar el estado del backend local.",
    restartBackendTool: "Reinicio controlado",
    restartBackendDescription: "Reinicia el backend gestionado por la app de escritorio.",
    summaryHeading: "Resumen de configuración",
    summaryDescription: "Revisa los ajustes actuales de tu aplicación. Puedes cambiar cualquier configuración desde su sección correspondiente.",
    summaryInterfaceDescription: "Apariencia general y comportamiento de la aplicación.",
    summaryAiDescription: "Modelos de IA y contexto documental utilizado.",
    summaryCapabilitiesDescription: "Funciones avanzadas que la IA puede utilizar.",
    summarySystemDescription: "Rendimiento, almacenamiento y herramientas de diagnóstico.",
    summaryAiProvider: "Proveedor de IA",
    summaryProviderLabel: "Proveedor",
    summaryModelLabel: "Modelo",
    summaryCapabilityMetric: "Capacidad",
    summaryCostMetric: "Coste",
    summarySearch: "Búsqueda",
    summaryVectorStore: "Vector store",
    summaryNone: "Ninguno",
    summaryImages: "Imágenes",
    summaryImagesDescription: "Generar y entender imágenes",
    summaryAudioDescription: "Transcribir y generar audio",
    summaryPermissionsDescription: "Configurar lo que la IA puede hacer",
    summaryAgenticDescription: "Investigación y ejecución de tareas",
    summaryProductive: "Productivo",
    summaryModelsHeading: "Modelos de IA utilizados",
    summaryModelsDescription: "Resumen de todos los modelos seleccionados en la aplicación.",
    summaryMainAi: "IA principal (respuestas)",
    summaryImageAi: "Imágenes (generación y visión)",
    summaryAudioAi: "Audio y transcripción",
    summaryImagePricing: "$0.75 / $4.50",
    summaryAudioPricing: "$0.006 / $0.018",
    summaryEconomy: "Económico",
    summaryHelpHeading: "¿Necesitas ayuda?",
    summaryHelpDescription: "Consulta la guía rápida para entender cómo funciona cada sección.",
    summaryHelpAction: "Ver guía rápida",
    goToInterface: "Ir a Interfaz",
    goToAi: "Ir a IA documental",
    goToCapabilities: "Ir a Capacidades",
    goToSystem: "Ir a Sistema y diagnóstico",
    capabilitiesDescription: "Activa y configura las funciones avanzadas que la IA puede utilizar.",
    capabilityImagesTitle: "1. Imágenes",
    capabilityImagesDescription: "Generación y comprensión de imágenes para trabajar con contenido visual.",
    capabilityGenerateImagesTitle: "Generar imágenes",
    capabilityGenerateImagesDescription: "Crea imágenes a partir de instrucciones o contexto del documento.",
    capabilityUnderstandImagesTitle: "Entender imágenes (visión)",
    capabilityUnderstandImagesDescription: "Analiza imágenes del proyecto y puede usarlas como contexto.",
    capabilityAudioTitle: "2. Audio y transcripción",
    capabilityAudioDescription: "Convierte voz en texto para usarla como prompt o incorporarla a documentos.",
    capabilityPermissionsTitle: "3. Acciones permitidas",
    capabilityPermissionsDescription: "Define hasta qué punto la IA puede modificar y gestionar el contenido del proyecto.",
    capabilityAgenticTitle: "4. Tareas agénticas",
    capabilityAgenticDescription: "Permite flujos de varios pasos en modo Razonar: la IA puede planificar, consultar contexto o web, preparar cambios y aplicar acciones solo dentro de los permisos configurados.",
    qualityLow: "Baja",
    qualityMedium: "Media",
    qualityHigh: "Alta",
    visionDetailLabel: "Detalle",
    visionMaxImageSize: "Tamaño máximo por imagen",
    transcriptionModelName: "Precisión alta en transcripción",
    transcriptionModelDescription: "Optimizado para dictado y notas de trabajo.",
    transcriptionDefaultTargetHelp: "Dónde se insertará la transcripción.",
    transcriptionDefaultLanguageHelp: "Idioma usado si no se detecta.",
    transcriptionFavoriteLanguagesHelp: "Idiomas que aparecerán como opciones rápidas en el menú del micrófono.",
    permissionModeConservative: "Conservador",
    permissionModeConservativeDescription: "Solo propone cambios.",
    permissionModeAssisted: "Asistido",
    permissionModeAssistedDescription: "Prepara cambios y pide confirmación antes.",
    permissionModeProductive: "Productivo",
    permissionModeProductiveDescription: "Puede aplicar cambios dentro de límites definidos.",
    permissionModeCustom: "Personalizado",
    permissionModeCustomDescription: "Configura permisos uno a uno.",
    editDocumentsDescription: "Puede modificar el contenido de documentos.",
    createFoldersDescription: "Puede crear, duplicar y mover carpetas.",
    createDocumentsDescription: "Puede crear y organizar documentos del proyecto.",
    deleteDocumentsDescription: "Puede eliminar documentos y carpetas.",
    generateImagesDescription: "Puede generar imágenes a partir de instrucciones.",
    createImageAssetsDescription: "Puede guardar imágenes como archivos en el proyecto.",
    insertImagesIntoDocumentsDescription: "Puede añadir imágenes dentro de documentos.",
    useDocumentContextForImagesDescription: "Puede usar documentos como contexto al generar imágenes.",
    permissionScopeNotice: "Estos permisos se aplican a la IA en todas las tareas que realice dentro del proyecto.",
    agenticWebResearchHeading: "Investigación web",
    agenticWebResearchDescription: "Permite consultar fuentes web cuando la tarea necesita información externa al proyecto.",
    agenticLimitsHeading: "Límites de ejecución",
    agenticLimitsDescription: "Limita el alcance máximo de cada tarea antes de que la IA siga investigando o aplicando cambios.",
    agenticLimitsImpact: "Pasos controla cuántas iteraciones puede hacer; documentos limita cuántos archivos del proyecto puede revisar; fuentes limita referencias externas o añadidas; coste máx. corta la tarea si la estimación supera ese importe.",
    imageModelGptImage15Name: "Máxima calidad",
    imageModelGptImage15Description: "Modelo de imagen más avanzado",
    imageModelGptImage2Name: "Más reciente",
    imageModelGptImage2Description: "Modelo GPT Image recomendado",
    imageModelGptImage1Name: "Alta calidad",
    imageModelGptImage1Description: "Modelo anterior de generación de imágenes",
    imageModelGptImageMiniName: "Económico",
    imageModelGptImageMiniDescription: "Borradores y tareas simples",
    priceUnitPerImage: "por imagen",
    capabilitiesPlaceholderDescription: "Esta sección agrupa las capacidades avanzadas de IA. Por ahora mantiene una vista de resumen; los controles detallados siguen disponibles en IA documental.",
    capabilitiesEditInAi: "Configurar en IA documental",
  },
  en: {
    title: "App settings",
    subtitle: "Local interface and diagnostics settings.",
    close: "Close",
    closeSettings: "Close settings",
    sectionsLabel: "Settings sections",
    summaryNav: "Summary",
    summaryNavDescription: "Configuration overview",
    interfaceNav: "Interface",
    interfaceNavDescription: "Appearance and behavior",
    capabilitiesNav: "Capabilities",
    capabilitiesNavDescription: "Advanced AI functions",
    systemNav: "System and diagnostics",
    systemNavDescription: "Local services and traces",
    servicesNav: "Services",
    servicesNavDescription: "Local backend health",
    appearanceNav: "Appearance",
    appearanceNavDescription: "Language and visual scale",
    aiNav: "Documentation AI",
    aiNavDescription: "OpenAI and document context",
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
    copyDiagnosticTool: "System report",
    copyDiagnosticDescription: "Copies a technical summary of the local backend.",
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
    checkConnection: "Test connection",
    viewDetails: "View details",
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
    themeSystemDescription: "Use the operating system setting",
    themeLightDescription: "Clear and bright interface",
    themeDarkDescription: "Dark interface for low light",
    primaryColorHeading: "Primary color",
    primaryColorDescription: "Use the same visual range as projects for accents, active states, and primary actions.",
    primaryColorDefault: "Orange",
    primaryColorOption: "Color",
    previewHeading: "Preview",
    previewDescription: "This is how the interface will look with the current configuration.",
    previewPrimaryButton: "New document",
    previewSecondaryButton: "Import",
    previewActiveState: "Active",
    previewDocumentName: "product-documentation.md",
    previewStatus: "Editing",
    previewTextTitle: "Workspace surface",
    previewTextDescription: "Navigation, actions, and selection use the primary color without changing semantic colors.",
    previewDocuments: "Documents",
    previewSearch: "Search",
    previewRecent: "Recent",
    previewFavorites: "Favorites",
    previewTrash: "Trash",
    resetAppearance: "Reset appearance",
    languageLabel: "Language",
    languageDescription: "Select the interface language.",
    zoomLabel: "Interface zoom",
    zoomDescription: "Adjust the size of interface elements.",
    zoomReduce: "Reduce",
    zoomNormal: "Normal",
    zoomIncrease: "Increase",
    markdownCompatibilityHeading: "Markdown compatibility",
    markdownCompatibilityDescription: "Options to improve compatibility with different editors and viewers.",
    markdownCompatibilityNote: "Keep this option enabled if the team accepts inline HTML in Markdown documents. Disable it to keep the editor limited to standard Markdown controls.",
    underlineToggleLabel: "Show underline in the editor",
    underlineToggleDescription: "Underline is not part of standard Markdown and will be saved as inline HTML with <u>text</u>.",
    underlineToggleAria: "Enable extended underline",
    aiHeading: "Documentation AI",
    aiDescription: "Configure the AI models and document context the application uses to answer.",
    aiConfigured: "Key configured",
    aiMissingKey: "No OpenAI key",
    enabled: "Enabled",
    disabled: "Disabled",
    openAiKeyPlaceholder: "sk-...",
    openAiKeyConfiguredPlaceholder: "Key configured. Last 4 characters:",
    openAiKeyConfiguredGenericPlaceholder: "OpenAI key configured. Type a new one to replace it.",
    openAiKeyMissingPlaceholder: "Configure the OpenAI API key to enable real AI",
    saveKey: "Save",
    updateKey: "Update key",
    cancelKeyEdit: "Cancel",
    deleteKey: "Delete key",
    openAiKeyLastChars: "Last characters",
    openAiProviderActive: "Active provider",
    openAiProviderMissing: "Key required",
    aiKeyPrivacy: "The key is stored locally and is not written to projects, logs, or traces.",
    aiProviderHeading: "AI provider",
    aiProviderDescription: "Connect the application with the service used to generate responses.",
    aiModelHeading: "Response model",
    aiModelDescription: "Choose the balance between intelligence, speed, and cost for documentation answers.",
    aiModelSelectorTitle: "Choose the model that best fits your task.",
    aiModelRecommendedOnly: "Only show recommended",
    aiModelGuide: "View model guide",
    aiModelGuideDescription: "Balanced is the best option for most documentation tasks.",
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
    imageGenerationHeading: "Image generation",
    imageGenerationDescription: "Create visual assets from the AI prompt using the active document, selection, and attached context sources.",
    imageGenerationModelHeading: "Image model",
    imageGenerationSize: "Size",
    imageGenerationQuality: "Quality",
    imageGenerationFormat: "Format",
    imageGenerationFolder: "Default folder",
    imageGenerationFolderDocument: "Next to document",
    imageGenerationFolderAssets: "assets/generated",
    imageGenerationFolderCustom: "Custom",
    imageGenerationFolderExplanation: "Defines where generated images are saved before they are opened or inserted. Keep them next to the document, centralize them in assets/generated, or choose your own folder inside the project tree.",
    imageGenerationFolderHelp: "The folder is created automatically inside the project if it does not exist yet.",
    imageGenerationCustomFolder: "Custom path",
    imageGenerationCustomFolderPlaceholder: "assets/infographics",
    imageGenerationCustomFolderHelp: "Use a project-relative path such as assets/infographics or media/images. Do not use absolute paths or .. segments.",
    imageGenerationMaxImages: "Images",
    imageGenerationStorePrompt: "Store visual prompt",
    imageGenerationStorePromptDescription: "Keep local metadata for generated asset traceability.",
    imageGenerationConfirmInsert: "Confirm insertion",
    imageGenerationConfirmInsertDescription: "Ask before modifying documents with a generated image.",
    imageGenerationConfirmSources: "Confirm multiple sources",
    imageGenerationConfirmSourcesDescription: "Avoid using several documents or sources as visual context without review.",
    transcriptionHeading: "Audio and transcription",
    transcriptionDescription: "Controls realtime dictation from the prompt microphone. React captures audio, but OpenAI is invoked only by the local backend.",
    transcriptionModelHeading: "Model",
    transcriptionDefaultTarget: "Default target",
    transcriptionDefaultLanguage: "Default language",
    transcriptionFavoriteLanguages: "Microphone favorite languages",
    transcriptionFavoriteLanguagesPlaceholder: "Select languages",
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
    generateImages: "Generate images",
    createImageAssets: "Create image files",
    insertImagesIntoDocuments: "Insert images in documents",
    useDocumentContextForImages: "Use document context for images",
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
    ragContextHeading: "Document context (RAG)",
    ragContextHelp: "When enabled, the application prepares project documents so the AI can find and cite them as context.",
    ragStatus: "Status",
    ragDocuments: "Indexed documents",
    ragFailed: "failed",
    ragExactReady: "local exact search ready",
    rebuildIndex: "Reindex now",
    deleteIndex: "Delete index",
    currentModelLabel: "Current model",
    lastStatusLabel: "Last status",
    noIndexGenerated: "The index has not been generated yet.",
    diagnosticsHeading: "Traces",
    diagnosticsDescription: "Record application errors in a dedicated local file for troubleshooting.",
    traceToggleLabel: "Trace logging",
    traceToggleDescription: "Errors are always logged. Enable this to also keep informational diagnostic traces.",
    traceToggleAria: "Enable trace logging",
    logFolderLabel: "Log folder",
    preparingLogFolder: "Preparing log folder",
    openLogFolder: "Open folder in Explorer",
    systemDescription: "Configure local services, storage, and diagnostic tools.",
    storageHeading: "Local data and storage",
    storageDescription: "Locations used by the application to store local data, configuration, and indexes.",
    logsSensitiveNotice: "Logs may contain sensitive information. Use them only for diagnostics.",
    diagnosticToolsHeading: "Diagnostic tools",
    diagnosticToolsDescription: "Available actions to check local status and resolve incidents.",
    refreshServicesTool: "Refresh status",
    refreshServicesDescription: "Checks the local backend status again.",
    restartBackendTool: "Controlled restart",
    restartBackendDescription: "Restarts the backend managed by the desktop app.",
    summaryHeading: "Configuration summary",
    summaryDescription: "Review the current app settings. You can change any setting from its corresponding section.",
    summaryInterfaceDescription: "General appearance and application behavior.",
    summaryAiDescription: "AI models and document context in use.",
    summaryCapabilitiesDescription: "Advanced functions the AI can use.",
    summarySystemDescription: "Performance, storage, and diagnostic tools.",
    summaryAiProvider: "AI provider",
    summaryProviderLabel: "Provider",
    summaryModelLabel: "Model",
    summaryCapabilityMetric: "Capability",
    summaryCostMetric: "Cost",
    summarySearch: "Search",
    summaryVectorStore: "Vector store",
    summaryNone: "None",
    summaryImages: "Images",
    summaryImagesDescription: "Generate and understand images",
    summaryAudioDescription: "Transcribe and generate audio",
    summaryPermissionsDescription: "Configure what AI can do",
    summaryAgenticDescription: "Research and task execution",
    summaryProductive: "Productive",
    summaryModelsHeading: "AI models in use",
    summaryModelsDescription: "Summary of all selected models in the application.",
    summaryMainAi: "Main AI (responses)",
    summaryImageAi: "Images (generation and vision)",
    summaryAudioAi: "Audio and transcription",
    summaryImagePricing: "$0.75 / $4.50",
    summaryAudioPricing: "$0.006 / $0.018",
    summaryEconomy: "Economy",
    summaryHelpHeading: "Need help?",
    summaryHelpDescription: "Open the quick guide to understand how each section works.",
    summaryHelpAction: "View quick guide",
    goToInterface: "Go to Interface",
    goToAi: "Go to Documentation AI",
    goToCapabilities: "Go to Capabilities",
    goToSystem: "Go to System and diagnostics",
    capabilitiesDescription: "Enable and configure the advanced functions the AI can use.",
    capabilityImagesTitle: "1. Images",
    capabilityImagesDescription: "Image generation and understanding for working with visual content.",
    capabilityGenerateImagesTitle: "Generate images",
    capabilityGenerateImagesDescription: "Create images from instructions or document context.",
    capabilityUnderstandImagesTitle: "Understand images (vision)",
    capabilityUnderstandImagesDescription: "Analyze project images and use them as context.",
    capabilityAudioTitle: "2. Audio and transcription",
    capabilityAudioDescription: "Convert voice into text to use as a prompt or add to documents.",
    capabilityPermissionsTitle: "3. Allowed actions",
    capabilityPermissionsDescription: "Define how far the AI can modify and manage project content.",
    capabilityAgenticTitle: "4. Agentic tasks",
    capabilityAgenticDescription: "Allows multi-step workflows in Reasoning mode: the AI can plan, consult context or web, prepare changes, and apply actions only within configured permissions.",
    qualityLow: "Low",
    qualityMedium: "Medium",
    qualityHigh: "High",
    visionDetailLabel: "Detail",
    visionMaxImageSize: "Maximum size per image",
    transcriptionModelName: "High transcription precision",
    transcriptionModelDescription: "Optimized for dictation and working notes.",
    transcriptionDefaultTargetHelp: "Where the transcription will be inserted.",
    transcriptionDefaultLanguageHelp: "Language used if none is detected.",
    transcriptionFavoriteLanguagesHelp: "Languages shown as quick options in the microphone menu.",
    permissionModeConservative: "Conservative",
    permissionModeConservativeDescription: "Only proposes changes.",
    permissionModeAssisted: "Assisted",
    permissionModeAssistedDescription: "Prepares changes and asks before applying.",
    permissionModeProductive: "Productive",
    permissionModeProductiveDescription: "Can apply changes within defined limits.",
    permissionModeCustom: "Custom",
    permissionModeCustomDescription: "Configure permissions one by one.",
    editDocumentsDescription: "Can modify document content.",
    createFoldersDescription: "Can create, duplicate, and move folders.",
    createDocumentsDescription: "Can create and organize project documents.",
    deleteDocumentsDescription: "Can delete documents and folders.",
    generateImagesDescription: "Can generate images from instructions.",
    createImageAssetsDescription: "Can save images as project files.",
    insertImagesIntoDocumentsDescription: "Can add images inside documents.",
    useDocumentContextForImagesDescription: "Can use documents as context when generating images.",
    permissionScopeNotice: "These permissions apply to AI across every task it performs inside the project.",
    agenticWebResearchHeading: "Web research",
    agenticWebResearchDescription: "Allows consulting web sources when a task needs information outside the project.",
    agenticLimitsHeading: "Execution limits",
    agenticLimitsDescription: "Limits the maximum scope of each task before the AI continues researching or applying changes.",
    agenticLimitsImpact: "Steps controls how many iterations it may run; documents limits how many project files it may inspect; sources limits external or attached references; max cost stops the task if the estimate exceeds that amount.",
    imageModelGptImage15Name: "Maximum quality",
    imageModelGptImage15Description: "Most advanced image model",
    imageModelGptImage2Name: "Latest",
    imageModelGptImage2Description: "Recommended GPT Image model",
    imageModelGptImage1Name: "High quality",
    imageModelGptImage1Description: "Previous image generation model",
    imageModelGptImageMiniName: "Economy",
    imageModelGptImageMiniDescription: "Drafts and simple tasks",
    priceUnitPerImage: "per image",
    capabilitiesPlaceholderDescription: "This section groups advanced AI capabilities. For now it keeps a summary view; detailed controls remain available in Documentation AI.",
    capabilitiesEditInAi: "Configure in Documentation AI",
  },
};

function useStableSection(open: boolean): [AppSettingsSection, (section: AppSettingsSection) => void] {
  const [activeSection, setActiveSection] = useState<AppSettingsSection>("summary");

  useEffect(() => {
    if (open) setActiveSection("summary");
  }, [open]);

  return [activeSection, setActiveSection];
}
