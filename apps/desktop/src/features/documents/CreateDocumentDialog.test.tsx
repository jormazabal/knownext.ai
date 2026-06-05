import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateDocumentDialog } from "./CreateDocumentDialog";

describe("CreateDocumentDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("normalizes the document name and passes the selected template", () => {
    const onCreate = vi.fn();

    render(<CreateDocumentDialog open onClose={vi.fn()} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText(/Nombre del documento/), {
      target: { value: "plan-producto" },
    });
    fireEvent.change(screen.getByLabelText(/Plantilla/), {
      target: { value: "requirements" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear documento" }));

    expect(onCreate).toHaveBeenCalledWith("plan-producto.md", "requirements");
    expect(screen.getByLabelText(/Nombre del documento/)).toHaveValue("");
    expect(screen.getByLabelText(/Plantilla/)).toHaveValue("blank");
  });

  it("creates a default Markdown document and closes from both controls", () => {
    const onClose = vi.fn();
    const onCreate = vi.fn();

    render(<CreateDocumentDialog open onClose={onClose} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole("button", { name: "Crear documento" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onCreate).toHaveBeenCalledWith("nuevo-documento.md", "blank");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not render when closed", () => {
    render(<CreateDocumentDialog open={false} onClose={vi.fn()} onCreate={vi.fn()} />);

    expect(screen.queryByText("Crear documento")).not.toBeInTheDocument();
  });
});
