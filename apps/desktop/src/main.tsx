import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { initializeWindowStatePersistence } from "./lib/runtime/windowControls";
import "./styles/index.css";

void initializeWindowStatePersistence();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
