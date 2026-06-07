import type { AiEditOperation } from "../types/domain";

export type AiMarkdownOperationReviewReason =
  | "missing_replacement"
  | "missing_anchor"
  | "anchor_not_found"
  | "anchor_ambiguous"
  | "editor_apply_failed";

export type AiMarkdownOperationApplication =
  | {
      applied: true;
      markdown: string;
    }
  | {
      applied: false;
      reason: AiMarkdownOperationReviewReason;
    };

export function applyAiEditOperationToMarkdown(
  operation: AiEditOperation,
  currentMarkdown: string,
  options: { imageMarkdown?: string | null } = {},
): AiMarkdownOperationApplication {
  if (operation.action === "replace_document") {
    const replacement = operation.markdown ?? operation.replacementMarkdown;
    if (!replacement) return { applied: false, reason: "missing_replacement" };
    return { applied: true, markdown: normalizeLineEndings(replacement) };
  }

  if (operation.action === "replace_selection" || operation.action === "edit_block" || operation.action === "edit_document") {
    const replacement = operation.replacementMarkdown ?? operation.markdown;
    if (!replacement) return { applied: false, reason: "missing_replacement" };
    return replaceUniqueExcerpt(currentMarkdown, operation.originalExcerpt, replacement);
  }

  if (operation.action === "insert_at_cursor" || operation.action === "insert_diagram") {
    const insertion = operation.markdown ?? operation.replacementMarkdown;
    if (!insertion) return { applied: false, reason: "missing_replacement" };
    return insertByPlacement(
      currentMarkdown,
      insertion,
      operation.placement?.anchorExcerpt ?? operation.anchorExcerpt,
      operation.placement?.type ?? "at_cursor",
      operation.placement?.headingPath ?? operation.headingPath,
    );
  }

  if (operation.action === "insert_image") {
    const insertion = options.imageMarkdown;
    if (!insertion) return { applied: false, reason: "missing_replacement" };
    const placementType = operation.placement?.type ?? "document_end";
    const anchor = operation.placement?.anchorExcerpt ?? operation.anchorExcerpt ?? operation.originalExcerpt;
    if (placementType === "replace_selection") return replaceUniqueExcerpt(currentMarkdown, operation.originalExcerpt, insertion);
    if (placementType === "before_selection") return insertBeforeUniqueExcerpt(currentMarkdown, operation.originalExcerpt, insertion);
    if (placementType === "after_selection") return insertAfterUniqueExcerpt(currentMarkdown, operation.originalExcerpt, insertion);
    return insertByPlacement(currentMarkdown, insertion, anchor, placementType, operation.placement?.headingPath ?? operation.headingPath);
  }

  return { applied: false, reason: "missing_anchor" };
}

function insertByPlacement(
  currentMarkdown: string,
  insertion: string,
  anchorExcerpt: string | null | undefined,
  placementType: string,
  headingPath?: string[] | null,
): AiMarkdownOperationApplication {
  if (placementType === "document_end") {
    return { applied: true, markdown: appendMarkdownBlock(currentMarkdown, insertion) };
  }
  if (placementType === "after_heading") {
    return insertAfterHeading(currentMarkdown, headingPath, insertion);
  }
  return insertAfterUniqueExcerpt(currentMarkdown, anchorExcerpt, insertion);
}

function insertAfterHeading(
  currentMarkdown: string,
  headingPath: string[] | null | undefined,
  insertion: string,
): AiMarkdownOperationApplication {
  const headingParts = headingPath?.map((part) => part.trim()).filter(Boolean) ?? [];
  const targetHeading = headingParts.length > 0 ? headingParts[headingParts.length - 1] : undefined;
  if (!targetHeading) return { applied: false, reason: "missing_anchor" };

  const normalizedMarkdown = normalizeLineEndings(currentMarkdown);
  const lines = normalizedMarkdown.split("\n");
  let offset = 0;
  let match: { index: number; length: number } | null = null;

  for (const line of lines) {
    const lineLength = line.length + 1;
    const headingText = readAtxHeadingText(line);
    if (headingText === targetHeading) {
      if (match) return { applied: false, reason: "anchor_ambiguous" };
      match = { index: offset, length: line.length };
    }
    offset += lineLength;
  }

  if (!match) return { applied: false, reason: "anchor_not_found" };

  const insertAt = match.index + match.length;
  return {
    applied: true,
    markdown: joinMarkdownBlocks(
      normalizedMarkdown.slice(0, insertAt),
      insertion,
      normalizedMarkdown.slice(insertAt),
    ),
  };
}

