from typing import Literal

from pydantic import BaseModel, Field


AiInteractionMode = Literal["document", "project"]
AiInteractionStatus = Literal["completed", "blocked", "error"]
AiInteractionDisplay = Literal["bubble", "conversation", "none"]
AiUiPlacement = Literal["document_bubble", "conversation_tab", "none"]
AiInteractionType = Literal["chat", "document_edit", "project_operation", "agentic_task", "clarification", "mixed"]
AiConfidence = Literal["high", "medium", "low"]
AiExecutionMode = Literal["quick", "reasoning"]
AiReasoningDepth = Literal["light", "medium", "deep"]
AiExecutionScope = Literal["direct_action", "needs_permission", "needs_clarification", "agentic_task", "too_expensive_or_unclear"]
AiModelId = Literal["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"]
AiVisionModelId = Literal["gpt-5.4-mini", "gpt-5.4", "gpt-5.5"]
AiAgenticDepth = Literal["quick", "guided", "deep", "bounded_autonomous"]
AiTranscriptionTarget = Literal["prompt", "document"]
AiTranscriptionLanguage = Literal["auto", "es", "en", "fr", "de", "it", "pt", "ca", "eu", "gl"]
AiTranscriptionModelId = Literal["gpt-realtime-whisper"]
AiPendingIntentStatus = Literal["awaiting_decision", "awaiting_web_permission", "ready", "running", "completed", "cancelled"]
AiPendingIntentAction = Literal["replace_document", "edit_document", "create_document", "project_operation", "research_then_write"]
AiIntentDecision = Literal["create_intent", "confirm_intent", "update_intent", "cancel_intent", "needs_clarification", "execute_now"]
AiIntentActionType = Literal["allow_web_research", "apply", "cancel"]
AiOperationType = Literal[
    "document_modified",
    "folder_created",
    "document_created",
    "document_duplicated",
    "node_moved",
    "delete_requested",
    "node_deleted",
    "permission_blocked",
    "provider_unavailable",
    "provider_error",
    "task_planned",
    "task_checkpoint",
    "source_found",
]
AiConversationEventType = Literal[
    "user_message",
    "assistant_message",
    "document_modified",
    "folder_created",
    "document_created",
    "document_duplicated",
    "node_moved",
    "delete_requested",
    "node_deleted",
    "permission_blocked",
    "provider_unavailable",
    "provider_error",
    "task_planned",
    "task_checkpoint",
    "source_found",
]
AiIndexStatus = Literal["not-indexed", "indexing", "updated", "error"]
AiUsageStatus = Literal["completed", "failed", "cancelled"]
AiUsageSource = Literal["provider", "estimated", "unknown", "mixed"]
AiContextSourceKind = Literal["project_document", "external_file", "image"]
AiContextSourceStatus = Literal["processing", "ready", "warning", "error", "expiring", "expired"]
AiContextWeight = Literal["light", "medium", "high", "too_large"]


class AiPermissions(BaseModel):
    editDocuments: bool = True
    createFolders: bool = False
    createDocuments: bool = False
    deleteDocumentsAndFolders: bool = False


class AiRagConfig(BaseModel):
    enabled: bool = False
    vectorStoreId: str | None = None
    lastIndexedAt: str | None = None
    status: AiIndexStatus = "not-indexed"
    error: str | None = None


class AiVisionConfig(BaseModel):
    enabled: bool = True
    model: AiVisionModelId = "gpt-5.4-mini"
    imageIndexingEnabled: bool = False
    maxImagesPerPrompt: int = 4
    maxImageSizeMb: int = 12
    detail: Literal["auto", "low", "high"] = "auto"
    storeVisualDescriptions: bool = True


class AiAgenticConfig(BaseModel):
    depth: AiAgenticDepth = "guided"
    webResearchEnabled: bool = False
    confirmBeforeApplying: bool = True
    maxSteps: int = 4
    maxDocuments: int = 6
    maxEstimatedCostEur: float = 1.0
    maxSources: int = 6


class AiTranscriptionConfig(BaseModel):
    enabled: bool = True
    model: AiTranscriptionModelId = "gpt-realtime-whisper"
    defaultTarget: AiTranscriptionTarget = "prompt"
    defaultLanguage: AiTranscriptionLanguage = "auto"
    favoriteLanguages: list[AiTranscriptionLanguage] = Field(default_factory=lambda: ["es", "en"])


class AiConfig(BaseModel):
    provider: Literal["openai"] = "openai"
    model: AiModelId = "gpt-5.4-mini"
    permissions: AiPermissions = Field(default_factory=AiPermissions)
    rag: AiRagConfig = Field(default_factory=AiRagConfig)
    vision: AiVisionConfig = Field(default_factory=AiVisionConfig)
    agentic: AiAgenticConfig = Field(default_factory=AiAgenticConfig)
    transcription: AiTranscriptionConfig = Field(default_factory=AiTranscriptionConfig)


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


class AiSelectionFocus(BaseModel):
    documentId: str | None = None
    path: str | None = None
    from_: int | None = Field(default=None, alias="from")
    to: int | None = None
    text: str


class AiClientContext(BaseModel):
    lastDocumentId: str | None = None
    lastDocumentPath: str | None = None


class AiIntentActionRequest(BaseModel):
    type: AiIntentActionType
    intentId: str


class AiContextSourceRef(BaseModel):
    id: str
    kind: AiContextSourceKind
    name: str
    path: str | None = None
    status: Literal["used", "expired", "failed"] = "used"


class AiContextSource(BaseModel):
    id: str
    projectId: str
    kind: AiContextSourceKind
    name: str
    path: str | None = None
    mimeType: str | None = None
    sizeBytes: int = 0
    status: AiContextSourceStatus = "processing"
    weight: AiContextWeight = "light"
    warning: str | None = None
    error: str | None = None
    createdAt: str
    updatedAt: str
    lastUsedAt: str | None = None
    expiresAt: str | None = None


