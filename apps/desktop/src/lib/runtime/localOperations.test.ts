import {afterEach,expect,it,vi} from "vitest";
import {cancelLocalOperation,dismissLocalOperation,getLocalOperations,localOperationDiagnostic,refreshLocalOperations,runLocalOperation} from "./localOperations";
import {ApiError} from "../api/errors";
const invoke=vi.hoisted(()=>vi.fn());
vi.mock("@tauri-apps/api/core",()=>({invoke}));
afterEach(()=>{vi.useRealTimers();invoke.mockReset();for(const entry of getLocalOperations())dismissLocalOperation(entry.id);});

it("ends a timed out wait without replaying, cancelling or losing observation of a late success",async()=>{
 vi.useFakeTimers();let finish!:(value:string)=>void;const execute=vi.fn(()=>new Promise<string>(resolve=>{finish=resolve;}));
 const work=runLocalOperation(execute,{native:true,label:"Guardado",timeoutMs:50});const result=expect(work).rejects.toMatchObject({status:504,operationOutcome:"unknown",code:"operation-wait-expired"});
 await vi.advanceTimersByTimeAsync(50);await result;expect(execute).toHaveBeenCalledTimes(1);expect(invoke).not.toHaveBeenCalled();
 finish("saved");await Promise.resolve();await Promise.resolve();expect(getLocalOperations().slice(-1)[0]).toMatchObject({phase:"succeeded",unconfirmed:true});expect(execute).toHaveBeenCalledTimes(1);
});
it("refuses an aborted or invalid request before invoking native work",async()=>{
 const controller=new AbortController();controller.abort();const execute=vi.fn();
 await expect(runLocalOperation(execute,{native:true,label:"Operación",signal:controller.signal})).rejects.toMatchObject({operationOutcome:"not-started",code:"operation-cancelled"});
 await expect(runLocalOperation(execute,{native:true,label:"Operación",timeoutMs:0})).rejects.toMatchObject({operationOutcome:"not-started",code:"invalid-operation-timeout"});expect(execute).not.toHaveBeenCalled();
});
it("only reports cancellation when runtime confirms a queued job stopped",async()=>{
 let reject!:(reason:unknown)=>void;const work=runLocalOperation(()=>new Promise<never>((_resolve,fail)=>{reject=fail;}),{native:true,label:"Operación"});const outcome=expect(work).rejects.toMatchObject({operationOutcome:"not-started",code:"operation-cancelled"});
 await Promise.resolve();const id=getLocalOperations().slice(-1)[0]!.id;
 const snapshot={id,lane:"mutation",phase:"running",queuedAt:new Date().toISOString(),startedAt:new Date().toISOString(),finishedAt:null,cancellable:false};
 invoke.mockResolvedValueOnce(snapshot);expect(await cancelLocalOperation(id)).toBe(false);expect(getLocalOperations().slice(-1)[0]?.phase).toBe("running");
 invoke.mockResolvedValueOnce({...snapshot,phase:"cancelled",finishedAt:new Date().toISOString()});expect(await cancelLocalOperation(id)).toBe(true);
 reject("operation-cancelled");await outcome;
});
it("reconciles only existing identifiers and rejects malformed or mismatched cancellation replies",async()=>{
 let finish!:(value:boolean)=>void;const work=runLocalOperation(()=>new Promise<boolean>(resolve=>{finish=resolve;}),{native:true,label:"Consulta"});await Promise.resolve();const id=getLocalOperations().slice(-1)[0]!.id;
 invoke.mockResolvedValueOnce([{id,lane:"query",phase:"queued",queuedAt:new Date().toISOString(),startedAt:null,finishedAt:null,cancellable:true}]);await refreshLocalOperations();expect(getLocalOperations().slice(-1)[0]?.cancellable).toBe(true);
 invoke.mockResolvedValueOnce({id:"operation-unrelated-12345",lane:"query",phase:"cancelled",queuedAt:new Date().toISOString(),startedAt:null,finishedAt:new Date().toISOString(),cancellable:false});await expect(cancelLocalOperation(id)).rejects.toThrow("cancelación");
 invoke.mockResolvedValueOnce([{id,phase:"done",path:"private"}]);await expect(refreshLocalOperations()).rejects.toThrow("comprobar");
 finish(true);await work;
});
it("retains uncertainty after a transport rejection but preserves explicit admission failures",async()=>{
 await expect(runLocalOperation(()=>Promise.reject("transport closed"),{native:true,label:"Operación"})).rejects.toMatchObject({operationOutcome:"unknown",code:"runtime-operation-unconfirmed",operationId:expect.stringMatching(/^operation-/)});expect(getLocalOperations().slice(-1)[0]).toMatchObject({phase:"unknown",unconfirmed:true});
 await expect(runLocalOperation(()=>Promise.reject("operation-queue-full"),{native:true,label:"Operación"})).rejects.toBeInstanceOf(ApiError);expect(getLocalOperations().slice(-1)[0]).toMatchObject({phase:"failed",unconfirmed:false});
});

