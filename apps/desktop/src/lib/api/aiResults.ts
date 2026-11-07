import { requestJson } from "./client";
import type { AiReviewRecord } from "../../types/aiResults";
import type { FileOperationResult } from "../../types/domain";

export const listAiResults = () => requestJson<{ results: AiReviewRecord[]; warnings: string[] }>("/api/ai/results");
export const preserveAiResult = (result: AiReviewRecord) => requestJson<AiReviewRecord>("/api/ai/results", { method: "POST", body: JSON.stringify(result) });
export const removeAiResult = (id: string) => requestJson<{ removed: boolean }>(`/api/ai/results/${encodeURIComponent(id)}`, { method: "DELETE" });
export const copyAiResult = (id: string, outputId: string) => requestJson<FileOperationResult>(`/api/ai/results/${encodeURIComponent(id)}/copy`, { method: "POST", body: JSON.stringify({ outputId }) });
