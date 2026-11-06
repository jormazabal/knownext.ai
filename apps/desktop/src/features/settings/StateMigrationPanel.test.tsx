import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {StateMigrationPanel} from "./StateMigrationPanel";
import * as api from "../../lib/api/stateMigrations";
vi.mock("../../lib/api/stateMigrations");
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it("moves focus to confirmation after the reviewed recovery collapses and never replays it",async()=>{
  const scroll=vi.fn();
  const previous=HTMLElement.prototype.scrollIntoView;HTMLElement.prototype.scrollIntoView=scroll;
  vi.mocked(api.reviewStateUpgrade).mockResolvedValue({schemaVersion:1,id:"review",target:"3.0",checkedAt:"now",revision:"current",entries:[],canApply:false,scope:"critical-state-only"});
  vi.mocked(api.listUpgradeRecoveries).mockResolvedValue({entries:[{id:"migration-owned",createdAt:null,status:"completed",canReview:true}],limited:false,checkedAt:"now"});
  vi.mocked(api.reviewUpgradeRecovery).mockResolvedValue({schemaVersion:1,id:"migration-owned",checkedAt:"now",revision:"restore",entries:[],canRestore:true,journalStatus:"completed"});
  vi.mocked(api.restoreUpgradeRecovery).mockResolvedValue({id:"migration-owned",status:"restored",message:"Originales recuperados",canReview:true,checkedAt:"now"});
  try{render(<StateMigrationPanel onBeforeChange={async()=>{}} onSettled={vi.fn()}/>);fireEvent.click(screen.getByText("Compatibilidad y recuperación de datos"));fireEvent.click(screen.getByRole("button",{name:"Revisar estado actual"}));fireEvent.click(await screen.findByRole("button",{name:"Revisar recuperación"}));fireEvent.click(await screen.findByRole("button",{name:"Recuperar originales revisados"}));const result=await screen.findByRole("status");await waitFor(()=>expect(result).toHaveFocus());expect(scroll).toHaveBeenCalled();expect(api.restoreUpgradeRecovery).toHaveBeenCalledTimes(1);}finally{HTMLElement.prototype.scrollIntoView=previous;}
});
it("protects work before dispatch and reports an uncertain outcome once without replay",async()=>{
  vi.mocked(api.restoreUpgradeRecovery).mockReset();
  vi.mocked(api.reviewStateUpgrade).mockResolvedValue({schemaVersion:1,id:"review",target:"3.0",checkedAt:"now",revision:"current",entries:[],canApply:false,scope:"critical-state-only"});
  vi.mocked(api.listUpgradeRecoveries).mockResolvedValue({entries:[{id:"migration-owned",createdAt:null,status:"completed",canReview:true}],limited:false,checkedAt:"now"});
  vi.mocked(api.reviewUpgradeRecovery).mockResolvedValue({schemaVersion:1,id:"migration-owned",checkedAt:"now",revision:"restore",entries:[],canRestore:true,journalStatus:"completed"});
  const events:string[]=[],settled=vi.fn();vi.mocked(api.restoreUpgradeRecovery).mockImplementation(async()=>{events.push("native");throw Error("ACK perdido");});
  const previous=HTMLElement.prototype.scrollIntoView;HTMLElement.prototype.scrollIntoView=vi.fn();
  try{render(<StateMigrationPanel onBeforeChange={async()=>{events.push("protected");}} onSettled={settled}/>);fireEvent.click(screen.getByText("Compatibilidad y recuperación de datos"));fireEvent.click(screen.getByRole("button",{name:"Revisar estado actual"}));fireEvent.click(await screen.findByRole("button",{name:"Revisar recuperación"}));fireEvent.click(await screen.findByRole("button",{name:"Recuperar originales revisados"}));expect(await screen.findByRole("alert")).toHaveTextContent("ACK perdido");expect(events).toEqual(["protected","native"]);expect(settled).toHaveBeenCalledTimes(1);expect(settled).toHaveBeenCalledWith({confirmed:false,message:"ACK perdido"});expect(api.restoreUpgradeRecovery).toHaveBeenCalledTimes(1);}finally{HTMLElement.prototype.scrollIntoView=previous;}
});
