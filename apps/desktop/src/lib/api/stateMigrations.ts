import {requestJson} from "./client";
import type {UpgradeCatalog,UpgradeRecovery,UpgradeResult,UpgradeReview} from "../../types/stateMigrations";
export function reviewStateUpgrade(){return requestJson<UpgradeReview>("/api/recovery/upgrade");}
export function applyStateUpgrade(revision:string){return requestJson<UpgradeResult>("/api/recovery/upgrade",{method:"POST",body:JSON.stringify({revision})});}
export function listUpgradeRecoveries(){return requestJson<UpgradeCatalog>("/api/recovery/upgrades");}
export function reviewUpgradeRecovery(id:string){return requestJson<UpgradeRecovery>(`/api/recovery/upgrades/${encodeURIComponent(id)}`);}
export function restoreUpgradeRecovery(id:string,revision:string){return requestJson<UpgradeResult>(`/api/recovery/upgrades/${encodeURIComponent(id)}/restore`,{method:"POST",body:JSON.stringify({revision})});}
export function completeUpgradeRecovery(id:string,revision:string){return requestJson<UpgradeResult>(`/api/recovery/upgrades/${encodeURIComponent(id)}/complete`,{method:"POST",body:JSON.stringify({revision})});}
