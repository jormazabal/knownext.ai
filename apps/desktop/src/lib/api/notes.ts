import type { UserNotes } from "../../types/domain";
import { requestJson } from "./client";

export async function getUserNotes(): Promise<UserNotes> {
  return requestJson<UserNotes>("/api/notes");
}

export async function saveUserNotes(markdown: string): Promise<UserNotes> {
  return requestJson<UserNotes>("/api/notes", {
    method: "PUT",
    body: JSON.stringify({ markdown }),
  });
}
