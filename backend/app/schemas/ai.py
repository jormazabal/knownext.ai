from typing import Literal

from pydantic import BaseModel, Field


AiInteractionMode = Literal["document", "project"]
AiInteractionStatus = Literal["completed", "blocked", "error"]
AiInteractionDisplay = Literal["bubble", "conversation", "none"]
AiOperationType = Literal[
    "document_modified",
    "folder_created",
    "document_created",
    "delete_requested",
    "node_deleted",
    "permission_blocked",
    "provider_unavailable",
    "provider_error",
]
AiConversationEventType = Literal[
    "user_message",
    "assistant_message",
    "document_modified",
    "folder_created",
    "document_created",
    "delete_requested",
    "node_deleted",
    "permission_blocked",
    "provider_unavailable",
    "provider_error",
]
AiIndexStatus = Literal["not-indexed", "indexing", "updated", "error"]


class AiPermissions(BaseModel):
    createFolders: bool = False
    createDocuments: bool = False
    deleteDocumentsAndFolders: bool = False


class AiRagConfig(BaseModel):
    enabled: bool = False
    vectorStoreId: str | None = None
    lastIndexedAt: str | None = None
    status: AiIndexStatus = "not-indexed"
    error: str | None = None


class AiConfig(BaseModel):
    provider: Literal["openai"] = "openai"
    permissions: AiPermissions = Field(default_factory=AiPermissions)
    rag: AiRagConfig = Field(default_factory=AiRagConfig)


class AiConfigStatus(AiConfig):
    openaiKeyConfigured: bool = False
    openaiKeyPreview: str | None = None


class OpenAiKeyUpdate(BaseModel):
    apiKey: str


class OpenAiKeyStatus(BaseModel):
    configured: bool
    preview: str | None = None


class AiPromptRequest(BaseModel):
    prompt: str
    markdown: str = ""


class AiPromptResponse(BaseModel):
    answer: str
    suggestedActions: list[str]


class AiInteractionRequest(BaseModel):
    projectId: str
    documentId: str | None = None
    prompt: str
    activeMarkdown: str = ""
    mode: AiInteractionMode
    clientMessageId: str


class AiUpdatedDocument(BaseModel):
    documentId: str
    markdown: str
    summary: str


class AiPendingDelete(BaseModel):
    confirmationId: str
    nodeIds: list[str]
    paths: list[str]
    documentCount: int = 0


class AiOperation(BaseModel):
    type: AiOperationType
    status: Literal["completed", "blocked", "pending", "error"] = "completed"
    message: str
    documentId: str | None = None
    nodeId: str | None = None
    path: str | None = None
    paths: list[str] = Field(default_factory=list)
    summary: str | None = None
    confirmationId: str | None = None


class AiConversationEvent(BaseModel):
    id: str
    projectId: str
    type: AiConversationEventType
    role: Literal["user", "assistant", "system"] = "system"
    content: str
    createdAt: str
    documentId: str | None = None
    path: str | None = None
    paths: list[str] = Field(default_factory=list)
    summary: str | None = None


class AiConversationResponse(BaseModel):
    events: list[AiConversationEvent]


class AiInteractionResponse(BaseModel):
    interactionId: str
    status: AiInteractionStatus
    display: AiInteractionDisplay
    answer: str | None = None
    conversationEvents: list[AiConversationEvent] = Field(default_factory=list)
    operations: list[AiOperation] = Field(default_factory=list)
    updatedDocument: AiUpdatedDocument | None = None
    tree: list[dict] | None = None
    requiresConfirmation: AiPendingDelete | None = None


class AiConfirmDeleteRequest(BaseModel):
    confirmationId: str


class AiIndexStatusResponse(BaseModel):
    projectId: str
    enabled: bool
    status: AiIndexStatus
    vectorStoreId: str | None = None
    lastIndexedAt: str | None = None
    error: str | None = None
