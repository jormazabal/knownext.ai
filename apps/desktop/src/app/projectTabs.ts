import type {ProjectTabsConfig,DocumentTreeNode} from "../types/domain";
import {restoreProjectSelection} from "./projectSessionSelection";

export function resolveProjectTabs(tabsByProject: Record<string, ProjectTabsConfig>, projectId: string, tree: DocumentTreeNode[],treeAvailable=true) {
  const configuredTabs = normalizeProjectTabs(tabsByProject[projectId] ?? {openTabs:[],activeDocumentId:""});
  if(!treeAvailable){
    const scoped=normalizeProjectTabs({...configuredTabs,openTabs:configuredTabs.openTabs.filter(tab=>tab.id.startsWith(`${projectId}::`)),openHandwrittenTabs:configuredTabs.openHandwrittenTabs?.filter(tab=>tab.id.startsWith(`${projectId}::`))});
    return {...scoped,...restoreProjectSelection(scoped)};
  }
  const knownDocumentIds = new Set(collectDocuments(tree).map((node) => node.id));
  const knownHandwrittenNoteIds = new Set(collectHandwrittenNotes(tree).map((node) => node.id));

  const openTabs = configuredTabs.openTabs.filter((tab) => knownDocumentIds.has(tab.id));
  const openHandwrittenTabs = (configuredTabs.openHandwrittenTabs ?? []).filter((tab) => knownHandwrittenNoteIds.has(tab.id));
  const restored = normalizeProjectTabs({
    openTabs,
    activeDocumentId: knownDocumentIds.has(configuredTabs.activeDocumentId) ? configuredTabs.activeDocumentId : openTabs[0]?.id ?? "",
    openHandwrittenTabs,
    activeHandwrittenNoteId: knownHandwrittenNoteIds.has(configuredTabs.activeHandwrittenNoteId ?? "") ? configuredTabs.activeHandwrittenNoteId : openHandwrittenTabs[0]?.id ?? "",
    activeWorkspaceTabId: [...openTabs, ...openHandwrittenTabs].some((tab) => tab.id === configuredTabs.activeWorkspaceTabId)
      ? configuredTabs.activeWorkspaceTabId ?? ""
      : openHandwrittenTabs[0]?.id ?? openTabs[0]?.id ?? "",
  });
  return { ...restored, ...restoreProjectSelection(restored) };
}

export function normalizeProjectTabs(projectTabs: ProjectTabsConfig): ProjectTabsConfig {
  const seen = new Set<string>();
  const openTabs = projectTabs.openTabs.filter((tab) => {
    if (!tab.id || !tab.name || seen.has(tab.id)) return false;
    seen.add(tab.id);
    return true;
  });

  const normalizedOpenTabs = openTabs.map((tab) => ({ id: tab.id, name: tab.name, kind: "document" as const }));
  const activeDocumentId = normalizedOpenTabs.some((tab) => tab.id === projectTabs.activeDocumentId)
    ? projectTabs.activeDocumentId
    : normalizedOpenTabs[0]?.id ?? "";
  const seenHandwritten = new Set<string>();
  const openHandwrittenTabs = (projectTabs.openHandwrittenTabs ?? []).filter((tab) => {
    if (!tab.id || !tab.name || seenHandwritten.has(tab.id)) return false;
    seenHandwritten.add(tab.id);
    return true;
  }).map((tab) => ({ id: tab.id, name: tab.name, kind: "handwritten-note" as const }));
  const activeHandwrittenNoteId = openHandwrittenTabs.some((tab) => tab.id === projectTabs.activeHandwrittenNoteId)
    ? projectTabs.activeHandwrittenNoteId ?? ""
    : openHandwrittenTabs[0]?.id ?? "";
  const activeWorkspaceTabId = [...normalizedOpenTabs, ...openHandwrittenTabs].some((tab) => tab.id === projectTabs.activeWorkspaceTabId)
    ? projectTabs.activeWorkspaceTabId ?? ""
    : activeHandwrittenNoteId || activeDocumentId;

  return {
    openTabs: normalizedOpenTabs,
    activeDocumentId,
    openHandwrittenTabs,
    activeHandwrittenNoteId,
    activeWorkspaceTabId,
  };
}

function collectDocuments(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.flatMap((node) => {
    if (node.type === "document") return [node];
    return node.children ? collectDocuments(node.children) : [];
  });
}

function collectHandwrittenNotes(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.flatMap((node) => {
    if (node.type === "handwritten-note") return [node];
    return node.children ? collectHandwrittenNotes(node.children) : [];
  });
}
