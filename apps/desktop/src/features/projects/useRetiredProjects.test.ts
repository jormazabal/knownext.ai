import { act,renderHook,waitFor,cleanup } from "@testing-library/react";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { getRetiredProjects,restoreRetiredProject } from "../../lib/api/projectLifecycle";
import type { RetiredProject,RetiredProjects,RestoredProject } from "../../types/projectLifecycle";
import { useRetiredProjects } from "./useRetiredProjects";
vi.mock("../../lib/api/projectLifecycle",()=>({getRetiredProjects:vi.fn(),restoreRetiredProject:vi.fn()}));
const entry:RetiredProject={id:"p",name:"Original",folderPath:"C:/QA",retiredAt:"2026-10-31T20:00:00Z",revision:"native-revision",registered:false,originalFolderVerified:true};
const inventory=(registered=false):RetiredProjects=>({schemaVersion:1,entries:[{...entry,registered}],checkedAt:"2026-10-31T20:00:00Z",scope:"this-device",maximumEntries:256});
const receipt={project:{id:"p"},alreadyRegistered:false,syncPaused:true,checkedAt:"2026-10-31T20:00:00Z"} as RestoredProject;
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getRetiredProjects).mockResolvedValue(inventory());vi.mocked(restoreRetiredProject).mockResolvedValue(receipt);});afterEach(cleanup);

it("keeps the typed name and original revision after a collision",async()=>{
  vi.mocked(restoreRetiredProject).mockRejectedValue(new Error("Nombre ocupado"));const changed=vi.fn().mockResolvedValue(undefined);const {result}=renderHook(()=>useRetiredProjects(changed));await waitFor(()=>expect(result.current.inventory).not.toBeNull());
  act(()=>result.current.setName("p","Otro nombre"));await act(()=>result.current.restore(entry));expect(result.current.names.p).toBe("Otro nombre");expect(result.current.error).toContain("Nombre ocupado");expect(restoreRetiredProject).toHaveBeenCalledTimes(1);expect(restoreRetiredProject).toHaveBeenCalledWith("p","native-revision","Otro nombre");expect(changed).not.toHaveBeenCalled();
});
it("a lost ACK reconciles a registered identity without repeating restore",async()=>{
  vi.mocked(getRetiredProjects).mockResolvedValue(inventory(true)).mockResolvedValueOnce(inventory());vi.mocked(restoreRetiredProject).mockRejectedValue(new Error("Lost ACK"));const changed=vi.fn().mockResolvedValue(undefined);const {result}=renderHook(()=>useRetiredProjects(changed));await waitFor(()=>expect(result.current.inventory).not.toBeNull());await act(()=>result.current.restore(entry));expect(restoreRetiredProject).toHaveBeenCalledTimes(1);expect(changed).toHaveBeenCalledTimes(1);expect(result.current.error).toBeNull();expect(result.current.inventory?.entries[0].registered).toBe(true);
});
it("retrying a failed selector refresh is read-only and does not restore twice",async()=>{
  const changed=vi.fn().mockRejectedValueOnce(new Error("Selector unavailable")).mockResolvedValue(undefined);const {result}=renderHook(()=>useRetiredProjects(changed));await waitFor(()=>expect(result.current.inventory).not.toBeNull());await act(()=>result.current.restore(entry));expect(result.current.catalogRefreshPending).toBe(true);expect(result.current.notice).toContain("no repetirá");vi.mocked(getRetiredProjects).mockResolvedValue(inventory(true));await act(()=>result.current.refresh());expect(changed).toHaveBeenCalledTimes(2);expect(restoreRetiredProject).toHaveBeenCalledTimes(1);expect(result.current.catalogRefreshPending).toBe(false);
});
it("blocks a synchronous double restore and an empty name",async()=>{
  let resolve!:(value:RestoredProject)=>void;vi.mocked(restoreRetiredProject).mockImplementation(()=>new Promise(done=>{resolve=done;}));const {result}=renderHook(()=>useRetiredProjects(async()=>{}));await waitFor(()=>expect(result.current.inventory).not.toBeNull());
  act(()=>result.current.setName("p",""));await act(()=>result.current.restore(entry));expect(restoreRetiredProject).not.toHaveBeenCalled();act(()=>result.current.setName("p","Revisado"));
  let first!:Promise<void>;act(()=>{first=result.current.restore(entry);void result.current.restore(entry);});expect(restoreRetiredProject).toHaveBeenCalledTimes(1);await act(async()=>{resolve(receipt);await first;});
});
