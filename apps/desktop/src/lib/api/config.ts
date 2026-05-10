import type { AppConfig, AppConfigUpdate, LayoutConfig, ProjectTabsConfig } from "../../types/domain";
import { isBackendEnabled, requestJson } from "./client";

export const defaultLayoutConfig: LayoutConfig = {
  sidebarWidth: 338,
  historyWidth: 320,
};

export const defaultProjectTabsConfig: ProjectTabsConfig = {
  openTabs: [
    { id: "meeting-minutes", name: "acta-reunion.md" },
    { id: "requirements-functional", name: "requisitos-funcionales.md" },
    { id: "decision-tech", name: "decision-tecnologica.md" },
  ],
  activeDocumentId: "meeting-minutes",
};

export const defaultAppConfig: AppConfig = {
  schemaVersion: 1,
  layout: defaultLayoutConfig,
  tabsByProject: {
    "project-alpha": defaultProjectTabsConfig,
  },
  lastRunAppVersion: null,
  lastSeenReleaseNotesVersion: null,
  openUtilityTabs: [],
  activeUtilityTab: null,
  updatedAt: new Date(0).toISOString(),
};

export async function getAppConfig(): Promise<AppConfig> {
  if (!isBackendEnabled()) return defaultAppConfig;
  return requestJson<AppConfig>("/api/config");
}

export async function updateAppConfig(payload: AppConfigUpdate): Promise<AppConfig> {
  if (!isBackendEnabled()) {
    return {
      ...defaultAppConfig,
      ...payload,
      layout: payload.layout ?? defaultLayoutConfig,
      tabsByProject: payload.tabsByProject ?? defaultAppConfig.tabsByProject,
      lastRunAppVersion: payload.lastRunAppVersion ?? defaultAppConfig.lastRunAppVersion,
      lastSeenReleaseNotesVersion: payload.lastSeenReleaseNotesVersion ?? defaultAppConfig.lastSeenReleaseNotesVersion,
      openUtilityTabs: payload.openUtilityTabs ?? defaultAppConfig.openUtilityTabs,
      activeUtilityTab: payload.activeUtilityTab ?? defaultAppConfig.activeUtilityTab,
    };
  }

  return requestJson<AppConfig>("/api/config", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
