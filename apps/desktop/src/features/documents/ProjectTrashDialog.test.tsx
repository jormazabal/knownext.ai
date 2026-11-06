import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach,beforeEach, expect, it, vi } from "vitest";
import { ProjectTrashDialog } from "./ProjectTrashDialog";
import {ApiError} from "../../lib/api/client";
import { getProjectTrash, reviewProjectTrash, restoreProjectTrash,reviewTrashRestoreAttempt,createTrashRestoreAttemptId } from "../../lib/api/trash";
vi.mock("../../lib/api/trash", () => ({ getProjectTrash: vi.fn(), reviewProjectTrash: vi.fn(), restoreProjectTrash: vi.fn(),reviewTrashRestoreAttempt:vi.fn(),createTrashRestoreAttemptId:vi.fn() }));
const attemptId="attempt-"+"1".repeat(32);
const entry={ id:"trash-test",projectId:"p",originalPath:"docs/a.md",deletedAt:"2026-10-30T10:00:00Z",directory:false,status:"stored" as const };
const reviewed={entry,revision:"a".repeat(64),payloadFingerprint:"b".repeat(64),locationRevision:"c".repeat(64)};
afterEach(() => { cleanup(); vi.resetAllMocks(); });
beforeEach(()=>{vi.mocked(createTrashRestoreAttemptId).mockReturnValue(attemptId);vi.mocked(reviewTrashRestoreAttempt).mockResolvedValue({attemptId,entryId:entry.id,status:"absent"});});
it("preserves a recovery entry and displays the error when the destination collides", async () => {
  vi.mocked(getProjectTrash).mockResolvedValue({ entries: [{ id: "trash-test", projectId: "p", originalPath: "docs/a.md", deletedAt: "2026-10-30T10:00:00Z", directory: false, status: "stored" }], warnings: [] });
  vi.mocked(restoreProjectTrash).mockRejectedValue(new Error("Ya existe el destino"));
  vi.mocked(reviewProjectTrash).mockResolvedValue(reviewed);
  const restored = vi.fn();
  render(<ProjectTrashDialog projectId="p" projectName="Project" onRestored={restored} onClose={vi.fn()}/>);
  await screen.findByRole("button", { name: "Revisar docs/a.md" });
  expect(restoreProjectTrash).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Revisar docs/a.md" }));
  await screen.findByRole("button", { name: "Restaurar docs/a.md" });
  fireEvent.click(screen.getByRole("button", { name: "Restaurar docs/a.md" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Ya existe el destino"));
  expect(restored).not.toHaveBeenCalled();
  expect(screen.getAllByText("docs/a.md").length).toBeGreaterThan(0);
  expect(screen.getByRole("button",{name:"Revisar docs/a.md"})).toBeDisabled();
  expect(restoreProjectTrash).toHaveBeenCalledWith("p","trash-test","a".repeat(64),attemptId);
});

it("keeps an uncertain restore blocked until a successful refresh and a new review",async()=>{
  vi.mocked(getProjectTrash).mockResolvedValue({entries:[entry],warnings:[],limited:true});
  vi.mocked(reviewProjectTrash).mockResolvedValue(reviewed);
  vi.mocked(restoreProjectTrash).mockRejectedValue(new Error("Acuse no recibido"));
  render(<ProjectTrashDialog projectId="p" projectName="Proyecto" onRestored={vi.fn()} onClose={vi.fn()}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Revisar docs/a.md"}));
  fireEvent.click(await screen.findByRole("button",{name:"Restaurar docs/a.md"}));
  await screen.findByText(/Acuse no recibido/);
  expect(screen.getByRole("button",{name:"Revisar docs/a.md"})).toBeDisabled();
  vi.mocked(getProjectTrash).mockRejectedValueOnce(new Error("Inventario no disponible"));
  fireEvent.click(screen.getByRole("button",{name:"Actualizar"}));
  await screen.findByText("Inventario no disponible");
  expect(screen.getByRole("button",{name:"Revisar docs/a.md"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Actualizar"}));
  await waitFor(()=>expect(screen.getByRole("button",{name:"Revisar docs/a.md"})).toBeEnabled());
  expect(screen.queryByRole("button",{name:"Restaurar docs/a.md"})).not.toBeInTheDocument();
  expect(restoreProjectTrash).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Inventario parcial/)).toBeInTheDocument();
});

it("does not authorize a mismatched review or call an uncertain result restored",async()=>{
  vi.mocked(getProjectTrash).mockResolvedValue({entries:[entry],warnings:[]});
  vi.mocked(reviewProjectTrash).mockResolvedValue({...reviewed,entry:{...entry,id:"trash-other"}});
  const restored=vi.fn();
  render(<ProjectTrashDialog projectId="p" projectName="Proyecto" onRestored={restored} onClose={vi.fn()}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Revisar docs/a.md"}));
  await screen.findByText(/no corresponde/);
  expect(screen.queryByRole("button",{name:"Restaurar docs/a.md"})).not.toBeInTheDocument();
  expect(restoreProjectTrash).not.toHaveBeenCalled();expect(restored).not.toHaveBeenCalled();
});

it("keeps a confirmed restore confirmed if refreshing the workspace callback fails",async()=>{
  vi.mocked(getProjectTrash).mockResolvedValue({entries:[entry],warnings:[]});
  vi.mocked(reviewProjectTrash).mockResolvedValue(reviewed);
  vi.mocked(restoreProjectTrash).mockResolvedValue({tree:[],affectedDocuments:[],restoreAttemptId:attemptId,restoredRevision:reviewed.revision});
  render(<ProjectTrashDialog projectId="p" projectName="Proyecto" onRestored={()=>{throw new Error("view failed");}} onClose={vi.fn()}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Revisar docs/a.md"}));
  fireEvent.click(await screen.findByRole("button",{name:"Restaurar docs/a.md"}));
  await screen.findByText(/Elemento restaurado; no se pudo actualizar la vista/);
  expect(restoreProjectTrash).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button",{name:"Revisar docs/a.md"})).not.toBeInTheDocument();
});

it("checks one durable receipt after a lost ack and only explicitly consults it again",async()=>{
  vi.mocked(getProjectTrash).mockResolvedValue({entries:[entry],warnings:[]});vi.mocked(reviewProjectTrash).mockResolvedValue(reviewed);
  vi.mocked(restoreProjectTrash).mockRejectedValue(new Error("Acuse perdido"));
  vi.mocked(reviewTrashRestoreAttempt).mockResolvedValueOnce({attemptId,entryId:entry.id,status:"pending",canReplay:false}).mockResolvedValue({attemptId,entryId:entry.id,status:"confirmed",reviewedRevision:reviewed.revision,canReplay:false,result:{tree:[],affectedDocuments:[]}});
  const restored=vi.fn();render(<ProjectTrashDialog projectId="p" projectName="Proyecto" onRestored={restored} onClose={vi.fn()}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Revisar docs/a.md"}));fireEvent.click(await screen.findByRole("button",{name:"Restaurar docs/a.md"}));
  await screen.findByText(/Acuse perdido/);expect(restored).not.toHaveBeenCalled();expect(restoreProjectTrash).toHaveBeenCalledTimes(1);expect(reviewTrashRestoreAttempt).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("Intentos de restauración (1)"));fireEvent.click(screen.getByRole("button",{name:"Consultar intento 1 de docs/a.md"}));
  await screen.findByText("Elemento restaurado. El resto de copias se conserva.");expect(restored).toHaveBeenCalledTimes(1);expect(restoreProjectTrash).toHaveBeenCalledTimes(1);expect(reviewTrashRestoreAttempt).toHaveBeenCalledTimes(2);
});

it("recovers a receipt from the catalogue without the old UI request and applies view effects once",async()=>{
  vi.mocked(getProjectTrash).mockResolvedValue({entries:[],warnings:[],restorations:[{id:attemptId,entryId:entry.id,originalPath:entry.originalPath,createdAt:entry.deletedAt,phase:"applying"}]});
  vi.mocked(reviewTrashRestoreAttempt).mockResolvedValue({attemptId,entryId:entry.id,status:"confirmed",reviewedRevision:reviewed.revision,canReplay:false,result:{tree:[],affectedDocuments:[]}});
  const restored=vi.fn();render(<ProjectTrashDialog projectId="p" projectName="Proyecto" onRestored={restored} onClose={vi.fn()}/>);
  fireEvent.click(await screen.findByText("Intentos de restauración (1)"));const consult=screen.getByRole("button",{name:"Consultar intento 1 de docs/a.md"});fireEvent.click(consult);
  await screen.findByText("Elemento restaurado. El resto de copias se conserva.");await waitFor(()=>expect(consult).toBeEnabled());fireEvent.click(consult);
  await waitFor(()=>expect(reviewTrashRestoreAttempt).toHaveBeenCalledTimes(2));expect(restored).toHaveBeenCalledTimes(1);expect(restoreProjectTrash).not.toHaveBeenCalled();
});

it("refuses a confirmed proof belonging to another attempt",async()=>{
  vi.mocked(getProjectTrash).mockResolvedValue({entries:[entry],warnings:[]});vi.mocked(reviewProjectTrash).mockResolvedValue(reviewed);
  vi.mocked(restoreProjectTrash).mockRejectedValue(new Error("Acuse perdido"));vi.mocked(reviewTrashRestoreAttempt).mockResolvedValue({attemptId:"attempt-"+"2".repeat(32),entryId:entry.id,status:"confirmed",reviewedRevision:reviewed.revision,canReplay:false,result:{tree:[],affectedDocuments:[]}});
  const restored=vi.fn();render(<ProjectTrashDialog projectId="p" projectName="Proyecto" onRestored={restored} onClose={vi.fn()}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Revisar docs/a.md"}));fireEvent.click(await screen.findByRole("button",{name:"Restaurar docs/a.md"}));await screen.findByText(/Acuse perdido/);
  expect(restored).not.toHaveBeenCalled();expect(restoreProjectTrash).toHaveBeenCalledTimes(1);
});

it("does not query a receipt when native admission explicitly says the operation did not start",async()=>{
  vi.mocked(getProjectTrash).mockResolvedValue({entries:[entry],warnings:[]});vi.mocked(reviewProjectTrash).mockResolvedValue(reviewed);
  vi.mocked(restoreProjectTrash).mockRejectedValue(new ApiError(409,"Busy","La operación no ha comenzado","not-started","project_write_not_started"));
  render(<ProjectTrashDialog projectId="p" projectName="Proyecto" onRestored={vi.fn()} onClose={vi.fn()}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Revisar docs/a.md"}));fireEvent.click(await screen.findByRole("button",{name:"Restaurar docs/a.md"}));await screen.findByText(/La operación no ha comenzado/);
  expect(reviewTrashRestoreAttempt).not.toHaveBeenCalled();expect(restoreProjectTrash).toHaveBeenCalledTimes(1);
});
