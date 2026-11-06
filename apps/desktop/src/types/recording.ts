export type RecordingSettings = {
  microphone: boolean;
  systemAudio: boolean;
  microphoneDevice: string | null;
  outputDevice: string | null;
  languages: string[];
  model: string;
  retentionDays: number | null;
  startWithWindows: boolean;
  keepInTray: boolean;
};
export type RecordingDestination = {
  projectId: string;
  folderId: string | null;
  name: string;
};
export type RecordingSession = {
  portableOrigin?: {schemaVersion:1;identity:string;projectId:string;sourceSha256:string;microphoneSha256:string|null;systemSha256:string|null};
  id: string;
  revision: number;
  createdAt: string;
  status:
    | "recording"
    | "paused"
    | "pendingDestination"
    | "ready"
    | "queued"
    | "transcribing"
    | "attention"
    | "completed";
  settings: RecordingSettings;
  destination: RecordingDestination | null;
  samples: number;
  bytes: number;
  error: string | null;
  chunks: { start: number; samples: number; status: string }[];
  documentId: string | null;
  completedAt: number | null;
  keep: boolean;
  audioDeleted: boolean;
  recovered: boolean;
  cost?: {
    estimatedCostUsd: number;
    estimatedCostEur: number | null;
    exchangeRate: { date?: string; usdPerEur?: number; source?: string };
    estimate: boolean;
  } | null;
};
export type RecordingDevice = {
  id: string;
  name: string;
  kind: "microphone" | "system";
};
export type RecordingSnapshot = {
  settingsError?: string | null;
  settingsRecoveryRevision?: string | null;
  unavailableSessions?: number;
  revision: number;
  sessions: RecordingSession[];
  settings: RecordingSettings;
  levels: [number, number];
  preview: boolean;
  captureOwner: string | null;
  warning: string | null;
  devices: RecordingDevice[];
};

/** A capture fragment, not word-level alignment or an inferred identity. */
export type RecordingTranscriptSegment = {id:string;start:number;samples:number;text:string;speaker:string|null;timing:"fragment"};
export type RecordingTranscript = {schemaVersion:1;sessionId:string;revision:number;sourceRevision:string;createdAt:string;title:string;projectId:string|null;status:RecordingSession["status"];samples:number;sampleRate:24000;audioAvailable:boolean;segments:RecordingTranscriptSegment[];unconfirmedCount:number;wordTimingAvailable:false;diarizationAvailable:false;readOnly:true;startsProvider:false;checkedAt:string};
