import type {DocumentFingerprint,DocumentRecord} from "./domain";
export type HistoricalSource={versionId:string;markdownSha256:string};
export type RemoteSource={localCommit:string;remoteCommit:string;markdownSha256:string;revision:string;sourcePath:string};
export type DocumentConflictReview={documentId:string;locationRevision:string;diskMarkdown:string;diskFingerprint:DocumentFingerprint;draftRevision:string|null;checkedAt:string;historySource?:HistoricalSource&{markdown:string};remoteSource?:RemoteSource&{markdown:string};remotePathChanged?:boolean};
export type DocumentConflictApply={attemptId?:string;locationRevision:string;diskFingerprint:DocumentFingerprint;draftRevision:string|null;localMarkdown:string;mergedMarkdown:string;historySource?:HistoricalSource;remoteSource?:RemoteSource};
export type DocumentConflictResult={attemptId?:string|null;id:string;document:DocumentRecord;preservedCopies:string[];sourceUnchanged:boolean;checkedAt:string;historySource?:HistoricalSource|null;remoteSource?:RemoteSource|null};
