import {useEffect,useRef,useState} from "react";
import {getHistoryGroups,changeHistoryGroup} from "../../lib/api/historyGroups";
import {getApiErrorMessage} from "../../lib/api/client";
import type {HistoryGroupIntent,HistoryGroupsSnapshot} from "../../types/historyGroups";
export function useHistoryGroups(documentId:string,onObserved:(snapshot:HistoryGroupsSnapshot,readOnly:boolean)=>void){
  const[snapshot,setSnapshot]=useState<HistoryGroupsSnapshot|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[observeFirst,setObserveFirst]=useState(false);
  const alive=useRef(true),running=useRef(false),notify=useRef(onObserved);notify.current=onObserved;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  function verify(value:HistoryGroupsSnapshot){if(value.schemaVersion!==1||value.documentId!==documentId||!Array.isArray(value.groups))throw Error("La respuesta no confirma las colecciones de este documento; no se modifica otro ámbito.");return value;}
  async function read(){if(running.current)return;running.current=true;setBusy(true);setError("");setNotice("");
    try{const value=verify(await getHistoryGroups(documentId));if(!alive.current)return;setSnapshot(value);setObserveFirst(false);notify.current(value,true);}
    catch(cause){if(alive.current){setObserveFirst(true);setError(getApiErrorMessage(cause,"No se pudieron revisar las colecciones. No se consideran vacías."));}}
    finally{running.current=false;if(alive.current)setBusy(false);}}
  async function change(intent:HistoryGroupIntent):Promise<HistoryGroupsSnapshot|null>{if(running.current||observeFirst||!snapshot)return null;running.current=true;setBusy(true);setError("");setNotice("");
    try{const value=verify(await changeHistoryGroup(documentId,snapshot.revision,intent));if(!alive.current)return null;setSnapshot(value);setObserveFirst(false);notify.current(value,false);setNotice("Colección actualizada; versiones y documento conservados.");return value;}
    catch(cause){if(alive.current){setObserveFirst(true);setError(getApiErrorMessage(cause,"No se confirmó el cambio. Comprueba el estado; no se repite automáticamente."));}return null;}
    finally{running.current=false;if(alive.current)setBusy(false);}}
  return{snapshot,busy,error,notice,observeFirst,read,change};
}
