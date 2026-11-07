import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectRemoteReviewDialog } from "./ProjectRemoteReviewDialog";
import { createGraphJoinId,joinIdenticalHistories,keepLocalHistories,reviewGraphJoin,reviewRemoteProject } from "../../lib/api/projectRemoteReview";
import type { ProjectRemoteReview } from "../../types/projectRemoteReview";
vi.mock("../../lib/api/projectRemoteReview", () => ({ reviewRemoteProject: vi.fn(),createGraphJoinId:vi.fn(),joinIdenticalHistories:vi.fn(),keepLocalHistories:vi.fn(),reviewGraphJoin:vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const review: ProjectRemoteReview = { schemaVersion: 1, projectId: "p", revision: "r", localCommit: "a".repeat(40), remoteCommit: "b".repeat(40), baseCommit: "c".repeat(40), relation: "diverged", checkedAt: "2026-11-02T00:00:00Z", warnings: [], local: [{ side: "local", change: "modified", path: "Acta.md", previousPath: null, kind: "markdown", overlap: true, identical: false, canOpen: true, documentId: "p::Acta.md" }], remote: [{ side: "remote", change: "renamed", path: "Acta nueva.md", previousPath: "Acta.md", kind: "markdown", overlap: true, identical: false, canOpen: false, documentId: null }] };
it("shows cached rename overlap without offering replacement and clears obsolete data after a failed refresh", async () => {
  vi.mocked(reviewRemoteProject).mockResolvedValueOnce(review).mockRejectedValueOnce(new Error("La referencia cambió"));
  const open = vi.fn();
  render(<ProjectRemoteReviewDialog projectId="p" projectName="Revisión" onClose={vi.fn()} onOpenDocument={open}/>);
  fireEvent.click(await screen.findByRole("button", { name: "Abrir documento" }));
  expect(open).toHaveBeenCalledWith("p::Acta.md", "Acta.md");
  fireEvent.click(screen.getByRole("button", { name: "Remoto conocido · 1" }));
  expect(screen.getByText("Antes: Acta.md")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Abrir documento" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Reemplazar|Confirmar|Usar GitHub|Fusionar/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Volver a consultar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("La referencia cambió");
  expect(screen.queryByText("Acta nueva.md")).not.toBeInTheDocument();
});
it("ignores an old response when the project changes and keeps close available during a read", async () => {
  let finish!: (value: ProjectRemoteReview) => void;
  vi.mocked(reviewRemoteProject).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ ...review, projectId: "next", local: [], remote: [] });
  const props = { projectName: "Revisión", onClose: vi.fn(), onOpenDocument: vi.fn() };
  const view = render(<ProjectRemoteReviewDialog projectId="p" {...props}/>);
  expect(screen.getByRole("button", { name: "Cerrar revisión" })).toBeEnabled();
  view.rerender(<ProjectRemoteReviewDialog projectId="next" {...props}/>);
  await screen.findByRole("button", { name: "Este equipo · 0" });
  finish(review); await waitFor(() => expect(reviewRemoteProject).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("Acta.md")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Este equipo · 0" })).toBeInTheDocument();
});
const joinable:ProjectRemoteReview={...review,revision:"a".repeat(64),graphJoin:{canJoin:true,message:"Los dos historiales contienen los mismos archivos."}};
const attemptId=`attempt-${"1".repeat(32)}`;
const confirmed={schemaVersion:1 as const,projectId:"p",attemptId,reviewedRevision:joinable.revision,targetCommit:"d".repeat(40),status:"confirmed" as const,canReplay:false as const,checkedAt:review.checkedAt,message:"Historiales reunidos localmente. No se han reemplazado documentos."};
it("requires explicit confirmation and keeps an uncertain join available only for receipt reads",async()=>{
 vi.mocked(reviewRemoteProject).mockResolvedValueOnce(joinable);vi.mocked(createGraphJoinId).mockReturnValue(attemptId);vi.mocked(joinIdenticalHistories).mockRejectedValueOnce(Error("No se confirma la publicación"));vi.mocked(reviewGraphJoin).mockResolvedValueOnce(confirmed);
 render(<ProjectRemoteReviewDialog projectId="p" projectName="Owned QA" onClose={vi.fn()} onOpenDocument={vi.fn()}/>);
 fireEvent.click(await screen.findByRole("button",{name:"Reunir historiales"}));expect(joinIdenticalHistories).not.toHaveBeenCalled();expect(screen.getByText(/Tus borradores permanecen/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Confirmar reunión local"}));await screen.findByRole("alert");expect(screen.queryByRole("button",{name:"Reunir historiales"})).not.toBeInTheDocument();expect(joinIdenticalHistories).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole("button",{name:"Consultar este intento"}));await screen.findByText("Historiales reunidos localmente");expect(reviewGraphJoin).toHaveBeenCalledWith("p",attemptId);expect(joinIdenticalHistories).toHaveBeenCalledTimes(1);
});
it("finds a previous preparation after reopening without replaying its request",async()=>{
 vi.mocked(reviewRemoteProject).mockResolvedValueOnce({...joinable,graphJoins:{items:[{attemptId,createdAt:review.checkedAt,reviewedRevision:joinable.revision,targetCommit:confirmed.targetCommit}],limited:true,warnings:["Unreviewed item"]}});vi.mocked(reviewGraphJoin).mockResolvedValueOnce(confirmed);
 render(<ProjectRemoteReviewDialog projectId="p" projectName="Owned QA" onClose={vi.fn()} onOpenDocument={vi.fn()}/>);
 fireEvent.click(await screen.findByText("Reuniones preparadas · 1"));expect(screen.getByText(/Su presencia no confirma/)).toBeInTheDocument();expect(screen.getByText(/catálogo de reuniones es parcial/)).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Consultar reunión 11111111"}));await screen.findByText("Historiales reunidos localmente");expect(joinIdenticalHistories).not.toHaveBeenCalled();
});
it("shows all remote changes and requires acknowledging the whole-project local choice",async()=>{
 const selected={...joinable,graphJoin:{canJoin:false,canKeepLocal:true,message:"Archivos distintos"}};vi.mocked(reviewRemoteProject).mockResolvedValueOnce(selected);vi.mocked(createGraphJoinId).mockReturnValue(attemptId);vi.mocked(keepLocalHistories).mockResolvedValueOnce({...confirmed,resolution:"keep-local"});
 render(<ProjectRemoteReviewDialog projectId="p" projectName="Owned QA" onClose={vi.fn()} onOpenDocument={vi.fn()}/>);
 fireEvent.click(await screen.findByRole("button",{name:"Conservar versión del equipo"}));expect(screen.getByText("Antes: Acta.md")).toBeInTheDocument();expect(screen.getByText(/Todo el proyecto:/)).toBeInTheDocument();const confirm=screen.getByRole("button",{name:"Confirmar versión del equipo"});expect(confirm).toBeDisabled();fireEvent.click(confirm);expect(keepLocalHistories).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("checkbox",{name:"Entiendo que no se incorporarán los cambios remotos"}));expect(confirm).toBeEnabled();fireEvent.click(confirm);await screen.findByText("Historiales reunidos localmente");expect(keepLocalHistories).toHaveBeenCalledWith("p",selected,attemptId,true);expect(joinIdenticalHistories).not.toHaveBeenCalled();
});
