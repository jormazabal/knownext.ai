import {afterEach,expect,it,vi} from "vitest";
import {invokeManagedNative} from "./nativeClient";
const invoke=vi.hoisted(()=>vi.fn());vi.mock("@tauri-apps/api/core",()=>({invoke}));
afterEach(()=>vi.clearAllMocks());
it("sends one typed delivery intent and an opaque operation id without adding private metadata",async()=>{
 invoke.mockResolvedValue({status:"saved"});await expect(invokeManagedNative("export_conflict_package",{id:"attempt",revision:"reviewed"})).resolves.toEqual({status:"saved"});
 expect(invoke).toHaveBeenCalledTimes(1);expect(invoke).toHaveBeenCalledWith("managed_native_request",{request:{command:"export_conflict_package",arguments:{id:"attempt",revision:"reviewed"}},operationId:expect.stringMatching(/^operation-/)});
});
it("preserves uncertainty after an interrupted delivery and never reopens the picker",async()=>{
 invoke.mockRejectedValue("native delivery acknowledgement lost");await expect(invokeManagedNative("pick_project_package",{id:"attempt"})).rejects.toMatchObject({operationOutcome:"unknown",code:"runtime-operation-unconfirmed"});expect(invoke).toHaveBeenCalledTimes(1);
});