function replaceUniqueExcerpt(
  currentMarkdown: string,
  excerpt: string | null | undefined,
  replacement: string,
): AiMarkdownOperationApplication {
  const match = findUniqueExcerpt(currentMarkdown, excerpt);
  if (!match.applied) return match;
  const normalizedMarkdown = normalizeLineEndings(currentMarkdown);
  return {
    applied: true,
    markdown: `${normalizedMarkdown.slice(0, match.index)}${normalizeLineEndings(replacement)}${normalizedMarkdown.slice(match.index + match.excerpt.length)}`,
  };
}

function insertBeforeUniqueExcerpt(
  currentMarkdown: string,
  excerpt: string | null | undefined,
  insertion: string,
): AiMarkdownOperationApplication {
  const match = findUniqueExcerpt(currentMarkdown, excerpt);
  if (!match.applied) return match;
  const normalizedMarkdown = normalizeLineEndings(currentMarkdown);
  return {
    applied: true,
    markdown: joinMarkdownBlocks(
      normalizedMarkdown.slice(0, match.index),
      insertion,
      normalizedMarkdown.slice(match.index),
    ),
  };
}

function insertAfterUniqueExcerpt(
  currentMarkdown: string,
  excerpt: string | null | undefined,
  insertion: string,
): AiMarkdownOperationApplication {
  const match = findUniqueExcerpt(currentMarkdown, excerpt);
  if (!match.applied) return match;
  const normalizedMarkdown = normalizeLineEndings(currentMarkdown);
  const insertAt = match.index + match.excerpt.length;
  return {
    applied: true,
    markdown: joinMarkdownBlocks(
      normalizedMarkdown.slice(0, insertAt),
      insertion,
      normalizedMarkdown.slice(insertAt),
    ),
  };
}

function findUniqueExcerpt(
  currentMarkdown: string,
  excerpt: string | null | undefined,
): { applied: true; index: number; excerpt: string } | { applied: false; reason: "missing_anchor" | "anchor_not_found" | "anchor_ambiguous" } {
  const normalizedExcerpt = normalizeLineEndings(excerpt ?? "").trim();
  if (!normalizedExcerpt) return { applied: false, reason: "missing_anchor" };

  const normalizedMarkdown = normalizeLineEndings(currentMarkdown);
  const firstIndex = normalizedMarkdown.indexOf(normalizedExcerpt);
  if (firstIndex < 0) return { applied: false, reason: "anchor_not_found" };
  const secondIndex = normalizedMarkdown.indexOf(normalizedExcerpt, firstIndex + normalizedExcerpt.length);
  if (secondIndex >= 0) return { applied: false, reason: "anchor_ambiguous" };
  return { applied: true, index: firstIndex, excerpt: normalizedExcerpt };
}

function appendMarkdownBlock(currentMarkdown: string, insertion: string) {
  const normalizedMarkdown = normalizeLineEndings(currentMarkdown).trimEnd();
  const normalizedInsertion = normalizeLineEndings(insertion).trim();
  if (!normalizedMarkdown) return `${normalizedInsertion}\n`;
  return `${normalizedMarkdown}\n\n${normalizedInsertion}\n`;
}

function joinMarkdownBlocks(before: string, insertion: string, after: string) {
  const normalizedBefore = normalizeLineEndings(before).trimEnd();
  const normalizedInsertion = normalizeLineEndings(insertion).trim();
  const normalizedAfter = normalizeLineEndings(after).trimStart();
  if (!normalizedBefore && !normalizedAfter) return `${normalizedInsertion}\n`;
  if (!normalizedBefore) return `${normalizedInsertion}\n\n${normalizedAfter}`;
  if (!normalizedAfter) return `${normalizedBefore}\n\n${normalizedInsertion}\n`;
  return `${normalizedBefore}\n\n${normalizedInsertion}\n\n${normalizedAfter}`;
}

function readAtxHeadingText(line: string) {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trim());
  return match?.[2]?.trim() ?? null;
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
