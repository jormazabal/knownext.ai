import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { RecordingPanel } from "./features/recordings/RecordingPanel";
import { initializeWindowStatePersistence } from "./lib/runtime/windowControls";
import "./styles/index.css";

const recordingWindow = new URLSearchParams(location.search).has("recording");
if (!recordingWindow) void initializeWindowStatePersistence();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {recordingWindow ? <RecordingPanel /> : <App />}
  </React.StrictMode>,
);
