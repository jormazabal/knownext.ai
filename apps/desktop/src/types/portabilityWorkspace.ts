// Shared contracts for reviewed local portability and frozen exports.
export type HistoryPoints = {
    schemaVersion: 1;
    projectId: string;
    revision: string;
    head: string | null;
    selectedTip: string | null;
    selectionExpired: boolean;
    points: Array<{
        id: string;
        title: string;
        date: string;
        author: string;
    }>;
    offset: number;
    hasMore: boolean;
    sources: Array<{
        id: string;
        phase: string;
        references: number;
    }>;
    preservesFiles: true;
    checkedAt: string;
};
export type WorkspaceReview = {
    schemaVersion: 1;
    projectId: string;
    revision: string;
    families: string[];
    items: Array<{
        id: string;
        currentBytes: number;
        resultBytes: number;
        changed: boolean;
    }>;
    checkedAt: string;
    preservesFiles: true;
    startsAi: false;
    personalDataIsArchivedOnly: true;
};
export type ExportProfile = {
    id: string;
    name: string;
    cover: boolean;
    contents: boolean;
    style: unknown;
};
export type ExportProfiles = {
    schemaVersion: 1;
    revision: string | null;
    profiles: ExportProfile[];
    checkedAt: string;
};
export type ExportBatch = {
    schemaVersion: 1;
    id: string;
    projectId: string;
    revision: string;
    phase: "prepared" | "picking" | "saved" | "cancelled" | "uncertain" | "discarded";
    format: string;
    profileName: string | null;
    documents: Array<{
        source: string;
        filename: string;
        bytes: number;
        sha256: string;
    }>;
    archiveSha256: string;
    archiveBytes: number;
    checkedAt: string;
    includesConfirmedDrafts: true;
    frozen: true;
};
