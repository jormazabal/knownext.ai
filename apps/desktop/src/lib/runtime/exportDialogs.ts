import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import type { ExportFormat, HandwrittenExportFormat } from "../../types/domain";

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

export type BrowserExportTarget = {
  fileName: string;
  save: (blob: Blob) => Promise<void>;
};

const exportDialogFilters: Record<ExportFormat, { name: string; extensions: string[] }> = {
  md: { name: "Markdown", extensions: ["md"] },
  pdf: { name: "PDF", extensions: ["pdf"] },
  docx: { name: "Word", extensions: ["docx"] },
};

const browserFileTypes: Record<ExportFormat, { description: string; accept: Record<string, string[]> }> = {
  md: { description: "Markdown", accept: { "text/markdown": [".md"] } },
  pdf: { description: "PDF", accept: { "application/pdf": [".pdf"] } },
  docx: {
    description: "Word",
    accept: { "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] },
  },
};

const handwrittenExportDialogFilters: Record<HandwrittenExportFormat, { name: string; extensions: string[] }> = {
  knote: { name: "KnowNext handwritten note", extensions: ["knote"] },
  png: { name: "PNG", extensions: ["png"] },
  svg: { name: "SVG", extensions: ["svg"] },
  pdf: { name: "PDF", extensions: ["pdf"] },
};

const handwrittenBrowserFileTypes: Record<HandwrittenExportFormat, { description: string; accept: Record<string, string[]> }> = {
  knote: { description: "KnowNext handwritten note", accept: { "application/vnd.knownext.handwritten-note+json": [".knote"] } },
  png: { description: "PNG", accept: { "image/png": [".png"] } },
  svg: { description: "SVG", accept: { "image/svg+xml": [".svg"] } },
  pdf: { description: "PDF", accept: { "application/pdf": [".pdf"] } },
};

export async function selectExportFilePath(defaultFileName: string, format: ExportFormat): Promise<string | null> {
  if (!isTauriRuntime()) return null;

  try {
    return await saveDialog({
      title: "Exportar documento",
      defaultPath: withExportExtension(defaultFileName, format),
      filters: [exportDialogFilters[format]],
    });
  } catch {
    return null;
  }
}

export async function selectBrowserExportTarget(defaultFileName: string, format: ExportFormat): Promise<BrowserExportTarget | null> {
  if (typeof window === "undefined") return null;

  const fileName = withExportExtension(defaultFileName, format);
  const savePicker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (savePicker) {
    try {
      const handle = await savePicker({
        suggestedName: fileName,
        types: [browserFileTypes[format]],
      });
      return {
        fileName,
        save: async (blob) => {
          try {
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
          } catch {
            saveBlobAsDownload(fileName, blob);
          }
        },
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return null;
      return createDownloadTarget(fileName);
    }
  }

  return createDownloadTarget(fileName);
}

export async function selectHandwrittenExportFilePath(defaultFileName: string, format: HandwrittenExportFormat): Promise<string | null> {
  if (!isTauriRuntime()) return null;

  try {
    return await saveDialog({
      title: "Exportar nota a mano",
      defaultPath: withHandwrittenExportExtension(defaultFileName, format),
      filters: [handwrittenExportDialogFilters[format]],
    });
  } catch {
    return null;
  }
}

export async function selectBrowserHandwrittenExportTarget(defaultFileName: string, format: HandwrittenExportFormat): Promise<BrowserExportTarget | null> {
  if (typeof window === "undefined") return null;

  const fileName = withHandwrittenExportExtension(defaultFileName, format);
  const savePicker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (savePicker) {
    try {
      const handle = await savePicker({
        suggestedName: fileName,
        types: [handwrittenBrowserFileTypes[format]],
      });
      return {
        fileName,
        save: async (blob) => {
          try {
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
          } catch {
            saveBlobAsDownload(fileName, blob);
          }
        },
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return null;
      return createDownloadTarget(fileName);
    }
  }

  return createDownloadTarget(fileName);
}

export function withExportExtension(fileName: string, format: ExportFormat) {
  const extension = `.${format}`;
  const withoutMarkdownExtension = fileName.replace(/\.[Mm][Dd]$/, "");
  return withoutMarkdownExtension.toLowerCase().endsWith(extension)
    ? withoutMarkdownExtension
    : `${withoutMarkdownExtension}${extension}`;
}

export function withHandwrittenExportExtension(fileName: string, format: HandwrittenExportFormat) {
  const extension = `.${format}`;
  const withoutKnownExtensions = fileName.replace(/\.(knote|png|svg|pdf)$/i, "");
  return withoutKnownExtensions.toLowerCase().endsWith(extension)
    ? withoutKnownExtensions
    : `${withoutKnownExtensions}${extension}`;
}

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function createDownloadTarget(fileName: string): BrowserExportTarget {
  return {
    fileName,
    save: async (blob) => saveBlobAsDownload(fileName, blob),
  };
}

function saveBlobAsDownload(fileName: string, blob: Blob) {
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
