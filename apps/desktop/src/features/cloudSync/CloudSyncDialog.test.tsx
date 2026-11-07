import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import * as api from "../../lib/api/cloudSync";
import * as projects from "../../lib/api/projects";
import * as protonDirect from "../../lib/api/protonDirect";
import {CloudSyncDialog, CloudSyncSteps} from "./CloudSyncDialog";
import type {CloudSyncCapabilities, CloudSyncReview, CloudSyncStatus} from "../../types/cloudSync";

const status: CloudSyncStatus = {projectId:"owned",provider:"none",binding:null,state:"local",label:"Local",detail:"Archivos conservados",canApply:true};
const capabilities: CloudSyncCapabilities = {providers:[{id:"onedrive",label:"OneDrive",available:false,status:"not-configured",reason:"Registro OAuth Microsoft pendiente",platforms:["windows"]}]};
const review: CloudSyncReview = {id:"review-owned",projectId:"owned",revision:"revision-owned",provider:"none",accountId:null,status:"ready",canApply:true,createdAt:"2026-11-06",summary:{documents:2,resources:1,bytes:1024,history:"local-only"},warnings:["Se conservan las copias remotas"],blockers:[]};
const cancelled = {id:review.id,revision:review.revision,projectId:"owned",status:"cancelled" as const,provider:"none" as const,generation:1,completedAt:"2026-11-06",remoteConfirmed:false,documentsPreserved:true};
afterEach(() => {cleanup(); vi.restoreAllMocks();});
const show = () => render(<CloudSyncSteps project={{id:"owned",name:"Proyecto propio"}} status={status} capabilities={capabilities} onClose={vi.fn()}/>);

