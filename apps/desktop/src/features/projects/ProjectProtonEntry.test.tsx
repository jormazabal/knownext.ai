import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { ModalFrame } from "../../components/ui/ModalFrame";
import type { Project } from "../../types/domain";

vi.mock("../cloudSync/CloudSyncDialog",()=>({CloudSyncDialog:({project,initialProvider,onClose}:{project:Project;initialProvider:string;onClose:()=>void})=><ModalFrame label="Conexión de prueba" onClose={onClose}><p>{project.id} · {initialProvider}</p><button onClick={onClose}>Volver a editar</button></ModalFrame>}));
afterEach(cleanup);
it("opens the edited project's Proton connection and retains unsaved project fields on return",async()=>{
  const project:Project={id:"edited-project",name:"Original",folderPath:"C:/Docs",icon:"folder",iconColor:"#F37021",storageMode:"local-files",versioningMode:"none",syncMode:"none",authRequired:false,isGitRepository:false,githubRepository:null};
  const save=vi.fn();
  render(<CreateProjectDialog open mode="edit" project={project} onClose={vi.fn()} onCreate={vi.fn()} onUpdate={save}/>);
  await userEvent.clear(screen.getByLabelText("Nombre del proyecto"));await userEvent.type(screen.getByLabelText("Nombre del proyecto"),"Nombre pendiente");
  const entry=screen.getByRole("button",{name:"Configurar Proton Drive"});await userEvent.click(entry);
  const connection=screen.getByRole("dialog",{name:"Conexión de prueba"});expect(connection).toHaveTextContent("edited-project · proton-drive");
  await userEvent.click(within(connection).getByRole("button",{name:"Volver a editar"}));
  expect(screen.getByLabelText("Nombre del proyecto")).toHaveValue("Nombre pendiente");expect(entry).toHaveFocus();expect(save).not.toHaveBeenCalled();
});
