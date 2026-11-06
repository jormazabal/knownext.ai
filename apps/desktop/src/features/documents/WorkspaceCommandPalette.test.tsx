import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {WorkspaceCommandPalette} from "./WorkspaceCommandPalette";
import {searchSavedProjectContent} from "../../lib/api/localSearch";
import type {LocalSearchResponse} from "../../types/localSearch";
import {getProjectFavorites,removeProjectFavorite} from "../../lib/api/favorites";
import type {FavoriteEntry} from "../../types/favorites";
vi.mock("../../lib/api/favorites",()=>({getProjectFavorites:vi.fn(),addProjectFavorite:vi.fn(),removeProjectFavorite:vi.fn()}));
beforeEach(()=>vi.mocked(getProjectFavorites).mockResolvedValue({projectId:"p",revision:null,entries:[],maximumEntries:256,checkedAt:"2026-11-01T12:00:00Z",scope:"this-device"}));
vi.mock("../../lib/api/localSearch",()=>({searchSavedProjectContent:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const response:LocalSearchResponse={projectId:"p",query:"decision",searchedAt:"2026-10-31T00:00:00Z",results:[{documentId:"a",name:"a.md",path:"docs/a.md",line:2,excerpt:"decision local"}],scannedDocuments:1,limited:true,warnings:["large.md: demasiado grande"]};
it("shows truthful PDF search scope in English while preserving source warnings",async()=>{
 vi.mocked(searchSavedProjectContent).mockResolvedValue(response);
 render(<WorkspaceCommandPalette language="en" tree={[]} projectId="p" projects={[]} recentIds={[]} commands={[]} onSelectProject={vi.fn()} onSelectNode={vi.fn()} onClose={vi.fn()}/>);
 fireEvent.click(screen.getByRole("button",{name:"Saved content"}));
 expect(screen.getByText(/PDF with extractable text/)).toBeVisible();
 const input=screen.getByRole("combobox",{name:"Search files, actions or content"});fireEvent.change(input,{target:{value:"decision"}});fireEvent.keyDown(input,{key:"Enter"});
 await screen.findByText(/1 result · 1 document searched/);expect(screen.getByText("large.md: demasiado grande")).toBeInTheDocument();expect(screen.getByText(/Scanned PDFs are not processed with OCR/)).toBeInTheDocument();
});
function setup(){
  const select=vi.fn();const command=vi.fn();const close=vi.fn();
  render(<WorkspaceCommandPalette tree={[{id:"a",name:"a.md",type:"document",path:"docs/a.md"}]} projectId="p" projects={[]} recentIds={["a"]} commands={[{id:"settings",label:"Abrir configuración",run:command}]} onSelectProject={vi.fn()} onSelectNode={select} onClose={close}/>);
  return {select,command,close,input:screen.getByRole("combobox",{name:"Buscar archivos, acciones o contenido"})};
}
it("opens a PDF search match on its page without routing it as a handwritten note",async()=>{
  vi.mocked(searchSavedProjectContent).mockResolvedValue({...response,results:[{documentId:"p::Brief.pdf",name:"Brief.pdf",path:"Brief.pdf",kind:"attachment",pageNumber:2,line:1,excerpt:"Acuerdo documental"}],limited:false,warnings:[]});
  const {input,select}=setup();fireEvent.click(screen.getByRole("button",{name:"Contenido guardado"}));fireEvent.change(input,{target:{value:"Acuerdo"}});fireEvent.keyDown(input,{key:"Enter"});
  await screen.findByText("Acuerdo documental");expect(screen.getByText(/PDF con texto extraíble/)).toBeInTheDocument();
  fireEvent.keyDown(input,{key:"Enter"});expect(select).toHaveBeenCalledWith("p::Brief.pdf","attachment","Brief.pdf",{kind:"pdf-page",pageNumber:2});
});
it("opens an extracted attachment and explains incremental refresh without implying OCR",async()=>{
  vi.mocked(searchSavedProjectContent).mockResolvedValue({...response,results:[{documentId:"p::Brief.docx",name:"Brief.docx",path:"Brief.docx",kind:"attachment",line:1,excerpt:"Acuerdo documental"}],index:{mode:"verified-memory",updatedDocuments:1,reusedDocuments:7,readBytes:2000,elapsedMs:10},attachmentsWithoutText:1});
  const {input,select}=setup();fireEvent.click(screen.getByRole("button",{name:"Contenido guardado"}));fireEvent.change(input,{target:{value:"Acuerdo"}});fireEvent.keyDown(input,{key:"Enter"});
  await screen.findByText(/1 archivo actualizado · 7 sin cambios/);
  expect(screen.getByText(/1 adjunto sin texto local utilizable/)).toBeInTheDocument();
  fireEvent.keyDown(input,{key:"Enter"});expect(select).toHaveBeenCalledWith("p::Brief.docx","attachment","Brief.docx");
});
it("favoritos conserva un destino ausente y retira solo el marcador sin abrir el archivo",async()=>{
  const entry:FavoriteEntry={id:"favorite-one",path:"docs/a.md",nodeId:"p::docs/a.md",name:"a.md",kind:"document",createdAt:"2026-11-01T12:00:00Z",updatedAt:"2026-11-01T12:00:00Z",available:false};
  vi.mocked(getProjectFavorites).mockResolvedValue({projectId:"p",revision:"r1",entries:[entry],maximumEntries:256,checkedAt:entry.createdAt,scope:"this-device"});
  vi.mocked(removeProjectFavorite).mockResolvedValue({favorite:null,revision:"r2",checkedAt:entry.createdAt});
  const {select,close,input}=setup();
  fireEvent.click(screen.getByRole("button",{name:"Favoritos"}));
  const option=await screen.findByRole("option",{name:/a.md.*No disponible/});
  expect(option).toHaveAttribute("aria-disabled","true");
  fireEvent.keyDown(input,{key:"Enter"});expect(select).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Quitar de favoritos"}));
  expect(await screen.findByRole("status")).toHaveTextContent("Favorito retirado. El archivo se conserva.");
  expect(removeProjectFavorite).toHaveBeenCalledTimes(1);expect(removeProjectFavorite).toHaveBeenCalledWith("p","favorite-one","r1");
  expect(input).toHaveFocus();expect(select).not.toHaveBeenCalled();
});
it("abre el resultado manuscrito en su página con un destino tipado",async()=>{
  vi.mocked(searchSavedProjectContent).mockResolvedValue({...response,results:[{documentId:"p::Sketch.knote",name:"Sketch.knote",path:"Sketch.knote",kind:"handwritten-note",pageId:"page-2",pageNumber:2,line:1,excerpt:"Decisión revisada"}]});
  const {input,select}=setup();fireEvent.click(screen.getByRole("button",{name:"Contenido guardado"}));fireEvent.change(input,{target:{value:"decisión"}});fireEvent.keyDown(input,{key:"Enter"});
  await screen.findByRole("option",{name:/Sketch.knote.*página 2.*línea 1/});fireEvent.keyDown(input,{key:"Enter"});
  expect(select).toHaveBeenCalledWith("p::Sketch.knote","handwritten-note","Sketch.knote",{kind:"handwritten-page",pageId:"page-2"});
});
it("opens a recent document by keyboard and routes an existing action",()=>{
  const {input,select,close}=setup();
  fireEvent.keyDown(input,{key:"ArrowDown"});fireEvent.keyDown(input,{key:"Enter"});
  expect(select).toHaveBeenCalledWith("a","document","a.md");expect(close).toHaveBeenCalledOnce();
});
it("searches saved content only after explicit submission and reports partial scope",async()=>{
  vi.mocked(searchSavedProjectContent).mockResolvedValue(response);
  const {input,select}=setup();
  fireEvent.click(screen.getByRole("button",{name:"Contenido guardado"}));
  fireEvent.change(input,{target:{value:"decision"}});
  expect(searchSavedProjectContent).not.toHaveBeenCalled();
  fireEvent.keyDown(input,{key:"Enter"});
  await screen.findByText(/la búsqueda puede ser parcial/);
  fireEvent.keyDown(input,{key:"Enter"});
  expect(select).toHaveBeenCalledWith("a","document","a.md");
});
it("ignores an older response after the query changes",async()=>{
  let resolve!: (result:LocalSearchResponse)=>void;
  vi.mocked(searchSavedProjectContent).mockImplementation(()=>new Promise(done=>{resolve=done;}));
  const {input}=setup();
  fireEvent.click(screen.getByRole("button",{name:"Contenido guardado"}));
  fireEvent.change(input,{target:{value:"decision"}});fireEvent.keyDown(input,{key:"Enter"});
  fireEvent.change(input,{target:{value:"other"}});resolve(response);
  await waitFor(()=>expect(screen.queryByText("decision local")).not.toBeInTheDocument());
  expect(input).toHaveValue("other");
});
