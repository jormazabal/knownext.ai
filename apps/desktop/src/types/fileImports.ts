export type FileImportReceipt = {
  id: string;
  projectId: string;
  requestedName: string;
  storedName: string;
  path: string;
  renamed: boolean;
  committed: true;
  bytes: number;
  sha256: string;
  treeAvailable: boolean;
  checkedAt: string;
};
