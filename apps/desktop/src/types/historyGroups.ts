export type HistoryGroup={id:string;title:string;description:string;retired:boolean;referenceCount:number;documentVersionIds:string[];createdAt:string;updatedAt:string};
export type HistoryGroupsSnapshot={schemaVersion:1;documentId:string;projectId:string;revision:string|null;groups:HistoryGroup[];groupLimit:number;referenceLimit:number;checkedAt:string};
export type HistoryGroupIntent=
  |{action:"create";groupId:string;title:string;description:string;versionId:string}
  |{action:"rename";groupId:string;title:string;description:string}
  |{action:"add"|"remove";groupId:string;versionId:string}
  |{action:"retire"|"reopen";groupId:string};
export type HistoryGroupFilter={id:string;title:string;versionIds:string[]};
