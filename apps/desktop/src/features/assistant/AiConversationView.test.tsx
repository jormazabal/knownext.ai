import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAiConfig } from "../../lib/api/config";
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
    expect(screen.getAllByRole("button", { name: "Copiar mensaje" })).toHaveLength(2);
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

  it("links document-aware bubbles to the referenced document", async () => {
    const openDocument = vi.fn();

    render(
      <AiConversationView
        project={project}
        config={config}
        indexStatus={null}
        pendingIntent={null}
        onIntentAction={vi.fn()}
        onOpenDocument={openDocument}
        events={[
          conversationEvent({
            id: "assistant-1",
            role: "assistant",
            type: "assistant_message",
            content: "He actualizado el documento.",
            documentId: "project-1::Proyectos/COE/Sesiones coord. AI CoE.md",
            path: "Proyectos/COE/Sesiones coord. AI CoE.md",
          }),
        ]}
      />,
    );

    const link = screen.getByRole("button", { name: "Abrir documento Proyectos / COE / Sesiones coord. AI CoE.md" });

    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent("Proyectos / COE / Sesiones coord. AI CoE.md");

    await userEvent.click(link);

    expect(openDocument).toHaveBeenCalledWith("project-1::Proyectos/COE/Sesiones coord. AI CoE.md", "Sesiones coord. AI CoE.md");
  });

  it("copies a bubble message from the compact footer action", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <AiConversationView
        project={project}
        config={config}
        indexStatus={null}
        pendingIntent={null}
        onIntentAction={vi.fn()}
        events={[
          conversationEvent({ id: "assistant-1", role: "assistant", type: "assistant_message", content: "Mensaje para copiar" }),
        ]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Copiar mensaje" }));

    expect(writeText).toHaveBeenCalledWith("Mensaje para copiar");
    expect(screen.getByRole("button", { name: "Mensaje copiado" })).toBeInTheDocument();
  });

  it("shows only the latest 40 bubbles first and loads 20 older bubbles on demand", async () => {
    const events = Array.from({ length: 45 }, (_, index) =>
      conversationEvent({
        id: `event-${index}`,
        role: index % 2 === 0 ? "user" : "assistant",
        type: index % 2 === 0 ? "user_message" : "assistant_message",
        content: `Mensaje ${index}`,
        createdAt: `2026-06-10T10:${String(index).padStart(2, "0")}:00Z`,
      }),
    );

    render(
      <AiConversationView
        project={project}
        config={config}
        indexStatus={null}
        pendingIntent={null}
        onIntentAction={vi.fn()}
        events={events}
      />,
    );

    expect(screen.queryByText("Mensaje 0")).not.toBeInTheDocument();
    expect(screen.getByText("Mensaje 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar más" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Mostrar más" }));

    expect(screen.getByText("Mensaje 0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mostrar más" })).not.toBeInTheDocument();
  });

  it("keeps the current reading position when older bubbles are loaded above", async () => {
    const events = Array.from({ length: 45 }, (_, index) =>
      conversationEvent({
        id: `event-${index}`,
        role: index % 2 === 0 ? "user" : "assistant",
        type: index % 2 === 0 ? "user_message" : "assistant_message",
        content: `Mensaje ${index}`,
        createdAt: `2026-06-10T10:${String(index).padStart(2, "0")}:00Z`,
      }),
    );

    render(
      <AiConversationView
        project={project}
        config={config}
        indexStatus={null}
        pendingIntent={null}
        onIntentAction={vi.fn()}
        events={events}
      />,
    );

    const scrollContainer = screen.getByTestId("ai-conversation-scroll");
    let scrollHeightReads = 0;
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => {
        scrollHeightReads += 1;
        return scrollHeightReads === 1 ? 1000 : 1320;
      },
    });
    scrollContainer.scrollTop = 180;

    await userEvent.click(screen.getByRole("button", { name: "Mostrar más" }));

    expect(screen.getByText("Mensaje 0")).toBeInTheDocument();
    expect(scrollContainer.scrollTop).toBe(500);
  });

  it("groups visible messages with Slack-style relative separators", () => {
    const today = new Date();
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(today.getDate() - 2);
    const previousMonth = new Date(today);
    previousMonth.setMonth(today.getMonth() - 1);

    render(
      <AiConversationView
        project={project}
        config={config}
        indexStatus={null}
        pendingIntent={null}
        onIntentAction={vi.fn()}
        events={[
          conversationEvent({ id: "month", content: "Mensaje mensual", createdAt: previousMonth.toISOString() }),
          conversationEvent({ id: "week", content: "Mensaje semanal", createdAt: twoDaysAgo.toISOString() }),
          conversationEvent({ id: "today", content: "Mensaje de hoy", createdAt: today.toISOString() }),
        ]}
      />,
    );

    expect(screen.getByText("Hoy")).toBeInTheDocument();
    expect(screen.getByText("Hoy").parentElement).toHaveClass("sticky");
    expect(screen.getAllByText(/Mayo|Abril|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre|Enero|Febrero|Marzo/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Esta semana|Semana pasada/).length).toBeGreaterThan(0);
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
    ...defaultAiConfig.permissions,
    editDocuments: true,
    createFolders: true,
    createDocuments: true,
    deleteDocumentsAndFolders: false,
    generateImages: false,
    createImageAssets: false,
    insertImagesIntoDocuments: false,
    useDocumentContextForImageGeneration: false,
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
    model: "gpt-image-1.5",
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
    ...defaultAiConfig.agentic,
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
    model: "gpt-4o-mini-transcribe",
    defaultTarget: "prompt",
    defaultLanguage: "auto",
    favoriteLanguages: ["es", "en"],
  },
  diagrams: {
    enabled: true,
    visualProfile: "visual_local",
    iconSet: "lucide",
    imagePolicy: "project_assets",
    betaPolicy: "ask",
    defaultWidth: "wide",
    aiGenerationMode: "visual",
  },
  handwrittenDrawing: defaultAiConfig.handwrittenDrawing,
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
