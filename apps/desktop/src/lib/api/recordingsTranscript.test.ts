import {beforeEach,describe,expect,it,vi} from "vitest";
import {invoke} from "@tauri-apps/api/core";
import {recordingTranscript} from "./recordings";
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));vi.mock("../runtime/platform",()=>({isTauriRuntime:()=>true}));
const source={schemaVersion:1,sessionId:"owned",revision:1,sourceRevision:"a".repeat(64),samples:96000,sampleRate:24000,audioAvailable:true,segments:[{id:"fragment-1",start:0,samples:96000,text:"Texto confirmado",speaker:null,timing:"fragment"}],unconfirmedCount:0,wordTimingAvailable:false,diarizationAvailable:false,readOnly:true,startsProvider:false};beforeEach(()=>vi.mocked(invoke).mockReset());
describe("recording source SDK",()=>{
 it("requests only the selected session transcript and keeps original fragment bounds",async()=>{vi.mocked(invoke).mockResolvedValue(source);expect(await recordingTranscript("owned")).toEqual(source);expect(invoke).toHaveBeenCalledTimes(1);expect(invoke).toHaveBeenCalledWith("recording_request",{action:"transcript",payload:{id:"owned"}});});
 it("rejects foreign source and audio outside the reviewed duration",async()=>{vi.mocked(invoke).mockResolvedValueOnce({...source,sessionId:"other"});await expect(recordingTranscript("owned")).rejects.toThrow();vi.mocked(invoke).mockResolvedValueOnce({...source,segments:[{...source.segments[0],samples:96001}]});await expect(recordingTranscript("owned")).rejects.toThrow();});
 it("does not accept unproven speakers or word timing from a fragment-only source",async()=>{vi.mocked(invoke).mockResolvedValue({...source,segments:[{...source.segments[0],speaker:"Ana"}]});await expect(recordingTranscript("owned")).rejects.toThrow();});
});
