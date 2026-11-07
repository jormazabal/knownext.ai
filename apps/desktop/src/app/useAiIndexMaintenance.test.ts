import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deleteAiIndex, getAiIndexStatus, rebuildAiIndex } from "../lib/api/ai";
import type { AiIndexStatusResponse } from "../types/domain";
import { useAiIndexMaintenance } from "./useAiIndexMaintenance";

vi.mock("../lib/api/ai", () => ({deleteAiIndex: vi.fn(), getAiIndexStatus: vi.fn(), rebuildAiIndex: vi.fn()}));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

function status(projectId = "project-a", indexRevision: string | null = "a".repeat(64)): AiIndexStatusResponse {
  return {projectId, indexRevision, enabled: false, status: indexRevision ? "updated" : "not-indexed", documentCount: 1, indexedDocumentCount: indexRevision ? 1 : 0, pendingDocumentCount: 0, failedDocumentCount: 0, deletedDocumentCount: 0, localExactReady: true};
}
function context() {
  return {projectId: "project-a", projectEpoch: 1, index: status(), onResult: vi.fn(), refresh: vi.fn(async () => {}), onError: vi.fn()};
}

it("refreshes the native state explicitly without rebuilding or clearing anything", async () => {
  const input = context();
  vi.mocked(getAiIndexStatus).mockResolvedValue(status("project-a", null));
  const {result} = renderHook(() => useAiIndexMaintenance(input));
  expect(getAiIndexStatus).not.toHaveBeenCalled();
  await act(async () => {await result.current.refresh();});
  expect(getAiIndexStatus).toHaveBeenCalledWith("project-a");
  expect(input.onResult).toHaveBeenCalledWith(status("project-a", null));
  expect(deleteAiIndex).not.toHaveBeenCalled();
  expect(rebuildAiIndex).not.toHaveBeenCalled();
  expect(input.refresh).not.toHaveBeenCalled();
});

it("sends the captured native revision once and blocks another operation until it settles", async () => {
  let resolve!: (value: AiIndexStatusResponse) => void;
  vi.mocked(deleteAiIndex).mockImplementation(() => new Promise(done => {resolve = done;}));
  const input = context();
  const {result} = renderHook(() => useAiIndexMaintenance(input));
  act(() => {void result.current.clear();});
  expect(result.current.busy).toBe(true);
  await act(async () => {await result.current.clear(); await result.current.rebuild();});
  expect(deleteAiIndex).toHaveBeenCalledTimes(1);
  expect(deleteAiIndex).toHaveBeenCalledWith("project-a", "a".repeat(64));
  expect(rebuildAiIndex).not.toHaveBeenCalled();
  await act(async () => {resolve(status("project-a", null));});
  expect(input.onResult).toHaveBeenCalledWith(status("project-a", null));
  expect(input.refresh).toHaveBeenCalledWith("project-a");
  expect(result.current.busy).toBe(false);
});

it("reconciles an unknown or partial ACK by reading without repeating the mutation", async () => {
  vi.mocked(deleteAiIndex).mockRejectedValue(new Error("El índice ya se ha retirado; no se guardaron preferencias"));
  vi.mocked(getAiIndexStatus).mockResolvedValue(status("project-a", null));
  const input = context();
  const {result} = renderHook(() => useAiIndexMaintenance(input));
  await act(async () => {await result.current.clear();});
  expect(deleteAiIndex).toHaveBeenCalledTimes(1);
  expect(getAiIndexStatus).toHaveBeenCalledTimes(1);
  expect(input.onResult).toHaveBeenCalledWith(status("project-a", null));
  expect(result.current.error).toContain("ya se ha retirado");
  expect(input.refresh).not.toHaveBeenCalled();
  expect(input.onError).toHaveBeenCalledTimes(1);
});

it("ignores a late result even after leaving and returning to the same project", async () => {
  let resolve!: (value: AiIndexStatusResponse) => void;
  vi.mocked(rebuildAiIndex).mockImplementation(() => new Promise(done => {resolve = done;}));
  const input = context();
  const {result, rerender} = renderHook(props => useAiIndexMaintenance(props), {initialProps: input});
  act(() => {void result.current.rebuild();});
  rerender({...input, projectId: "project-b", projectEpoch: 2, index: status("project-b")});
  rerender({...input, projectEpoch: 3});
  await act(async () => {resolve(status());});
  expect(input.onResult).not.toHaveBeenCalled();
  expect(input.refresh).not.toHaveBeenCalled();
  expect(result.current.error).toBeNull();
  expect(result.current.busy).toBe(false);
});

it("requires a revision owned by the current project and preserves prior state if reconciliation fails", async () => {
  const input = context();
  const {result, rerender} = renderHook(props => useAiIndexMaintenance(props), {initialProps: {...input, index: status("project-other")}});
  await act(async () => {await result.current.clear();});
  expect(deleteAiIndex).not.toHaveBeenCalled();
  expect(result.current.error).toContain("Actualiza el estado");
  rerender(input);
  vi.mocked(deleteAiIndex).mockRejectedValue(new Error("Índice de solo lectura"));
  vi.mocked(getAiIndexStatus).mockRejectedValue(new Error("Lectura fallida"));
  await act(async () => {await result.current.clear();});
  expect(input.onResult).not.toHaveBeenCalled();
  expect(result.current.error).toContain("solo lectura");
});