describe("CloudSyncSteps", () => {
  it("checks the exact review before applying and reports only the runtime result", async () => {
    const inspect = vi.spyOn(api,"reviewCloudSync").mockResolvedValue(review);
    const apply = vi.spyOn(api,"applyCloudSync").mockResolvedValue({id:review.id,revision:review.revision,projectId:"owned",status:"active-local",provider:"none",generation:1,completedAt:"2026-11-06",remoteConfirmed:false,documentsPreserved:true});
    show();
    fireEvent.click(screen.getByRole("button",{name:"Comprobar alcance"}));
    expect(await screen.findByRole("heading",{name:"Revisión del cambio"})).toBeInTheDocument();
    expect(inspect).toHaveBeenCalledWith("owned","none");
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Usar sólo este dispositivo"}));
    expect(await screen.findByRole("heading",{name:"Configuración local confirmada"})).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("no confirma una transferencia a la nube");
    expect(apply).toHaveBeenCalledWith("owned",review);
  });
  it("preserves the reviewed destination after a failed activation and allows returning", async () => {
    vi.spyOn(api,"reviewCloudSync").mockResolvedValue(review);
    vi.spyOn(api,"applyCloudSync").mockRejectedValue(new Error("La revisión cambió; vuelve a comprobar"));
    const cancel=vi.spyOn(api,"cancelCloudSync").mockResolvedValue(cancelled);
    show(); fireEvent.click(screen.getByRole("button",{name:"Comprobar alcance"}));
    fireEvent.click(await screen.findByRole("button",{name:"Usar sólo este dispositivo"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("La revisión cambió");
    expect(screen.getByRole("heading",{name:"Revisión del cambio"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Cancelar preparación y volver"}));
    expect(await screen.findByRole("radio",{name:"Sólo en este dispositivo"})).toBeChecked();
    expect(cancel).toHaveBeenCalledWith("owned",review);
  });
  it("exposes missing setup and blockers without enabling cloud activation", async () => {
    vi.spyOn(api,"reviewCloudSync").mockResolvedValue({...review,provider:"onedrive",status:"requires-connection",canApply:false,blockers:["Falta autorización Microsoft"]});
    const apply=vi.spyOn(api,"applyCloudSync");
    show(); fireEvent.click(screen.getByRole("radio",{name:/OneDrive/}));
    expect(screen.getByRole("status")).toHaveTextContent("Registro OAuth Microsoft pendiente");
    fireEvent.click(screen.getByRole("button",{name:"Comprobar alcance"}));
    expect(await screen.findByText("Falta autorización Microsoft")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Activar sincronización"})).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
  });
  it("recovers a pending review and preserves it when cancellation fails", async () => {
    const cancel=vi.spyOn(api,"cancelCloudSync").mockRejectedValue(new Error("No se pudo guardar el recibo"));
    render(<CloudSyncSteps project={{id:"owned",name:"Proyecto propio"}} status={{...status,activeMigration:review}} capabilities={capabilities} onClose={vi.fn()}/>);
    expect(screen.getByText(/Se ha recuperado una preparación pendiente/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Cancelar preparación y volver"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cancelar");
    expect(screen.getByRole("heading",{name:"Revisión del cambio"})).toBeInTheDocument();
    expect(cancel).toHaveBeenCalledWith("owned",review);
  });
  it("keeps the dialog open if closing cannot cancel a recovered preparation", async () => {
    vi.spyOn(projects,"getActiveProject").mockResolvedValue({id:"owned",name:"Proyecto propio",folderPath:"/owned",icon:"folder",iconColor:"#F37021",storageMode:"local-files",versioningMode:"none",syncMode:"none",authRequired:false,isGitRepository:false});
    vi.spyOn(api,"getCloudSyncCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(api,"getCloudSyncStatus").mockResolvedValue({...status,activeMigration:review});
    const cancel=vi.spyOn(api,"cancelCloudSync").mockRejectedValue(new Error("Consulta pendiente"));
    const close=vi.fn(); render(<CloudSyncDialog onClose={close}/>);
    await screen.findByRole("heading",{name:"Revisión del cambio"});
    fireEvent.click(screen.getByRole("button",{name:"Cerrar sincronización"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Se conserva para revisión");
    expect(cancel).toHaveBeenCalledWith("owned",review);
    expect(close).not.toHaveBeenCalled();
  });
  it("blocks folder onboarding even when an older runtime advertises Proton as available", async () => {
    const inspect=vi.spyOn(api,"reviewCloudSync");
    const apply=vi.spyOn(api,"applyCloudSync");
    render(<CloudSyncSteps project={{id:"owned",name:"Proyecto propio"}} status={status} capabilities={{providers:[{id:"proton-drive",label:"Proton Drive",available:true,status:"available",reason:"Mediante cliente oficial Windows",platforms:["windows"]}]}} onClose={vi.fn()}/>);
    fireEvent.click(screen.getByRole("radio",{name:/Proton Drive/}));
    expect(screen.getByRole("button",{name:"Configurar conexión directa"})).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("conexión directa");
    expect(screen.queryByText("Mediante cliente oficial Windows")).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Configurar Proton Drive"})).not.toBeInTheDocument();
    vi.spyOn(protonDirect,"getProtonAccount").mockResolvedValue({available:false,reason:"SDK no disponible",account:null,attempt:null});
    vi.spyOn(protonDirect,"getProtonDirectStatus").mockResolvedValue({projectId:"owned",binding:null,state:"local",detail:"Local",paused:false,remoteConfirmed:false});
    fireEvent.click(screen.getByRole("button",{name:"Configurar conexión directa"}));
    expect(await screen.findByRole("button",{name:"Conectar con Proton"})).toBeDisabled();
    expect(inspect).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
  it("preserves an old Proton association and only queries its status", async () => {
    const legacy={...status,provider:"proton-drive" as const,state:"proton-folder",label:"Intercambio anterior",detail:"Cliente externo"};
    const refresh=vi.spyOn(api,"getCloudSyncStatus").mockResolvedValue(legacy);
    const apply=vi.spyOn(api,"applyCloudSync");
    render(<CloudSyncSteps project={{id:"owned",name:"Proyecto propio"}} status={legacy} capabilities={{providers:[{id:"proton-drive",label:"Proton Drive",available:false,status:"pending",reason:"Pendiente",platforms:["windows","android"]}]}} onClose={vi.fn()}/>);
    expect(screen.getByText(/Los documentos y las operaciones pendientes se conservan/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Consultar estado anterior"}));
    await screen.findByRole("button",{name:"Configurar conexión directa"});
    expect(refresh).toHaveBeenCalledWith("owned");
    expect(apply).not.toHaveBeenCalled();
    expect(screen.queryByRole("button",{name:"Publicar"})).not.toBeInTheDocument();
  });
  it("recognizes a direct Proton binding without showing legacy recovery",async()=>{
    const direct={...status,provider:"proton-drive" as const,state:"proton-direct",label:"Proton Drive",detail:"Sincronización automática activa.",binding:{provider:"proton-drive" as const,accountId:"account-owned",generation:1}};
    vi.spyOn(protonDirect,"getProtonAccount").mockResolvedValue({available:true,account:{id:"account-owned",label:"Cuenta asociada",state:"connected"},attempt:null});
    vi.spyOn(protonDirect,"getProtonDirectStatus").mockResolvedValue({projectId:"owned",binding:{accountId:"account-owned",remoteRootId:"root-owned",logicalProjectId:"logical-owned",generation:1},state:"pending",detail:"Cambios locales pendientes",paused:false,remoteConfirmed:false});
    render(<CloudSyncSteps project={{id:"owned",name:"Proyecto propio"}} status={direct} capabilities={{providers:[{id:"proton-drive",label:"Proton Drive",available:true,status:"available",platforms:["windows","android"]}]}} onClose={vi.fn()}/>);
    expect(screen.getByText("Proton Drive. Sincronización automática activa.")).toBeInTheDocument();
    expect(screen.queryByText(/Asociación Proton anterior pendiente/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Consultar estado anterior"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Configurar conexión directa"}));
    expect(await screen.findByText("Cuenta asociada")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Sincronizar ahora"})).toBeEnabled();
  });
  it("cannot activate an old Proton preparation even if its saved review says it can apply", () => {
    const oldReview={...review,provider:"proton-drive" as const};
    render(<CloudSyncSteps project={{id:"owned",name:"Proyecto propio"}} status={{...status,activeMigration:oldReview}} capabilities={capabilities} onClose={vi.fn()}/>);
    expect(screen.getByRole("button",{name:"Activar sincronización"})).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Esta preparación anterior no se puede activar");
  });
});
