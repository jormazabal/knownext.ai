import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownToolbar } from "./MarkdownToolbar";

describe("MarkdownToolbar", () => {
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
  });

  it("marks active editor formats and keeps toolbar actions available", async () => {
    const onRunEditorAction = vi.fn();

    render(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady
        markdownZoomPercent={100}
        activeActions={{
          "heading-2": true,
          bold: true,
          underline: true,
          "bullet-list": true,
        }}
        editorHistoryState={{ canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 }}
        onRunEditorAction={onRunEditorAction}
        onExportDocument={vi.fn()}
        onMarkdownZoomChange={vi.fn()}
        onToggleHistory={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Formato de bloque" })).toHaveTextContent("Título 2");
    expect(screen.getByRole("button", { name: "Negrita" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Subrayado" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Lista con viñetas" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Lista con viñetas" }));

    expect(onRunEditorAction).toHaveBeenCalledWith("bullet-list");
  });

  it("opens block and table controls without using fixed heading or table buttons", async () => {
    const onRunEditorAction = vi.fn();

    render(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady
        markdownZoomPercent={100}
        activeActions={{}}
        editorHistoryState={{ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 }}
        onRunEditorAction={onRunEditorAction}
        onExportDocument={vi.fn()}
        onMarkdownZoomChange={vi.fn()}
        onToggleHistory={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Formato de bloque" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Título 6" }));

    expect(onRunEditorAction).toHaveBeenCalledWith("heading-6");

    await userEvent.click(screen.getByRole("button", { name: "Tabla" }));
    await userEvent.click(screen.getByRole("button", { name: "Insertar tabla 4 x 5" }));

    expect(onRunEditorAction).toHaveBeenCalledWith("table", { table: { rows: 4, columns: 5 } });
  });

  it("hides the extended underline action when the appearance option is disabled", () => {
    render(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady
        extendedUnderlineEnabled={false}
        markdownZoomPercent={100}
        activeActions={{}}
        editorHistoryState={{ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 }}
        onRunEditorAction={vi.fn()}
        onExportDocument={vi.fn()}
        onMarkdownZoomChange={vi.fn()}
        onToggleHistory={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Subrayado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resaltado" })).not.toBeInTheDocument();
  });

  it("applies and clears highlight colors from the toolbar", async () => {
    const onRunEditorAction = vi.fn();

    render(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady
        markdownZoomPercent={100}
        activeActions={{ highlight: true, highlightColor: "green" }}
        editorHistoryState={{ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 }}
        onRunEditorAction={onRunEditorAction}
        onExportDocument={vi.fn()}
        onMarkdownZoomChange={vi.fn()}
        onToggleHistory={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Resaltado" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Resaltado" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Resaltar en Rosa" }));

    expect(onRunEditorAction).toHaveBeenCalledWith("highlight", { highlight: { color: "pink" } });

    await userEvent.click(screen.getByRole("button", { name: "Resaltado" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Quitar resaltado" }));

    expect(onRunEditorAction).toHaveBeenCalledWith("clear-highlight");
  });

  it("can hide project document actions for the fixed notes editor", () => {
    render(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady
        imageInsertionEnabled={false}
        documentActionsEnabled={false}
        markdownZoomPercent={100}
        activeActions={{}}
        editorHistoryState={{ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 }}
        onRunEditorAction={vi.fn()}
        onExportDocument={vi.fn()}
        onMarkdownZoomChange={vi.fn()}
        onToggleHistory={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Negrita" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Imagen" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diagrama" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Histórico de versiones" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exportar documento" })).not.toBeInTheDocument();
  });

  it("changes the Markdown viewer zoom from the toolbar menu", async () => {
    const onMarkdownZoomChange = vi.fn();

    render(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady={false}
        markdownZoomPercent={100}
        activeActions={{}}
        editorHistoryState={{ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 }}
        onRunEditorAction={vi.fn()}
        onExportDocument={vi.fn()}
        onMarkdownZoomChange={onMarkdownZoomChange}
        onToggleHistory={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Zoom del visualizador Markdown" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "125%" }));

    expect(onMarkdownZoomChange).toHaveBeenCalledWith(125);
  });

  it("toggles the raw Markdown source view from the zoom area", async () => {
    const onToggleMarkdownSource = vi.fn();

    const { rerender } = render(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady
        markdownZoomPercent={100}
        markdownSourceVisible={false}
        activeActions={{}}
        editorHistoryState={{ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 }}
        onRunEditorAction={vi.fn()}
        onExportDocument={vi.fn()}
        onMarkdownZoomChange={vi.fn()}
        onToggleMarkdownSource={onToggleMarkdownSource}
        onToggleHistory={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Mostrar Markdown puro" }));

    expect(onToggleMarkdownSource).toHaveBeenCalledTimes(1);

    rerender(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady={false}
        markdownZoomPercent={100}
        markdownSourceVisible
        activeActions={{}}
        editorHistoryState={{ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 }}
        onRunEditorAction={vi.fn()}
        onExportDocument={vi.fn()}
        onMarkdownZoomChange={vi.fn()}
        onToggleMarkdownSource={onToggleMarkdownSource}
        onToggleHistory={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Mostrar vista visual" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Mostrar vista visual" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Negrita" })).toBeDisabled();
  });

  it("dispatches document export actions for Markdown, PDF and DOCX", async () => {
    const onExportDocument = vi.fn();

    render(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady
        markdownZoomPercent={100}
        activeActions={{}}
        editorHistoryState={{ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 }}
        onRunEditorAction={vi.fn()}
        onExportDocument={onExportDocument}
        onMarkdownZoomChange={vi.fn()}
        onToggleHistory={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Exportar documento" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Markdown (.md)" }));
    await userEvent.click(screen.getByRole("button", { name: "Exportar documento" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "PDF (.pdf)" }));
    await userEvent.click(screen.getByRole("button", { name: "Exportar documento" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Word (.docx)" }));

    expect(onExportDocument).toHaveBeenNthCalledWith(1, "md");
    expect(onExportDocument).toHaveBeenNthCalledWith(2, "pdf");
    expect(onExportDocument).toHaveBeenNthCalledWith(3, "docx");
  });

  it("enables undo and redo independently from editor readiness", async () => {
    const onRunEditorAction = vi.fn();

    const { rerender } = render(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady
        markdownZoomPercent={100}
        activeActions={{}}
        editorHistoryState={{ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 }}
        onRunEditorAction={onRunEditorAction}
        onExportDocument={vi.fn()}
        onMarkdownZoomChange={vi.fn()}
        onToggleHistory={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rehacer" })).toBeDisabled();

    rerender(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady
        markdownZoomPercent={100}
        activeActions={{}}
        editorHistoryState={{ canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 }}
        onRunEditorAction={onRunEditorAction}
        onExportDocument={vi.fn()}
        onMarkdownZoomChange={vi.fn()}
        onToggleHistory={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Deshacer" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Rehacer" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Deshacer" }));

    expect(onRunEditorAction).toHaveBeenCalledWith("undo");

    rerender(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady
        markdownZoomPercent={100}
        activeActions={{}}
        editorHistoryState={{ canUndo: false, canRedo: true, undoDepth: 0, redoDepth: 1 }}
        onRunEditorAction={onRunEditorAction}
        onExportDocument={vi.fn()}
        onMarkdownZoomChange={vi.fn()}
        onToggleHistory={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rehacer" })).toBeEnabled();
  });

  it("uses a compact editor toolbar with all secondary actions in a modal in narrow responsive mode", async () => {
    mockCompactToolbarMode(true);
    const onRunEditorAction = vi.fn();

    render(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady
        markdownZoomPercent={100}
        activeActions={{ "heading-1": true, bold: true }}
        editorHistoryState={{ canUndo: true, canRedo: true, undoDepth: 1, redoDepth: 1 }}
        onRunEditorAction={onRunEditorAction}
        onExportDocument={vi.fn()}
        onMarkdownZoomChange={vi.fn()}
        onToggleHistory={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Formato de bloque" })).toHaveTextContent("Título 1");
    expect(screen.getByRole("button", { name: "Negrita" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Cursiva" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Más opciones" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rehacer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lista con viñetas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enlace" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Diagrama" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tabla" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom del visualizador Markdown" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Más opciones" }));

    expect(screen.getByRole("dialog", { name: "Opciones del editor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Viñetas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enlace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diagrama" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tabla 3 x 4" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resaltar en Amarillo" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Viñetas" }));

    expect(onRunEditorAction).toHaveBeenCalledWith("bullet-list");
    expect(screen.queryByRole("dialog", { name: "Opciones del editor" })).not.toBeInTheDocument();
  });
});

function mockCompactToolbarMode(matches: boolean) {
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
