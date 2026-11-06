import {useEffect,useRef} from "react";
import {listen} from "@tauri-apps/api/event";
import {AI_BUDGET_NOTICE_EVENT,budgetNotice} from "../lib/api/aiBudget";
import {isTauriRuntime} from "../lib/runtime/platform";
import type {AiBudgetStatus} from "../types/aiBudget";
export function useAiBudgetNotice(show:(message:string)=>void){
  const current=useRef(show);current.current=show;
  useEffect(()=>{
    const handler=(event:Event)=>{const message=(event as CustomEvent<unknown>).detail;if(typeof message==="string"&&message)current.current(message);};
    window.addEventListener(AI_BUDGET_NOTICE_EVENT,handler);
    let active=true,stop:(()=>void)|undefined;
    if(isTauriRuntime())void listen<AiBudgetStatus>("ai-budget-warning",event=>{if(active&&event.payload?.schemaVersion===1&&Array.isArray(event.payload.checks)){const message=budgetNotice(event.payload);if(message)current.current(message);}}).then(unlisten=>{if(active)stop=unlisten;else unlisten();}).catch(()=>{});
    return()=>{active=false;window.removeEventListener(AI_BUDGET_NOTICE_EVENT,handler);stop?.();};
  },[]);
}
