import {CredentialSecurityPanel} from "./CredentialSecurityPanel";
import {AiPrivacyPanel} from "./AiPrivacyPanel";
import type {StateTransitionAuthority} from "../../types/stateMigrations";
import {AiDataPolicyPanel} from "./AiDataPolicyPanel";
import {StateMigrationPanel} from "./StateMigrationPanel";
import { settingsCopy } from "./settingsCopy";
import { SettingsSearch } from "./SettingsSearch";
import {RuntimePerformancePanel} from "./RuntimePerformancePanel";
import { SafeDiagnosticsPanel } from "./SafeDiagnosticsPanel";
import { buildServiceDiagnostic } from "../../lib/runtime/diagnostics";
import { StorageUsagePanel } from "./StorageUsagePanel";
import {ProjectBackupPanel} from "../backups/ProjectBackupPanel";
import {discardProjectBackupDraft} from "../backups/useProjectBackups";
import { getSettingsSections } from "./settingsSections";
import type { AppSettingsSection } from "../../types/settings";
import type { SettingsSaveDomain, SettingsSaveFailure } from "../../types/settings";
import "./AppSettingsDialog.css";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { getApiErrorMessage } from "../../lib/api/client";
import { ModelAccessCheck } from "../../components/ai/ModelAccessCheck";
import { AudioSettings } from "../recordings/AudioSettings";
import { modelOptions as catalogOptions, openAiCatalog } from "../../lib/ai/modelCatalog";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Activity, ArrowRight, Brain, Check, ChevronDown, Copy, Download, Eye, FileText, FolderOpen, Gauge, Grid2X2, Image as ImageIcon, Info, KeyRound, Languages, ListChecks, Mic, Monitor, Moon, Paintbrush, RefreshCw, RotateCcw, Server, Settings, ShieldCheck, Sparkles, Sun, Trash2, Type as TypeIcon, Underline, Workflow, Wrench, X } from "lucide-react";
import { AiModelSelector, type AiModelSelectorOption, type AiModelSelectorTone } from "../../components/ai/AiModelSelector";
import { AiSkillsSettings } from "./AiSkillsSettings";
import { defaultAiConfig } from "../../lib/api/config";
import { accentPalettes } from "../../lib/theme/appearance";
import type { AiConfigStatus, AiImageGenerationModelId, AiIndexStatusResponse, AiModelId, AiResearchPresetId, AiTranscriptionLanguage, AiVisionModelId, AppearanceAccentColor, AppearanceConfig, AppearanceThemeMode, DiagnosticsConfig, ExportTemplateConfig, ExportTemplateUpdate, ExportTextFormat } from "../../types/domain";
import type { TraceLogStatus } from "../../lib/runtime/logging";
import type { RuntimeServicesStatus } from "../../lib/runtime/services";

export type { AppSettingsSection } from "../../types/settings";
const SettingsDepth = createContext({ advanced: false, setAdvanced: (_value: boolean) => {}, english: false });
export type AppSettingsSaveState = "idle" | "saving" | "saved" | "error" | "local-only";

const exportFontOptions: Array<[string, string]> = [
  ["Arial", "Arial"],
  ["Calibri", "Calibri"],
  ["Aptos", "Aptos"],
  ["Times New Roman", "Times New Roman"],
  ["Georgia", "Georgia"],
  ["Verdana", "Verdana"],
  ["Courier New", "Courier New"],
  ["Consolas", "Consolas"],
];

type AppSettingsDialogProps = StateTransitionAuthority & {
  privacyProject?:{id:string;name:string}|null;
  onBeforeProjectBackup?:(projectId:string)=>Promise<void>;
  onProjectBackupRestorePrepared?:(projectId:string,transferId:string)=>void;
  onSecurityChanged?:()=>void|Promise<void>;
  onRefreshAiIndex?: () => void;
  aiIndexBusy?: boolean;
  aiIndexError?: string | null;
  saveFailures?: SettingsSaveFailure[];
  onRetrySave?: (domain: SettingsSaveDomain) => void;
  exportResetting?: boolean;
  presentation?: "dialog" | "workspace";
  section?: AppSettingsSection;
  onSectionChange?: (section: AppSettingsSection) => void;
  initialSection?: AppSettingsSection;
  navigationWidth?: number;
  onOpenRecordings?: () => void;
  open: boolean;
  appearance: AppearanceConfig;
  diagnostics: DiagnosticsConfig;
  exportTemplate: ExportTemplateConfig;
  exportTemplatePath: string;
  ai: AiConfigStatus;
  aiIndexStatus: AiIndexStatusResponse | null;
  traceLogStatus: TraceLogStatus | null;
  runtimeServicesStatus: RuntimeServicesStatus | null;
  runtimeServicesRefreshing: boolean;
  saveState: AppSettingsSaveState;
  saveMessage?: string | null;
  configPersistenceAvailable: boolean;
  onClose: () => void;
  onAppearanceChange: (appearance: Partial<AppearanceConfig>) => void;
  onDiagnosticsChange: (diagnostics: Partial<DiagnosticsConfig>) => void;
  onExportTemplateChange: (template: ExportTemplateUpdate) => void;
  onResetExportTemplate: () => void;
  onAiChange: (ai: AiConfigStatus) => void;
  onSaveOpenAiKey: (apiKey: string) => void | Promise<void>;
  onDeleteOpenAiKey: () => void;
  onRebuildAiIndex: () => void;
  onReindexImages: () => void;
  onDeleteAiIndex: () => void;
  onOpenTraceLogFolder: () => void;
  onRefreshRuntimeServices: () => void;
};

const aiModelIds = catalogOptions("text").map(m=>m.id);
const aiVisionModelIds = catalogOptions("vision").map(m=>m.id);
const aiImageGenerationModelIds = catalogOptions("image").map(m=>m.id);
const baseImageGenerationSizeOptions: AiConfigStatus["imageGeneration"]["size"][] = ["auto", "1024x1024", "1536x1024", "1024x1536"];
const gptImage2SizeOptions: AiConfigStatus["imageGeneration"]["size"][] = [...baseImageGenerationSizeOptions, "2048x2048", "2048x1152", "3840x2160", "2160x3840"];
const transcriptionLanguages: AiTranscriptionLanguage[] = ["auto", "es", "en", "fr", "de", "it", "pt", "ca", "eu", "gl"];






type PermissionModeId = "conservative" | "assisted" | "productive" | "custom";

