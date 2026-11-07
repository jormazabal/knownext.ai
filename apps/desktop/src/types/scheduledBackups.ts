import type {ProjectTransferJob} from "./projectTransfer";
export type ScheduledBackupPolicy={enabled:boolean;intervalHours:24;keep:number;includeArchive:boolean;retentionAllowed:boolean};
export type ScheduledBackupPolicyDraft={enabled:boolean;keep:number;includeArchive:boolean;ackRetention:boolean;ackBinding?:boolean};
export type ScheduledBackupPhase="preparing"|"interrupted"|"verified"|"partial"|"failed"|"retired"|"missing"|"outside-history";
/** A cursor identity is consumed before effects; reading it never replays a backup. */
export type ScheduledBackupReceipt={schemaVersion:1;projectId:string;generation:number;policyGeneration:number;sourceRootHash:string;profileHash:string;phase:ScheduledBackupPhase;createdAt:string;finishedAt:string|null;archiveSha256:string|null;archiveBytes:number;includeArchive:boolean;retentionEligible:boolean;warnings:string[];restoreTransferId:string|null;restoreStatus:"none"|"starting"|"ready"|"uncertain";canReplay:false;checkedAt:string};
export type ScheduledBackupSnapshot={schemaVersion:1;projectId:string;revision:string;sourceRootHash:string;profileHash:string;bindingMatches:boolean;sourceAvailable?:boolean;readOnly:boolean;startsProvider:false;policy:ScheduledBackupPolicy;policyGeneration:number;latestGeneration:number;nextGeneration:number;nextDueAt:string|null;snapshots:ScheduledBackupReceipt[];unknownEntries:number;storageBytes:number;maxBytes:10737418240;checkedAt:string};
export type ScheduledBackupRunResult=ScheduledBackupSnapshot&{readOnly:false;receipt:ScheduledBackupReceipt};
export type ScheduledBackupReceiptOwner={profileHash:string;sourceRootHash:string};
export type ScheduledBackupRestoreResult={schemaVersion:1;projectId:string;generation:number;transferId:string;transfer:ProjectTransferJob;receipt:ScheduledBackupReceipt;readOnly:false;startsProvider:false};
export type ScheduledBackupRestoreOptions={ackPartial?:boolean;ackBinding?:boolean};
