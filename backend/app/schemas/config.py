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
ExportTextFormat = Literal["normal", "bold", "underline", "bold_underline"]


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


class ExportTextStyle(BaseModel):
    fontFamily: str
    fontSizePt: float
    color: str
    textFormat: ExportTextFormat = "normal"


class ExportPageMargins(BaseModel):
    topMm: float
    rightMm: float
    bottomMm: float
    leftMm: float


class ExportPageConfig(BaseModel):
    size: Literal["A4", "Letter"] = "A4"
    margins: ExportPageMargins


class ExportParagraphConfig(BaseModel):
    lineSpacing: float
    spaceAfterPt: float


class ExportDocumentOptions(BaseModel):
    includeTitle: bool
    linkColor: str
    horizontalRuleColor: str


class ExportTemplateConfig(BaseModel):
    schemaVersion: int
    name: str
    page: ExportPageConfig
    normal: ExportTextStyle
    headingFontFamily: str
    headings: dict[str, ExportTextStyle]
    code: ExportTextStyle
    paragraph: ExportParagraphConfig
    document: ExportDocumentOptions
    updatedAt: str


class ExportTemplateUpdate(BaseModel):
    page: ExportPageConfig | None = None
    normal: ExportTextStyle | None = None
    headingFontFamily: str | None = None
    headings: dict[str, ExportTextStyle] | None = None
    code: ExportTextStyle | None = None
    paragraph: ExportParagraphConfig | None = None
    document: ExportDocumentOptions | None = None


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
    treeOpenPathsByProject: dict[str, list[str]] = Field(default_factory=dict)
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
    treeOpenPathsByProject: dict[str, list[str]] | None = None
    lastRunAppVersion: str | None = None
    lastSeenReleaseNotesVersion: str | None = None
    openUtilityTabs: list[str] | None = None
    activeUtilityTab: str | None = None
