import type {RuntimeServicesStatus} from "./services";
import type {DiagnosticReport} from "../../types/diagnostics";
const version=(value:string|null|undefined)=>value&&value.length<=64&&/^[a-zA-Z0-9.+-]+$/.test(value)?value:"unknown";
const known=(value:string|null|undefined,allowed:string[])=>value&&allowed.includes(value)?value:"unknown";

/** Basic service copy deliberately omits filesystem paths, endpoints and free-form errors. */
export function buildServiceDiagnostic(service:RuntimeServicesStatus["services"][number]) {
  return [
    `app=KnowNext.ai`,
    `status=${known(service.status,["running","degraded","stopped","error","unavailable"])}`,
    `expectedProfile=${known(service.expectedProfile,["desktop","mobile","web-dev","test","native-qa"])}`,
    `profile=${known(service.profile,["desktop","mobile","web-dev","test","native-qa"])}`,
    `version=${version(service.version)}`,
    `expectedVersion=${version(service.expectedVersion)}`,
    `privateContent=excluded`,
  ].join("\n");
}

/** Copy only this known technical schema, even if a future response adds fields. */
export function safeDiagnosticJson(report:DiagnosticReport) {
  const operations=["startup","document","project","ai","settings","runtime","application"];
  if(report.schemaVersion!==1||report.app!=="KnowNext.ai"||report.includesPrivateContent!==false||report.events.length>1000)throw new Error("El formato de diagnóstico no es compatible. No se ha copiado.");
  if(!Number.isFinite(Date.parse(report.generatedAt)))throw new Error("Fecha de diagnóstico no compatible");
  const events=report.events.map(event=>{
    if(!/^diagnostic-[a-fA-F0-9]{1,32}-[a-fA-F0-9]{1,32}$/.test(event.id)||!operations.includes(event.operation)||!["error","info"].includes(event.level)||!["operation-failed","operation-recorded"].includes(event.code)||!Number.isFinite(Date.parse(event.at)))throw new Error("El diagnóstico contiene un evento no compatible. No se ha copiado.");
    return {id:event.id,at:new Date(event.at).toISOString(),level:event.level,operation:event.operation,code:event.code};
  });
  return JSON.stringify({schemaVersion:1,generatedAt:new Date(report.generatedAt).toISOString(),app:"KnowNext.ai",version:version(report.version),platform:known(report.platform,["windows","android","linux","macos","ios"]),recordingEnabled:report.recordingEnabled===true,maximumEvents:1000,maximumBytes:512*1024,events,warnings:report.warnings.filter(warning=>["legacy-logs-excluded","configuration-unavailable"].includes(warning)),includesPrivateContent:false},null,2);
}