it("keeps task diagnostics bounded and excludes labels, request content and filesystem locations",async()=>{
 await runLocalOperation(async()=>true,{native:false,label:"PRIVATE document C:/private/content prompt token"});const report=localOperationDiagnostic();expect(report).not.toContain("PRIVATE");expect(report).not.toContain("C:/private");const parsed=JSON.parse(report);expect(parsed.includesPrivateContent).toBe(false);expect(parsed.operations.length).toBeLessThanOrEqual(50);expect(Object.keys(parsed.operations.slice(-1)[0])).toEqual(["id","phase","startedAt","resultNeedsReview","stage","cancelRequested","previousSession"]);
});

it("observes previous-session work without invoking or replaying it",async()=>{const old={id:"operation-previous-session-12345",lane:"background",phase:"unknown",queuedAt:new Date().toISOString(),startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),cancellable:false,recovered:true,stage:"waiting-remote"};invoke.mockImplementation(async command=>command==="local_operation_status"?[old]:{schemaVersion:1,persistenceAvailable:true,previousSessionCount:1,checkedAt:new Date().toISOString(),maximumEntries:384,includesPrivateContent:false});await refreshLocalOperations(true);expect(getLocalOperations().find(e=>e.id===old.id)).toMatchObject({phase:"unknown",recovered:true,unconfirmed:true,cancellable:false});expect(invoke.mock.calls.map(c=>c[0])).toEqual(["local_operation_status","local_operation_continuity"]);expect(localOperationDiagnostic()).not.toContain("body");});
it("distinguishes a requested running stop from its later safe confirmation",async()=>{let reject!:(reason:unknown)=>void;const work=runLocalOperation(()=>new Promise<never>((_ok,fail)=>{reject=fail;}),{native:true,label:"Acceso"});const outcome=expect(work).rejects.toMatchObject({code:"operation-stopped-before-publication",operationOutcome:"not-applied"});await Promise.resolve();const id=getLocalOperations().slice(-1)[0].id;const snapshot={id,lane:"background",phase:"running",queuedAt:new Date().toISOString(),startedAt:new Date().toISOString(),finishedAt:null,cancellable:true,stage:"waiting-remote"};invoke.mockResolvedValueOnce([snapshot]);await refreshLocalOperations();expect(getLocalOperations().slice(-1)[0].cancellable).toBe(true);invoke.mockResolvedValueOnce({...snapshot,cancelRequested:true});expect(await cancelLocalOperation(id)).toBe(false);expect(getLocalOperations().slice(-1)[0]).toMatchObject({phase:"running",cancelRequested:true,cancellable:false});reject("operation-stopped-before-publication");await outcome;expect(getLocalOperations().slice(-1)[0]).toMatchObject({phase:"cancelled",stoppedAfterStart:true,unconfirmed:false});});
