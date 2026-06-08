import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalChangesDrawer } from "./ExternalChangesDrawer";
import type { ExternalChangeSet, Project, ProjectFileSyncOverview, ProjectSyncStatus } from "../../types/domain";

describe("ExternalChangesDrawer", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the main file view ordered by modification date", () => {
    renderDrawer();

    expect(screen.getByText("Guardado y sincronización")).toBeInTheDocument();
    const rows = screen.getAllByRole("article");
    expect(rows.map((row) => within(row).getAllByText(/assets|Notas\.md|SAAS\.md|\.env/)[0].textContent)).toEqual(["assets", "Notas.md", "SAAS.md", ".env"]);
    expect(within(rows[0]).getByText("/Raíz")).toBeInTheDocument();
    expect(screen.queryByText("Ruta")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Local: Todos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Historial local: Todos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GitHub: Todos" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Necesitan atención/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Actividad reciente")).not.toBeInTheDocument();
    expect(screen.queryByText("Detalles técnicos")).not.toBeInTheDocument();
  });

  it("filters files by checked Local, history and GitHub states", async () => {
    const user = userEvent.setup();
    renderDrawer({
      overview: {
        ...overview,
        files: [
          ...overview.files,
          {
            ...overview.files[1],
            id: "conflict",
            path: "conflicto.md",
            name: "conflicto.md",
            modifiedAt: "2026-06-04T12:00:00.000Z",
            localStatus: { state: "ok", label: "Guardado local" },
            historyStatus: { state: "ok", label: "En historial" },
            githubStatus: { state: "conflict", label: "Conflicto" },
          },
        ],
      },
    });

    await user.click(screen.getByRole("button", { name: "Local: Todos" }));
    await user.click(screen.getByRole("checkbox", { name: /Borrador/ }));
    expect(screen.getByText("Notas.md")).toBeInTheDocument();
    expect(screen.queryByText("SAAS.md")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpiar filtros (1)" }));
    await user.click(screen.getByRole("button", { name: "Historial local: Todos" }));
    await user.click(screen.getByRole("checkbox", { name: /^Pendiente/ }));
    expect(screen.getByText("SAAS.md")).toBeInTheDocument();
    expect(screen.queryByText("Notas.md")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpiar filtros (1)" }));
    await user.click(screen.getByRole("button", { name: "GitHub: Todos" }));
    await user.click(screen.getByRole("checkbox", { name: /Esperando historial/ }));
    expect(screen.getByText("Notas.md")).toBeInTheDocument();
    expect(screen.getByText("SAAS.md")).toBeInTheDocument();
    expect(screen.queryByText(".env")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Esperando historial/ }));
    await user.click(screen.getByRole("checkbox", { name: /Conflicto/ }));
    expect(screen.getByText("conflicto.md")).toBeInTheDocument();
    expect(screen.queryByText("Notas.md")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Conflicto/ }));
    await user.click(screen.getByRole("button", { name: "Historial local: Todos" }));
    await user.click(screen.getByRole("checkbox", { name: /Omitido/ }));
    expect(screen.getByText(".env")).toBeInTheDocument();
  });

  it("dispatches row and bulk actions", async () => {
    const user = userEvent.setup();
    const onSaveDocument = vi.fn();
    const onDiscardDocumentDraft = vi.fn();
    const onDecisionChange = vi.fn();
    const onImport = vi.fn();
    const onOmitAll = vi.fn();
    const onOpenDocument = vi.fn();
    const onClose = vi.fn();
    renderDrawer({ onSaveDocument, onDiscardDocumentDraft, onDecisionChange, onImport, onOmitAll, onOpenDocument, onClose });

    await user.click(screen.getByRole("button", { name: "Guardar Notas.md" }));
    await user.click(screen.getByRole("button", { name: "Descartar borrador de Notas.md" }));
    expect(onSaveDocument).toHaveBeenCalledWith("doc-notas");
    expect(onDiscardDocumentDraft).toHaveBeenCalledWith("doc-notas");

    await user.click(screen.getByRole("button", { name: "Abrir Notas.md" }));
    expect(onOpenDocument).toHaveBeenCalledWith("doc-notas", "Notas.md");
    expect(onClose).toHaveBeenCalledTimes(1);

    const saasRow = screen.getByText("SAAS.md").closest("article");
    expect(saasRow).not.toBeNull();
    await user.click(within(saasRow as HTMLElement).getByRole("button", { name: "Omitir SAAS.md" }));
    expect(onDecisionChange).toHaveBeenCalledWith("external-saas", "omit");

    await user.click(screen.getByRole("button", { name: /Guardar seleccionados en historial/ }));
    expect(onImport).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Aceptar omitidos/ }));
    expect(onOmitAll).toHaveBeenCalledTimes(1);
  });

  it("keeps GitHub paused states quiet without remote actions", () => {
    const onPushGithub = vi.fn();
    const onPullGithub = vi.fn();
    renderDrawer({
      syncStatus: pausedSyncStatus,
      overview: {
        ...overview,
        files: overview.files.map((file) => ({
          ...file,
          githubStatus: { state: "waiting", label: "Pausado", detail: "Sin cuenta GitHub." },
        })),
      },
      openDrafts: [],
      onPushGithub,
      onPullGithub,
    });

    expect(screen.getAllByText("Pausado").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Subir a GitHub|Actualizar desde GitHub|Subir|Actualizar/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Comprobar de nuevo/i }));
    expect(onPushGithub).not.toHaveBeenCalled();
    expect(onPullGithub).not.toHaveBeenCalled();
  });
});

