import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: splitVendorChunks,
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
});

function splitVendorChunks(id: string) {
  const moduleId = id.replace(/\\/g, "/");

  if (!moduleId.includes("/node_modules/")) return;

  if (matchesPackage(moduleId, "@milkdown/crepe")) return "milkdown-crepe";
  if (matchesPackage(moduleId, "@milkdown/components") || moduleId.includes("/@milkdown/plugin-")) return "milkdown-ui";
  if (moduleId.includes("/@milkdown/preset-")) return "milkdown-presets";
  if (matchesPackage(moduleId, "@milkdown/prose") || moduleId.includes("/prosemirror-")) return "milkdown-core";
  if (moduleId.includes("/@milkdown/")) return "milkdown-core";
  if (matchesPackage(moduleId, "codemirror")) return "codemirror-core";
  if (moduleId.includes("/@codemirror/")) return getCodeMirrorChunk(moduleId);
  if (moduleId.includes("/@lezer/")) return getLezerChunk(moduleId);
  if (moduleId.includes("/katex/")) return "katex";
}

function matchesPackage(moduleId: string, packageName: string) {
  return moduleId.includes(`/node_modules/${packageName}/`);
}

function getCodeMirrorChunk(moduleId: string) {
  const packageName = getScopedPackageName(moduleId, "@codemirror");

  if (packageName === "@codemirror/state") return "codemirror-state";
  if (packageName === "@codemirror/view") return "codemirror-view";
  if (packageName === "@codemirror/language") return "codemirror-language";
  if (packageName === "@codemirror/language-data") return "codemirror-language-data";
  if (packageName === "@codemirror/legacy-modes") return "codemirror-legacy-modes";
  if (packageName?.startsWith("@codemirror/lang-")) return `codemirror-${packageName.slice("@codemirror/lang-".length)}`;
  return "codemirror-extensions";
}

function getLezerChunk(moduleId: string) {
  const packageName = getScopedPackageName(moduleId, "@lezer");

  if (packageName === "@lezer/common" || packageName === "@lezer/highlight" || packageName === "@lezer/lr") return "lezer-core";
  return `lezer-${packageName?.slice("@lezer/".length) ?? "parsers"}`;
}

function getScopedPackageName(moduleId: string, scope: string) {
  const packagePath = `/node_modules/${scope}/`;
  const packageStart = moduleId.indexOf(packagePath);
  if (packageStart === -1) return null;

  const nameStart = packageStart + packagePath.length;
  const nameEnd = moduleId.indexOf("/", nameStart);
  if (nameEnd === -1) return null;

  return `${scope}/${moduleId.slice(nameStart, nameEnd)}`;
}
