import type { AiConfig, AiConfigStatus, AiImageGenerationModelId, AiModelId, AppConfig, AppConfigUpdate, AppearanceAccentColor, AppearanceConfig, AppearanceThemeMode, DiagnosticsConfig, ExportTemplateConfig, ExportTemplateUpdate, LayoutConfig, ProjectTabsConfig } from "../../types/domain";
import { requestJson } from "./client";

export const defaultLayoutConfig: LayoutConfig = {
  sidebarWidth: 338,
  historyWidth: 320,
};

export const defaultAppearanceConfig: AppearanceConfig = {
  language: "es",
  zoomPercent: 100,
  markdownExtendedUnderlineEnabled: true,
  themeMode: "system",
  primaryColor: "orange",
};

export const defaultDiagnosticsConfig: DiagnosticsConfig = {
  traceLoggingEnabled: false,
};

export const defaultExportTemplateConfig: ExportTemplateConfig = {
  schemaVersion: 2,
  name: "basic",
  page: {
    size: "A4",
    margins: {
      topMm: 20,
      rightMm: 18,
      bottomMm: 20,
      leftMm: 18,
    },
  },
  normal: {
    fontFamily: "Arial",
    fontSizePt: 11,
    color: "#111827",
    textFormat: "normal",
  },
  headingFontFamily: "Arial",
  headings: {
    h1: { fontFamily: "Arial", fontSizePt: 22, color: "#111827", textFormat: "bold" },
    h2: { fontFamily: "Arial", fontSizePt: 18, color: "#111827", textFormat: "bold" },
    h3: { fontFamily: "Arial", fontSizePt: 15, color: "#111827", textFormat: "bold" },
    h4: { fontFamily: "Arial", fontSizePt: 13, color: "#111827", textFormat: "bold" },
    h5: { fontFamily: "Arial", fontSizePt: 12, color: "#111827", textFormat: "bold" },
    h6: { fontFamily: "Arial", fontSizePt: 11, color: "#111827", textFormat: "bold" },
  },
  code: {
    fontFamily: "Consolas",
    fontSizePt: 9.5,
    color: "#111827",
    textFormat: "normal",
  },
  paragraph: {
    lineSpacing: 1.2,
    spaceAfterPt: 3,
  },
  document: {
    includeTitle: false,
    linkColor: "#D85A12",
    horizontalRuleColor: "#E5E7EB",
  },
  updatedAt: new Date(0).toISOString(),
};

const exportFontFamilies = new Set([
  "Arial",
  "Calibri",
  "Aptos",
  "Times New Roman",
  "Georgia",
  "Verdana",
  "Courier New",
  "Consolas",
]);

const exportTextFormats = new Set(["normal", "bold", "underline", "bold_underline"]);

export const defaultAiConfig: AiConfig = {
  provider: "openai",
  model: "gpt-5.4-mini",
  permissions: {
    editDocuments: true,
    createFolders: false,
    createDocuments: false,
    deleteDocumentsAndFolders: false,
    generateImages: false,
    createImageAssets: false,
    insertImagesIntoDocuments: false,
    useDocumentContextForImageGeneration: false,
  },
  rag: {
    enabled: false,
    vectorStoreId: null,
    lastIndexedAt: null,
    status: "not-indexed",
    error: null,
  },
  vision: {
    enabled: true,
    model: "gpt-5.4-mini",
    imageIndexingEnabled: false,
    maxImagesPerPrompt: 4,
    maxImageSizeMb: 12,
    detail: "auto",
    storeVisualDescriptions: true,
  },
  imageGeneration: {
    enabled: false,
    model: "gpt-image-1.5",
    size: "auto",
    quality: "auto",
    outputFormat: "png",
    defaultFolder: "document_folder",
    customFolderPath: "assets/generated",
    maxImagesPerPrompt: 1,
    confirmBeforeDocumentInsert: false,
    confirmBeforeUsingMultipleSources: true,
    storePromptMetadata: true,
  },
  agentic: {
    depth: "guided",
    webResearchEnabled: false,
    confirmBeforeApplying: true,
    maxSteps: 4,
    maxDocuments: 6,
    maxEstimatedCostEur: 1,
    maxSources: 6,
  },
  transcription: {
    enabled: true,
    model: "gpt-4o-mini-transcribe",
    defaultTarget: "prompt",
    defaultLanguage: "auto",
    favoriteLanguages: ["es", "en"],
  },
};

export const defaultProjectTabsConfig: ProjectTabsConfig = {
  openTabs: [],
  activeDocumentId: "",
};

