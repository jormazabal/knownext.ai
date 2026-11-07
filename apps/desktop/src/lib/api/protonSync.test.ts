import {afterEach,describe,expect,it,vi} from "vitest";
import * as client from "./client";
import * as api from "./protonSync";
afterEach(()=>vi.restoreAllMocks());
describe("Proton runtime contract",()=>{
  it("keeps reads effect-free and sends reviewed identities for mutations",async()=>{
    const call=vi.spyOn(client,"requestJson").mockResolvedValue({});
    await api.getProtonStatus("owned id");await api.getProtonInbox("owned id");
    await api.reviewProton("owned id","C:/Proton","shared-id");
    await api.connectProton("owned id",{id:"review",revision:"base"});
    await api.reviewProtonReceive("owned id","publication");
    await api.applyProtonReceive("owned id",{id:"receive",revision:"base"});
    await api.disconnectProton("owned id",2);
    const base="/api/projects/owned%20id/proton-sync";
    expect(call.mock.calls).toEqual([[base],[`${base}/inbox`],[`${base}/review`,{method:"POST",body:JSON.stringify({folderPath:"C:/Proton",logicalProjectId:"shared-id"})}],[`${base}/connect`,{method:"POST",body:JSON.stringify({id:"review",revision:"base"})}],[`${base}/receive/review`,{method:"POST",body:JSON.stringify({publicationId:"publication"})}],[`${base}/receive/apply`,{method:"POST",body:JSON.stringify({id:"receive",revision:"base"})}],[`${base}/disconnect`,{method:"POST",body:JSON.stringify({generation:2})}]]);
  });
});
