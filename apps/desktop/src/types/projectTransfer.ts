import type {ProjectTemplateCatalogue,ProjectTemplateCatalogueAttempt} from "./projectTemplates";
export type ProjectTransferMode = { kind: "import" } | { kind: "export"; projectId: string; projectName: string; nodeIds?: string[]; includeArchive?: boolean } | {kind:"template-import"|"template-export";templateId:string;revision:string;projectName:string};
export type ProjectTransferPhase = "awaiting_source" | "preparing" | "ready" | "delivering" | "committing" | "pending_registration" | "completed" | "cancelled" | "failed";
export type ProjectPackageManifest = {
  supplement?: ProjectArchiveSummary;
  templateDescription?:string;
  format: "knownext.project"; schemaVersion: 1 | 2 | 3; projectName: string; createdAt: string;
  directories: string[];
  files: { path: string; size: number; sha256: string; kind: "markdown" | "handwritten" | "image" | "attachment" | "asset" | "archive" }[];
  exclusions: { path: string; reason: string }[];
  adjustments: { path: string; targetsUpdated: number }[];
  referenceWarnings: { path: string; message: string }[];
};
/** Opaque receipt: native paths, file bytes and picker URIs never cross this boundary. */
export type ProjectTransferJob = {
  templateCatalogue?:boolean;
  catalogue?:ProjectTemplateCatalogue|null;
  catalogueOutcome?:ProjectTemplateCatalogueAttempt|null;
  includeArchive?: boolean;
  templateId?:string|null;
  selectedPaths?:string[];
  id: string; kind: "export" | "import"; phase: ProjectTransferPhase; createdAt: string;
  projectId: string | null; manifest: ProjectPackageManifest | null; archiveSha256: string | null;
  archiveBytes: number; sourceName: string | null; targetProjectId: string | null;
  requestedName: string | null; deliveredName: string | null; error: string | null;
  cancelRequested: boolean; interrupted: boolean;
};
export type ProjectTransferInventory = { jobs: ProjectTransferJob[]; warnings: string[] };

export type ProjectArchiveSummary = { retainedFiles?:number; directory: "Archivo KnowNext"; dataOnly: true; drafts: number; recordingSessions: number; history: boolean; preferences: true };
