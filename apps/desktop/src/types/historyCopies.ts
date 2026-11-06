import type {DocumentTreeNode} from "./domain";
export type HistoricalCopySource={revision:string;side:"local"|"remote";path:string};
export type HistoricalCopyReview={schemaVersion:1;projectId:string;source:HistoricalCopySource;sourceRevision:string;sourceCommit:string;blob:string;sha256:string;sizeBytes:number;defaultName:string;canCopy:boolean;beforeDeletion?:boolean;previewText:string|null;previewTruncated:boolean;checkedAt:string;message:string};
export type HistoricalCopySummary={attemptId:string;createdAt:string;name:string;sourcePath:string;sourceSide:"local"|"remote";sourceRevision:string;sha256:string;sizeBytes:number};
export type HistoricalCopyProof={schemaVersion:1;projectId:string;attemptId:string;status:"absent"|"pending"|"changed"|"unavailable"|"confirmed";canReplay:false;sourceRevision?:string;name?:string;documentId?:string;sha256?:string;sizeBytes?:number;treeAvailable?:boolean;tree?:DocumentTreeNode[]|null;checkedAt:string;message?:string};
export type HistoricalCopyTarget={kind:"source";source:HistoricalCopySource}|{kind:"receipt";summary:HistoricalCopySummary};
