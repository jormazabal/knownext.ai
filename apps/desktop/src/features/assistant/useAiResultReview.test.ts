import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAiResultReview } from "./useAiResultReview";
import { copyAiResult, listAiResults, preserveAiResult, removeAiResult } from "../../lib/api/aiResults";
import type { AiReviewRecord } from "../../types/aiResults";
vi.mock("../../lib/api/aiResults", () => ({ copyAiResult: vi.fn(), listAiResults: vi.fn(), preserveAiResult: vi.fn(), removeAiResult: vi.fn() }));
const record: AiReviewRecord = { id: "project:result", projectId: "project", projectName: "QA", receivedAt: "2026-10-31T10:00:00Z", reason: "New typing", answer: "Output", outputs: [{ id: "output", kind: "markdown", markdown: "Output", name: "Proposal", summary: "Edit" }], appliedPaths: [] };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(listAiResults).mockResolvedValue({ results: [], warnings: [] }); vi.mocked(preserveAiResult).mockResolvedValue(record); vi.mocked(removeAiResult).mockResolvedValue({ removed: true }); vi.mocked(copyAiResult).mockResolvedValue({ tree: [], node: null, affectedDocuments: [] }); });
afterEach(cleanup);
it("adopts the exact native acknowledgement without rewriting its identity or timestamp", async () => {
  const { result } = renderHook(() => useAiResultReview(false));
  act(() => result.current.adopt(record, true));
  expect(result.current.entries).toEqual([{ result: record, stored: true, error: undefined }]);
  expect(preserveAiResult).not.toHaveBeenCalled();
  await act(async () => result.current.copy(record.id, "output"));
  expect(preserveAiResult).not.toHaveBeenCalled();
  expect(copyAiResult).toHaveBeenCalledWith(record.id, "output");
});
it("keeps a native preservation failure in RAM and retries the same record", async () => {
  const { result } = renderHook(() => useAiResultReview(false));
  act(() => result.current.adopt(record, false, "Disk unavailable"));
  expect(result.current.entries[0].error).toBe("Disk unavailable");
  await act(async () => result.current.retain(record));
  expect(preserveAiResult).toHaveBeenCalledWith(record);
  expect(result.current.entries[0].stored).toBe(true);
});
it("never downgrades a confirmed copy when a delayed failed receipt is adopted", async () => {
  const {result}=renderHook(()=>useAiResultReview(false));act(()=>result.current.adopt(record,false,"Initial failure"));
  await act(async()=>result.current.retain(record));act(()=>result.current.adopt(record,false,"Stale failure"));
  expect(result.current.entries).toEqual([{result:record,stored:true}]);
});
it("uses a durable inventory acknowledgement ahead of the older session-only state", async () => {
  const {result}=renderHook(()=>useAiResultReview(false));act(()=>result.current.adopt(record,false,"Initial failure"));
  vi.mocked(listAiResults).mockResolvedValueOnce({results:[record],warnings:[]});await act(async()=>result.current.reload());
  expect(result.current.entries).toEqual([{result:record,stored:true}]);
});
it("does not resurrect explicitly removed output from delayed receipts, retention or inventory", async () => {
  const {result}=renderHook(()=>useAiResultReview(false));act(()=>result.current.adopt(record,true));await act(async()=>result.current.remove(record.id));
  expect(result.current.wasRemoved(record.id)).toBe(true);act(()=>result.current.adopt(record,true));await act(async()=>result.current.retain(record));
  vi.mocked(listAiResults).mockResolvedValueOnce({results:[record],warnings:[]});await act(async()=>result.current.reload());
  expect(result.current.entries).toHaveLength(0);expect(preserveAiResult).not.toHaveBeenCalled();
});
it("removes the durable copy confirmed while an earlier preservation failure was in flight", async () => {
  let reject!: (error:Error)=>void;vi.mocked(preserveAiResult).mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;}));
  const {result}=renderHook(()=>useAiResultReview(false));let writing!:Promise<void>,removing!:Promise<void>;
  act(()=>{writing=result.current.retain(record);});act(()=>{removing=result.current.remove(record.id);});
  act(()=>result.current.adopt(record,true));await act(async()=>{reject(new Error("Delayed failure"));await writing;await removing;});
  expect(removeAiResult).toHaveBeenCalledWith(record.id);expect(result.current.entries).toHaveLength(0);
});
it("keeps failed preservation in RAM and retries without invoking a provider", async () => {
  vi.mocked(preserveAiResult).mockRejectedValueOnce(new Error("Disk unavailable"));
  const { result } = renderHook(() => useAiResultReview(true)); await act(async () => {});
  await act(async () => result.current.retain(record)); expect(result.current.entries[0]).toMatchObject({ stored: false, result: record }); expect(result.current.entries[0].error).toBeTruthy();
  await act(async () => result.current.retain(record)); expect(result.current.entries[0]).toMatchObject({ stored: true, result: record }); expect(result.current.entries[0].error).toBeUndefined();
});
it("ignores an older startup list after a new result arrives", async () => {
  let finish!: (value: { results: AiReviewRecord[]; warnings: string[] }) => void;
  vi.mocked(listAiResults).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useAiResultReview(true));
  await act(async () => result.current.retain(record)); await act(async () => finish({ results: [], warnings: [] })); expect(result.current.entries).toHaveLength(1);
  await act(async () => result.current.reload()); expect(result.current.entries).toHaveLength(0);
});
it("waits for an in-flight preservation before removing the stored result", async () => {
  let finish!: (value: AiReviewRecord) => void;
  vi.mocked(preserveAiResult).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useAiResultReview(false)); let writing!: Promise<void>, removing!: Promise<void>;
  act(() => { writing = result.current.retain(record); }); act(() => { removing = result.current.remove(record.id); }); expect(removeAiResult).not.toHaveBeenCalled();
  await act(async () => { finish(record); await writing; await removing; }); expect(removeAiResult).toHaveBeenCalledWith(record.id); expect(result.current.entries).toHaveLength(0);
});
it("serializes copy clicks and retains a result when copying fails", async () => {
  const { result } = renderHook(() => useAiResultReview(false)); await act(async () => result.current.retain(record));
  let reject!: (reason: unknown) => void;
  vi.mocked(copyAiResult).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  let first!: Promise<unknown>; act(() => { first = result.current.copy(record.id, "output"); }); await act(async () => {});
  await act(async () => { await result.current.copy(record.id, "output"); }); expect(copyAiResult).toHaveBeenCalledOnce();
  await act(async () => { reject(new Error("Copy has newer changes")); await first; }); expect(result.current.entries).toHaveLength(1); expect(result.current.error).toBeTruthy();
});
it("loads durable results once enabled and reports inventory warnings", async () => {
  vi.mocked(listAiResults).mockResolvedValue({ results: [record], warnings: ["A damaged record is preserved"] });
  const { result, rerender } = renderHook(({ enabled }) => useAiResultReview(enabled), { initialProps: { enabled: false } }); expect(listAiResults).not.toHaveBeenCalled();
  await act(async () => rerender({ enabled: true })); expect(result.current.entries[0].stored).toBe(true); expect(result.current.warnings).toHaveLength(1);
});
