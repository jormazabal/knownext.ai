import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentStatusBar } from "./DocumentStatusBar";

const defaultProps = {
  isDirty: false,
  saveState: "idle" as const,
  statusLabel: "Sin cambios",
  statusTone: "success" as const,
  versioningLabel: "Sin historial",
  gitEnabled: false,
  wordCount: 154,
  canSave: true,
  onSave: vi.fn(),
};

afterEach(() => cleanup());

describe("DocumentStatusBar", () => {
  it("hides the save button when the active document has no pending changes", () => {
    render(<DocumentStatusBar {...defaultProps} />);

    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("shows the save button when the active document has pending changes", () => {
    render(<DocumentStatusBar {...defaultProps} isDirty saveState="idle" />);

    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("keeps document metrics before status and history information", () => {
    const { container } = render(<DocumentStatusBar {...defaultProps} />);
    const footer = container.querySelector("footer");
    const groups = footer ? Array.from(footer.children) : [];

    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent("154 palabras");
    expect(groups[0]).toHaveTextContent("Línea 1, Columna 1");
    expect(groups[0]).toHaveTextContent("Markdown");
    expect(groups[1]).toHaveTextContent("Sin cambios");
    expect(groups[1]).toHaveTextContent("Sin historial");
    expect(groups[1]).toHaveTextContent("Historial no disponible");
  });
});
