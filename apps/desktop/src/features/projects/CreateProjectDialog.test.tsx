import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateProjectDialog } from "./CreateProjectDialog";
import type { Project } from "../../types/domain";

const openDialog = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openDialog,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

    expect(screen.getByRole("heading", { name: /editar proyecto de documentación/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Proyecto Beta")).toBeInTheDocument();
    expect(screen.getByDisplayValue("C:\\Documentacion\\Proyecto Beta")).toBeInTheDocument();

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
    expect(screen.getByText(/los archivos y carpetas del disco no se borrarán ni se modificarán/i)).toBeInTheDocument();

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

    await userEvent.click(screen.getByRole("button", { name: /crear desde 0/i }));
    await userEvent.type(screen.getByLabelText(/carpeta local/i), "C:\\Docs\\Nuevo proyecto");
    await userEvent.click(screen.getByRole("button", { name: /crear proyecto/i }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      creationMode: "new-local",
      folderPath: "C:\\Docs\\Nuevo proyecto",
      storageMode: "local-files",
      versioningMode: "none",
      syncMode: "none",
    }));
  });

  it("falls back to the browser system folder picker outside Tauri", async () => {
    const onUpdate = vi.fn();
    openDialog.mockRejectedValue(new Error("Tauri dialog unavailable"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Runtime API unavailable")));
    const showDirectoryPicker = vi.fn().mockResolvedValue({ name: "knownext.ai" });
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

    expect(showDirectoryPicker).toHaveBeenCalled();
    expect(screen.getByDisplayValue("knownext.ai")).toBeInTheDocument();
  });

  it("uses the local runtime API outside Tauri to keep the full selected path", async () => {
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

    expect(fetchFolderPath).toHaveBeenCalledWith("http://127.0.0.1:8765/api/runtime/select-folder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ currentPath: "C:\\Documentacion\\Proyecto Beta" }),
    });
    expect(showDirectoryPicker).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("C:\\Dev\\knownext.ai")).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole("button", { name: /repo github/i }));
    await userEvent.selectOptions(screen.getByLabelText(/repositorio github/i), "knownext/docs");
    await userEvent.click(screen.getByRole("button", { name: /crear proyecto/i }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: "docs",
      storageMode: "local-cache",
      versioningMode: "github-api",
      syncMode: "manual-github",
      githubRepository: expect.objectContaining({
        owner: "knownext",
        repo: "docs",
        defaultRef: "main",
        permissions: ["pull", "push"],
      }),
    }));
  });
});
