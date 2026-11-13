import { act,within,cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { RecordingPanel } from "./RecordingPanel";
import { useRecordings } from "./useRecordings";
import {listProjects,getProjectTree} from "../../lib/api/projects";
import { recordingRequest } from "../../lib/api/recordings";
import { useState } from "react";
import { ModalFrame } from "../../components/ui/ModalFrame";
vi.mock("./useRecordings",()=>({useRecordings:vi.fn()}));
vi.mock("../../lib/api/recordings",()=>({recordingRequest:vi.fn(),recordingAudio:vi.fn(),recordingTranscript:vi.fn()}));
vi.mock("../../lib/api/projects",()=>({listProjects:vi.fn().mockResolvedValue([]),getProjectTree:vi.fn().mockResolvedValue([])}));
vi.mock("../../lib/runtime/platform",()=>({isTauriMobileRuntime:()=>false,isTauriRuntime:()=>false}));
const settings={microphone:true,systemAudio:true,microphoneDevice:null,outputDevice:null,retentionDays:7,model:"gpt-transcribe",languages:[],startWithWindows:false,keepInTray:true};
const base={revision:1,sessions:[],settings,levels:[0,0],preview:false,captureOwner:null,warning:null,devices:[]};
const command=vi.fn();
beforeEach(()=>{vi.mocked(listProjects).mockResolvedValue([]);vi.mocked(getProjectTree).mockResolvedValue([]);command.mockReset();vi.mocked(recordingRequest).mockResolvedValue([] as never);vi.mocked(useRecordings).mockReturnValue({snapshot:base,error:null,busy:null,command} as never);});
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

describe("compact recording controller",()=>{
 it("returns focus to the opener when the floating recorder closes",async()=>{
  function Harness(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Abrir grabadora</button>{open&&<ModalFrame label="Grabaciones" onClose={()=>setOpen(false)}><RecordingPanel compact embedded onClose={()=>setOpen(false)}/></ModalFrame>}</>;}
  render(<Harness/>);
  const trigger=screen.getByRole("button",{name:"Abrir grabadora"});trigger.focus();fireEvent.click(trigger);
  expect(screen.getByRole("heading",{name:"Grabaciones"})).toHaveFocus();
  fireEvent.keyDown(document.activeElement!,{key:"Escape"});
  await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
 });
 it("keeps recovery access outside the scrolling body and includes unavailable sessions without allowing capture",()=>{
  vi.mocked(useRecordings).mockReturnValue({snapshot:{...base,settingsError:"Future preferences",settingsRecoveryRevision:"review",unavailableSessions:1},error:null,busy:null,command} as never);
  render(<RecordingPanel compact/>);
  expect(screen.getByRole("button",{name:"Iniciar grabación"})).toBeDisabled();
  expect(screen.getByRole("button",{name:"Ajustes"}).closest(".recording-body")).toBeNull();
  expect(screen.getByRole("button",{name:/Sesiones \(1\)/})).toBeInTheDocument();
  expect(command).not.toHaveBeenCalled();
 });
 const session={id:"s",revision:1,createdAt:"2026-10-30T10:00:00Z",status:"recording",settings,destination:null,samples:48000,bytes:96000,error:null,chunks:[],documentId:null,completedAt:null,keep:false,audioDeleted:false,recovered:false};
 it("starts collapsed and does not present untested levels as a signal",()=>{
  render(<RecordingPanel compact/>);
  expect(screen.getByRole("button",{name:/Sesiones/})).toHaveAttribute("aria-expanded","false");
  expect(screen.getByRole("meter",{name:"Nivel de Micrófono"})).toHaveAttribute("aria-valuetext","Sin probar");
 });
 it("keeps capture controls outside the scrollable history",()=>{
  vi.mocked(useRecordings).mockReturnValue({snapshot:{...base,captureOwner:"s",sessions:[session]},error:null,busy:null,command} as never);
  render(<RecordingPanel compact/>);
  fireEvent.click(screen.getByRole("button",{name:/Sesiones/}));
  expect(document.getElementById("recording-session-list")).not.toContainElement(screen.getByRole("button",{name:"Parar"}));
  expect(screen.getByLabelText("Dispositivo de Micrófono")).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Pausar"}));
  expect(command).toHaveBeenCalledWith("pause",{id:"s"});
 });
 it("freezes paused meters even if the last snapshot still has live levels",()=>{
  vi.mocked(useRecordings).mockReturnValue({snapshot:{...base,captureOwner:"s",levels:[0.8,0.4],sessions:[{...session,status:"paused"}]},error:null,busy:null,command} as never);
  render(<RecordingPanel compact/>);
  expect(screen.getByRole("meter",{name:"Nivel de Micrófono"})).toHaveAttribute("aria-valuenow","0");
  expect(screen.getByRole("meter",{name:"Nivel de Micrófono"})).toHaveAttribute("aria-valuetext","En pausa");
  expect(screen.getByLabelText("Dispositivo de Micrófono")).toBeEnabled();
  fireEvent.click(screen.getByRole("button",{name:"Continuar"}));
  expect(command).toHaveBeenCalledWith("resume",{id:"s"});
 });
 it("keeps both stop and pause available while a busy source configuration settles",()=>{
  vi.mocked(useRecordings).mockReturnValue({snapshot:{...base,captureOwner:"s",sessions:[{...session,settings:{...settings,microphone:false,systemAudio:false}}]},error:null,busy:null,command} as never);
  render(<RecordingPanel compact/>);
  expect(screen.getByRole("button",{name:"Pausar"})).toBeEnabled();
  expect(screen.getByRole("button",{name:"Parar"})).toBeEnabled();
 });
});

it("embedded compact manager opens collapsed and reveals retained sessions with fixed controls and useful close/settings actions",async()=>{
 const session={id:"retained",revision:1,createdAt:"2026-11-04T12:00:00Z",status:"attention",settings,destination:{projectId:"owned",folderId:null,name:"Audio trasladado"},samples:48000,bytes:96000,error:null,chunks:[],documentId:null,completedAt:null,keep:true,audioDeleted:false,recovered:true};vi.mocked(useRecordings).mockReturnValue({snapshot:{...base,sessions:[session]},error:null,busy:null,command} as never);const close=vi.fn(),openSettings=vi.fn();render(<RecordingPanel compact embedded onClose={close} onOpenSettings={openSettings}/>);expect(screen.queryByRole("heading",{name:"Audio trasladado"})).not.toBeInTheDocument();expect(screen.getByRole("button",{name:/Sesiones/})).toHaveAttribute("aria-expanded","false");fireEvent.click(screen.getByRole("button",{name:/Sesiones/}));expect(await screen.findByRole("heading",{name:"Audio trasladado"})).toBeInTheDocument();expect(screen.getByRole("button",{name:/Sesiones/})).toHaveAttribute("aria-expanded","true");expect(document.getElementById("recording-session-list")).not.toContainElement(screen.getByRole("button",{name:"Iniciar grabación"}));expect(screen.queryByRole("button",{name:"Abrir gestor"})).not.toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Ajustes"}));expect(openSettings).toHaveBeenCalledTimes(1);expect(command).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Cerrar grabaciones"}));expect(close).toHaveBeenCalledTimes(1);
});

