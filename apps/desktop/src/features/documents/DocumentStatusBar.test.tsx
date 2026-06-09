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

    expect(screen.queryByText("Cambios sin guardar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deshacer cambios/i })).toBeInTheDocument();
  });

  it("shows a simple save hint when pending changes came from opening the document", () => {
    const hint = "El documento se abrió con cambios recuperados o ajustes de formato. Guarda para aplicarlos o deshaz para mantener la versión anterior.";

    render(<DocumentStatusBar {...defaultProps} isDirty saveState="idle" pendingSaveHint={hint} />);

    expect(screen.getByRole("img", { name: hint })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
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

  it("shows syncing instead of the synchronize action while a saved version is being written locally", () => {
    render(
      <DocumentStatusBar
        {...defaultProps}
        gitEnabled
        postSaveSyncState="syncing-local"
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

    expect(screen.getByText("Sincronizando")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sincronizar" })).not.toBeInTheDocument();
  });

  it("keeps syncing visible while an automatic GitHub push is running", () => {
    render(
      <DocumentStatusBar
        {...defaultProps}
        gitEnabled
        postSaveSyncState="syncing-remote"
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

    expect(screen.getByText("Sincronizando")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sincronizar" })).not.toBeInTheDocument();
  });

  it("shows the synchronize action only after a post-save synchronization error", () => {
    render(
      <DocumentStatusBar
        {...defaultProps}
        gitEnabled
        postSaveSyncState="error"
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

    expect(screen.getByText("No se pudo sincronizar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sincronizar" })).toBeInTheDocument();
  });

  it("hides synchronization while the active document has unsaved changes", () => {
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
          versionState: "local-ahead",
          localChanged: true,
          remoteChanged: false,
        }}
      />,
    );

    expect(screen.queryByText("Cambios sin guardar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deshacer cambios/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sincronizar" })).not.toBeInTheDocument();
  });

  it("keeps saved local changes quiet when GitHub access is paused", () => {
    render(
      <DocumentStatusBar
        {...defaultProps}
        gitEnabled
        remoteAccess="unauthenticated"
        remotePaused
        remoteReason="Sin cuenta GitHub"
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

    expect(screen.getByText("Guardado local · Sin acceso a GitHub")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sincronizar" })).not.toBeInTheDocument();
  });

  it("shows a review action when a newer remote version is available", () => {
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

    expect(screen.getByText("Versión disponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revisar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sincronizar" })).not.toBeInTheDocument();
  });

  it("shows a review action when local and remote versions diverged", () => {
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
          versionState: "diverged",
          localChanged: true,
          remoteChanged: true,
        }}
      />,
    );

    expect(screen.getByText("Conflicto de versiones")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revisar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sincronizar" })).not.toBeInTheDocument();
  });

  it("keeps remote review hidden while a draft coexists with a newer remote version", () => {
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

    expect(screen.queryByText("Cambios sin guardar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deshacer cambios/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revisar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sincronizar" })).not.toBeInTheDocument();
  });
});