export const defaultAppConfig: AppConfig = {
  schemaVersion: 3,
  layout: defaultLayoutConfig,
  appearance: defaultAppearanceConfig,
  diagnostics: defaultDiagnosticsConfig,
  ai: defaultAiConfig,
  tabsByProject: {},
  treeOpenPathsByProject: {},
  lastRunAppVersion: null,
  lastSeenReleaseNotesVersion: null,
  openUtilityTabs: [],
  activeUtilityTab: null,
  updatedAt: new Date(0).toISOString(),
};

export async function getAppConfig(): Promise<AppConfig> {
  return normalizeAppConfig(await requestJson<AppConfig>("/api/config"));
}

export async function updateAppConfig(payload: AppConfigUpdate): Promise<AppConfig> {
  return normalizeAppConfig(await requestJson<AppConfig>("/api/config", {
    method: "PUT",
    body: JSON.stringify(payload),
  }));
}

export async function getAiConfig(): Promise<AiConfigStatus> {
  return requestJson<AiConfigStatus>("/api/config/ai");
}

export async function updateAiConfig(payload: AiConfig): Promise<AiConfigStatus> {
  return requestJson<AiConfigStatus>("/api/config/ai", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getExportTemplate(): Promise<ExportTemplateConfig> {
  return normalizeExportTemplate(await requestJson<ExportTemplateConfig>("/api/config/export-template"));
}

export async function updateExportTemplate(payload: ExportTemplateUpdate): Promise<ExportTemplateConfig> {
  return normalizeExportTemplate(await requestJson<ExportTemplateConfig>("/api/config/export-template", {
    method: "PUT",
    body: JSON.stringify(payload),
  }));
}

export async function resetExportTemplate(): Promise<ExportTemplateConfig> {
  return normalizeExportTemplate(await requestJson<ExportTemplateConfig>("/api/config/export-template/reset", {
    method: "POST",
  }));
}

export async function getExportTemplatePath(): Promise<string> {
  const response = await requestJson<{ path: string }>("/api/config/export-template/path");
  return response.path;
}

const localPreferencesKey = "knownext.app.preferences";

type LocalAppPreferences = {
  appearance?: AppearanceConfig;
  diagnostics?: DiagnosticsConfig;
  ai?: AiConfig;
};

export function readLocalAppPreferences(): LocalAppPreferences {
  try {
    const rawPreferences = window.localStorage.getItem(localPreferencesKey);
    if (!rawPreferences) return {};

    const parsed = JSON.parse(rawPreferences) as LocalAppPreferences;
    return {
      appearance: normalizeAppearance(parsed.appearance),
      diagnostics: normalizeDiagnostics(parsed.diagnostics),
      ai: normalizeAi(parsed.ai),
    };
  } catch {
    return {};
  }
}

export function writeLocalAppPreferences(preferences: LocalAppPreferences) {
  const currentPreferences = readLocalAppPreferences();
  const nextPreferences = {
    ...currentPreferences,
    ...preferences,
    appearance: preferences.appearance ? normalizeAppearance(preferences.appearance) : currentPreferences.appearance,
    diagnostics: preferences.diagnostics ? normalizeDiagnostics(preferences.diagnostics) : currentPreferences.diagnostics,
    ai: preferences.ai ? normalizeAi(preferences.ai) : currentPreferences.ai,
  };

  window.localStorage.setItem(localPreferencesKey, JSON.stringify(nextPreferences));
}

function normalizeAppearance(appearance: AppearanceConfig | undefined): AppearanceConfig | undefined {
  if (!appearance) return undefined;
  return {
    language: appearance.language === "en" ? "en" : "es",
    zoomPercent: Math.min(Math.max(Number(appearance.zoomPercent) || 100, 85), 125),
    markdownExtendedUnderlineEnabled: appearance.markdownExtendedUnderlineEnabled !== false,
    themeMode: normalizeThemeMode(appearance.themeMode),
    primaryColor: normalizeAccentColor(appearance.primaryColor),
  };
}

function normalizeAppConfig(config: AppConfig): AppConfig {
  const normalizedConfig = { ...defaultAppConfig, ...config };
  const openUtilityTabs = normalizeUtilityTabs(config.openUtilityTabs);
  return {
    ...normalizedConfig,
    schemaVersion: 3,
    layout: config.layout ?? defaultLayoutConfig,
    appearance: normalizeAppearance(config.appearance) ?? defaultAppearanceConfig,
    diagnostics: normalizeDiagnostics(config.diagnostics) ?? defaultDiagnosticsConfig,
    ai: normalizeAi(config.ai) ?? defaultAiConfig,
    tabsByProject: config.tabsByProject ?? {},
    treeOpenPathsByProject: normalizeTreeOpenPathsByProject(config.treeOpenPathsByProject),
    openUtilityTabs,
    activeUtilityTab: normalizeActiveUtilityTab(config.activeUtilityTab, openUtilityTabs),
    lastRunAppVersion: config.lastRunAppVersion ?? null,
    lastSeenReleaseNotesVersion: config.lastSeenReleaseNotesVersion ?? null,
  };
}

function normalizeUtilityTabs(value: unknown): AppConfig["openUtilityTabs"] {
  return Array.isArray(value) && value.includes("release-notes") ? ["release-notes"] : [];
}

function normalizeActiveUtilityTab(value: unknown, openUtilityTabs: AppConfig["openUtilityTabs"]): AppConfig["activeUtilityTab"] {
  if (value === "notes") return "notes";
  if (value === "release-notes" && openUtilityTabs.includes("release-notes")) return "release-notes";
  return null;
}

function normalizeTreeOpenPathsByProject(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  const normalized: Record<string, string[]> = {};
  Object.entries(value as Record<string, unknown>).forEach(([projectId, rawPaths]) => {
    if (!projectId || !Array.isArray(rawPaths)) return;
    const paths = rawPaths
      .filter((path): path is string => typeof path === "string")
      .map((path) => path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
      .filter((path, index, allPaths) => Boolean(path) && !path.split("/").some((part) => part === "." || part === "..") && allPaths.indexOf(path) === index)
      .sort((first, second) => first.localeCompare(second));
    if (paths.length > 0) normalized[projectId] = paths;
  });
  return normalized;
}

function normalizeThemeMode(themeMode: unknown): AppearanceThemeMode {
  return ["system", "light", "dark"].includes(String(themeMode))
    ? themeMode as AppearanceThemeMode
    : defaultAppearanceConfig.themeMode;
}

function normalizeAccentColor(primaryColor: unknown): AppearanceAccentColor {
  return ["orange", "amber", "yellow", "lime", "olive", "green", "cyan", "blue", "indigo", "wine", "rose", "red"].includes(String(primaryColor))
    ? primaryColor as AppearanceAccentColor
    : defaultAppearanceConfig.primaryColor;
}

function normalizeDiagnostics(diagnostics: DiagnosticsConfig | undefined): DiagnosticsConfig | undefined {
  if (!diagnostics) return undefined;
  return {
    traceLoggingEnabled: Boolean(diagnostics.traceLoggingEnabled),
  };
}

function normalizeExportTemplate(template: ExportTemplateConfig | undefined): ExportTemplateConfig {
  if (!template) return defaultExportTemplateConfig;
  const headingFontFamily = normalizeFontFamily(template.headingFontFamily, defaultExportTemplateConfig.headingFontFamily);
  const headings = (["h1", "h2", "h3", "h4", "h5", "h6"] as const).reduce<ExportTemplateConfig["headings"]>((result, level) => {
    result[level] = normalizeExportTextStyle(template.headings?.[level], {
      ...defaultExportTemplateConfig.headings[level],
      fontFamily: headingFontFamily,
    });
    return result;
  }, { ...defaultExportTemplateConfig.headings });

  return {
    schemaVersion: 2,
    name: "basic",
    page: {
      size: template.page?.size === "Letter" ? "Letter" : "A4",
      margins: {
        topMm: clampNumber(template.page?.margins?.topMm, 5, 50, defaultExportTemplateConfig.page.margins.topMm),
        rightMm: clampNumber(template.page?.margins?.rightMm, 5, 50, defaultExportTemplateConfig.page.margins.rightMm),
        bottomMm: clampNumber(template.page?.margins?.bottomMm, 5, 50, defaultExportTemplateConfig.page.margins.bottomMm),
        leftMm: clampNumber(template.page?.margins?.leftMm, 5, 50, defaultExportTemplateConfig.page.margins.leftMm),
      },
    },
    normal: normalizeExportTextStyle(template.normal, defaultExportTemplateConfig.normal),
    headingFontFamily,
    headings,
    code: normalizeExportTextStyle(template.code, defaultExportTemplateConfig.code),
    paragraph: {
      lineSpacing: clampNumber(template.paragraph?.lineSpacing, 1, 2.5, defaultExportTemplateConfig.paragraph.lineSpacing),
      spaceAfterPt: clampNumber(template.paragraph?.spaceAfterPt, 0, 24, defaultExportTemplateConfig.paragraph.spaceAfterPt),
    },
    document: {
      includeTitle: false,
      linkColor: normalizeColor(template.document?.linkColor, defaultExportTemplateConfig.document.linkColor),
      horizontalRuleColor: normalizeColor(template.document?.horizontalRuleColor, defaultExportTemplateConfig.document.horizontalRuleColor),
    },
    updatedAt: template.updatedAt ?? defaultExportTemplateConfig.updatedAt,
  };
}

function normalizeExportTextStyle(style: ExportTemplateConfig["normal"] | undefined, fallback: ExportTemplateConfig["normal"]): ExportTemplateConfig["normal"] {
  return {
    fontFamily: normalizeFontFamily(style?.fontFamily, fallback.fontFamily),
    fontSizePt: clampNumber(style?.fontSizePt, 6, 60, fallback.fontSizePt),
    color: normalizeColor(style?.color, fallback.color),
    textFormat: normalizeTextFormat(style?.textFormat, fallback.textFormat),
  };
}

function normalizeFontFamily(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return exportFontFamilies.has(normalized) ? normalized : fallback;
}

function normalizeColor(value: unknown, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value)) ? String(value) : fallback;
}

function normalizeTextFormat(value: unknown, fallback: ExportTemplateConfig["normal"]["textFormat"]) {
  const normalized = String(value ?? "").trim();
  return exportTextFormats.has(normalized) ? normalized as ExportTemplateConfig["normal"]["textFormat"] : fallback;
}

function normalizeAi(ai: AiConfig | undefined): AiConfig | undefined {
  if (!ai) return undefined;
  return {
    provider: "openai",
    model: normalizeAiModel(ai.model),
    permissions: {
      editDocuments: ai.permissions?.editDocuments !== false,
      createFolders: Boolean(ai.permissions?.createFolders),
      createDocuments: Boolean(ai.permissions?.createDocuments),
      deleteDocumentsAndFolders: Boolean(ai.permissions?.deleteDocumentsAndFolders),
      generateImages: false,
      createImageAssets: false,
      insertImagesIntoDocuments: false,
      useDocumentContextForImageGeneration: false,
    },
    rag: {
      enabled: false,
      vectorStoreId: null,
      lastIndexedAt: null,
      status: "not-indexed",
      error: null,
    },
    vision: {
      enabled: ai.vision?.enabled !== false,
      model: normalizeAiVisionModel(ai.vision?.model),
      imageIndexingEnabled: Boolean(ai.vision?.imageIndexingEnabled),
      maxImagesPerPrompt: clampNumber(ai.vision?.maxImagesPerPrompt, 1, 12, defaultAiConfig.vision.maxImagesPerPrompt),
      maxImageSizeMb: clampNumber(ai.vision?.maxImageSizeMb, 1, 50, defaultAiConfig.vision.maxImageSizeMb),
      detail: ["auto", "low", "high"].includes(String(ai.vision?.detail)) ? ai.vision!.detail : "auto",
      storeVisualDescriptions: ai.vision?.storeVisualDescriptions !== false,
    },
    imageGeneration: normalizeImageGeneration(ai.imageGeneration),
    agentic: {
      depth: normalizeAgenticDepth(ai.agentic?.depth),
      webResearchEnabled: false,
      confirmBeforeApplying: ai.agentic?.confirmBeforeApplying !== false,
      maxSteps: clampNumber(ai.agentic?.maxSteps, 1, 12, defaultAiConfig.agentic.maxSteps),
      maxDocuments: clampNumber(ai.agentic?.maxDocuments, 1, 30, defaultAiConfig.agentic.maxDocuments),
      maxEstimatedCostEur: clampNumber(ai.agentic?.maxEstimatedCostEur, 0.1, 25, defaultAiConfig.agentic.maxEstimatedCostEur),
      maxSources: clampNumber(ai.agentic?.maxSources, 1, 20, defaultAiConfig.agentic.maxSources),
    },
    transcription: normalizeTranscription(ai.transcription),
  };
}

function normalizeImageGeneration(imageGeneration: AiConfig["imageGeneration"] | undefined): AiConfig["imageGeneration"] {
  return {
    enabled: false,
    model: normalizeImageGenerationModel(imageGeneration?.model),
    size: ["auto", "1024x1024", "1536x1024", "1024x1536"].includes(String(imageGeneration?.size)) ? imageGeneration!.size : defaultAiConfig.imageGeneration.size,
    quality: ["auto", "low", "medium", "high"].includes(String(imageGeneration?.quality)) ? imageGeneration!.quality : defaultAiConfig.imageGeneration.quality,
    outputFormat: ["png", "webp", "jpeg"].includes(String(imageGeneration?.outputFormat)) ? imageGeneration!.outputFormat : defaultAiConfig.imageGeneration.outputFormat,
    defaultFolder: normalizeImageGenerationFolder(imageGeneration?.defaultFolder),
    customFolderPath: normalizeProjectRelativeFolderPath(imageGeneration?.customFolderPath, defaultAiConfig.imageGeneration.customFolderPath),
    maxImagesPerPrompt: clampNumber(imageGeneration?.maxImagesPerPrompt, 1, 4, defaultAiConfig.imageGeneration.maxImagesPerPrompt),
    confirmBeforeDocumentInsert: Boolean(imageGeneration?.confirmBeforeDocumentInsert),
    confirmBeforeUsingMultipleSources: imageGeneration?.confirmBeforeUsingMultipleSources !== false,
    storePromptMetadata: imageGeneration?.storePromptMetadata !== false,
  };
}

function normalizeImageGenerationModel(model: unknown): AiImageGenerationModelId {
  if (String(model) === "gpt-image-2") return "gpt-image-1.5";
  return ["gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"].includes(String(model))
    ? model as AiImageGenerationModelId
    : defaultAiConfig.imageGeneration.model;
}

function normalizeImageGenerationFolder(folder: unknown): AiConfig["imageGeneration"]["defaultFolder"] {
  return ["document_folder", "generated_assets", "custom_folder"].includes(String(folder))
    ? folder as AiConfig["imageGeneration"]["defaultFolder"]
    : defaultAiConfig.imageGeneration.defaultFolder;
}

function normalizeProjectRelativeFolderPath(path: unknown, fallback: string): string {
  const rawPath = String(path ?? "").trim().replace(/\\/g, "/");
  const parts = rawPath.split("/").map((part) => part.trim()).filter(Boolean);
  if (
    rawPath.startsWith("/") ||
    rawPath.includes(":") ||
    parts.length === 0 ||
    parts.some((part) => part === "." || part === "..")
  ) {
    return fallback;
  }
  return parts.join("/").slice(0, 160);
}

function normalizeAiModel(model: unknown): AiModelId {
  const normalized = normalizeLegacyAiModel(model);
  return normalized ?? defaultAiConfig.model;
}

function normalizeAiVisionModel(model: unknown) {
  const normalized = normalizeLegacyAiModel(model);
  return normalized && normalized !== "gpt-5.4-nano" ? normalized : defaultAiConfig.vision.model;
}

function normalizeLegacyAiModel(model: unknown): AiModelId | null {
  switch (String(model)) {
    case "gpt-5.5":
    case "gpt-5.2":
      return "gpt-5.5";
    case "gpt-5.4":
    case "gpt-5":
      return "gpt-5.4";
    case "gpt-5.4-mini":
    case "gpt-5-mini":
      return "gpt-5.4-mini";
    case "gpt-5.4-nano":
    case "gpt-5-nano":
      return "gpt-5.4-nano";
    default:
      return null;
  }
}

function normalizeAgenticDepth(depth: unknown) {
  return ["quick", "guided", "deep", "bounded_autonomous"].includes(String(depth))
    ? depth as AiConfig["agentic"]["depth"]
    : defaultAiConfig.agentic.depth;
}

function normalizeTranscription(transcription: AiConfig["transcription"] | undefined): AiConfig["transcription"] {
  const favoriteLanguages = Array.isArray(transcription?.favoriteLanguages)
    ? transcription.favoriteLanguages.filter(isTranscriptionLanguage)
    : defaultAiConfig.transcription.favoriteLanguages;
  const uniqueFavoriteLanguages = Array.from(new Set(favoriteLanguages.length ? favoriteLanguages : defaultAiConfig.transcription.favoriteLanguages));

  return {
    enabled: transcription?.enabled !== false,
    model: ["gpt-4o-mini-transcribe", "gpt-realtime-whisper"].includes(String(transcription?.model)) ? "gpt-4o-mini-transcribe" : defaultAiConfig.transcription.model,
    defaultTarget: transcription?.defaultTarget === "document" ? "document" : "prompt",
    defaultLanguage: isTranscriptionLanguage(transcription?.defaultLanguage) ? transcription.defaultLanguage : defaultAiConfig.transcription.defaultLanguage,
    favoriteLanguages: uniqueFavoriteLanguages.slice(0, 6),
  };
}

function isTranscriptionLanguage(language: unknown): language is AiConfig["transcription"]["defaultLanguage"] {
  return ["auto", "es", "en", "fr", "de", "it", "pt", "ca", "eu", "gl"].includes(String(language));
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}
