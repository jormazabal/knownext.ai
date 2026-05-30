import { cleanup, fireEvent, render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCUMENT_TREE_FILE_DRAG_MIME } from "../../lib/dragData";
import { AiPromptInput } from "./AiPromptInput";

afterEach(() => cleanup());

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
          model: "gpt-realtime-whisper",
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
