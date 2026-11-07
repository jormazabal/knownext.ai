import type { DocumentTreeNode } from "./domain";

export type FavoriteRecord = {
  id: string;
  path: string;
  kind: Exclude<DocumentTreeNode["type"], "folder">;
  createdAt: string;
  updatedAt: string;
};
export type FavoriteEntry = FavoriteRecord & { nodeId: string; name: string; available: boolean };
export type ProjectFavorites = {
  projectId: string;
  revision: string | null;
  entries: FavoriteEntry[];
  maximumEntries: number;
  checkedAt: string;
  scope: "this-device";
};
export type FavoriteChange = { favorite: FavoriteRecord | null; revision: string | null; checkedAt: string };
