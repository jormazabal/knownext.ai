import type { AiConfig, AiConfigStatus, AiImageGenerationModelId, AiModelId, AppConfig, AppConfigUpdate, AppearanceAccentColor, AppearanceConfig, AppearanceThemeMode, DiagnosticsConfig, LayoutConfig, ProjectTabsConfig } from "../../types/domain";
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

export const defaultAiConfig: AiConfig = {
  provider: "openai",
  model: "gpt-5.4-mini",
  permissions: {
    editDocuments: true,
    createFolders: false,
    createDocuments: false,
    deleteDocumentsAndFolders: false,
    generateImages: true,
    createImageAssets: true,
    insertImagesIntoDocuments: true,
    useDocumentContextForImageGeneration: true,
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
    enabled: true,
    model: "gpt-image-2",
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
    model: "gpt-realtime-whisper",
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
  schemaVersion: 1,
  layout: defaultLayoutConfig,
  appearance: defaultAppearanceConfig,
  diagnostics: defaultDiagnosticsConfig,
  ai: defaultAiConfig,
  tabsByProject: {},
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
  return {
    ...normalizedConfig,
    layout: config.layout ?? defaultLayoutConfig,
    appearance: normalizeAppearance(config.appearance) ?? defaultAppearanceConfig,
    diagnostics: normalizeDiagnostics(config.diagnostics) ?? defaultDiagnosticsConfig,
    ai: normalizeAi(config.ai) ?? defaultAiConfig,
    tabsByProject: config.tabsByProject ?? {},
    openUtilityTabs: config.openUtilityTabs ?? [],
    activeUtilityTab: config.activeUtilityTab ?? null,
    lastRunAppVersion: config.lastRunAppVersion ?? null,
    lastSeenReleaseNotesVersion: config.lastSeenReleaseNotesVersion ?? null,
  };
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
      generateImages: ai.permissions?.generateImages !== false,
      createImageAssets: ai.permissions?.createImageAssets !== false,
      insertImagesIntoDocuments: ai.permissions?.insertImagesIntoDocuments !== false,
      useDocumentContextForImageGeneration: ai.permissions?.useDocumentContextForImageGeneration !== false,
    },
    rag: {
      enabled: Boolean(ai.rag?.enabled),
      vectorStoreId: ai.rag?.vectorStoreId ?? null,
      lastIndexedAt: ai.rag?.lastIndexedAt ?? null,
      status: ["not-indexed", "indexing", "updated", "error"].includes(ai.rag?.status ?? "") ? ai.rag.status : "not-indexed",
      error: ai.rag?.error ?? null,
    },
    vision: {
      enabled: ai.vision?.enabled !== false,
      model: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"].includes(String(ai.vision?.model)) ? ai.vision!.model : defaultAiConfig.vision.model,
      imageIndexingEnabled: Boolean(ai.vision?.imageIndexingEnabled),
      maxImagesPerPrompt: clampNumber(ai.vision?.maxImagesPerPrompt, 1, 12, defaultAiConfig.vision.maxImagesPerPrompt),
      maxImageSizeMb: clampNumber(ai.vision?.maxImageSizeMb, 1, 50, defaultAiConfig.vision.maxImageSizeMb),
      detail: ["auto", "low", "high"].includes(String(ai.vision?.detail)) ? ai.vision!.detail : "auto",
      storeVisualDescriptions: ai.vision?.storeVisualDescriptions !== false,
    },
    imageGeneration: normalizeImageGeneration(ai.imageGeneration),
    agentic: {
      depth: normalizeAgenticDepth(ai.agentic?.depth),
      webResearchEnabled: Boolean(ai.agentic?.webResearchEnabled),
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
    enabled: imageGeneration?.enabled !== false,
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
  return ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"].includes(String(model))
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
  return ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"].includes(String(model))
    ? model as AiModelId
    : defaultAiConfig.model;
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
    model: transcription?.model === "gpt-realtime-whisper" ? transcription.model : defaultAiConfig.transcription.model,
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
