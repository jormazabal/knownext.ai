import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {DocumentInfoPanel} from "./DocumentInfoPanel";
import type {DocumentRecord,Project} from "../../types/domain";

afterEach(cleanup);
const project:Project={id:"p",name:"Equipo",folderPath:"C:/docs",icon:"folder",iconColor:"#F37021",storageMode:"local-files",versioningMode:"none",syncMode:"none",authRequired:false,githubRepository:null,isGitRepository:false};
const document:DocumentRecord={id:"p::docs/Plan.md",name:"Plan.md",path:"docs/Plan.md",projectId:"p",markdown:"Draft",wordCount:1,updatedAt:"now"};
const props={tab:{id:document.id,name:document.name,kind:"document" as const},project,document,note:null,image:null,dirty:true,saveState:"idle" as const,versioning:null,onConfigureProject:vi.fn()};

it("shows the active document and distinguishes pending work from a confirmed save",()=>{
  const configure=vi.fn();const view=render(<DocumentInfoPanel {...props} onConfigureProject={configure}/>);
  expect(screen.getByRole("status")).toHaveTextContent("Cambios pendientes");
  expect(screen.getByText("docs/Plan.md")).toBeInTheDocument();expect(screen.getByText("1 palabra")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Configurar este proyecto"}));expect(configure).toHaveBeenCalledOnce();
  view.rerender(<DocumentInfoPanel {...props} dirty={false}/>);
  expect(screen.getByRole("status")).toHaveTextContent("Guardado en el dispositivo");
  view.rerender(<DocumentInfoPanel {...props} dirty={false} needsReview/>);
  expect(screen.getByRole("status")).toHaveTextContent("Requiere revisar");
});

it("never labels personal notes as belonging to the current project",()=>{
  render(<DocumentInfoPanel {...props} tab={{kind:"notes",id:"user-notes",name:"Notas",utilityTabId:"notes"}}/>);
  expect(screen.getByText("Personal · este dispositivo")).toBeInTheDocument();
  expect(screen.queryByText("Equipo")).not.toBeInTheDocument();
  expect(screen.queryByText("docs/Plan.md")).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Configurar este proyecto"})).not.toBeInTheDocument();
});

it("does not display the previous file metadata as a new document loads or fails",()=>{
  const tab={id:"p::other.md",name:"Other.md",kind:"document" as const};
  const view=render(<DocumentInfoPanel {...props} tab={tab} dirty={false}/>);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando información");
  expect(screen.queryByText("docs/Plan.md")).not.toBeInTheDocument();expect(screen.queryByText("1 palabra")).not.toBeInTheDocument();
  view.rerender(<DocumentInfoPanel {...props} tab={tab} loadError="Unavailable"/>);
  expect(screen.getByRole("status")).toHaveTextContent("Información no disponible");
  expect(screen.getByRole("status")).not.toHaveTextContent("Guardado en el dispositivo");
});
