import {afterEach,expect,it,vi} from "vitest";
import {requestJson} from "./client";
import {getMixedRecoveryCatalog} from "./mixedRecovery";
vi.mock("./client",()=>({requestJson:vi.fn()}));afterEach(()=>vi.resetAllMocks());
const value={schemaVersion:1,projectId:"owned a",checkedAt:"2026-11-04T12:00:00Z",limited:true,warnings:["Entrada no compatible conservada"],items:[{id:`mixed-${"a".repeat(32)}`,planRevision:"b".repeat(64),createdAt:"2026-11-04T10:00:00Z",paths:2}]};
it("reads the local bounded project catalog without remote review or a mutation",async()=>{vi.mocked(requestJson).mockResolvedValue(value);expect(await getMixedRecoveryCatalog("owned a")).toEqual(value);expect(requestJson).toHaveBeenCalledWith("/api/projects/owned%20a/sync/mixed-selections");});
it("rejects another project, unsupported metadata and duplicate selection identities",async()=>{for(const response of [{...value,projectId:"other"},{...value,schemaVersion:9},{...value,items:[value.items[0],value.items[0]]},{...value,items:[{...value.items[0],paths:257}]}]){vi.mocked(requestJson).mockResolvedValueOnce(response);await expect(getMixedRecoveryCatalog("owned a")).rejects.toThrow(/catálogo/);}});
