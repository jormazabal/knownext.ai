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
  revision: number;
  sessions: RecordingSession[];
  settings: RecordingSettings;
  levels: [number, number];
  preview: boolean;
  captureOwner: string | null;
  warning: string | null;
  devices: RecordingDevice[];
};
