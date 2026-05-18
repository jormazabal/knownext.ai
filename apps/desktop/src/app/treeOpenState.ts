import type { DocumentTreeNode } from "../types/domain";

export type TreeOpenPathsByProject = Record<string, string[]>;

export function normalizeTreePath(path: string | null | undefined): string {
  return String(path ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function collectOpenFolderPaths(nodes: DocumentTreeNode[]): string[] {
  const paths: string[] = [];

  function visit(node: DocumentTreeNode) {
    if (node.type === "folder" && node.open) {
      const path = normalizeTreePath(node.path);
      if (path) paths.push(path);
    }
    node.children?.forEach(visit);
  }

  nodes.forEach(visit);
  return Array.from(new Set(paths)).sort((first, second) => first.localeCompare(second));
}

export function applyTreeOpenState(
  nodes: DocumentTreeNode[],
  options: {
    currentTree?: DocumentTreeNode[];
    openPaths?: string[];
    additionalOpenPaths?: string[];
  } = {},
): DocumentTreeNode[] {
  const currentOpenByPath = new Map<string, boolean>();
  collectFolderOpenState(options.currentTree ?? [], currentOpenByPath);
  const persistedOpenPaths = new Set((options.openPaths ?? []).map(normalizeTreePath).filter(Boolean));
  const additionalOpenPaths = new Set((options.additionalOpenPaths ?? []).map(normalizeTreePath).filter(Boolean));

  function visit(node: DocumentTreeNode): DocumentTreeNode {
    const children = node.children?.map(visit);
    if (node.type !== "folder") {
      return children ? { ...node, children } : node;
    }

    const path = normalizeTreePath(node.path);
    const hasCurrentState = path ? currentOpenByPath.has(path) : false;
    const open = path
      ? additionalOpenPaths.has(path) || (hasCurrentState ? currentOpenByPath.get(path) === true : persistedOpenPaths.has(path))
      : false;

    return {
      ...node,
      open,
      children,
    };
  }

  return nodes.map(visit);
}

export function updateTreeOpenPathsForProject(
  currentState: TreeOpenPathsByProject,
  projectId: string,
  nodes: DocumentTreeNode[],
): TreeOpenPathsByProject {
  const nextPaths = collectOpenFolderPaths(nodes);
  if (arePathListsEqual(currentState[projectId] ?? [], nextPaths)) return currentState;

  return {
    ...currentState,
    [projectId]: nextPaths,
  };
}

function collectFolderOpenState(nodes: DocumentTreeNode[], target: Map<string, boolean>) {
  for (const node of nodes) {
    if (node.type === "folder") {
      const path = normalizeTreePath(node.path);
      if (path) target.set(path, Boolean(node.open));
    }
    if (node.children) collectFolderOpenState(node.children, target);
  }
}

function arePathListsEqual(first: string[], second: string[]) {
  if (first.length !== second.length) return false;
  return first.every((path, index) => path === second[index]);
}
