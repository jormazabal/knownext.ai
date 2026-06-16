import { act, cleanup, fireEvent, render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOCUMENT_TREE_FILE_DRAG_MIME } from "../../lib/dragData";
import type { AiResearchJob } from "../../types/domain";
import { AiPromptInput } from "./AiPromptInput";

const transcriptionMock = vi.hoisted(() => ({
  state: {
    status: "idle",
    activeTarget: null,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    resetError: vi.fn(),
  },
}));

vi.mock("../transcription/useRealtimeTranscription", () => ({
  useRealtimeTranscription: () => transcriptionMock.state,
}));

function makeResearchBrief(overrides: Partial<Parameters<typeof AiPromptInput>[0]["researchBrief"]> = {}) {
  const now = "2026-06-12T10:00:00Z";
  return {
    id: "brief-1",
    projectId: "project-1",
    topic: "Mazda MX-5",
    objective: "Investigar diferencias por años",
    questions: ["Resumen ejecutivo", "Diferencias por generación", "Recomendación"],
    depth: "deep" as const,
    sourceScope: "web_project" as const,
    maxSources: 10,
    candidateSourceLimit: 200,
    reportLength: "wide" as const,
    maxEstimatedCostEur: 1,
    resultTarget: "new_document" as const,
    confirmBeforeCreating: true,
    destinationFolderId: null,
    destinationFolderPath: null,
    templateId: "state_of_art" as const,
    tone: "professional" as const,
    language: "es" as const,
    plan: {
      title: "Investigación profunda: Mazda MX-5",
      objective: "Comparar generaciones y años del Mazda MX-5 para una compra informada.",
      primaryObjective: "Comparar generaciones y años del Mazda MX-5 para una compra informada.",
      secondaryObjectives: ["Identificar años recomendables", "Contrastar fiabilidad y costes", "Proponer una recomendación de compra"],
      researchAspects: ["Generaciones y cambios clave", "Motores y fiabilidad", "Costes de mantenimiento", "Mercado de ocasión", "Riesgos e incertidumbres"],
      objectiveCoverage: [
        { objectiveIndex: 0, aspectIndexes: [0, 1] },
        { objectiveIndex: 1, aspectIndexes: [1, 2, 3] },
        { objectiveIndex: 2, aspectIndexes: [3, 4] },
      ],
      recommendedReportStyle: "Informe comparativo orientado a decisión de compra.",
      proposedCandidateSourceLimit: 200,
      candidateSourceLimit: 200,
      proposedReportLength: "wide" as const,
      reportLength: "wide" as const,
      planningRationale: "200 fuentes candidatas y extensión amplia por tratarse de una comparativa con decisión.",
      outline: ["Generaciones y cambios clave", "Motores y fiabilidad", "Costes de mantenimiento", "Mercado de ocasión", "Riesgos e incertidumbres"],
      constraints: "Enfocado a compra de segunda mano en España.",
      sourceScope: "web_project" as const,
      diagramsEnabled: true,
      imagesEnabled: true,
      estimatedDurationLabel: "8-15 min",
      autoStartAfterSeconds: 60,
      createdAt: now,
      updatedAt: now,
    },
    reportProfile: { diagramsEnabled: true, imagesEnabled: true },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeResearchJob(overrides: Partial<AiResearchJob> = {}): AiResearchJob {
  const now = "2026-06-12T10:00:00Z";
  const brief = makeResearchBrief();
  return {
    id: "job-1",
    projectId: "project-1",
    brief,
    status: "drafting" as const,
    phases: ["planning", "searching", "reading", "extracting", "drafting"],
    currentPhase: "drafting" as const,
    phase: "drafting" as const,
    progress: 84,
    progressMessage: "Redactando informe.",
    message: "Redactando informe.",
    heartbeatAt: now,
    lastActivityAt: now,
    sources: [],
    evidence: [],
    activity: [{ id: "activity-1", phase: "drafting" as const, level: "info" as const, message: "Generando tabla comparativa de costes.", createdAt: now }],
    artifactCounts: { candidateSources: 50, rankedSources: 30, selectedSources: 12, readSources: 8, evidence: 18, findings: 4, citedSources: 6, tables: 2, diagrams: 1, images: 0 },
    usage: { providerCalls: 3, inputTokens: 32000, cachedInputTokens: 2000, outputTokens: 9000, reasoningTokens: 1200, totalTokens: 41000, estimatedCostEur: 0.38, currency: "EUR" as const, updatedAt: now },
    qualityReport: null,
    documentId: null,
    createdDocumentId: null,
    documentPath: null,
    markdown: null,
    tree: null,
    error: null,
    retryOfJobId: null,
    startedAt: "2026-06-12T09:58:00Z",
    finishedAt: null,
    createdAt: "2026-06-12T09:58:00Z",
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  transcriptionMock.state = {
    status: "idle",
    activeTarget: null,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    resetError: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
});

describe("AiPromptInput", () => {
  it("shows applied AI changes as a dismissible floating prompt notice", async () => {
    const onDismissAppliedChange = vi.fn();

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        appliedChangeSummary="Se reemplazó el contenido mínimo por una poesía de 10 líneas."
        onSubmit={vi.fn()}
        onDismissAppliedChange={onDismissAppliedChange}
      />,
    );

    expect(screen.getByText("Se reemplazó el contenido mínimo por una poesía de 10 líneas.")).toBeInTheDocument();
    expect(screen.queryByText("Cambios aplicados por IA")).not.toBeInTheDocument();
    expect(screen.queryByText("Ver conversación")).not.toBeInTheDocument();
    expect(screen.queryByText("Deshacer")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Cerrar aviso de cambios IA"));

    expect(onDismissAppliedChange).toHaveBeenCalledTimes(1);
  });

  it("shows a right-aligned waiting bubble while the prompt is processing", async () => {
    let resolveSubmit: () => void = () => undefined;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    }));

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={onSubmit}
      />,
    );

    await userEvent.type(screen.getByPlaceholderText(/Pregunta algo sobre este documento/), "Resume este documento");
    await userEvent.click(screen.getByLabelText("Enviar"));

    expect(onSubmit).toHaveBeenCalledWith("Resume este documento", null, { executionMode: "quick", reasoningDepth: "light" });
    expect(screen.getByRole("status")).toHaveTextContent("Esperando respuesta...");

    resolveSubmit();

    await waitForElementToBeRemoved(() => screen.queryByRole("status"));
  });

  it("shows selected text as removable prompt context and submits it", async () => {
    const onSubmit = vi.fn();
    const onClearSelectionFocus = vi.fn();
    const selectionFocus = {
      documentId: "doc-1",
      path: "pp.md",
      from: 5,
      to: 20,
      text: "texto seleccionado importante",
    };

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        selectionFocus={selectionFocus}
        onSubmit={onSubmit}
        onClearSelectionFocus={onClearSelectionFocus}
      />,
    );

    expect(screen.getByText("Texto seleccionado")).toBeInTheDocument();
    expect(screen.queryByText("texto seleccionado importante")).not.toBeInTheDocument();
    const contextStrip = screen.getByText("Texto seleccionado").closest(".knownext-ai-context-strip") as HTMLElement | null;
    expect(contextStrip).not.toHaveClass("absolute", "bottom-full");
    expect(contextStrip).not.toHaveClass("border-b");
    expect(screen.getByText("Texto seleccionado").closest(".knownext-ai-prompt")).toContainElement(contextStrip);

    await userEvent.type(screen.getByPlaceholderText(/Pregunta algo sobre este documento/), "Ponlo en negrita");
    await userEvent.click(screen.getByLabelText("Enviar"));

    expect(onSubmit).toHaveBeenCalledWith("Ponlo en negrita", selectionFocus, { executionMode: "quick", reasoningDepth: "light" });

    await userEvent.click(screen.getByLabelText("Quitar texto seleccionado del contexto IA"));
    expect(onClearSelectionFocus).toHaveBeenCalledTimes(1);
  });

  it("submits cursor focus as hidden context without rendering a prompt chip", async () => {
    const onSubmit = vi.fn();
    const cursorFocus = {
      documentId: "doc-1",
      path: "pp.md",
      focusType: "cursor" as const,
      from: 42,
      to: 42,
      position: 42,
      text: "",
      nearTextBefore: "Texto anterior",
      nearTextAfter: "Texto posterior",
      blockType: "paragraph",
      blockHash: "block-1",
    };

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        selectionFocus={cursorFocus}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByText("Cursor en documento")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Quitar cursor del contexto IA")).not.toBeInTheDocument();
    expect(screen.queryByText("Texto seleccionado")).not.toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/Pregunta algo sobre este documento/), "Inserta una tabla aqui");
    await userEvent.click(screen.getByLabelText("Enviar"));

    expect(onSubmit).toHaveBeenCalledWith("Inserta una tabla aqui", cursorFocus, { executionMode: "quick", reasoningDepth: "light" });
  });

  it("renders attached context files inside the prompt container", () => {
    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        activeContextSources={[{
          id: "source-1",
          projectId: "project-1",
          name: "alcaldes_tolosaldea_perfiles_cv_revisado.xlsx",
          kind: "external_file",
          status: "ready",
          weight: "high",
          sizeBytes: 12000,
          createdAt: "2026-05-30T12:00:00Z",
          updatedAt: "2026-05-30T12:00:00Z",
          expiresAt: null,
          lastUsedAt: null,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          path: null,
        }]}
        onSubmit={vi.fn()}
      />,
    );

    const chip = screen.getByText("alcaldes_tolosaldea_perfiles_cv_revisado.xlsx");
    const contextStrip = chip.closest(".knownext-ai-context-strip") as HTMLElement | null;
    const promptShell = screen.getByPlaceholderText(/Pregunta algo sobre este documento/).closest(".knownext-ai-prompt") as HTMLElement | null;

    expect(contextStrip).not.toHaveClass("absolute", "bottom-full");
    expect(contextStrip).not.toHaveClass("border-b");
    expect(promptShell).toContainElement(contextStrip);
    expect(screen.getByText(/Fuentes · 1/)).toBeInTheDocument();
  });

  it("allows choosing reasoning mode and depth from the prompt", async () => {
    const onSubmit = vi.fn();

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={onSubmit}
      />,
    );

    await userEvent.click(screen.getByLabelText("Selector de modo IA"));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Razonar/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Profundo" }));
    await userEvent.type(screen.getByPlaceholderText(/Pregunta algo sobre este documento/), "Investiga y redacta");
    await userEvent.click(screen.getByLabelText("Enviar"));

    expect(onSubmit).toHaveBeenCalledWith("Investiga y redacta", null, { executionMode: "reasoning", reasoningDepth: "deep" });
  });

  it("adds project files dropped from the document tree as AI context", () => {
    const onAddProjectDocumentContext = vi.fn();
    const onUploadContextFiles = vi.fn();

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={vi.fn()}
        onAddProjectDocumentContext={onAddProjectDocumentContext}
        onUploadContextFiles={onUploadContextFiles}
      />,
    );

    const promptShell = screen.getByPlaceholderText(/Pregunta algo sobre este documento/).closest(".knownext-ai-prompt");
    expect(promptShell).not.toBeNull();

    const dataTransfer = createProjectFileDataTransfer({
      id: "doc-functional",
      type: "document",
      name: "requisitos-funcionales.md",
      path: "docs/requisitos-funcionales.md",
    });

    fireEvent.dragEnter(promptShell!, { dataTransfer });
    expect(screen.getByText("Suelta archivos para usarlos como contexto IA")).toBeInTheDocument();

    fireEvent.drop(promptShell!, { dataTransfer });

    expect(onAddProjectDocumentContext).toHaveBeenCalledWith("doc-functional");
    expect(onUploadContextFiles).not.toHaveBeenCalled();
  });

  it("allows preparing document context even when the AI provider is not configured", async () => {
    const onSubmit = vi.fn();
    const onAddProjectDocumentContext = vi.fn();

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady={false}
        onSubmit={onSubmit}
        onAddProjectDocumentContext={onAddProjectDocumentContext}
        onSearchProjectDocuments={async () => [{
          documentId: "doc-functional",
          name: "requisitos-funcionales.md",
          path: "docs/requisitos-funcionales.md",
          kind: "project_document",
        }]}
      />,
    );

    const prompt = screen.getByPlaceholderText(/Configura OpenAI/);
    expect(prompt).toBeEnabled();
    expect(screen.getByLabelText("Enviar")).toBeDisabled();

    await userEvent.type(prompt, "@req");
    expect(await screen.findByText("Referenciar archivo")).toBeInTheDocument();
    expect(await screen.findByText("requisitos-funcionales.md")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.queryByText("docs/requisitos-funcionales.md")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Cerrar selector de archivos"));
    expect(screen.queryByText("Referenciar archivo")).not.toBeInTheDocument();

    await userEvent.clear(prompt);
    await userEvent.type(prompt, "@req");
    await userEvent.click(await screen.findByText("requisitos-funcionales.md"));

    expect(onAddProjectDocumentContext).toHaveBeenCalledWith("doc-functional");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("allows XLSX files in the context file picker", () => {
    const { container } = render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={vi.fn()}
        onUploadContextFiles={vi.fn()}
      />,
    );

    expect(container.querySelector('input[type="file"]')).toHaveAttribute("accept", expect.stringContaining(".xlsx"));
  });

  it("opens the prompt context menu from pointer activation", () => {
    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={vi.fn()}
        onAddProjectDocumentContext={vi.fn()}
        onUploadContextFiles={vi.fn()}
      />,
    );

    fireEvent.pointerDown(screen.getByLabelText("Añadir contexto"));

    expect(screen.getByText("Archivo del proyecto")).toBeInTheDocument();
    expect(screen.getByText("Adjuntar archivo")).toBeInTheDocument();
    expect(screen.getByText("Pegar imagen")).toBeInTheDocument();
    expect(screen.getByText("Investigación")).toBeInTheDocument();
    expect(screen.getByText("Crear")).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText("Crear"));
    expect(screen.getByText("Crear imagen")).toBeInTheDocument();
    expect(screen.getByText("Crear diagrama")).toBeInTheDocument();
  });

  it("forces research intent from the prompt capabilities menu", async () => {
    const onSubmit = vi.fn();

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={onSubmit}
        onAddProjectDocumentContext={vi.fn()}
        onUploadContextFiles={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText("Añadir contexto"));
    await userEvent.click(screen.getByText("Investigación"));

    expect(screen.getByText("Investigación")).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(/Describe qué quieres investigar/), "Normativa SaaS en España");
    await userEvent.click(screen.getByLabelText("Enviar"));

    expect(onSubmit).toHaveBeenCalledWith("Normativa SaaS en España", null, {
      executionMode: "reasoning",
      reasoningDepth: "deep",
      intent: expect.objectContaining({
        kind: "research",
        research: expect.objectContaining({
          sourceScope: "web_project",
          confirmBeforeCreating: false,
        }),
      }),
    });
  });

  it("shows research job progress, quality and retry action", async () => {
    const onRetryResearchJob = vi.fn();
    const now = "2026-06-12T10:00:00Z";
    const brief = {
      id: "brief-1",
      projectId: "project-1",
      topic: "Normativa SaaS",
      objective: "Investigar normativa SaaS",
      questions: ["¿Qué aplica?"],
      depth: "deep" as const,
      sourceScope: "web_project" as const,
      maxSources: 6,
      maxEstimatedCostEur: 1,
      resultTarget: "new_document" as const,
      confirmBeforeCreating: true,
      destinationFolderId: null,
      destinationFolderPath: null,
      createdAt: now,
      updatedAt: now,
    };

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={vi.fn()}
        researchJob={{
          id: "job-1",
          projectId: "project-1",
          brief,
          status: "failed",
          phases: ["planning", "searching", "reading", "drafting", "reviewing"],
          currentPhase: "failed",
          phase: "failed",
          progress: 100,
          progressMessage: "No se pudo completar.",
          message: "No se pudo completar.",
          sources: [{ id: "source-1", title: "Fuente oficial", url: "https://example.com", path: null, kind: "web", consultedAt: now, confidence: "medium", usedFragments: ["fragmento"] }],
          evidence: [{ id: "evidence-1", sourceId: "source-1", claim: "Afirmación", excerpt: "fragmento", confidence: "medium" }],
          qualityReport: { id: "quality-1", jobId: "job-1", status: "warning", coverage: "medium", supportedClaims: 1, unsupportedClaims: [], contradictions: [], limitations: [], sourceCount: 1, independentSourceCount: 1, generatedAt: now },
          documentId: null,
          createdDocumentId: null,
          documentPath: null,
          markdown: null,
          tree: null,
          error: { code: "provider_error", message: "Error verificable", retryable: true },
          retryOfJobId: null,
          startedAt: now,
          finishedAt: now,
          createdAt: now,
          updatedAt: now,
        }}
        researchJobs={[]}
        onRetryResearchJob={onRetryResearchJob}
      />,
    );

    expect(screen.getAllByText("Error verificable").length).toBeGreaterThan(0);
    expect(screen.queryByText("Fuente oficial")).not.toBeInTheDocument();
    expect(screen.queryByText("Revisar")).not.toBeInTheDocument();
    expect(screen.queryByText("Investigaciones recientes")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Reintentar"));
    expect(onRetryResearchJob).toHaveBeenCalledWith("job-1");
  });

  it("shows live research activity with elapsed time, metrics and running footer copy", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T10:00:30Z"));

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={vi.fn()}
        researchJob={makeResearchJob()}
        researchJobs={[]}
      />,
    );

    expect(screen.getByText(/2:30 · Generando tabla comparativa de costes\./)).toBeInTheDocument();
    expect(screen.getByText("Fuentes 8/50")).toBeInTheDocument();
    expect(screen.getByText("Evidencias 18")).toBeInTheDocument();
    expect(screen.getByText("Tablas 2")).toBeInTheDocument();
    expect(screen.getByText("Diagramas 1")).toBeInTheDocument();
    expect(screen.getByText("Tokens 41k")).toBeInTheDocument();
    expect(screen.getByText("Coste aprox. 0,38 €")).toBeInTheDocument();
    expect(screen.getByText("La investigación está trabajando. Puedes cancelarla; no se creará documento parcial.")).toBeInTheDocument();
    expect(screen.queryByText(/Puedes cambiar el plan o dejar que/)).not.toBeInTheDocument();
  });

  it("asks for confirmation before cancelling a running research job", async () => {
    const onCancelResearchJob = vi.fn();

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={vi.fn()}
        researchJob={makeResearchJob()}
        researchJobs={[]}
        onCancelResearchJob={onCancelResearchJob}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByRole("dialog", { name: "Cancelar investigación" })).toBeInTheDocument();
    expect(onCancelResearchJob).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar investigación" }));

    expect(onCancelResearchJob).toHaveBeenCalledWith("job-1");
  });

  it("shows stale heartbeat as recent inactivity without changing job status", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T10:05:30Z"));

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={vi.fn()}
        researchJob={makeResearchJob()}
        researchJobs={[]}
      />,
    );

    expect(screen.getByText(/Sin actividad reciente/)).toBeInTheDocument();
    expect(screen.getByText("No hay actividad reciente. Puedes esperar o cancelar.")).toBeInTheDocument();
  });

  it("shows a reviewable research plan without technical controls", () => {
    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={vi.fn()}
        researchBrief={makeResearchBrief()}
        researchJobs={[]}
      />,
    );

    expect(screen.getByText("Investigación")).toBeInTheDocument();
    expect(screen.getByText("Investigación profunda: Mazda MX-5")).toBeInTheDocument();
    expect(screen.getByText(/Objetivos secundarios:/)).toBeInTheDocument();
    expect(screen.getByText(/Aspectos a investigar:/)).toBeInTheDocument();
    expect(screen.getByText(/Generaciones y cambios clave/)).toBeInTheDocument();
    expect(screen.getByText("Fuentes candidatas")).toBeInTheDocument();
    expect(screen.getByText("Extensión del informe")).toBeInTheDocument();
    expect(screen.getByText(/200 fuentes candidatas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausar cuenta atrás" })).toHaveTextContent("60 s");
    expect(screen.queryByText("Profundidad")).not.toBeInTheDocument();
    expect(screen.queryByText("Plantilla")).not.toBeInTheDocument();
    expect(screen.queryByText("Coste")).not.toBeInTheDocument();
  });

  it("auto-starts the research plan after the countdown", async () => {
    vi.useFakeTimers();
    const onStartResearch = vi.fn();

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={vi.fn()}
        researchBrief={makeResearchBrief({
          plan: {
            ...makeResearchBrief().plan!,
            autoStartAfterSeconds: 60,
          },
        })}
        researchJobs={[]}
        onStartResearch={onStartResearch}
      />,
    );

    await act(async () => undefined);
    for (let index = 0; index < 61; index += 1) {
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
    }

    expect(onStartResearch).toHaveBeenCalledTimes(1);
    expect(onStartResearch.mock.calls[0][0]).toEqual(expect.objectContaining({
      plan: expect.objectContaining({ title: "Investigación profunda: Mazda MX-5" }),
    }));
  });

  it("pauses countdown while editing and starts with the edited plan", async () => {
    vi.useFakeTimers();
    const onStartResearch = vi.fn();

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={vi.fn()}
        researchBrief={makeResearchBrief({
          plan: {
            ...makeResearchBrief().plan!,
            autoStartAfterSeconds: 60,
          },
        })}
        researchJobs={[]}
        onStartResearch={onStartResearch}
      />,
    );

    fireEvent.click(screen.getByText("Cambiar"));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(onStartResearch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("5 aspectos a investigar"), {
      target: { value: "Resumen\nCostes de mantenimiento\nAños recomendados\nRiesgos\nRecomendación" },
    });
    fireEvent.click(screen.getByRole("button", { name: "500" }));
    fireEvent.click(screen.getByRole("button", { name: "Exhaustivo" }));
    fireEvent.click(screen.getByText("Iniciar ahora"));

    expect(onStartResearch).toHaveBeenCalledWith(expect.objectContaining({
      questions: ["Resumen", "Costes de mantenimiento", "Años recomendados", "Riesgos", "Recomendación"],
      candidateSourceLimit: 500,
      maxSources: 500,
      plan: expect.objectContaining({
        outline: ["Resumen", "Costes de mantenimiento", "Años recomendados", "Riesgos", "Recomendación"],
        researchAspects: ["Resumen", "Costes de mantenimiento", "Años recomendados", "Riesgos", "Recomendación"],
        candidateSourceLimit: 500,
        reportLength: "exhaustive",
      }),
    }));
  });

  it("uses the local file picker handler for context attachments when available", async () => {
    const onPickLocalContextFiles = vi.fn();
    const onUploadContextFiles = vi.fn();

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={vi.fn()}
        onAddProjectDocumentContext={vi.fn()}
        onUploadContextFiles={onUploadContextFiles}
        onPickLocalContextFiles={onPickLocalContextFiles}
      />,
    );

    await userEvent.click(screen.getByLabelText("Añadir contexto"));
    await userEvent.click(screen.getByText("Adjuntar archivo"));

    expect(onPickLocalContextFiles).toHaveBeenCalledTimes(1);
    expect(onUploadContextFiles).not.toHaveBeenCalled();
  });

  it("uploads selected and dropped external files as prompt context", async () => {
    const onUploadContextFiles = vi.fn();
    const selectedFile = new File(["# seleccionado"], "seleccionado.md", { type: "text/markdown" });
    const droppedFile = new File(["presupuesto"], "presupuesto.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const { container } = render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={vi.fn()}
        onUploadContextFiles={onUploadContextFiles}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [selectedFile] } });

    expect(onUploadContextFiles).toHaveBeenCalledWith([selectedFile]);

    const promptShell = screen.getByPlaceholderText(/Pregunta algo sobre este documento/).closest(".knownext-ai-prompt");
    const dataTransfer = {
      types: ["Files"],
      files: [droppedFile],
      dropEffect: "",
    } as unknown as DataTransfer;

    fireEvent.dragEnter(promptShell!, { dataTransfer });
    expect(screen.getByText("Suelta archivos para usarlos como contexto IA")).toBeInTheDocument();
    fireEvent.drop(promptShell!, { dataTransfer });

    expect(onUploadContextFiles).toHaveBeenLastCalledWith([droppedFile]);
  });

  it("lets the microphone menu choose transcription target and language", async () => {
    const onTranscriptionConfigChange = vi.fn();

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        transcriptionConfig={{
          enabled: true,
          model: "gpt-4o-mini-transcribe",
          defaultTarget: "prompt",
          defaultLanguage: "auto",
          favoriteLanguages: ["es", "en"],
        }}
        onSubmit={vi.fn()}
        onTranscriptionConfigChange={onTranscriptionConfigChange}
      />,
    );

    await userEvent.click(screen.getByLabelText("Opciones de transcripción"));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Dictar en documento" }));

    expect(onTranscriptionConfigChange).toHaveBeenCalledWith({ defaultTarget: "document" });

    await userEvent.click(screen.getByLabelText("Opciones de transcripción"));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Español" }));

    expect(onTranscriptionConfigChange).toHaveBeenCalledWith({ defaultLanguage: "es" });
  });

  it("opens the transcription menu from pointer activation", () => {
    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        transcriptionConfig={{
          enabled: true,
          model: "gpt-4o-mini-transcribe",
          defaultTarget: "prompt",
          defaultLanguage: "auto",
          favoriteLanguages: ["es", "en"],
        }}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.pointerDown(screen.getByLabelText("Opciones de transcripción"));

    expect(screen.getByRole("menuitemradio", { name: "Transcribir al prompt" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Dictar en documento" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Español" })).toBeInTheDocument();
  });

  it("commits completed transcription into the prompt text", async () => {
    transcriptionMock.state.start.mockImplementation(async ({ handlers }) => {
      handlers.onCompleted({ itemId: "dictation", transcript: "nota dictada al prompt" });
    });

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        transcriptionConfig={{
          enabled: true,
          model: "gpt-4o-mini-transcribe",
          defaultTarget: "prompt",
          defaultLanguage: "auto",
          favoriteLanguages: ["es"],
        }}
        onSubmit={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText("Iniciar transcripción"));

    expect(transcriptionMock.state.start).toHaveBeenCalledWith(expect.objectContaining({
      target: "prompt",
      language: "auto",
    }));
    expect(screen.getByPlaceholderText(/Pregunta algo sobre este documento/)).toHaveValue("nota dictada al prompt ");
  });

  it("commits completed transcription into the active document when dictation target is document", async () => {
    const onCommitDocumentDictation = vi.fn();
    transcriptionMock.state.start.mockImplementation(async ({ handlers }) => {
      handlers.onCompleted({ itemId: "dictation", transcript: "texto dictado al documento" });
    });

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        documentDictationReady
        transcriptionConfig={{
          enabled: true,
          model: "gpt-4o-mini-transcribe",
          defaultTarget: "document",
          defaultLanguage: "es",
          favoriteLanguages: ["es"],
        }}
        onSubmit={vi.fn()}
        onCommitDocumentDictation={onCommitDocumentDictation}
      />,
    );

    await userEvent.click(screen.getByLabelText("Iniciar transcripción"));

    expect(transcriptionMock.state.start).toHaveBeenCalledWith(expect.objectContaining({
      target: "document",
      language: "es",
    }));
    expect(onCommitDocumentDictation).toHaveBeenCalledWith("texto dictado al documento ");
    expect(screen.getByPlaceholderText(/Pregunta algo sobre este documento/)).toHaveValue("");
  });

  it("uses a compact prompt action group and modal options in narrow responsive mode", async () => {
    mockCompactPromptMode(true);
    const onSubmit = vi.fn();
    const onTranscriptionConfigChange = vi.fn();

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        transcriptionConfig={{
          enabled: true,
          model: "gpt-4o-mini-transcribe",
          defaultTarget: "prompt",
          defaultLanguage: "auto",
          favoriteLanguages: ["es", "en"],
        }}
        onSubmit={onSubmit}
        onTranscriptionConfigChange={onTranscriptionConfigChange}
      />,
    );

    expect(screen.getByLabelText("Opciones del prompt")).toBeInTheDocument();
    expect(screen.getByLabelText("Enviar prompt")).toBeInTheDocument();
    expect(screen.queryByLabelText("Añadir contexto")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Selector de modo IA")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Iniciar transcripción")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Opciones del prompt"));

    expect(screen.getByRole("dialog", { name: "Opciones del prompt" })).toBeInTheDocument();
    expect(screen.getByText("Archivo del proyecto")).toBeInTheDocument();
    expect(screen.getByText("Rápido")).toBeInTheDocument();
    expect(screen.getByText("Dictado")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Profundo" }));

    expect(screen.queryByRole("dialog", { name: "Opciones del prompt" })).not.toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/Pregunta algo sobre este documento/), "Investiga y redacta");
    await userEvent.click(screen.getByLabelText("Enviar prompt"));

    expect(onSubmit).toHaveBeenCalledWith("Investiga y redacta", null, { executionMode: "reasoning", reasoningDepth: "deep" });
  });
});

function createProjectFileDataTransfer(payload: { id: string; type: string; name: string; path: string }) {
  const data = new Map<string, string>([[DOCUMENT_TREE_FILE_DRAG_MIME, JSON.stringify(payload)]]);
  return {
    types: [DOCUMENT_TREE_FILE_DRAG_MIME],
    files: [],
    effectAllowed: "",
    dropEffect: "",
    setData: (key: string, value: string) => data.set(key, value),
    getData: (key: string) => data.get(key) ?? "",
  };
}

function mockCompactPromptMode(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}
