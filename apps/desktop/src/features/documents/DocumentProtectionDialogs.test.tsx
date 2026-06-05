import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CloseDirtyDocumentDialog,
  DocumentFooterActionDialog,
  RecoverableDraftsDialog,
  getDocumentFooterActionCopy,
} from "./DocumentProtectionDialogs";
import type { OrphanDraft } from "../../types/domain";

describe("DocumentProtectionDialogs", () => {
  afterEach(() => {
    cleanup();
  });

  it("forces an explicit choice before closing a dirty document", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onDiscard = vi.fn();
    const onSave = vi.fn();

    render(
      <CloseDirtyDocumentDialog
        open
        documentName="Notas.md"
        onCancel={onCancel}
        onDiscard={onDiscard}
        onSave={onSave}
      />,
    );

    expect(screen.getByText("Cerrar documento con cambios")).toBeInTheDocument();
    expect(screen.getByText("Notas.md")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("uses clear product copy for footer actions that can discard work", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    expect(getDocumentFooterActionCopy("discard-draft", "Notas.md")).toMatchObject({
      title: "Descartar cambios pendientes",
      confirmLabel: "Descartar cambios",
      danger: true,
    });

    render(
      <DocumentFooterActionDialog
        open
        action="update-remote-discard-draft"
        documentName="Notas.md"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("Actualizar y perder cambios pendientes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Actualizar y descartar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows recoverable drafts, restores available drafts and blocks unavailable restores", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    const onDiscard = vi.fn();
    const drafts: OrphanDraft[] = [
      {
        draftKey: "draft-1",
        documentId: "doc-1",
        projectId: "project-1",
        path: "docs/Notas.md",
        name: "Notas.md",
        wordCount: 42,
        createdAt: "2026-06-04T10:00:00.000Z",
        draftUpdatedAt: "2026-06-04T10:15:00.000Z",
        recoverable: true,
      },
      {
        draftKey: "draft-2",
        documentId: "doc-2",
        projectId: "project-1",
        path: "docs/Borrado.md",
        name: "Borrado.md",
        wordCount: 7,
        createdAt: "2026-06-04T10:00:00.000Z",
        draftUpdatedAt: "2026-06-04T10:20:00.000Z",
        recoverable: false,
        reason: "La carpeta destino ya no existe.",
      },
    ];

    render(
      <RecoverableDraftsDialog
        open
        drafts={drafts}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onRestore={onRestore}
        onDiscard={onDiscard}
      />,
    );

    expect(screen.getByText("Borradores recuperables")).toBeInTheDocument();
    expect(screen.getByText("Notas.md")).toBeInTheDocument();
    expect(screen.getByText("Borrado.md")).toBeInTheDocument();

    const restoreButtons = screen.getAllByRole("button", { name: "Recrear archivo" });
    expect(restoreButtons[1]).toBeDisabled();

    await user.click(restoreButtons[0]);
    await user.click(screen.getAllByRole("button", { name: "Descartar" })[1]);

    expect(onRestore).toHaveBeenCalledWith(drafts[0]);
    expect(onDiscard).toHaveBeenCalledWith("draft-2");
  });
});
