export type UpgradeEntry={id:string;filename:string;status:"missing"|"compatible"|"legacy"|"blocked";sourceVersion:number|null;targetVersion:number;fingerprint:string|null;message:string|null};
export type UpgradeReview={schemaVersion:1;id:string;target:string;checkedAt:string;revision:string;entries:UpgradeEntry[];canApply:boolean;scope:"critical-state-only"};
export type UpgradeResult={id:string;status:"completed"|"restored"|"unchanged"|"preparation-failed"|"review-required";message:string;canReview:boolean;checkedAt:string};
export type UpgradeRecovery={schemaVersion:1;id:string;checkedAt:string;revision:string;entries:{id:string;filename:string;status:"original"|"applied"|"changed"|"missing"|"unavailable";fingerprint:string|null;backupVerified:boolean;backupCompatible?:boolean;targetVerified?:boolean}[];canRestore:boolean;canComplete?:boolean;completionReason?:string|null;journalStatus:string};
export type UpgradeCatalog={entries:{id:string;createdAt:string|null;status:string;canReview:boolean;retentionStatus?:string;canManage?:boolean}[];limited:boolean;checkedAt:string};
export type StateTransitionOutcome={confirmed:boolean;message:string;result?:UpgradeResult};
export type StateTransitionAuthority={onBeforeChange?:()=>Promise<void>;onSettled?:(outcome:StateTransitionOutcome)=>void};
