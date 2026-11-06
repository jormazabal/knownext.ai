import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { recordingRequest } from "../../lib/api/recordings";
import { useRecordings } from "./useRecordings";
import type { RecordingSnapshot } from "../../types/recording";
vi.mock("../../lib/api/recordings",()=>({recordingRequest:vi.fn()}));
const snapshot = (revision=1): RecordingSnapshot => ({revision,sessions:[],settings:{microphone:true,systemAudio:false,microphoneDevice:null,outputDevice:null,languages:[],model:"gpt-transcribe",retentionDays:null,startWithWindows:false,keepInTray:true},levels:[0,0],preview:false,captureOwner:null,warning:null,devices:[]});
const visibility = Object.getOwnPropertyDescriptor(document,"visibilityState");
function visible(value: "visible" | "hidden") { Object.defineProperty(document,"visibilityState",{configurable:true,value}); document.dispatchEvent(new Event("visibilitychange")); }
beforeEach(()=>{vi.useFakeTimers();visible("visible");vi.mocked(recordingRequest).mockReset().mockResolvedValue(snapshot());});
afterEach(()=>{cleanup();vi.useRealTimers();if(visibility)Object.defineProperty(document,"visibilityState",visibility);else Reflect.deleteProperty(document,"visibilityState");});
it("polls only the active surface, keeps confirmed data and never stops capture when hidden",async()=>{
  const {result,rerender}=renderHook(({active})=>useRecordings(active),{initialProps:{active:false}});
  expect(recordingRequest).not.toHaveBeenCalled();
  await act(async()=>rerender({active:true}));expect(recordingRequest).toHaveBeenCalledTimes(1);
  await act(async()=>vi.advanceTimersByTimeAsync(500));expect(recordingRequest).toHaveBeenCalledTimes(2);
  await act(async()=>rerender({active:false}));await act(async()=>vi.advanceTimersByTimeAsync(2000));
  expect(recordingRequest).toHaveBeenCalledTimes(2);expect(result.current.snapshot?.revision).toBe(1);
  expect(vi.mocked(recordingRequest).mock.calls.every(([action])=>action==="snapshot")).toBe(true);
});
it("suspends hidden-page queries and refreshes immediately on return",async()=>{
  visible("hidden");renderHook(()=>useRecordings());expect(recordingRequest).not.toHaveBeenCalled();
  await act(async()=>visible("visible"));expect(recordingRequest).toHaveBeenCalledTimes(1);
  await act(async()=>visible("hidden"));await act(async()=>vi.advanceTimersByTimeAsync(2000));expect(recordingRequest).toHaveBeenCalledTimes(1);
  await act(async()=>visible("visible"));expect(recordingRequest).toHaveBeenCalledTimes(2);
});
it("reuses an outstanding snapshot across rapid hide/show without overlapping reads",async()=>{
  let finish!: (value:RecordingSnapshot)=>void;
  vi.mocked(recordingRequest).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const {result,rerender}=renderHook(({active})=>useRecordings(active),{initialProps:{active:true}});
  await act(async()=>rerender({active:false}));await act(async()=>rerender({active:true}));
  expect(recordingRequest).toHaveBeenCalledTimes(1);
  await act(async()=>finish(snapshot(3)));expect(result.current.snapshot?.revision).toBe(3);
  await act(async()=>vi.advanceTimersByTimeAsync(500));expect(recordingRequest).toHaveBeenCalledTimes(2);
});
it("does not hide a failed command when the next snapshot succeeds",async()=>{
  const {result}=renderHook(()=>useRecordings());await act(async()=>{});
  vi.mocked(recordingRequest).mockRejectedValueOnce(new Error("No se pudo guardar"));
  await act(async()=>{await result.current.command("settings",{});});expect(result.current.error).toContain("No se pudo guardar");
  await act(async()=>vi.advanceTimersByTimeAsync(500));expect(result.current.error).toContain("No se pudo guardar");
  await act(async()=>{await result.current.command("settings",{});});expect(result.current.error).toBeNull();
});
it("clears a read failure after a confirmed snapshot without inventing a command result",async()=>{
  vi.mocked(recordingRequest).mockRejectedValueOnce(new Error("Sin lectura"));
  const {result}=renderHook(()=>useRecordings());await act(async()=>{});expect(result.current.error).toContain("Sin lectura");
  await act(async()=>vi.advanceTimersByTimeAsync(500));expect(result.current.error).toBeNull();expect(result.current.snapshot?.revision).toBe(1);
});
it("retains a newer command revision when an older read arrives afterwards",async()=>{
  let finish!: (value:RecordingSnapshot)=>void;
  vi.mocked(recordingRequest).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue(snapshot(2));
  const {result}=renderHook(()=>useRecordings());
  await act(async()=>{await result.current.command("settings",{});});expect(result.current.snapshot?.revision).toBe(2);
  await act(async()=>finish(snapshot(1)));expect(result.current.snapshot?.revision).toBe(2);
});
