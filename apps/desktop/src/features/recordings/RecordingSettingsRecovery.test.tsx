import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {RecordingSettingsRecovery} from "./RecordingSettingsRecovery";
import type {RecordingSnapshot} from "../../types/recording";
afterEach(cleanup);
const snapshot:RecordingSnapshot={revision:1,sessions:[],settings:{microphone:true,systemAudio:false,microphoneDevice:null,outputDevice:null,languages:[],model:"gpt-transcribe",retentionDays:7,startWithWindows:false,keepInTray:true},levels:[0,0],preview:false,captureOwner:null,warning:null,devices:[],settingsError:"Formato no compatible",settingsRecoveryRevision:"review-a"};
it("does not replay an unconfirmed recovery and adopts only a later observed available state",async()=>{
  const recover=vi.fn(async()=>null),close=vi.fn();const view=render(<RecordingSettingsRecovery snapshot={snapshot} busy={false} error={null} onRecover={recover} onClose={close}/>);
  fireEvent.click(screen.getByRole("button",{name:"Restaurar preferencias básicas"}));await waitFor(()=>expect(recover).toHaveBeenCalledTimes(1));expect(recover).toHaveBeenCalledWith("review-a");expect(screen.getByRole("button",{name:"Restaurar preferencias básicas"})).toBeDisabled();expect(close).not.toHaveBeenCalled();
  view.rerender(<RecordingSettingsRecovery snapshot={{...snapshot,revision:2,settingsError:null,settingsRecoveryRevision:"review-b"}} busy={false} error={null} onRecover={recover} onClose={close}/>);expect(screen.getByText(/Las preferencias ya están disponibles/)).toBeInTheDocument();expect(screen.getByRole("button",{name:"Restaurar preferencias básicas"})).toBeDisabled();expect(recover).toHaveBeenCalledTimes(1);
});
it("requires a fresh review after changed bytes and keeps keyboard dismissal blocked during mutation",()=>{
  const recover=vi.fn(async()=>null),close=vi.fn();const view=render(<RecordingSettingsRecovery snapshot={snapshot} busy={true} error={null} onRecover={recover} onClose={close}/>);fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape"});expect(close).not.toHaveBeenCalled();view.rerender(<RecordingSettingsRecovery snapshot={{...snapshot,settingsRecoveryRevision:"review-b"}} busy={false} error={null} onRecover={recover} onClose={close}/>);expect(screen.getByRole("button",{name:"Restaurar preferencias básicas"})).toBeDisabled();expect(screen.getByText(/Las preferencias han cambiado/)).toBeInTheDocument();expect(recover).not.toHaveBeenCalled();
});
