import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecoveryReviewSection } from "./RecoveryReviewSection";
import { RecoverableDraftsDialog } from "./RecoverableDraftsDialog";
import { archiveRecoveryCopy, getRecoveryInventory, previewRecoveryCopy, recoverAsCopy } from "../../lib/api/recovery";
import type { Project, RestoreDraftResponse } from "../../types/domain";
import type { RecoveryCopy, RecoveryInventory } from "../../types/recovery";

vi.mock("../../lib/api/recovery", () => ({getRecoveryInventory: vi.fn(), recoverAsCopy: vi.fn(), archiveRecoveryCopy: vi.fn(), previewRecoveryCopy: vi.fn()}));
const query = vi.mocked(getRecoveryInventory), recover = vi.mocked(recoverAsCopy), archive = vi.mocked(archiveRecoveryCopy), preview = vi.mocked(previewRecoveryCopy);
const copy: RecoveryCopy = {key:"v2_review",fingerprint:"a".repeat(64),bytes:60,documentId:"p::Plan.md",name:"Plan.md",projectName:"Proyecto",path:"Plan.md",kind:"document",state:"variant",reason:"Hay dos copias. Se conservan ambas.",canCopy:true,canArchive:true,updatedAt:null};
const project = {id:"p",name:"Proyecto"} as Project;
function inventory(items = [copy]): RecoveryInventory {return {items,activeCount:2,archivedCount:0,scannedFiles:3,limited:false,warnings:[],queriedAt:"2026-10-31T00:00:00Z"};}
function renderReview() {const recovered=vi.fn().mockResolvedValue(undefined), changed=vi.fn();return {...render(<RecoveryReviewSection open projects={[project]} activeProjectId="p" onRecovered={recovered} onChanged={changed}/>),recovered,changed};}
beforeEach(() => {query.mockReset();recover.mockReset();archive.mockReset();preview.mockReset();});afterEach(cleanup);

