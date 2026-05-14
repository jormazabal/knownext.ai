import { useEffect, useMemo, useState } from "react";
import type { AppearanceAccentColor, AppearanceConfig, AppearanceThemeMode } from "../../types/domain";

export type ResolvedThemeMode = "light" | "dark";

export type AccentPalette = {
  id: AppearanceAccentColor;
  label: string;
  projectColor: string;
  light: AccentTokens;
  dark: AccentTokens;
};

type AccentTokens = {
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentBorder: string;
  accentRing: string;
};

export const accentPalettes: AccentPalette[] = [
  createPalette("orange", "Naranja", "#F37021", {
    light: ["243 112 33", "216 90 18", "255 241 232", "254 215 190", "251 146 60"],
    dark: ["251 146 60", "255 177 112", "67 39 24", "154 74 28", "251 146 60"],
  }),
  createPalette("amber", "Ámbar", "#F59E0B", {
    light: ["245 158 11", "217 119 6", "255 247 237", "253 230 138", "245 158 11"],
    dark: ["251 191 36", "252 211 77", "62 46 19", "146 99 11", "251 191 36"],
  }),
  createPalette("yellow", "Amarillo", "#FACC15", {
    light: ["161 98 7", "133 77 14", "254 252 232", "254 240 138", "202 138 4"],
    dark: ["250 204 21", "253 224 71", "57 50 18", "133 102 4", "250 204 21"],
  }),
  createPalette("lime", "Lima", "#A3E635", {
    light: ["101 163 13", "77 124 15", "247 254 231", "217 249 157", "101 163 13"],
    dark: ["163 230 53", "190 242 100", "38 55 18", "87 117 19", "163 230 53"],
  }),
  createPalette("olive", "Oliva", "#65A30D", {
    light: ["101 163 13", "77 124 15", "247 254 231", "190 242 100", "101 163 13"],
    dark: ["132 204 22", "163 230 53", "36 52 20", "77 124 15", "132 204 22"],
  }),
  createPalette("green", "Verde", "#16A34A", {
    light: ["22 163 74", "21 128 61", "240 253 244", "187 247 208", "22 163 74"],
    dark: ["74 222 128", "134 239 172", "21 52 34", "34 115 69", "74 222 128"],
  }),
  createPalette("cyan", "Cian", "#0891B2", {
    light: ["8 145 178", "14 116 144", "236 254 255", "165 243 252", "8 145 178"],
    dark: ["34 211 238", "103 232 249", "18 52 58", "21 113 129", "34 211 238"],
  }),
  createPalette("blue", "Azul", "#2563EB", {
    light: ["37 99 235", "29 78 216", "239 246 255", "191 219 254", "37 99 235"],
    dark: ["96 165 250", "147 197 253", "24 43 74", "37 99 174", "96 165 250"],
  }),
  createPalette("indigo", "Índigo", "#1D4ED8", {
    light: ["79 70 229", "67 56 202", "238 242 255", "199 210 254", "79 70 229"],
    dark: ["129 140 248", "165 180 252", "33 36 78", "67 56 165", "129 140 248"],
  }),
  createPalette("wine", "Vino", "#7F1D1D", {
    light: ["127 29 29", "153 27 27", "254 242 242", "254 202 202", "153 27 27"],
    dark: ["248 113 113", "252 165 165", "62 28 31", "127 29 29", "248 113 113"],
  }),
  createPalette("rose", "Rosa", "#BE123C", {
    light: ["190 18 60", "159 18 57", "255 241 242", "254 205 211", "190 18 60"],
    dark: ["251 113 133", "253 164 175", "68 26 38", "159 18 57", "251 113 133"],
  }),
  createPalette("red", "Rojo", "#DC2626", {
    light: ["220 38 38", "185 28 28", "254 242 242", "254 202 202", "220 38 38"],
    dark: ["248 113 113", "252 165 165", "69 28 28", "153 27 27", "248 113 113"],
  }),
];

const accentPaletteById = new Map(accentPalettes.map((palette) => [palette.id, palette]));

export function useResolvedAppearanceTheme(themeMode: AppearanceThemeMode): ResolvedThemeMode {
  const [systemTheme, setSystemTheme] = useState<ResolvedThemeMode>(() => readSystemTheme());

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setSystemTheme(query.matches ? "dark" : "light");
    handleChange();
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return useMemo(() => themeMode === "system" ? systemTheme : themeMode, [systemTheme, themeMode]);
}

export function getAccentPalette(primaryColor: AppearanceAccentColor): AccentPalette {
  return accentPaletteById.get(primaryColor) ?? accentPalettes[0];
}

export function applyAppearanceAttributes(appearance: AppearanceConfig, resolvedTheme: ResolvedThemeMode) {
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = appearance.themeMode;
  document.documentElement.dataset.accent = getAccentPalette(appearance.primaryColor).id;
  document.documentElement.style.colorScheme = resolvedTheme;
}

function readSystemTheme(): ResolvedThemeMode {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function createPalette(
  id: AppearanceAccentColor,
  label: string,
  projectColor: string,
  tokens: { light: [string, string, string, string, string]; dark: [string, string, string, string, string] },
): AccentPalette {
  return {
    id,
    label,
    projectColor,
    light: toTokens(tokens.light),
    dark: toTokens(tokens.dark),
  };
}

function toTokens([accent, accentHover, accentSoft, accentBorder, accentRing]: [string, string, string, string, string]): AccentTokens {
  return { accent, accentHover, accentSoft, accentBorder, accentRing };
}
