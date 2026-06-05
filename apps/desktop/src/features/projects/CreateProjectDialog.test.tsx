import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateProjectDialog } from "./CreateProjectDialog";
import type { Project, ProjectSyncStatus } from "../../types/domain";

const openDialog = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openDialog,
}));

beforeEach(() => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  openDialog.mockReset();
  Reflect.deleteProperty(window, "showDirectoryPicker");
});

const activeProject: Project = {
  id: "project-beta",
  name: "Proyecto Beta",
  folderPath: "C:\\Documentacion\\Proyecto Beta",
  icon: "folder",
  iconColor: "#F37021",
  storageMode: "local-files",
  versioningMode: "none",
  syncMode: "none",
  authRequired: false,
  githubRepository: null,
  isGitRepository: false,
};

describe("CreateProjectDialog", () => {
  it("keeps wizard steps and configuration content in a single modal scroll region", () => {
    render(
      <CreateProjectDialog
        open
        mode="create"
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: /crear proyecto de documentación/i });
    const scrollRegions = Array.from(dialog.querySelectorAll(".overflow-y-auto"));

    expect(scrollRegions).toHaveLength(1);
    expect(scrollRegions[0]).toHaveTextContent("Situación");
    expect(scrollRegions[0]).toHaveTextContent("Qué tipo de proyecto vas a configurar");
    expect(dialog.querySelector("aside")?.className).not.toContain("overflow-y-auto");
  });

  it("opens in edit mode with project data and submits updates", async () => {
    const onUpdate = vi.fn();

    render(
      <CreateProjectDialog
        open
        mode="edit"
        project={activeProject}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByRole("heading", { name: /editar proyecto/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Proyecto Beta")).toBeInTheDocument();
    expect(screen.getByDisplayValue("C:\\Documentacion\\Proyecto Beta")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sincronización" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /configuración del cambio/i })).not.toBeInTheDocument();
    expect(screen.getByText(/^archivos locales$/i)).toBeInTheDocument();
    expect(screen.getByText(/^archivos locales \+ git local$/i)).toBeInTheDocument();
    expect(screen.getByText(/^archivos locales \+ git local \+ github$/i)).toBeInTheDocument();
    expect(screen.getByText(/solo documentos en disco/i)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /sincronización automática/i })).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/nombre del proyecto/i));
    await userEvent.type(screen.getByLabelText(/nombre del proyecto/i), "Proyecto Beta actualizado");
    await userEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(onUpdate).toHaveBeenCalledWith("project-beta", {
      name: "Proyecto Beta actualizado",
      icon: "folder",
      iconColor: "#F37021",
      folderPath: "C:\\Documentacion\\Proyecto Beta",
      creationMode: "open-local",
      storageMode: "local-files",
      versioningMode: "none",
      syncMode: "none",
      githubRepository: null,
      publishToGithub: null,
    });
  });

  it("enables automatic local Git sync for an existing local project", async () => {
    const onUpdate = vi.fn();
    const gitProject: Project = {
      ...activeProject,
      id: "project-git",
      name: "Proyecto Git",
      versioningMode: "local-git",
      syncMode: "manual-local",
      isGitRepository: true,
    };

    render(
      <CreateProjectDialog
        open
        mode="edit"
        project={gitProject}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
      />,
    );

    const automaticSync = screen.getByRole("switch", { name: /sincronización automática/i });
    expect(automaticSync).toBeEnabled();
    expect(automaticSync).toHaveAttribute("aria-checked", "false");

    await userEvent.click(automaticSync);
    expect(automaticSync).toHaveAttribute("aria-checked", "true");

    await userEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(onUpdate).toHaveBeenCalledWith("project-git", expect.objectContaining({
      versioningMode: "local-git",
      syncMode: "auto-local",
      githubRepository: null,
    }));
  });

  it("keeps GitHub project technical configuration read-only while editing identity", async () => {
    const onUpdate = vi.fn();
    const githubProject: Project = {
      ...activeProject,
      id: "project-github",
      name: "Docs GitHub",
      folderPath: "C:\\Users\\Joseba\\AppData\\Roaming\\Knownext\\github-cache\\project-github",
      storageMode: "local-files",
      versioningMode: "local-git",
      syncMode: "manual-github",
      authRequired: true,
      githubRepository: {
        owner: "knownext",
        repo: "docs",
        defaultRef: "main",
        rootPath: "",
        permissions: ["pull", "push"],
      },
    };

    render(
      <CreateProjectDialog
        open
        mode="edit"
        project={githubProject}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByRole("heading", { name: /configuración del cambio/i })).toBeInTheDocument();
    expect(screen.getAllByText(/carpeta local gestionada/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/manual con github/i).length).toBeGreaterThan(0);
    expect(screen.getByText("knownext/docs")).toBeInTheDocument();
    expect(screen.getAllByText(/solo lectura/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("switch", { name: /sincronización automática/i })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: /sincronización automática/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /seleccionar/i })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/nombre del proyecto/i));
    await userEvent.type(screen.getByLabelText(/nombre del proyecto/i), "Docs GitHub editado");
    await userEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(onUpdate).toHaveBeenCalledWith("project-github", {
      name: "Docs GitHub editado",
      icon: "folder",
      iconColor: "#F37021",
      folderPath: "C:\\Users\\Joseba\\AppData\\Roaming\\Knownext\\github-cache\\project-github",
      creationMode: "open-local",
      storageMode: "local-files",
      versioningMode: "local-git",
      syncMode: "manual-github",
      githubRepository: {
        owner: "knownext",
        repo: "docs",
        defaultRef: "main",
        rootPath: "",
        permissions: ["pull", "push"],
      },
      publishToGithub: null,
    });
  });

  it("enables automatic GitHub sync for an existing GitHub project without replacing repository metadata", async () => {
    const onUpdate = vi.fn();
    const githubProject: Project = {
      ...activeProject,
      id: "project-github-auto",
      name: "Docs GitHub",
      storageMode: "local-files",
      versioningMode: "local-git",
      syncMode: "manual-github",
      authRequired: true,
      githubRepository: {
        owner: "knownext",
        repo: "docs",
        defaultRef: "main",
        rootPath: "manual",
        permissions: ["pull", "push"],
      },
    };

    render(
      <CreateProjectDialog
        open
        mode="edit"
        project={githubProject}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
      />,
    );

    const automaticSync = screen.getByRole("switch", { name: /sincronización automática/i });
    expect(automaticSync).toBeEnabled();
    expect(automaticSync).toHaveAttribute("aria-checked", "false");

    await userEvent.click(automaticSync);
    expect(automaticSync).toHaveAttribute("aria-checked", "true");

    await userEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(onUpdate).toHaveBeenCalledWith("project-github-auto", expect.objectContaining({
      versioningMode: "local-git",
      syncMode: "auto-github",
      githubRepository: {
        owner: "knownext",
        repo: "docs",
        defaultRef: "main",
        rootPath: "manual",
        permissions: ["pull", "push"],
      },
    }));
  });

  it("offers GitHub credential recovery when sync credentials are rejected", async () => {
    const onLoginGithub = vi.fn();
    const onLogoutGithub = vi.fn();
    const onVerifyGithubConnection = vi.fn().mockResolvedValue({
      projectId: "project-github",
      mode: "github-manual",
      state: "synced",
      label: "Sincronizado",
      detail: "Conexión verificada con knownext/docs.",
      pendingPush: false,
      pendingPull: false,
      hasConflicts: false,
      conflicts: [],
    } satisfies ProjectSyncStatus);
    const githubProject: Project = {
      ...activeProject,
      id: "project-github",
      name: "Docs GitHub",
      storageMode: "local-files",
      versioningMode: "local-git",
      syncMode: "manual-github",
      authRequired: true,
      githubRepository: {
        owner: "knownext",
        repo: "docs",
        defaultRef: "main",
        rootPath: "",
        permissions: ["pull", "push"],
      },
    };
    const syncStatus: ProjectSyncStatus = {
      projectId: "project-github",
      mode: "github-manual",
      state: "error",
      label: "Error de sincronización",
      detail: "remote: invalid credentials fatal: Authentication failed for 'https://github.com/knownext/docs.git/'",
      pendingPush: false,
      pendingPull: false,
      hasConflicts: false,
      conflicts: [],
    };

    render(
      <CreateProjectDialog
        open
        mode="edit"
        project={githubProject}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        authStatus={{
          isAuthenticated: true,
          provider: "github",
          user: { login: "knownext-user" },
          scopes: ["repo"],
        }}
        projectSyncStatus={syncStatus}
        onLoginGithub={onLoginGithub}
        onLogoutGithub={onLogoutGithub}
        onVerifyGithubConnection={onVerifyGithubConnection}
      />,
    );

    expect(screen.getByText(/github no acepta la conexión actual/i)).toBeInTheDocument();
    expect(screen.getByText(/puedes probar la conexión actual/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /conectar cuenta de github/i }));
    await userEvent.click(screen.getByRole("button", { name: /verificar conexión/i }));
    await userEvent.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    expect(onLoginGithub).toHaveBeenCalledTimes(1);
    expect(onVerifyGithubConnection).toHaveBeenCalledTimes(1);
    expect(onLogoutGithub).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/conexión verificada con knownext\/docs/i)).toBeInTheDocument();
  });

  it("requires explicit confirmations before detaching GitHub and local Git", async () => {
    const onUpdate = vi.fn();
    const githubProject: Project = {
      ...activeProject,
      id: "project-github",
      name: "Docs GitHub",
      storageMode: "local-files",
      versioningMode: "local-git",
      syncMode: "manual-github",
      authRequired: true,
      githubRepository: {
        owner: "knownext",
        repo: "docs",
        defaultRef: "main",
        rootPath: "",
        permissions: ["pull", "push"],
      },
    };

    render(
      <CreateProjectDialog
        open
        mode="edit"
        project={githubProject}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /archivos locales solo documentos en disco/i }));

    expect(screen.getByText(/confirmar desacoplamiento/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/desacoplar github/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/desactivar git local/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar cambios/i })).toBeDisabled();

    await userEvent.click(screen.getByLabelText(/desacoplar github/i));
    expect(screen.getByRole("button", { name: /guardar cambios/i })).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/desactivar git local/i));
    await userEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(onUpdate).toHaveBeenCalledWith("project-github", {
      name: "Docs GitHub",
      icon: "folder",
      iconColor: "#F37021",
      folderPath: "C:\\Documentacion\\Proyecto Beta",
      creationMode: "open-local",
      storageMode: "local-files",
      versioningMode: "none",
      syncMode: "none",
      githubRepository: null,
      publishToGithub: null,
    });
  });

  it("does not invent a local folder path in edit mode", async () => {
    const shortPathProject: Project = {
      ...activeProject,
      folderPath: "SUA",
    };

    render(
      <CreateProjectDialog
        open
        mode="edit"
        project={shortPathProject}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("SUA")).toBeInTheDocument();
  });

  it("asks for confirmation before deleting a project reference", async () => {
    const onDelete = vi.fn();

    render(
      <CreateProjectDialog
        open
        mode="edit"
        project={activeProject}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /eliminar proyecto/i }));

    expect(screen.getByRole("heading", { name: /eliminar proyecto de knownext\.ai/i })).toBeInTheDocument();
    expect(screen.getByText(/los archivos y carpetas del disco no se borr/i)).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: /eliminar proyecto/i })[1]);

    expect(onDelete).toHaveBeenCalledWith("project-beta");
  });

  it("uses the native folder dialog and keeps the full selected path", async () => {
    openDialog.mockResolvedValue("C:\\Dev\\knownext.ai");
    const onUpdate = vi.fn();

    render(
      <CreateProjectDialog
        open
        mode="edit"
        project={activeProject}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /seleccionar/i }));
    expect(openDialog).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: "Seleccionar carpeta del proyecto",
      defaultPath: "C:\\Documentacion\\Proyecto Beta",
    });
    expect(screen.getByDisplayValue("C:\\Dev\\knownext.ai")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));
    expect(onUpdate).toHaveBeenCalledWith("project-beta", expect.objectContaining({
      folderPath: "C:\\Dev\\knownext.ai",
    }));
  });

  it("allows typing a new folder path when creating a project from zero", async () => {
    const onCreate = vi.fn();

    render(
      <CreateProjectDialog
        open
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    );

    await userEvent.click(screen.getByRole("tab", { name: /carpeta local nueva/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByRole("button", { name: /siguiente/i })).toBeDisabled();
    expect(screen.getByText(/path final/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/selecciona la ubicación/i), "C:\\Docs");
    expect(screen.getByRole("button", { name: /siguiente/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/nombre de la carpeta a crear/i), "Nuevo proyecto");
    expect(screen.getByText("C:\\Docs\\Nuevo proyecto")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByRole("heading", { name: /revisa la configuración/i })).toBeInTheDocument();
    expect(screen.queryByText(/vista previa/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /crear proyecto/i }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      creationMode: "new-local",
      folderPath: "C:\\Docs\\Nuevo proyecto",
      storageMode: "local-files",
      versioningMode: "none",
      syncMode: "none",
    }));
  });

  it("uses fixed local runtime storage for browser-oriented creation", async () => {
    const onCreate = vi.fn();

    render(
      <CreateProjectDialog
        open
        runtimeMode="web"
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    );

    expect(screen.getByRole("tab", { name: /proyecto web nuevo/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /carpeta local existente/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getAllByText(/almacenamiento local gestionado/i).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/^carpeta local/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /siguiente/i })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await userEvent.click(screen.getByRole("button", { name: /crear proyecto/i }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      folderPath: "",
      creationMode: "new-local",
    }));
  });

  it("keeps the project folder read-only in browser edit mode", async () => {
    const onUpdate = vi.fn();
    const showDirectoryPicker = vi.fn().mockResolvedValue({ name: "knownext.ai" });
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: showDirectoryPicker,
    });

    render(
      <CreateProjectDialog
        open
        runtimeMode="web"
        mode="edit"
        project={activeProject}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.queryByRole("button", { name: /seleccionar/i })).not.toBeInTheDocument();
    expect(showDirectoryPicker).not.toHaveBeenCalled();
    expect(screen.queryByText("C:\\Documentacion\\Proyecto Beta")).not.toBeInTheDocument();
    expect(screen.queryByText(/sandbox del runtime local/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/carpeta de trabajo/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sincronización" })).toBeInTheDocument();
    expect(screen.getByText(/^archivos locales$/i)).toBeInTheDocument();
  });

  it("does not fall back to HTTP transport when the native folder dialog is unavailable", async () => {
    const onUpdate = vi.fn();
    const fetchFolderPath = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ folderPath: "C:\\Dev\\knownext.ai" }),
    });
    const showDirectoryPicker = vi.fn();
    openDialog.mockRejectedValue(new Error("Tauri dialog unavailable"));
    vi.stubGlobal("fetch", fetchFolderPath);
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: showDirectoryPicker,
    });

    render(
      <CreateProjectDialog
        open
        mode="edit"
        project={activeProject}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /seleccionar/i }));

    expect(fetchFolderPath).not.toHaveBeenCalled();
    expect(showDirectoryPicker).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("C:\\Documentacion\\Proyecto Beta")).toBeInTheDocument();
  });

  it("enables GitHub repository projects when authenticated and submits selected repository metadata", async () => {
    const onCreate = vi.fn();

    render(
      <CreateProjectDialog
        open
        onClose={vi.fn()}
        onCreate={onCreate}
        authStatus={{
          isAuthenticated: true,
          provider: "github",
          user: { login: "knownext-user" },
          scopes: ["repo"],
        }}
        capabilities={{
          canCreateLocalProject: true,
          canOpenLocalFolder: true,
          canUseLocalGit: true,
          canConnectGithub: true,
          canUseGithubApi: true,
          requiresGithubLoginForVersioning: true,
        }}
        githubRepositories={[
          {
            owner: "knownext",
            repo: "docs",
            fullName: "knownext/docs",
            private: true,
            defaultRef: "main",
            rootPath: "",
            permissions: ["pull", "push"],
          },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole("tab", { name: /repo github existente/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await userEvent.selectOptions(screen.getByLabelText(/repositorio github/i), "knownext/docs");
    await userEvent.type(screen.getByLabelText(/carpeta local destino/i), "C:\\Docs\\knownext-docs");
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await userEvent.click(screen.getByRole("button", { name: /crear proyecto/i }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: "docs",
      folderPath: "C:\\Docs\\knownext-docs",
      storageMode: "local-files",
      versioningMode: "local-git",
      syncMode: "manual-github",
      githubRepository: expect.objectContaining({
        owner: "knownext",
        repo: "docs",
        defaultRef: "main",
        permissions: ["pull", "push"],
      }),
    }));
  });

  it("orders project start options from local creation to GitHub import", () => {
    render(
      <CreateProjectDialog
        open
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    const options = screen.getAllByRole("tab");
    expect(options[0]).toHaveTextContent(/carpeta local nueva/i);
    expect(options[1]).toHaveTextContent(/carpeta local existente/i);
    expect(options[2]).toHaveTextContent(/carpeta con git\/github/i);
    expect(options[3]).toHaveTextContent(/repo github existente/i);
  });

  it("explains why publishing a local folder to a new GitHub repo requires GitHub", async () => {
    render(
      <CreateProjectDialog
        open
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    openDialog.mockResolvedValue("C:\\Docs\\existing-docs");
    await userEvent.click(screen.getByRole("button", { name: /seleccionar/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));

    expect(screen.getByRole("button", { name: /archivos locales \+ git local \+ github/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /archivos locales \+ git local \+ github/i })).toHaveAttribute("title", expect.stringMatching(/conecta github/i));
  });

  it("configures publishing a local folder into a new GitHub repository", async () => {
    const onCreate = vi.fn();

    render(
      <CreateProjectDialog
        open
        onClose={vi.fn()}
        onCreate={onCreate}
        authStatus={{
          isAuthenticated: true,
          provider: "github",
          user: { login: "knownext-user" },
          scopes: ["repo"],
        }}
        capabilities={{
          canCreateLocalProject: true,
          canOpenLocalFolder: true,
          canUseLocalGit: true,
          canConnectGithub: true,
          canUseGithubApi: true,
          requiresGithubLoginForVersioning: true,
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    openDialog.mockResolvedValue("C:\\Docs\\publish-docs");
    await userEvent.click(screen.getByRole("button", { name: /seleccionar/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await userEvent.click(screen.getByRole("button", { name: /archivos locales \+ git local \+ github/i }));

    expect(screen.getByLabelText(/propietario github/i)).toHaveValue("knownext-user");
    await userEvent.clear(screen.getByLabelText(/nombre del nuevo repo/i));
    await userEvent.type(screen.getByLabelText(/nombre del nuevo repo/i), "docs-publicados");
    await userEvent.click(screen.getByRole("tab", { name: /público/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));

    expect(screen.getByRole("heading", { name: /revisa la configuración/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sincronización" })).toBeInTheDocument();
    expect(screen.getByText(/^archivos locales \+ git local \+ github$/i)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /sincronización automática/i })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/sincronización manual con el repositorio/i)).toBeInTheDocument();
    expect(screen.queryByText(/^modo de trabajo$/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /crear proyecto/i }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      folderPath: "C:\\Docs\\publish-docs",
      creationMode: "open-local",
      storageMode: "local-files",
      versioningMode: "local-git",
      syncMode: "manual-github",
      githubRepository: expect.objectContaining({
        owner: "knownext-user",
        repo: "docs-publicados",
        permissions: ["pull", "push"],
      }),
      publishToGithub: expect.objectContaining({
        visibility: "public",
      }),
    }));
  });

  it("registers an existing local Git folder with an associated GitHub remote", async () => {
    const onCreate = vi.fn();

    render(
      <CreateProjectDialog
        open
        onClose={vi.fn()}
        onCreate={onCreate}
        authStatus={{
          isAuthenticated: true,
          provider: "github",
          user: { login: "knownext-user" },
          scopes: ["repo"],
        }}
        capabilities={{
          canCreateLocalProject: true,
          canOpenLocalFolder: true,
          canUseLocalGit: true,
          canConnectGithub: true,
          canUseGithubApi: true,
          requiresGithubLoginForVersioning: true,
        }}
        githubRepositories={[
          {
            owner: "knownext",
            repo: "docs",
            fullName: "knownext/docs",
            private: false,
            defaultRef: "main",
            rootPath: "",
            permissions: ["pull", "push"],
          },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole("tab", { name: /carpeta con git\/github/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    openDialog.mockResolvedValue("C:\\Docs\\existing-docs");

    await userEvent.click(screen.getByRole("button", { name: /seleccionar/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await userEvent.click(screen.getByRole("button", { name: /archivos locales \+ git local \+ github/i }));
    await userEvent.selectOptions(screen.getByLabelText(/repositorio github/i), "knownext/docs");
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await userEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await userEvent.click(screen.getByRole("button", { name: /crear proyecto/i }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      folderPath: "C:\\Docs\\existing-docs",
      creationMode: "open-local",
      storageMode: "local-files",
      versioningMode: "local-git",
      syncMode: "manual-github",
      githubRepository: expect.objectContaining({
        owner: "knownext",
        repo: "docs",
      }),
    }));
  });
});