it("keeps a known preserved edit visible outside a bounded archive inventory and previews its exact identity",async()=>{
  query.mockResolvedValue({...inventory([]),limited:true});preview.mockResolvedValue({kind:"document",text:"My preserved RAM",truncated:false,pageCount:0,strokeCount:0,bytes:60});
  const known={...copy,key:"recovery-known",source:"archive" as const,state:"archived" as const,canArchive:false,reason:"Edición abierta conservada porque el borrador guardado cambió."};
  render(<RecoveryReviewSection open archived knownCopy={known} projects={[project]} onRecovered={vi.fn()} onChanged={vi.fn()}/>);
  expect(await screen.findByText("Edición conservada en esta sesión")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Ver contenido"}));expect(await screen.findByText("My preserved RAM")).toBeInTheDocument();expect(preview).toHaveBeenCalledWith(known);
});

it("retains the selected name after a failed recovery and sends the reviewed fingerprint only once", async () => {
  query.mockResolvedValue(inventory());recover.mockRejectedValueOnce("El destino ya existe. Elige otro nombre.");
  const view=renderReview();fireEvent.click(await screen.findByRole("button",{name:"Recuperar como otro archivo"}));
  const modal=screen.getByRole("alertdialog",{name:"Recuperar como otro archivo"});
  fireEvent.change(within(modal).getByRole("textbox",{name:"Nombre del archivo"}),{target:{value:"Mi copia.md"}});
  fireEvent.click(within(modal).getByRole("button",{name:"Crear archivo nuevo"}));
  expect(await within(modal).findByRole("alert")).toHaveTextContent("El destino ya existe");
  expect(within(modal).getByRole("textbox",{name:"Nombre del archivo"})).toHaveValue("Mi copia.md");
  expect(recover).toHaveBeenCalledWith(copy,{fingerprint:copy.fingerprint,source:"active",projectId:"p",name:"Mi copia.md"});
  expect(view.recovered).not.toHaveBeenCalled();
  let finish!:(result:RestoreDraftResponse)=>void;recover.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const submit=within(modal).getByRole("button",{name:"Crear archivo nuevo"});fireEvent.click(submit);fireEvent.click(submit);
  expect(recover).toHaveBeenCalledTimes(2);expect(within(modal).getByRole("button",{name:"Conservando…"})).toBeDisabled();
  await act(async()=>finish({kind:"document",document:{id:"p::Mi copia.md"}} as RestoreDraftResponse));
  await waitFor(()=>expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(view.recovered).toHaveBeenCalledOnce();expect(view.changed).toHaveBeenCalledOnce();
  expect(screen.getByRole("status")).toHaveTextContent("Se conserva la copia de origen");
});

it("requires confirmation before archiving and preserves a partial-result warning",async()=>{
  query.mockResolvedValue(inventory([{...copy,name:"Copia dañada",kind:null,canCopy:false}]));
  archive.mockResolvedValue({archiveId:"recovery-123",retired:false,warning:"El original cambió; se conservan ambas copias.",retention:"manual-no-auto-expiry"});
  renderReview();fireEvent.click(await screen.findByRole("button",{name:"Apartar copia"}));
  expect(archive).not.toHaveBeenCalled();const modal=screen.getByRole("alertdialog",{name:"Apartar copia para revisión"});
  expect(modal).toHaveTextContent("no caduca automáticamente");fireEvent.click(within(modal).getByRole("button",{name:"Verificar y apartar"}));
  await waitFor(()=>expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(screen.getByRole("status")).toHaveTextContent("El original cambió");expect(recover).not.toHaveBeenCalled();
});

it("shows a safe excerpt before recovery and keeps archived sources distinct",async()=>{
  query.mockImplementation(async archived=>inventory([{...copy,source:archived?"archive":"active",state:archived?"archived":"variant",canArchive:!archived}]));
  preview.mockResolvedValue({kind:"document",text:"Texto de la variante",truncated:true,pageCount:0,strokeCount:0,bytes:5000});
  renderReview();fireEvent.click(await screen.findByRole("button",{name:"Ver contenido"}));
  const modal=screen.getByRole("dialog",{name:"Contenido de la copia"});
  expect(await within(modal).findByText("Texto de la variante")).toBeInTheDocument();expect(modal).toHaveTextContent("2.000 caracteres");expect(recover).not.toHaveBeenCalled();
  fireEvent.click(within(modal).getByRole("button",{name:"Cerrar vista"}));fireEvent.click(screen.getByRole("button",{name:"Apartadas"}));
  await waitFor(()=>expect(screen.queryByRole("button",{name:"Apartar copia"})).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button",{name:"Ver contenido"}));await waitFor(()=>expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({source:"archive"})));
});

it("does not replace the chosen archive inventory with a late active response and allows query retry",async()=>{
  let finish!:(value:RecoveryInventory)=>void;query.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockRejectedValueOnce("No se puede leer el archivo privado").mockResolvedValueOnce(inventory([]));
  renderReview();fireEvent.click(screen.getByRole("button",{name:"Apartadas"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se puede leer");
  await act(async()=>finish(inventory()));expect(screen.queryByText("Plan.md")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Revisar copias"}));expect(await screen.findByText("No hay copias apartadas en la parte revisada.")).toBeInTheDocument();
});

it("keeps recovery categories outside the scrolling results and routes their controlled scope",async()=>{
  query.mockImplementation(async archived=>inventory(archived?[]:[{...copy,updatedAt:"2026-10-31T00:00:00Z"}]));
  render(<RecoverableDraftsDialog open drafts={[]} onClose={vi.fn()} onRefresh={vi.fn()} onRestore={vi.fn()} onDiscard={vi.fn()} review={archived=><RecoveryReviewSection open archived={archived} projects={[project]} onRecovered={vi.fn().mockResolvedValue(undefined)} onChanged={vi.fn()}/>}/>);
  const categories=screen.getByRole("group",{name:"Categorías de recuperación"});
  expect(await screen.findByText(/Copia del/)).toBeInTheDocument();
  expect(screen.getByRole("dialog",{name:"Recuperación"})).toBeInTheDocument();
  const results=screen.getByRole("region",{name:"Revisión de copias locales"}).parentElement!;
  expect(results.className).toContain("overflow-y-auto");
  expect(results.contains(categories)).toBe(false);
  expect(results.contains(screen.getByRole("combobox",{name:"Categorías de recuperación"}))).toBe(false);
  fireEvent.click(within(categories).getByRole("button",{name:"Copias apartadas"}));
  expect(await screen.findByText("No hay copias apartadas en la parte revisada.")).toBeInTheDocument();expect(query).toHaveBeenLastCalledWith(true);
  fireEvent.click(within(categories).getByRole("button",{name:"Archivos desaparecidos (0)"}));
  expect(screen.getByText("No hay archivos desaparecidos pendientes de recrear")).toBeInTheDocument();expect(categories).toBeInTheDocument();
});
