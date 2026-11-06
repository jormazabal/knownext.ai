import {cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {useState} from "react";
import {afterEach,expect,it,vi} from "vitest";
import {RecoverableDraftsDialog} from "./RecoverableDraftsDialog";
import type {OrphanDraft} from "../../types/domain";
const row:OrphanDraft={draftKey:"v2_reviewed",fingerprint:"a".repeat(64),locationRevision:"b".repeat(64),documentId:"p::A.md",projectId:"p",projectName:"Proyecto",path:"A.md",name:"A.md",wordCount:3,createdAt:"2026-11-02T00:00:00Z",draftUpdatedAt:"2026-11-02T00:00:00Z",recoverable:true};
afterEach(cleanup);
it("keeps partial coverage explicit and never treats an empty partial inventory as complete",()=>{
  render(<RecoverableDraftsDialog open drafts={[]} limited coverageWarnings={["Se conservan las copias no revisadas"]} onClose={vi.fn()} onRefresh={vi.fn()} onRestore={vi.fn()} onDiscard={vi.fn()}/>);
  expect(screen.getByText("No se encontraron archivos ausentes en la parte revisada")).toBeInTheDocument();expect(screen.getByText("Se conservan las copias no revisadas")).toBeInTheDocument();expect(screen.queryByText("No hay archivos desaparecidos pendientes de recrear")).not.toBeInTheDocument();
});
it("requires content and location proof before enabling either recovery or discard",()=>{
  const restore=vi.fn(),discard=vi.fn();render(<RecoverableDraftsDialog open drafts={[{...row,fingerprint:null}]} onClose={vi.fn()} onRefresh={vi.fn()} onRestore={restore} onDiscard={discard}/>);
  expect(screen.getByRole("button",{name:"Recrear archivo"})).toBeDisabled();expect(screen.getByRole("button",{name:"Descartar"})).toBeDisabled();expect(restore).not.toHaveBeenCalled();expect(discard).not.toHaveBeenCalled();
});
it("keeps the chosen discard snapshot, blocks another uncertain request and requires a successful fresh inventory",async()=>{
  const discard=vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);let fresh=false;const refresh=vi.fn(async()=>fresh);
  function Workspace(){const [rows,setRows]=useState([row]);return <RecoverableDraftsDialog open drafts={rows} onClose={vi.fn()} onRefresh={async()=>{const done=await refresh();if(done)setRows([{...row,fingerprint:"c".repeat(64)}]);return done;}} onRestore={vi.fn()} onDiscard={discard}/>;}
  render(<Workspace/>);fireEvent.click(screen.getByRole("button",{name:"Descartar"}));let confirmation=screen.getByRole("alertdialog",{name:"Descartar borrador definitivamente"});fireEvent.click(within(confirmation).getByRole("button",{name:"Descartar definitivamente"}));
  await waitFor(()=>expect(within(confirmation).getByRole("button",{name:"Descartar definitivamente"})).toBeDisabled());expect(discard).toHaveBeenCalledTimes(1);expect(discard).toHaveBeenLastCalledWith(row);
  fireEvent.click(within(confirmation).getByRole("button",{name:"Conservar borrador"}));fireEvent.click(screen.getByRole("button",{name:"Actualizar"}));await waitFor(()=>expect(refresh).toHaveBeenCalledTimes(1));expect(screen.getByRole("button",{name:"Descartar"})).toBeDisabled();
  fresh=true;fireEvent.click(screen.getByRole("button",{name:"Actualizar"}));await waitFor(()=>expect(screen.getByRole("button",{name:"Descartar"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"Descartar"}));confirmation=screen.getByRole("alertdialog",{name:"Descartar borrador definitivamente"});fireEvent.click(within(confirmation).getByRole("button",{name:"Descartar definitivamente"}));await waitFor(()=>expect(discard).toHaveBeenCalledTimes(2));expect(discard).toHaveBeenLastCalledWith({...row,fingerprint:"c".repeat(64)});
});
