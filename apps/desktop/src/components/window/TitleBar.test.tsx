import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startWindowDrag, toggleMaximizeWindow } from "../../lib/runtime/windowControls";
import { TitleBar } from "./TitleBar";

vi.mock("../../lib/runtime/windowControls", () => ({
  closeWindow: vi.fn(() => Promise.resolve()),
  minimizeWindow: vi.fn(() => Promise.resolve()),
  startWindowDrag: vi.fn(() => Promise.resolve()),
  startWindowResize: vi.fn(() => Promise.resolve()),
  toggleMaximizeWindow: vi.fn(() => Promise.resolve()),
}));

describe("TitleBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("drags the window from the header on a single primary pointer down", () => {
    render(<TitleBar />);

    const pointerDown = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(pointerDown, "button", { value: 0 });
    Object.defineProperty(pointerDown, "detail", { value: 1 });
    screen.getByRole("banner").dispatchEvent(pointerDown);

    expect(startWindowDrag).toHaveBeenCalledTimes(1);
    expect(toggleMaximizeWindow).not.toHaveBeenCalled();
  });

  it("toggles maximize from the header on double click", () => {
    render(<TitleBar />);

    fireEvent.pointerDown(screen.getByRole("banner"), { button: 0, detail: 2 });
    fireEvent.doubleClick(screen.getByRole("banner"), { button: 0 });

    expect(startWindowDrag).not.toHaveBeenCalled();
    expect(toggleMaximizeWindow).toHaveBeenCalledTimes(1);
  });

  it("keeps window control interactions isolated from header double click", () => {
    render(<TitleBar />);

    fireEvent.doubleClick(screen.getByRole("button", { name: "Minimizar" }), { button: 0 });

    expect(toggleMaximizeWindow).not.toHaveBeenCalled();
  });
});
