from pydantic import BaseModel


class LayoutConfig(BaseModel):
    sidebarWidth: int
    historyWidth: int


class OpenTabConfig(BaseModel):
    id: str
    name: str


class ProjectTabsConfig(BaseModel):
    openTabs: list[OpenTabConfig]
    activeDocumentId: str


class AppConfig(BaseModel):
    schemaVersion: int
    layout: LayoutConfig
    tabsByProject: dict[str, ProjectTabsConfig]
    updatedAt: str


class AppConfigUpdate(BaseModel):
    layout: LayoutConfig | None = None
    tabsByProject: dict[str, ProjectTabsConfig] | None = None
