import { beforeEach,expect,it,vi } from "vitest";
import { requestJson } from "./client";
import { isTauriRuntime } from "../runtime/platform";
import { getRetiredProjects,retireProject,restoreRetiredProject } from "./projectLifecycle";
vi.mock("./client",()=>({requestJson:vi.fn()}));vi.mock("../runtime/platform",()=>({isTauriRuntime:vi.fn()}));
beforeEach(()=>{vi.resetAllMocks();vi.mocked(isTauriRuntime).mockReturnValue(true);vi.mocked(requestJson).mockResolvedValue({});});
it("uses native identity and reviewed revision for restore without a caller-selected path",async()=>{
  await restoreRetiredProject("project QA","native-sha","Nombre revisado");expect(requestJson).toHaveBeenCalledWith("/api/retired-projects/project%20QA/restore",{method:"POST",body:JSON.stringify({revision:"native-sha",name:"Nombre revisado"})});
});
it("reads the inventory and retires through their scoped runtime routes",async()=>{
  await getRetiredProjects();await retireProject("p");expect(requestJson).toHaveBeenCalledWith("/api/retired-projects");expect(requestJson).toHaveBeenCalledWith("/api/projects/p/retire",{method:"POST",body:"{}"});
});
it("never reports a browser-only retirement as native persistence",()=>{
  vi.mocked(isTauriRuntime).mockReturnValue(false);expect(()=>retireProject("p")).toThrow("aplicación nativa");expect(requestJson).not.toHaveBeenCalled();
});
