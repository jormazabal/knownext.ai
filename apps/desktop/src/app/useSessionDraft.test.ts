import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useSessionDraft } from "./useSessionDraft";

it("restores each scope and keeps asynchronous completion bound to its original draft", () => {
  const { result, rerender } = renderHook(({ scope }) => useSessionDraft(scope), { initialProps: { scope: "project/a" } });
  act(() => result.current[1]("Draft A"));
  const finishA = result.current[1];
  rerender({ scope: "project/b" });
  expect(result.current[0]).toBe("");
  act(() => result.current[1]("Draft B"));
  act(() => finishA(""));
  expect(result.current[0]).toBe("Draft B");
  rerender({ scope: "project/a" });
  expect(result.current[0]).toBe("");
  act(() => result.current[1]("Recovered"));
  rerender({ scope: "project/b" });
  rerender({ scope: "project/a" });
  expect(result.current[0]).toBe("Recovered");
});
