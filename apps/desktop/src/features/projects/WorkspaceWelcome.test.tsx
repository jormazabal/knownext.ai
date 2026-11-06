import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceWelcome } from "./WorkspaceWelcome";

afterEach(cleanup);
it("offers the same local-first tasks in English",async()=>{
 const create=vi.fn(),notes=vi.fn();render(<WorkspaceWelcome language="en" onCreateProject={create} onUseNotes={notes}/>);
 expect(screen.getByText(/without a connection or an account/)).toBeVisible();
 await userEvent.click(screen.getByRole("button",{name:"Use personal notes"}));expect(notes).toHaveBeenCalledOnce();expect(create).not.toHaveBeenCalled();
});
it("offers a local project and personal notes without requiring an account", async () => {
  const project = vi.fn(), notes = vi.fn();
  render(<WorkspaceWelcome onCreateProject={project} onUseNotes={notes}/>);
  expect(screen.getByText(/sin conexión ni cuenta/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Crear o abrir un proyecto" }));
  await userEvent.click(screen.getByRole("button", { name: "Usar notas personales" }));
  expect(project).toHaveBeenCalledOnce();
  expect(notes).toHaveBeenCalledOnce();
});