function renderDrawer(overrides: Partial<Parameters<typeof ExternalChangesDrawer>[0]> = {}) {
  return render(
    <ExternalChangesDrawer
      open
      project={githubProject}
      overview={overview}
      overviewError={null}
      openDrafts={[{
        documentId: "doc-notas",
        path: "Notas.md",
        name: "Notas.md",
        isDirty: true,
        hasRecoveredDraft: false,
        draftUpdatedAt: "2026-06-04T14:00:00.000Z",
      }]}
      changeSet={changeSet}
      decisions={{}}
      syncStatus={syncStatus}
      syncState="local-pending"
      acknowledged={false}
      busy={false}
      message={null}
      onDecisionChange={vi.fn()}
      onImport={vi.fn()}
      onOmitAll={vi.fn()}
      onPushGithub={vi.fn()}
      onPullGithub={vi.fn()}
      onResolveGithubConflict={vi.fn()}
      onOpenGithubRepository={vi.fn()}
      onOpenDocument={vi.fn()}
      onSaveDocument={vi.fn()}
      onDiscardDocumentDraft={vi.fn()}
      onRefresh={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

const githubProject: Project = {
  id: "project-1",
  name: "Proyecto GitHub",
  folderPath: "C:\\Docs\\Proyecto",
  icon: "docs",
  iconColor: "#F37021",
  storageMode: "local-files",
  versioningMode: "local-git",
  syncMode: "auto-github",
  authRequired: true,
  githubRepository: {
    owner: "knownext",
    repo: "docs",
    rootPath: "",
    permissions: ["contents:write"],
  },
  isGitRepository: true,
};

const overview: ProjectFileSyncOverview = {
  projectId: "project-1",
  generatedAt: "2026-06-04T14:05:00.000Z",
  summary: {
    total: 4,
    attention: 3,
    historyPending: 1,
    githubPending: 2,
    conflicts: 0,
    omitted: 1,
  },
  files: [
    {
      id: "folder-assets",
      projectId: "project-1",
      path: "assets",
      name: "assets",
      kind: "folder",
      modifiedAt: "2026-06-04T15:00:00.000Z",
      sizeBytes: null,
      localStatus: { state: "ok", label: "Guardado local" },
      historyStatus: { state: "ok", label: "En historial" },
      githubStatus: { state: "ok", label: "Sincronizado" },
      change: null,
      conflictId: null,
    },
    {
      id: "doc-notas",
      projectId: "project-1",
      path: "Notas.md",
      name: "Notas.md",
      kind: "document",
      modifiedAt: "2026-06-04T14:00:00.000Z",
      sizeBytes: 100,
      localStatus: { state: "ok", label: "Guardado local" },
      historyStatus: { state: "ok", label: "En historial" },
      githubStatus: { state: "pending", label: "Pendiente" },
      change: null,
      conflictId: null,
    },
    {
      id: "doc-saas",
      projectId: "project-1",
      path: "SAAS.md",
      name: "SAAS.md",
      kind: "document",
      modifiedAt: "2026-06-04T13:00:00.000Z",
      sizeBytes: 120,
      localStatus: { state: "ok", label: "Guardado local" },
      historyStatus: { state: "pending", label: "Pendiente" },
      githubStatus: { state: "waiting", label: "Esperando historial" },
      change: {
        itemId: "external-saas",
        changeType: "modified",
        risk: "safe",
        decision: "include",
      },
      conflictId: null,
    },
    {
      id: "env",
      projectId: "project-1",
      path: ".env",
      name: ".env",
      kind: "private",
      modifiedAt: "2026-06-04T12:00:00.000Z",
      sizeBytes: 20,
      localStatus: { state: "ok", label: "Guardado local" },
      historyStatus: { state: "omitted", label: "Omitido" },
      githubStatus: { state: "unavailable", label: "No conectado" },
      change: {
        itemId: "external-env",
        changeType: "added",
        risk: "blocked",
        decision: "omit",
      },
      conflictId: null,
    },
  ],
};

const changeSet: ExternalChangeSet = {
  id: "changes-1",
  projectId: "project-1",
  title: "Cambios externos detectados",
  source: "git",
  status: "needs-review",
  detectedAt: "2026-06-04T10:00:00.000Z",
  requiresReview: true,
  summary: {
    total: 2,
    safe: 1,
    review: 0,
    blocked: 1,
    added: 1,
    modified: 1,
    deleted: 0,
    folders: 0,
    documents: 1,
    images: 0,
    attachments: 0,
    omitted: 1,
    totalBytes: 140,
  },
  items: [],
};

const syncStatus: ProjectSyncStatus = {
  projectId: "project-1",
  mode: "github-auto",
  state: "local-pending",
  label: "GitHub conectado",
  detail: "Hay cambios locales sin guardar en historial. GitHub esperará.",
  remoteAccess: "available",
  remotePaused: false,
  remoteReason: null,
  remoteAction: null,
  localState: "dirty",
  pendingPush: true,
  pendingPull: false,
  hasConflicts: false,
  lastSyncAt: null,
  lastLocalVersionHash: "abcdef12",
  lastRemoteHash: "12345678",
  conflicts: [],
};

const pausedSyncStatus: ProjectSyncStatus = {
  ...syncStatus,
  state: "local-pending",
  label: "GitHub pausado",
  detail: "Sin cuenta GitHub. Puedes seguir trabajando y guardando historial local.",
  remoteAccess: "unauthenticated",
  remotePaused: true,
  remoteReason: "Sin cuenta GitHub",
  remoteAction: "connect-github",
};
