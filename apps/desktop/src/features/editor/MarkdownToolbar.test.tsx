import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownToolbar } from "./MarkdownToolbar";

describe("MarkdownToolbar", () => {
  afterEach(() => cleanup());

  it("marks active editor formats and keeps toolbar actions available", async () => {
    const onRunEditorAction = vi.fn();

    render(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady
        activeActions={{
          "heading-2": true,
          bold: true,
          underline: true,
          "bullet-list": true,
        }}
        editorHistoryState={{ canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 }}
        onRunEditorAction={onRunEditorAction}
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
        activeActions={{}}
        editorHistoryState={{ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 }}
        onRunEditorAction={onRunEditorAction}
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
        activeActions={{}}
        editorHistoryState={{ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 }}
        onRunEditorAction={vi.fn()}
        onToggleHistory={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Subrayado" })).not.toBeInTheDocument();
  });

  it("enables undo and redo independently from editor readiness", async () => {
    const onRunEditorAction = vi.fn();

    const { rerender } = render(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady
        activeActions={{}}
        editorHistoryState={{ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 }}
        onRunEditorAction={onRunEditorAction}
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
        activeActions={{}}
        editorHistoryState={{ canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 }}
        onRunEditorAction={onRunEditorAction}
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
        activeActions={{}}
        editorHistoryState={{ canUndo: false, canRedo: true, undoDepth: 0, redoDepth: 1 }}
        onRunEditorAction={onRunEditorAction}
        onToggleHistory={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Deshacer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rehacer" })).toBeEnabled();
  });
});
