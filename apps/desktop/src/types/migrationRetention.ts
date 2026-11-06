export type MigrationRetentionReview={id:string;phase:"active"|"archived"|"deleting"|"absent";revision:string;files:number;logicalBytes:number;warnings:string[];canArchive:boolean;canReopen:boolean;canDelete:boolean;checkedAt:string};
export type MigrationRetentionAction="archive"|"reopen"|"delete";
export type MigrationRetentionResult={id:string;status:"active"|"archived"|"deleted"|"review-required";message:string;checkedAt:string};
