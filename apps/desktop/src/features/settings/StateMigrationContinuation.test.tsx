import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {StateMigrationPanel} from "./StateMigrationPanel";
import * as api from "../../lib/api/stateMigrations";
vi.mock("../../lib/api/stateMigrations");
afterEach(()=>{cleanup();vi.resetAllMocks();});
function pending(){vi.mocked(api.reviewUpgradeRecovery).mockResolvedValue({schemaVersion:1,id:'migration-owned',revision:'reviewed',checkedAt:'now',canRestore:true,canComplete:true,journalStatus:'applying',entries:[{id:'config',filename:'config.json',status:'applied',fingerprint:'first',backupVerified:true},{id:'projects',filename:'projects.json',status:'original',fingerprint:'second',backupVerified:true}]});}
it("protects work before completing a reviewed interrupted update and reports lost ACK without replay",async()=>{
 pending();const events:string[]=[],settled=vi.fn();vi.mocked(api.completeUpgradeRecovery).mockImplementation(async()=>{events.push('complete');throw Error('ACK perdido; consultar estado');});const previous=HTMLElement.prototype.scrollIntoView;HTMLElement.prototype.scrollIntoView=vi.fn();
 try{render(<StateMigrationPanel initialRecoveryId="migration-owned" onBeforeChange={async()=>{events.push('protected');}} onSettled={settled}/>);fireEvent.click(await screen.findByRole('button',{name:'Completar actualización revisada'}));expect(await screen.findByRole('alert')).toHaveTextContent('ACK perdido');expect(events).toEqual(['protected','complete']);expect(api.completeUpgradeRecovery).toHaveBeenCalledTimes(1);expect(api.completeUpgradeRecovery).toHaveBeenCalledWith('migration-owned','reviewed');expect(settled).toHaveBeenCalledTimes(1);expect(settled).toHaveBeenCalledWith({confirmed:false,message:'ACK perdido; consultar estado'});expect(screen.queryByRole('button',{name:'Completar actualización revisada'})).toBeNull();}finally{HTMLElement.prototype.scrollIntoView=previous;}
});
it("keeps continuation read-only without workspace authority and never dispatches after protection fails",async()=>{
 pending();const first=render(<StateMigrationPanel initialRecoveryId="migration-owned"/>);expect(await screen.findByRole('button',{name:'Completar actualización revisada'})).toBeDisabled();first.unmount();const previous=HTMLElement.prototype.scrollIntoView;HTMLElement.prototype.scrollIntoView=vi.fn();
 try{render(<StateMigrationPanel initialRecoveryId="migration-owned" onBeforeChange={async()=>{throw Error('Ajustes pendientes');}} onSettled={vi.fn()}/>);fireEvent.click(await screen.findByRole('button',{name:'Completar actualización revisada'}));expect(await screen.findByRole('alert')).toHaveTextContent('Ajustes pendientes');await waitFor(()=>expect(screen.getByRole('button',{name:'Completar actualización revisada'})).toBeEnabled());expect(api.completeUpgradeRecovery).not.toHaveBeenCalled();}finally{HTMLElement.prototype.scrollIntoView=previous;}
});
