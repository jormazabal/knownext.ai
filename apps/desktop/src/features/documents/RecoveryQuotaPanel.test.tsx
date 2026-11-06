import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {getRecoveryQuotas} from "../../lib/api/recoveryQuotas";
import {RecoveryQuotaPanel} from "./RecoveryQuotaPanel";
import type {RecoveryQuotaInventory,RecoveryQuotaItem} from "../../types/recoveryQuotas";
vi.mock("../../lib/api/recoveryQuotas",()=>({getRecoveryQuotas:vi.fn()}));afterEach(()=>{cleanup();vi.resetAllMocks();});
const row:RecoveryQuotaItem={id:"a".repeat(64),family:"mixed-reviews",scope:"project",projectId:"owned",projectName:"Proyecto",entries:64,bytes:100,maxEntries:64,maxBytes:16*1024**2,complete:true,status:"full",contentsVerified:false,idsRetainedOnPayloadRetirement:true};
const value:RecoveryQuotaInventory={schemaVersion:1,checkedAt:"2026-11-04T12:00:00Z",scope:"known-admission-scopes-metadata",complete:true,limited:false,projectMappingComplete:true,items:[row],cleanupAvailable:false,limits:{entries:10000,scopes:200,milliseconds:2000}};
async function open(){fireEvent.click(screen.getByText("Cupos de registros"));fireEvent.click(screen.getByRole("button",{name:"Revisar cupos"}));}
it("measures only on request and explains why retiring payloads never frees identity slots",async()=>{
 vi.mocked(getRecoveryQuotas).mockResolvedValue(value);render(<RecoveryQuotaPanel/>);expect(getRecoveryQuotas).not.toHaveBeenCalled();await open();await screen.findByText("64 de 64 registros");expect(screen.getByText("Límite alcanzado en los metadatos observados")).toBeInTheDocument();expect(screen.getByText(/Reducir sus archivos conserva los registros/)).toBeInTheDocument();expect(screen.queryByRole("button",{name:/Eliminar|Liberar|Retirar|Confirmar/})).not.toBeInTheDocument();expect(getRecoveryQuotas).toHaveBeenCalledTimes(1);
});
it("shows partial anonymous scopes as lower bounds and discards a stale result after failed refresh",async()=>{
 vi.mocked(getRecoveryQuotas).mockResolvedValueOnce({...value,complete:false,limited:true,projectMappingComplete:false,items:[{...row,projectId:null,projectName:null,entries:3,complete:false,status:"partial"}]}).mockRejectedValue(new Error("Consulta interrumpida"));render(<RecoveryQuotaPanel/>);await open();await screen.findByText("≥ 3 de 64 registros");expect(screen.getByText("Proyecto sin asociación comprobada")).toBeInTheDocument();expect(screen.getByText(/No se pudo comprobar el catálogo/)).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Actualizar cupos"}));await screen.findByRole("alert");expect(screen.queryByText("≥ 3 de 64 registros")).not.toBeInTheDocument();await waitFor(()=>expect(getRecoveryQuotas).toHaveBeenCalledTimes(2));
});
