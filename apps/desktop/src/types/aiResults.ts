import type { HandwrittenNoteContent } from "./domain";
export type AiReviewOutput = { id: string; name: string; summary: string } & (
  { kind: "markdown"; markdown: string } | { kind: "handwritten"; content: HandwrittenNoteContent }
  | { kind: "image"; dataBase64: string; format: "png" | "jpeg" | "webp" }
);
export type AiReviewRecord = {
  id: string; projectId: string; projectName: string; receivedAt: string; reason: string;
  answer: string; outputs: AiReviewOutput[]; appliedPaths: string[];
  originProjectRootHash?: string;
};
