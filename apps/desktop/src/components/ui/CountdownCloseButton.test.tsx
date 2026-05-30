import { act, cleanup, render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountdownCloseButton } from "./CountdownCloseButton";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CountdownCloseButton", () => {
  it("renders as an icon-only circular close button with a progress ring", () => {
    render(<CountdownCloseButton ariaLabel="Cerrar aviso" onClose={vi.fn()} />);

    const button = screen.getByLabelText("Cerrar aviso");
    expect(button).toHaveTextContent("");
    expect(button).toHaveClass("h-7", "w-7", "rounded-full");
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(button.querySelector(".lucide-x")).toBeInTheDocument();
  });

  it("closes when clicked", () => {
    const onClose = vi.fn();

    render(<CountdownCloseButton ariaLabel="Cerrar aviso" onClose={onClose} />);

    fireEvent.click(screen.getByLabelText("Cerrar aviso"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close again after a manual close", () => {
    const onClose = vi.fn();

    render(<CountdownCloseButton ariaLabel="Cerrar aviso" durationMs={10_000} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText("Cerrar aviso"));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes automatically when the countdown finishes", () => {
    const onClose = vi.fn();

    render(<CountdownCloseButton ariaLabel="Cerrar aviso" durationMs={10_000} onClose={onClose} />);

    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
