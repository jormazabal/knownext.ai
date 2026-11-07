export const runtimeOperationClasses=["documents","projects","history","search","ai","transfer","recovery","settings","security","runtime","other"] as const;
export type RuntimeOperationClass=typeof runtimeOperationClasses[number];
export type RuntimePerformanceClass={operationClass:RuntimeOperationClass;count:number;errorCount:number;totalDurationUs:number;maxDurationUs:number;p95RecentDurationUs:number;recentSamples:number};
export type RuntimePerformance={schemaVersion:1;available:true;scope:"local-api-requests";clock:"monotonic-wall-clock";persistent:false;readOnly:true;startsProvider:false;includesStartup:false;sampleLimitPerClass:128;maximumClasses:11;observedRequests:number;errorCount:number;classes:RuntimePerformanceClass[]};
