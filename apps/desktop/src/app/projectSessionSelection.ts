import type { ProjectTabsConfig } from "../types/domain";

/** Last document IDs are history; activeWorkspaceTabId owns the restored surface. */
export function restoreProjectSelection(tabs: ProjectTabsConfig) {
  const selected = tabs.activeWorkspaceTabId;
  const document = tabs.openTabs.find(tab => tab.id === selected);
  const note = tabs.openHandwrittenTabs?.find(tab => tab.id === selected);
  return { activeDocumentId: document?.id ?? "", activeHandwrittenNoteId: note?.id ?? "" };
}
