import type { AiConfig, AiConfigStatus, AiModelId, AppConfig, AppConfigUpdate, AppearanceConfig, DiagnosticsConfig, LayoutConfig, ProjectTabsConfig } from "../../types/domain";
import { requestJson } from "./client";

export const defaultLayoutConfig: LayoutConfig = {
  sidebarWidth: 338,
  historyWidth: 320,
};

export const defaultAppearanceConfig: AppearanceConfig = {
  language: "es",
  zoomPercent: 100,
};

export const defaultDiagnosticsConfig: DiagnosticsConfig = {
  traceLoggingEnabled: false,
};

export const defaultAiConfig: AiConfig = {
  provider: "openai",
  model: "gpt-5.4-mini",
  permissions: {
    createFolders: false,
    createDocuments: false,
    deleteDocumentsAndFolders: false,
  },
  rag: {
    enabled: false,
    vectorStoreId: null,
    lastIndexedAt: null,
    status: "not-indexed",
    error: null,
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
  return requestJson<AppConfig>("/api/config");
}

export async function updateAppConfig(payload: AppConfigUpdate): Promise<AppConfig> {
  return requestJson<AppConfig>("/api/config", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
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
  };
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
      createFolders: Boolean(ai.permissions?.createFolders),
      createDocuments: Boolean(ai.permissions?.createDocuments),
      deleteDocumentsAndFolders: Boolean(ai.permissions?.deleteDocumentsAndFolders),
    },
    rag: {
      enabled: Boolean(ai.rag?.enabled),
      vectorStoreId: ai.rag?.vectorStoreId ?? null,
      lastIndexedAt: ai.rag?.lastIndexedAt ?? null,
      status: ["not-indexed", "indexing", "updated", "error"].includes(ai.rag?.status ?? "") ? ai.rag.status : "not-indexed",
      error: ai.rag?.error ?? null,
    },
  };
}

function normalizeAiModel(model: unknown): AiModelId {
  return ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"].includes(String(model))
    ? model as AiModelId
    : defaultAiConfig.model;
}
