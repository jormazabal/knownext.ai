import type { Node } from "@milkdown/kit/prose/model";

export type DocumentMatch = { from: number; to: number; text: string };
export type DocumentHeading = { position: number; level: number; text: string };
export type DocumentFindOptions = { caseSensitive?: boolean; wholeWord?: boolean };
export const DOCUMENT_QUERY_LIMIT = 200;

const wordCharacter = /[\p{L}\p{M}\p{N}_]/u;
function wholeWordAt(text: string, from: number, to: number) {
  // At most two UTF-16 units on each side; never scan/copy the entire prefix.
  const previous = Array.from(text.slice(Math.max(0, from - 2), from));
  const next = Array.from(text.slice(to, to + 2));
  return !wordCharacter.test(previous[previous.length - 1] ?? "") && !wordCharacter.test(next[0] ?? "");
}

export function documentHeadings(doc: Node): DocumentHeading[] {
  const headings: DocumentHeading[] = [];
  doc.descendants((node, position) => {
    if (node.type.name === "heading") headings.push({ position: position + 1, level: Number(node.attrs.level) || 1, text: node.textContent });
  });
  return headings;
}

/** Match literal text inside blocks. Position mapping includes inline leaf nodes. */
export function documentMatches(doc: Node, query: string, limit = 1001, options: DocumentFindOptions = {}): DocumentMatch[] {
  if (!query || query.length > DOCUMENT_QUERY_LIMIT || limit < 1) return [];
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(literal, options.caseSensitive ? "gu" : "giu");
  const matches: DocumentMatch[] = [];
  doc.descendants((node, position) => {
    if (matches.length >= limit) return false;
    if (!node.isTextblock) return;
    const text = node.textBetween(0, node.content.size, "", "\uFFFC");
    for (const match of text.matchAll(expression)) {
      if (match[0].includes("\uFFFC")) continue;
      if (options.wholeWord && !wholeWordAt(text, match.index!, match.index! + match[0].length)) continue;
      matches.push({ from: position + 1 + match.index!, to: position + 1 + match.index! + match[0].length, text: match[0] });
      if (matches.length >= limit) break;
    }
    return false;
  });
  return matches;
}
