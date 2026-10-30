import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { RecordingPanel } from "./RecordingPanel";
import { useRecordings } from "./useRecordings";
import { recordingRequest } from "../../lib/api/recordings";
vi.mock("./useRecordings",()=>({useRecordings:vi.fn()}));
vi.mock("../../lib/api/recordings",()=>({recordingRequest:vi.fn(),recordingAudio:vi.fn()}));
vi.mock("../../lib/api/projects",()=>({listProjects:vi.fn().mockResolvedValue([]),getProjectTree:vi.fn().mockResolvedValue([])}));
vi.mock("../../lib/runtime/platform",()=>({isTauriMobileRuntime:()=>false,isTauriRuntime:()=>false}));
const settings={microphone:true,systemAudio:true,microphoneDevice:null,outputDevice:null,retentionDays:7,model:"gpt-transcribe",languages:[],startWithWindows:false,keepInTray:true};
const base={revision:1,sessions:[],settings,levels:[0,0],preview:false,captureOwner:null,warning:null,devices:[]};
const command=vi.fn();
beforeEach(()=>{command.mockReset();vi.mocked(recordingRequest).mockResolvedValue([] as never);vi.mocked(useRecordings).mockReturnValue({snapshot:base,error:null,busy:null,command} as never);});
afterEach(cleanup);
describe("meeting recording flow",()=>{
 it("does not capture on opening and starts with the selected folder and edited name",async()=>{
  render(<RecordingPanel initialDestination={{projectId:"p",folderId:"p::notes",name:"Reunión.md"}}/>);
  expect(command).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Nombre del documento"),{target:{value:"Entrevista.md"}});
  fireEvent.click(screen.getByRole("button",{name:"Iniciar grabación"}));
  expect(command).toHaveBeenCalledWith("start",{settings,destination:{projectId:"p",folderId:"p::notes",name:"Entrevista.md"}});
 });
 it("stopping asks for a destination and cancelling preserves audio",async()=>{
  const session={id:"s",revision:1,createdAt:"2026-10-30T10:00:00Z",status:"recording",settings,destination:null,samples:48000,bytes:96000,error:null,chunks:[],documentId:null,completedAt:null,keep:false,audioDeleted:false,recovered:false};
  vi.mocked(useRecordings).mockReturnValue({snapshot:{...base,captureOwner:"s",sessions:[session]},error:null,busy:null,command} as never);
  command.mockResolvedValue({...base,sessions:[{...session,status:"pendingDestination"}]});
  render(<RecordingPanel/>);
  fireEvent.click(screen.getByRole("button",{name:"Parar"}));
  await waitFor(()=>expect(screen.getByRole("dialog",{name:"Destino de la transcripción"})).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button",{name:"Cancelar"}));
  expect(command).toHaveBeenCalledTimes(1);
  expect(command).toHaveBeenCalledWith("stop",{id:"s"});
 });
});
