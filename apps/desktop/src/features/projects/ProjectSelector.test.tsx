import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectSelector } from "./ProjectSelector";
import type { Project } from "../../types/domain";

const projects: Project[] = [
  {
    id: "project-alpha",
    name: "Proyecto Alpha",
    folderPath: "C:\\Documentacion\\Proyecto Alpha",
    icon: "book",
    iconColor: "#F37021",
    storageMode: "local-files",
    versioningMode: "local-git",
    syncMode: "none",
    authRequired: true,
    githubRepository: null,
    isGitRepository: true,
    active: true,
  },
  {
    id: "project-beta",
    name: "Proyecto Beta",
    folderPath: "C:\\Documentacion\\Proyecto Beta",
    icon: "folder",
    iconColor: "#7C3AED",
    storageMode: "local-files",
    versioningMode: "none",
    syncMode: "none",
    authRequired: false,
    githubRepository: null,
    isGitRepository: false,
  },
  {
    id: "project-gamma",
    name: "Proyecto Gamma",
    folderPath: "C:\\Documentacion\\Proyecto Gamma",
    icon: "folder",
    iconColor: "#059669",
    storageMode: "local-files",
    versioningMode: "local-git",
    syncMode: "manual-github",
    authRequired: true,
    githubRepository: null,
    isGitRepository: true,
  },
];

describe("ProjectSelector", () => {
  it("shows a first-project action instead of a dropdown when there are no projects", async () => {
    const onCreateProject = vi.fn();

    render(<ProjectSelector projects={[]} activeProject={null} onSelectProject={vi.fn()} onCreateProject={onCreateProject} />);

    expect(screen.queryByText("PROYECTO ACTUAL")).not.toBeInTheDocument();
    expect(screen.getByText(/crea tu primer proyecto para empezar/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /añadir primer proyecto/i }));

    expect(onCreateProject).toHaveBeenCalledTimes(1);
  });

  it("shows the project dropdown with the create option inside it", async () => {
    render(<ProjectSelector projects={projects} activeProject={projects[0]} onSelectProject={vi.fn()} onCreateProject={vi.fn()} />);

    expect(screen.getByText("Proyecto Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Proyecto Beta")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /proyecto alpha/i }).querySelector(".lucide-book-open")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /proyecto alpha/i }));

    expect(screen.getAllByText("Proyecto Alpha").length).toBeGreaterThan(1);
    expect(screen.getByText("Proyecto Beta")).toBeInTheDocument();
    expect(screen.getByText("Nuevo proyecto")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: /proyecto alpha/i })[0]);
    expect(screen.queryByText("Proyecto Beta")).not.toBeInTheDocument();
  });
});
