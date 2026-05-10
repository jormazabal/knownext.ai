import type { AppConfig, AppConfigUpdate, AppearanceConfig, DiagnosticsConfig, LayoutConfig, ProjectTabsConfig } from "../../types/domain";
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

export const defaultProjectTabsConfig: ProjectTabsConfig = {
  openTabs: [],
  activeDocumentId: "",
};

export const defaultAppConfig: AppConfig = {
  schemaVersion: 1,
  layout: defaultLayoutConfig,
  appearance: defaultAppearanceConfig,
  diagnostics: defaultDiagnosticsConfig,
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
