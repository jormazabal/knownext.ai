import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiConfigStatus, AiConversationEvent, AiPendingIntent, Project } from "../../types/domain";
import { AiConversationView } from "./AiConversationView";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => cleanup());

describe("AiConversationView", () => {
  it("renders the professional conversation shell and message roles", () => {
    render(
      <AiConversationView
        project={project}
        config={config}
        indexStatus={null}
        pendingIntent={null}
        onIntentAction={vi.fn()}
        events={[
          conversationEvent({ id: "user-1", role: "user", type: "user_message", content: "Redacta una descripcion" }),
          conversationEvent({ id: "assistant-1", role: "assistant", type: "assistant_message", content: "Puedo prepararla como documento nuevo." }),
        ]}
      />,
    );

    expect(screen.getByText("IA documental")).toBeInTheDocument();
    expect(screen.getByText("Proyecto Prueba")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("RAG inactivo")).toBeInTheDocument();
    expect(screen.getByText("Redacta una descripcion")).toBeInTheDocument();
    expect(screen.getByText("Puedo prepararla como documento nuevo.")).toBeInTheDocument();
    expect(screen.queryByText("Tú")).not.toBeInTheDocument();
    expect(screen.queryByText("IA")).not.toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("renders a compact empty state", () => {
    render(<AiConversationView project={project} config={config} indexStatus={null} pendingIntent={null} onIntentAction={vi.fn()} events={[]} />);

    expect(screen.getByText("Sin conversación todavía")).toBeInTheDocument();
    expect(screen.getByText(/Escribe desde el prompt inferior/)).toBeInTheDocument();
  });

  it("integrates pending intent actions into the latest assistant message", () => {
    render(
      <AiConversationView
        project={project}
        config={config}
        indexStatus={null}
        pendingIntent={pendingIntent}
        onIntentAction={vi.fn()}
        events={[
          conversationEvent({ id: "assistant-1", role: "assistant", type: "assistant_message", content: "Puedo hacerlo, confirma el cambio." }),
        ]}
      />,
    );

    expect(screen.getByText("Puedo hacerlo, confirma el cambio.")).toBeInTheDocument();
    expect(screen.getByText("Acción pendiente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeInTheDocument();
    expect(screen.queryByText("Redactar descripción en el documento activo.")).not.toBeInTheDocument();
  });

  it("does not repeat the document path when the event title already includes it", () => {
    render(
      <AiConversationView
        project={project}
        config={config}
        indexStatus={null}
        pendingIntent={null}
        onIntentAction={vi.fn()}
        events={[
          conversationEvent({
            id: "system-1",
            role: "system",
            type: "document_modified",
            content: "Documento modificado: Nueva carpeta/Patata/pp.md",
            path: "Nueva carpeta/Patata/pp.md",
            summary: "Se actualizó el documento activo.",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Documento modificado: Nueva carpeta/Patata/pp.md")).toBeInTheDocument();
    expect(screen.getByText("Se actualizó el documento activo.")).toBeInTheDocument();
    expect(screen.queryByText("Nueva carpeta/Patata/pp.md", { exact: true })).not.toBeInTheDocument();
  });
});

function conversationEvent(overrides: Partial<AiConversationEvent>): AiConversationEvent {
  return {
    id: "event-1",
    projectId: project.id,
    type: "assistant_message",
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    documentId: null,
    path: null,
    paths: [],
    summary: null,
    task: null,
    ...overrides,
  };
}

const project: Project = {
  id: "project-1",
  name: "Prueba",
  folderPath: "C:/tmp/prueba",
  icon: "layers",
  iconColor: "#F37021",
  storageMode: "local-files",
  versioningMode: "none",
  syncMode: "none",
  authRequired: false,
  githubRepository: null,
  isGitRepository: false,
};

const config: AiConfigStatus = {
  provider: "openai",
  model: "gpt-5.4-mini",
  permissions: {
    editDocuments: true,
    createFolders: true,
    createDocuments: true,
    deleteDocumentsAndFolders: false,
    generateImages: true,
    createImageAssets: true,
    insertImagesIntoDocuments: true,
    useDocumentContextForImageGeneration: true,
  },
  rag: {
    enabled: false,
    vectorStoreId: null,
    lastIndexedAt: null,
    status: "not-indexed",
    error: null,
  },
  vision: {
    enabled: true,
    model: "gpt-5.4-mini",
    imageIndexingEnabled: false,
    maxImagesPerPrompt: 4,
    maxImageSizeMb: 12,
    detail: "auto",
    storeVisualDescriptions: true,
  },
  imageGeneration: {
    enabled: true,
    model: "gpt-image-2",
    size: "auto",
    quality: "auto",
    outputFormat: "png",
    defaultFolder: "document_folder",
    customFolderPath: "assets/generated",
    maxImagesPerPrompt: 1,
    confirmBeforeDocumentInsert: false,
    confirmBeforeUsingMultipleSources: true,
    storePromptMetadata: true,
  },
  agentic: {
    depth: "guided",
    webResearchEnabled: false,
    confirmBeforeApplying: true,
    maxSteps: 4,
    maxDocuments: 5,
    maxEstimatedCostEur: 1,
    maxSources: 4,
  },
  transcription: {
    enabled: true,
    model: "gpt-realtime-whisper",
    defaultTarget: "prompt",
    defaultLanguage: "auto",
    favoriteLanguages: ["es", "en"],
  },
  openaiKeyConfigured: true,
  openaiKeyPreview: "sk-...",
};

const pendingIntent: AiPendingIntent = {
  id: "intent-1",
  projectId: project.id,
  originDocumentId: "doc-1",
  targetDocumentId: "doc-1",
  targetPath: "pp.md",
  goal: "Redactar descripción en el documento activo.",
  proposedAction: "edit_document",
  requiresWebResearch: false,
  webResearchAllowed: false,
  status: "awaiting_decision",
  createdAt: "2026-05-13T10:00:00+00:00",
  updatedAt: "2026-05-13T10:00:00+00:00",
  expiresAt: "2026-05-14T10:00:00+00:00",
};