class AiContextSearchResult(BaseModel):
    documentId: str
    name: str
    path: str
    kind: AiContextSourceKind = "project_document"
    mimeType: str | None = None


class AiCreateProjectDocumentContextRequest(BaseModel):
    documentId: str


class AiContextSourceListResponse(BaseModel):
    sources: list[AiContextSource]
    expiredSourceIds: list[str] = Field(default_factory=list)


class AiContextSourcePreviewResponse(BaseModel):
    source: AiContextSource
    previewText: str | None = None
    metadata: dict = Field(default_factory=dict)


class AiContextAddToProjectRequest(BaseModel):
    name: str | None = None
    parentId: str | None = None


class AiContextAddToProjectResponse(BaseModel):
    documentId: str
    path: str
    tree: list[dict] | None = None


class AiInteractionRequest(BaseModel):
    projectId: str
    documentId: str | None = None
    prompt: str
    activeMarkdown: str = ""
    selectionFocus: AiSelectionFocus | None = None
    clientContext: AiClientContext | None = None
    intentAction: AiIntentActionRequest | None = None
    executionMode: AiExecutionMode = "quick"
    reasoningDepth: AiReasoningDepth = "light"
    mode: AiInteractionMode
    clientMessageId: str
    contextSourceIds: list[str] = Field(default_factory=list)


class AiPendingIntent(BaseModel):
    id: str
    projectId: str
    originDocumentId: str | None = None
    targetDocumentId: str | None = None
    targetPath: str | None = None
    goal: str
    proposedAction: AiPendingIntentAction
    requiresWebResearch: bool = False
    webResearchAllowed: bool = False
    status: AiPendingIntentStatus = "awaiting_decision"
    createdAt: str
    updatedAt: str
    expiresAt: str


class AiUpdatedDocument(BaseModel):
    documentId: str
    markdown: str
    summary: str


class AiPendingDelete(BaseModel):
    confirmationId: str
    nodeIds: list[str]
    paths: list[str]
    documentCount: int = 0


class AiAgenticTaskStep(BaseModel):
    id: str
    title: str
    status: Literal["pending", "running", "completed", "blocked"] = "pending"
    detail: str | None = None


class AiAgenticTaskSource(BaseModel):
    title: str
    url: str | None = None
    path: str | None = None
    status: Literal["planned", "used", "blocked"] = "planned"


class AiAgenticTask(BaseModel):
    title: str
    status: Literal["proposed", "waiting_confirmation", "running", "completed", "blocked"] = "proposed"
    depth: AiAgenticDepth = "guided"
    requiresWebResearch: bool = False
    webResearchAllowed: bool = False
    needsUserConfirmation: bool = True
    maxSteps: int = 4
    maxDocuments: int = 6
    maxEstimatedCostEur: float = 1.0
    steps: list[AiAgenticTaskStep] = Field(default_factory=list)
    sources: list[AiAgenticTaskSource] = Field(default_factory=list)


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
    task: AiAgenticTask | None = None
    sourcesUsed: list[AiContextSourceRef] = Field(default_factory=list)


class AiConversationResponse(BaseModel):
    events: list[AiConversationEvent]


class AiInteractionResponse(BaseModel):
    interactionId: str
    status: AiInteractionStatus
    display: AiInteractionDisplay
    uiPlacement: AiUiPlacement = "document_bubble"
    interactionType: AiInteractionType = "chat"
    confidence: AiConfidence = "medium"
    executionMode: AiExecutionMode = "quick"
    reasoningDepth: AiReasoningDepth = "light"
    executionScope: AiExecutionScope | None = None
    routeToAiTab: bool = False
    needsUserClarification: bool = False
    pendingIntent: AiPendingIntent | None = None
    pendingIntentStatus: AiPendingIntentStatus | None = None
    answer: str | None = None
    conversationEvents: list[AiConversationEvent] = Field(default_factory=list)
    operations: list[AiOperation] = Field(default_factory=list)
    updatedDocument: AiUpdatedDocument | None = None
    task: AiAgenticTask | None = None
    tree: list[dict] | None = None
    affectedDocuments: list[dict] = Field(default_factory=list)
    requiresConfirmation: AiPendingDelete | None = None
    contextSources: list[AiContextSource] = Field(default_factory=list)
    expiredContextSourceIds: list[str] = Field(default_factory=list)


class AiConfirmDeleteRequest(BaseModel):
    confirmationId: str


class AiIndexStatusResponse(BaseModel):
    projectId: str
    enabled: bool
    status: AiIndexStatus
    vectorStoreId: str | None = None
    lastIndexedAt: str | None = None
    error: str | None = None
    documentCount: int = 0
    indexedDocumentCount: int = 0
    pendingDocumentCount: int = 0
    failedDocumentCount: int = 0
    deletedDocumentCount: int = 0
    localExactReady: bool = False


class AiUsageModelSummary(BaseModel):
    model: str
    interactions: int = 0
    inputTokens: int = 0
    cachedInputTokens: int = 0
    outputTokens: int = 0
    reasoningTokens: int = 0
    embeddingTokens: int = 0
    totalTokens: int = 0
    estimatedCost: float = 0
    currency: Literal["EUR"] = "EUR"
    usageSource: AiUsageSource = "unknown"


class AiUsageSummaryResponse(BaseModel):
    month: str
    currency: Literal["EUR"] = "EUR"
    estimated: bool = True
    totalEstimatedCost: float = 0
    generatedAt: str
    models: list[AiUsageModelSummary] = Field(default_factory=list)
