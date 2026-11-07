import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {RecoveryReviewSection} from "./RecoveryReviewSection";
import {groupRecoveryCopies} from "./recoveryGroups";
import * as api from "../../lib/api/recovery";
import type {RecoveryCopy} from "../../types/recovery";
vi.mock("../../lib/api/recovery");
afterEach(()=>{cleanup();vi.resetAllMocks();});
const base:RecoveryCopy={key:'owned',source:'archive',fingerprint:'owned-hash',bytes:50,documentId:'p::Plan.md',name:'Plan.md',projectName:'Owned',path:'Plan.md',kind:'document',state:'archived',reason:'Conservada',canCopy:true,canArchive:false,updatedAt:null,operationId:'conflict-owned',variantRole:'local'};
it("keeps operation/document scopes separate and never groups unverified copies",()=>{
 const groups=groupRecoveryCopies([base,{...base,key:'remote',variantRole:'remote'},{...base,key:'other-document',documentId:'q::Plan.md'},{...base,key:'other-operation',operationId:'conflict-other'},{...base,key:'future',state:'unreadable',canCopy:false}]);expect(groups).toHaveLength(4);expect(groups[0].items.map(copy=>copy.variantRole)).toEqual(['local','remote']);expect(groups[3].operationId).toBeUndefined();
});
it("previews the chosen conflict role with its original identity and preserves grouping",async()=>{
 const copies=[base,{...base,key:'remote',variantRole:'remote' as const}];vi.mocked(api.getRecoveryInventory).mockResolvedValue({items:copies,activeCount:0,archivedCount:2,scannedFiles:2,limited:true,warnings:[],queriedAt:'now'});vi.mocked(api.previewRecoveryCopy).mockResolvedValue({kind:'document',text:'Known remote text',truncated:false,pageCount:0,strokeCount:0,bytes:20});
 render(<RecoveryReviewSection open archived projects={[]} onRecovered={async()=>{}} onChanged={()=>{}}/>);expect(await screen.findByText('2 copias observadas de una combinación')).toBeTruthy();expect(screen.getByText(/Revisión parcial por límite/)).toBeTruthy();const remote=screen.getByRole('article',{name:'Remoto conocido · Plan.md'});fireEvent.click(within(remote).getByRole('button',{name:'Ver contenido'}));const dialog=await screen.findByRole('dialog',{name:'Contenido de la copia'});expect(await within(dialog).findByText('Known remote text')).toBeTruthy();expect(api.previewRecoveryCopy).toHaveBeenCalledWith(expect.objectContaining({key:'remote',fingerprint:'owned-hash',source:'archive'}));expect(api.recoverAsCopy).not.toHaveBeenCalled();fireEvent.click(within(dialog).getByRole('button',{name:'Cerrar vista'}));expect(screen.getByText('2 copias observadas de una combinación')).toBeTruthy();
});
