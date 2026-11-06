export type CredentialRecovery={id:string;createdAt:string;revision:string;restorable:boolean;bytes:number};
export type CredentialReview={schemaVersion:1;checkedAt:string;revision:string;state:"ready"|"absent"|"unreadable";protection:string;openaiConfigured:boolean;githubConfigured:boolean;recoveries:CredentialRecovery[];recoveryAvailable:boolean;remoteRevocation:false};
export type CredentialAction="replace-openai"|"remove-openai"|"disconnect-github"|"reset-store"|"restore-store"|"remove-recovery";
export type PrivacyCategory="conversation"|"context"|"index"|"results"|"research";
export type PrivacySelection={categories:PrivacyCategory[];before:string|null};
export type PrivacyPolicy={schemaVersion:1;projectId:string;revision:string;sendAllowed:boolean;automaticExpiry:false;checkedAt:string};
export type PrivacyReview={schemaVersion:1;projectId:string;reviewId:string;revision:string;selection:PrivacySelection;categories:Array<{id:PrivacyCategory;itemsToRemove:number;itemsKept:number;bytesToRemove:number}>;plannedFiles:number;policyRevision:string;checkedAt:string;excluded:string[];forensicErasure:false};
export type PrivacyReceipt={schemaVersion:1;id:string;projectId:string;revision:string;phase:"applying"|"completed"|"interrupted";plannedFiles:number;completedFiles:number;checkedAt:string};
