import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {ProjectTransferJob} from "../../types/projectTransfer";
const api=vi.hoisted(()=>({list:vi.fn(),begin:vi.fn(),prepare:vi.fn(),pick:vi.fn(),deliver:vi.fn(),commit:vi.fn(),cancel:vi.fn(),discard:vi.fn(),rememberReview:vi.fn()}));
vi.mock("../../lib/api/projectTransfer",()=>({projectTransfers:api}));
import {ProjectTransferDialog} from "./ProjectTransferDialog";
const ready:ProjectTransferJob={id:"transfer-archive",kind:"export",phase:"ready",createdAt:"2026-11-04T12:00:00Z",projectId:"project-owned",archiveSha256:"a".repeat(64),archiveBytes:10000,sourceName:null,targetProjectId:null,requestedName:null,deliveredName:null,error:null,cancelRequested:false,interrupted:false,includeArchive:true,manifest:{format:"knownext.project",schemaVersion:2,projectName:"Proyecto privado",createdAt:"2026-11-04T12:00:00Z",directories:["Archivo KnowNext"],files:[],exclusions:[],adjustments:[],referenceWarnings:[],supplement:{directory:"Archivo KnowNext",dataOnly:true,drafts:2,recordingSessions:1,history:true,preferences:true}}};
beforeEach(()=>{vi.resetAllMocks();api.list.mockResolvedValue({jobs:[],warnings:[]});api.begin.mockResolvedValue({...ready,phase:"preparing",manifest:null});api.prepare.mockResolvedValue(ready);});
afterEach(cleanup);
it("adds the private archive only after explicit choice, reviews its scope and prevents converting it into a template",async()=>{
  const mode={kind:"export" as const,projectId:"project-owned",projectName:"Proyecto privado"};
  render(<ProjectTransferDialog mode={mode} onClose={vi.fn()} onImported={vi.fn()}/>);
  const option=await screen.findByRole("checkbox",{name:/Añadir archivo privado/});expect(option).not.toBeChecked();expect(api.begin).not.toHaveBeenCalled();
  fireEvent.click(option);fireEvent.click(screen.getByRole("button",{name:"Preparar archivo privado"}));
  await screen.findByRole("region",{name:"Archivo privado incluido"});expect(api.begin).toHaveBeenCalledWith({...mode,includeArchive:true});expect(api.deliver).not.toHaveBeenCalled();expect(api.commit).not.toHaveBeenCalled();
  expect(screen.queryByRole("button",{name:"Guardar como plantilla…"})).not.toBeInTheDocument();fireEvent.click(screen.getByText("Qué se activa al importar"));expect(screen.getByText(/no se inician transcripciones ni envíos/)).toBeVisible();
});
it("opening an imported private archive never commits or applies settings until the project is confirmed",async()=>{
  api.list.mockResolvedValue({jobs:[{...ready,kind:"import",projectId:null}],warnings:[]});api.commit.mockResolvedValue({...ready,kind:"import",phase:"completed",targetProjectId:"project-new"});const imported=vi.fn();
  render(<ProjectTransferDialog mode={{kind:"import"}} onClose={vi.fn()} onImported={imported}/>);
  await screen.findByRole("region",{name:"Archivo privado incluido"});expect(api.commit).not.toHaveBeenCalled();expect(api.prepare).not.toHaveBeenCalled();expect(api.pick).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Nombre del proyecto nuevo"),{target:{value:"Copia revisada"}});fireEvent.click(screen.getByRole("button",{name:"Importar proyecto"}));
  await waitFor(()=>expect(imported).toHaveBeenCalledWith("project-new"));expect(api.commit).toHaveBeenCalledTimes(1);expect(api.commit).toHaveBeenCalledWith(ready.id,ready.archiveSha256,"Copia revisada");
});
it("does not offer a project archive for a partial selection",async()=>{
  render(<ProjectTransferDialog mode={{kind:"export",projectId:"project-owned",projectName:"Proyecto privado",nodeIds:["project-owned::Acta.md"]}} onClose={vi.fn()} onImported={vi.fn()}/>);
  await screen.findByRole("button",{name:"Preparar lo guardado"});expect(screen.queryByRole("checkbox",{name:/Añadir archivo privado/})).not.toBeInTheDocument();
});
it("reviews a successive archive with prior data preserved and never delivers it on opening",async()=>{
 api.list.mockResolvedValue({jobs:[{...ready,manifest:{...ready.manifest!,schemaVersion:3,supplement:{...ready.manifest!.supplement!,retainedFiles:18}}}],warnings:[]});render(<ProjectTransferDialog mode={{kind:"export",projectId:"project-owned",projectName:"Proyecto privado"}} onClose={vi.fn()} onImported={vi.fn()}/>);await screen.findByText(/Conserva además 18 archivos del archivo privado anterior/);expect(api.prepare).not.toHaveBeenCalled();expect(api.deliver).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:"Guardar como plantilla…"})).not.toBeInTheDocument();
});