const permissionModePresets: Record<Exclude<PermissionModeId, "custom">, AiConfigStatus["permissions"]> = {
  conservative: {
    editDocuments: false,
    editHandwrittenNotes: false,
    drawHandwrittenNotes: false,
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
    editHandwrittenNotes: true,
    drawHandwrittenNotes: true,
    createFolders: false,
    createDocuments: true,
    deleteDocumentsAndFolders: false,
    generateImages: true,
    createImageAssets: true,
    insertImagesIntoDocuments: true,
    useDocumentContextForImageGeneration: true,
  },
  productive: {
    editDocuments: true,
    editHandwrittenNotes: true,
    drawHandwrittenNotes: true,
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
  privacyProject=null,
  onBeforeProjectBackup,
  onProjectBackupRestorePrepared,
  onSecurityChanged,
  onRefreshAiIndex,
  aiIndexBusy = false,
  aiIndexError = null,
  saveFailures = [],
  onRetrySave,
  exportResetting = false,
  presentation = "dialog",
  section,
  onSectionChange,
  initialSection = "summary",
  navigationWidth = 260,
  onOpenRecordings,
  open,
  appearance,
  diagnostics,
  exportTemplate,
  exportTemplatePath,
  ai,
  aiIndexStatus,
  traceLogStatus,
  runtimeServicesStatus,
  runtimeServicesRefreshing,
  saveState,
  saveMessage,
  configPersistenceAvailable,
  onBeforeChange,
  onSettled,
  onClose,
  onAppearanceChange,
  onDiagnosticsChange,
  onExportTemplateChange,
  onResetExportTemplate,
  onAiChange,
  onSaveOpenAiKey,
  onDeleteOpenAiKey,
  onRebuildAiIndex,
  onReindexImages,
  onDeleteAiIndex,
  onOpenTraceLogFolder,
  onRefreshRuntimeServices,
}: AppSettingsDialogProps) {
  const [backupDirty,setBackupDirty]=useState(false);
  const [confirmBackupLeave,setConfirmBackupLeave]=useState(false);
  function requestClose(){if(backupDirty){setConfirmBackupLeave(true);return;}onClose();}
  const [localSection, setLocalSection] = useStableSection(open, initialSection);
  const activeSection = section ?? localSection;
  const setActiveSection = (next: AppSettingsSection) => {
    if (section === undefined) setLocalSection(next);
    onSectionChange?.(next);
  };
  const [advancedSections, setAdvancedSections] = useState<Partial<Record<AppSettingsSection, boolean>>>({});
  const [visitedSections, setVisitedSections] = useState<AppSettingsSection[]>([]);
  const [focusRequest, setFocusRequest] = useState<{ section: AppSettingsSection } | null>(null);
  const activateSection = (next: AppSettingsSection) => { setFocusRequest({section:next}); setActiveSection(next); };
  const surfaceRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) { setFocusRequest(null); return; }
    if (focusRequest?.section === activeSection) {
      const panel = surfaceRef.current?.querySelector<HTMLElement>(`#app-settings-panel-${activeSection}`);
      if (panel) { panel.scrollTop = 0; panel.focus({ preventScroll: true }); setFocusRequest(null); }
    }
  }, [open, activeSection, focusRequest]);
  useEffect(() => {
    if (!open) setVisitedSections([]);
    else setVisitedSections(current => current.includes(activeSection) ? current : [...current, activeSection]);
  }, [open, activeSection]);
  const text = settingsCopy[appearance.language];
  const sections = getSettingsSections(appearance.language);

  if (!open) return null;

  const surface = (
      <section
        ref={surfaceRef}
        aria-label={presentation === "workspace" ? text.title : undefined}
        className={`settings-surface flex h-full w-full flex-col overflow-hidden bg-white ${presentation === "workspace" ? "settings-workspace" : ""}`}
      >
        <header className="flex items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            {presentation === "dialog" && <><h2 id="app-settings-title" className="text-[15px] font-semibold text-ink-primary">{text.title}</h2>
            <p className="mt-1 text-[11px] text-ink-secondary">{text.subtitle}</p></>}
            <SettingsSaveStatus state={saveState} message={saveMessage} persistenceAvailable={configPersistenceAvailable} text={text} failures={saveFailures} onRetry={onRetrySave} indexReview={Boolean(aiIndexError || aiIndexStatus?.error)}/>
          </div>
          {presentation === "dialog" && <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
            data-tooltip={text.close}
            aria-label={text.closeSettings}
            type="button"
            onClick={requestClose}
          >
            <X size={16} />
          </button>}
        </header>

        <SettingsSearch language={appearance.language} onSelect={activateSection}/>

        <div className="settings-layout flex min-h-0 flex-1">
          <label className="settings-mobile-category">{text.sectionsLabel}
            <select value={activeSection} onChange={event => setActiveSection(event.target.value as AppSettingsSection)}>
              {sections.map(section => <option key={section.id} value={section.id}>{section.label}</option>)}
            </select>
          </label>
          {presentation === "dialog" && <nav
            className="settings-navigation"
            style={{ width: navigationWidth }}
            aria-label={text.sectionsLabel}
            role="tablist"
            aria-orientation="vertical"
            onKeyDown={event => {
              const index = sections.findIndex(section => section.id === activeSection);
              const next = event.key === "ArrowDown" ? (index + 1) % sections.length : event.key === "ArrowUp" ? (index + sections.length - 1) % sections.length : event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : -1;
              if (next < 0) return;
              event.preventDefault();
              setActiveSection(sections[next].id);
              document.getElementById(`app-settings-tab-${sections[next].id}`)?.focus();
            }}
          >
            <div className="settings-category-list">
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
                  tabIndex={activeSection === section.id ? 0 : -1}
                  aria-selected={activeSection === section.id}
                  aria-controls={`app-settings-panel-${section.id}`}
                  data-tooltip={section.description}
                  data-tooltip-placement="bottom"
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                >
                  <section.icon size={14} className={["shrink-0", activeSection === section.id ? "text-brand-orange" : "text-ink-secondary"].join(" ")} />
                  <span>{section.label}</span>
                  {activeSection === section.id ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-brand-orange" /> : null}
                </button>
              ))}
            </div>
          </nav>}

          <div className="settings-panel-stack flex min-h-0 min-w-0 flex-1">
          {sections.filter(panel => panel.id === activeSection || visitedSections.includes(panel.id)).map(panel => (
          <div
            key={panel.id}
            id={`app-settings-panel-${panel.id}`}
            tabIndex={-1}
            style={{ display: panel.id === activeSection ? undefined : "none" }}
            className="settings-content min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-5"
            role="tabpanel"
            aria-labelledby={presentation === "dialog" ? `app-settings-tab-${panel.id}` : undefined}
            aria-label={presentation === "workspace" ? panel.label : undefined}
          >
            <div className="settings-depth-control">
              <span>{appearance.language === "en" ? "This device" : "Este dispositivo"}</span>
              <label><input type="checkbox" role="switch" checked={Boolean(advancedSections[panel.id])} onChange={event => setAdvancedSections(current => ({...current, [panel.id]: event.target.checked}))}/>{appearance.language === "en" ? "Advanced view" : "Vista avanzada"}</label>
            </div>
            <SettingsDepth.Provider value={{ advanced: Boolean(advancedSections[panel.id]), setAdvanced: value => setAdvancedSections(current => ({...current, [panel.id]: value})), english: appearance.language === "en" }}>
            {panel.id === "summary" ? (
              <SummarySettings
                appearance={appearance}
                diagnostics={diagnostics}
                ai={ai}
                aiIndexStatus={aiIndexStatus}
                runtimeServicesStatus={runtimeServicesStatus}
                text={text}
                onSelectSection={activateSection}
              />
            ) : panel.id === "audio" ? (
              <AudioSettings active={panel.id === activeSection} onOpenRecordings={() => { if(backupDirty){setConfirmBackupLeave(true);return;}onClose(); onOpenRecordings?.(); }} onCredentials={() => activateSection("ai")} />
            ) : panel.id === "interface" ? (
              <AppearanceSettings appearance={appearance} text={text} onAppearanceChange={onAppearanceChange} />
            ) : panel.id === "export" ? (
              <fieldset className="min-w-0" disabled={exportResetting} aria-busy={exportResetting}><ExportSettings
                template={exportTemplate}
                templatePath={exportTemplatePath}
                text={text}
                onExportTemplateChange={onExportTemplateChange}
                onResetExportTemplate={onResetExportTemplate}
              /></fieldset>
            ) : panel.id === "ai" ? (
              <AiDocumentalSettings
                privacyProject={privacyProject}
                onSecurityChanged={onSecurityChanged}
                ai={ai}
                aiIndexStatus={aiIndexStatus}
                aiIndexBusy={aiIndexBusy}
                aiIndexError={aiIndexError}
                onRefreshAiIndex={onRefreshAiIndex}
                text={text}
                onAiChange={onAiChange}
                onSaveOpenAiKey={onSaveOpenAiKey}
                onDeleteOpenAiKey={onDeleteOpenAiKey}
                onRebuildAiIndex={onRebuildAiIndex}
                onReindexImages={onReindexImages}
                onDeleteAiIndex={onDeleteAiIndex}
              />
            ) : panel.id === "skills" ? (
              <AiSkillsSettings />
            ) : panel.id === "capabilities" ? (
              <CapabilitiesSettings ai={ai} text={text} onAiChange={onAiChange} onReindexImages={onReindexImages} />
            ) : (
              <SystemSettings
                project={privacyProject}
                onBeforeBackup={onBeforeProjectBackup}
                onRestorePrepared={onProjectBackupRestorePrepared}
                onBackupDirtyChange={setBackupDirty}
                onBeforeChange={onBeforeChange}
                onSettled={onSettled}
                diagnostics={diagnostics}
                traceLogStatus={traceLogStatus}
                runtimeServicesStatus={runtimeServicesStatus}
                refreshing={runtimeServicesRefreshing}
                text={text}
                onDiagnosticsChange={onDiagnosticsChange}
                onOpenTraceLogFolder={onOpenTraceLogFolder}
                onRefresh={onRefreshRuntimeServices}
              />
            )}
            </SettingsDepth.Provider>
          </div>
          ))}
          </div>
        </div>
      </section>
  );
  const guardedSurface=<>{surface}{confirmBackupLeave&&<ModalFrame role="alertdialog" label={appearance.language==="en"?"Unsaved backup policy":"Cambios de copias pendientes"} onClose={()=>setConfirmBackupLeave(false)} className="fixed inset-0 !z-[140] flex items-center justify-center bg-black/25 p-3"><section className="w-full max-w-md rounded-lg bg-white p-4 text-xs shadow-lg"><h3 className="font-semibold">{appearance.language==="en"?"Unsaved backup policy":"Cambios de copias pendientes"}</h3><p className="my-3">{appearance.language==="en"?"The project backup policy has unsaved changes. Return to save them or discard them when leaving.":"La programación del proyecto tiene cambios sin guardar. Vuelve para guardarlos o descártalos al salir."}</p><div className="flex flex-wrap justify-end gap-2"><button className="min-h-11 rounded px-3 hover:bg-panel" onClick={()=>setConfirmBackupLeave(false)}>{appearance.language==="en"?"Keep configuring":"Seguir configurando"}</button><button className="min-h-11 rounded bg-brand-orange px-3 text-white" onClick={()=>{setConfirmBackupLeave(false);setBackupDirty(false);if(privacyProject)discardProjectBackupDraft(privacyProject.id);onClose();}}>{appearance.language==="en"?"Discard changes and leave":"Descartar cambios y salir"}</button></div></section></ModalFrame>}</>;
  return presentation === "workspace" ? guardedSurface : <ModalFrame label={text.title} onClose={requestClose} className="settings-overlay">{guardedSurface}</ModalFrame>;
}

