import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import * as api from "../../lib/api/protonSync";
import * as folders from "../../lib/runtime/folders";
import {ProtonSyncPanel} from "./ProtonSyncPanel";
import type {ProtonStatus} from "../../types/protonSync";
const local:ProtonStatus={projectId:"owned",binding:null,generation:0,state:"local",detail:"Proyecto local conservado"};
const linked:ProtonStatus={...local,binding:{folderPath:"C:/Proton/Intercambio",logicalProjectId:"shared-owned",deviceId:"device-owned",generation:1},generation:1,state:"connected-local",detail:"Carpeta de intercambio configurada"};
const receipt={projectId:"owned",updatedAt:"2026-11-06",remoteConfirmed:false as const,status:"handed-off",publicationId:"publication-owned"};
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe("ProtonSyncPanel",()=>{
  it("selects a native folder, reviews, and connects only the reviewed identity",async()=>{
    vi.spyOn(folders,"selectProjectFolder").mockResolvedValue("C:/Proton/Intercambio");
    const review=vi.spyOn(api,"reviewProton").mockResolvedValue({id:"review",revision:"base",projectId:"owned",folderPath:"C:/Proton/Intercambio",logicalProjectId:"shared-owned",canConnect:true,blockers:[],warnings:["Entrega de nube no confirmada"],summary:{}});
    const connect=vi.spyOn(api,"connectProton").mockResolvedValue({...receipt,status:"connected-local"});
    vi.spyOn(api,"getProtonStatus").mockResolvedValue(linked);
    render(<ProtonSyncPanel projectId="owned" initialStatus={local} onBack={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:"Seleccionar carpeta de intercambio"}));
    expect(await screen.findByDisplayValue("C:/Proton/Intercambio")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Verificar carpeta"}));
    expect(await screen.findByRole("heading",{name:"Revisión de la conexión"})).toBeInTheDocument();
    expect(connect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Conectar carpeta"}));
    expect(await screen.findByLabelText("ID del proyecto compartido conectado")).toHaveValue("shared-owned");
    expect(review).toHaveBeenCalledWith("owned","C:/Proton/Intercambio",undefined);
    expect(connect.mock.calls[0][1]).toMatchObject({id:"review",revision:"base"});
    expect(screen.getByRole("status")).toHaveTextContent("No se ha confirmado ninguna transferencia a la nube");
  });
  it("reports publication as a handoff, never as confirmed cloud sync",async()=>{
    vi.spyOn(api,"publishProton").mockResolvedValue(receipt);vi.spyOn(api,"getProtonStatus").mockResolvedValue(linked);
    render(<ProtonSyncPanel projectId="owned" initialStatus={linked} onBack={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:"Publicar copia"}));
    expect(await screen.findByText("Entregado a la carpeta Proton; nube no confirmada.")).toBeInTheDocument();
  });
  it("shows preserved differences and blocks an incompatible receive",async()=>{
    vi.spyOn(api,"getProtonInbox").mockResolvedValue({projectId:"owned",items:[{schemaVersion:1,projectId:"shared-owned",publicationId:"publication-owned",senderId:"other-device",parentPublication:null,files:{"Nota.md":{sha256:"fixture",bytes:10}}}]});
    vi.spyOn(api,"reviewProtonReceive").mockResolvedValue({id:"receive",revision:"base",canApply:false,additions:[],identical:[],conflicts:["Nota.md"],warnings:["El documento local se conserva"]});
    const apply=vi.spyOn(api,"applyProtonReceive");
    render(<ProtonSyncPanel projectId="owned" initialStatus={linked} onBack={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:"Comprobar recibidos"}));
    fireEvent.click(await screen.findByRole("button",{name:"Revisar publicación"}));
    expect(await screen.findByText("Diferencias conservadas sin sobrescribir (1)")).toBeInTheDocument();
    expect(screen.getByText("Nota.md")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Aplicar cambios compatibles"})).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
  });
  it("disconnects only the observed generation after explicit review",async()=>{
    const disconnect=vi.spyOn(api,"disconnectProton").mockResolvedValue({...receipt,status:"disconnected-local",documentsPreserved:true});vi.spyOn(api,"getProtonStatus").mockResolvedValue({...local,generation:2});
    render(<ProtonSyncPanel projectId="owned" initialStatus={linked} onBack={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:"Desconectar Proton"}));
    expect(disconnect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Desconectar carpeta"}));
    expect(await screen.findByText("Carpeta desconectada; los documentos se conservan.")).toBeInTheDocument();
    expect(disconnect).toHaveBeenCalledWith("owned",1);
  });
  it("keeps the association visible after a failed publication",async()=>{
    vi.spyOn(api,"publishProton").mockRejectedValue(new Error("La carpeta no está disponible; consulta el estado"));
    render(<ProtonSyncPanel projectId="owned" initialStatus={linked} onBack={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:"Publicar copia"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("La carpeta no está disponible");
    expect(screen.getByLabelText("ID del proyecto compartido conectado")).toHaveValue("shared-owned");
  });
  it("reviews and applies a compatible update by its exact receipt",async()=>{
    const review={id:"receive-update",revision:"base-update",canApply:true,additions:[],updates:["Nota.md"],pendingDeletions:[],keepLocal:[],identical:[],conflicts:[],warnings:["Se conserva una copia anterior"]};
    const apply=vi.spyOn(api,"applyProtonReceive").mockResolvedValue({...receipt,status:"received-local",added:[],updated:["Nota.md"]});
    vi.spyOn(api,"getProtonStatus").mockResolvedValue(linked);
    render(<ProtonSyncPanel projectId="owned" initialStatus={{...linked,receiveReview:review}} onBack={vi.fn()}/>);
    expect(screen.getByText("Actualizaciones compatibles (1)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Aplicar cambios compatibles"}));
    expect(await screen.findByText(/0 nuevos y 1 actualizados/)).toBeInTheDocument();
    expect(apply).toHaveBeenCalledWith("owned",review);
  });
  it("blocks pending deletions and preserves their visible review",()=>{
    const apply=vi.spyOn(api,"applyProtonReceive");
    render(<ProtonSyncPanel projectId="owned" initialStatus={{...linked,receiveReview:{id:"receive-delete",revision:"base-delete",canApply:false,additions:[],updates:[],pendingDeletions:["Pendiente.md"],identical:[],conflicts:[],warnings:[]}}} onBack={vi.fn()}/>);
    expect(screen.getByText("Borrados pendientes: requieren revisión (1)")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Aplicar cambios compatibles"})).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
  });
  it("shows an interrupted attempt without treating it as an applicable review",async()=>{
    vi.spyOn(api,"getProtonStatus").mockResolvedValue(linked);
    render(<ProtonSyncPanel projectId="owned" initialStatus={{...linked,activeReceive:{publicationId:"interrupted",status:"applying"}}} onBack={vi.fn()}/>);
    expect(screen.getByRole("alert")).toHaveTextContent("resultado pendiente de consulta");
    expect(screen.getByRole("button",{name:"Publicar copia"})).toBeDisabled();
    expect(screen.queryByRole("button",{name:"Aplicar cambios compatibles"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Consultar estado"}));
    expect(await screen.findByRole("button",{name:"Publicar copia"})).toBeEnabled();
  });
});
