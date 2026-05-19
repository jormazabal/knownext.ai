import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentStatusBar } from "./DocumentStatusBar";

const defaultProps = {
  isDirty: false,
  saveState: "idle" as const,
  gitEnabled: false,
  wordCount: 154,
  canSave: true,
  documentSyncStatus: null,
  isSyncing: false,
  onSave: vi.fn(),
  onSynchronize: vi.fn(),
  onUpdateFromRemote: vi.fn(),
  onDiscardPendingChanges: vi.fn(),
};

afterEach(() => cleanup());

describe("DocumentStatusBar", () => {
  it("hides the save button when the active document has no pending changes", () => {
    render(<DocumentStatusBar {...defaultProps} />);

    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("shows save and discard actions when the active document has pending changes", () => {
    render(<DocumentStatusBar {...defaultProps} isDirty saveState="idle" />);

    expect(screen.getByText("Cambios pendientes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deshacer cambios/i })).toBeInTheDocument();
  });

  it("keeps document type and word count before the decision state", () => {
    const { container } = render(<DocumentStatusBar {...defaultProps} />);
    const footer = container.querySelector("footer");
    const groups = footer ? Array.from(footer.children) : [];

    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent("Markdown");
    expect(groups[0]).toHaveTextContent("154 palabras");
    expect(groups[0]).not.toHaveTextContent("1240 caracteres");
    expect(groups[1]).toHaveTextContent("OK · Guardado");
    expect(groups[1]).not.toHaveTextContent("Sin historial");
    expect(groups[1]).not.toHaveTextContent("Última versión:");
  });

  it("shows a compact OK state when versioning is enabled", () => {
    render(<DocumentStatusBar {...defaultProps} gitEnabled />);

    expect(screen.getByText("OK · Última versión")).toBeInTheDocument();
    expect(screen.queryByText(/cc79/i)).not.toBeInTheDocument();
  });

  it("shows the synchronize action after saved manual Git changes", () => {
    render(
      <DocumentStatusBar
        {...defaultProps}
        gitEnabled
        documentSyncStatus={{
          documentId: "doc-1",
          exists: true,
          diskChanged: false,
          hasDraft: false,
          orphaned: false,
          conflictStatus: "none",
          versionState: "local-ahead",
          localChanged: true,
          remoteChanged: false,
        }}
      />,
    );

    expect(screen.getByText("Pendiente de sincronizar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sincronizar" })).toBeInTheDocument();
  });

  it("shows a red update action when a newer remote version is available", () => {
    render(
      <DocumentStatusBar
        {...defaultProps}
        gitEnabled
        documentSyncStatus={{
          documentId: "doc-1",
          exists: true,
          diskChanged: false,
          hasDraft: false,
          orphaned: false,
          conflictStatus: "none",
          versionState: "remote-ahead",
          localChanged: false,
          remoteChanged: true,
        }}
      />,
    );

    expect(screen.getByText("Versión desactualizada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sincronizar" })).not.toBeInTheDocument();
  });

  it("shows save and update when a draft coexists with a newer remote version", () => {
    render(
      <DocumentStatusBar
        {...defaultProps}
        isDirty
        gitEnabled
        documentSyncStatus={{
          documentId: "doc-1",
          exists: true,
          diskChanged: false,
          hasDraft: true,
          orphaned: false,
          conflictStatus: "draft",
          versionState: "remote-ahead",
          localChanged: false,
          remoteChanged: true,
        }}
      />,
    );

    expect(screen.getByText("Cambios pendientes · versión posterior disponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeInTheDocument();
  });
});
