import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

    expect(onCreate).toHaveBeenCalledWith({
      kind: "document",
      name: "plan-producto.md",
      template: "requirements",
      background: "blank",
    });
    expect(screen.getByLabelText(/Nombre del documento/)).toHaveValue("");
    expect(screen.getByLabelText(/Plantilla/)).toHaveValue("blank");
  });

  it("creates the document when pressing Enter in the name input", async () => {
    const onCreate = vi.fn();

    render(<CreateDocumentDialog open onClose={vi.fn()} onCreate={onCreate} />);

    await userEvent.type(screen.getByLabelText(/Nombre del documento/), "atajo-enter{Enter}");

    expect(onCreate).toHaveBeenCalledWith({
      kind: "document",
      name: "atajo-enter.md",
      template: "blank",
      background: "blank",
    });
  });

  it("creates a default Markdown document and closes from both controls", () => {
    const onClose = vi.fn();
    const onCreate = vi.fn();

    render(<CreateDocumentDialog open onClose={onClose} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole("button", { name: "Crear documento" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onCreate).toHaveBeenCalledWith({
      kind: "document",
      name: "nuevo-documento.md",
      template: "blank",
      background: "blank",
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("creates a handwritten note with a knote extension and selected background", () => {
    const onCreate = vi.fn();

    render(<CreateDocumentDialog open initialKind="handwritten-note" onClose={vi.fn()} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText(/Nombre de la nota/), {
      target: { value: "boceto-clase" },
    });
    fireEvent.change(screen.getByLabelText(/Fondo inicial/), {
      target: { value: "cornell" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear nota" }));

    expect(onCreate).toHaveBeenCalledWith({
      kind: "handwritten-note",
      name: "boceto-clase.knote",
      template: "blank",
      background: "cornell",
    });
  });

  it("does not render when closed", () => {
    render(<CreateDocumentDialog open={false} onClose={vi.fn()} onCreate={vi.fn()} />);

    expect(screen.queryByText("Crear documento")).not.toBeInTheDocument();
  });
});
