import { open } from "@tauri-apps/plugin-dialog";

export async function selectAiContextFilePaths(): Promise<string[]> {
  const selected = await open({
    title: "Adjuntar archivos al contexto IA",
    multiple: true,
    filters: [
      {
        name: "Documentos e imágenes",
        extensions: ["md", "txt", "csv", "pdf", "docx", "pptx", "xlsx", "png", "jpg", "jpeg", "webp", "gif"],
      },
    ],
  });

  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}
