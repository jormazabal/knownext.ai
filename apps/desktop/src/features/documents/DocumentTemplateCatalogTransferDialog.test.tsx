import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const api=vi.hoisted(()=>({deliverTemplateCatalog:vi.fn(),importTemplateCatalog:vi.fn(),inspectTemplateTransfer:vi.fn(),prepareTemplateCatalog:vi.fn(),reviewTemplateCatalog:vi.fn()}));
vi.mock("../../lib/api/documentTemplateTransfer",()=>api);
vi.mock("../editor/ReadonlyMarkdownViewer",()=>({ReadonlyMarkdownViewer:({markdown}:{markdown:string})=><article>{markdown}</article>}));
import {DocumentTemplateCatalogTransferDialog} from "./DocumentTemplateCatalogTransferDialog";
const entries=[{index:0,name:"Acta",description:"Equipo",markdown:"# {{titulo}}",variables:["titulo"]},{index:1,name:"Decisión",description:"Motivo",markdown:"## Contexto",variables:[]}];
const review={name:"Catálogo",description:"Dos",markdown:"",variables:[],digest:"reviewed",byteLength:100,catalog:entries};
const file={fileName:"Catalogo.json",content:"owned-exact-bytes"};
const template=(name:string)=>({id:`owned-${name}`,name,markdown:"Owned",description:"",variables:[],revision:"revision",builtIn:false,createdAt:null});
const outcome=(index:number,status:string)=>({index,name:entries[index].name,status,message:status,template:status==="existing"||status==="imported"?template(entries[index].name):null});
const result=(statuses:string[],applied=false)=>({id:"owned-operation",checkedAt:"2026-11-01T19:00:00Z",digest:"reviewed",applied,outcomes:statuses.map((status,index)=>outcome(index,status))});
beforeEach(()=>vi.resetAllMocks());afterEach(cleanup);

it("observes an uncertain import without replay and keeps names and per-entry conflicts for explicit review",async()=>{
  api.reviewTemplateCatalog.mockResolvedValueOnce(result(["new","new"])).mockResolvedValueOnce(result(["existing","conflict"])).mockResolvedValueOnce(result(["existing","new"]));
  api.importTemplateCatalog.mockRejectedValueOnce(new Error("ACK desconocido")).mockResolvedValueOnce(result(["existing","imported"],true));
  const imported=vi.fn();
  render(<DocumentTemplateCatalogTransferDialog mode={{kind:"import-catalog",file,review}} onClose={vi.fn()} onImported={imported}/>);
  fireEvent.click(screen.getByRole("button",{name:"Revisar importación"}));
  fireEvent.click(await screen.findByRole("button",{name:"Importar 2 plantillas"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("ACK desconocido");
  fireEvent.click(screen.getByRole("button",{name:"Revisar importación"}));
  await screen.findByRole("button",{name:"Sin plantillas nuevas"});
  expect(api.importTemplateCatalog).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Nombre en tu catálogo · 1")).toHaveValue("Acta");
  expect(screen.getByText("Nombre en uso")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Nombre en tu catálogo · 2"),{target:{value:"Decisión recibida"}});
  fireEvent.click(screen.getByRole("button",{name:"Revisar importación"}));
  fireEvent.click(await screen.findByRole("button",{name:"Importar 1 plantilla"}));
  await waitFor(()=>expect(imported).toHaveBeenCalledWith(expect.objectContaining({name:"Decisión"})));
  expect(api.importTemplateCatalog).toHaveBeenLastCalledWith(file.content,"reviewed",[{index:0,name:"Acta"},{index:1,name:"Decisión recibida"}]);
  expect(screen.getByText("Creada")).toBeInTheDocument();
});

it("prepares explicit revisions and retains the selection after native destination cancellation",async()=>{
  const templates=entries.map(entry=>({...template(entry.name),revision:`revision-${entry.index}`}));
  api.prepareTemplateCatalog.mockResolvedValue({...file,digest:"reviewed",byteLength:100});api.inspectTemplateTransfer.mockResolvedValue(review);api.deliverTemplateCatalog.mockResolvedValue({status:"cancelled"});
  render(<DocumentTemplateCatalogTransferDialog mode={{kind:"export-catalog",templates}} onClose={vi.fn()} onImported={vi.fn()}/>);
  expect(screen.getByRole("button",{name:"Preparar selección"})).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Acta"));fireEvent.click(screen.getByLabelText("Decisión"));
  fireEvent.click(screen.getByRole("button",{name:"Preparar selección"}));
  fireEvent.click(await screen.findByRole("button",{name:"Elegir destino…"}));
  expect(await screen.findByRole("status")).toHaveTextContent("Destino cancelado");
  expect(screen.getByLabelText("Acta")).toBeChecked();
  expect(api.deliverTemplateCatalog).toHaveBeenLastCalledWith(templates.map(({id,revision})=>({id,revision})));
  fireEvent.click(screen.getByLabelText("Decisión"));
  expect(screen.getByRole("button",{name:"Preparar selección"})).toBeEnabled();
});

it("allows read-only catalogue review before requiring consent to copy selected attachments",async()=>{
 const incoming={...review,catalog:[{...entries[0],resources:[{path:"owned",name:"Ficha.pdf",mimeType:"application/pdf",sha256:"a".repeat(64),bytes:120}]},entries[1]]};api.reviewTemplateCatalog.mockResolvedValue(result(["new","new"]));api.importTemplateCatalog.mockResolvedValue(result(["imported","existing"],true));render(<DocumentTemplateCatalogTransferDialog mode={{kind:"import-catalog",file,review:incoming}} onClose={vi.fn()} onImported={vi.fn()}/>);expect(screen.getByText(/Ficha.pdf ·/)).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Revisar importación"}));const apply=await screen.findByRole("button",{name:"Importar 2 plantillas"});expect(apply).toBeDisabled();expect(api.importTemplateCatalog).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("checkbox",{name:/He revisado los adjuntos seleccionados/}));fireEvent.click(apply);await waitFor(()=>expect(api.importTemplateCatalog).toHaveBeenCalledWith(file.content,review.digest,[{index:0,name:"Acta"},{index:1,name:"Decisión"}],true));
});
