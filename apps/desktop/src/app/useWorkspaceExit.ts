import {useEffect,useRef} from "react";
import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {isTauriRuntime} from "../lib/runtime/platform";
import {protectForCriticalTransition} from "./criticalStateTransition";

type Actions={freeze:()=>void;unfreeze:()=>void;hasPendingSettings:()=>boolean;protect:()=>Promise<boolean>;failed:(error:unknown)=>void};
export async function protectWorkspaceExit(actions:Actions,confirm:()=>Promise<void>,abort:()=>Promise<void>){
  try{actions.freeze();await protectForCriticalTransition({hasPendingSettings:actions.hasPendingSettings,protectDocuments:actions.protect,pause:()=>{}});await confirm();}
  catch(error){try{await abort();}catch{/* Failure to abort never grants authority to exit. */}actions.unfreeze();actions.failed(error);}
}
export function useWorkspaceExit(actions:Actions){
  const current=useRef(actions);current.current=actions;
  const busy=useRef(false);
  useEffect(()=>{
    if(!isTauriRuntime())return;
    let live=true;let unsubscribe:(()=>void)|undefined;
    void listen<string>("knownext-protect-exit",event=>{
      if(!live||busy.current||typeof event.payload!=="string"||!/^exit-[a-fA-F0-9]+-[a-fA-F0-9]+$/.test(event.payload))return;
      busy.current=true;
      void protectWorkspaceExit({freeze:()=>current.current.freeze(),unfreeze:()=>current.current.unfreeze(),hasPendingSettings:()=>current.current.hasPendingSettings(),protect:()=>current.current.protect(),failed:error=>current.current.failed(error)},()=>invoke("confirm_workspace_exit",{nonce:event.payload}),()=>invoke("abort_workspace_exit",{nonce:event.payload})).finally(()=>{busy.current=false;});
    }).then(stop=>{if(live)unsubscribe=stop;else stop();}).catch(error=>current.current.failed(error));
    return()=>{live=false;unsubscribe?.();};
  },[]);
}
