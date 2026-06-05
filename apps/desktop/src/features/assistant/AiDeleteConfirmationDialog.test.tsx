import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiDeleteConfirmationDialog } from "./AiDeleteConfirmationDialog";

describe("AiDeleteConfirmationDialog", () => {
  afterEach(() => cleanup());

  it("requires explicit confirmation before deleting AI-selected project nodes", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <AiDeleteConfirmationDialog
        pendingDelete={{
          confirmationId: "delete-1",
          nodeIds: ["doc-1", "doc-2"],
          paths: ["docs/old.md", "docs/archive.md"],
          documentCount: 2,
        }}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("La IA quiere eliminar elementos")).toBeInTheDocument();
    expect(screen.getByText("docs/old.md")).toBeInTheDocument();
    expect(screen.getByText("docs/archive.md")).toBeInTheDocument();
    expect(screen.getByText("Se verán afectados 2 documentos.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
