export type ProjectLocationReview={projectId:string;projectName:string;currentPath:string;originalAvailable:boolean;candidatePath:string;registryRevision:string;folderStamp:string;targetHasHistory:boolean;checkedAt:string;scope:"association-only"};
export type ProjectLocationReceipt=Pick<ProjectLocationReview,"registryRevision"|"folderStamp"|"candidatePath">;
