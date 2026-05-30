import { describe, expect, it } from "vitest";
import type { AiContextSource } from "../types/domain";
import { getPromptContextSourceIds, getVisibleAiContextSources } from "./aiContextState";

function source(id: string, status: AiContextSource["status"]): AiContextSource {
  return {
    id,
    projectId: "project-1",
    name: `${id}.md`,
    kind: "project_document",
    status,
    weight: "light",
    sizeBytes: 10,
    createdAt: "2026-05-30T12:00:00Z",
    updatedAt: "2026-05-30T12:00:00Z",
    expiresAt: null,
    lastUsedAt: null,
    path: `${id}.md`,
    mimeType: "text/markdown",
  };
}

describe("aiContextState", () => {
  it("hides sources that are being removed", () => {
    const visible = getVisibleAiContextSources(
      [source("keep", "ready"), source("remove", "ready")],
      new Set(["remove"]),
    );

    expect(visible.map((item) => item.id)).toEqual(["keep"]);
  });

  it("only sends prompt-ready and not-removing source ids", () => {
    const ids = getPromptContextSourceIds(
      [
        source("ready", "ready"),
        source("warning", "warning"),
        source("expiring", "expiring"),
        source("processing", "processing"),
        source("error", "error"),
        source("expired", "expired"),
        source("removing", "ready"),
      ],
      new Set(["removing"]),
    );

    expect(ids).toEqual(["ready", "warning", "expiring"]);
  });
});
