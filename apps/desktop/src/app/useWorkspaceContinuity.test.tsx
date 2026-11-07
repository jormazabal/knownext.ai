import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceContinuity } from "./useWorkspaceContinuity";

afterEach(() => vi.useRealTimers());

it("only checkpoints changed published models periodically and removes the timer on unmount", async () => {
  vi.useFakeTimers();
  let revision = 0;
  const checkpoint = vi.fn(async () => true);
  const reconcile = vi.fn(async () => {});
  const { unmount } = renderHook(() => useWorkspaceContinuity(true, checkpoint, reconcile, () => revision));
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(checkpoint).not.toHaveBeenCalled();
  revision++;
  await act(() => vi.advanceTimersByTimeAsync(5_000));
  expect(checkpoint.mock.calls).toEqual([[false]]);
  expect(reconcile).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(checkpoint).toHaveBeenCalledTimes(1);
  unmount();
  revision++;
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(checkpoint).toHaveBeenCalledTimes(1);
});
