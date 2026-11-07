import { cleanup,render,screen,waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { useRef,useState } from "react";
import { getRetiredProjects,restoreRetiredProject } from "../../lib/api/projectLifecycle";
import type { Project } from "../../types/domain";
import type { RetiredProjects,RestoredProject } from "../../types/projectLifecycle";
import { ProjectSelector } from "./ProjectSelector";
import { RetiredProjectsDialog } from "./RetiredProjectsDialog";
vi.mock("../../lib/api/projectLifecycle",()=>({getRetiredProjects:vi.fn(),restoreRetiredProject:vi.fn()}));
const entry={id:"p",name:"Original",folderPath:"C:/QA/Documentos",retiredAt:"2026-10-31T20:00:00Z",revision:"native",registered:false,originalFolderVerified:true};
const inventory=(registered=false):RetiredProjects=>({schemaVersion:1,entries:[{...entry,registered}],checkedAt:entry.retiredAt,scope:"this-device",maximumEntries:256});
const project:Project={id:"p",name:"Original",folderPath:entry.folderPath,icon:"folder",iconColor:"#F37021",storageMode:"local-files",versioningMode:"none",syncMode:"none",authRequired:false,isGitRepository:false,active:false};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getRetiredProjects).mockResolvedValue(inventory());vi.mocked(restoreRetiredProject).mockResolvedValue({project,alreadyRegistered:false,syncPaused:true,checkedAt:entry.retiredAt});});afterEach(cleanup);

it("keeps the typed name, revision and form visible after a native collision",async()=>{
  vi.mocked(restoreRetiredProject).mockRejectedValue(new Error("Ya hay un proyecto con ese nombre"));render(<RetiredProjectsDialog onClose={()=>{}} onCatalogChanged={async()=>{}}/>);
  const input=await screen.findByLabelText("Nombre al reincorporar Original");await userEvent.clear(input);await userEvent.type(input,"Otro nombre");await userEvent.click(screen.getByRole("button",{name:"Reincorporar Original"}));await screen.findByRole("alert");expect(input).toHaveValue("Otro nombre");expect(restoreRetiredProject).toHaveBeenCalledWith("p","native","Otro nombre");expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("a pending restore owns Escape and blocks repeated activation",async()=>{
  let resolve!:(value:RestoredProject)=>void;vi.mocked(restoreRetiredProject).mockImplementation(()=>new Promise(done=>{resolve=done;}));const close=vi.fn();render(<RetiredProjectsDialog onClose={close} onCatalogChanged={async()=>{}}/>);
  await screen.findByLabelText("Nombre al reincorporar Original");await userEvent.click(screen.getByRole("button",{name:"Reincorporar Original"}));await userEvent.keyboard("{Escape}");expect(close).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"Cerrar"})).toBeDisabled();expect(restoreRetiredProject).toHaveBeenCalledTimes(1);resolve({project,alreadyRegistered:false,syncPaused:true,checkedAt:entry.retiredAt});await waitFor(()=>expect(screen.getByRole("button",{name:"Cerrar"})).not.toBeDisabled());
});

it("restoring the first project returns focus to the new selector when its original trigger disappeared",async()=>{
  vi.mocked(getRetiredProjects).mockResolvedValue(inventory(true)).mockResolvedValueOnce(inventory());
  function Harness(){const [open,setOpen]=useState(false);const [projects,setProjects]=useState<Project[]>([]);const focus=useRef<(()=>HTMLElement|null)|null>(null);return <><ProjectSelector projects={projects} activeProject={null} onSelectProject={()=>{}} onCreateProject={()=>{}} onRetiredProjects={reader=>{focus.current=reader;setOpen(true);}}/>{open&&<RetiredProjectsDialog onClose={()=>setOpen(false)} fallbackFocus={()=>focus.current?.()??null} onCatalogChanged={async()=>{setProjects([project]);}}/>}</>;}
  render(<Harness/>);await userEvent.click(screen.getByRole("button",{name:"Proyectos retirados…"}));await screen.findByLabelText("Nombre al reincorporar Original");await userEvent.click(screen.getByRole("button",{name:"Reincorporar Original"}));await screen.findByText(/Proyecto reincorporado con sincronización en pausa/);await userEvent.click(screen.getByRole("button",{name:"Cerrar"}));await waitFor(()=>expect(screen.getByRole("button",{name:"Sin proyecto activo"})).toHaveFocus());
});
