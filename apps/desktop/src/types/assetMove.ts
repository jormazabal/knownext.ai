export type AssetMoveReview={name:string;path:string;incoming:number;outgoing:number;complete:boolean;warnings:string[];operation?:"move"|"rename"|"delete";nextName?:string};
