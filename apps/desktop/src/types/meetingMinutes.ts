import type {RecordingTranscript} from "./recording";
export type MeetingDecision={text:string;sourceIds:string[]};
export type MeetingAction=MeetingDecision&{owner:string|null;dueDate:string|null};
export type MeetingMinutesDraft={title:string;name:string;summary:string;decisions:MeetingDecision[];actions:MeetingAction[]};
export type MeetingMinutesReview={schemaVersion:1;projectId:string;sessionId:string;revision:string;draft:MeetingMinutesDraft;source:RecordingTranscript;markdown:string;preservesSource:true;startsAi:false;checkedAt:string};
export type MeetingMinutesReceipt={schemaVersion:1;id:string;projectId:string;sessionId:string;revision:string;documentId:string;phase:"prepared"|"completed"|"uncertain";confirmed:boolean;preservesSource:true;canReplay:false;checkedAt:string};
export type MeetingMinutesCatalog={schemaVersion:1;projectId:string;items:MeetingMinutesReceipt[];unavailable:number;limited:boolean;canReplay:false;checkedAt:string};