it("opens minutes for the selected stopped session without queueing or editing its transcript",()=>{
 const session={id:"source-owned",revision:1,createdAt:"2026-11-05T12:00:00Z",status:"completed",settings,destination:{projectId:"owned",folderId:null,name:"Reunión de producto"},samples:48000,bytes:96000,error:null,chunks:[{start:0,samples:48000,status:"completed"}],documentId:"owned::Reunion.md",completedAt:1,keep:false,audioDeleted:false,recovered:false};vi.mocked(useRecordings).mockReturnValue({snapshot:{...base,sessions:[session]},error:null,busy:null,command} as never);const open=vi.fn();render(<RecordingPanel compact embedded onOpenMinutes={open}/>);fireEvent.click(screen.getByRole("button",{name:/Sesiones/}));fireEvent.click(screen.getByRole("button",{name:"Acta revisable"}));expect(open).toHaveBeenCalledTimes(1);expect(open).toHaveBeenCalledWith("source-owned","owned");expect(command).not.toHaveBeenCalled();
});

describe("recording modal boundaries",()=>{
 const retained={id:"modal-session",revision:1,createdAt:"2026-11-06T10:00:00Z",status:"ready",settings,destination:{projectId:"p",folderId:"p::notes",name:"Acta.md"},samples:48000,bytes:96000,error:null,chunks:[],documentId:null,completedAt:null,keep:false,audioDeleted:false,recovered:false};
 function mount(){vi.mocked(useRecordings).mockReturnValue({snapshot:{...base,sessions:[retained]},error:null,busy:null,command} as never);const result=render(<RecordingPanel compact embedded/>);fireEvent.click(screen.getByRole("button",{name:/Sesiones/}));return result;}
 it("traps confirmation focus, closes with Escape and returns focus without deleting audio",async()=>{
  const {container}=mount();const trigger=screen.getByRole("button",{name:"Eliminar audio"});trigger.focus();fireEvent.click(trigger);
  const dialog=screen.getByRole("alertdialog",{name:"Confirmar acción"});const cancel=within(dialog).getByRole("button",{name:"Cancelar"});expect(cancel).toHaveFocus();expect((container.querySelector(".recording-body") as HTMLElement).inert).toBe(true);
  const last=within(dialog).getByRole("button",{name:"Confirmar"});last.focus();fireEvent.keyDown(last,{key:"Tab"});expect(cancel).toHaveFocus();fireEvent.keyDown(cancel,{key:"Escape"});await waitFor(()=>expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());expect(trigger).toHaveFocus();expect(command).not.toHaveBeenCalled();
 });
 it("keeps confirmation open and prevents duplicate dispatch or Escape while applying",async()=>{
  let finish!:(value:unknown)=>void;command.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));mount();fireEvent.click(screen.getByRole("button",{name:"Eliminar audio"}));const dialog=screen.getByRole("alertdialog");const confirm=within(dialog).getByRole("button",{name:"Confirmar"});fireEvent.click(confirm);expect(confirm).toBeDisabled();expect(dialog).toHaveFocus();fireEvent.keyDown(dialog,{key:"Escape"});expect(dialog).toBeInTheDocument();fireEvent.click(confirm);expect(command).toHaveBeenCalledTimes(1);await act(async()=>finish(base));await waitFor(()=>expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
 });
 it("protects destination selection, visible errors and saving against Escape or duplicate submit",async()=>{
  vi.mocked(listProjects).mockResolvedValue([{id:"p",name:"Proyecto de prueba"}] as never);vi.mocked(getProjectTree).mockResolvedValue([{id:"p::notes",name:"Notas",type:"folder",path:"notes",children:[]}]);let fail!:(error:Error)=>void;command.mockImplementation(()=>new Promise((_,reject)=>{fail=reject;}));mount();const trigger=screen.getByRole("button",{name:"Elegir carpeta"});trigger.focus();fireEvent.click(trigger);const dialog=screen.getByRole("dialog",{name:"Destino de la transcripción"});await screen.findByRole("option",{name:"Proyecto de prueba"});await screen.findByRole("option",{name:"Notas"});const project=within(dialog).getByLabelText("Proyecto"),folder=within(dialog).getByLabelText("Carpeta");expect(project).toHaveFocus();expect(project).toHaveValue("p");expect(folder).toHaveValue("p::notes");fireEvent.change(within(dialog).getByLabelText("Nombre"),{target:{value:"Conservar selección.md"}});fireEvent.click(within(dialog).getByRole("button",{name:"Transcribir y guardar"}));expect(dialog).toHaveFocus();fireEvent.keyDown(dialog,{key:"Escape"});expect(dialog).toBeInTheDocument();expect(within(dialog).getByRole("button",{name:"Cancelar"})).toBeDisabled();fireEvent.submit(dialog.querySelector("form")!);expect(command).toHaveBeenCalledTimes(1);await act(async()=>fail(Error("Destino temporalmente no disponible")));expect(await within(dialog).findByRole("alert")).toHaveTextContent("Destino temporalmente no disponible");expect(project).toHaveValue("p");expect(folder).toHaveValue("p::notes");expect(within(dialog).getByLabelText("Nombre")).toHaveValue("Conservar selección.md");fireEvent.keyDown(dialog,{key:"Escape"});await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());expect(trigger).toHaveFocus();expect(command).toHaveBeenCalledWith("destination",{id:"modal-session",destination:{projectId:"p",folderId:"p::notes",name:"Conservar selección.md"}});
 });
});
