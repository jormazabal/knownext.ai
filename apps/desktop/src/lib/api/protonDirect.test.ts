import {afterEach,describe,expect,it,vi} from "vitest";
import * as client from "./client";
import * as api from "./protonDirect";
afterEach(()=>vi.restoreAllMocks());
describe("Proton direct API",()=>{
 it("separates lifecycle review, read-only recovery and explicit commit using exact revisions",async()=>{
  const request=vi.spyOn(client,"requestJson").mockResolvedValue({});
  await api.reviewProtonRetention("owned project");
  await api.applyProtonRetention("owned project",{id:"inventory",revision:"inventory-hash"});
  await api.cancelProtonRetention("owned project",{id:"inventory",revision:"inventory-hash"});
  await api.reviewProtonMigration("owned project",{target:"proton",accountId:"destination-account",remoteRootId:"managed-project"});
  await api.startProtonMigration("owned project",{id:"review",revision:"source-hash"});
  await api.getProtonMigration("owned project");
  await api.resumeProtonMigration("owned project",{id:"attempt",revision:"staged-hash"});
  await api.cancelProtonMigration("owned project",{id:"attempt",revision:"cancel-hash"});
  await api.acknowledgeProtonMigration("owned project",{id:"attempt",revision:"verified-hash"});
  expect(request.mock.calls.map(([path,init])=>({path,method:init?.method??"GET",body:init?.body?JSON.parse(String(init.body)):null}))).toEqual([
   {path:"/api/projects/owned%20project/proton-direct/retention/review",method:"POST",body:{}},
   {path:"/api/projects/owned%20project/proton-direct/retention/apply",method:"POST",body:{id:"inventory",revision:"inventory-hash"}},
   {path:"/api/projects/owned%20project/proton-direct/retention/cancel",method:"POST",body:{id:"inventory",revision:"inventory-hash"}},
   {path:"/api/projects/owned%20project/proton-direct/migration/review",method:"POST",body:{target:"proton",accountId:"destination-account",remoteRootId:"managed-project"}},
   {path:"/api/projects/owned%20project/proton-direct/migration/start",method:"POST",body:{id:"review",revision:"source-hash"}},
   {path:"/api/projects/owned%20project/proton-direct/migration",method:"GET",body:null},
   {path:"/api/projects/owned%20project/proton-direct/migration/start",method:"POST",body:{attemptId:"attempt",revision:"staged-hash"}},
   {path:"/api/projects/owned%20project/proton-direct/migration/cancel",method:"POST",body:{attemptId:"attempt",revision:"cancel-hash"}},
   {path:"/api/projects/owned%20project/proton-direct/migration/ack",method:"POST",body:{attemptId:"attempt",revision:"verified-hash"}},
  ]);
 });
 it("notifies only the affected project after sync or reviewed resolution settles",async()=>{
  const events:unknown[]=[];
  const changed=(event:Event)=>events.push((event as CustomEvent).detail);
  window.addEventListener(api.PROTON_WORKSPACE_CHANGED_EVENT,changed);
  let complete!:(value:unknown)=>void;
  const result={projectId:"project-A",state:"synced"};
  const request=vi.spyOn(client,"requestJson").mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;})).mockResolvedValueOnce({projectId:"project-B"});
  try{
   const pending=api.syncProtonDirect("project-A");
   expect(events).toEqual([]);
   complete(result);
   await expect(pending).resolves.toBe(result);
   await api.resolveProtonDirectConflict("project-B","conflict","reviewed","local");
   expect(events).toEqual([{projectId:"project-A"},{projectId:"project-B"}]);
   expect(request).toHaveBeenCalledTimes(2);
  }finally{window.removeEventListener(api.PROTON_WORKSPACE_CHANGED_EVENT,changed);}
 });
 it("requests refresh after an uncertain acknowledgement without replay or leaking the error",async()=>{
  const events:unknown[]=[];
  const changed=(event:Event)=>events.push((event as CustomEvent).detail);
  window.addEventListener(api.PROTON_WORKSPACE_CHANGED_EVENT,changed);
  const error=new Error("ACK lost after a partial receive");
  const request=vi.spyOn(client,"requestJson").mockRejectedValueOnce(error).mockRejectedValueOnce(error).mockResolvedValueOnce({});
  try{
   await expect(api.syncProtonDirect("owned-A")).rejects.toBe(error);
   await expect(api.resolveProtonDirectConflict("owned-B","conflict","reviewed","remote")).rejects.toBe(error);
   await api.getProtonDirectStatus("other-project");
   expect(events).toEqual([{projectId:"owned-A"},{projectId:"owned-B"}]);
   expect(request).toHaveBeenCalledTimes(3);
  }finally{window.removeEventListener(api.PROTON_WORKSPACE_CHANGED_EVENT,changed);}
 });
 it("sends scoped identities and reviewed revisions, never credentials from the UI",async()=>{
  const request=vi.spyOn(client,"requestJson").mockResolvedValue({});
  await api.getProtonAccount();await api.startProtonConnection();await api.pollProtonConnection("attempt");await api.cancelProtonConnection("attempt");
  await api.reviewProtonDirect("owned id","account","remote");
  await api.connectProtonDirect("owned id",{id:"review",revision:"hash"});
  await api.resolveProtonDirectConflict("owned id","conflict","exact","both");
  const calls=request.mock.calls.map(([path,init])=>({path,body:init?.body?JSON.parse(String(init.body)):null}));
  expect(calls).toEqual([{path:"/api/proton/accounts/status",body:null},{path:"/api/proton/accounts/start",body:{}},{path:"/api/proton/accounts/poll",body:{connectionId:"attempt"}},{path:"/api/proton/accounts/cancel",body:{connectionId:"attempt"}},{path:"/api/projects/owned%20id/proton-direct/review",body:{accountId:"account",remoteRootId:"remote"}},{path:"/api/projects/owned%20id/proton-direct/connect",body:{id:"review",revision:"hash"}},{path:"/api/projects/owned%20id/proton-direct/conflicts/resolve",body:{conflictId:"conflict",revision:"exact",resolution:"both"}}]);
 });
});
