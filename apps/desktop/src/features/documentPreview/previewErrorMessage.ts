export function previewErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  return message?.trim().slice(0, 1000) || fallback;
}
