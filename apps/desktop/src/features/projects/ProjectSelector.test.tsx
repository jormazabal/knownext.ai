import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectSelector } from "./ProjectSelector";

const projects = [
  {
    id: "project-alpha",
    name: "Proyecto Alpha",
    folderPath: "C:\\Documentacion\\Proyecto Alpha",
    icon: "book",
    iconColor: "#F37021",
    isGitRepository: true,
    active: true,
  },
  {
    id: "project-beta",
    name: "Proyecto Beta",
    folderPath: "C:\\Documentacion\\Proyecto Beta",
    icon: "folder",
    iconColor: "#7C3AED",
    isGitRepository: false,
  },
  {
    id: "project-gamma",
    name: "Proyecto Gamma",
    folderPath: "C:\\Documentacion\\Proyecto Gamma",
    icon: "folder",
    iconColor: "#059669",
    isGitRepository: true,
  },
];

describe("ProjectSelector", () => {
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
