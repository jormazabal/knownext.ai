import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRecordings } from "./useRecordings";
import { recordingRequest } from "../../lib/api/recordings";
import type { RecordingSnapshot } from "../../types/recording";
vi.mock("../../lib/api/recordings", () => ({ recordingRequest: vi.fn() }));
const snapshot = {
  revision: 2,
  sessions: [],
  settings: {
    microphone: true,
    systemAudio: true,
    model: "gpt-transcribe",
    languages: [],
    microphoneDevice: null,
    outputDevice: null,
    retentionDays: 7,
    startWithWindows: true,
    keepInTray: true,
  },
  levels: [0, 0],
  preview: false,
  captureOwner: "session",
  warning: null,
  devices: [],
} satisfies RecordingSnapshot;
describe("recording runtime acknowledgements", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(recordingRequest).mockReset();
  });
  afterEach(() => vi.useRealTimers());
  it("does not confirm a transition before runtime acknowledgement and suppresses double commands", async () => {
    let confirm!: (s: RecordingSnapshot) => void;
    vi.mocked(recordingRequest).mockImplementation((action) =>
      action === "snapshot"
        ? (Promise.resolve(snapshot) as never)
        : (new Promise((resolve) => {
            confirm = resolve as typeof confirm;
          }) as never),
    );
    const { result, unmount } = renderHook(useRecordings);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.snapshot?.revision).toBe(2);
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.command("pause", { id: "session" });
      void result.current.command("pause", { id: "session" });
    });
    expect(result.current.busy).toBe("pause");
    expect(result.current.snapshot?.revision).toBe(2);
    expect(
      vi.mocked(recordingRequest).mock.calls.filter((c) => c[0] === "pause"),
    ).toHaveLength(1);
    await act(async () => {
      confirm({ ...snapshot, revision: 3 });
      await pending;
    });
    expect(result.current.snapshot?.revision).toBe(3);
    unmount();
  });
  it("ignores a stale response and surfaces a failed command without changing state", async () => {
    vi.mocked(recordingRequest).mockImplementation((action) =>
      action === "snapshot"
        ? (Promise.resolve(snapshot) as never)
        : Promise.reject(new Error("Dispositivo desconectado")),
    );
    const { result, unmount } = renderHook(useRecordings);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.snapshot).not.toBeNull();
    await act(async () => {
      await result.current.command("resume");
    });
    expect(result.current.error).toContain("Dispositivo desconectado");
    expect(result.current.snapshot?.revision).toBe(2);
    vi.mocked(recordingRequest).mockResolvedValue({
      ...snapshot,
      revision: 1,
    } as never);
    await act(async () => {
      await result.current.command("pause");
    });
    expect(result.current.snapshot?.revision).toBe(2);
    unmount();
  });
});
