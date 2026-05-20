import { describe, expect, it } from "vitest";
import { resolveVisibleWindowState } from "./windowControls";

const primaryWorkArea = { x: 0, y: 0, width: 1366, height: 768 };

describe("resolveVisibleWindowState", () => {
  it("keeps a window unchanged when it already fits inside the work area", () => {
    expect(resolveVisibleWindowState({ x: 120, y: 80, width: 1000, height: 620 }, [primaryWorkArea])).toEqual({
      x: 120,
      y: 80,
      width: 1000,
      height: 620,
    });
  });

  it("moves a partially offscreen window back inside the work area", () => {
    expect(resolveVisibleWindowState({ x: 900, y: 520, width: 800, height: 420 }, [primaryWorkArea])).toEqual({
      x: 566,
      y: 248,
      width: 800,
      height: 520,
    });
  });

  it("shrinks a restored window when it is larger than the available desktop", () => {
    expect(resolveVisibleWindowState({ x: -60, y: -40, width: 1920, height: 1080 }, [primaryWorkArea])).toEqual({
      x: 0,
      y: 0,
      width: 1366,
      height: 768,
    });
  });

  it("uses the work area with the largest visible intersection", () => {
    const secondaryWorkArea = { x: 1366, y: 0, width: 1280, height: 720 };

    expect(resolveVisibleWindowState({ x: 1500, y: 80, width: 900, height: 620 }, [primaryWorkArea, secondaryWorkArea])).toEqual({
      x: 1500,
      y: 80,
      width: 900,
      height: 620,
    });
  });
});
