import type { Project } from "./domain";

export type RetiredProject = {
  id: string;
  name: string;
  folderPath: string;
  retiredAt: string;
  revision: string;
  registered: boolean;
  originalFolderVerified: boolean;
};
export type RetiredProjects = {
  schemaVersion: 1;
  entries: RetiredProject[];
  checkedAt: string;
  scope: "this-device";
  maximumEntries: number;
};
export type RestoredProject = { project: Project; alreadyRegistered: boolean; syncPaused: boolean; checkedAt: string };
