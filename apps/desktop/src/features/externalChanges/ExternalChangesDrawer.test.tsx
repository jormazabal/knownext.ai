import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalChangesDrawer } from "./ExternalChangesDrawer";
import type { ExternalChangeSet, Project, ProjectSyncStatus } from "../../types/domain";

describe("ExternalChangesDrawer", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows lost GitHub access as a reviewable status without forcing sync actions", () => {
    const onRefresh = vi.fn();
    const onPushGithub = vi.fn();
    const onPullGithub = vi.fn();

    render(
      <ExternalChangesDrawer
        open
        project={githubProject}
        changeSet={emptyChangeSet}
        decisions={{}}
        activityEvents={[]}
        syncStatus={offlineSyncStatus}
        syncState="offline"
        acknowledged={false}
        busy={false}
        onDecisionChange={vi.fn()}
        onImport={vi.fn()}
        onImportSafe={vi.fn()}
        onOmitAll={vi.fn()}
        onPushGithub={onPushGithub}
        onPullGithub={onPullGithub}
        onResolveGithubConflict={vi.fn()}
        onOpenGithubRepository={vi.fn()}
        onRefresh={onRefresh}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Sin conexión")).toBeInTheDocument();
    expect(screen.getByText("No se puede comprobar GitHub")).toBeInTheDocument();
    expect(screen.getByText(/La documentación local no se modifica/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^GitHub/ }));

    expect(screen.getByText("GitHub no responde correctamente")).toBeInTheDocument();
    expect(screen.getByText("Sin acceso a GitHub desde esta instalación.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Subir historial a GitHub|Actualizar desde GitHub|Sincronizar con GitHub/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Comprobar de nuevo|Comprobar protección e historial de nuevo/ })[0]);
    expect(onRefresh).toHaveBeenCalled();
    expect(onPushGithub).not.toHaveBeenCalled();
    expect(onPullGithub).not.toHaveBeenCalled();
  });

  it("keeps pending local history quiet when GitHub access is paused", () => {
    const onPushGithub = vi.fn();
    const onPullGithub = vi.fn();

    render(
      <ExternalChangesDrawer
        open
        project={githubProject}
        changeSet={emptyChangeSet}
        decisions={{}}
        activityEvents={[]}
        syncStatus={pausedPendingSyncStatus}
        syncState="local-pending"
        acknowledged={false}
        busy={false}
        onDecisionChange={vi.fn()}
        onImport={vi.fn()}
        onImportSafe={vi.fn()}
        onOmitAll={vi.fn()}
        onPushGithub={onPushGithub}
        onPullGithub={onPullGithub}
        onResolveGithubConflict={vi.fn()}
        onOpenGithubRepository={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Sin acceso a GitHub").length).toBeGreaterThan(0);
    expect(screen.getByText(/historial local sigue disponible/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Subir historial a GitHub|Actualizar desde GitHub|Sincronizar con GitHub/ })).not.toBeInTheDocument();
    expect(onPushGithub).not.toHaveBeenCalled();
    expect(onPullGithub).not.toHaveBeenCalled();
  });
});

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

const emptyChangeSet: ExternalChangeSet = {
  id: "changes-1",
  projectId: "project-1",
  title: "Sin cambios",
  source: "git",
  status: "none",
  detectedAt: "2026-06-04T10:00:00.000Z",
  requiresReview: false,
  summary: {
    total: 0,
    safe: 0,
    review: 0,
    blocked: 0,
    added: 0,
    modified: 0,
    deleted: 0,
    folders: 0,
    documents: 0,
    images: 0,
    attachments: 0,
    omitted: 0,
    totalBytes: 0,
  },
  items: [],
};

const offlineSyncStatus: ProjectSyncStatus = {
  projectId: "project-1",
  mode: "github-auto",
  state: "offline",
  label: "Sin acceso a GitHub",
  detail: "Sin acceso a GitHub desde esta instalación.",
  remoteAccess: "unauthenticated",
  remotePaused: true,
  remoteReason: "github_auth_required",
  remoteAction: "connect-github",
  localState: "versioned",
  pendingPush: false,
  pendingPull: false,
  hasConflicts: false,
  lastSyncAt: null,
  lastLocalVersionHash: "abcdef123456",
  lastRemoteHash: null,
  conflicts: [],
};

const pausedPendingSyncStatus: ProjectSyncStatus = {
  projectId: "project-1",
  mode: "github-auto",
  state: "local-pending",
  label: "GitHub pausado",
  detail: "Sin cuenta GitHub. Puedes seguir trabajando y guardando historial local.",
  remoteAccess: "unauthenticated",
  remotePaused: true,
  remoteReason: "Sin cuenta GitHub",
  remoteAction: "connect-github",
  localState: "pending-push",
  pendingPush: true,
  pendingPull: false,
  hasConflicts: false,
  lastSyncAt: null,
  lastLocalVersionHash: "abcdef123456",
  lastRemoteHash: null,
  conflicts: [],
};
