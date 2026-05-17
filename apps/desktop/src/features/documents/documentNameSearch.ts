import type { DocumentNameSearchResult, DocumentTreeNode } from "../../types/domain";

type IndexedTreeNode = {
  node: DocumentTreeNode;
  path: string[];
  parentIds: string[];
};

type RankedResult = DocumentNameSearchResult & {
  score: number;
};

const maxResults = 10;

export function searchDocumentTreeByName(nodes: DocumentTreeNode[], query: string, limit = maxResults): DocumentNameSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  if (queryTokens.length === 0) return [];

  return flattenSearchableNodes(nodes)
    .map((candidate) => rankCandidate(candidate, normalizedQuery, queryTokens))
    .filter((result): result is RankedResult => Boolean(result))
    .sort((first, second) => first.score - second.score || first.path.length - second.path.length || first.name.localeCompare(second.name, "es"))
    .slice(0, limit)
    .map(({ score: _score, ...result }) => result);
}

export function getInlineNameCompletion(query: string, result: DocumentNameSearchResult | undefined): string {
  const rawQuery = query.trimStart();
  if (!rawQuery || !result) return "";

  const title = result.name;
  const normalizedQuery = normalizeCompactText(rawQuery);
  const normalizedTitle = normalizeCompactText(title);
  if (normalizedTitle.startsWith(normalizedQuery)) {
    return title.slice(rawQuery.length);
  }

  const wordMatch = findWordPrefixMatch(title, normalizedQuery);
  if (!wordMatch) return "";
  return title.slice(wordMatch.start + rawQuery.length, wordMatch.end);
}

function flattenSearchableNodes(nodes: DocumentTreeNode[], path: string[] = [], parentIds: string[] = []): IndexedTreeNode[] {
  return nodes.flatMap((node) => {
    const nextPath = [...path, node.name];
    const isSearchable = node.type === "folder" || node.type === "document" || node.type === "image" || node.type === "attachment";
    const current = isSearchable ? [{ node, path: nextPath, parentIds }] : [];
    const children = node.children ? flattenSearchableNodes(node.children, nextPath, [...parentIds, node.id]) : [];
    return [...current, ...children];
  });
}

function rankCandidate(candidate: IndexedTreeNode, normalizedQuery: string, queryTokens: string[]): RankedResult | null {
  const normalizedName = normalizeSearchText(candidate.node.name);
  const compactName = normalizeCompactText(candidate.node.name);
  const compactQuery = normalizeCompactText(normalizedQuery);
  const ranges = getMatchRanges(candidate.node.name, queryTokens);

  if (normalizedName === normalizedQuery) return toResult(candidate, 0, ranges);
  if (compactName.startsWith(compactQuery)) return toResult(candidate, 1, ranges);
  if (nameHasWordPrefix(candidate.node.name, compactQuery)) return toResult(candidate, 2, ranges);
  if (compactName.includes(compactQuery)) return toResult(candidate, 3, ranges);
  if (queryTokens.every((token) => compactName.includes(normalizeCompactText(token)))) return toResult(candidate, 4, ranges);

  return null;
}

function toResult(candidate: IndexedTreeNode, score: number, matchRanges: Array<{ start: number; end: number }>): RankedResult {
  return {
    id: candidate.node.id,
      name: candidate.node.name,
      type: candidate.node.type as "folder" | "document" | "image" | "attachment",
    path: candidate.path,
    parentIds: candidate.parentIds,
    matchRanges,
    score,
  };
}

function getMatchRanges(name: string, queryTokens: string[]): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const normalizedName = normalizeSearchText(name);

  for (const token of queryTokens) {
    const normalizedToken = normalizeSearchText(token);
    if (!normalizedToken) continue;
    const index = normalizedName.indexOf(normalizedToken);
    if (index < 0) continue;
    ranges.push({ start: index, end: index + normalizedToken.length });
  }

  return mergeRanges(ranges);
}

function mergeRanges(ranges: Array<{ start: number; end: number }>) {
  return ranges
    .sort((first, second) => first.start - second.start)
    .reduce<Array<{ start: number; end: number }>>((merged, range) => {
      const last = merged[merged.length - 1];
      if (!last || range.start > last.end) return [...merged, range];
      last.end = Math.max(last.end, range.end);
      return merged;
    }, []);
}

function nameHasWordPrefix(name: string, compactQuery: string) {
  return Boolean(findWordPrefixMatch(name, compactQuery));
}

function findWordPrefixMatch(name: string, compactQuery: string): { start: number; end: number } | null {
  const wordPattern = /[^\s._/\\-]+/g;
  let match: RegExpExecArray | null;
  while ((match = wordPattern.exec(name)) !== null) {
    const word = match[0];
    if (normalizeCompactText(word).startsWith(compactQuery)) {
      return { start: match.index, end: match.index + word.length };
    }
  }
  return null;
}

function normalizeSearchText(value: string) {
  return removeDiacritics(value)
    .toLowerCase()
    .replace(/[\s._/\\-]+/g, " ")
    .trim();
}

function normalizeCompactText(value: string) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function removeDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
