import { beforeEach,expect,it,vi } from "vitest";
import { updateAppConfig } from "../../lib/api/config";
import { getRetiredProjects,retireProject } from "../../lib/api/projectLifecycle";
import { listProjects } from "../../lib/api/projects";
import { retireProjectWithWorkspace } from "./projectRetirement";
vi.mock("../../lib/api/config",()=>({updateAppConfig:vi.fn()}));
vi.mock("../../lib/api/projectLifecycle",()=>({getRetiredProjects:vi.fn(),retireProject:vi.fn()}));
vi.mock("../../lib/api/projects",()=>({listProjects:vi.fn()}));
const workspace={tabsByProject:{p:{openTabs:[],activeDocumentId:""}},treeOpenPathsByProject:{p:["Docs"]}};
const submit=async(write:()=>Promise<void>)=>{await write();return true;};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(updateAppConfig).mockResolvedValue({} as Awaited<ReturnType<typeof updateAppConfig>>);vi.mocked(retireProject).mockResolvedValue([]);});

it("never retires when the critical settings write was skipped as superseded",async()=>{
  await expect(retireProjectWithWorkspace("p",workspace,async()=>true)).rejects.toThrow("conservación");expect(retireProject).not.toHaveBeenCalled();expect(updateAppConfig).not.toHaveBeenCalled();
});
it("a failed workspace checkpoint leaves the association alone",async()=>{
  vi.mocked(updateAppConfig).mockRejectedValue(new Error("Disk denied"));await expect(retireProjectWithWorkspace("p",workspace,submit)).rejects.toThrow("Disk denied");expect(retireProject).not.toHaveBeenCalled();
});
it("waits for the native checkpoint ACK before retiring",async()=>{
  let acknowledge!:()=>void;vi.mocked(updateAppConfig).mockImplementation(()=>new Promise(resolve=>{acknowledge=()=>resolve({} as Awaited<ReturnType<typeof updateAppConfig>>);}));
  const pending=retireProjectWithWorkspace("p",workspace,submit);expect(updateAppConfig).toHaveBeenCalledWith(workspace);expect(retireProject).not.toHaveBeenCalled();acknowledge();await pending;expect(retireProject).toHaveBeenCalledTimes(1);expect(retireProject).toHaveBeenCalledWith("p");
});
it("reconciles a lost retirement ACK by reads and does not repeat the mutation",async()=>{
  vi.mocked(retireProject).mockRejectedValue(new Error("Lost ACK"));vi.mocked(getRetiredProjects).mockResolvedValue({schemaVersion:1,entries:[{id:"p",name:"P",folderPath:"C:/QA",retiredAt:"2026-10-31T20:00:00Z",revision:"native",registered:false,originalFolderVerified:true}],checkedAt:"now",scope:"this-device",maximumEntries:256});vi.mocked(listProjects).mockResolvedValue([]);
  await expect(retireProjectWithWorkspace("p",workspace,submit)).resolves.toEqual([]);expect(retireProject).toHaveBeenCalledTimes(1);
});
