import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProjectTransferJob } from "../../types/projectTransfer";
const api = vi.hoisted(() => ({ list: vi.fn(), begin: vi.fn(), prepare: vi.fn(), pick: vi.fn(), deliver: vi.fn(), commit: vi.fn(), cancel: vi.fn(), discard: vi.fn(), rememberReview:vi.fn() }));
vi.mock("../../lib/api/projectTransfer", () => ({ projectTransfers: api }));
import { ProjectTransferDialog } from "./ProjectTransferDialog";
const ready: ProjectTransferJob = { id: "transfer-qa", kind: "import", phase: "ready", createdAt: "2026-10-31T10:00:00Z", projectId: null, archiveSha256: "a".repeat(64), archiveBytes: 2300, sourceName: "Equipo.knownext-project.zip", targetProjectId: null, requestedName: null, deliveredName: null, error: null, cancelRequested: false, interrupted: false, manifest: { format: "knownext.project", schemaVersion: 1, projectName: "Equipo", createdAt: "2026-10-31T10:00:00Z", directories: ["Vacía"], files: [{ path: "Acta.md", size: 40, kind: "markdown", sha256: "b".repeat(64) }], exclusions: [{ path: ".env", reason: "Archivo privado" }], adjustments: [], referenceWarnings: [] } };
beforeEach(() => {
  vi.resetAllMocks(); api.list.mockResolvedValue({ jobs: [], warnings: [] });
  api.begin.mockResolvedValue({ ...ready, phase: "awaiting_source", manifest: null, archiveSha256: null }); api.pick.mockResolvedValue(ready);
  api.discard.mockResolvedValue({ id: ready.id, discarded: true });
  api.rememberReview.mockImplementation(async(id,sha,name)=>({...ready,id,archiveSha256:sha,requestedName:name}));
});
afterEach(cleanup);
it("adopts only the expected backup recovery even when another transfer is listed first",async()=>{
  const unrelated={...ready,id:"unrelated-import",requestedName:"Otro trabajo"};api.list.mockResolvedValue({jobs:[unrelated,ready],warnings:[]});
  render(<ProjectTransferDialog mode={{kind:"import"}} expectedTransferId={ready.id} onClose={vi.fn()} onImported={vi.fn()}/>);
  expect(await screen.findByLabelText("Nombre del proyecto nuevo")).toHaveValue("Equipo");
  api.commit.mockResolvedValue({...ready,phase:"completed",targetProjectId:"restored-project"});fireEvent.click(screen.getByRole("button",{name:"Importar proyecto"}));await screen.findByText(/Tu documento actual sigue abierto/);
  expect(api.commit).toHaveBeenCalledWith(ready.id,ready.archiveSha256,"Equipo");expect(api.begin).not.toHaveBeenCalled();expect(api.pick).not.toHaveBeenCalled();
});
it("preserves a missing expected backup receipt without adopting or starting another import",async()=>{
  api.list.mockResolvedValue({jobs:[{...ready,id:"other-import"}],warnings:[]});render(<ProjectTransferDialog mode={{kind:"import"}} expectedTransferId="missing-backup-job" onClose={vi.fn()} onImported={vi.fn()}/>);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se encuentra la recuperación preparada");expect(screen.queryByLabelText("Nombre del proyecto nuevo")).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Elegir paquete…"})).not.toBeInTheDocument();expect(api.begin).not.toHaveBeenCalled();expect(api.commit).not.toHaveBeenCalled();
});
it("prepares a catalogue template without reopening a picker and still requires content review",async()=>{
  api.begin.mockResolvedValue({...ready,templateId:"project-template-owned",phase:"preparing",manifest:null,archiveSha256:null});
  api.prepare.mockResolvedValue({...ready,templateId:"project-template-owned",manifest:{...ready.manifest!,templateDescription:"Kit reutilizable"}});
  render(<ProjectTransferDialog mode={{kind:"template-import",templateId:"project-template-owned",revision:"r1",projectName:"Kit"}} onClose={vi.fn()} onImported={vi.fn()}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Preparar plantilla"}));
  await screen.findByLabelText("Nombre del proyecto nuevo");expect(screen.getByText("Kit reutilizable")).toBeInTheDocument();
  expect(api.prepare).toHaveBeenCalledWith(ready.id);expect(api.pick).not.toHaveBeenCalled();expect(api.commit).not.toHaveBeenCalled();
});
it("requires a reviewed package and explicit confirmation; name collisions keep typed name and reviewed identity", async () => {
  const imported = vi.fn(); render(<ProjectTransferDialog mode={{ kind: "import" }} onClose={vi.fn()} onImported={imported}/>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Elegir paquete…" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Elegir paquete…" })); await screen.findByLabelText("Nombre del proyecto nuevo");
  expect(api.commit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Nombre del proyecto nuevo"), { target: { value: "Equipo recibido" } });
  api.list.mockResolvedValue({ jobs: [ready], warnings: [] }); api.commit.mockRejectedValueOnce(new Error("Ya existe: elige otro nombre"));
  fireEvent.click(screen.getByRole("button", { name: "Importar proyecto" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("otro nombre"); expect(screen.getByLabelText("Nombre del proyecto nuevo")).toHaveValue("Equipo recibido");
  await waitFor(() => expect(screen.getByRole("button", { name: "Importar proyecto" })).toBeEnabled());
  api.commit.mockResolvedValue({ ...ready, phase: "completed", targetProjectId: "project-copy", requestedName: "Equipo recibido 2" });
  fireEvent.change(screen.getByLabelText("Nombre del proyecto nuevo"), { target: { value: "Equipo recibido 2" } });fireEvent.click(screen.getByRole("button", { name: "Importar proyecto" }));
  await screen.findByText(/Tu documento actual sigue abierto/);expect(api.commit).toHaveBeenLastCalledWith(ready.id, ready.archiveSha256, "Equipo recibido 2");expect(imported).toHaveBeenCalledWith("project-copy");
});
it("requests cancellation independently and blocks Escape and duplicate source selection until the native receipt", async () => {
  let finish!: (job: ProjectTransferJob) => void; api.pick.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  api.cancel.mockResolvedValue({ id: ready.id, requested: true });const close = vi.fn();
  render(<ProjectTransferDialog mode={{ kind: "import" }} onClose={close} onImported={vi.fn()}/>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Elegir paquete…" })).toBeEnabled());
  const button = screen.getByRole("button", { name: "Elegir paquete…" });fireEvent.click(button);fireEvent.click(button);
  await screen.findByRole("button", { name: "Solicitar cancelación" });fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Solicitar cancelación" }));await screen.findByText(/cuando termine la lectura actual/);
  expect(api.begin).toHaveBeenCalledOnce();expect(api.pick).toHaveBeenCalledOnce();expect(api.cancel).toHaveBeenCalledWith(ready.id);
  await act(async () => finish({ ...ready, phase: "cancelled", cancelRequested: true }));expect(screen.queryByRole("button", { name: "Importar proyecto" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Descartar preparación" }));await screen.findByRole("button", { name: "Elegir paquete…" });expect(api.discard).toHaveBeenCalledWith(ready.id);
});
it("resumes pending registration with the same digest and never offers destructive discard of the copied project", async () => {
  api.list.mockResolvedValue({ jobs: [{ ...ready, phase: "pending_registration", requestedName: "Recuperado", targetProjectId: "project-copy" }], warnings: [] });
  api.commit.mockResolvedValue({ ...ready, phase: "completed", targetProjectId: "project-copy" });const close = vi.fn();
  render(<ProjectTransferDialog mode={{ kind: "import" }} onClose={close} onImported={vi.fn()}/>);
  await screen.findByRole("button", { name: "Continuar registro" });expect(screen.queryByRole("button", { name: "Descartar preparación" })).not.toBeInTheDocument();expect(api.pick).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Continuar registro" }));await screen.findByText(/Tu documento actual sigue abierto/);expect(api.commit).toHaveBeenCalledWith(ready.id, ready.archiveSha256, "Recuperado");
  await waitFor(() => expect(screen.getByRole("button", { name: "Cerrar" })).toBeEnabled());fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));await waitFor(() => expect(close).toHaveBeenCalledOnce());expect(api.discard).toHaveBeenCalledWith(ready.id);
});
it("distinguishes cancelled export destination from confirmed delivery and keeps the native review", async () => {
  const exported = { ...ready, kind: "export" as const };api.list.mockResolvedValue({ jobs: [exported], warnings: [] });api.deliver.mockResolvedValueOnce(exported).mockResolvedValueOnce({ ...exported, phase: "completed", deliveredName: "Equipo portable.zip" });
  render(<ProjectTransferDialog mode={{ kind: "export", projectId: "project-qa", projectName: "Equipo" }} onClose={vi.fn()} onImported={vi.fn()}/>);
  await screen.findByRole("button", { name: "Elegir destino…" });fireEvent.click(screen.getByRole("button", { name: "Elegir destino…" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Elegir destino…" })).toBeEnabled());expect(screen.queryByText(/Paquete guardado/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Elegir destino…" }));await screen.findByText(/Equipo portable.zip/);expect(api.deliver).toHaveBeenLastCalledWith(ready.id, ready.archiveSha256);
});
it("preserves damaged/future preparations and prevents beginning another job", async () => {
  api.list.mockResolvedValue({ jobs: [], warnings: ["Registro futuro: la preparación se conserva"] });render(<ProjectTransferDialog mode={{ kind: "import" }} onClose={vi.fn()} onImported={vi.fn()}/>);
  await screen.findByRole("alert");expect(screen.getByRole("button", { name: "Elegir paquete…" })).toBeDisabled();expect(api.begin).not.toHaveBeenCalled();
});
it("reconciles a lost commit receipt by refreshing, without executing another import", async () => {
  api.list.mockResolvedValueOnce({ jobs: [ready], warnings: [] }).mockResolvedValue({ jobs: [{ ...ready, phase: "completed", targetProjectId: "project-after-timeout" }], warnings: [] });
  api.commit.mockRejectedValue(new Error("Respuesta interrumpida"));const imported=vi.fn();render(<ProjectTransferDialog mode={{kind:"import"}} onClose={vi.fn()} onImported={imported}/>);
  await screen.findByRole("button",{name:"Importar proyecto"});fireEvent.click(screen.getByRole("button",{name:"Importar proyecto"}));
  await screen.findByText(/Tu documento actual sigue abierto/);await waitFor(()=>expect(imported).toHaveBeenCalledWith("project-after-timeout"));expect(api.commit).toHaveBeenCalledOnce();expect(api.pick).not.toHaveBeenCalled();
});
it("preserves a provisional name on close and reloads it without committing or selecting another file",async()=>{
  api.list.mockResolvedValue({jobs:[ready],warnings:[]});const close=vi.fn();const view=render(<ProjectTransferDialog mode={{kind:"import"}} onClose={close} onImported={vi.fn()}/>);
  await screen.findByLabelText('Nombre del proyecto nuevo');fireEvent.change(screen.getByLabelText('Nombre del proyecto nuevo'),{target:{value:'Equipo recibido'}});fireEvent.click(screen.getByRole('button',{name:'Volver'}));
  await waitFor(()=>expect(close).toHaveBeenCalledOnce());expect(api.rememberReview).toHaveBeenCalledWith(ready.id,ready.archiveSha256,'Equipo recibido');expect(api.commit).not.toHaveBeenCalled();expect(api.pick).not.toHaveBeenCalled();
  view.unmount();api.list.mockResolvedValue({jobs:[{...ready,requestedName:'Equipo recibido'}],warnings:[]});render(<ProjectTransferDialog mode={{kind:'import'}} onClose={vi.fn()} onImported={vi.fn()}/>);
  expect(await screen.findByLabelText('Nombre del proyecto nuevo')).toHaveValue('Equipo recibido');expect(api.begin).not.toHaveBeenCalled();
});
it("keeps an incomplete name and the dialog open when preservation fails, allowing retry without import",async()=>{
  api.list.mockResolvedValue({jobs:[ready],warnings:[]});api.rememberReview.mockRejectedValueOnce(new Error('No se pudo conservar la revisión'));const close=vi.fn();render(<ProjectTransferDialog mode={{kind:'import'}} onClose={close} onImported={vi.fn()}/>);
  await screen.findByLabelText('Nombre del proyecto nuevo');fireEvent.change(screen.getByLabelText('Nombre del proyecto nuevo'),{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Volver'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('conservar');expect(close).not.toHaveBeenCalled();expect(screen.getByLabelText('Nombre del proyecto nuevo')).toHaveValue('');
  await waitFor(()=>expect(screen.getByRole('button',{name:'Volver'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Volver'}));await waitFor(()=>expect(close).toHaveBeenCalledOnce());expect(api.rememberReview).toHaveBeenLastCalledWith(ready.id,ready.archiveSha256,'');expect(api.commit).not.toHaveBeenCalled();
});
