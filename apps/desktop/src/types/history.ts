import type {VersionRecord} from "./domain";
export type HistoryMilestone={id:string;commit:string;sourcePath:string;title:string;createdAt:string;updatedAt:string};
export type MilestoneState={status:"ready"|"missing"|"unavailable";revision:string|null;error:string|null};
export type HistoryCapability={status:"ready"|"disabled"|"not-initialized"|"unavailable";recordingEnabled:boolean;reason:string|null;canConfigure:boolean};
export type DocumentHistorySnapshot={versions:VersionRecord[];milestones:MilestoneState;history?:HistoryCapability;checkedAt:string};
export type MilestoneResponse={milestone:HistoryMilestone|null;revision:string|null;checkedAt:string};
