from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.ai import AiConfig


AppUtilityTabId = Literal["release-notes"]
AppearanceThemeMode = Literal["system", "light", "dark"]
AppearanceAccentColor = Literal[
    "orange",
    "amber",
    "yellow",
    "lime",
    "olive",
    "green",
    "cyan",
    "blue",
    "indigo",
    "wine",
    "rose",
    "red",
]


class LayoutConfig(BaseModel):
    sidebarWidth: int
    historyWidth: int


class AppearanceConfig(BaseModel):
    language: Literal["es", "en"] = "es"
    zoomPercent: int = 100
    markdownExtendedUnderlineEnabled: bool = True
    themeMode: AppearanceThemeMode = "system"
    primaryColor: AppearanceAccentColor = "orange"


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
    ai: AiConfig = Field(default_factory=AiConfig)
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
    ai: AiConfig | None = None
    tabsByProject: dict[str, ProjectTabsConfig] | None = None
    lastRunAppVersion: str | None = None
    lastSeenReleaseNotesVersion: str | None = None
    openUtilityTabs: list[str] | None = None
    activeUtilityTab: str | None = None
