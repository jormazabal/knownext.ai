import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {MigrationRetentionPanel} from "./MigrationRetentionPanel";
import * as api from "../../lib/api/migrationRetention";
import {listUpgradeRecoveries} from "../../lib/api/stateMigrations";
import type {MigrationRetentionReview} from "../../types/migrationRetention";
vi.mock("../../lib/api/migrationRetention");vi.mock("../../lib/api/stateMigrations");
afterEach(()=>{cleanup();vi.resetAllMocks();});
const archived:MigrationRetentionReview={id:'migration-owned',phase:'archived',revision:'owned-revision',files:4,logicalBytes:1234,warnings:[],canArchive:false,canReopen:true,canDelete:true,checkedAt:'now'};
function setup(){vi.mocked(listUpgradeRecoveries).mockResolvedValue({entries:[{id:archived.id,status:'completed',createdAt:null,canReview:true,retentionStatus:'archived'}],limited:false,checkedAt:'now'});vi.mocked(api.reviewMigrationRetention).mockResolvedValue(archived);}
it("requires explicit confirmation and observes interrupted deletion after lost ACK without replay",async()=>{
 setup();vi.mocked(api.changeMigrationRetention).mockImplementation(async()=>{vi.mocked(api.reviewMigrationRetention).mockResolvedValue({...archived,phase:'deleting',revision:'partial',canReopen:false,files:3});throw Error('ACK perdido');});render(<MigrationRetentionPanel enabled initialId={archived.id} onChanged={vi.fn()}/>);fireEvent.click(screen.getByText('Gestionar copias de los puntos'));expect(await screen.findByRole('button',{name:'Eliminar punto revisado'})).toBeDisabled();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Eliminar punto revisado'}));expect(await screen.findByRole('alert')).toHaveTextContent('ACK perdido');await waitFor(()=>expect(screen.getByRole('button',{name:'Completar eliminación revisada'})).toBeDisabled());expect(api.changeMigrationRetention).toHaveBeenCalledTimes(1);expect(api.changeMigrationRetention).toHaveBeenCalledWith(archived.id,archived.revision,'delete',true);expect(screen.getByRole('checkbox')).not.toBeChecked();
});
it("keeps point retention read-only without workspace authority",async()=>{
 setup();render(<MigrationRetentionPanel enabled={false} initialId={archived.id} onChanged={vi.fn()}/>);fireEvent.click(screen.getByText('Gestionar copias de los puntos'));expect(await screen.findByRole('button',{name:'Reabrir punto'})).toBeDisabled();expect(screen.getByRole('checkbox')).toBeDisabled();expect(api.changeMigrationRetention).not.toHaveBeenCalled();
});
