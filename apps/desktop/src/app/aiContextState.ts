import type { AiContextSource } from "../types/domain";

const PROMPT_READY_CONTEXT_STATUSES = new Set<AiContextSource["status"]>(["ready", "warning", "expiring"]);

export function getVisibleAiContextSources(sources: AiContextSource[], removingSourceIds: ReadonlySet<string>) {
  return sources.filter((source) => !removingSourceIds.has(source.id));
}

export function getPromptContextSourceIds(sources: AiContextSource[], removingSourceIds: ReadonlySet<string>) {
  return getVisibleAiContextSources(sources, removingSourceIds)
    .filter((source) => PROMPT_READY_CONTEXT_STATUSES.has(source.status))
    .map((source) => source.id);
}
