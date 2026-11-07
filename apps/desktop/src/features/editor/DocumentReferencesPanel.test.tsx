import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {DocumentReferencesPanel} from "./DocumentReferencesPanel";
import {getDocumentReferences} from "../../lib/api/documentReferences";
import type {DocumentReferencesResponse,LocalReferenceTarget} from "../../types/documentReferences";

vi.mock("../../lib/api/documentReferences",()=>({getDocumentReferences:vi.fn()}));
const query=vi.mocked(getDocumentReferences);
const target:LocalReferenceTarget={id:"p::target.md",projectId:"p",name:"Target.md",path:"docs/Target.md",kind:"document",status:"available"};
function response(id="p::source.md"):DocumentReferencesResponse {return{documentId:id,projectId:"p",sourcePath:"source.md",scope:"saved-markdown",queriedAt:"2026-10-31T00:00:00Z",sourceFingerprint:null,sourceRead:true,outgoingSupported:true,outgoing:[{target,line:3,column:5,rawTarget:"docs/Target.md#part"},{target:{...target,id:"p::missing.md",name:"Missing.md",path:"missing.md",status:"missing"},line:4,column:1,rawTarget:"missing.md"}],incoming:[],scannedDocuments:3,complete:false,limited:true,warnings:[]};}
beforeEach(()=>query.mockReset());afterEach(cleanup);

it("identifies saved scope and incomplete coverage, opening only available files",async()=>{
  query.mockResolvedValue(response());const open=vi.fn();
  render(<DocumentReferencesPanel documentId="p::source.md" name="Source.md" dirty onOpen={open}/>);
  expect(await screen.findByText(/Revisión parcial/)).toBeInTheDocument();
  expect(screen.getByText(/Hay cambios sin guardar/)).toBeInTheDocument();
  expect(screen.getByText(/no cubre todo el proyecto/)).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Abrir Missing.md"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Abrir Target.md"}));expect(open).toHaveBeenCalledWith(target);
  expect(screen.queryByText("No se han encontrado referencias recibidas.")).not.toBeInTheDocument();
});

it("keeps a useful prior query when refresh fails and allows retry",async()=>{
  query.mockResolvedValueOnce(response()).mockRejectedValueOnce("Lectura no disponible").mockResolvedValueOnce({...response(),complete:true,limited:false});
  render(<DocumentReferencesPanel documentId="p::source.md" name="Source.md" dirty={false} onOpen={vi.fn()}/>);
  await screen.findByRole("button",{name:"Abrir Target.md"});
  fireEvent.click(screen.getByRole("button",{name:"Actualizar referencias"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Se conserva la consulta anterior");
  expect(screen.getByRole("button",{name:"Abrir Target.md"})).toBeInTheDocument();
  await waitFor(()=>expect(screen.getByRole("button",{name:"Actualizar referencias"})).toBeEnabled());
  fireEvent.click(screen.getByRole("button",{name:"Actualizar referencias"}));
  expect(await screen.findByText(/Revisión completa/)).toBeInTheDocument();expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("discards an older document response after the user switches files",async()=>{
  let finish!:(value:DocumentReferencesResponse)=>void;
  query.mockImplementation(id=>id==="old"?new Promise(resolve=>{finish=resolve;}):Promise.resolve({...response("new"),outgoing:[],complete:true,limited:false}));
  const props={name:"Document.md",dirty:false,onOpen:vi.fn()};
  const view=render(<DocumentReferencesPanel {...props} documentId="old"/>);
  view.rerender(<DocumentReferencesPanel {...props} documentId="new"/>);
  expect(await screen.findByText(/Revisión completa/)).toBeInTheDocument();
  await act(async()=>finish(response("old")));
  expect(screen.queryByRole("button",{name:"Abrir Target.md"})).not.toBeInTheDocument();
  expect(screen.getByText(/Revisión completa/)).toBeInTheDocument();
});
it("offers folder navigation only for a verified available directory",async()=>{
  const folder:LocalReferenceTarget={...target,id:'p::Vacía',name:'Vacía',path:'Vacía',kind:'folder'};const data=response();data.outgoing=[{target:folder,line:1,column:1,rawTarget:'Vacía/'},{target:{...folder,id:'p::enlace',name:'Enlace',status:'blocked'},line:2,column:1,rawTarget:'enlace/'}];query.mockResolvedValue(data);const open=vi.fn();
  render(<DocumentReferencesPanel documentId='p::source.md' name='Source.md' dirty={false} onOpen={open}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Mostrar carpeta Vacía'}));expect(open).toHaveBeenCalledWith(folder);expect(screen.queryByRole('button',{name:'Mostrar carpeta Enlace'})).not.toBeInTheDocument();expect(screen.getByText(/Carpeta del proyecto/)).toBeInTheDocument();
});
