import {afterEach,expect,it,vi} from "vitest";
import {invokeManagedNative as invoke} from "./nativeClient";
import {requestJson} from "./client";
import {isTauriRuntime} from "../runtime/platform";
import {reviewRecoveryContent,deliverRecoveryContent} from "./recoveryExtract";
import type {RecoveryContentReview} from "../../types/recoveryExtract";
vi.mock("./nativeClient",()=>({invokeManagedNative:vi.fn()}));vi.mock("./client",()=>({requestJson:vi.fn()}));vi.mock("../runtime/platform",()=>({isTauriRuntime:vi.fn()}));
afterEach(()=>{vi.resetAllMocks();});
it("accepts only the bounded note review format and rejects an ambiguous schema",async()=>{
 const note={schemaVersion:2,key:"recovery-owned-note-0002",revision:"a".repeat(64),copySha256:"b".repeat(64),kind:"handwritten-note",fileName:"Recovered.knote",pageCount:3,strokeCount:42,byteLength:3000,text:"",previewTruncated:false,canExport:true,canRestore:false,provenanceVerified:false,checkedAt:"2026-11-02T12:00:00Z"};
 vi.mocked(requestJson).mockResolvedValueOnce({...note,schemaVersion:1}).mockResolvedValueOnce({...note,pageCount:1001}).mockResolvedValueOnce(note);await expect(reviewRecoveryContent(note.key)).rejects.toThrow(/no identifica/);await expect(reviewRecoveryContent(note.key)).rejects.toThrow(/no identifica/);await expect(reviewRecoveryContent(note.key)).resolves.toMatchObject({kind:"handwritten-note",pageCount:3,strokeCount:42});expect(invoke).not.toHaveBeenCalled();
});
it("binds review identity and invokes the native export once with explicit acknowledgement",async()=>{
 const review:RecoveryContentReview={schemaVersion:1,key:"recovery-owned-text-0001",revision:"a".repeat(64),copySha256:"b".repeat(64),kind:"document",fileName:"Recovered.md",byteLength:2,text:"Hi",previewTruncated:false,canExport:true,canRestore:false,provenanceVerified:false,checkedAt:"2026-11-02T12:00:00Z"};
 vi.mocked(requestJson).mockResolvedValueOnce({...review,key:"other"}).mockResolvedValueOnce(review);await expect(reviewRecoveryContent(review.key)).rejects.toThrow(/no identifica/);const checked=await reviewRecoveryContent(review.key);
 await expect(deliverRecoveryContent(checked,false)).rejects.toThrow(/Confirma/);vi.mocked(isTauriRuntime).mockReturnValue(false);await expect(deliverRecoveryContent(checked,true)).rejects.toThrow(/nativa/);expect(invoke).not.toHaveBeenCalled();
 vi.mocked(isTauriRuntime).mockReturnValue(true);vi.mocked(invoke).mockRejectedValueOnce(Error("Uncertain destination"));await expect(deliverRecoveryContent(checked,true)).rejects.toThrow("Uncertain destination");expect(invoke).toHaveBeenCalledOnce();expect(invoke).toHaveBeenCalledWith("export_recovery_content",{key:review.key,revision:review.revision,acknowledgeUnverified:true});
});
