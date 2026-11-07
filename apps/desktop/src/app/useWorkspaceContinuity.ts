import {useEffect,useRef,useState} from "react";
import {WorkspaceContinuity,type ContinuityState} from "./workspaceContinuity";
export function useWorkspaceContinuity(enabled:boolean,checkpoint:(finalizeInput:boolean)=>Promise<boolean>,reconcile:()=>Promise<void>,activityRevision?:()=>number){
  const callbacks=useRef({checkpoint,reconcile,activityRevision});callbacks.current={checkpoint,reconcile,activityRevision};
  const[state,setState]=useState<ContinuityState>({phase:"idle",issue:null,running:false,lastProtectedAt:null,checkpointMs:null});
  const current=useRef<WorkspaceContinuity|null>(null);
  useEffect(()=>{
    if(!enabled)return;
    const controller=new WorkspaceContinuity({checkpoint:finalize=>callbacks.current.checkpoint(finalize),reconcile:()=>callbacks.current.reconcile(),observe:setState});current.current=controller;
    let lastRevision=callbacks.current.activityRevision?.()??0;
    const interval=window.setInterval(()=>{const revision=callbacks.current.activityRevision?.()??0;if(revision!==lastRevision){lastRevision=revision;controller.periodic();}},5000);
    const hidden=()=>controller.hidden(),resumed=()=>controller.resumed();
    const visibility=()=>document.visibilityState==="hidden"?hidden():resumed();
    const native=(event:Event)=>{const visible=(event as CustomEvent<{visible?:unknown}>).detail?.visible;if(visible===true)resumed();else if(visible===false)hidden();};
    document.addEventListener("visibilitychange",visibility);window.addEventListener("pagehide",hidden);window.addEventListener("pageshow",resumed);window.addEventListener("blur",hidden);window.addEventListener("focus",resumed);window.addEventListener("knownext:activity-visibility",native);
    return()=>{window.clearInterval(interval);controller.dispose();if(current.current===controller)current.current=null;document.removeEventListener("visibilitychange",visibility);window.removeEventListener("pagehide",hidden);window.removeEventListener("pageshow",resumed);window.removeEventListener("blur",hidden);window.removeEventListener("focus",resumed);window.removeEventListener("knownext:activity-visibility",native);};
  },[enabled]);
  return{state,retry:()=>current.current?.retry()};
}
