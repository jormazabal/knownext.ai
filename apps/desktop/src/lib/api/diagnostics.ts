import {requestJson} from "./client";
import type {DiagnosticReport} from "../../types/diagnostics";
export function getSafeDiagnostics():Promise<DiagnosticReport>{return requestJson("/api/runtime/diagnostics");}
