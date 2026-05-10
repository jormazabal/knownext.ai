import type { AppConfig, AppUtilityTabId } from "../types/domain";

export const RELEASE_NOTES_UTILITY_TAB_ID: AppUtilityTabId = "release-notes";
export const RELEASE_NOTES_WORKSPACE_TAB_ID = "app-release-notes" as const;

export function ensureReleaseNotesTab(openUtilityTabs: AppUtilityTabId[]) {
  return openUtilityTabs.includes(RELEASE_NOTES_UTILITY_TAB_ID)
    ? openUtilityTabs
    : [...openUtilityTabs, RELEASE_NOTES_UTILITY_TAB_ID];
}

export function removeReleaseNotesTab(openUtilityTabs: AppUtilityTabId[]) {
  return openUtilityTabs.filter((tabId) => tabId !== RELEASE_NOTES_UTILITY_TAB_ID);
}

export function shouldOpenReleaseNotesAfterStartup(config: Pick<AppConfig, "lastRunAppVersion" | "lastSeenReleaseNotesVersion">, appVersion: string) {
  return Boolean(
    config.lastRunAppVersion &&
    config.lastRunAppVersion !== appVersion &&
    config.lastSeenReleaseNotesVersion !== appVersion,
  );
}
