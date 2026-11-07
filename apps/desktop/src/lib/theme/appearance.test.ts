import { afterEach, describe, expect, it, vi } from "vitest";
import { accentPalettes, applyAppearanceAttributes, getAccentPalette } from "./appearance";
import type { AppearanceConfig } from "../../types/domain";

describe("appearance theme helpers", () => {
  it("keeps action labels and accent text readable in all light and dark palettes",()=>{
    const rgb=(value:string)=>value.split(" ").map(Number);
    const luminance=(value:number[])=>value.map(channel=>{const s=channel/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const ratio=(a:number[],b:number[])=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    for(const palette of accentPalettes){
      for(const accent of [palette.light.accent,palette.light.accentHover]){
        expect(ratio(rgb(accent),[255,255,255]),`${palette.id} light action`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(rgb(accent),rgb(palette.light.accentSoft)),`${palette.id} light text`).toBeGreaterThanOrEqual(4.5);
      }
      for(const accent of [palette.dark.accent,palette.dark.accentHover]){
        expect(ratio(rgb(accent),[17,24,39]),`${palette.id} dark action`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(rgb(accent),rgb(palette.dark.accentSoft)),`${palette.id} dark text`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  afterEach(() => {
    document.documentElement.removeAttribute("lang");
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePreference;
    delete document.documentElement.dataset.accent;
    document.documentElement.style.colorScheme = "";
    delete window.KnownextAppearance;
  });

  it("keeps document language aligned with the visible interface for assistive readers",()=>{
    const appearance={themeMode:"light",primaryColor:"orange",language:"en"} as AppearanceConfig;
    applyAppearanceAttributes(appearance,"light");expect(document.documentElement.lang).toBe("en");
    applyAppearanceAttributes({...appearance,language:"es"},"light");expect(document.documentElement.lang).toBe("es");
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

  it("keeps native bars aligned with the resolved theme without letting older hosts interrupt startup", () => {
    const appearance={themeMode:"system",primaryColor:"orange"} as AppearanceConfig;
    const setTheme=vi.fn();window.KnownextAppearance={setTheme};
    applyAppearanceAttributes(appearance,"dark");expect(setTheme).toHaveBeenLastCalledWith(true);
    applyAppearanceAttributes(appearance,"light");expect(setTheme).toHaveBeenLastCalledWith(false);
    window.KnownextAppearance={setTheme:()=>{throw Error("Older native host");}};
    expect(()=>applyAppearanceAttributes(appearance,"dark")).not.toThrow();expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
