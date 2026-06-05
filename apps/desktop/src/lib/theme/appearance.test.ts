import { afterEach, describe, expect, it } from "vitest";
import { applyAppearanceAttributes, getAccentPalette } from "./appearance";
import type { AppearanceConfig } from "../../types/domain";

describe("appearance theme helpers", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePreference;
    delete document.documentElement.dataset.accent;
    document.documentElement.style.colorScheme = "";
  });

  it("resolves unknown accent colors back to the KnowNext orange palette", () => {
    expect(getAccentPalette("orange").projectColor).toBe("#F37021");
    expect(getAccentPalette("not-a-color" as AppearanceConfig["primaryColor"]).id).toBe("orange");
  });

  it("applies theme preference, resolved theme and accent attributes to the document", () => {
    applyAppearanceAttributes(
      {
        themeMode: "system",
        primaryColor: "green",
        language: "es",
        zoomPercent: 100,
        markdownExtendedUnderlineEnabled: true,
      },
      "dark",
    );

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themePreference).toBe("system");
    expect(document.documentElement.dataset.accent).toBe("green");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
