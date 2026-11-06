import {requestJson} from "./client";
import {isTauriRuntime} from "../runtime/platform";
import type {HistoryGroupIntent,HistoryGroupsSnapshot} from "../../types/historyGroups";
function native(){if(!isTauriRuntime())throw Error("Las colecciones del historial requieren la aplicación nativa. No se simula un almacén vacío.");}
export async function getHistoryGroups(documentId:string):Promise<HistoryGroupsSnapshot>{native();return requestJson(`/api/documents/${encodeURIComponent(documentId)}/history/groups`);}
export async function changeHistoryGroup(documentId:string,revision:string|null,intent:HistoryGroupIntent):Promise<HistoryGroupsSnapshot>{native();return requestJson(`/api/documents/${encodeURIComponent(documentId)}/history/groups`,{method:"POST",body:JSON.stringify({...intent,revision})});}
