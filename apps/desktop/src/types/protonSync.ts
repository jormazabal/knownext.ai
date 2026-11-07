export type ProtonBinding = {folderPath:string; logicalProjectId:string; deviceId:string; generation:number};
export type ProtonStatus = {projectId:string; binding:ProtonBinding|null; generation:number; state:string; detail:string; lastPublication?:string|null;lastReceipt?:ProtonReceipt|null;receiveReview?:ProtonReceiveReview|null;activeReceive?:{publicationId?:string;status?:string}|null;activePublication?:{publicationId?:string;status?:string}|null};
export type ProtonReview = {id:string;revision:string;projectId:string;folderPath:string;logicalProjectId:string;canConnect:boolean;blockers:string[];warnings:string[];summary:{documents?:number;resources?:number;bytes?:number}};
export type ProtonManifest = {schemaVersion:number;projectId:string;publicationId:string;senderId:string;parentPublication:string|null;files:Record<string,{sha256:string;bytes:number}>};
export type ProtonInbox = {projectId:string;items:ProtonManifest[]};
export type ProtonReceiveReview = {id:string;revision:string;canApply:boolean;additions:string[];updates?:string[];pendingDeletions?:string[];keepLocal?:string[];identical:string[];conflicts:string[];warnings:string[]};
export type ProtonReceipt = {projectId:string;status:string;updatedAt:string;remoteConfirmed:false;publicationId?:string;files?:number;bytes?:number;added?:string[];updated?:string[];documentsPreserved?:boolean};
