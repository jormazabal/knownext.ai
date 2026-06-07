import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InsertDiagramDialog } from "./InsertDiagramDialog";

vi.mock("../editor/mermaidDiagrams", () => ({
  defaultMermaidCode: "flowchart TD\n  A --> B",
  validateMermaidCode: vi.fn(async (code: string) => (
    code.includes("broken")
      ? { valid: false, error: "Sintaxis invalida" }
      : { valid: true, error: null }
  )),
  renderMermaidSvg: vi.fn(async () => "<svg role=\"img\"></svg>"),
  buildMermaidMarkdown: ({ code, caption }: { code: string; caption?: string | null }) => {
    const metadata = caption ? `%% knownext: ${JSON.stringify({ caption })}\n` : "";
    return `\`\`\`mermaid\n${metadata}${code.trim()}\n\`\`\``;
  },
}));

describe("InsertDiagramDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("validates and inserts Mermaid markdown with diagram metadata", async () => {
    const onInsert = vi.fn();
    render(<InsertDiagramDialog onClose={vi.fn()} onInsert={onInsert} />);

    fireEvent.change(screen.getByLabelText(/Codigo Mermaid/), {
      target: { value: "flowchart LR\n  Inicio --> Fin" },
    });
    fireEvent.change(screen.getByLabelText(/Pie opcional/), {
      target: { value: "Flujo principal" },
    });
    const validateButtons = screen.getAllByRole("button", { name: "Validar" });
    fireEvent.click(validateButtons[validateButtons.length - 1]);

    await waitFor(() => expect(screen.getByText("Diagrama valido.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Insertar" }));

    await waitFor(() => expect(onInsert).toHaveBeenCalledOnce());
    expect(onInsert.mock.calls[0][0]).toContain("```mermaid");
    expect(onInsert.mock.calls[0][0]).toContain("Flujo principal");
    expect(onInsert.mock.calls[0][0]).toContain("flowchart LR");
    expect(onInsert.mock.calls[0][0]).not.toContain("width");
    expect(screen.queryByText("Anchura")).not.toBeInTheDocument();
  });

  it("shows delete action in edit mode", () => {
    const onDelete = vi.fn();
    render(
      <InsertDiagramDialog
        variant="edit"
        initialCode={"flowchart TD\n  A --> B"}
        initialCaption="Actual"
        onClose={vi.fn()}
        onInsert={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("uses the selected diagram type example when inserting manually", () => {
    render(<InsertDiagramDialog onClose={vi.fn()} onInsert={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Flujo de proceso/i }));
    fireEvent.click(screen.getByText("Secuencia").closest("button")!);

    expect((screen.getByLabelText(/Codigo Mermaid/) as HTMLTextAreaElement).value).toContain("sequenceDiagram");
  });

  it("asks confirmation before replacing existing code when changing type in edit mode", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <InsertDiagramDialog
        variant="edit"
        initialCode={"flowchart TD\n  A --> B"}
        onClose={vi.fn()}
        onInsert={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Flujo de proceso/i }));
    fireEvent.click(screen.getByText("Secuencia").closest("button")!);

    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByLabelText(/Codigo Mermaid/)).toHaveValue("flowchart TD\n  A --> B");
    confirm.mockRestore();
  });
});
