import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownToolbar } from "./MarkdownToolbar";

describe("MarkdownToolbar", () => {
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
  });
  const keyboardProps={historyOpen:false,historyEnabled:true,historyDisabledReason:"",editorReady:true,markdownZoomPercent:100,activeActions:{},editorHistoryState:{canUndo:true,canRedo:false,undoDepth:1,redoDepth:0},onRunEditorAction:vi.fn(),onExportDocument:vi.fn(),onMarkdownZoomChange:vi.fn(),onToggleHistory:vi.fn()};
  it("keeps an available tab stop when responsive CSS hides the previous focused control",()=>{render(<MarkdownToolbar {...keyboardProps}/>);const bold=screen.getByRole("button",{name:"Negrita"}),block=screen.getByRole("button",{name:"Formato de bloque"});bold.focus();expect(bold.tabIndex).toBe(0);bold.style.display="none";fireEvent.resize(window);expect(block.tabIndex).toBe(0);expect(within(screen.getByRole("toolbar")).getAllByRole("button").filter(b=>b.tabIndex===0&&!b.hasAttribute("disabled"))).toEqual([block]);});
  it("uses one toolbar tab stop and Arrow/Home/End navigation omitting disabled actions",async()=>{render(<MarkdownToolbar {...keyboardProps}/>);const toolbar=screen.getByRole("toolbar"),first=screen.getByRole("button",{name:"Formato de bloque"});expect(within(toolbar).getAllByRole("button").filter(b=>b.tabIndex===0&&!b.hasAttribute("disabled"))).toHaveLength(1);first.focus();await userEvent.keyboard("{ArrowRight}");expect(screen.getByRole("button",{name:"Negrita"})).toHaveFocus();await userEvent.keyboard("{End}");expect(screen.getByRole("button",{name:"Deshacer"})).toHaveFocus();await userEvent.keyboard("{ArrowRight}");expect(first).toHaveFocus();await userEvent.keyboard("{ArrowLeft}");expect(screen.getByRole("button",{name:"Deshacer"})).toHaveFocus();await userEvent.keyboard("{Home}");expect(first).toHaveFocus();});
  it("opens menus from either keyboard direction and returns on Escape or activation",async()=>{const run=vi.fn(),outer=vi.fn();render(<main onKeyDown={outer}><MarkdownToolbar {...keyboardProps} onRunEditorAction={run}/></main>);const trigger=screen.getByRole("button",{name:"Formato de bloque"});trigger.focus();await userEvent.keyboard("{ArrowDown}");expect(screen.getByRole("menuitem",{name:"Normal"})).toHaveFocus();await userEvent.keyboard("{End}");expect(screen.getByRole("menuitem",{name:"Título 6"})).toHaveFocus();await userEvent.keyboard("{ArrowDown}");expect(screen.getByRole("menuitem",{name:"Normal"})).toHaveFocus();outer.mockClear();fireEvent.keyDown(document.activeElement!,{key:"Escape",isComposing:true});expect(screen.getByRole("menu")).toBeInTheDocument();outer.mockClear();await userEvent.keyboard("{Escape}");expect(trigger).toHaveFocus();expect(outer).not.toHaveBeenCalled();await userEvent.keyboard("{ArrowUp}");expect(screen.getByRole("menuitem",{name:"Título 6"})).toHaveFocus();await userEvent.keyboard("{Home}{ArrowDown}{Enter}");expect(run).toHaveBeenCalledWith("heading-1");expect(run).toHaveBeenCalledOnce();expect(trigger).toHaveFocus();expect(screen.queryByRole("menu")).not.toBeInTheDocument();});
  it("closes a keyboard menu on Tab and leaves the toolbar in either direction",async()=>{render(<><input aria-label="Antes"/><MarkdownToolbar {...keyboardProps}/><input aria-label="Después"/></>);const trigger=screen.getByRole("button",{name:"Formato de bloque"});trigger.focus();await userEvent.keyboard("{ArrowDown}");await userEvent.tab();expect(screen.queryByRole("menu")).not.toBeInTheDocument();expect(screen.getByLabelText("Después")).toHaveFocus();trigger.focus();await userEvent.keyboard("{ArrowDown}");await userEvent.tab({shift:true});expect(screen.getByLabelText("Antes")).toHaveFocus();});
  it("preserves the editor DOM selection when pointer users open and activate a format menu",async()=>{const run=vi.fn();render(<><div role="textbox" contentEditable suppressContentEditableWarning>Texto seleccionado</div><MarkdownToolbar {...keyboardProps} onRunEditorAction={run}/></>);const editor=screen.getByRole("textbox");editor.focus();const range=document.createRange();range.setStart(editor.firstChild!,0);range.setEnd(editor.firstChild!,5);const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);await userEvent.click(screen.getByRole("button",{name:"Formato de bloque"}));expect(editor).toHaveFocus();expect(selection.toString()).toBe("Texto");await userEvent.click(screen.getByRole("menuitem",{name:"Título 2"}));expect(editor).toHaveFocus();expect(selection.toString()).toBe("Texto");expect(run).toHaveBeenCalledWith("heading-2");});
  it("makes the table picker reachable by keyboard and returns to its trigger",async()=>{render(<MarkdownToolbar {...keyboardProps}/>);const trigger=screen.getByRole("button",{name:"Tabla"});trigger.focus();await userEvent.keyboard("{ArrowDown}");expect(screen.getByRole("button",{name:"Insertar tabla 1 x 1"})).toHaveFocus();await userEvent.keyboard("{End}");expect(screen.getByRole("button",{name:"Personalizar..."})).toHaveFocus();await userEvent.keyboard("{Home}{ArrowRight}");expect(screen.getByRole("button",{name:"Insertar tabla 1 x 2"})).toHaveFocus();await userEvent.keyboard("{Escape}");expect(trigger).toHaveFocus();expect(screen.queryByRole("menu")).not.toBeInTheDocument();});
  it("keeps compact modal focus and returns without reacting to composition Escape",async()=>{mockCompactToolbarMode(true);render(<MarkdownToolbar {...keyboardProps}/>);const trigger=screen.getByRole("button",{name:"Más opciones"});trigger.focus();await userEvent.keyboard("{Enter}");const dialog=screen.getByRole("dialog",{name:"Opciones del editor"});expect(dialog.contains(document.activeElement)).toBe(true);fireEvent.keyDown(document.activeElement!,{key:"Escape",isComposing:true});expect(dialog).toBeInTheDocument();await userEvent.keyboard("{Escape}");expect(screen.queryByRole("dialog")).not.toBeInTheDocument();expect(trigger).toHaveFocus();});

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
  it.each([false, true])("dispatches template capture and closes its menu in compact mode %s", async compact => {
    mockCompactToolbarMode(compact);
    const onSaveTemplate = vi.fn();
    render(<MarkdownToolbar historyOpen={false} historyEnabled historyDisabledReason="" editorReady markdownZoomPercent={100} activeActions={{}} editorHistoryState={{ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 }} onRunEditorAction={vi.fn()} onExportDocument={vi.fn()} onSaveTemplate={onSaveTemplate} onMarkdownZoomChange={vi.fn()} onToggleHistory={vi.fn()}/>);
    const trigger = screen.getByRole("button", { name: compact ? "Más opciones" : "Exportar documento" });
    trigger.focus(); await userEvent.click(trigger);
    await userEvent.click(screen.getByRole(compact ? "button" : "menuitem", { name: "Guardar como plantilla…" }));
    expect(onSaveTemplate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "Opciones del editor" })).not.toBeInTheDocument();
    if (compact) expect(trigger).toHaveFocus();
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
