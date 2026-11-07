/** Opaque attempt identity; never a path or permission to replay a mutation. */
export function createConflictAttemptId() {
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
  return `attempt-${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
