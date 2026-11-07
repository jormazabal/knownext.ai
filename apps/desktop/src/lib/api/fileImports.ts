export const MAX_PROJECT_IMPORT_BYTES=32*1024*1024;

/** Reject before FileReader/base64 can duplicate a large file in memory. */
export function validateProjectImportFile(file:File) {
  if(file.size>MAX_PROJECT_IMPORT_BYTES)throw new Error("El archivo supera el límite de 32 MiB para importación al proyecto.");
}
