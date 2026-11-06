import { updateAppConfig } from "../../lib/api/config";
import { getRetiredProjects, retireProject } from "../../lib/api/projectLifecycle";
import { listProjects } from "../../lib/api/projects";
import type { AppConfigUpdate, Project } from "../../types/domain";

/** A superseded settings write is not an ACK for this critical checkpoint. */
export async function retireProjectWithWorkspace(
  id:string, workspace:AppConfigUpdate,
  submit:(write:()=>Promise<void>)=>Promise<boolean>,
):Promise<Project[]> {
  let acknowledged=false;
  const saved=await submit(async()=>{await updateAppConfig(workspace);acknowledged=true;});
  if(!saved||!acknowledged)throw new Error("No se pudo confirmar la conservación de pestañas y navegación. El proyecto sigue en la aplicación; vuelve a intentarlo.");
  try{return await retireProject(id);}
  catch(cause){
    try{
      const inventory=await getRetiredProjects();
      const projects=await listProjects();
      if(inventory.entries.some(entry=>entry.id===id&&!entry.registered)&&!projects.some(project=>project.id===id))return projects;
    }catch{/* Unknown outcome: retain the caller's review and original error. */}
    throw cause;
  }
}
