from typing import Literal

from pydantic import BaseModel, Field


AppUtilityTabId = Literal["release-notes"]


class LayoutConfig(BaseModel):
    sidebarWidth: int
    historyWidth: int


class AppearanceConfig(BaseModel):
    language: Literal["es", "en"] = "es"
    zoomPercent: int = 100


class DiagnosticsConfig(BaseModel):
    traceLoggingEnabled: bool = False


class OpenTabConfig(BaseModel):
    id: str
    name: str


class ProjectTabsConfig(BaseModel):
    openTabs: list[OpenTabConfig]
    activeDocumentId: str


class AppConfig(BaseModel):
    schemaVersion: int
    layout: LayoutConfig
    appearance: AppearanceConfig
    diagnostics: DiagnosticsConfig
    tabsByProject: dict[str, ProjectTabsConfig]
    lastRunAppVersion: str | None = None
    lastSeenReleaseNotesVersion: str | None = None
    openUtilityTabs: list[AppUtilityTabId] = Field(default_factory=list)
    activeUtilityTab: AppUtilityTabId | None = None
    updatedAt: str


class AppConfigUpdate(BaseModel):
    layout: LayoutConfig | None = None
    appearance: AppearanceConfig | None = None
    diagnostics: DiagnosticsConfig | None = None
    tabsByProject: dict[str, ProjectTabsConfig] | None = None
    lastRunAppVersion: str | None = None
    lastSeenReleaseNotesVersion: str | None = None
    openUtilityTabs: list[str] | None = None
    activeUtilityTab: str | None = None
