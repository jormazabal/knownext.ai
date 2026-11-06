export type PortableHistoryEntry={id:string;label:string;bytes:number};
export type PortableHistoryCatalog={schemaVersion:1;projectId:string;revision:string;checkedAt:string;scope:"portable-history-only";limited:boolean;unavailable:number;runtimeAvailable:boolean;items:PortableHistoryEntry[]};
export type PortableHistoryTip={id:string;title:string;date:string;author:string};
export type PortableHistoryReview={schemaVersion:1;projectId:string;entryId:string;catalogRevision:string;revision:string;checkedAt:string;bundleSha256:string;tips:PortableHistoryTip[];references:number;objects:number;logicalBytes:number;nativeState:"absent"|"existing"|"occupied"|"unavailable";canAdopt:boolean;preservesFiles:true;changesSettings:false;startsAi:false};
export type PortableHistoryResult={schemaVersion:1;projectId:string;entryId:string;requestRevision:string;tip:string;status:"adopted";checkedAt:string;preservesFiles:true;changesSettings:false;startsAi:false};