function SettingsSaveStatus({
  indexReview,
  failures,
  onRetry,
  state,
  message,
  persistenceAvailable,
  text,
}: {
  indexReview: boolean;
  failures: SettingsSaveFailure[];
  onRetry?: (domain: SettingsSaveDomain) => void;
  state: AppSettingsSaveState;
  message?: string | null;
  persistenceAvailable: boolean;
  text: SettingsCopy;
}) {
  const effectiveState = state === "error" ? "error" : persistenceAvailable ? state : "local-only";
  const showIndexReview = indexReview && !failures.length && effectiveState !== "error" && effectiveState !== "saving";
  const label = showIndexReview ? text.indexReviewResult : effectiveState === "saving"
    ? text.settingsSaving
    : effectiveState === "saved"
      ? text.settingsSaved
      : effectiveState === "error"
        ? text.settingsSaveFailed
        : effectiveState === "local-only"
          ? text.settingsLocalOnly
          : text.settingsIdle;
  const toneClass = showIndexReview ? "border-orange-100 bg-orange-50 text-orange-900" : effectiveState === "saved"
    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
    : effectiveState === "error"
      ? "border-red-100 bg-red-50 text-red-700"
      : effectiveState === "saving"
        ? "border-orange-100 bg-brand-hover text-brand-orange"
        : "border-line bg-panel text-ink-secondary";

  return (<>
    <p
      className={["mt-2 inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-semibold", toneClass].join(" ")}
      title={showIndexReview ? text.indexReviewResult : message ?? undefined}
      aria-live="polite"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      <span className="shrink-0 whitespace-nowrap">{showIndexReview ? text.indexStatusScope : text.settingsStatusScope} ·</span><span className="truncate">{showIndexReview ? label : message ?? label}</span>
    </p>
    {!!failures.length && <ul className="mt-3 max-h-40 space-y-3 overflow-y-auto text-sm">{failures.map(failure => <li key={failure.id} className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="font-semibold">{failure.label}</p><p role="alert" className="mt-1 break-words text-xs leading-5 text-red-700">{text.settingsWriteFailed}</p><details className="mt-1 text-xs leading-5 text-ink-secondary"><summary className="min-h-11 cursor-pointer py-3">{text.settingsErrorDetails}</summary><p className="break-words">{failure.message}</p></details></div>{onRetry && <button aria-label={`${text.retrySettings} ${failure.label}`} onClick={() => onRetry(failure.id)} className="min-h-11 rounded-md px-3 text-sm font-semibold text-brand-orange hover:bg-panel">{text.retrySettings}</button>}</li>)}</ul>}
  </>);
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
  const runtimeService = runtimeServicesStatus?.services.find((service) => service.id === "local-runtime") ?? runtimeServicesStatus?.services[0] ?? null;
  const model = (text.aiModels[settingsAi.model as keyof typeof text.aiModels] ?? { name: settingsAi.model, description: "Modelo OpenAI", recommended: false });
  const imageGenerationModel = (text.imageGenerationModels[settingsAi.imageGeneration.model as keyof typeof text.imageGenerationModels] ?? { name: settingsAi.imageGeneration.model, description: "Generación de imágenes", recommended: false, price: "Según tokens utilizados", tag: "Disponible" });
  const visionModel = (text.aiModels[settingsAi.vision.model as keyof typeof text.aiModels] ?? { name: settingsAi.vision.model, description: "Modelo OpenAI", recommended: false });
  const permissionMode = getPermissionMode(settingsAi.permissions);
  const accentPalette = accentPalettes.find((palette) => palette.id === appearance.primaryColor) ?? accentPalettes[0];
  const documentCount = aiIndexStatus?.documentCount ?? 0;
  const ragStatus = aiIndexStatus?.localExactReady ? text.ragExactReady : describeIndexStatus(aiIndexStatus?.status ?? settingsAi.rag.status, appearance.language === "en");

  return (
    <div className="settings-summary space-y-5">
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

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <SummaryCard
          icon={<Monitor size={20} />}
          title={text.interfaceNav}
          description={text.summaryInterfaceDescription}
          actionLabel={text.goToInterface}
          actionIcon={<Monitor size={14} />}
          onAction={() => onSelectSection("interface")}
        >
          <div className="settings-summary-values">
            <SummaryRow icon={<Sun size={13} />} label={text.themeHeading} value={describeThemeMode(appearance.themeMode, text)} />
            <SummaryRow icon={<Languages size={13} />} label={text.languageLabel} value={describeLanguage(appearance.language)} />
            <SummaryRow icon={<Gauge size={13} />} label={text.zoomLabel} value={`${appearance.zoomPercent}%`} />
            <SummaryRow
              icon={<Paintbrush size={13} />}
              label={text.primaryColorHeading}
              value={accentPalette.label ?? text.primaryColorDefault}
              valuePrefix={<ColorDot color={accentPalette.projectColor} />}
            />
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
          <div className="settings-summary-values">
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
              label={text.aiModelHeading}
              value={(
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className="truncate">{settingsAi.model}</span>
                  <span className="shrink-0 rounded bg-brand-hover px-2 py-0.5 text-[9px] font-semibold text-brand-orange">{model.recommended ? text.recommendedModel : model.name}</span>
                </span>
              )}
            />
            <SummaryRow
              icon={<FolderOpen size={13} />}
              label={text.ragContextHeading}
              value={(
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className="truncate">{settingsAi.rag.enabled ? text.enabled : text.disabled}</span>
                  <span className="shrink-0 text-ink-secondary">{documentCount ? `${documentCount} ${text.summaryDocumentsShort}` : text.summaryNone}</span>
                </span>
              )}
            />
            <SummaryRow icon={<Eye size={13} />} label={text.summarySearch} value={ragStatus} />
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
          <div className="settings-summary-values">
            <SummaryRow icon={<ImageIcon size={13} />} label={text.summaryImageGenerationAi} value={settingsAi.imageGeneration.enabled ? settingsAi.imageGeneration.model : text.disabled} valueTone={settingsAi.imageGeneration.enabled ? "brand" : "neutral"} />
            <SummaryRow icon={<Eye size={13} />} label={text.summaryVisionAi} value={settingsAi.vision.enabled ? settingsAi.vision.model : text.disabled} valueTone={settingsAi.vision.enabled ? "brand" : "neutral"} />
            <SummaryRow icon={<Mic size={13} />} label={text.transcriptionHeading} value={settingsAi.transcription.model} valueTone="brand" />
            <SummaryRow icon={<ShieldCheck size={13} />} label={text.aiPermissionsHeading} value={describePermissionMode(permissionMode, text)} valueTone="brand" />
            <SummaryRow icon={<Gauge size={13} />} label={text.agenticHeading} value={describeAgenticDepth(settingsAi.agentic.depth, text)} valueTone="brand" />
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
          <div className="settings-summary-values">
            <SummaryRow icon={<Server size={13} />} label={text.versionLabel} value={runtimeService?.version ?? text.unavailableValue} />
            <SummaryRow icon={<Settings size={13} />} label={text.profileLabel} value={describeRuntimeProfile(runtimeService?.profile, text)} />
            <SummaryRow icon={<Server size={13} />} label={text.servicesSummary} value={runtimeService?.statusLabel ?? text.servicesPending} success={runtimeService?.status === "running"} />
            <SummaryRow icon={<ListChecks size={13} />} label={text.traceToggleLabel} value={diagnostics.traceLoggingEnabled ? text.enabled : text.disabled} />
          </div>
        </SummaryCard>
      </div>

      <AdvancedOptions><section className="settings-summary-models py-3">
        <div className="mb-3">
          <h3 className="text-[13px] font-semibold text-ink-primary">{text.summaryModelsHeading}</h3>
          <p className="mt-1 text-[11px] text-ink-secondary">{text.summaryModelsDescription}</p>
        </div>
        <div className="settings-summary-values">
          <SummaryModelRow label={text.summaryMainAi} description={text.aiModelHeading} modelId={settingsAi.model} price="" tag={model.recommended ? text.recommendedModel : null} capabilityLabel={text.summaryCapabilityMetric} costLabel={text.summaryCostMetric} priceUnit={text.summaryTokenPriceUnit} />
          <SummaryModelRow label={text.summaryImageGenerationAi} description={text.imageGenerationModelHeading} modelId={settingsAi.imageGeneration.model} price={imageGenerationModel.price} tag={imageGenerationModel.recommended ? imageGenerationModel.tag : null} capabilityLabel={text.summaryCapabilityMetric} costLabel={text.summaryCostMetric} priceUnit={text.imageGenerationPricePer1kImage} />
          <SummaryModelRow label={text.summaryVisionAi} description={text.visionHeading} modelId={settingsAi.vision.model} price="" tag={visionModel.recommended ? text.recommendedModel : null} capabilityLabel={text.summaryCapabilityMetric} costLabel={text.summaryCostMetric} priceUnit={text.summaryTokenPriceUnit} />
          <SummaryModelRow label={text.summaryAudioAi} description={text.transcriptionHeading} modelId={settingsAi.transcription.model} capability={2} cost={1} price={text.summaryAudioPricing} tag={text.summaryEconomy} capabilityLabel={text.summaryCapabilityMetric} costLabel={text.summaryCostMetric} priceUnit={text.summaryTokenPriceUnit} />
        </div>
      </section></AdvancedOptions>

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
  const visionModelOptions = buildVisionModelOptions(text);
  const imageGenerationModelOptions = buildImageGenerationModelOptions(text);

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

  function updateImageGeneration(nextImageGeneration: Partial<AiConfigStatus["imageGeneration"]>) {
    const currentAi = localAiRef.current;
    const nextModel = nextImageGeneration.model ?? currentAi.imageGeneration.model;
    const nextSize = nextImageGeneration.size ?? currentAi.imageGeneration.size;
    commitAi({
      ...currentAi,
      imageGeneration: {
        ...currentAi.imageGeneration,
        ...nextImageGeneration,
        size: normalizeImageGenerationSizeForModel(nextModel, nextSize),
      },
    });
  }

  function updateDiagrams(nextDiagrams: Partial<AiConfigStatus["diagrams"]>) {
    const currentAi = localAiRef.current;
    commitAi({
      ...currentAi,
      diagrams: {
        ...currentAi.diagrams,
        ...nextDiagrams,
      },
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

  function applyPermissionMode(mode: Exclude<PermissionModeId, "custom">) {
    const currentAi = localAiRef.current;
    commitAi({
      ...currentAi,
      permissions: { ...permissionModePresets[mode] },
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

      <CapabilitySection icon={<Workflow size={22} />} title={text.capabilityDiagramsTitle} description={text.capabilityDiagramsDescription}>
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <CapabilityPanel
            icon={<Workflow size={15} />}
            title={text.capabilityDiagramsEditorTitle}
            description={text.capabilityDiagramsEditorDescription}
            enabled={settingsAi.diagrams.enabled}
            onToggle={() => updateDiagrams({ enabled: !settingsAi.diagrams.enabled })}
          >
            <div className="grid gap-3">
              <CapabilitySelect label={text.diagramProfileHeading} value={settingsAi.diagrams.visualProfile} onChange={(value) => {
                if (value === "compatible") {
                  updateDiagrams({ visualProfile: "compatible", iconSet: "none", imagePolicy: "disabled", aiGenerationMode: "safe" });
                } else if (value === "advanced") {
                  updateDiagrams({ visualProfile: "advanced", iconSet: "lucide", betaPolicy: "ask", aiGenerationMode: "visual" });
                } else {
                  updateDiagrams({ visualProfile: "visual_local", iconSet: "lucide", imagePolicy: "project_assets", betaPolicy: "ask", aiGenerationMode: "visual" });
                }
              }}>
                <option value="compatible">{text.diagramProfileCompatible}</option>
                <option value="visual_local">{text.diagramProfileVisualLocal}</option>
                <option value="advanced">{text.diagramProfileAdvanced}</option>
              </CapabilitySelect>
              <div className="grid gap-3 md:grid-cols-2">
                <CapabilitySelect label={text.diagramIconSetHeading} value={settingsAi.diagrams.iconSet} onChange={(value) => updateDiagrams({ iconSet: value as AiConfigStatus["diagrams"]["iconSet"] })}>
                  <option value="none">{text.disabled}</option>
                  <option value="lucide">Lucide local</option>
                </CapabilitySelect>
                <CapabilitySelect label={text.diagramDefaultWidthHeading} value={settingsAi.diagrams.defaultWidth} onChange={(value) => updateDiagrams({ defaultWidth: value as AiConfigStatus["diagrams"]["defaultWidth"] })}>
                  <option value="compact">S</option>
                  <option value="auto">M</option>
                  <option value="wide">L</option>
                  <option value="full">XL</option>
                </CapabilitySelect>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <CapabilitySelect label={text.diagramImagePolicyHeading} value={settingsAi.diagrams.imagePolicy} onChange={(value) => updateDiagrams({ imagePolicy: value as AiConfigStatus["diagrams"]["imagePolicy"] })}>
                  <option value="disabled">{text.diagramImagesDisabled}</option>
                  <option value="project_assets">{text.diagramImagesProject}</option>
                  <option value="external_confirm">{text.diagramImagesExternalConfirm}</option>
                </CapabilitySelect>
                <CapabilitySelect label={text.diagramBetaPolicyHeading} value={settingsAi.diagrams.betaPolicy} onChange={(value) => updateDiagrams({ betaPolicy: value as AiConfigStatus["diagrams"]["betaPolicy"] })}>
                  <option value="disabled">{text.diagramBetaDisabled}</option>
                  <option value="ask">{text.diagramBetaAsk}</option>
                  <option value="enabled">{text.diagramBetaEnabled}</option>
                </CapabilitySelect>
              </div>
            </div>
          </CapabilityPanel>

          <CapabilityPanel
            icon={<Sparkles size={15} />}
            title={text.capabilityDiagramsAiTitle}
            description={text.capabilityDiagramsAiDescription}
            enabled={settingsAi.diagrams.aiGenerationMode === "visual"}
            onToggle={() => updateDiagrams({ aiGenerationMode: settingsAi.diagrams.aiGenerationMode === "visual" ? "safe" : "visual" })}
          >
            <div className="grid gap-2">
              <CapabilitySummaryRow label={text.diagramAiModeHeading} value={settingsAi.diagrams.aiGenerationMode === "visual" ? text.diagramAiModeVisual : text.diagramAiModeSafe} />
              <CapabilitySummaryRow label={text.diagramExportGuaranteeHeading} value={text.diagramExportGuaranteeValue} />
              <CapabilitySummaryRow label={text.diagramLocalFirstHeading} value={text.diagramLocalFirstValue} />
            </div>
          </CapabilityPanel>
        </div>
      </CapabilitySection>

      <CapabilitySection icon={<ImageIcon size={22} />} title={text.capabilityImagesTitle} description={text.capabilityImagesDescription}>
        <div className="grid gap-4 xl:grid-cols-2">
          <CapabilityPanel
            icon={<ImageIcon size={15} />}
            title={text.capabilityGenerateImagesTitle}
            description={text.imageGenerationAvailableDescription}
            enabled={settingsAi.imageGeneration.enabled}
            onToggle={() => updateImageGeneration({ enabled: !settingsAi.imageGeneration.enabled })}
          >
            <div className="grid gap-3">
              <CapabilityField label={text.imageGenerationModelHeading}>
                <AiModelSelector
                  value={settingsAi.imageGeneration.model}
                  options={imageGenerationModelOptions}
                  onChange={(model) => updateImageGeneration({ model })}
                  title={text.imageGenerationModelSelectorTitle}
                  recommendedOnlyLabel={text.aiModelRecommendedOnly}
                  guideLabel={text.aiModelGuide}
                  guideDescription={text.imageGenerationModelGuideDescription}
                />
              </CapabilityField>
              <div className="grid gap-3 md:grid-cols-3">
                <CapabilitySelect label={text.imageGenerationSizeHeading} value={settingsAi.imageGeneration.size} onChange={(value) => updateImageGeneration({ size: value as AiConfigStatus["imageGeneration"]["size"] })}>
                  {imageGenerationSizeOptions(settingsAi.imageGeneration.model).map((size) => (
                    <option key={size} value={size}>{formatImageGenerationSize(size, text)}</option>
                  ))}
                </CapabilitySelect>
                <CapabilitySelect label={text.imageGenerationQualityHeading} value={settingsAi.imageGeneration.quality} onChange={(value) => updateImageGeneration({ quality: value as AiConfigStatus["imageGeneration"]["quality"] })}>
                  <option value="auto">{text.imageGenerationAuto}</option>
                  <option value="low">{text.imageGenerationQualityLow}</option>
                  <option value="medium">{text.imageGenerationQualityMedium}</option>
                  <option value="high">{text.imageGenerationQualityHigh}</option>
                </CapabilitySelect>
                <CapabilitySelect label={text.imageGenerationFormatHeading} value={settingsAi.imageGeneration.outputFormat} onChange={(value) => updateImageGeneration({ outputFormat: value as AiConfigStatus["imageGeneration"]["outputFormat"] })}>
                  <option value="png">PNG</option>
                  <option value="webp">WebP</option>
                  <option value="jpeg">JPEG</option>
                </CapabilitySelect>
              </div>
              <CapabilitySelect label={text.imageGenerationFolderHeading} value={settingsAi.imageGeneration.defaultFolder} help={settingsAi.imageGeneration.defaultFolder === "custom_folder" ? settingsAi.imageGeneration.customFolderPath : undefined} onChange={(value) => updateImageGeneration({ defaultFolder: value as AiConfigStatus["imageGeneration"]["defaultFolder"] })}>
                <option value="document_folder">{text.imageGenerationFolderDocument}</option>
                <option value="generated_assets">{text.imageGenerationFolderGenerated}</option>
                <option value="custom_folder">{text.imageGenerationFolderCustom}</option>
              </CapabilitySelect>
              {settingsAi.imageGeneration.defaultFolder === "custom_folder" ? (
                <CapabilityField label={text.imageGenerationCustomFolderHeading}>
                  <input
                    className="h-9 w-full rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
                    value={settingsAi.imageGeneration.customFolderPath}
                    onChange={(event) => updateImageGeneration({ customFolderPath: event.target.value })}
                  />
                </CapabilityField>
              ) : null}
              <div className="divide-y divide-line border-t border-line pt-2">
                <CapabilityToggleRow icon={<FileText size={14} />} label={text.imageGenerationInsertHeading} description={text.imageGenerationInsertDescription} enabled={settingsAi.permissions.insertImagesIntoDocuments} onToggle={() => updatePermissions({ insertImagesIntoDocuments: !settingsAi.permissions.insertImagesIntoDocuments })} />
                <CapabilityToggleRow icon={<Brain size={14} />} label={text.imageGenerationDocumentContextHeading} description={text.imageGenerationDocumentContextDescription} enabled={settingsAi.permissions.useDocumentContextForImageGeneration} onToggle={() => updatePermissions({ useDocumentContextForImageGeneration: !settingsAi.permissions.useDocumentContextForImageGeneration })} />
              </div>
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
                title={text.aiModelSelectorTitle}
                recommendedOnlyLabel={text.aiModelRecommendedOnly}
                guideLabel={text.aiModelGuide}
                guideDescription={text.aiModelGuideDescription}
              />
            </CapabilityField>

            <AdvancedOptions customized={settingsAi.vision.detail !== "auto" || settingsAi.vision.maxImageSizeMb !== defaultAiConfig.vision.maxImageSizeMb}>
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

            </AdvancedOptions>
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
            <CapabilitySelect label={text.transcriptionDefaultTarget} value={settingsAi.transcription.defaultTarget} help={text.transcriptionDefaultTargetHelp} onChange={(value) => updateTranscription({ defaultTarget: value as AiConfigStatus["transcription"]["defaultTarget"] })}>
              <option value="prompt">{text.transcriptionTargetPrompt}</option>
              <option value="document">{text.transcriptionTargetDocument}</option>
            </CapabilitySelect>
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
        <div className="overflow-hidden rounded-md border border-line bg-white">
          <div className="grid border-b border-line md:grid-cols-4">
            <PermissionModeSegment selected={permissionMode === "conservative"} title={text.permissionModeConservative} description={text.permissionModeConservativeDescription} onSelect={() => applyPermissionMode("conservative")} />
            <PermissionModeSegment selected={permissionMode === "assisted"} title={text.permissionModeAssisted} description={text.permissionModeAssistedDescription} onSelect={() => applyPermissionMode("assisted")} />
            <PermissionModeSegment selected={permissionMode === "productive"} title={text.permissionModeProductive} description={text.permissionModeProductiveDescription} onSelect={() => applyPermissionMode("productive")} />
            <PermissionModeSegment selected={permissionMode === "custom"} title={text.permissionModeCustom} description={text.permissionModeCustomDescription} />
          </div>
          <div className="grid md:grid-cols-2">
            <div className="divide-y divide-line md:border-r md:border-line">
              <CompactPermissionSwitch icon={<ImageIcon size={14} />} label={text.editDocuments} description={text.editDocumentsDescription} enabled={settingsAi.permissions.editDocuments} onToggle={() => updatePermissions({ editDocuments: !settingsAi.permissions.editDocuments })} />
              <CompactPermissionSwitch icon={<Paintbrush size={14} />} label={text.editHandwrittenNotes} description={text.editHandwrittenNotesDescription} enabled={settingsAi.permissions.editHandwrittenNotes} onToggle={() => updatePermissions({ editHandwrittenNotes: !settingsAi.permissions.editHandwrittenNotes })} />
              <CompactPermissionSwitch icon={<Paintbrush size={14} />} label={text.drawHandwrittenNotes} description={text.drawHandwrittenNotesDescription} enabled={settingsAi.permissions.drawHandwrittenNotes} onToggle={() => updatePermissions({ drawHandwrittenNotes: !settingsAi.permissions.drawHandwrittenNotes })} />
              <CompactPermissionSwitch icon={<FolderOpen size={14} />} label={text.createFolders} description={text.createFoldersDescription} enabled={settingsAi.permissions.createFolders} onToggle={() => updatePermissions({ createFolders: !settingsAi.permissions.createFolders })} />
              <CompactPermissionSwitch icon={<FileIcon />} label={text.createDocuments} description={text.createDocumentsDescription} enabled={settingsAi.permissions.createDocuments} onToggle={() => updatePermissions({ createDocuments: !settingsAi.permissions.createDocuments })} />
              <CompactPermissionSwitch icon={<Trash2 size={14} />} label={text.deleteDocuments} description={text.deleteDocumentsDescription} enabled={settingsAi.permissions.deleteDocumentsAndFolders} onToggle={() => updatePermissions({ deleteDocumentsAndFolders: !settingsAi.permissions.deleteDocumentsAndFolders })} />
            </div>
            <div className="divide-y divide-line bg-brand-hover/35">
              <div className="flex h-9 items-center justify-between px-3">
                <p className="text-[11px] font-semibold text-ink-primary">{text.imageGenerationPermissionsTitle}</p>
                <StatusPill label="" value={settingsAi.permissions.generateImages && settingsAi.permissions.createImageAssets ? text.enabled : text.disabled} tone={settingsAi.permissions.generateImages && settingsAi.permissions.createImageAssets ? "success" : "neutral"} />
              </div>
              <CompactPermissionSwitch icon={<ImageIcon size={14} />} label={text.permissionGenerateImages} description={text.permissionGenerateImagesDescription} enabled={settingsAi.permissions.generateImages} onToggle={() => updatePermissions({ generateImages: !settingsAi.permissions.generateImages })} />
              <CompactPermissionSwitch icon={<FolderOpen size={14} />} label={text.permissionCreateImageAssets} description={text.permissionCreateImageAssetsDescription} enabled={settingsAi.permissions.createImageAssets} onToggle={() => updatePermissions({ createImageAssets: !settingsAi.permissions.createImageAssets })} />
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-ink-secondary">{text.permissionScopeNotice}</p>
      </CapabilitySection>

      <CapabilitySection icon={<Gauge size={22} />} title={text.capabilityAgenticTitle} description={text.capabilityAgenticDescription}>
        <div className="overflow-hidden rounded-md border border-line bg-white">
          <div className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(140px,0.45fr)_minmax(220px,1fr)_minmax(220px,1fr)]">
            <LimitField label={text.agenticMaxCost} value={settingsAi.agentic.maxEstimatedCostEur} min={0.1} max={25} step={0.1} onChange={(value) => updateAgentic({ maxEstimatedCostEur: value })} />
            <CompactPermissionSwitch
              icon={<Workflow size={14} />}
              label={text.researchPresetDiagrams}
              description={text.researchPresetDiagramsDescription}
              enabled={settingsAi.agentic.researchDiagramsEnabled}
              onToggle={() => updateAgentic({ researchDiagramsEnabled: !settingsAi.agentic.researchDiagramsEnabled })}
              compact
            />
            <CompactPermissionSwitch
              icon={<ImageIcon size={14} />}
              label={text.researchPresetImages}
              description={text.researchPresetImagesDescription}
              enabled={settingsAi.agentic.researchImagesEnabled}
              onToggle={() => updateAgentic({ researchImagesEnabled: !settingsAi.agentic.researchImagesEnabled })}
              compact
            />
          </div>
          <div className="border-t border-line bg-panel/40 px-3 py-2">
            <p className="text-[10px] leading-4 text-ink-secondary">{text.agenticLimitsImpact}</p>
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

function describePermissionMode(mode: PermissionModeId, text: SettingsCopy) {
  if (mode === "conservative") return text.permissionModeConservative;
  if (mode === "assisted") return text.permissionModeAssisted;
  if (mode === "productive") return text.permissionModeProductive;
  return text.permissionModeCustom;
}

function describeAgenticDepth(depth: AiConfigStatus["agentic"]["depth"], text: SettingsCopy) {
  if (depth === "quick") return text.agenticDepthQuick;
  if (depth === "guided") return text.agenticDepthGuided;
  if (depth === "deep") return text.agenticDepthDeep;
  return text.agenticDepthBoundedAutonomous;
}

function permissionsMatch(left: AiConfigStatus["permissions"], right: AiConfigStatus["permissions"]) {
  return (
    left.editDocuments === right.editDocuments &&
    left.editHandwrittenNotes === right.editHandwrittenNotes &&
    left.drawHandwrittenNotes === right.drawHandwrittenNotes &&
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

function CapabilitySummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-white px-3 py-2">
      <span className="text-[10px] font-semibold text-ink-secondary">{label}</span>
      <span className="min-w-0 truncate text-right text-[11px] font-semibold text-ink-primary">{value}</span>
    </div>
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

function PermissionModeSegment({ title, description, selected, onSelect }: { title: string; description: string; selected?: boolean; onSelect?: () => void }) {
  return (
    <button
      type="button"
      className={[
        "flex min-h-[74px] min-w-0 items-start justify-between gap-3 border-b border-line px-3 py-3 text-left transition last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0",
        selected ? "bg-brand-hover text-brand-orange" : "bg-white text-ink-primary hover:bg-panel",
        onSelect ? "" : "cursor-default",
      ].join(" ")}
      disabled={!onSelect}
      onClick={onSelect}
    >
      <span className="min-w-0">
        <span className={["block text-[11px] font-semibold", selected ? "text-brand-orange" : "text-ink-primary"].join(" ")}>{title}</span>
        <span className="mt-1 block text-[10px] leading-4 text-ink-secondary">{description}</span>
      </span>
      {selected ? <Check size={15} className="mt-0.5 shrink-0 text-brand-orange" strokeWidth={3} /> : null}
    </button>
  );
}

function CompactSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[9px] font-semibold uppercase text-ink-secondary">{label}</span>
      <select
        className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[11px] font-semibold text-ink-primary outline-none focus:border-brand-orange"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function CompactPermissionSwitch({
  icon,
  label,
  description,
  enabled,
  onToggle,
  compact,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  return (
    <div className={["flex min-w-0 items-center justify-between gap-3 px-3", compact ? "py-1" : "py-2.5"].join(" ")}>
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 shrink-0 text-ink-secondary">{icon}</span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-ink-primary">{label}</p>
          <p className={["mt-0.5 text-[10px] text-ink-secondary", compact ? "truncate" : "leading-4"].join(" ")}>{description}</p>
        </div>
      </div>
      <Switch enabled={enabled} label={label} onToggle={onToggle} />
    </div>
  );
}

function CapabilityModelCard({ modelId, name, description, capability, cost, inputPrice, outputPrice, tag }: { modelId: string; name: string; description: string; capability?: number; cost?: number; inputPrice: string; outputPrice: string; tag: string }) {
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

    </div>
  );
}

function buildVisionModelOptions(_text: SettingsCopy): Array<AiModelSelectorOption<AiVisionModelId>> { return catalogOptions("vision"); }

function buildImageGenerationModelOptions(_text: SettingsCopy): Array<AiModelSelectorOption<AiImageGenerationModelId>> { return catalogOptions("image"); }

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
    <section className="settings-summary-card flex flex-col py-3">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 text-brand-orange">{icon}</span>
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold text-ink-primary">{title}</h4>
          <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{description}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      <div className="mt-4 flex justify-end">
        <button className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-[12px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange" onClick={onAction}>
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
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5">
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

function SummaryModelRow({ label, description, modelId, capability, cost, price, tag, capabilityLabel, costLabel, priceUnit }: { label: string; description: string; modelId: string; capability?: number; cost?: number; price: string; tag?: string | null; capabilityLabel: string; costLabel: string; priceUnit: string }) {
  const option=catalogOptions("text").concat(catalogOptions("image")).find(m=>m.id===modelId);
  if(option){price=[option.inputPrice,option.outputPrice].filter(Boolean).join(" / ");priceUnit=option.priceUnit??"";}
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-ink-primary">{label}</p>
        <p className="mt-1 truncate text-[10px] text-ink-secondary">{description}</p>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-mono text-[11px] font-semibold text-ink-primary">{modelId}</span>
        {tag ? <span className="rounded bg-brand-hover px-2 py-0.5 text-[9px] font-semibold text-brand-orange">{tag}</span> : null}
      </div>
      <div className="text-right">
        <p className="text-[11px] font-semibold text-ink-primary">{price}</p>
        <p className="mt-1 text-[10px] text-ink-secondary">{priceUnit}</p>
      </div>
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
  const diagrams = ai?.diagrams as Partial<AiConfigStatus["diagrams"]> | undefined;
  const handwrittenDrawing = ai?.handwrittenDrawing as Partial<AiConfigStatus["handwrittenDrawing"]> | undefined;

  const imageGenerationModel = normalizeImageGenerationModel(imageGeneration?.model);
  return {
    provider: "openai",
    model: normalizeAiModel(ai?.model),
    permissions: {
      editDocuments: permissions?.editDocuments ?? defaultAiConfig.permissions.editDocuments,
      editHandwrittenNotes: permissions?.editHandwrittenNotes ?? defaultAiConfig.permissions.editHandwrittenNotes,
      drawHandwrittenNotes: permissions?.drawHandwrittenNotes ?? defaultAiConfig.permissions.drawHandwrittenNotes,
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
      vectorStoreId: typeof rag?.vectorStoreId === "string" && rag.vectorStoreId.trim() ? rag.vectorStoreId : null,
      lastIndexedAt: typeof rag?.lastIndexedAt === "string" && rag.lastIndexedAt.trim() ? rag.lastIndexedAt : null,
      status: normalizeRagStatus(rag?.status),
      error: typeof rag?.error === "string" && rag.error.trim() ? rag.error : null,
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
      model: imageGenerationModel,
      size: normalizeImageGenerationSizeForModel(imageGenerationModel, imageGeneration?.size),
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
      maxSources: clampSettingsNumber(agentic?.maxSources, 1, 500, defaultAiConfig.agentic.maxSources),
      researchDiagramsEnabled: normalizeResearchGlobalToggle(agentic, "researchDiagramsEnabled", "diagramsEnabled", defaultAiConfig.agentic.researchDiagramsEnabled),
      researchImagesEnabled: normalizeResearchGlobalToggle(agentic, "researchImagesEnabled", "imagesEnabled", defaultAiConfig.agentic.researchImagesEnabled),
      researchPresets: normalizeResearchPresets(agentic?.researchPresets),
    },
    transcription: normalizeTranscription(transcription),
    diagrams: normalizeDiagramSettings(diagrams),
    handwrittenDrawing: {
      enabled: handwrittenDrawing?.enabled ?? defaultAiConfig.handwrittenDrawing.enabled,
      creativeSketchEnabled: handwrittenDrawing?.creativeSketchEnabled ?? defaultAiConfig.handwrittenDrawing.creativeSketchEnabled,
      defaultStyle: "professional_whiteboard",
      maxElements: clampSettingsNumber(handwrittenDrawing?.maxElements, 4, 96, defaultAiConfig.handwrittenDrawing.maxElements),
      maxStrokes: clampSettingsNumber(handwrittenDrawing?.maxStrokes, 100, 4000, defaultAiConfig.handwrittenDrawing.maxStrokes),
      maxPagesPerRequest: clampSettingsNumber(handwrittenDrawing?.maxPagesPerRequest, 1, 3, defaultAiConfig.handwrittenDrawing.maxPagesPerRequest),
    },
    openaiKeyConfigured: Boolean(ai?.openaiKeyConfigured),
    openaiKeyPreview: ai?.openaiKeyPreview ?? null,
    credentialStorageError: ai?.credentialStorageError ?? null,
    credentialProtection: ai?.credentialProtection,
  };
}

function normalizeDiagramSettings(diagrams: Partial<AiConfigStatus["diagrams"]> | undefined): AiConfigStatus["diagrams"] {
  const visualProfile = ["compatible", "visual_local", "advanced"].includes(String(diagrams?.visualProfile))
    ? diagrams!.visualProfile!
    : defaultAiConfig.diagrams.visualProfile;
  return {
    enabled: diagrams?.enabled ?? defaultAiConfig.diagrams.enabled,
    visualProfile,
    iconSet: visualProfile === "compatible"
      ? "none"
      : ["none", "lucide"].includes(String(diagrams?.iconSet))
      ? diagrams!.iconSet!
      : defaultAiConfig.diagrams.iconSet,
    imagePolicy: visualProfile === "compatible"
      ? "disabled"
      : ["disabled", "project_assets", "external_confirm"].includes(String(diagrams?.imagePolicy))
      ? diagrams!.imagePolicy!
      : defaultAiConfig.diagrams.imagePolicy,
    betaPolicy: visualProfile !== "advanced" && diagrams?.betaPolicy === "enabled"
      ? "ask"
      : ["disabled", "ask", "enabled"].includes(String(diagrams?.betaPolicy))
      ? diagrams!.betaPolicy!
      : defaultAiConfig.diagrams.betaPolicy,
    defaultWidth: ["compact", "auto", "wide", "full"].includes(String(diagrams?.defaultWidth))
      ? diagrams!.defaultWidth!
      : defaultAiConfig.diagrams.defaultWidth,
    aiGenerationMode: visualProfile === "compatible"
      ? "safe"
      : ["safe", "visual"].includes(String(diagrams?.aiGenerationMode))
      ? diagrams!.aiGenerationMode!
      : defaultAiConfig.diagrams.aiGenerationMode,
  };
}

function normalizeAiModel(model: unknown): AiModelId {
  return normalizeLegacyAiModel(model) ?? defaultAiConfig.model;
}

function CapabilityUnavailablePanel({
  icon,
  title,
  description,
  badge,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge: string;
}) {
  return (
    <section className="rounded-md border border-orange-100 bg-brand-hover px-4 py-4">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 shrink-0 text-brand-orange">{icon}</span>
          <div className="min-w-0">
            <h5 className="text-[12px] font-semibold text-ink-primary">{title}</h5>
            <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{description}</p>
          </div>
        </div>
        <span className="rounded border border-orange-200 bg-white px-2 py-1 text-[10px] font-semibold text-brand-orange">{badge}</span>
      </header>
    </section>
  );
}

function normalizeAiVisionModel(model: unknown): AiVisionModelId {
  const normalized = normalizeLegacyAiModel(model);
  return normalized ?? defaultAiConfig.vision.model;
}

function normalizeLegacyAiModel(model: unknown): AiModelId | null { return typeof model === "string" && model.trim() ? model : null; }

function normalizeImageGenerationModel(model: unknown): AiImageGenerationModelId { return typeof model === "string" && model.trim() ? model : defaultAiConfig.imageGeneration.model; }

function normalizeImageGenerationSize(size: unknown): AiConfigStatus["imageGeneration"]["size"] {
  return gptImage2SizeOptions.includes(size as AiConfigStatus["imageGeneration"]["size"])
    ? size as AiConfigStatus["imageGeneration"]["size"]
    : defaultAiConfig.imageGeneration.size;
}

function normalizeImageGenerationSizeForModel(model: AiImageGenerationModelId, size: unknown): AiConfigStatus["imageGeneration"]["size"] {
  const normalized = normalizeImageGenerationSize(size);
  return imageGenerationSizeOptions(model).includes(normalized) ? normalized : "auto";
}

function imageGenerationSizeOptions(model: AiImageGenerationModelId): AiConfigStatus["imageGeneration"]["size"][] {
  return model.startsWith("gpt-image-2") ? gptImage2SizeOptions : baseImageGenerationSizeOptions;
}

function formatImageGenerationSize(size: AiConfigStatus["imageGeneration"]["size"], text: SettingsCopy): string {
  return size === "auto" ? text.imageGenerationAuto : size.replace("x", " x ");
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

function normalizeResearchGlobalToggle(
  agentic: (Partial<AiConfigStatus["agentic"]> & Record<string, unknown>) | undefined,
  field: "researchDiagramsEnabled" | "researchImagesEnabled",
  presetField: "diagramsEnabled" | "imagesEnabled",
  fallback: boolean,
) {
  if (typeof agentic?.[field] === "boolean") return agentic[field] as boolean;
  const presets = agentic?.researchPresets;
  if (presets && typeof presets === "object") {
    const values = Object.values(presets as Record<string, Record<string, unknown>>)
      .map((preset) => preset?.[presetField])
      .filter((value): value is boolean => typeof value === "boolean");
    if (values.length > 0) return values.some(Boolean);
  }
  return fallback;
}

function normalizeResearchPresets(presets: unknown): AiConfigStatus["agentic"]["researchPresets"] {
  const source = presets && typeof presets === "object" ? presets as Partial<AiConfigStatus["agentic"]["researchPresets"]> : {};
  return {
    quick: normalizeResearchPreset(source.quick, defaultAiConfig.agentic.researchPresets.quick),
    deep: normalizeResearchPreset(source.deep, defaultAiConfig.agentic.researchPresets.deep),
    compare: normalizeResearchPreset(source.compare, defaultAiConfig.agentic.researchPresets.compare),
    currentDocument: normalizeResearchPreset(source.currentDocument, defaultAiConfig.agentic.researchPresets.currentDocument),
  };
}

function normalizeResearchPreset(
  preset: (Partial<AiConfigStatus["agentic"]["researchPresets"][AiResearchPresetId]> & Record<string, unknown>) | undefined,
  fallback: AiConfigStatus["agentic"]["researchPresets"][AiResearchPresetId],
): AiConfigStatus["agentic"]["researchPresets"][AiResearchPresetId] {
  const legacyDiagrams = preset && "diagrams" in preset ? String(preset.diagrams) !== "none" : undefined;
  const legacyImages = preset && "images" in preset ? String(preset.images) !== "none" : undefined;
  const explicitCandidate = typeof preset?.candidateSourceLimit === "number" ? preset.candidateSourceLimit : undefined;
  const legacyMaxSources = preset && typeof preset.maxSources === "number" ? preset.maxSources : undefined;
  const legacySourceLimit = explicitCandidate === fallback.candidateSourceLimit ? legacyMaxSources ?? explicitCandidate : explicitCandidate ?? legacyMaxSources ?? fallback.candidateSourceLimit;
  return {
    candidateSourceLimit: clampSettingsNumber(legacySourceLimit, 1, 500, fallback.candidateSourceLimit),
    diagramsEnabled: typeof preset?.diagramsEnabled === "boolean" ? preset.diagramsEnabled : legacyDiagrams ?? fallback.diagramsEnabled,
    imagesEnabled: typeof preset?.imagesEnabled === "boolean" ? preset.imagesEnabled : legacyImages ?? fallback.imagesEnabled,
  };
}

function normalizeTranscription(transcription: Partial<AiConfigStatus["transcription"]> | undefined): AiConfigStatus["transcription"] {
  const favorites = Array.isArray(transcription?.favoriteLanguages)
    ? transcription.favoriteLanguages.filter(isTranscriptionLanguage)
    : defaultAiConfig.transcription.favoriteLanguages;
  const uniqueFavorites = Array.from(new Set(favorites.length ? favorites : defaultAiConfig.transcription.favoriteLanguages));
  return {
    enabled: transcription?.enabled ?? defaultAiConfig.transcription.enabled,
    model: transcription?.model || defaultAiConfig.transcription.model,
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
  privacyProject,
  onSecurityChanged,
  ai,
  aiIndexStatus,
  aiIndexBusy,
  aiIndexError,
  onRefreshAiIndex,
  text,
  onAiChange,
  onSaveOpenAiKey,
  onDeleteOpenAiKey,
  onRebuildAiIndex,
  onDeleteAiIndex,
}: {
  privacyProject?:{id:string;name:string}|null;
  onSecurityChanged?:()=>void|Promise<void>;
  ai: AiConfigStatus;
  aiIndexStatus: AiIndexStatusResponse | null;
  aiIndexBusy: boolean;
  aiIndexError: string | null;
  onRefreshAiIndex?: () => void;
  text: SettingsCopy;
  onAiChange: (ai: AiConfigStatus) => void;
  onSaveOpenAiKey: (apiKey: string) => void | Promise<void>;
  onDeleteOpenAiKey: () => void;
  onRebuildAiIndex: () => void;
  onReindexImages: () => void;
  onDeleteAiIndex: () => void;
}) {
  const { english } = useContext(SettingsDepth);
  const keyFieldId=useId(),keyErrorId=useId(),keyHintId=useId();
  const [apiKey, setApiKey] = useState("");
  const [keyEditorOpen, setKeyEditorOpen] = useState(false);
  const [keySaving,setKeySaving] = useState(false);
  const [keyError,setKeyError] = useState<string|null>(null);
  const keyPending = useRef(false);
  const [localAi, setLocalAi] = useState<AiConfigStatus>(() => normalizeAiStatus(ai));
  const localAiRef = useRef<AiConfigStatus>(normalizeAiStatus(ai));
  const settingsAi = localAi;
  const documentCount = aiIndexStatus?.documentCount ?? 0;
  const failedCount = aiIndexStatus?.failedDocumentCount ?? 0;
  const openAiKeySuffix = settingsAi.openaiKeyPreview?.slice(-4) ?? "";
  const modelOptions = catalogOptions("text", settingsAi.model);

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

  function updateRag(nextRag: Partial<AiConfigStatus["rag"]>) {
    const currentAi = localAiRef.current;
    commitAi({
      ...currentAi,
      rag: {
        ...currentAi.rag,
        ...nextRag,
      },
    });
  }

  async function saveApiKey() {
    const nextKey = apiKey.trim();
    if (!nextKey || keyPending.current) return;
    keyPending.current=true;setKeySaving(true);setKeyError(null);
    try {await onSaveOpenAiKey(nextKey);setApiKey("");setKeyEditorOpen(false);}
    catch(failure){setKeyError(getApiErrorMessage(failure,"No se ha podido guardar la clave. Se conserva el valor introducido para reintentar."));}
    finally{keyPending.current=false;setKeySaving(false);}
  }

  return (
    <div className="space-y-5">
      <SettingsSectionIntro icon={<Brain size={24} />} title={text.aiHeading} description={text.aiDescription} />

      <AiDataPolicyPanel language={english?"en":"es"}/>
      <AiPrivacyPanel key={privacyProject?.id??"no-project"} project={privacyProject??null} english={english} onChanged={onSecurityChanged}/>
      <CredentialSecurityPanel english={english} onChanged={onSecurityChanged}/>
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

          {settingsAi.credentialStorageError && <p role="alert" className="mt-3 text-sm text-red-700">{settingsAi.credentialStorageError}</p>}
          {settingsAi.credentialProtection === "windows-dpapi-user" && <p className="mt-3 text-xs text-ink-secondary">Protección nativa del usuario de Windows. Las claves se configuran por dispositivo.</p>}
          {settingsAi.credentialProtection === "android-keystore-aes-gcm" && <p className="mt-3 text-xs text-ink-secondary">Protección nativa de Android Keystore. Las claves se configuran por dispositivo.</p>}
          {keyError && <p id={keyErrorId} role="alert" className="mt-3 text-sm text-red-700">{keyError}</p>}
          {keyEditorOpen ? (
            <div className="mt-3 grid gap-2 border-t border-line pt-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="sr-only" htmlFor={keyFieldId}>{english?"OpenAI API key":"Clave API de OpenAI"}</label>
              <input
                id={keyFieldId}
                aria-describedby={[keyHintId,keyError?keyErrorId:null].filter(Boolean).join(" ")}
                aria-invalid={keyError?true:undefined}
                autoComplete="off"
                className="min-h-11 min-w-0 rounded-md border border-line bg-white px-3 text-[11px] outline-none focus:border-brand-orange"
                type="password"
                disabled={keySaving}
                value={apiKey}
                placeholder={text.openAiKeyPlaceholder}
                onChange={(event) => {setApiKey(event.target.value);if(keyError)setKeyError(null);}}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {event.preventDefault();void saveApiKey();}
                }}
              />
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                disabled={!apiKey.trim() || keySaving}
                onClick={() => void saveApiKey()}
              >
                <KeyRound size={14} />
                {text.saveKey}
              </button>
              {settingsAi.openaiKeyConfigured ? (
                <button
                  className="min-h-11 rounded-md border border-line px-3 text-[11px] font-semibold text-ink-primary hover:bg-panel"
                  disabled={keySaving}
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

        <p id={keyHintId} className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-ink-secondary">
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
          <ModelAccessCheck language={english?"en":"es"} model={settingsAi.model}/>
        <CapabilityToggleRow icon={<Eye size={14}/>} label={text.reviewTextEdits} description={text.reviewTextEditsHelp} enabled={settingsAi.agentic.confirmBeforeApplying} onToggle={() => {
          const current=localAiRef.current;
          commitAi({ ...current, agentic: { ...current.agentic, confirmBeforeApplying: !current.agentic.confirmBeforeApplying } });
        }}/>
      </SettingsPanel>

      <SettingsPanel>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h4 className="text-[15px] font-semibold text-ink-primary">{text.ragContextHeading}</h4>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.ragAvailableDescription}</p>
          </div>
          <Switch enabled={settingsAi.rag.enabled} label={text.ragContextHeading} onToggle={() => updateRag({ enabled: !settingsAi.rag.enabled })} />
        </div>

        {(aiIndexError || aiIndexStatus?.error) && <p role="alert" className="mt-3 text-xs leading-5 text-red-800">{aiIndexError ?? aiIndexStatus?.error}</p>}
        {onRefreshAiIndex && <button type="button" disabled={aiIndexBusy} onClick={onRefreshAiIndex} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded px-3 text-xs hover:bg-panel disabled:opacity-50"><RefreshCw size={13}/>{english ? "Refresh status" : "Actualizar estado"}</button>}
        {aiIndexBusy && <p role="status" className="mt-3 text-xs leading-5 text-ink-secondary">{english ? "Updating the local index…" : "Actualizando el índice local…"}</p>}
        <AdvancedOptions customized={Boolean(settingsAi.rag.vectorStoreId)}>
        <div className="mt-4 overflow-hidden rounded-md border border-line bg-white">
          <div className="grid gap-0 md:grid-cols-[minmax(0,1.25fr)_minmax(240px,0.75fr)]">
            <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
              <RagMetric label={text.ragStatus} value={describeIndexStatus(aiIndexStatus?.status ?? settingsAi.rag.status, english)} tone={aiIndexStatus?.status === "updated" ? "success" : aiIndexStatus?.status === "error" ? "warning" : "neutral"} />
              <RagMetric label={text.ragDocuments} value={aiIndexStatus?.documentCountKnown === false ? text.unavailableValue : documentCount ? String(documentCount) : text.summaryNone} />
              <RagMetric label={text.summaryVectorStore} value={(aiIndexStatus ? aiIndexStatus.vectorStoreId : settingsAi.rag.vectorStoreId) ?? text.summaryNone} />
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
                {aiIndexStatus?.error ?? (aiIndexStatus ? aiIndexStatus.lastIndexedAt : settingsAi.rag.lastIndexedAt) ?? text.ragNotIndexedMessage}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-brand-orange bg-white px-3 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={aiIndexBusy || !settingsAi.rag.enabled}
                onClick={onRebuildAiIndex}
              >
                <RefreshCw size={13} />
                {text.rebuildAiIndex}
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-panel disabled:cursor-not-allowed disabled:opacity-50"
                disabled={aiIndexBusy || !aiIndexStatus?.indexRevision}
                onClick={onDeleteAiIndex}
              >
                <Trash2 size={13} />
                {text.deleteAiIndex}
              </button>
            </div>
          </div>
        </div>
        </AdvancedOptions>
        {failedCount > 0 ? <p className="mt-2 text-[10px] leading-4 text-red-700">{text.ragFailed}: {failedCount}</p> : null}
      </SettingsPanel>
    </div>
  );
}

function SystemSettings({
  project,
  onBeforeBackup,
  onRestorePrepared,
  onBackupDirtyChange,
  onBeforeChange,
  onSettled,
  diagnostics,
  traceLogStatus,
  runtimeServicesStatus,
  refreshing,
  text,
  onDiagnosticsChange,
  onOpenTraceLogFolder,
  onRefresh,
}: {
  project:{id:string;name:string}|null;
  onBeforeBackup?:(projectId:string)=>Promise<void>;
  onRestorePrepared?:(projectId:string,transferId:string)=>void;
  onBackupDirtyChange?:(dirty:boolean)=>void;
  diagnostics: DiagnosticsConfig;
  traceLogStatus: TraceLogStatus | null;
  runtimeServicesStatus: RuntimeServicesStatus | null;
  refreshing: boolean;
  text: SettingsCopy;
  onDiagnosticsChange: (diagnostics: Partial<DiagnosticsConfig>) => void;
  onOpenTraceLogFolder: () => void;
  onRefresh: () => void;
} & StateTransitionAuthority) {
  const { english } = useContext(SettingsDepth);
  const services = runtimeServicesStatus?.services ?? [];
  const runtimeService = services.find((service) => service.id === "local-runtime") ?? services[0] ?? null;
  const logFolder = traceLogStatus?.folderPath ?? text.preparingLogFolder;
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    setCopyStatus("idle");
  }, [runtimeService]);

  async function handleCopyDiagnostic() {
    if (!runtimeService) return;
    const copied = await copyText(buildServiceDiagnostic(runtimeService));
    setCopyStatus(copied ? "copied" : "failed");
    window.setTimeout(() => setCopyStatus("idle"), 1800);
  }

  return (
    <div className="space-y-4">
      <SettingsSectionIntro icon={<Settings size={24} />} title={text.systemNav} description={text.systemDescription} />

      <StateMigrationPanel english={english} onBeforeChange={onBeforeChange} onSettled={onSettled}/>
      <ProjectBackupPanel project={project} english={english} onBeforeBackup={onBeforeBackup} onRestorePrepared={onRestorePrepared} onDirtyChange={onBackupDirtyChange}/>
      <StorageUsagePanel english={english}/>
      <SafeDiagnosticsPanel english={english} copyText={copyText}/>
      <AdvancedOptions><RuntimePerformancePanel english={english}/></AdvancedOptions>

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-[14px] font-semibold text-ink-primary">{text.servicesHeading}</h4>
              {runtimeService ? (
                <ServiceStatusBadge
                  value={runtimeService.statusLabel}
                  tone={runtimeService.status === "running" ? "success" : runtimeService.status === "degraded" ? "warning" : "danger"}
                />
              ) : null}
            </div>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.servicesDescription}</p>
            {runtimeServicesStatus?.checkedAt ? (
              <p className="mt-1 text-[10px] text-ink-secondary">{text.lastChecked}: {formatDateTime(runtimeServicesStatus.checkedAt)}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              {text.refreshServices}
            </button>
            <button
              className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!runtimeService}
              onClick={() => void handleCopyDiagnostic()}
            >
              <Copy size={14} />
              {copyStatus === "copied" ? text.copyDiagnosticCopied : copyStatus === "failed" ? text.copyDiagnosticFailed : text.copyDiagnostic}
            </button>
          </div>
        </header>

        <div className="grid border-b border-line sm:grid-cols-3">
          <SystemStatusMetric label={text.versionLabel} value={runtimeService?.version ?? text.unavailableValue} success={runtimeService?.version === runtimeService?.expectedVersion} />
          <SystemStatusMetric label={text.profileLabel} value={describeRuntimeProfile(runtimeService?.profile, text)} success={Boolean(runtimeService?.profile)} />
          <SystemStatusMetric label={text.servicesSummary} value={runtimeService?.statusLabel ?? text.servicesPending} success={runtimeService?.status === "running"} />
        </div>

        {services.length > 0 ? (
          <div className="divide-y divide-line">
            {services.map((service) => <SystemServiceCard key={service.id} service={service} text={text} />)}
          </div>
        ) : (
          <div className="px-4 py-3 text-[11px] text-ink-secondary">{text.servicesPending}</div>
        )}

        <div className="grid gap-0 border-t border-line md:grid-cols-2">
          <div className="min-w-0 border-b border-line px-4 py-3 md:border-b-0 md:border-r">
            <div className="flex items-center gap-2">
              <FolderOpen size={14} className="shrink-0 text-ink-secondary" />
              <p className="text-[11px] font-semibold text-ink-primary">{text.storageHeading}</p>
            </div>
            <p className="mt-1 truncate font-mono text-[10px] text-ink-secondary">{runtimeService?.appDataDir ?? text.unavailableValue}</p>
          </div>
          <div className="min-w-0 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <ListChecks size={14} className="shrink-0 text-ink-secondary" />
                <p className="text-[11px] font-semibold text-ink-primary">{text.diagnosticsHeading}</p>
                <StatusPill label="" value={diagnostics.traceLoggingEnabled ? text.enabled : text.disabled} tone={diagnostics.traceLoggingEnabled ? "success" : "neutral"} />
              </div>
              <Switch enabled={diagnostics.traceLoggingEnabled} label={text.traceToggleAria} onToggle={() => onDiagnosticsChange({ traceLoggingEnabled: !diagnostics.traceLoggingEnabled })} />
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 truncate font-mono text-[10px] text-ink-secondary">{logFolder}</p>
              <button
                className="inline-flex h-7 shrink-0 items-center gap-2 rounded-md border border-line bg-white px-2.5 text-[10px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!traceLogStatus?.folderPath||traceLogStatus.directoryExists===false}
                onClick={onOpenTraceLogFolder}
              >
                <FolderOpen size={13} />
                {text.openLogFolder}
              </button>
            </div>
          </div>
        </div>
      </section>
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
  return <section className="settings-panel rounded-md border border-line bg-white px-4 py-4">{children}</section>;
}

function AdvancedOptions({ children, customized = false }: { children: ReactNode; customized?: boolean }) {
  const { advanced, setAdvanced, english } = useContext(SettingsDepth);
  return <details className="settings-advanced" open={advanced}>
    <summary onClick={event => { event.preventDefault(); setAdvanced(!advanced); }}>
      {english ? "Advanced options" : "Opciones avanzadas"}{customized ? (english ? " · Active configuration" : " · Configuración activa") : ""}
    </summary>
    <p className="text-xs text-ink-secondary">{english ? "Switching views preserves every value." : "Cambiar de vista conserva todos los valores."}</p>
    {children}
  </details>;
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

function SystemStatusMetric({ label, value, success }: { label: string; value: string; success?: boolean }) {
  return (
    <div className="border-b border-line px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-[10px] font-semibold text-ink-secondary">{label}</p>
      <p className={["mt-1 truncate text-[13px] font-semibold", success ? "text-emerald-700" : "text-ink-primary"].join(" ")}>{value}</p>
    </div>
  );
}

function SystemServiceCard({
  service,
  text,
}: {
  service: RuntimeServicesStatus["services"][number];
  text: SettingsCopy;
}) {
  const stateTone = service.status === "running" ? "success" : service.status === "degraded" ? "warning" : "danger";

  return (
    <article className="px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] font-semibold text-ink-primary">{describeServiceName(service, text)}</p>
          <ServiceStatusBadge value={service.statusLabel} tone={stateTone} />
        </div>
        <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{describeServiceDescription(service, text)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-secondary">
          <span>{text.versionLabel}: <strong className={service.version === service.expectedVersion ? "text-emerald-700" : "text-ink-primary"}>{service.version ?? text.unavailableValue}</strong></span>
          <span>{text.profileLabel}: <strong className="text-ink-primary">{describeRuntimeProfile(service.profile, text)}</strong></span>
          {service.startedAt ? <span>{text.startedAtLabel}: {formatDateTime(service.startedAt)}</span> : null}
        </div>
      </div>

      {service.lastError ? (
        <div className="mt-3 rounded-md border border-red-100 bg-red-50 px-3 py-2">
          <p className="text-[10px] font-semibold text-red-700">{text.lastErrorLabel}</p>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-red-700">{service.lastError}</pre>
        </div>
      ) : null}
    </article>
  );
}

function describeServiceName(service: RuntimeServicesStatus["services"][number], text: SettingsCopy) {
  return service.id === "local-runtime" ? text.localAppServiceName : service.name;
}

function describeServiceDescription(service: RuntimeServicesStatus["services"][number], text: SettingsCopy) {
  return service.id === "local-runtime" ? text.localAppServiceDescription : service.description;
}

function describeRuntimeProfile(profile: string | null | undefined, text: SettingsCopy) {
  if (!profile) return text.unavailableValue;
  if (profile === "desktop") return text.desktopProfile;
  if (profile === "android") return text.androidProfile;
  if (profile === "unauthenticated") return text.unauthenticatedProfile;
  return profile;
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

function ExportSettings({
  template,
  templatePath,
  text,
  onExportTemplateChange,
  onResetExportTemplate,
}: {
  template: ExportTemplateConfig;
  templatePath: string;
  text: SettingsCopy;
  onExportTemplateChange: (template: ExportTemplateUpdate) => void;
  onResetExportTemplate: () => void;
}) {
  const headingLevels = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
  const [draft, setDraft] = useState<ExportTemplateConfig>(() => cloneExportTemplate(template));
  const draftRef = useRef<ExportTemplateConfig>(draft);

  useEffect(() => {
    const nextDraft = cloneExportTemplate(template);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, [template]);

  function commitDraft(nextDraft: ExportTemplateConfig) {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    onExportTemplateChange(exportTemplateUpdateFromConfig(nextDraft));
  }

  function updateHeading(level: typeof headingLevels[number], patch: Partial<ExportTemplateConfig["headings"][typeof level]>) {
    const current = draftRef.current;
    commitDraft({
      ...current,
      headings: {
        ...current.headings,
        [level]: {
          ...current.headings[level],
          ...patch,
        },
      },
    });
  }

  function updateNormal(patch: Partial<ExportTemplateConfig["normal"]>) {
    const current = draftRef.current;
    commitDraft({ ...current, normal: { ...current.normal, ...patch } });
  }

  function updatePage(patch: Partial<ExportTemplateConfig["page"]>) {
    const current = draftRef.current;
    commitDraft({ ...current, page: { ...current.page, ...patch } });
  }

  function updateMargins(patch: Partial<ExportTemplateConfig["page"]["margins"]>) {
    const current = draftRef.current;
    commitDraft({ ...current, page: { ...current.page, margins: { ...current.page.margins, ...patch } } });
  }

  function updateParagraph(patch: Partial<ExportTemplateConfig["paragraph"]>) {
    const current = draftRef.current;
    commitDraft({ ...current, paragraph: { ...current.paragraph, ...patch } });
  }

  function updateDocument(patch: Partial<ExportTemplateConfig["document"]>) {
    const current = draftRef.current;
    commitDraft({ ...current, document: { ...current.document, ...patch } });
  }

  function headingLabel(level: typeof headingLevels[number]) {
    const headingNumber = Number(level.slice(1));
    return text.exportHeadingLevelName.replace("{level}", String(headingNumber));
  }

  return (
    <div className="space-y-5">
      <section className="flex items-start gap-3">
        <Download size={26} className="mt-1 shrink-0 text-brand-orange" />
        <div className="min-w-0">
          <h3 className="text-[20px] font-semibold tracking-normal text-ink-primary">{text.exportNav}</h3>
          <p className="mt-2 text-[12px] leading-5 text-ink-secondary">{text.exportDescription}</p>
        </div>
      </section>

      <div className="space-y-4">
        <ExportPanel icon={FileText} title={text.exportPageHeading}>
          <div className="grid gap-4 md:grid-cols-4">
            <LabeledSelect
              label={text.exportPageSize}
              value={draft.page.size}
              onChange={(value) => updatePage({ size: value as ExportTemplateConfig["page"]["size"] })}
              options={[["A4", "A4"], ["Letter", "Letter"]]}
            />
            <LabeledNumber
              label={text.exportMarginMm}
              value={draft.page.margins.leftMm}
              min={5}
              max={50}
              step={1}
              onChange={(leftMm) => updateMargins({ leftMm, rightMm: leftMm })}
            />
            <LabeledNumber
              label={text.exportTopMarginMm}
              value={draft.page.margins.topMm}
              min={5}
              max={50}
              step={1}
              onChange={(topMm) => updateMargins({ topMm })}
            />
            <LabeledNumber
              label={text.exportBottomMarginMm}
              value={draft.page.margins.bottomMm}
              min={5}
              max={50}
              step={1}
              onChange={(bottomMm) => updateMargins({ bottomMm })}
            />
          </div>
        </ExportPanel>

        <ExportPanel icon={TypeIcon} title={text.exportTextHeading}>
          <div className="grid gap-4 md:grid-cols-[1.35fr_0.7fr_0.9fr_0.9fr_0.9fr]">
            <LabeledSelect label={text.exportFontFamily} value={draft.normal.fontFamily} onChange={(fontFamily) => updateNormal({ fontFamily })} options={exportFontOptions} previewOptionFont />
            <LabeledSelect
              label={text.exportNormalSize}
              value={String(draft.normal.fontSizePt)}
              onChange={(fontSizePt) => updateNormal({ fontSizePt: Number(fontSizePt) })}
              options={exportSizeOptions}
            />
            <LabeledNumber
              label={text.exportLineSpacing}
              value={draft.paragraph.lineSpacing}
              min={1}
              max={2.5}
              step={0.05}
              onChange={(lineSpacing) => updateParagraph({ lineSpacing })}
            />
            <LabeledNumber
              label={text.exportSpaceBefore}
              value={draft.paragraph.spaceBeforePt}
              min={0}
              max={24}
              step={1}
              onChange={(spaceBeforePt) => updateParagraph({ spaceBeforePt })}
            />
            <LabeledNumber
              label={text.exportSpaceAfter}
              value={draft.paragraph.spaceAfterPt}
              min={0}
              max={24}
              step={1}
              onChange={(spaceAfterPt) => updateParagraph({ spaceAfterPt })}
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <LabeledColor label={text.exportTextColor} value={draft.normal.color} onChange={(color) => updateNormal({ color })} />
            <LabeledColor label={text.exportLinkColor} value={draft.document.linkColor} onChange={(linkColor) => updateDocument({ linkColor })} />
            <LabeledColor label={text.exportRuleColor} value={draft.document.horizontalRuleColor} onChange={(horizontalRuleColor) => updateDocument({ horizontalRuleColor })} />
            <LabeledSelect
              label={text.exportDiagramResolution}
              value={draft.document.diagramResolution}
              onChange={(diagramResolution) => updateDocument({ diagramResolution: diagramResolution as ExportTemplateConfig["document"]["diagramResolution"] })}
              options={[
                ["low", text.exportDiagramResolutionLow],
                ["medium", text.exportDiagramResolutionMedium],
                ["high", text.exportDiagramResolutionHigh],
              ]}
            />
          </div>
        </ExportPanel>

        <ExportPanel title={text.exportHeadingsHeading} description={text.exportHeadingsDescription}>
          <div className="grid gap-2">
            <div className="hidden grid-cols-[110px_minmax(130px,1.2fr)_minmax(120px,0.9fr)_minmax(74px,0.55fr)_minmax(74px,0.55fr)_minmax(74px,0.55fr)_minmax(130px,1fr)] gap-3 px-0.5 text-[11px] font-medium text-ink-secondary md:grid">
              <span>{text.exportHeadingLevel}</span>
              <span>{text.exportHeadingFontFamily}</span>
              <span>{text.exportHeadingFormat}</span>
              <span>{text.exportHeadingSize}</span>
              <span>{text.exportHeadingSpaceBefore}</span>
              <span>{text.exportHeadingSpaceAfter}</span>
              <span>{text.exportHeadingColor}</span>
            </div>
            {headingLevels.map((level) => (
              <div key={level} className="grid gap-3 md:grid-cols-[110px_minmax(130px,1.2fr)_minmax(120px,0.9fr)_minmax(74px,0.55fr)_minmax(74px,0.55fr)_minmax(74px,0.55fr)_minmax(130px,1fr)] md:gap-3">
                <div className="flex h-10 items-center rounded-md border border-line bg-panel px-3 text-[13px] font-semibold text-ink-primary">
                  {headingLabel(level)}
                </div>
                <LabeledSelect
                  label={`${text.exportHeadingFontFamily} ${headingLabel(level)}`}
                  hideLabel
                  value={draft.headings[level].fontFamily}
                  onChange={(fontFamily) => updateHeading(level, { fontFamily })}
                  options={exportFontOptions}
                  previewOptionFont
                />
                <LabeledSelect
                  label={`${text.exportHeadingFormat} ${headingLabel(level)}`}
                  hideLabel
                  value={draft.headings[level].textFormat}
                  onChange={(textFormat) => updateHeading(level, { textFormat: textFormat as ExportTextFormat })}
                  options={exportTextFormatOptions(text)}
                />
                <LabeledNumber
                  label={`${text.exportHeadingSize} ${headingLabel(level)}`}
                  hideLabel
                  value={draft.headings[level].fontSizePt}
                  min={8}
                  max={60}
                  step={0.5}
                  onChange={(fontSizePt) => updateHeading(level, { fontSizePt })}
                />
                <LabeledNumber
                  label={`${text.exportHeadingSpaceBefore} ${headingLabel(level)}`}
                  hideLabel
                  value={draft.headings[level].spaceBeforePt ?? 0}
                  min={0}
                  max={48}
                  step={1}
                  onChange={(spaceBeforePt) => updateHeading(level, { spaceBeforePt })}
                />
                <LabeledNumber
                  label={`${text.exportHeadingSpaceAfter} ${headingLabel(level)}`}
                  hideLabel
                  value={draft.headings[level].spaceAfterPt ?? 0}
                  min={0}
                  max={48}
                  step={1}
                  onChange={(spaceAfterPt) => updateHeading(level, { spaceAfterPt })}
                />
                <LabeledColor
                  label={`${text.exportHeadingColor} ${headingLabel(level)}`}
                  hideLabel
                  value={draft.headings[level].color}
                  onChange={(color) => updateHeading(level, { color })}
                />
              </div>
            ))}
          </div>
        </ExportPanel>

        <ExportPanel icon={Download} title={text.exportTemplateFileHeading}>
          <div className="grid items-center gap-4 lg:grid-cols-[220px_1fr_auto]">
            <p className="text-[12px] leading-5 text-ink-secondary">{text.exportTemplateFileDescription}</p>
            <p className="min-w-0 truncate rounded-md border border-line bg-panel px-3 py-2 font-mono text-[10px] leading-5 text-ink-secondary">{templatePath || text.unavailableValue}</p>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-brand-orange bg-white px-4 text-[12px] font-semibold text-brand-orange hover:bg-brand-hover"
              type="button"
              onClick={onResetExportTemplate}
            >
              <RotateCcw size={15} />
              {text.exportResetTemplate}
            </button>
          </div>
        </ExportPanel>
      </div>

      <div className="border-t border-line pt-4">
        <p className="flex min-w-0 items-start gap-2 text-[11px] leading-5 text-ink-secondary">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>{text.exportSettingsNote}</span>
        </p>
      </div>
    </div>
  );
}

function cloneExportTemplate(template: ExportTemplateConfig): ExportTemplateConfig {
  return {
    ...template,
    page: {
      ...template.page,
      margins: { ...template.page.margins },
    },
    normal: { ...template.normal },
    headings: Object.fromEntries(
      Object.entries(template.headings).map(([level, style]) => [level, { ...style }]),
    ) as ExportTemplateConfig["headings"],
    code: { ...template.code },
    paragraph: { ...template.paragraph },
    document: { ...template.document },
  };
}

function exportTemplateUpdateFromConfig(template: ExportTemplateConfig): ExportTemplateUpdate {
  return {
    page: template.page,
    normal: template.normal,
    headingFontFamily: template.headings.h1.fontFamily,
    headings: template.headings,
    code: template.code,
    paragraph: template.paragraph,
    document: template.document,
  };
}

function ExportPanel({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon?: typeof FileText;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-white">
      <div className="flex items-start gap-2 px-5 py-4">
        {Icon ? <Icon size={17} className="mt-0.5 shrink-0 text-ink-secondary" /> : null}
        <div className="min-w-0">
          <h4 className="text-[15px] font-semibold text-ink-primary">{title}</h4>
          {description ? <p className="mt-2 text-[12px] leading-5 text-ink-secondary">{description}</p> : null}
        </div>
      </div>
      <div className="px-5 pb-5">
        {children}
      </div>
    </section>
  );
}

const exportSizeOptions: Array<[string, string]> = [
  ["9", "9"],
  ["10", "10"],
  ["11", "11"],
  ["12", "12"],
  ["13", "13"],
  ["14", "14"],
  ["15", "15"],
  ["16", "16"],
  ["18", "18"],
  ["20", "20"],
  ["22", "22"],
  ["24", "24"],
];

function exportTextFormatOptions(text: SettingsCopy): Array<[ExportTextFormat, string]> {
  return [
    ["normal", text.exportTextFormatNormal],
    ["bold", text.exportTextFormatBold],
    ["underline", text.exportTextFormatUnderline],
    ["bold_underline", text.exportTextFormatBoldUnderline],
  ];
}

function LabeledNumber({
  label,
  value,
  min,
  max,
  step,
  hideLabel = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hideLabel?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[11px] font-medium text-ink-secondary">
      <span className={hideLabel ? "sr-only" : ""}>{label}</span>
      <input
        className={`${hideLabel ? "" : "mt-1"} h-10 w-full rounded-md border border-line bg-white px-3 text-[12px] text-ink-primary outline-none focus:border-brand-orange`}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function LabeledColor({ label, value, hideLabel = false, onChange }: { label: string; value: string; hideLabel?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block text-[11px] font-medium text-ink-secondary">
      <span className={hideLabel ? "sr-only" : ""}>{label}</span>
      <span className={`${hideLabel ? "" : "mt-1"} flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3`}>
        <input className="h-5 w-8 shrink-0 cursor-pointer border-0 bg-transparent p-0" type="color" value={value} onChange={(event) => onChange(event.currentTarget.value)} />
        <input
          className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-ink-primary outline-none"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </span>
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  options,
  previewOptionFont = false,
  hideLabel = false,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  previewOptionFont?: boolean;
  hideLabel?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-[11px] font-medium text-ink-secondary">
      <span className={hideLabel ? "sr-only" : ""}>{label}</span>
      <select
        className={`${hideLabel ? "" : "mt-1"} h-10 w-full rounded-md border border-line bg-white px-3 text-[12px] text-ink-primary outline-none focus:border-brand-orange`}
        style={previewOptionFont ? { fontFamily: value } : undefined}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue} style={previewOptionFont ? { fontFamily: optionValue } : undefined}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
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
        <span className={`settings-theme-description mt-1 block text-[11px] leading-5 ${selected ? "text-ink-primary" : "text-ink-secondary"}`}>{option.description}</span>
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
  const keyFieldId=useId();
  const {english}=useContext(SettingsDepth);
  const [apiKey, setApiKey] = useState("");
  const [localAi, setLocalAi] = useState<AiConfigStatus>(() => normalizeAiStatus(ai));
  const localAiRef = useRef<AiConfigStatus>(normalizeAiStatus(ai));
  const settingsAi = localAi;
  const documentCount = aiIndexStatus?.documentCount ?? 0;
  const failedCount = aiIndexStatus?.failedDocumentCount ?? 0;
  const openAiKeySuffix = settingsAi.openaiKeyPreview?.slice(-4) ?? "";
  const openAiKeyPlaceholder = settingsAi.openaiKeyConfigured
    ? openAiKeySuffix
      ? `${text.openAiKeyConfiguredPlaceholder} ${openAiKeySuffix}`
      : text.openAiKeyConfiguredGenericPlaceholder
    : text.openAiKeyMissingPlaceholder;
  const modelOptions = catalogOptions("text", settingsAi.model);

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
          <label htmlFor={keyFieldId} className="sr-only">{english?"OpenAI API key":"Clave API de OpenAI"}</label>
          <input
            id={keyFieldId}
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-[11px] outline-none focus:border-brand-orange"
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

      <section className="rounded-md border border-orange-100 bg-brand-hover px-3 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ImageIcon size={15} className="text-brand-orange" />
              <p className="text-[11px] font-semibold text-ink-primary">{text.imageGenerationUnavailableTitle}</p>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.imageGenerationUnavailableDescription}</p>
          </div>
          <span className="rounded border border-orange-200 bg-white px-2 py-1 text-[10px] font-semibold text-brand-orange">{text.unavailableValue}</span>
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
              <option value="gpt-transcribe">GPT-Transcribe</option><option value="gpt-4o-mini-transcribe">gpt-4o-mini-transcribe</option>
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
        <div className="mt-3 rounded-md border border-orange-100 bg-brand-hover px-3 py-2">
          <p className="text-[10px] leading-4 text-ink-secondary">{text.imageGenerationUnavailableDescription}</p>
        </div>
      </section>

      <section className="rounded-md border border-line px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Gauge size={15} className="text-brand-orange" />
              <p className="text-[11px] font-semibold text-ink-primary">{text.agenticHeading}</p>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.agenticUnavailableDescription}</p>
          </div>
          <span className="rounded border border-orange-200 bg-brand-hover px-2 py-1 text-[10px] font-semibold text-brand-orange">{text.unavailableValue}</span>
        </div>
      </section>

      <section className="rounded-md border border-line px-3 py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-ink-primary">{text.ragHeading}</p>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{text.ragUnavailableDescription}</p>
          </div>
          <span className="rounded border border-orange-200 bg-brand-hover px-2 py-1 text-[10px] font-semibold text-brand-orange">{text.unavailableValue}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <StatusPill label={text.ragStatus} value={text.unavailableValue} />
          <StatusPill label={text.ragDocuments} value={documentCount ? String(documentCount) : text.summaryNone} />
          {failedCount > 0 ? <StatusPill label={text.ragFailed} value={String(failedCount)} tone="danger" /> : null}
          {aiIndexStatus?.localExactReady ? <StatusPill label={text.ragExactReady} value={text.enabled} tone="success" /> : null}
        </div>
        {aiIndexStatus?.error ? <p className="mt-2 text-[10px] leading-4 text-red-700">{aiIndexStatus.error}</p> : null}
        <p className="mt-3 rounded-md border border-orange-100 bg-brand-hover px-3 py-2 text-[10px] leading-4 text-ink-secondary">{text.ragExplicitContextNotice}</p>
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
      className="grid h-11 w-11 shrink-0 place-items-center rounded-md"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      type="button"
      onClick={onToggle}
    >
      <span aria-hidden="true" data-settings-switch-track className={["relative block h-6 w-11 rounded-full transition", enabled ? "bg-brand-orange" : "bg-line"].join(" ")}><span
        className={[
          "absolute top-1 h-4 w-4 rounded-full bg-white shadow-subtle transition",
          enabled ? "left-6" : "left-1",
        ].join(" ")}
      /></span>
    </button>
  );
}

function describeIndexStatus(status: AiIndexStatusResponse["status"], english = false) {
  if (status === "indexing") return english ? "Indexing" : "Indexando";
  if (status === "updated") return english ? "Indexed" : "Indexado";
  if (status === "error") return "Error";
  return english ? "Not indexed" : "No indexado";
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

function useStableSection(open: boolean, initialSection: AppSettingsSection): [AppSettingsSection, (section: AppSettingsSection) => void] {
  const [activeSection, setActiveSection] = useState<AppSettingsSection>("summary");

  useEffect(() => {
    if (open) setActiveSection(initialSection);
  }, [open, initialSection]);

  return [activeSection, setActiveSection];
}
